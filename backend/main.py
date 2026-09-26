from fastapi import FastAPI, HTTPException, Request, Body, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from core.progress_tracker import progress_tracker
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List, Union, Tuple, Any
import os
import re
import yaml
import asyncio
import httpx
from core.scraper import get_news_content
from core.generator import generate_full_package
from core.tts_engine import create_audio_and_srt, azure_tts_worker
from core.visual_engine import download_visual_content, generate_scene_candidates
from core.video_editor import assemble_final_video
from core.config_utils import load_config, get_asset_dir, get_export_dir

from fastapi.staticfiles import StaticFiles

app = FastAPI()


@app.get("/cloudflare/usage")
async def get_cloudflare_usage():
    try:
        config = load_config()
        cf_config = config.get("image_gen", {})
        account_id = cf_config.get("cloudflare_account_id")
        api_token = cf_config.get("cloudflare_api_token")

        if not account_id or not api_token:
            return {"error": "Cloudflare credentials not configured"}

        from datetime import datetime, timedelta
        # 오늘 날짜 (UTC 기준)
        today = datetime.utcnow().strftime('%Y-%m-%d')

        # Cloudflare GraphQL API endpoint
        url = "https://api.cloudflare.com/client/v4/graphql"

        headers = {
            "Authorization": f"Bearer {api_token}",
            "Content-Type": "application/json"
        }

        # Workers AI Usage query
        query = """
        query getWorkersAiUsage($accountTag: String!, $dateGeq: String!, $dateLeq: String!) {
          viewer {
            accounts(filter: {accountTag: $accountTag}) {
              workersAiUsageAdaptiveGroups(
                limit: 10,
                filter: {
                  date_geq: $dateGeq,
                  date_leq: $dateLeq
                }
              ) {
                sum {
                  neurons
                }
                dimensions {
                  date
                }
              }
            }
          }
        }
        """

        variables = {
          "accountTag": account_id,
          "dateGeq": today,
          "dateLeq": today
        }

        async with httpx.AsyncClient() as client:
            response = await client.post(
                url,
                json={"query": query, "variables": variables},
                headers=headers,
                timeout=10.0
            )

            if response.status_code != 200:
                return {
                    "error": f"Cloudflare API error: {response.status_code}",
                    "detail": response.text
                }

            data = response.json()

            # 응답 구조 파싱
            if "errors" in data and data["errors"]:
                for error in data["errors"]:
                    if "not authorized" in error.get("message", "").lower():
                        return {
                            "neurons": 0,
                            "limit": 10000,
                            "date": today,
                            "status": "unauthorized",
                            "error": "Cloudflare API 토큰에 'Account Analytics: Read' 권한이 없습니다. 대시보드(My Profile > API Tokens)에서 해당 권한을 추가해주세요."
                        }
                    if "unknown field" in error.get("message", "").lower():
                         return {
                            "neurons": 0,
                            "limit": 10000,
                            "date": today,
                            "status": "error",
                            "error": "Cloudflare Analytics 스키마가 변경되었거나 접근할 수 없습니다."
                        }
                return {"error": "Cloudflare API error", "detail": data["errors"]}

            try:
                accounts = data.get("data", {}).get("viewer", {}).get("accounts", [])
                if not accounts:
                    return {"error": "계정을 찾을 수 없거나 권한이 없습니다.", "neurons": 0, "limit": 10000}

                usage_groups = accounts[0].get("workersAiUsageAdaptiveGroups", [])
                total_neurons = 0
                if usage_groups:
                    total_neurons = sum(group.get("sum", {}).get("neurons", 0) for group in usage_groups)

                return {
                    "neurons": total_neurons,
                    "limit": 10000,  # 무료 티어 일일 한도
                    "date": today,
                    "status": "success"
                }
            except Exception as parse_e:
                return {"error": f"Failed to parse Cloudflare response: {str(parse_e)}", "raw": data}

    except Exception as e:
        return {"error": str(e)}


@app.get("/")
async def root():
    return {"status": "ok", "message": "AutoVideoSystem API is running"}

# Asset directory serving
asset_dir = get_asset_dir()
export_dir = get_export_dir()

# data/assets와 data/exports가 실제 위치한 곳을 서빙
# get_asset_dir()은 C:\youtube\AutoVideoSystem\data\assets를 반환함
# previews 폴더가 assets 내부에 있으므로 /assets/previews/... 로 접근 가능해야 함
# 만약 assets_dir 자체가 data/assets라면, 그 하위 previews는 자동으로 서빙됨
app.mount("/assets", StaticFiles(directory=asset_dir), name="assets")
app.mount("/exports", StaticFiles(directory=export_dir), name="exports")

# CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class NewsRequest(BaseModel):
    url: str


class GenerateRequest(BaseModel):
    article_text: str
    custom_instructions: Optional[str] = None
    duration: Optional[int] = 60
    template_id: Optional[str] = "news_duo"
    script_id: Optional[str] = None  # SCRIPT 레이어: 카테고리별 대본 포맷


class TTSRequest(BaseModel):
    script: List[dict]
    voice_map: dict
    output_name: str = "final_audio"
    engine: Optional[str] = None
    rate: Optional[str] = "+0%"
    pitch: Optional[str] = "+0Hz"
    gap_duration: Optional[float] = 0.5


