"""숏폼/릴스 벤치마킹 분석 + 패턴 기반 재창작 엔진 (2단계).

범위 (정직한 제한):
- 파일 업로드(이미지/영상): Gemini 멀티모달 네이티브 분석. STT·프레임 파이프라인 불필요.
- URL 분석: YouTube만 지원. 인스타/틱톡은 스크래핑 차단·약관 문제로 400 거부.
- 좋아요/댓글/조회수: settings.yaml youtube_api_key가 있을 때만 YouTube Data API로 수집.
  키가 없으면 stats=null + 사유 명시 (LLM이 수치 지어내지 못하게).
"""
import base64
import json
import os
import re

import google.generativeai as genai

try:
    from .config_utils import load_config, get_asset_dir
except (ImportError, ValueError):
    from config_utils import load_config, get_asset_dir

try:
    from .generator import _convert_storyboard_items
except (ImportError, ValueError):
    from generator import _convert_storyboard_items
try:
    from .templates import get_template
except (ImportError, ValueError):
    from templates import get_template
try:
    from .websearch import gather_evidence, gather_recipe_evidence, format_evidence_block, extract_fact_sentences
except (ImportError, ValueError):
    from websearch import gather_evidence, gather_recipe_evidence, format_evidence_block, extract_fact_sentences

ALLOWED_UPLOAD_MIMES = {
    "image/jpeg", "image/png", "image/webp",
    "video/mp4", "video/quicktime", "video/webm",
}
MAX_UPLOAD_BYTES = 100 * 1024 * 1024

ANALYSIS_MODEL_FALLBACK = "gemini-3.6-flash"


def _analysis_model():
    """settings gemini_text_models 맨 앞 모델 우선, 없으면 폴백."""
    try:
        models = (load_config().get("gemini_text_models") or [])
        models = [m for m in models if isinstance(m, str) and m.strip()]
        if models:
            return models[0]
    except Exception:
        pass
    return ANALYSIS_MODEL_FALLBACK


def _workhorse_model():
    """대본 생성용: 설정 목록 중 lite가 아닌 첫 모델 (지시 이행력 우선)."""
    try:
        models = (load_config().get("gemini_text_models") or [])
        models = [m for m in models if isinstance(m, str) and m.strip()]
        capable = [m for m in models if "lite" not in m.lower()]
        if capable:
            return capable[0]
        if models:
            return models[0]
    except Exception:
        pass
    return ANALYSIS_MODEL_FALLBACK


def _get_api_key():
    config = load_config()
    api_key = config.get("gemini_api_key")
    if not api_key or api_key == "YOUR_GEMINI_API_KEY":
        raise ValueError("Gemini API Key is missing. Please set it in config/settings.yaml.")
    return api_key, config


def _parse_json_response(text):
    t = (text or "").strip()
    if t.startswith("```json"):
        t = t[7:]
    elif t.startswith("```"):
        t = t[3:]
    if t.endswith("```"):
        t = t[:-3]
    return json.loads(t.strip())


# storyboard 아이템으로 인정하는 키. 이 중 하나도 없으면 스키마 위반으로 재시도.
_KNOWN_ITEM_KEYS = ("narration_ko", "text", "voice_script", "voice", "subtitle_ko")


def _call_storyboard_json(model, prompt, what="대본"):
    """LLM 호출 + JSON 파싱 + 스키마 검증을 최대 2회 시도한다."""
    last_err = ""
    for attempt in range(2):
        try:
            p = prompt
            if attempt > 0:
                p = prompt + "\n반드시 유효한 JSON만 출력하라. 키 이름은 예시와 정확히 같아야 한다. 설명·마크다운 금지."
            result_json = _parse_json_response(model.generate_content(p).text)
            items = result_json.get("storyboard", []) or []
            usable = [it for it in items if isinstance(it, dict) and any(k in it for k in _KNOWN_ITEM_KEYS)]
            if usable:
                if len(usable) < len(items):
                    print(f"[Shorts] Dropped {len(items) - len(usable)} unknown-schema scenes.")
                result_json["storyboard"] = usable
                return result_json
            last_err = "usable 장면 0개 (스키마 위반)"
            print(f"[Shorts] {what} {attempt + 1}회차: {last_err}")
        except Exception as e:
            last_err = str(e)[:200]
            print(f"[Shorts] {what} {attempt + 1}회차 실패: {last_err}")
    raise ValueError(f"모델 응답 파싱 실패: {last_err}")


