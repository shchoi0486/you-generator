import google.generativeai as genai
import json
import os
import asyncio
import random
import re
from .config_utils import load_config
from .templates import get_template


def calculate_duration(text: str) -> float:
    """
    프론트엔드 App.tsx의 calculateDuration과 동일한 로직을 파이썬으로 구현
    """
    if not text:
        return 0.0

    # 공백 제외 실질 글자수
    clean_text = re.sub(r'[\s\n\r]', '', text)
    if not clean_text:
        return 0.0

    # 한글과 영문/기타 문자 비율에 따른 발화 속도 차이 반영
    # 한글: 약 0.28초/자, 영문/기타: 약 0.08초/자 (평균적인 속도)
    korean_chars = len(re.findall(r'[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]', clean_text))
    other_chars = len(clean_text) - korean_chars
    
    duration = (korean_chars * 0.28) + (other_chars * 0.08)
    
    # 문장 부호(. ! ?)에 따른 휴지기 추가
    pause_count = len(re.findall(r'[.!?]', text))
    total_duration = duration + (pause_count * 0.2)

    # 최소 재생 시간 보장 (최소 1.2초)
    return max(1.2, round(total_duration, 1))


async def generate_with_retry(model, prompt, max_retries=3, progress_callback=None):
    """
    429 오류(Quota Exceeded) 발생 시 지수 백오프로 재시도합니다.
    """
    for attempt in range(max_retries):
        if progress_callback:
            # progress_callback을 호출하여 취소 여부를 확인합니다.
            # (main.py의 progress_callback은 취소 시 asyncio.CancelledError를 발생시킴)
            await progress_callback(None, None)

        try:
            # model.generate_content_async를 사용하여 비동기적으로 실행 (이벤트 루프 차단 방지)
            return await model.generate_content_async(prompt)
        except Exception as e:
            error_str = str(e)
            if "429" in error_str or "Quota exceeded" in error_str:
                wait_time = (2 ** attempt) + 5 + random.uniform(0, 3) # 최소 5초 대기
                print(f"Quota exceeded. Retrying in {wait_time:.2f}s... (Attempt {attempt+1}/{max_retries})")
                await asyncio.sleep(wait_time)
            else:
                raise e
    raise Exception("Max retries exceeded for Quota Exceeded error.")


def apply_style_anchor(description, anchor):
    """스타일 앵커가 description 앞에 없으면 붙인다. 프로젝트 전체 톤 통일용."""
    desc = (description or '').strip()
    anchor = (anchor or '').strip().rstrip(',')
    if not desc or not anchor:
        return desc
    # 이미 포함돼 있으면 그대로 (앞부분 기준, 대소문자 무시)
    if anchor.lower() in desc.lower()[:len(anchor) + 40]:
        return desc
    return f"{anchor}, {desc}"