class VisualCandidateRequest(BaseModel):
    scene: dict
    index: int
    project_id: Optional[str] = "default"
    ai_count: Optional[int] = 1
    search_count: Optional[int] = 5
    style: Optional[str] = ""
    ai_model: Optional[str] = "pollinations"
    topic: Optional[str] = ""  # 추가: 검색 품질 향상을 위한 주제어
    visual_guide: Optional[str] = ""  # 추가: 검색 품질 향상을 위한 비주얼 가이드
    category: Optional[str] = ""  # 대본 카테고리 (news/recipe/review/knowledge, templates.py와 공유)
    use_cache: Optional[bool] = True  # 캐시 사용 (기본 true)
    refresh: Optional[bool] = False  # true면 캐시 무시하고 새로 수집 ("다시 생성"용)


class SubtitleStyle(BaseModel):
    # 하단 자막 초기값은 상단 자막(CAPTION_PRESETS '기본')과 맞춘다.
    preset: str = "default"
    font: str = "Noto Sans KR"
    font_size: int = 20
    color: str = "#FFD76A"
    stroke_color: str = "transparent"
    stroke_width: float = 0
    bg_color: Optional[str] = "rgba(0,0,0,0.45)"
    position: str = "bottom"
    text_align: str = "center"
    animation: str = "none"  # none/fade/slide
    y_offset: int = 85  # % position from top
    x_offset: Optional[int] = 50 # % position from left
    show_subtitles: bool = True  # 자막 표시 여부 추가


class AudioEditRequest(BaseModel):
    bgm_path: Optional[str] = None
    bgm_volume: float = 0.2
    sfx_list: List[dict] = []  # list of {path: str, time: float, volume: float}


class CaptionStyle(BaseModel):
    font_size: int = 13
    color: str = "#FFD76A"
    bg_color: Optional[str] = "rgba(0,0,0,0.45)"
    y_offset: int = 7  # % position from top


class RenderRequest(BaseModel):
    audio_path: str
    srt_path: str
    bg_images: Any  # [이미지리스트] 또는 [이미지리스트, 길이] 둘 다 지원 (내부에서 처리)
    output_name: str = "final_video"
    subtitle_style: Optional[SubtitleStyle] = None
    audio_edit: Optional[AudioEditRequest] = None
    edited_srt: Optional[str] = None
    aspect_ratio: str = "16:9 (Youtube)"  # 화면 비율 추가
    scene_captions: Optional[List[dict]] = None  # [{start, end, text}] 씬별 상단 자막 밴드
    caption_style: Optional[CaptionStyle] = None
    transition: Optional[dict] = None  # {type: 'none'|'crossfade', duration: 초}
    video_filter: Optional[str] = "none"  # none/bw/vivid/bright/cinematic
    scene_filters: Optional[dict] = None  # {sceneIdx: filterName}
    stickers: Optional[List[dict]] = None  # [{text, start, end, y_pct, size, color, animation}]
    media_fit: Optional[str] = "fit"  # fit(원본 유지) / fill(너비 채우기) / crop(꽉 채우기)
    scene_fits: Optional[dict] = None  # {sceneIdx: 'fit'|'fill'|'crop'} 장면별 맞춤 오버라이드
    bg_style: Optional[str] = "blur"  # blur / black / color
    bg_color: Optional[str] = None  # bg_style=color 일 때 단색
    fit_zoom: Optional[float] = 1.0  # 전역 확대 배율 (1.0~2.0)


class TTSPreviewRequest(BaseModel):
    text: str
    voice: str
    engine: Optional[str] = None
    rate: Optional[str] = "+0%"
    pitch: Optional[str] = "+0Hz"


@app.get("/tts/typecast-actors")
async def tts_typecast_actors():
    """설정된 Typecast 키로 사용 가능한 actor 목록 조회 (프론트 목소리 선택용)."""
    try:
        from core.tts_engine import list_typecast_actors
        config = load_config()
        return {"actors": await list_typecast_actors(config)}
    except Exception as e:
        print(f"[Typecast Actors Error] {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/tts/preview")