ANALYSIS_JSON_SPEC = """
반드시 JSON만 출력 (키 고정):
{
  "hook_summary": "초반 3초를 사로잡은 요소 한 줄 요약",
  "hook_first3s": ["3초 구간 요소1", "요소2"],
  "content_pattern": [{"phase": "구간명", "label": "유형", "detail": "설명"}],
  "transcript_approx": "영상 음성 받아쓰기 (없으면 빈 문자열)",
  "visual_notes": ["장면 변화/시각 패턴"],
  "why_it_works": ["반응 이유 1", "이유 2"],
  "hashtags": ["#태그1", "#태그2"],
  "suggested_duration": 40,
  "tone": "톤앤매너 한 줄",
  "storyboard": [
    {
      "speaker": "BJ 이슈왕",
      "text": "1~2문장 대사",
      "visual": {"type": "ai_image", "keyword": "한국어 키워드", "description": "English cinematic B-roll prompt"}
    }
  ]
}
"""


def analyze_upload(file_bytes, mime_type, hint=""):
    """업로드된 이미지/영상을 분석해 리포트 + 바로 쓸 대본(storyboard) 반환."""
    if mime_type not in ALLOWED_UPLOAD_MIMES:
        raise ValueError(f"Unsupported file type: {mime_type}")
    if not file_bytes or len(file_bytes) > MAX_UPLOAD_BYTES:
        raise ValueError("File is empty or exceeds 100MB.")

    api_key, _ = _get_api_key()
    genai.configure(api_key=api_key)
    model = genai.GenerativeModel(_analysis_model())

    is_video = mime_type.startswith("video/")
    kind = "숏폼 영상" if is_video else "이미지"
    prompt = f"""
    이 {kind}은(는) 바이럴 숏폼/릴스 레퍼런스이다. {'사용자 힌트: ' + hint if hint else ''}
    영상 내 음성은 받아쓰고, 장면 변화·자막·구도를 분석한 뒤,
    Hook Summary, Content Pattern(도입→전개→연결→CTA), 반응 이유, 해시태그를 추출하라.
    마지막으로 이 레퍼런스를 그대로 재현할 수 있는 대본(storyboard, 대사 1~2문장씩)도 함께 작성하라.
    {ANALYSIS_JSON_SPEC}
    """
    response = model.generate_content([
        {"mime_type": mime_type, "data": file_bytes},
        prompt,
    ])
    result = _parse_json_response(response.text)
    result["source_type"] = "upload"
    result["stats"] = None
    result["stats_note"] = "업로드 파일은 조회수/좋아요가 없음"
    return result


def extract_youtube_id(url):
    if not url:
        return None
    patterns = [
        r"(?:youtube\.com\/watch\?.*v=|youtube\.com\/shorts\/|youtube\.com\/live\/|youtu\.be\/)([\w-]{6,})",
        r"youtube\.com\/embed\/([\w-]{6,})",
    ]
    for pat in patterns:
        m = re.search(pat, url)
        if m:
            return m.group(1)
    return None


def fetch_youtube_oembed(video_id):
    import requests
    try:
        r = requests.get(
            "https://www.youtube.com/oembed",
            params={"url": f"https://www.youtube.com/watch?v={video_id}", "format": "json"},
            timeout=15,
        )
        if r.status_code == 200:
            return r.json()
    except Exception as e:
        print(f"oEmbed failed: {e}")
    return {}


def fetch_transcript(video_id):
    """자막(대본) 수집. 없으면 빈 문자열 (에러 아님)."""
    try:
        from youtube_transcript_api import YouTubeTranscriptApi
        try:  # v1.x 신 API
            fetched = YouTubeTranscriptApi().fetch(video_id, languages=["ko", "en"])
            chunks = fetched.snippets if hasattr(fetched, "snippets") else fetched
            return " ".join(getattr(c, "text", c.get("text", "")) for c in chunks)
        except Exception:
            pass
        try:  # 구 API
            tracks = YouTubeTranscriptApi.get_transcript(video_id, languages=["ko", "en"])
            return " ".join(t.get("text", "") for t in tracks)
        except Exception:
            tracks = YouTubeTranscriptApi.get_transcript(video_id)
            return " ".join(t.get("text", "") for t in tracks)
    except Exception as e:
        print(f"Transcript unavailable for {video_id}: {e}")
        return ""