def _convert_storyboard_items(items, start_idx, current_time, allow_empty_text=False, default_hold_sec=3.0, style_anchor=""):
    """storyboard 아이템 리스트를 (script, scenes)로 변환. current_time부터 이어서 타이밍 계산.
    allow_empty_text=True면 빈 내레이션도 무음 홀드 장면으로 유지 (ASMR용).
    narration_ko/subtitle_ko 스키마를 text/subtitle로 정규화한다."""
    script_list = []
    scene_guide_list = []
    forbidden_keywords = ['뉴스 속보', '그래픽', 'Ticker', 'Infographic', 'Breaking News', '속보']
    skipped = 0
    for offset, item in enumerate(items):
        if not isinstance(item, dict):
            skipped += 1
            continue
        idx = start_idx + offset
        speaker = item.get('speaker', 'BJ 이슈왕')
        # 스키마 드리프트 허용: narration_ko(신규, 빈 문자열도 유효한 무음 구간) / voice_script / voice
        if item.get('narration_ko') is not None:
            text_content = item.get('narration_ko') or ''
        else:
            text_content = item.get('text') or item.get('voice_script') or item.get('voice') or ''
        subtitle_content = str(item.get('subtitle_ko') or '').strip()
        sfx_content = str(item.get('sfx') or '').strip()
        try:
            hold_sec = float(item.get('duration_sec') or 0)
        except (TypeError, ValueError):
            hold_sec = 0
        if isinstance(text_content, str):
            # Post-processing: Remove parentheses and content within them
            text_content = re.sub(r'\(.*?\)', '', text_content).strip()
        else:
            text_content = ''

        visual = item.get('visual') or {}
        if not isinstance(visual, dict):
            visual = {}
        # 스키마 드리프트 허용: visual_guide / visual_prompt / 평탄 키
        scene_keyword = (
            visual.get('keyword') or item.get('keyword') or 'news'
        )
        scene_description = apply_style_anchor(
            visual.get('description') or item.get('visual_guide')
            or item.get('visual_prompt') or item.get('description') or scene_keyword,
            style_anchor,
        )

        # 빈 대사는 장면으로 만들지 않음 (빈 껍데기 방지).
        # 단, allow_empty_text면 무음 홀드 장면으로 유지 (ASMR용, duration_sec 힌트 사용)
        if not text_content and not allow_empty_text:
            skipped += 1
            continue

        script_list.append({
            "scene_index": idx,
            "speaker": speaker,
            "text": text_content,
            "subtitle": subtitle_content,
            "sfx": sfx_content,
            "hold_sec": round(min(max(hold_sec, 1.0), 15.0), 1) if not text_content else 0,
        })

        # --- Timing Calculation (Improved: Match Frontend logic) ---
        gap_duration = 0.5
        if text_content:
            scene_duration = calculate_duration(text_content)
        else:
            scene_duration = min(max(hold_sec or default_hold_sec, 1.0), 15.0)

        if not isinstance(scene_keyword, str) or not scene_keyword.strip():
            scene_keyword = 'news'
        # blank-sign 오염 가드: keyword 자리에 들어간 이미지 지시어는 무효 처리
        if scene_keyword.strip().lower() in (
            'blank sign', 'blank signs', 'blank', 'no text', 'textless',
            'blank labels', 'no readable text',
        ):
            print(f"[Convert] Banned keyword dropped: {scene_keyword}")
            scene_keyword = ''
        if not isinstance(scene_description, str) or not scene_description.strip():
            scene_description = scene_keyword

        if any(fk in scene_keyword for fk in forbidden_keywords):
            scene_keyword = "관련 뉴스 배경 고화질"

        if any(fk in scene_description for fk in forbidden_keywords):
            scene_description = f"Cinematic documentary shot related to {scene_keyword}, realistic, 4k"

        scene = {
            "time_start": round(current_time, 1),
            "time_end": round(current_time + scene_duration, 1),
            "type": visual.get('type', 'ai_image'),
            "keyword": scene_keyword,
            "description": scene_description,
            "subtitle": subtitle_content,
            "sfx": sfx_content,
            "stock_query": (visual.get('stock_query') or item.get('stock_query') or ''),
            "filming_guide": (visual.get('filming_guide') or item.get('filming_guide') or ''),
            "mood": str(visual.get('mood') or '').strip()[:60],
            "data": visual.get('data', {})
        }
        scene_guide_list.append(scene)
        current_time += (scene_duration + gap_duration)
    if skipped:
        print(f"[Convert] Skipped {skipped} empty/invalid scenes.")
    return script_list, scene_guide_list, current_time