async def tts_preview(request: TTSPreviewRequest):
    try:
        from core.tts_engine import create_ssml
        try:
            import azure.cognitiveservices.speech as speechsdk
        except ImportError:
            speechsdk = None
        import edge_tts
        import hashlib
        import traceback

        # 텍스트, 목소리, 엔진, 속도, 피치 조합으로 고유 키 생성 (캐싱용)
        # 중요: rate/pitch가 None인 경우 기본값으로 채워서 해시 충돌 방지
        current_rate = request.rate or "+0%"
        current_pitch = request.pitch or "+0Hz"

        preview_key = hashlib.md5(f"{request.text}_{request.voice}_{request.engine}_{current_rate}_{current_pitch}".encode()).hexdigest()
        filename = f"preview_{preview_key}.mp3"

        # 베이스 프리뷰 키 (속도/피치 제외)
        base_preview_key = hashlib.md5(f"{request.text}_{request.voice}_{request.engine}_+0%_+0Hz".encode()).hexdigest()
        base_filename = f"preview_{base_preview_key}.mp3"

        print(f"DEBUG: [TTS PREVIEW] Text: {request.text[:20]}..., Voice: {request.voice}, Engine: {request.engine}, Rate: {current_rate}, Pitch: {current_pitch}")
        print(f"DEBUG: [TTS PREVIEW] Filename: {filename}")

        config = load_config()
        asset_base = get_asset_dir()
        preview_dir = os.path.join(asset_base, "previews")
        os.makedirs(preview_dir, exist_ok=True)

        filepath = os.path.join(preview_dir, filename)
        base_filepath = os.path.join(preview_dir, base_filename)

        # 1. 완전 일치 파일이 존재하면 즉시 반환 (0 토큰)
        if os.path.exists(filepath) and os.path.getsize(filepath) > 0:
            print(f"DEBUG: Using exact cached preview file: {filename}")
            return {
                "audio_url": f"/assets/previews/{filename}",
                "status": "success"
            }

        # 2. 베이스 파일이 존재하면 로컬 처리 시도 (0 토큰)
        # 단, Edge TTS는 무료이므로 베이스를 거치지 않고 직접 생성하여 최고의 품질을 유지합니다.
        from core.tts_engine import adjust_audio_locally
        engine = request.engine or ""
        is_edge = engine == 'edge' or (not engine and not config.get('use_azure_tts') and not config.get('use_openai_tts'))

        if not is_edge and os.path.exists(base_filepath) and os.path.getsize(base_filepath) > 0:
            print(f"DEBUG: Base preview exists. Adjusting locally (0 Tokens): {base_filename}")
            success = adjust_audio_locally(base_filepath, filepath, request.rate, request.pitch)
            if success:
                return {
                    "audio_url": f"/assets/previews/{filename}",
                    "status": "success"
                }

        # 3. 베이스 파일도 없거나 Edge TTS인 경우 직접 생성
        print(f"DEBUG: No base preview found or Edge engine. Generating version for {request.voice}")
        success = False
        config = load_config()

        # 3.1 Edge TTS (무료 - 직접 생성하여 속도/텐션 최상 품질 유지)
        if is_edge:
            try:
                from core.tts_engine import edge_tts_worker
                success = await edge_tts_worker(request.text, request.voice, filepath, rate=current_rate, pitch=current_pitch)

                if success and os.path.exists(filepath) and os.path.getsize(filepath) > 0:
                    print(f"DEBUG: Edge TTS Success via edge_tts_worker! File size: {os.path.getsize(filepath)}")
                    return {
                        "audio_url": f"/assets/previews/{filename}",
                        "status": "success"
                    }
                else:
                    print("DEBUG: Edge TTS via worker failed to create file or file is empty")
            except Exception as e:
                print(f"DEBUG: Edge TTS Preview Exception: {e}")
                import traceback
                traceback.print_exc()

        # 3.2 OpenAI Base Generation
        if not success and (engine == 'openai' or (not engine and config.get('use_openai_tts'))):
            if config.get('openai_api_key'):
                from openai import OpenAI
                client = OpenAI(api_key=config.get('openai_api_key'))
                def run_openai():
                    response = client.audio.speech.create(model="tts-1", voice=request.voice, input=request.text)
                    response.stream_to_file(base_filepath)
                    return True
                success = await asyncio.get_event_loop().run_in_executor(None, run_openai)

        # 3.3 Qwen Base Generation
        if not success and (engine == 'qwen' or (not engine and (config.get('use_qwen_tts') or request.voice.startswith('q_')))):
            if config.get('dashscope_api_key'):
                from core.tts_engine import qwen_tts_worker
                success = await qwen_tts_worker(request.text, request.voice, base_filepath, config)

        # 3.4 Azure Base Generation
        if not success and (engine == 'azure' or (not engine and (config.get('use_azure_tts') or config.get('use_cloudflare_tts_proxy')))):
            success = await azure_tts_worker(request.text, request.voice, base_filepath, config, rate="+0%", pitch="+0Hz")

        # 3.4b MiniMax / ElevenLabs / Typecast Base Generation
        if not success and engine == 'minimax':
            from core.tts_engine import minimax_tts_worker
            success = await minimax_tts_worker(request.text, request.voice, base_filepath, config)
        if not success and engine == 'elevenlabs':
            from core.tts_engine import elevenlabs_tts_worker
            success = await elevenlabs_tts_worker(request.text, request.voice, base_filepath, config)
        if not success and engine == 'typecast':
            from core.tts_engine import typecast_tts_worker
            success = await typecast_tts_worker(request.text, request.voice, base_filepath, config)

        # 3.5 폴백: Edge TTS로 베이스 생성 (성별 인식 폴백 포함)
        if not success:
            try:
                from core.tts_engine import edge_tts_worker
                # 폴백 시에도 현재 요청된 속도/피치 적용
                success = await edge_tts_worker(request.text, request.voice, base_filepath, rate=current_rate, pitch=current_pitch)
                if success:
                    # 폴백으로 생성된 파일이 베이스가 됨 (이미 속도/피치 반영됨)
                    import shutil
                    shutil.copy(base_filepath, filepath)
            except Exception as e:
                print(f"Fallback Edge TTS failed: {str(e)}")

        # 4. 베이스가 방금 생성되었다면, 요청한 속도/피치로 로컬 조절 수행
        if success and os.path.exists(base_filepath):
            print(f"DEBUG: Base generated. Now adjusting to Rate: {current_rate}, Pitch: {current_pitch}")
            # Edge TTS는 이미 직접 생성되었으므로 (step 3.1) 건너뜀
            if not is_edge:
                adjust_success = adjust_audio_locally(base_filepath, filepath, current_rate, current_pitch)
                if not adjust_success:
                    # 조절 실패 시 베이스를 그대로 사용 (최소한 소리는 나게 함)
                    import shutil
                    shutil.copy(base_filepath, filepath)

            if os.path.exists(filepath) and os.path.getsize(filepath) > 0:
                return {
                    "audio_url": f"/assets/previews/{filename}",
                    "status": "success"
                }

        return {
            "audio_url": f"/assets/previews/{filename}",
            "status": "success"
        }
    except Exception as e:
        print(f"ERROR in tts_preview: {str(e)}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/events")