def fetch_youtube_stats(video_id, api_key):
    """YouTube Data API 통계. 키 없으면 None."""
    if not api_key:
        return None
    import requests
    try:
        r = requests.get(
            "https://www.googleapis.com/youtube/v3/videos",
            params={"id": video_id, "part": "statistics,snippet", "key": api_key},
            timeout=15,
        )
        if r.status_code != 200:
            print(f"YouTube Data API failed: {r.status_code} {r.text[:200]}")
            return None
        items = r.json().get("items", [])
        if not items:
            return None
        st = items[0].get("statistics", {})
        sn = items[0].get("snippet", {})
        return {
            "views": st.get("viewCount"),
            "likes": st.get("likeCount"),
            "comments": st.get("commentCount"),
            "title": sn.get("title"),
            "channel": sn.get("channelTitle"),
            "published_at": sn.get("publishedAt"),
        }
    except Exception as e:
        print(f"YouTube stats failed: {e}")
        return None


def analyze_youtube(url):
    """YouTube URL 분석. 영상 파일 다운로드는 하지 않음 (자막+메타데이터 기반)."""
    video_id = extract_youtube_id(url)
    if not video_id:
        raise ValueError(
            "YouTube URL이 아닙니다. watch/shorts/youtu.be 형식만 지원합니다. "
            "인스타그램·틱톡은 스크래핑 차단 및 약관 문제로 지원하지 않습니다."
        )
    api_key, config = _get_api_key()
    oembed = fetch_youtube_oembed(video_id)
    transcript = fetch_transcript(video_id)
    stats = fetch_youtube_stats(video_id, config.get("youtube_api_key"))

    genai.configure(api_key=api_key)
    model = genai.GenerativeModel(_analysis_model())
    prompt = f"""
    아래는 유튜브 숏폼 레퍼런스의 수집 데이터이다. 영상 파일은 없으므로 자막+메타데이터로 분석하라.
    수치가 없으면(stats 없음) 반응 이유를 지어내지 말고 '수치 미확인'이라 명시하라.
    - 제목: {oembed.get('title', '')} / 채널: {oembed.get('author_name', '')}
    - 자막: {(transcript[:4000] if transcript else '(자막 없음)')}
    - 통계: {json.dumps(stats, ensure_ascii=False) if stats else '없음 (YouTube Data API 키 미설정)'}
    Hook Summary, Content Pattern(도입→전개→연결→CTA), 반응 이유(수치 기반, 수치 없으면 패턴 기반 + 미확인 명시),
    해시태그를 추출하고, 같은 패턴의 재현 대본(storyboard)도 작성하라.
    {ANALYSIS_JSON_SPEC}
    """
    result = _parse_json_response(model.generate_content(prompt).text)
    result["source_type"] = "youtube"
    result["video_id"] = video_id
    result["stats"] = stats
    if stats is None:
        result["stats_note"] = "settings.yaml youtube_api_key 미설정으로 수치 미수집"
    if not transcript:
        result["transcript_approx"] = result.get("transcript_approx") or ""
    return result


def _compact_reference(reference_summary):
    """분석 리포트에서 패턴 정보만 추출. 초안 대본·자막(다른 영상 것)은 제외 (베끼기 방지)."""
    raw = str(reference_summary or "")
    try:
        rep = json.loads(raw) if raw.strip().startswith("{") else None
    except Exception:
        rep = None
    if not isinstance(rep, dict):
        return raw[:1500]
    keep = []
    for key in ("hook_summary", "hook_first3s", "content_pattern", "why_it_works",
                "tone", "suggested_duration", "hashtags"):
        val = rep.get(key)
        if val:
            keep.append(f"{key}: {json.dumps(val, ensure_ascii=False)[:800]}")
    if not keep:
        return raw[:1500]
    return "\n".join(keep)


