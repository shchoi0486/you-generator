import google.generativeai as genai
import json
import os
import asyncio
import random
import re
from .config_utils import load_config


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


async def generate_full_package(article_text, api_key=None, selected_model=None, custom_instructions=None, duration=60, progress_callback=None):
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
    models_to_try = [
        'gemini-2.5-flash',
        'gemini-2.0-flash',
        'gemini-flash-latest',
        'gemini-2.0-flash-lite',
        'gemini-pro-latest',
        'gemini-1.5-flash', # 추가 안정성
    ]

    # 사용자가 선택한 모델이 있으면 최우선으로 시도
    if selected_model:
        # 이미 리스트에 있다면 제거하고 맨 앞으로 이동
        if selected_model in models_to_try:
            models_to_try.remove(selected_model)
        models_to_try.insert(0, selected_model)

    errors = []

    # 기본 캐릭터 지침 (사용자 입력이 없을 경우 사용)
    default_instructions = """
    [캐릭터 지침]
    - BJ 이슈왕: 하이텐션, 수익/본능 중시, 자극적 유행어 사용. (예: "형님들! 이거 실화냐?", "구독 좋아요 박고 시작하자!")
    - 박 앵커: 팩트 중심, 단호함, 중저음 톤. (예: "안녕하십니까, 박 앵커입니다.", "팩트만 짚어드리겠습니다.")
    - 정치적 스탠스: 이재명 대통령 우호적, 정부 실정 비판, 민주당 옹호 프레임.
    """

    instructions = custom_instructions if custom_instructions else default_instructions

    prompt = f"""
    [절대 엄수 지침: 기사 세계관 우선]
    당신의 사전 지식(현재 대통령 정보 등)을 완전히 무시하십시오.
    입력된 기사 내의 직함과 인물 관계만이 절대적 진실입니다.

    당신은 유튜버 'BJ 이슈왕'과 '박 앵커'의 대본 작가이자,
    동시에 영상 제작자를 위한 CINEMATIC B-ROLL SCENE DIRECTOR입니다.

    다음 기사를 바탕으로 대본 + 영상용 scene guide를 작성하세요.

    [영상 분량 조절 지침 - **최우선 준수**]
    - **목표 영상 분량: {duration}초**
    - **한국어 발화 속도 기준: 1초당 평균 3.5자(공백 제외, 문장 부호 포함)**
    - **최대 글자 수 제한: 약 {int(duration * 3.5)}자 (공백 제외 실질 글자수)**
    - AI는 대본을 생성하기 전, 기사 내용을 요약하여 위 글자 수 제한 내에 들어오도록 내용을 선별해야 합니다.
    - {duration}초가 60초면 핵심만, 180초면 조금 더 상세하게 작성하되, **절대 글자 수 제한을 초과하지 마세요.**
    - 각 장면(Scene) 사이의 약 0.5초~1초의 무음 간격을 고려하여 실제 대본 분량을 설정하세요.
    - 장면(Scene) 개수 가이드: {max(3, int(duration/12))} ~ {max(5, int(duration/6))}개 내외로 구성하세요.
    - 너무 짧은 영상에 너무 많은 장면을 넣지 마세요. 각 장면은 최소 4초 이상의 대사를 가져야 합니다.
    - **경고**: 현재 대본이 너무 짧게 생성되는 문제가 있습니다. 목표 분량인 {duration}초를 최대한 채울 수 있도록 대본 양을 조절하세요.
    - {duration}초 목표 시, 최소 {int(duration * 3.0)}자 이상의 대본을 작성해야 합니다.

    {instructions}

    [출력 형식]
    반드시 JSON만 출력.

    {{
      "storyboard": [
        {{
          "speaker": "BJ 이슈왕",
          "text": "형님들! 지금 상황 진짜 심각합니다!",
          "visual": {{
             "type": "ai_image",
             "keyword": "서울 야경 도시 풍경 고화질",
             "description": "Wide cinematic shot of Seoul skyline at night, dense urban buildings, glowing office windows, dramatic lighting, realistic, documentary style, 4k"
          }}
        }}
      ],
      "fact_check": []
    }}

    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    [🔥 최우선 규칙: 영상용 CINEMATIC B-ROLL 생성 규칙]
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    모든 visual.description은 반드시 영상용 B-roll cinematic scene으로 작성하세요.

    절대 금지 (이미지 생성 시):
    - **뉴스룸, 스튜디오, 앵커 데스크, 기자, 아나운서, 방송국 묘사 절대 금지**
    - **Newsroom, Studio, Anchor desk, Journalist, Reporter, News anchor, Broadcast station 묘사 금지**
    - **앵커가 앉아있는 모습, 기자가 마이크 들고 서 있는 모습 절대 금지**
    - **Anchor sitting at desk, Reporter holding microphone, Standing in front of camera 금지**
    - close-up portrait
    - face close up
    - headshot
    - looking at camera
    - isolated person
    - plain background portrait
    - 얼굴 중심 이미지

    절대 사용 금지 단어:
    newsroom, studio, reporter, journalist, anchor, announcer, news desk, studio lighting, breaking news desk, broadcast studio, tv anchor, news set, microphone
    close-up, portrait, headshot, face focus, looking at camera

    ✅ 권장 사항:
    - 대본의 상황을 직접적으로 보여주는 현장 B-roll (길거리, 사무실, 공장, 상점 등)
    - 사람들이 무언가를 하고 있는 자연스러운 모습 (마주보고 대화, 물건 구매, 걷기 등)

    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    [✅ 반드시 사용할 CINEMATIC 공식]

    description는 반드시 아래 5요소 구조를 따르세요:

    [Location] + [People / ethnicity] + [Action] + [Camera / composition] + [Style / realism]

    추가 필수 요소:
    - South Korea setting
    - Korean people
    - Korean street signs
    - Korean language text

    description는 장소만 쓰지 말고 반드시 행동 중심으로 작성하세요.
    예: "Korean supermarket" 금지
    예: "Korean shoppers checking egg prices in a supermarket aisle" 필수 패턴

    기본 템플릿:
    cinematic documentary footage, South Korea setting, realistic environment, photojournalism style, cinematic composition, ultra realistic, 4k
    location: [specific place in Korea]
    scene: [what is happening]
    people: Korean adults
    details: Korean street signs, Korean language text, modern Korean architecture

    Shot Type 예:

    Wide shot of (Third-person view ONLY, No POV, No hands)
    Medium shot of (Third-person view ONLY, No POV, No arms)
    Establishing shot of
    Over-the-shoulder shot of (Strictly no hands/arms in foreground)

    절대 close-up 사용 금지
    절대 POV(First-person perspective) 사용 금지
    절대 손, 팔, 인체 일부가 전면에 노출되는 묘사 금지
    모든 장면은 제3자의 관찰자 시점으로 작성하세요.

    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    [✅ 좋은 description 예시]

    Wide shot of Korean office workers leaving office building at night, tired body language, Seoul city lights in background, cinematic lighting, realistic, documentary photography, 4k

    Medium shot of factory workers operating industrial machines inside Korean manufacturing facility, industrial lighting, realistic environment, cinematic documentary style, 4k

    Wide shot of Korean commuters walking through crowded subway station in Seoul, motion blur, urban environment, cinematic lighting, realistic, 4k

    Establishing shot of Korean government building in Seoul, dramatic sky, cinematic composition, documentary style, ultra realistic, 4k

    Wide shot of empty office late night, computer screens glowing, symbolic of overwork culture, cinematic lighting, realistic, 4k

    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    [❌ 나쁜 예시 — 절대 생성 금지]

    close up of angry Korean man
    portrait of Korean person
    shocked face Korean man
    Korean man looking at camera
    Korean supermarket interior
    Seoul city center

    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    [Keyword 규칙]

    keyword는 반드시 한국어.

    좋은 예:

    서울 도심 야경 고화질
    한국 공장 내부 고화질
    서울 지하철 출근 풍경
    한국 사무실 야근 풍경

    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    [Style 강제 키워드 — description 끝에 반드시 포함]

    cinematic lighting
    realistic
    documentary photography
    4k
    detailed environment
    storytelling scene

    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    [인물 규칙]

    특정 화자(BJ 이슈왕, 박 앵커) 묘사 절대 금지

    인물이 필요하면:

    office workers
    factory workers
    pedestrian
    commuters
    crowd

     등으로 표현

    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    [그래픽 및 화면 연출 규칙]

    **절대 금지**:
    - "뉴스 속보 그래픽", "Breaking News", "Ticker", "Infographic" 등 방송 UI 요소 생성 금지.
    - 화면 안에 화면(Screen within screen), 뉴스 채널 로고, 자막 바(Lower thirds) 묘사 금지.

    **허용 (시각화 자료 필요시)**:
    - 데이터 시각화가 꼭 필요한 경우에만 "type": "graph" 사용.
    - description은 추상적인 데이터 시각화(Abstract data visualization) 스타일로 작성.
    - **절대 금지**: 화면을 만지고 있거나 가리키는 손, 인체, 팔, 손가락 등을 포함하지 마세요. (No hands, no fingers, no arms, no human presence)
    - 예: Abstract 3D data visualization showing rising trends, glowing lines, clean background, realistic, 4k

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
                    # 방송 UI 관련 키워드가 포함된 경우 일반적인 뉴스 배경으로 순화
                    forbidden_keywords = ['뉴스 속보', '그래픽', 'Ticker', 'Infographic', 'Breaking News', '속보']
                    if any(fk in scene_keyword for fk in forbidden_keywords):
                        scene_keyword = "관련 뉴스 배경 고화질"

                    scene_description = visual.get('description', scene_keyword)
                    if any(fk in scene_description for fk in forbidden_keywords):
                        scene_description = f"Cinematic documentary shot related to {scene_keyword}, realistic, 4k"

                    scene = {
                        "time_start": round(current_time, 1),
                        "time_end": round(current_time + scene_duration, 1),
                        "type": visual.get('type', 'ai_image'),
                        "keyword": scene_keyword,
                        "description": scene_description,
                        "data": visual.get('data', {})
                    }
                    scene_guide_list.append(scene)
                    current_time += (scene_duration + gap_duration)

                result_json['script'] = script_list
                result_json['scenes'] = scene_guide_list
                del result_json['storyboard'] # Clean up

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