async def events(request: Request):
    async def event_generator():
        queue = progress_tracker.subscribe()
        try:
            while True:
                # Check if client closed connection
                if await request.is_disconnected():
                    break

                try:
                    # Non-blocking wait for new progress updates
                    event = await asyncio.wait_for(queue.get(), timeout=1.0)
                    yield event
                except asyncio.TimeoutError:
                    # Keep-alive ping
                    yield ": ping\n\n"
        finally:
            progress_tracker.unsubscribe(queue)

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@app.get("/config")
async def get_config():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    config_path = os.path.join(base_dir, 'config', 'settings.yaml')
    try:
        with open(config_path, 'r', encoding='utf-8') as f:
            return yaml.safe_load(f) or {}
    except FileNotFoundError:
        return {}


@app.post("/config")
async def save_config(config_data: dict = Body(...)):
    base_dir = os.path.dirname(os.path.abspath(__file__))
    config_path = os.path.join(base_dir, 'config', 'settings.yaml')
    try:
        # 기존 파일과 deep-merge (예전 프론트 상태로 저장해도 새 키가 날아가지 않게)
        def _merge(base, incoming):
            for k, v in (incoming or {}).items():
                if isinstance(v, dict) and isinstance(base.get(k), dict):
                    _merge(base[k], v)
                else:
                    base[k] = v
            return base

        existing = {}
        try:
            with open(config_path, 'r', encoding='utf-8') as f:
                existing = yaml.safe_load(f) or {}
        except FileNotFoundError:
            pass
        merged = _merge(existing, config_data)
        with open(config_path, 'w', encoding='utf-8') as f:
            yaml.dump(merged, f, allow_unicode=True)
        return {"status": "success", "message": "Configuration saved successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# --- Project Management ---
import json

def get_project_dir():
    base_dir = get_asset_dir()
    project_dir = os.path.join(os.path.dirname(base_dir), "projects")
    os.makedirs(project_dir, exist_ok=True)
    return project_dir

@app.post("/projects")
async def save_project(request: Request):
    try:
        project_data = await request.json()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid JSON body: {str(e)}")
        
    project_id = project_data.get("projectId")
    if not project_id:
        # Fallback to meta.id
        meta = project_data.get("meta", {})
        if isinstance(meta, dict):
            project_id = meta.get("id")
            
    if not project_id:
        import time
        project_id = f"project-{int(time.time()*1000)}"
        project_data["projectId"] = project_id
    
    # Add lastModified if missing or update it
    from datetime import datetime
    project_data["lastModified"] = datetime.now().isoformat()
    
    project_dir = get_project_dir()
    filepath = os.path.join(project_dir, f"{project_id}.json")
    
    try:
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(project_data, f, ensure_ascii=False, indent=2)
        return {"status": "success", "message": f"Project {project_id} saved successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/projects")
async def list_projects():
    project_dir = get_project_dir()
    projects = []
    try:
        for filename in os.listdir(project_dir):
            if filename.endswith(".json"):
                filepath = os.path.join(project_dir, filename)
                with open(filepath, 'r', encoding='utf-8') as f:
                    try:
                        data = json.load(f)
                        project_id = data.get("projectId") or filename.replace(".json", "")
                        projects.append({
                             "id": project_id,
                             "projectName": data.get("projectName") or data.get("meta", {}).get("projectName") or "Unnamed Project",
                             "lastModified": data.get("lastModified") or data.get("meta", {}).get("lastModified") or "",
                             "currentStep": data.get("currentStep") or data.get("meta", {}).get("currentStep", 1)
                         })
                    except Exception as e:
                        print(f"Error loading project {filename}: {str(e)}")
                        continue
        # 정렬: 최신 수정 순
        projects.sort(key=lambda x: x.get("lastModified") or "", reverse=True)
        return projects
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/projects/{project_id}")
async def get_project(project_id: str):
    project_dir = get_project_dir()
    filepath = os.path.join(project_dir, f"{project_id}.json")
    
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Project not found")
    
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/projects/{project_id}")
async def delete_project(project_id: str):
    print(f"\n[Delete Request] Project ID: {project_id}")
    project_dir = get_project_dir()
    filepath = os.path.join(project_dir, f"{project_id}.json")
    print(f"  > Looking for file: {filepath}")
    
    if not os.path.exists(filepath):
        print(f"  > Project not found: {filepath}")
        raise HTTPException(status_code=404, detail="Project not found")
    
    try:
        os.remove(filepath)
        print(f"  > Project deleted successfully: {project_id}")
        return {"status": "success", "message": f"Project {project_id} deleted successfully"}
    except Exception as e:
        print(f"  > Delete failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# --- Task Cancellation Management ---
cancel_requested = False


class CancelRequest(BaseModel):
    task_id: str = "all"


@app.post("/cancel")
async def cancel_task(request: CancelRequest):
    global cancel_requested
    print(f"\n[Cancel Request] Task ID: {request.task_id}")
    cancel_requested = True
    return {"status": "success", "message": "Cancellation requested"}


@app.get("/templates")
async def get_templates():
    from core.templates import list_templates
    return list_templates()


class ShortsUrlRequest(BaseModel):
    url: str


class ShortsCreateRequest(BaseModel):
    reference: str  # 분석 리포트 JSON 문자열 또는 요약 텍스트
    new_topic: str
    duration: Optional[int] = 40
    category: Optional[str] = "recipe_short"
    format_id: Optional[str] = None  # 모듈형 포맷 (short_30/short_60/long_5, recipe 전용)
    style_id: Optional[str] = None  # 모듈형 스타일 (realistic/jasuisaeng/asmr/cinematic)
    platform_id: Optional[str] = None  # 메타데이터 규칙 (youtube/instagram/tiktok)
    script_id: Optional[str] = None  # SCRIPT 레이어: 카테고리별 대본 포맷
    hook_id: Optional[str] = None  # 훅 오프닝 변형 (question/provoke/empathy/number/twist/random)
    preset_id: Optional[str] = None  # 이름 붙은 프리셋 (훅+톤+구조+CTA 세트, random 포함)
    tone_id: Optional[str] = None  # 내레이션 톤 오버라이드
    structure_id: Optional[str] = None  # 대본 구조 오버라이드
    cta_id: Optional[str] = None  # 마무리 CTA 오버라이드


class RefineClipInfo(BaseModel):
    url: str = ""
    kind: str = "image"  # video | image
    source: str = ""  # stock | upload | ai | search
    note: str = ""


class RefineSceneRequest(BaseModel):
    scene: dict = {}  # {section, speaker, text, subtitle, duration}
    clips: List[RefineClipInfo] = []
    topic: Optional[str] = ""
    category: Optional[str] = "recipe_short"


@app.post("/shorts/refine-scene")
async def shorts_refine_scene(request: RefineSceneRequest):
    """선택된 클립을 참고해 해당 씬 대본만 다듬는다. 잠금 필드는 손대지 않는다."""
    from core.shorts_lab import refine_scene
    try:
        return refine_scene(
            request.scene,
            [c.model_dump() for c in request.clips],
            request.topic or "",
            request.category or "recipe_short",
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        print(f"[Shorts Refine Error] {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/shorts/analyze-media")
async def shorts_analyze_media(file: UploadFile = File(...), hint: str = Form("")):
    from core.shorts_lab import analyze_upload
    try:
        data = await file.read()
        result = analyze_upload(data, file.content_type or "", hint or "")
        # 업로드 원본 보관
        try:
            updir = os.path.join(get_asset_dir(), "uploads")
            os.makedirs(updir, exist_ok=True)
            safe_name = re.sub(r"[^\w.\-]", "_", file.filename or "upload.bin")[-80:]
            with open(os.path.join(updir, safe_name), "wb") as f:
                f.write(data)
        except Exception as e:
            print(f"Upload backup failed: {e}")
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        print(f"[Shorts Media Error] {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/shorts/analyze-url")
async def shorts_analyze_url(request: ShortsUrlRequest):
    from core.shorts_lab import analyze_youtube
    try:
        return analyze_youtube(request.url)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        print(f"[Shorts URL Error] {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/shorts/create")
async def shorts_create(request: ShortsCreateRequest):
    from core.shorts_lab import create_from_pattern
    try:
        return create_from_pattern(request.reference, request.new_topic, request.duration, request.category or "recipe_short",
                                   format_id=request.format_id, style_id=request.style_id, platform_id=request.platform_id,
                                   script_id=request.script_id, hook_id=request.hook_id,
                                   preset_id=request.preset_id, tone_id=request.tone_id,
                                   structure_id=request.structure_id, cta_id=request.cta_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        print(f"[Shorts Create Error] {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/shorts/script-formats")
async def shorts_script_formats(category: str = "cooking"):
    """카테고리별 대본 포맷 목록 (추천 포함) — 제작 설정 대본 포맷 드롭다운용."""
    from core.script_formats import list_script_formats, recommended_id, GROUP_NAMES
    try:
        return {
            "category": category,
            "category_name": GROUP_NAMES.get(category, category),
            "recommended": recommended_id(category),
            "formats": list_script_formats(category if category in GROUP_NAMES else None),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
@app.get("/shorts/recipe-options")
async def shorts_recipe_options():
    """모듈형 레시피 프롬프트 선택지 (포맷/스타일/플랫폼) — 프롬프트 설정 화면용."""
    from core.recipe_prompts import list_recipe_options
    try:
        return list_recipe_options()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/shorts/recipe-prompt-preview")
async def shorts_recipe_prompt_preview(format_id: str = "auto", style_id: str = "realistic",
                                       platform_id: str = "youtube", hook_id: str = "random",
                                       duration_sec: int = 60, preset_id: str = "random",
                                       tone_id: Optional[str] = None,
                                       cta_id: Optional[str] = None,
                                       structure_id: Optional[str] = None):
    """조합된 모듈형 프롬프트 미리보기 (읽기 전용 확인용). format_id=auto면 길이로 자동결정."""
    from core.recipe_prompts import (compose_recipe_prompt, get_format, get_style,
                                     get_platform, resolve_format_for_duration)
    try:
        fid = (format_id or '').strip() or 'auto'
        if fid == 'auto':
            fid = resolve_format_for_duration(duration_sec)
        fmt, style, plat = get_format(fid), get_style(style_id), get_platform(platform_id)
        return {
            "format": {"id": fmt["id"], "name": fmt["name"]},
            "style": {"id": style["id"], "name": style["name"]},
            "platform": {"id": plat["id"], "name": plat["name"]},
            "prompt": compose_recipe_prompt(fmt["id"], style["id"], plat["id"],
                                            hook_id=hook_id, target_sec=duration_sec,
                                            preset_id=preset_id, tone_id=tone_id,
                                            cta_id=cta_id, structure_id=structure_id),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/shorts/prompt-template")
async def shorts_prompt_template(category: str = "recipe_short"):
    """카테고리 고정 프롬프트(지침+섹션) 조회 — 프롬프트 확인/수정 모달용."""
    from core.templates import get_template
    try:
        t = get_template(category)
        return {
            "id": t["id"],
            "name": t["name"],
            "instructions": t["instructions"],
            "sections": [{"name": n, "desc": d} for n, d in t.get("sections", [])],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/uploads")
async def upload_asset(file: UploadFile = File(...)):
    """사용자 직접 촬영 파일(이미지/동영상) 업로드 → 씬별 교체용."""
    try:
        allowed_exts = (".jpg", ".jpeg", ".png", ".webp", ".mp4", ".webm", ".mov")
        name = file.filename or "upload.bin"
        if not name.lower().endswith(allowed_exts):
            raise HTTPException(status_code=400, detail=f"지원하지 않는 형식입니다: {allowed_exts}")
        data = await file.read()
        if not data:
            raise HTTPException(status_code=400, detail="빈 파일입니다.")
        if len(data) > 200 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="200MB를 초과합니다.")
        updir = os.path.join(get_asset_dir(), "uploads")
        os.makedirs(updir, exist_ok=True)
        import time as _t
        safe = re.sub(r"[^\w.\-]", "_", name)[-60:]
        fname = f"user_{int(_t.time())}_{safe}"
        path = os.path.join(updir, fname)
        with open(path, "wb") as f:
            f.write(data)
        rel = os.path.relpath(path, get_asset_dir())
        return {"url": f"/assets/{rel.replace(os.sep, '/')}", "path": path}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/visuals/stock-videos")
async def get_stock_videos(keyword: str, count: int = 4, refresh: bool = False):
    from core.visual_engine import search_pexels_videos
    try:
        videos = search_pexels_videos(keyword, min(max(count, 1), 8), refresh=refresh)
        return {"videos": videos}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        print(f"[Stock Videos Error] {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/scrape")
async def scrape(request: NewsRequest):
    global cancel_requested
    cancel_requested = False
    print(f"\n[Scrape Request] URL: {request.url}")
    try:
        await progress_tracker.update("scrape", "in_progress", 10, "뉴스 기사 본문을 추출하고 있습니다...")

        # 취소 확인을 위한 래퍼 함수 또는 직접 체크
        def cancel_check():
            return cancel_requested

        if cancel_requested:
            raise asyncio.CancelledError("User requested cancellation")

        content = await get_news_content(request.url, cancel_check=cancel_check)

        if cancel_requested:
            raise asyncio.CancelledError("User requested cancellation")

        if content:
            _title = content.split('\n')[0].replace('# ', '')
            print(f"[Scrape Success] Title: {_title}")
            await progress_tracker.update("scrape", "completed", 100, "뉴스 본문 추출이 완료되었습니다.")
            return {"full_text": content, "title": _title}
        else:
            print(f"[Scrape Failed] No content extracted from {request.url}")
            await progress_tracker.update("scrape", "failed", 0, "뉴스 본문 추출에 실패했습니다.")
            raise HTTPException(status_code=404, detail="Could not scrape news content")
    except Exception as e:
        print(f"[Scrape Error] {str(e)}")
        await progress_tracker.update("scrape", "failed", 0, f"오류 발생: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/generate")
async def generate(request: GenerateRequest):
    global cancel_requested
    cancel_requested = False # Reset flag for new task
    print(f"\n[Generate Request] Content Length: {len(request.article_text)}, Duration: {request.duration}s, Template: {request.template_id}")
    try:
        async def progress_callback(progress, message):
            if cancel_requested:
                raise asyncio.CancelledError("User requested cancellation")
            print(f"  > [Generate Progress] {progress}%: {message}")
            await progress_tracker.update("generate", "in_progress", progress, message)

        await progress_tracker.update("generate", "in_progress", 20, "AI가 대본과 장면 가이드를 생성하고 있습니다...")
        content = await generate_full_package(
            request.article_text, 
            custom_instructions=request.custom_instructions, 
            duration=request.duration,
            progress_callback=progress_callback,
            template_id=request.template_id,
            script_id=request.script_id
        )
        # generator.py는 전 모델 실패 시 {"error": "..."} dict를 반환한다 (예외를 던지지 않음).
        # 그대로 200으로 돌려주면 프론트가 빈 화면이 되므로 여기서 상태코드로 변환한다.
        if not content or content.get("error"):
            err_msg = (content or {}).get("error", "Unknown generation error") if isinstance(content, dict) else str(content)
            print(f"[Generate Failed] {err_msg[:500]}")
            await progress_tracker.update("generate", "failed", 0, f"오류 발생: {err_msg[:200]}")
            if "API_KEY_INVALID" in err_msg or "API key not valid" in err_msg:
                raise HTTPException(status_code=401, detail="Gemini API 키가 유효하지 않습니다. 설정 화면에서 API 키를 확인해주세요.")
            raise HTTPException(status_code=500, detail=f"대본 생성에 실패했습니다: {err_msg[:500]}")
        storyboard = content.get('storyboard', content.get('script', []))
        print(f"[Generate Success] Storyboard size: {len(storyboard)} scenes, duration: {content.get('total_duration', '?')}s / target {content.get('target_duration', request.duration)}s")
        if content.get('warning'):
            await progress_tracker.update("generate", "completed", 100, content['warning'])
        else:
            await progress_tracker.update("generate", "completed", 100, "대본 및 장면 가이드 생성이 완료되었습니다.")
        return content
    except asyncio.CancelledError:
        print("[Generate Cancelled] User requested stop.")
        await progress_tracker.update("generate", "failed", 0, "사용자가 작업을 취소했습니다.")
        raise HTTPException(status_code=499, detail="Task cancelled by user")
    except HTTPException:
        # 위에서 의도적으로 던진 401/500은 그대로 전달 (generic except가 500으로 덮지 않도록)
        raise
    except Exception as e:
        print(f"[Generate Error] {str(e)}")
        await progress_tracker.update("generate", "failed", 0, f"오류 발생: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/tts")
async def generate_tts(request: TTSRequest):
    global cancel_requested
    cancel_requested = False
    try:
        async def progress_callback(progress, message):
            if cancel_requested:
                raise asyncio.CancelledError("User requested cancellation")
            await progress_tracker.update("tts", "in_progress", progress, message)

        await progress_tracker.update("tts", "in_progress", 40, "AI 음성 파일을 생성하고 있습니다...")
        from core.tts_engine import create_audio_and_srt

        # voice_map에 settings가 포함되어 올 수 있음
        voice_data = request.voice_map

        audio_path, srt_path = await create_audio_and_srt(
            request.script,
            voice_data,
            request.output_name,
            engine=request.engine,
            rate=request.rate,
            pitch=request.pitch,
            progress_callback=progress_callback,
            gap_duration=request.gap_duration
        )

        # URL paths로 변환
        asset_base = get_asset_dir()
        rel_audio = os.path.relpath(audio_path, asset_base)
        rel_srt = os.path.relpath(srt_path, asset_base)

        await progress_tracker.update("tts", "completed", 100, "음성 파일 및 자막 생성이 완료되었습니다.")
        return {
            "audio_url": f"/assets/{rel_audio.replace(os.sep, '/')}",
            "srt_url": f"/assets/{rel_srt.replace(os.sep, '/')}",
            "audio_path": audio_path,
            "srt_path": srt_path
        }
    except asyncio.CancelledError:
        print("[TTS Cancelled] User requested stop.")
        await progress_tracker.update("tts", "failed", 0, "사용자가 작업을 취소했습니다.")
        raise HTTPException(status_code=499, detail="Task cancelled by user")
    except Exception as e:
        await progress_tracker.update("tts", "failed", 0, f"오류 발생: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/visuals/candidates")
async def get_visual_candidates(request: VisualCandidateRequest):
    global cancel_requested
    cancel_requested = False
    print(f"\n[Visual Candidates Request] Project: {request.project_id}, Index: {request.index}, Style: {request.style}")
    try:
        def cancel_check():
            return cancel_requested

        if cancel_requested:
            raise asyncio.CancelledError("User requested cancellation")

        candidates_dict = await generate_scene_candidates(
            request.scene,
            request.index,
            project_id=request.project_id,
            ai_count=request.ai_count,
            search_count=request.search_count,
            style=request.style,
            ai_model=request.ai_model,
            topic=request.topic,  # 추가
            visual_guide=request.visual_guide,  # 추가
            category=request.category,  # 카테고리별 비주얼 프리셋
            use_cache=request.use_cache if request.use_cache is not None else True,
            refresh=request.refresh or False,
            cancel_check=cancel_check
        )

        print(f"[Visual Candidates Success] Found {len(candidates_dict.get('ai', []))} AI, {len(candidates_dict.get('search', []))} Search, {len(candidates_dict.get('graph', []))} Graph candidates (category={request.category})")

        # Convert absolute paths to URL paths for the frontend
        asset_base = get_asset_dir()
        formatted_candidates = {'ai': [], 'search': [], 'graph': []}

        for category in ['ai', 'search', 'graph']:
            for path in candidates_dict.get(category, []):
                if path and os.path.exists(path):
                    rel_path = os.path.relpath(path, asset_base)
                    formatted_candidates[category].append({
                        "url": f"/assets/{rel_path.replace(os.sep, '/')}",
                        "path": path
                    })

        return {"candidates": formatted_candidates}
    except Exception as e:
        print(f"[Visual Candidates Error] {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/render")
async def render_video(request: RenderRequest):
    global cancel_requested
    cancel_requested = False
    try:
        # [수정] 대본 데이터와 자막 데이터의 동기화 보장 로직 추가
        # 프론트엔드에서 보낸 edited_srt가 있다면 그것을 우선 사용
        # 만약 srtData가 바뀌었는데 edited_srt가 비어있다면 문제가 됨
        # 하지만 RenderRequest 구조상 edited_srt는 항상 최신 상태여야 함
        
        # [추가] 대사 불일치 문제 해결을 위한 로직
        # content (script) 데이터가 srtData와 개수가 맞는지 확인하고 보정
        # assemble_final_video 내부에서는 edited_srt를 기반으로 자막을 생성하므로
        # edited_srt가 content.script의 내용을 정확히 반영하고 있는지 확인하는 것이 핵심
        
        # 비동기적으로 렌더링 실행
        async def run_render():
            try:
                # assemble_final_video는 동기 함수이므로 run_in_executor 사용
                loop = asyncio.get_event_loop()
                
                def progress_cb(progress, message):
                    # asyncio loop 외부에서 호출될 수 있으므로 thread-safe하게 처리
                    loop.call_soon_threadsafe(
                        lambda: asyncio.create_task(progress_tracker.update("render", "in_progress", progress, message))
                    )

                def cancel_check():
                    return cancel_requested

                output_path = os.path.join(get_export_dir(), f"{request.output_name}.mp4")
                
                success = await loop.run_in_executor(
                    None,
                    lambda: assemble_final_video(
                        request.audio_path,
                        request.srt_path,
                        request.bg_images,
                        output_path,
                        subtitle_style=request.subtitle_style.model_dump() if request.subtitle_style else None,
                        audio_edit=request.audio_edit.model_dump() if request.audio_edit else None,
                        edited_srt=request.edited_srt,
                        aspect_ratio=request.aspect_ratio,
                        scene_captions=request.scene_captions,
                        caption_style=request.caption_style.model_dump() if request.caption_style else None,
                        transition=request.transition,
                        video_filter=request.video_filter or "none",
                        scene_filters=request.scene_filters,
                        stickers=request.stickers,
                        media_fit=request.media_fit or "fit",
                        scene_fits=request.scene_fits,
                        bg_style=request.bg_style or "blur",
                        bg_color=request.bg_color,
                        fit_zoom=request.fit_zoom or 1.0,
                        progress_callback=progress_cb,
                        cancel_check=cancel_check
                    )
                )
                
                if success:
                    await progress_tracker.update("render", "completed", 100, "영상 생성이 완료되었습니다!")
                else:
                    await progress_tracker.update("render", "failed", 0, "영상 생성 중 오류가 발생했습니다.")
                    
            except Exception as e:
                print(f"Render Task Error: {str(e)}")
                import traceback
                traceback.print_exc()
                await progress_tracker.update("render", "failed", 0, f"렌더링 오류: {str(e)}")

        # 백그라운드 태스크로 실행
        asyncio.create_task(run_render())
        
        return {"status": "success", "message": "Rendering started"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

def _ensure_port_free(port, host="127.0.0.1"):
    """포트가 사용 중이면 점유 프로세스를 종료하고 재시도한다.

    안전을 위해 python.exe / you-backend.exe 이미지만 종료한다.
    그 외 프로세스가 점유 중이면 False 반환 (호출자가 에러로 종료).
    """
    import socket as _socket
    import subprocess as _sp
    import time as _time

    def _is_open():
        try:
            with _socket.create_connection((host, port), timeout=1.0):
                return True
        except OSError:
            return False

    for _ in range(6):
        if not _is_open():
            return True
        # 점유 PID 탐색 (LISTEN 상태)
        pids = set()
        try:
            out = _sp.check_output(["netstat", "-ano"], text=True, stderr=_sp.DEVNULL)
            for line in out.splitlines():
                parts = line.split()
                if len(parts) >= 5 and parts[0].upper() == "TCP" and parts[3].upper() == "LISTENING":
                    addr = parts[1]
                    if addr.endswith(f":{port}"):
                        try:
                            pids.add(int(parts[4]))
                        except ValueError:
                            pass
        except Exception as e:
            print(f"[Port] 점유 프로세스 조회 실패: {e}")
            return False
        if not pids:
            _time.sleep(1.0)
            continue
        killed_any = False
        for pid in pids:
            if pid <= 4:
                continue
            try:
                tl = _sp.check_output(
                    ["tasklist", "/FI", f"PID eq {pid}", "/FO", "CSV", "/NH"],
                    text=True, stderr=_sp.DEVNULL,
                ).strip().strip('"').lower()
                image = tl.split('","')[0].strip('"') if '","' in tl else tl.split(',')[0]
            except Exception:
                continue
            if image in ("python.exe", "pythonw.exe", "you-backend.exe"):
                print(f"[Port] {port} 점유 중 ({image}, PID {pid}) → 종료 후 재시작합니다.")
                try:
                    _sp.run(["taskkill", "/F", "/PID", str(pid)],
                            capture_output=True, text=True, timeout=10)
                    killed_any = True
                except Exception as e:
                    print(f"[Port] 종료 실패 (PID {pid}): {e}")
            else:
                print(f"[Port] {port}를 다른 프로그램({image or 'unknown'}, PID {pid})이 사용 중이라 자동 종료하지 않습니다.")
                return False
        _time.sleep(2.0 if killed_any else 1.0)
    return not _is_open()


if __name__ == "__main__":
    import os as _os
    import sys as _sys
    # 번들 콘솔(cp949)에서 이모지 출력 크래시 방지
    try:
        if hasattr(_sys.stdout, "reconfigure"):
            _sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        if hasattr(_sys.stderr, "reconfigure"):
            _sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
    import uvicorn
    _port = int(_os.environ.get("YOU_BACKEND_PORT", "8000"))
    if not _ensure_port_free(_port):
        print(f"❌ 포트 {_port}를 비우지 못했습니다. 점유 프로그램을 직접 종료 후 다시 실행하세요.")
        raise SystemExit(1)
    print("\n" + "="*50)
    print("🚀 AutoVideoSystem Backend Server Starting...")
    print(f"📡 API Address: http://localhost:{_port}")
    print("📝 Logs will be displayed below in real-time.")
    print("="*50 + "\n")
    uvicorn.run(app, host="127.0.0.1", port=_port, log_level="info")