def create_from_pattern(reference_summary, new_topic, duration=40, category="recipe_short"):
    """분석 리포트의 성공 패턴을 새 주제에 적용해 풀 패키지 생성.

    반환: 제목 + Hook Idea + 톤앤매너 + 해시태그 + 섹션 구조 스토리보드.
    shape은 /generate와 호환 (script/scenes/total_duration/target_duration).
    """
    if not new_topic or not new_topic.strip():
        raise ValueError("새 주제를 입력하세요.")
    try:
        duration = int(duration or 40)
    except (TypeError, ValueError):
        duration = 40
    duration = max(15, min(duration, 180))
    topic = new_topic.strip()

    # 40초 기준 최소 6씬, 씬당 4~8초. 3줄 요약으로 끝나지 못하게 하한 강제.
    min_scenes = max(5, min(12, duration // 7))

    # 카테고리 프리셋 (templates.py): 지침 + 섹션 구조를 여기서 공급
    template = get_template(category)
    template_name = template["name"]
    # 사용자 추가 지시 (설정/프롬프트 모달에서 저장, 없으면 빈 문자열)
    try:
        _extra_all = load_config().get("category_extra_instructions") or {}
    except Exception:
        _extra_all = {}
    extra_instructions = (_extra_all.get(category) or "").strip()
    sections_spec = "\n".join(
        f"       - {name}: {desc}" for name, desc in template["sections"]
    )
    example_speaker = template["example_speaker"]
    example_text = template["example_text"]
    if category == "recipe_short":
        numeric_rule = (
            "확정 팩트가 비어 있으면 표준 가정식 분량(탕수육 200g, 에어프라이어 180도 10분, "
            "김치 1컵, 케첩·고추장·설탕 각 1~3스푼, 치즈 100g 등)을 기준으로 삼되, "
            "재료소개(INGREDIENTS) 대사에서는 재료명만 간결히 읊고 세부 용량은 각 조리 장면 대사에 분산시켜라"
        )
    elif category == "review_short":
        numeric_rule = "제품 스펙·가격은 확정 팩트에 있을 때만 숫자로 제시하고, 없으면 '취향과 예산에 따라' 수준으로 써라"
    else:
        numeric_rule = "통계·연구 수치는 확정 팩트에 있는 것만 인용하라"

    api_key, _ = _get_api_key()
    genai.configure(api_key=api_key)
    # 대본 생성은 지시 이행력이 중요 → workhorse 모델 사용 (분석용 lite와 분리)
    model = genai.GenerativeModel(_workhorse_model())
    # 근거 없을 때는 표준 패턴으로 (분석 스킵 '바로 만들기' 경로)
    pattern_text = _compact_reference(reference_summary)
    if not pattern_text:
        pattern_text = "(기본 패턴 사용: 훅→전개→연결→CTA)"

    # 웹 근거 수집 (레시피 수치·재료·순서 등 실제 정보 주입, 키 없어도 DDG로 시도)
    # 요리 주제는 '재료 분량 순서' 확장 쿼리까지 병합 (위키 수준 일반론 방지)
    try:
        if category == "recipe_short":
            evidence = gather_recipe_evidence(topic, count=6)
        else:
            evidence = gather_evidence(topic, count=6)
    except Exception as ev_e:
        print(f"[Shorts Evidence] failed: {ev_e}")
        evidence = {"items": [], "grounded": False}
    evidence_block = format_evidence_block(evidence)
    if evidence_block:
        print(f"[Shorts Evidence] grounded with {len(evidence['items'])} sources.")
    else:
        print("[Shorts Evidence] no sources, generating ungrounded.")

    # 1단계: 수치 문장만 추려 확정 팩트 확정 (저렴한 lite로, 작성과 분리)
    fact_lines = extract_fact_sentences(evidence, limit=12)
    facts_text = ""
    if fact_lines:
        lite = genai.GenerativeModel(_analysis_model())
        fact_prompt = (
            f"주제 '{topic}'의 레시피/제작 정보를 아래 문장에서 뽑아 JSON만 출력하라.\n"
            '{"ingredients": [{"name": "재료명", "amount": "분량"}], '
            '"steps": [{"order": 1, "action": "동작", "numbers": "온도·시간·분량"}], '
            '"tips": ["꿀팁"]}\n'
            "모르는 분량은 amount를 빈 문자열로 (지어내기 금지).\n"
            + "\n".join(f"- {f}" for f in fact_lines)
        )
        try:
            facts_text = lite.generate_content(fact_prompt).text
            print(f"[Shorts Facts] confirmed {len(fact_lines)} fact sentences.")
        except Exception as fe:
            print(f"[Shorts Facts] failed: {fe}")

    role_intro = template["role_intro"]
    # 사용자 추가 지시 블록 (f-string 안에서 백슬래시 불가 → 미리 조립)
    extra_block = ""
    if extra_instructions:
        extra_block = "[사용자 추가 지시 - 카테고리 지침보다 최우선 적용]\n    " + extra_instructions
    prompt = f"""
    [선택된 카테고리: {template_name}]
    {role_intro}
    아래 [벤치마킹 패턴](훅 구조, 전개 속도, CTA 방식)을 계승해 [새 주제] 전용 풀 패키지를 작성하라.
    speaker는 전부 "BJ 이슈왕"으로 통일 (TTS 호환).

    [작성 규칙 - 위반 시 실패작]
    1. 분량: 목표 {duration}초. 초당 3.5음절 기준으로 대본을 채울 것. 2~3개 장면으로 끝내지 마라.
    2. 장면 수: 최소 {min_scenes}개 이상. 각 장면 4~8초 분량, 대사는 1~2문장.
       나레이션은 한 문장 15자 내외로 짧게 쓸 것. narration_ko를 비울 수 있는 장면은 전체 중 최대 2개까지이며,
       빈 장면은 반드시 subtitle_ko에 계량을 넣을 것. HOOK·CTA·INGREDIENTS의 narration_ko는 절대 비우지 마라.
       narration_ko는 장면 1초당 공백 제외 4~5자 이내로 쓴다.
    3. 섹션 구성 (순서 고정, section 값은 아래 영문 태그 그대로):
{sections_spec}
       - MAIN이 여러 개면 같은 태그를 반복 사용해도 된다.
    4. visual.keyword는 반드시 한국어 명사구(예: "된장찌개 끓는 냄비")로 장면 주제를 설명하고,
       description은 영어 B-roll 묘사(AI 생성용). keyword에 'blank sign'이나 이미지 지시어를 쓰지 마라.
    5. 간판·자막 문구를 읽을 수 있게 쓰지 마라 (필요시 description 안에서만 blank sign으로 묘사).
    6. visual 안에 용도별 2개 필드를 반드시 채워라 (빈 문자열 금지):
       - stock_query: Pexels 스톡 검색용 영문 키워드 2~3개 (짧은 명사 위주, 예: "melting cheese").
         문장형 금지, 한글 금지, AI 프롬프트 그대로 복사 금지.
       - filming_guide: 직접 스마트폰으로 찍을 때의 한글 촬영 지시 1줄
         (구도+카메라워크+초수, 예: "도마 위 재료를 탑다운으로 2초간 줌인").

    반드시 JSON만 출력 (설명, 마크다운, 코드펜스 금지):
    {{
      "title": "숏폼 제목 (이모지 1개 포함 가능)",
      "servings": "1인분",
      "total_cost_krw": 0,
      "tools": ["프라이팬", "에어프라이어"],
      "hook_idea": "이 대본의 훅을 한 줄로 설명",
      "tone_and_manner": "예: 빠르고 친근한 1인칭 셰프 톤",
      "hashtags": ["#태그1", "#태그2", "#태그3", "#태그4", "#태그5"],
      "storyboard": [
        {{
          "section": "HOOK",
          "speaker": "{example_speaker}",
          "narration_ko": "{example_text}",
          "subtitle_ko": "배달비 3천원 절약! 10분 완성",
          "sfx": "치즈 늘어나는 소리",
          "duration_sec": 5,
          "visual": {{"type": "ai_image", "keyword": "한국어 키워드", "description": "English B-roll prompt", "stock_query": "melting cheese", "filming_guide": "팬 위 치즈를 클로즈업으로 2초간 촬영"}}
        }}
      ]
    }}
    - scenes의 duration_sec 합계 = 목표 영상 길이({duration}초).
    - narration_ko가 빈 문자열이면 무음 구간이다. 이 경우 subtitle_ko에 계량을 반드시 넣어라.
      단, 빈 narration_ko는 전체 중 최대 2개까지, HOOK·CTA·INGREDIENTS는 반드시 채워라.
    - storyboard 각 아이템의 키는 section/speaker/narration_ko/subtitle_ko/sfx/duration_sec/visual 만 사용하라.
      dialogue/scene/voice 키 금지.

    [벤치마킹 패턴 - 구조·속도·CTA 방식만 참고하고, 포함된 대본 초안은 다른 영상의 것이므로 절대 베끼지 마라]
    {pattern_text}

    [웹 검색 근거 - 배경 이해용으로만 읽고, 수치는 아래 확정 팩트만 사용하라]
    {(evidence_block[:800] + '...') if facts_text and len(evidence_block) > 800 else (evidence_block if evidence_block else '(근거 없음)')}

    [카테고리 전용 지침 - 위 일반 규칙보다 우선 적용]
    {template["instructions"]}
    {extra_block}

    [확정 팩트 - 대본의 모든 수치는 이 목록에서만 가져와라, 목록 외 수치는 절대 지어내지 마라]
    {facts_text if facts_text else '(확정 팩트 없음 - 아래 규칙을 따를 것)'}

    [작성 규칙 추가]
    - 각 장면 대사에는 확정 팩트의 구체 수치를 1개 이상 포함하되, HOOK·CTA·INGREDIENTS(재료명 나열)는 예외로 한다
    - 확정 팩트에 없는 수치는 절대 지어내지 마라. 없으면 수치 없이 쓰거나 '기호에 맞게'로 표현하라
    - {numeric_rule}
    - 출처 사이트명(만개의레시피, 블로그명 등)을 대사에 언급하지 마라

    [새 주제]
    {topic}
    """
    result_json = _call_storyboard_json(model, prompt, what="stage1")
    items = result_json.get("storyboard", [])
    if not items:
        raise ValueError("대본 생성 결과가 비어 있습니다.")

    # 분량 미달 시 1회 확장 (같은 스키마로 추가 장면 요청)
    def _total(itms):
        t = 0.0
        for it in itms:
            try:
                from .generator import calculate_duration
            except (ImportError, ValueError):
                from generator import calculate_duration
            tx = it.get("narration_ko")
            if tx is None:
                tx = it.get("text", "") or ""
            import re as _re
            tx = _re.sub(r'\(.*?\)', '', tx).strip()
            t += (calculate_duration(tx) if tx else min(max(float(it.get("duration_sec") or 3), 1.0), 15.0)) + 0.5
        return t

    if _total(items) < duration * 0.7 and len(items) < 15:
        last = "\n".join(f"- {i.get('section', '')}: {i.get('text', '')}" for i in items[-3:])
        ext_prompt = f"""
        위 대본은 {len(items)}개 장면으로 목표 {duration}초에 못 미친다.
        같은 주제({topic})로 이어지는 추가 장면 {max(2, min_scenes - len(items))}개를 같은 JSON 스키마(storyboard 배열)로만 출력하라.
        섹션은 MAIN/SECRET_TIP/CTA 중에서 이어지는 것만 사용하고 HOOK은 반복하지 마라.
        아이템 키는 section/speaker/narration_ko/subtitle_ko/sfx/duration_sec/visual 만 사용하라.
        앞부분 마지막 3장면:
        {last}
        """
        try:
            ext_json = _call_storyboard_json(model, ext_prompt, what="extend")
            ext_items = ext_json.get("storyboard", [])
            if ext_items:
                items = items + ext_items
                print(f"[Shorts Extend] Added {len(ext_items)} scenes.")
        except Exception as ext_e:
            print(f"[Shorts Extend] failed: {ext_e}")

    script_list, scene_guide_list, current_time = _convert_storyboard_items(items, 0, 0, allow_empty_text=True)
    if not script_list:
        raise ValueError("모델 응답에 유효한 장면이 없습니다. 다시 생성을 눌러주세요.")

    # 수치 검증 + 1회 수리: HOOK/CTA/INGREDIENTS 제외하고 숫자 없는 장면이 있으면 확정 팩트로 고침
    if facts_text:
        import re as _re2
        bare = [i for i, s in enumerate(script_list)
                if (scene_guide_list[i].get("section", "") not in ("HOOK", "CTA", "INGREDIENTS"))
                and not _re2.search(r"\d", (s.get("text", "") or "") + " " + (s.get("subtitle", "") or ""))]
        if bare:
            print(f"[Shorts Repair] {len(bare)} scenes lack numbers, repairing once...")
            numbered = "\n".join(
                f"{i + 1}. [{scene_guide_list[i].get('section', '')}] {s.get('text', '')}"
                for i, s in enumerate(script_list)
            )
            repair_prompt = f"""
            아래 {len(script_list)}개 장면 대본 중 숫자 없는 장면을 확정 팩트 수치로 고쳐라.
            구조·순서·섹션은 그대로 두고 대사 텍스트만 수정, 전체를 같은 JSON 스키마
            (title/hook_idea/tone_and_manner/hashtags/storyboard)로 다시 출력하라.
            storyboard 아이템 키는 section/speaker/narration_ko/subtitle_ko/sfx/duration_sec/visual 만 사용하라.
            확정 팩트 외의 새 수치를 지어내지 마라.

            [확정 팩트]
            {facts_text[:1500]}

            [현재 대본]
            {numbered}
            """
            try:
                rep_json = _call_storyboard_json(model, repair_prompt, what="repair")
                rep_items = rep_json.get("storyboard", [])
                if rep_items and len(rep_items) == len(items):
                    _rs, _rg, _rt = _convert_storyboard_items(rep_items, 0, 0, allow_empty_text=True)
                    if _rs:
                        items = rep_items
                        result_json = rep_json
                        script_list, scene_guide_list, current_time = _rs, _rg, _rt
                        print("[Shorts Repair] applied.")
                    else:
                        print("[Shorts Repair] skipped (repair returned empties, keeping original).")
                else:
                    print("[Shorts Repair] skipped (shape mismatch).")
            except Exception as rep_e:
                print(f"[Shorts Repair] failed: {rep_e}")
    # 섹션 정보 유지 (Step2 뱃지 표시용)
    for sc, it in zip(scene_guide_list, items):
        sec = (it.get("section") or "").strip().upper()
        if sec:
            sc["section"] = sec
    # visual.keyword 유실/오염 시 주제어로 폴백
    for sc in scene_guide_list:
        kw = (sc.get("keyword") or "").strip()
        if not kw or kw == "news" or kw.lower() in (
            'blank sign', 'blank signs', 'blank', 'no text', 'textless',
            'blank labels', 'no readable text',
        ):
            sc["keyword"] = topic[:20]

    out = {
        "grounded": bool(evidence_block),
        "sources": [{"title": it.get("title", ""), "link": it.get("link", "")} for it in evidence.get("items", [])],
        "title": result_json.get("title", topic),
        "servings": result_json.get("servings", ""),
        "total_cost_krw": result_json.get("total_cost_krw", 0),
        "tools": result_json.get("tools", []) or [],
        "hook_idea": result_json.get("hook_idea", ""),
        "tone_and_manner": result_json.get("tone_and_manner", ""),
        "hashtags": result_json.get("hashtags", []) or [],
        "recommended_length": duration,
        "script": script_list,
        "scenes": scene_guide_list,
        "total_duration": round(current_time, 1),
        "target_duration": duration,
    }
    if current_time < duration * 0.7:
        out["warning"] = f"요청 {duration}초 중 약 {current_time:.0f}초 분량만 생성되었습니다. 다시 생성을 눌러 보완하세요."
    elif current_time > duration * 1.15:
        out["warning"] = f"요청 {duration}초를 초과해 약 {current_time:.0f}초 분량이 생성되었습니다. 대본을 줄이거나 다시 생성하세요."
    print(f"[Shorts Create] {len(script_list)} scenes, {current_time:.1f}s / target {duration}s.")
    return out


# ---------- 클립 기반 선택적 대본 다듬기 ----------

def _resolve_clip_path(url_or_path):
    """스톡/업로드 클립 URL·경로 → 로컬 절대 경로 (없으면 None)."""
    if not url_or_path or not isinstance(url_or_path, str):
        return None
    q = url_or_path.strip()
    if os.path.exists(q) and os.path.isfile(q):
        return os.path.abspath(q)
    for prefix in ("http://localhost:8000", "http://127.0.0.1:8000"):
        if q.startswith(prefix):
            q = q[len(prefix):]
            break
    q = q.lstrip("/")
    if q.startswith("assets/"):
        q = q[len("assets/"):]
    try:
        candidate = os.path.join(get_asset_dir(), q)
    except Exception:
        return None
    if os.path.exists(candidate) and os.path.isfile(candidate):
        return os.path.abspath(candidate)
    return None


def _extract_clip_frames(abs_path, is_video, max_frames=3):
    """클립에서 JPEG 바이트 리스트 추출 (Vision 입력용). 실패하면 빈 리스트."""
    out = []
    try:
        from PIL import Image
        if is_video:
            from moviepy import VideoFileClip
            clip = VideoFileClip(abs_path)
            try:
                dur = clip.duration or 0
                if dur <= 0:
                    return out
                n = min(max_frames, 3)
                times = [dur * (i + 1) / (n + 1) for i in range(n)]
                for t in times:
                    frame = clip.get_frame(t)
                    img = Image.fromarray(frame)
                    img.thumbnail((768, 768))
                    buf = io.BytesIO()
                    img.save(buf, format="JPEG", quality=80)
                    out.append(("image/jpeg", buf.getvalue()))
            finally:
                try:
                    clip.close()
                except Exception:
                    pass
        else:
            img = Image.open(abs_path).convert("RGB")
            img.thumbnail((768, 768))
            buf = io.BytesIO()
            img.save(buf, format="JPEG", quality=80)
            out.append(("image/jpeg", buf.getvalue()))
    except Exception as e:
        print(f"[Refine] Frame extract failed ({abs_path}): {e}")
    return out


def _describe_clip_images(model, frames, label):
    """프레임들을 Vision으로 2줄 요약. 실패하면 빈 문자열."""
    if not frames:
        return ""
    try:
        parts = [
            "이 클립 화면에 실제로 보이는 것을 2줄로 요약하라. "
            "색·동작·도구·음식 위주로, 추측이나 꾸밈말 금지. 한글로 답하라."
        ]
        for mime, data in frames:
            parts.append({"mime_type": mime, "data": data})
        resp = model.generate_content(parts)
        text = (resp.text or "").strip()
        print(f"[Refine] Clip described ({label}): {text[:80]}")
        return text
    except Exception as e:
        print(f"[Refine] Clip describe failed ({label}): {e}")
        return ""


def refine_scene(scene, clips, topic="", category="recipe_short"):
    """선택된 클립을 참고해 해당 씬 대본만 다듬는다. 잠금 필드는 손대지 않는다.

    scene: {section, speaker, text, subtitle, duration}
    clips: [{url, kind: video|image, source: stock|upload|ai|search, note}]
    returns: {clip_notes, narration_ko, subtitles, sfx, mismatch_warning}
    """
    scene = scene or {}
    clips = clips or []
    if not clips:
        raise ValueError("다듬기에 쓸 클립이 없습니다. 클립을 1개 이상 선택하세요.")

    api_key, _ = _get_api_key()
    genai.configure(api_key=api_key)
    vision = genai.GenerativeModel(_analysis_model())

    clip_notes = []
    for i, c in enumerate(clips):
        if not isinstance(c, dict):
            continue
        kind = (c.get("kind") or "image").lower()
        source = (c.get("source") or "").lower()
        note = (c.get("note") or "").strip()
        is_video = kind == "video" or str(c.get("url", "")).lower().endswith((".mp4", ".webm", ".mov"))
        abs_path = _resolve_clip_path(c.get("url", ""))
        summary = ""
        if abs_path:
            # 업로드·스톡 영상은 프레임 Vision 분석, 이미지는 원본 1장으로 요약
            frames = _extract_clip_frames(abs_path, is_video)
            summary = _describe_clip_images(vision, frames, f"clip{i + 1}")
        desc = summary or note or "(분석 생략: 원격 파일)"
        clip_notes.append(f"클립{i + 1} [{source or '?'}]: {desc}")

    workhorse = genai.GenerativeModel(_workhorse_model())
    scene_sec = scene.get("section", "")
    scene_text = scene.get("text", "")
    scene_sub = scene.get("subtitle", "")
    try:
        scene_dur = float(scene.get("duration") or 0)
    except (TypeError, ValueError):
        scene_dur = 0
    base_prompt = f"""
    너는 숏폼 대본 다듬기 전문가다. 아래 기존 씬 1개를, 선택된 클립 화면에 맞게만 다듬어라.

    [대본 다듬기 규칙]
    - 잠금: 재료 분량, 온도, 시간, 불세기, 씬 총 길이({scene_dur:.1f}초)는 절대 바꾸지 않는다.
    - 클립 화면에 실제로 보이는 것(색, 동작, 도구)을 나레이션에 1개 이상 반영한다.
    - 클립이 2개 이상이면 전환 지점에 맞춰 나레이션을 구/문장 단위로 끊는다 (subtitles 배열로 분할, start/end는 씬 내 상대초).
    - 클립 내용이 대본과 다르면 대본을 바꾸지 말고 mismatch_warning에 사유를 적는다 (예: 팬 조리로 보이는데 대본은 에어프라이어).
    - 반드시 JSON만 출력. 키: narration_ko, subtitles ([{{text, start, end}}]), sfx, mismatch_warning (없으면 빈 문자열).

    [기존 씬]
    - 섹션: {scene_sec}
    - 나레이션: {scene_text}
    - 자막: {scene_sub}
    - 주제: {topic}

    [클립 분석]
    """ + "\n".join(clip_notes)
    last_err = ""
    result = None
    for attempt in range(2):
        try:
            p = base_prompt if attempt == 0 else base_prompt + "\n반드시 유효한 JSON만 출력하라. 설명·마크다운 금지."
            cand = _parse_json_response(workhorse.generate_content(p).text)
            if isinstance(cand, dict) and ("narration_ko" in cand or "subtitles" in cand):
                result = cand
                break
            last_err = "필요 키(narration_ko/subtitles) 없음"
        except Exception as e:
            last_err = str(e)[:200]
    if result is None:
        raise ValueError(f"다듬기 응답 파싱 실패: {last_err}")
    return {
        "clip_notes": clip_notes,
        "narration_ko": result.get("narration_ko", scene_text),
        "subtitles": result.get("subtitles", []) or [],
        "sfx": result.get("sfx", ""),
        "mismatch_warning": result.get("mismatch_warning", ""),
    }