async def generate_full_package(article_text, api_key=None, selected_model=None, custom_instructions=None, duration=60, progress_callback=None, template_id="news_duo"):
    # [수정] 취소 확인용 로컬 함수 정의
    async def check_cancel():
        if progress_callback:
            # progress_callback 내부에서 cancel_requested 체크 및 예외 발생을 수행함
            await progress_callback(None, None) 

    if not api_key:
        config = load_config()
        api_key = config.get('gemini_api_key')

    if not api_key or api_key == "YOUR_GEMINI_API_KEY":
        raise ValueError("Gemini API Key is missing. Please set it in config/settings.yaml or pass it as an argument.")

    if progress_callback:
        await progress_callback(30, "Gemini AI 모델 구성을 확인하고 있습니다...")

    genai.configure(api_key=api_key)

    # 기본 모델 리스트 (사용자 요청에 따라 2.5 우선 순위)
    # 텍스트 모델 시도 순서: settings.yaml gemini_text_models 우선 (없으면 기본값)
    # 요금 기준 가성비 순 (2026-09 실측, 1M 토큰당 입력/출력 USD):
    # lite 0.30/2.50 < 3.7·3.8 0.75/3.75 < 3.6 1.50/7.50 < 3.5 1.50/9.00
    _cfg_models = (load_config().get('gemini_text_models') or [])
    _cfg_models = [m for m in _cfg_models if isinstance(m, str) and m.strip()]
    models_to_try = _cfg_models or [
        'gemini-3.5-flash-lite',
        'gemini-3.7-flash',
        'gemini-3.8-flash',
        'gemini-3.6-flash',
        'gemini-3.5-flash',
    ]

    # 사용자가 선택한 모델이 있으면 최우선으로 시도
    if selected_model:
        # 이미 리스트에 있다면 제거하고 맨 앞으로 이동
        if selected_model in models_to_try:
            models_to_try.remove(selected_model)
        models_to_try.insert(0, selected_model)

    errors = []

    # 템플릿 로드 (기본 캐릭터 지침은 템플릿이 제공, 사용자 입력이 우선)
    template = get_template(template_id)
    template_name = template["name"]
    instructions = custom_instructions if custom_instructions else template['instructions']

    role_intro = template['role_intro']
    example_speaker = template['example_speaker']
    example_text = template['example_text']
    visual_director = template.get('visual_director', '')
    _ex_vis = template.get('example_visual') or {}
    example_visual_keyword = _ex_vis.get('keyword', '')
    example_visual_description = _ex_vis.get('description', '')

    prompt = f"""
    [선택된 템플릿: {template_name}]
    [절대 엄수 지침: 기사 세계관 우선]
    당신의 사전 지식(현재 대통령 정보 등)을 완전히 무시하십시오.
    입력된 기사 내의 직함과 인물 관계만이 절대적 진실입니다.

    {role_intro}

    다음 기사를 바탕으로 대본 + 영상용 scene guide를 작성하세요.

    [영상 분량 조절 지침 - **최우선 준수**]
    - **목표 영상 분량: {duration}초**
    - **한국어 발화 속도 기준: 1초당 평균 3.5자(공백 제외, 문장 부호 포함)**
    - **최대 글자 수 제한: 약 {int(duration * 3.5)}자 (공백 제외 실질 글자수)**
    - AI는 대본을 생성하기 전, 기사 내용을 요약하여 위 글자 수 제한 내에 들어오도록 내용을 선별해야 합니다.
    - {duration}초가 60초면 핵심만, 180초면 조금 더 상세하게 작성하되, **절대 글자 수 제한을 초과하지 마세요.**
    - 각 장면(Scene) 사이의 약 0.5초~1초의 무음 간격을 고려하여 실제 대본 분량을 설정하세요.
    - 장면(Scene) 개수: **최소 {max(3, int(duration/12))}개 이상**, 최대 {max(5, int(duration/6))}개 내외로 구성하세요. **{max(3, int(duration/12))}개 미만은 분량 미달 실패작입니다.**
    - 씬 4~5개로 끝내지 마세요. 목표 분량({duration}초)을 채울 때까지 장면을 계속 추가하세요.
    - 너무 짧은 영상에 너무 많은 장면을 넣지 마세요. 각 장면은 최소 4초 이상의 대사를 가져야 합니다.
    - **경고**: 현재 대본이 너무 짧게 생성되는 문제가 있습니다. 목표 분량인 {duration}초를 최대한 채울 수 있도록 대본 양을 조절하세요.
    - {duration}초 목표 시, 대본 전체가 **최소 {int(duration * 3.0)}자 이상**이어야 합니다. 이보다 짧으면 분량 미달입니다.

    {instructions}

    [출력 형식]
    반드시 JSON만 출력.

    {{
      "storyboard": [
        {{
          "speaker": "{example_speaker}",
          "text": "{example_text}",
          "visual": {{
             "type": "ai_image",
             "keyword": "{example_visual_keyword}",
             "description": "{example_visual_description}",
             "mood": "warm and cozy"
          }}
        }}
      ],
      "fact_check": []
    }}

    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    [선택된 템플릿 전용 비주얼 디렉터 지침]
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    {visual_director}

    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    [장면 무드 지침 - 템플릿 공통]
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    각 storyboard 아이템의 visual에 "mood"를 영문 2~4단어로 적으세요.
    mood는 그 장면 대사의 감정(기쁨/긴장/슬픔/놀라움/평온 등)과 장면 내용에 맞춰 정하세요.
    예: "warm and cozy", "tense and urgent", "soft morning calm", "mysterious night".
    이 mood에 맞는 조명·팔레트로 이미지가 생성되므로 대사와 어긋나는 무드를 쓰지 마세요.

    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    [⛔ 절대 금지 규칙 - 행동 묘사 및 괄호 제거]
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    storyboard의 text에는 다음을 절대 포함하지 마세요:

    1. **괄호 () 및 괄호 안의 모든 내용 완전 금지**
       - (안경을 고쳐 쓰며) -> ❌ 삭제
       - (웃으며) -> ❌ 삭제
       - (한숨 쉬며) -> ❌ 삭제
       - (화난 표정으로) -> ❌ 삭제
       - (잠시 침묵) -> ❌ 삭제

    2. **설명문, 지문, 행동 지시 금지**
       - 오직 **TTS로 읽을 순수 대사(spoken words)**만 포함하세요.

    3. **문장 길이 제한**
       - 각 text는 **반드시 1문장 또는 최대 2문장**으로 짧게 끊으세요.
       - 호흡이 긴 문장은 쪼개서 새로운 scene으로 만드세요.

    ✅ 올바른 형식 예시:
    "네, BJ님. 실제 통계가 그렇습니다."

    ❌ 잘못된 형식 예시:
    "(안경을 고쳐 쓰며) 네, BJ님. 실제 통계가 그렇습니다."
    "네, 실제 통계가 그렇습니다. (자료 화면을 가리키며) 이 표를 보시죠."

    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    기사 내용:
    {article_text}
    """

    for model_name in models_to_try:
        try:
            print(f"Trying model: {model_name}...")
            if progress_callback:
                # 40% ~ 90% 사이의 진행률 표시
                progress_val = 40 + (models_to_try.index(model_name) * 10)
                if progress_val > 90: progress_val = 90
                await progress_callback(progress_val, f"AI가 대본과 장면 가이드를 생성 중입니다... (모델: {model_name})")

            model = genai.GenerativeModel(model_name)

            try:
                # [수정] 취소 확인용 콜백 전달 (progress_callback을 전달)
                response = await generate_with_retry(model, prompt, progress_callback=progress_callback)
            finally:
                pass

            text = response.text.strip()
            if text.startswith("```json"):
                text = text[7:]
            if text.endswith("```"):
                text = text[:-3]

            result_json = json.loads(text.strip())

            # --- Post-processing: Structure Conversion (Storyboard -> Script + Scene Guide) ---
            if 'storyboard' in result_json:
                script_list = []
                scene_guide_list = []
                current_time = 0

                # Assume average 5 seconds per segment
                # default_duration = 5

                for idx, item in enumerate(result_json['storyboard']):
                    # 1. Extract Script
                    speaker = item.get('speaker', 'BJ 이슈왕')
                    text_content = item.get('text', '')

                    # Post-processing: Remove parentheses and content within them
                    if text_content:
                        text_content = re.sub(r'\(.*?\)', '', text_content).strip()

                    script_list.append({
                        "scene_index": idx,
                        "speaker": speaker,
                        "text": text_content
                    })

                    # --- Timing Calculation (Improved: Match Frontend logic) ---
                    # 0.5s gap between scenes
                    gap_duration = 0.5
                    scene_duration = calculate_duration(text_content)

                    # 2. Extract Visual Scene
                    visual = item.get('visual', {})
                    scene_keyword = visual.get('keyword', 'news')

                    # --- Post-processing: Remove news graphics keywords ---
                    # 방송 UI 관련 키워드가 포함된 경우 템플릿에 맞는 배경으로 순화
                    forbidden_keywords = ['뉴스 속보', '그래픽', 'Ticker', 'Infographic', 'Breaking News', '속보']
                    _is_news_tpl = template_id in ("news_duo", "news_solo")
                    if any(fk in scene_keyword for fk in forbidden_keywords):
                        scene_keyword = "관련 뉴스 배경 고화질" if _is_news_tpl else "관련 배경 고화질"

                    scene_description = visual.get('description', scene_keyword)
                    if any(fk in scene_description for fk in forbidden_keywords):
                        _anchor = template.get('style_anchor', '')
                        scene_description = f"{_anchor}, {scene_keyword}".strip(' ,') if _anchor else scene_keyword
                    scene_description = apply_style_anchor(
                        scene_description, template.get('style_anchor', '')
                    )

                    scene = {
                        "time_start": round(current_time, 1),
                        "time_end": round(current_time + scene_duration, 1),
                        "type": visual.get('type', 'ai_image'),
                        "keyword": scene_keyword,
                        "description": scene_description,
                        "mood": str(visual.get('mood') or '').strip()[:60],
                        "data": visual.get('data', {})
                    }
                    scene_guide_list.append(scene)
                    current_time += (scene_duration + gap_duration)

                result_json['script'] = script_list
                result_json['scenes'] = scene_guide_list
                del result_json['storyboard'] # Clean up

                # 빈 껍데기 응답이면 다음 모델로 (빈 화면 방지)
                if not script_list:
                    raise ValueError('Model returned no valid scenes.')

                # --- 분량 검증 + 자동 확장: 목표 분량의 70% 미만이면 추가 장면 생성 ---
                for _extend_pass in range(2):
                    total_so_far = current_time
                    if total_so_far >= duration * 0.7:
                        break
                    if len(script_list) >= 40:
                        print(f"[Extend] Scene cap reached ({len(script_list)}). Stop extending.")
                        break
                    await check_cancel()
                    remaining = duration - total_so_far
                    needed = max(2, int(remaining // 12) + 1)
                    last_texts = "\n".join(
                        f"- {s.get('speaker')}: {s.get('text')}" for s in script_list[-3:]
                    )
                    extend_prompt = f"""
                    당신은 {template_name} 대본 작가입니다. {role_intro}
                    아래 기사에 대한 대본을 이미 {len(script_list)}개 장면(약 {total_so_far:.0f}초 분량)까지 작성했고,
                    목표 분량 {duration}초까지 약 {remaining:.0f}초가 부족합니다.
                    이어서 자연스럽게 계속되는 **추가 장면 {needed}개**를 작성하세요.
                    각 장면의 대사는 최소 4초 분량(한글 15자 이상)으로 쓰세요.
                    반드시 JSON만 출력 (storyboard 배열, 기존 장면 반복 금지):

                    {{{{
                      "storyboard": [
                        {{{{
                          "speaker": "{example_speaker}",
                          "text": "{example_text}",
                          "visual": {{{{
                             "type": "ai_image",
                             "keyword": "{example_visual_keyword}",
                             "description": "{example_visual_description}",
                             "mood": "warm and cozy"
                          }}}}
                        }}}}
                      ],
                      "fact_check": []
                    }}}}

                    [지침]
                    {instructions}

                    [비주얼 지침 (반드시 준수)]
                    {visual_director}
                    각 장면 visual.mood도 대사의 감정에 맞춰 영문 2~4단어로 적으세요.

                    [앞부분 마지막 3개 장면 (자연스럽게 이어가세요)]
                    {last_texts}

                    [기사 (이어서 다룰 남은 내용 중심)]
                    {article_text[:3000]}
                    """
                    try:
                        if progress_callback:
                            await progress_callback(85, f"분량 부족({total_so_far:.0f}초/{duration}초)으로 대본을 추가 생성 중입니다...")
                        ext_response = await generate_with_retry(model, extend_prompt, progress_callback=progress_callback)
                        ext_text = ext_response.text.strip()
                        if ext_text.startswith("```json"):
                            ext_text = ext_text[7:]
                        if ext_text.endswith("```"):
                            ext_text = ext_text[:-3]
                        ext_json = json.loads(ext_text.strip())
                        ext_items = ext_json.get('storyboard', [])
                        if not ext_items:
                            print("[Extend] No additional scenes returned. Stop extending.")
                            break
                        add_scripts, add_scenes, current_time = _convert_storyboard_items(
                            ext_items, len(script_list), current_time,
                            style_anchor=template.get('style_anchor', '')
                        )
                        script_list.extend(add_scripts)
                        scene_guide_list.extend(add_scenes)
                        result_json['script'] = script_list
                        result_json['scenes'] = scene_guide_list
                        if isinstance(ext_json.get('fact_check'), list) and ext_json['fact_check']:
                            result_json.setdefault('fact_check', []).extend(ext_json['fact_check'])
                        print(f"[Extend] Added {len(ext_items)} scenes. Total now {current_time:.1f}s / target {duration}s.")
                    except Exception as ext_e:
                        print(f"[Extend] Extension pass failed: {ext_e}")
                        break

            # --- Post-processing: Speaker Normalization ---
            if 'script' in result_json:
                for item in result_json['script']:
                    speaker = item.get('speaker', '').strip()

                    # 1. Normalize known variations
                    if '이슈왕' in speaker or 'BJ' in speaker.upper():
                        item['speaker'] = 'BJ 이슈왕'
                    elif '앵커' in speaker or 'Anchor' in speaker.title() or '박' in speaker:
                        item['speaker'] = '박 앵커'

                    # 2. Fallback for empty speaker (guess based on content)
                    # If empty, try to guess from tone (simple heuristic)
                    elif not speaker:
                        text_content = item.get('text', '')
                        if any(x in text_content for x in ['형님들', '가즈아', '대박', '미쳤다', '실화냐']):
                            item['speaker'] = 'BJ 이슈왕'
                        elif any(x in text_content for x in ['안녕하십니까', '전해드립니다', '보도합니다', '팩트']):
                            item['speaker'] = '박 앵커'
                        else:
                            # Default to BJ if still unknown (safer for casual content)
                            item['speaker'] = 'BJ 이슈왕' 

            # 분량 메타데이터 (요청 분량 대비 실제 분량)
            total_duration = 0.0
            if isinstance(result_json.get('scenes'), list) and result_json['scenes']:
                try:
                    total_duration = round(float(result_json['scenes'][-1].get('time_end', 0)), 1)
                except (TypeError, ValueError):
                    total_duration = 0.0
            result_json['total_duration'] = total_duration
            result_json['target_duration'] = duration
            if total_duration < duration * 0.7:
                result_json['warning'] = (
                    f"요청 {duration}초 중 약 {total_duration:.0f}초 분량만 생성되었습니다. "
                    "다시 생성을 눌러 보완하거나, 이어서 직접 대본을 추가하세요."
                )
                print(f"[Generate] Duration shortfall: {total_duration}s / target {duration}s")

            # Add usage metadata if available
            if hasattr(response, 'usage_metadata'):
                result_json['usage'] = {
                    'prompt_token_count': response.usage_metadata.prompt_token_count,
                    'candidates_token_count': response.usage_metadata.candidates_token_count,
                    'total_token_count': response.usage_metadata.total_token_count,
                    'model_name': model_name
                }
            else:
                result_json['usage'] = {'model_name': model_name}

            return result_json

        except Exception as e:
            print(f"Error with {model_name}: {e}")
            errors.append(f"{model_name}: {str(e)}")
            # Continue to next model

    print(f"All models failed. Errors: {errors}")
    # Return error dict instead of None to inform UI
    return {"error": f"All models failed. Details:\n" + "\n".join(errors)}

if __name__ == "__main__":
    # Test (API Key needed)
    pass
