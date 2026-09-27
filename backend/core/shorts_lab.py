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
from typing import Any, Dict

try:
    from .llm import configure as _llm_configure, get_model as _llm_model
except (ImportError, ValueError):
    from llm import configure as _llm_configure, get_model as _llm_model

try:
    from .config_utils import load_config, get_asset_dir
except (ImportError, ValueError):
    from config_utils import load_config, get_asset_dir

try:
    from .generator import _convert_storyboard_items
    from .generator import MIN_DURATION_RATIO as _MIN_RATIO
    from .generator import MAX_DURATION_RATIO as _MAX_RATIO
except (ImportError, ValueError):
    from generator import _convert_storyboard_items
    from generator import MIN_DURATION_RATIO as _MIN_RATIO
    from generator import MAX_DURATION_RATIO as _MAX_RATIO
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


def _llm_chain():
    """providers.yaml 의 llm 폴백 체인 (레지스트리가 단일 출처).

    예전엔 settings.yaml 의 gemini_text_models 에서 이름 하나를 고르고
    Gemini SDK 로 직접 불렀다. 그래서 DeepSeek/Qwen 을 쓸 수 없었다.
    이제 순서·어댑터·키 해석을 레지스트리에 맡긴다.
    """
    from .provider_registry import registry
    return registry.order_for("llm", "free")


def _llm_run(prompt, *, images=None, json_mode=False, system="",
             max_output_tokens=None, temperature=None):
    """폴백 체인을 타고 생성한다. json_mode 이면 파싱까지 해 준다."""
    from . import llm_providers
    return llm_providers.generate_chain(
        _llm_chain(), prompt, system=system, images=images,
        json_mode=json_mode, max_output_tokens=max_output_tokens,
        temperature=temperature, parse_json=json_mode,
    )


def _llm_run_text(prompt, *, images=None, system="", max_output_tokens=None):
    """텍스트만 필요한 경우(파싱 없음)."""
    from . import llm_providers
    return llm_providers.generate_chain(
        _llm_chain(), prompt, system=system, images=images,
        max_output_tokens=max_output_tokens,
    )


def _analysis_model():
    """하위 호환: 첫 번째 사용 가능한 LLM 의 model_id."""
    try:
        from .provider_registry import registry
        for p in _llm_chain():
            if p.get("enabled") and registry.usable(p):
                return p.get("model_id") or p["id"]
    except Exception:
        pass
    return ANALYSIS_MODEL_FALLBACK


def _workhorse_model():
    """하위 호환: 'lite' 가 아닌 첫 번째 사용 가능한 LLM 의 model_id."""
    try:
        from .provider_registry import registry
        for p in _llm_chain():
            if not (p.get("enabled") and registry.usable(p)):
                continue
            mid = p.get("model_id") or p["id"]
            if "lite" not in str(mid).lower():
                return mid
    except Exception:
        pass
    return _analysis_model()


def _get_api_key():
    config = load_config()
    from . import key_store
    api_key = key_store.resolve_key("gemini_api_key", config,
                                    env="GEMINI_API_KEY")
    if not api_key or api_key == "YOUR_GEMINI_API_KEY":
        raise ValueError(
            "Gemini API 키가 없습니다. 앱의 'API 키' 화면에서 등록하세요.")
    return api_key, config


def _strip_fences(t):
    """코드펜스/설명 텍스트를 걷어내고 가장 바깥 JSON 블록만 뽑는다."""
    t = (t or "").strip()
    if not t:
        return ""
    # ```json ... ``` 또는 ``` ... ```
    if "```" in t:
        import re as _re_f
        m = _re_f.search(r"```(?:json)?\s*(.*?)```", t, _re_f.S)
        if m:
            t = m.group(1)
    t = t.strip()
    # 설명이 앞/뒤에 붙으면 첫 '{' ~ 마지막 '}' 사이만 본다.
    a = t.find("{")
    b = t.rfind("}")
    if a != -1 and b > a:
        t = t[a:b + 1]
    return t.strip()


def _repair_json_text(t):
    """LLM이 자주 틀리는 JSON 문법을 순서대로 고친다(원본 훼손 없음)."""
    import re as _re_r
    prev = None
    while prev != t:
        prev = t
        # 트레일링 콤마: {"a":1,} / [1,2,]
        t = _re_r.sub(r",\s*([}\]])", r"\1", t)
        # 문자열 바깥의 스마트 따옴표 → 일반 따옴표
        t = t.replace("\u201c", '"').replace("\u201d", '"').replace("\u2018", "'").replace("\u2019", "'")
    # 파이썬 리터럴 → JSON
    t = _re_r.sub(r"\bNone\b", "null", t)
    t = _re_r.sub(r"\bTrue\b", "true", t)
    t = _re_r.sub(r"\bFalse\b", "false", t)
    # 따옴표 없는 키: {section: "HOOK"} → {"section": "HOOK"}
    t = _re_r.sub(r'([{,\[]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:', r'\1"\2":', t)
    # 문자열 내부의 실제 개행 → \n (JSON에서 제어문자는 무효)
    def _fix_ctrl(m):
        body = m.group(1).replace("\r", "").replace("\n", "\\n").replace("\t", "\\t")
        return '"' + body + '"'
    t = _re_r.sub(r'"((?:[^"\\]|\\.)*)"', _fix_ctrl, t, flags=_re_r.S)
    return t


def _parse_json_response(text):
    """엄격 json.loads 1회 → 코드펜스 제거 → 다층 수리 순으로 시도."""
    raw = _strip_fences(text)
    try:
        return json.loads(raw)
    except Exception:
        pass
    for fixer in (lambda s: s, _repair_json_text):
        cand = fixer(raw)
        try:
            return json.loads(cand)
        except Exception as e:
            last = e
    # 마지막 resort: 오류 위치 주변을 로그로 남겨 원인을 볼 수 있게 한다.
    try:
        json.loads(_repair_json_text(raw))
    except Exception as e:
        pos = getattr(e, "pos", None)
        if isinstance(pos, int):
            ctx = raw[max(0, pos - 120):pos + 120]
            print(f"[Shorts JSON] 최종 파싱 실패: {e}")
            print(f"[Shorts JSON] 문제가 있던 구간: ...{ctx}...")
    raise ValueError(f"JSON 파싱 실패 (응답 길이 {len(raw)}자)")


# 재시도해도 소용없는 모델 오류. 이건 '파싱 실패'가 아니라 사용자에게
# 즉시 알려야 하는 설정/계정 문제다. (실측: 429 할당량 소진이 3회 재시도 후
# '모델 응답 파싱 실패'로 표시돼 원인을 알 수 없었다)
_FATAL_MODEL_MARKERS = (
    "RESOURCE_EXHAUSTED", "429",
    "PERMISSION_DENIED", "403",
    "INVALID_API_KEY", "API_KEY_INVALID", "APIKEYINVALID",
    "UNAUTHENTICATED", "401",
    "BILLING", "QUOTA",
)


def _is_fatal_model_error(err):
    """할당량/인증/과금 같은 재시도 무의미한 오류인지.

    문자열 매칭은 라이브러리 예외 문자열이 바뀔 때 놓친다(실측: 'API_KEY_INVALID'
    가 'API key not valid' 형태와 달라 두 번째 검사에서 놓쳤다). 그래서 예외
    클래스 이름과 HTTP 상태 코드를 먼저 본다.
    """
    # 1) 예외 클래스 이름. '_'와 '.'을 빼고 대문자로 맞춘다.
    # google.genai 는 API_KEY_INVALID / RESOURCE_EXHAUSTED 같은 이름을 쓴다(실측).
    cls = re.sub(r"[^A-Z0-9]", "", type(err).__name__.upper())
    if any(k in cls for k in ("RESOURCEEXHAUSTED", "CLIENTERROR", "PERMISSIONDENIED",
                              "UNAUTHENTICATED", "INVALIDAPIKEY", "APIKEYINVALID")):
        return True
    # 2) 상태 코드
    code = getattr(err, "code", None) or getattr(err, "status_code", None)
    try:
        if code is not None and int(code) in (401, 402, 403, 429):
            return True
    except (TypeError, ValueError):
        pass
    # 3) 메시지. 라이브러리가 'API_KEY_INVALID'처럼 쓰기도 하고
    # 'API key not valid'처럼 공백을 넣어 쓰기도 한다(실측 둘 다 실제로 나옴).
    s_raw = str(err)
    s = s_raw.upper()
    if any(m in s for m in _FATAL_MODEL_MARKERS):
        return True
    return "API KEY NOT VALID" in s or "API KEY IS NOT VALID" in s


class _FatalModelError(Exception):
    """재시도하지 않고 사용자에게 그대로 알릴 오류."""


# 위 판정기가 참이면 raise를 그대로 통과시킨다(재시도 루프 위에서 except).
_FATAL_MODEL_ERRORS = (_FatalModelError,)


def _raise_fatal_model_error(err):
    """모델 오류를 사람이 읽을 한국어 메시지로 바꿔 올린다."""
    s = str(err)
    up = s.upper()
    code = None
    try:
        code = int(getattr(err, "code", None) or getattr(err, "status_code", None) or 0)
    except (TypeError, ValueError):
        code = None
    if code == 429 or "RESOURCE_EXHAUSTED" in up or "429" in up or "QUOTA" in up:
        detail = ""
        for key in ("quota", "billing"):
            i = up.find(key.upper())
            if i >= 0:
                detail = s[i: i + 160]
                break
        msg = (
            "AI 모델 호출 한도(quota)를 초과했습니다. 이건 대본 문제가 아니라 "
            "결제/할량 문제입니다. 사용한 모델의 과금 상태를 확인하거나 "
            "settings.yaml 의 텍스트 모델을 더 저렴한 모델로 바꾸세요."
        )
        if detail:
            msg += f"\n(원본: {detail})"
        raise _FatalModelError(msg)
    if (code in (401, 403)
            or any(k in up for k in ("API KEY NOT VALID", "API KEY IS NOT VALID",
                                     "INVALID_API_KEY", "APIKEYINVALID", "INVALID KEY"))
            or "401" in up):
        if "PERMISSION" in up or "403" in up:
            raise _FatalModelError(
                "AI 모델 접근이 거부됐습니다(403). 키에 해당 모델 권한이 있는지 확인하세요."
            )
        raise _FatalModelError(
            "AI 모델 API 키가 올바르지 않습니다. settings.yaml 의 키를 확인하세요."
        )
    if "PERMISSION_DENIED" in up or "403" in up:
        raise _FatalModelError(
            "AI 모델 접근이 거부됐습니다(403). 키에 해당 모델 권한이 있는지 확인하세요."
        )
    raise _FatalModelError(s[:300])


# storyboard 아이템으로 인정하는 키. 이 중 하나도 없으면 스키마 위반으로 재시도.
_KNOWN_ITEM_KEYS = ("narration_ko", "text", "voice_script", "voice", "subtitle_ko")

# _convert_storyboard_items가 실제로 읽는 대사 키 순서(generator.py:201-204와 동일).
_NARRATION_KEYS = ("narration_ko", "text", "voice_script", "voice")


def _narration_key(item):
    """이 스토리보드 아이템이 대사를 담는 키를 돌려준다.

    후처리가 대사를 고칠 때 무조건 `narration_ko`에 쓰면 안 된다. 모델이 옛
    스키마(text/voice_script)로 답한 경우, conversion은 `narration_ko is not None`을
    먼저 보기 때문에 새로 만든 키가 원본 대사를 덮어써 버린다(실측: text 스키마
    3개 장면 중 1개가 통째로 소실).
    """
    for k in _NARRATION_KEYS:
        if item.get(k) is not None:
            return k
    return "narration_ko"


# 화자가 비었을 때 카테고리별로 채울 값. 'BJ 이슈왕' 은 뉴스 1인 브리핑 전용이다
# (사용자 지정). 레시피/제품/여행/지식에 붙으면 잘못된 화자로 보인다.
_NEWS_CATEGORIES = {"news", "news_solo", "news_duo"}


def _speaker_for(category: str) -> str:
    if (category or "").strip() in _NEWS_CATEGORIES:
        return "BJ 이슈왕"
    return "나레이터"


def _clean_aside(text: str) -> str:
    """독백에서 대괄호와 끝의 말줄임을 벗겨낸다.

    왜 필요한가
        대괄호는 '화면 전용 지문' 이라는 프롬프트 규약일 뿐이다. 그런데 자막에
        그대로 실려서 '[이거 안 태우면 어떡하지...]' 가 화면에 찍혔다(실측).
        시청자에게 대괄호는 버그처럼 보이고, 끝의 '...' 는 자막이 잘린 것처럼 보인다.
    """
    s = re.sub(r'[\[\]【】]', '', str(text or '')).strip()
    s = re.sub(r'\.{2,}\s*$', '', s)          # 끝의 ... 제거
    s = re.sub(r'\.{3,}', '…', s)             # 가운데의 ... 은 말줄임표로
    return s.strip()


def _add_aside(item: Dict[str, Any], aside: str) -> bool:
    """독백을 '상단 자막 전용' 으로 기록한다. 대괄호는 벗겨서 넣는다.

    subtitle_ko(하단 자막·TTS)를 건드리지 않는다. 건드리면 독백이 하단과 상단에
    두 번 보이고, TTS 가 화면 전용 지문을 읽게 된다(실측).
    """
    clean = _clean_aside(aside)
    if not clean:
        return False
    if clean in str(item.get('aside_ko') or ''):
        return False
    item['aside_ko'] = clean
    return True


def _narration_of(item):
    """대사 문자열. 키가 무엇이든 같은 값을 읽는다."""
    for k in _NARRATION_KEYS:
        v = item.get(k)
        if v is not None:
            return str(v)
    return ""


def _set_narration(item, text):
    """대사를 원래 키에 그대로 쓴다(스키마 유지)."""
    item[_narration_key(item)] = text



def _call_storyboard_json(prompt, what="대본", max_attempts=3):
    """LLM 호출 + JSON 파싱 + 스키마 검증.

    재시도마다 출력 크기를 줄여 실제로 성공률을 올린다.
    - 1회차: 원본 프롬프트
    - 2회차: 'JSON만' 재강조
    - 3회차: 장면 수를 강제로 줄여 JSON이 작아지도록 유도
      (파싱 실패는 대체로 큰 storyboard 배열의 문법 오류에서 난다)
    """
    last_err = ""
    for attempt in range(max_attempts):
        try:
            p = prompt
            if attempt == 1:
                p = prompt + "\n반드시 유효한 JSON만 출력하라. 키 이름은 예시와 정확히 같아야 한다. 설명·마크다운 금지."
            elif attempt >= 2:
                p = (prompt + "\n반드시 유효한 JSON만 출력하라. 설명·마크다운 금지."
                     "\n문법 오류가 났다. 마지막 콤마(,)를 절대 쓰지 말고 모든 문자열에 큰따옴표를 붙여라."
                     "\n이번엔 장면을 최대한 적게(3개 이내) 써서 JSON을 짧게 만들어라.")
            result_json = _llm_run(p, json_mode=True)
            items = result_json.get("storyboard", []) or []
            usable = [it for it in items if isinstance(it, dict) and any(k in it for k in _KNOWN_ITEM_KEYS)]
            if usable:
                if len(usable) < len(items):
                    print(f"[Shorts] Dropped {len(items) - len(usable)} unknown-schema scenes.")
                result_json["storyboard"] = usable
                return result_json
            last_err = "usable 장면 0개 (스키마 위반)"
            print(f"[Shorts] {what} {attempt + 1}회차: {last_err}")
        except _FATAL_MODEL_ERRORS:
            # 이미 사람이 읽을 메시지로 바뀌었다. 그대로 올린다.
            raise
        except Exception as e:
            if _is_fatal_model_error(e):
                _raise_fatal_model_error(e)
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
    "style_analysis": {
      "hook_style": "도발형",
      "cta_style": "저장 유도",
      "tone_style": "전문가 단언",
      "ending_ratio": "어미별 비율",
      "sentence_patterns": ["넣어 주고", "볶다가", "끓이다가 마무리해 주면"],
      "honorific": true,
      "ending_style": "높임말 존댓말(-요 체)",
      "pacing": "빠름"
    },
  "storyboard": [
    {
      "speaker": "나레이터",
      "text": "이 장면 길이만큼 말이 채워지도록 작성",
      "visual": {"type": "ai_image", "keyword": "한국어 키워드", "description": "English cinematic B-roll prompt"}
    }
  ]
}

스타일 분석 기준:
- hook_style: 첫 문장 유형. 질문형/도발형/공감형/숫자형/반전형/인사형/후회형 중 선택.
  * '후회형' = '이거 왜 이제 먹었지' 식의 진심 어린 후회. 예: '저 진짜 맛있는 걸 왜 이제 먹었나 후회했습니다'
- cta_style: 마지막 문장 유형. 저장 유도/댓글 유도/구독 유도/팔로우 유도/감정 유도/시청자 질문 중 선택.
  * '감정 유도' = 완성 후 친근한 반응으로 끝남. 예: '많이 먹어', '어때?', '극락입니다'
  * '시청자 질문' = 구독자/덧댓글로 값을 물음. 예: '구독자님이 알려주셨는데'
- tone_style: 전체 톤. 아래 10개 중 하나를 고르되 반드시 'ending_ratio'로 근거를 댄다.
  1) 담백 1인칭   : 반말체, 짧은 구어 리듬
  2) MZ 직설      : 단문 위주 쿨한 반말, 종결어미 없음
  3) 감각 묘사     : 오감(소리/질감) 묘사 우선
  4) 실패 회고     : 1인칭 과거형, 후회 뉘앙스
  5) 전문가 단언   : 셰프 관점 단언
  6) 자조 개그 반말: 자기 비하·친근한 농담이 섞인 반말. 예: '최소는 형이 먹으세요'
  7) 낭독 존댓말  : '~습니다'와 '~요'가 섞인 읽어주기 톤. 예: '물기 닦아 넣어 줍니다/끝이고요'
  8) 추억 회상     : '~거든요/~죠/~이에요'가 섞인 친근한 톤. 예: '어렸을 때 즐겨 먹었거든요'
  9) 지시 혼용 조리: '~해 줍니다/변해 줍니다'이 다수. 도구·불·시간을 명시하는 매뉴얼식
  10) 브금 개그    : 짧은 '~해요' 구어체 + 대괄호 독백 개그가 교차. 예: '[보금자리로 이사해줬어요]'
  * 7~10은 서로 다른 채널의 실제 예시에서 갈라낸 축이다. "친근 조리 나레이션"처럼
    뭉뚱그리는 이름은 쓰지 말고, 어미를 세어 가장 큰 축을 고른다.
- ending_ratio: 어미별 등장 비율. 반드시 채워라. 예: '있습니다 15%, 준비해 주세요 15%, 하겠습니다 15%,
  묻혀줍니다/볶아줍니다 40%, 끝입니다 15%'. 이 비율이 tone_style을 결정하는 근거다.
- sentence_patterns: 이 대본에서 반복 쓰인 어미/연결 표현 2~3개. 문장 전체가 아니라
  그대로 재사용할 수 있는 조각으로 뽑는다. 괄호 채움(예: '(재료) 투척')도 재사용 가능하므로 포함한다.
- honorific: 높임말 존댓말을 쓰면 true, 반말이면 false.
- ending_style: 문말 어미 계열. 예: '높임말 존댓말(-요 체)' 또는 '반말(~한다/~다 체)'.
- pacing: 전개 속도. 빠름/보통/느림 중 선택.
- density_note: 대사 밀도 특이점 (예: '재료와 양념을 한 문장에 몰아넣음').

[중요] 대본 길이는 위에서 세지 마라. '1~2문장' 같은 고정 틀을 쓰지 마라.
storyboard[].text 길이는 이 영상이 실제로 그 밀도로 말하는 것을 흉내내야 한다.
아래 speech_density는 코드가 자막 타임스탬프로 직접 계산한 실측값이다(추정 아님).
narration 길이 규칙은 이 값을 따르되, 글자수만 맞추려고 의미 없는 문장을 늘리지 마라.
"""


def analyze_upload(file_bytes, mime_type, hint=""):
    """업로드된 이미지/영상을 분석해 리포트 + 바로 쓸 대본(storyboard) 반환."""
    if mime_type not in ALLOWED_UPLOAD_MIMES:
        raise ValueError(f"Unsupported file type: {mime_type}")
    if not file_bytes or len(file_bytes) > MAX_UPLOAD_BYTES:
        raise ValueError("File is empty or exceeds 100MB.")

    _get_api_key()   # 키가 하나라도 있어야 폴백 체인이 동작한다
    is_video = mime_type.startswith("video/")
    kind = "숏폼 영상" if is_video else "이미지"
    prompt = f"""
    이 {kind}은(는) 바이럴 숏폼/릴스 레퍼런스이다. {'사용자 힌트: ' + hint if hint else ''}
    영상 내 음성은 받아쓰고, 장면 변화·자막·구도를 분석한 뒤,
    Hook Summary, Content Pattern(도입→전개→연결→CTA), 반응 이유, 해시태그를 추출하라.
    마지막으로 이 레퍼런스를 그대로 재현할 수 있는 대본(storyboard, 대사 1~2문장씩)도 함께 작성하라.
    {ANALYSIS_JSON_SPEC}
    """
    result = _llm_run(prompt, images=[file_bytes], json_mode=True)
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


def _snippets_to_segments(chunks):
    """youtube_transcript_api 조각 → (text, start, duration) 리스트로 정규화.

    v1.x 새 API는 dataclass(snippet), 0.x 구 API는 dict를 주므로 둘 다 처리한다.
    getattr 기본값 인자는 항상 평가되므로 getattr를 두 번 쓰지 않는다.
    """
    out = []
    for c in chunks:
        if hasattr(c, "text"):
            text = getattr(c, "text", "") or ""
            start = getattr(c, "start", None)
            dur = getattr(c, "duration", None)
        elif hasattr(c, "get"):
            text = c.get("text", "") or ""
            start = c.get("start")
            dur = c.get("duration")
        else:
            continue
        out.append((str(text), start, dur))
    return out


def measure_speech_density(segments):
    """실측 말하기 밀도. LLM 추정 금지 — 자막 타임스탬프로 코드에서 계산한다.

    segments: [(text, start, duration), ...]

    반환: {chars_per_sec, avg_chars_per_sentence, speech_sec, char_count, source}
    못 재면 reason을 담아 반환한다(숫자를 지어내지 않는다).
    """
    empty = {
        "chars_per_sec": None, "avg_chars_per_sentence": None,
        "speech_sec": 0.0, "char_count": 0, "source": "unmeasured",
        "reason": "타임스탬프 자막 없음",
    }
    if not segments:
        return empty

    timed = [(t, s, d) for (t, s, d) in segments
             if t and t.strip() and isinstance(s, (int, float))]
    if len(timed) < 3:
        return dict(empty, reason=f"타임 있는 자막 {len(timed)}개로 부족(최소 3개)")

    # 발화 구간은 자막 시작~끝. 겹치는 구간은 합치지 않고 합산하되,
    # 전체 길이는 실제 재생 구간(first_start ~ last_end) 기준이 신뢰도 높다.
    first = min(s for _, s, _ in timed)
    last = max(s + (d if isinstance(d, (int, float)) else 0) for _, s, d in timed)
    speech_sec = float(last - first)
    if speech_sec <= 0:
        return dict(empty, reason="자막 구간 길이 0")

    text = " ".join(t for t, _, _ in timed)
    # 공백 제외 글자 수 = TTS가 실제로 소리를 내는 양에 가장 가깝다.
    chars = len(re.sub(r"\s+", "", text))
    if chars <= 0:
        return dict(empty, reason="자막에 글자 없음")

    cps = round(chars / speech_sec, 2)

    # 문장당 평균: 종결어미로 끊어 센다. 마침표가 아예 없으면 조각당 평균으로 대체.
    sents = [s for s in re.split(r"[.!?。！？]+\s*", text) if s.strip()]
    if len(sents) >= 2:
        avg_sent = round(sum(len(re.sub(r"\s+", "", s)) for s in sents) / len(sents), 1)
    else:
        avg_sent = round(chars / len(timed), 1)

    return {
        "chars_per_sec": cps,
        "avg_chars_per_sentence": avg_sent,
        "speech_sec": round(speech_sec, 1),
        "char_count": chars,
        "sentence_count": len(sents),
        "source": "measured",
    }


def fetch_transcript(video_id):
    """자막(대본) 수집 + 타임스탬프. 실패/없음이어도 예외가 아니다.

    반환: (전체 자막 문자열, segments)
    segments = [(text, start, duration), ...] — measure_speech_density() 입력.
    예전처럼 문자열만 내면 초당 글자수를 실측할 수 없어 밀도 기준이 추측이 된다.
    """
    empty = ("", [])
    try:
        from youtube_transcript_api import YouTubeTranscriptApi
        try:  # v1.x 신 API
            fetched = YouTubeTranscriptApi().fetch(video_id, languages=["ko", "en"])
            chunks = fetched.snippets if hasattr(fetched, "snippets") else fetched
            segs = _snippets_to_segments(chunks)
            if segs:
                return " ".join(t for t, _, _ in segs), segs
            print("transcript fetch(ko,en) empty")
        except Exception as e:
            print(f"transcript fetch(ko,en) failed: {e}")
        try:  # 언어 지정 없이 재시도 (foreign 언어가 섞인 영상 대비)
            fetched = YouTubeTranscriptApi().fetch(video_id)
            chunks = fetched.snippets if hasattr(fetched, "snippets") else fetched
            segs = _snippets_to_segments(chunks)
            if segs:
                return " ".join(t for t, _, _ in segs), segs
            print("transcript fetch() empty")
        except Exception as e2:
            print(f"transcript fetch() failed: {e2}")
        try:  # 구 API (0.x)
            tracks = YouTubeTranscriptApi.get_transcript(video_id, languages=["ko", "en"])
            segs = _snippets_to_segments(tracks)
            if segs:
                return " ".join(t for t, _, _ in segs), segs
        except Exception:
            pass
    except Exception as e:
        print(f"Transcript unavailable for {video_id}: {e}")
    return empty


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
    transcript, segments = fetch_transcript(video_id)
    stats = fetch_youtube_stats(video_id, config.get("youtube_api_key"))

    # 실측 밀도. LLM이 추정하게 두지 않는다 — 타임스탬프로 코드에서 직접 계산.
    density = measure_speech_density(segments)
    if density.get("source") == "measured":
        print(f"[Shorts Density] {video_id} 실측 {density['chars_per_sec']}자/초 "
              f"(글자 {density['char_count']} / 발화 {density['speech_sec']}초, "
              f"문장당 {density['avg_chars_per_sentence']}자)")
    else:
        print(f"[Shorts Density] {video_id} 밀도 미측정: {density.get('reason')}")

    _get_api_key()
    prompt = f"""
    아래는 유튜브 숏폼 레퍼런스의 수집 데이터이다. 영상 파일은 없으므로 자막+메타데이터로 분석하라.
    수치가 없으면(stats 없음) 반응 이유를 지어내지 말고 '수치 미확인'이라 명시하라.
    - 제목: {oembed.get('title', '')} / 채널: {oembed.get('author_name', '')}
    - 자막: {(transcript[:4000] if transcript else '(자막 없음)')}
    - 통계: {json.dumps(stats, ensure_ascii=False) if stats else '없음 (YouTube Data API 키 미설정)'}
    - speech_density(코드 실측): {json.dumps(density, ensure_ascii=False)}
    Hook Summary, Content Pattern(도입→전개→연결→CTA), 반응 이유(수치 기반, 수치 없으면 패턴 기반 + 미확인 명시),
    해시태그를 추출하고, 같은 패턴의 재현 대본(storyboard)도 작성하라.
    {ANALYSIS_JSON_SPEC}
    """
    result = _llm_run(prompt, json_mode=True)
    result["source_type"] = "youtube"
    result["video_id"] = video_id
    result["stats"] = stats
    # 코드에서 실측한 값을 넣는다. LLM이 덮어써도 아래에서 다시 교정한다.
    result["speech_density"] = density
    result.setdefault("density_note", density.get("reason") or "")
    if stats is None:
        result["stats_note"] = "settings.yaml youtube_api_key 미설정으로 수치 미수집"
    if not transcript:
        result["transcript_approx"] = result.get("transcript_approx") or ""
    return result



# 분석 리포트의 style_analysis(한글 값) → 프리셋 축 ID 매핑.
# 프리셋보다 분석이 우선한다. 사용자가 "이 영상 느낌으로" 하면 축을 덮어쓴다.
_STYLE_HOOK_MAP = {
    "질문형": "question", "도발형": "provoke", "공감형": "empathy",
    "숫자형": "number", "반전형": "twist",
    # 2026-09-27: 톤 3분할 재분석에서 새로 관찰된 훅 유형
    "후회형": "regret", "인사형": "greeting",
    # 분석기가 '후회형/도발형' 처럼 섞어 쓴 경우의 접두 라벨.
    # '팔로우업'은 여기 있었는데 뜻이 달라 후회형으로 잘못 매핑했다(복사/붙여넣기 잔재).
    "후회": "regret", "인사": "greeting",
}
_STYLE_CTA_MAP = {
    "저장 유도": "save", "댓글 유도": "comment",
    "구독 유도": "subscribe", "팔로우 유도": "follow",
    "감정 유도": "emotion", "시청자 질문": "ask_viewer",
    # 분석기가 '감정 유도 및 시청자 대화' 처럼 섞어 쓴 경우의 접두 라벨
    "감정": "emotion", "시청자": "ask_viewer", "질문": "ask_viewer", "대화": "emotion",
}
_STYLE_TONE_MAP = {
    "담백 1인칭": "casual_first", "MZ 직설": "mz_blunt",
    "감각 묘사": "sensory", "실패 회고": "retro",
    "전문가 단언": "authority", "자조 개그 반말": "self_deprecating",
    # 2026-09-27: 톤 3분할로 추가된 4축. 출처는 실루엣 예시 1~4번.
    "낭독 존댓말": "polite_guide", "추억 회상": "warm_recall",
    "지시 혼용 조리": "instruction_mix", "브금 개그": "bracket_quirk",
    # 분석기가 '낭독 존댓말/브금 개그' 처럼 섞어 쓴 경우의 접두 라벨
    "낭독": "polite_guide", "독백": "bracket_quirk",
}


def _style_axis_value(raw_value, mapping):
    """분석기가 '감정 유도 및 시청자 대화' 처럼 섞어 쓴 값에서 축 하나를 고른다.

    매핑 표의 라벨이 부분 문자열로 들어 있으면 그 축을, 없으면 원본 문자열을 정규화해
    한 번 더 시도한다. 매핑 불가일 때만 None(=오버라이드 안 함)을 돌려준다.
    """
    v = str(raw_value or "").strip()
    if not v:
        return None
    if v in mapping:
        return mapping[v]
    # '반전형/도발형' -> 둘 다 있으면 앞(훅)만 채택
    for part in (p.strip() for p in v.replace("·", "/").split("/")):
        if part in mapping:
            return mapping[part]
    # 부분 매칭은 '문자열에 먼저 등장한 것'으로 고른다. dict 순서로 돌면
    # '시청자 질문으로 감정 유도'가 감정(사전 순서 4번)으로 먼저 잡혀 틀렸다.
    # '(감정|시청자|질문|대화)' 같은 2글짜리 접두 키가 정식 라벨보다 먼저
    # 매칭돼도 안 되도록, 같은 위치면 더 긴 라벨을 우선한다.
    best = None  # (pos, -len, axis_id)
    for label, axis_id in mapping.items():
        if not label:
            continue
        pos = v.find(label)
        if pos < 0:
            continue
        cand = (pos, -len(label), axis_id)
        if best is None or cand < best:
            best = cand
    if best:
        return best[2]
    return None


def _style_overrides_from_reference(reference_summary):
    """분석 리포트의 스타일 분석 → {hook/tone/cta} 오버라이드 축 ID.

   (style_analysis 하위 객체와 최상위 평면 두 형태 모두 지원한다.
    매핑되는 값만 반환. 없으면 빈 딕셔너리 (프리셋 기본값 유지).
    """
    raw = str(reference_summary or "")
    try:
        rep = json.loads(raw) if raw.strip().startswith("{") else None
    except Exception:
        rep = None
    if not isinstance(rep, dict):
        return {}
    sa = rep.get("style_analysis")
    if not isinstance(sa, dict):
        # 분석 결과가 최상위 평면인 경우 (style_analysis 래퍼 없이)
        if any(k.endswith("_style") for k in rep):
            sa = rep
        else:
            return {}
    out = {}
    for key, mapping in (("hook", _STYLE_HOOK_MAP), ("tone", _STYLE_TONE_MAP), ("cta", _STYLE_CTA_MAP)):
        mapped = _style_axis_value(sa.get(f"{key}_style"), mapping)
        if mapped:
            out[key] = mapped
    return out


def _style_dense_narration(reference_summary):
    """분석된 대본이 '재료+양념을 한 문장에 몰아넣는' 밀집형 문법인지 판정.

    이런 원본은 어미 조각(~ 준비해 주고)이 길어서, 일반 Cap에 걸리면 문장 중간에서 잘려
    분석 결과가 전부 사라진다(실측). 이 경우에만 Cap을 올려 문법을 보존한다.
    """
    raw = str(reference_summary or "")
    try:
        rep = json.loads(raw) if raw.strip().startswith("{") else None
    except Exception:
        rep = None
    if not isinstance(rep, dict):
        return False
    note = str(rep.get("density_note") or "")
    if not note:
        sa = rep.get("style_analysis")
        if isinstance(sa, dict):
            note = str(sa.get("density_note") or "")
    if not note:
        return False
    keys = ("몰아넣", "한 호흡", "한 문장", "짧게", "압축", "나열")
    return any(k in note for k in keys)


# 실측 밀도 안전 범위. 한국어 표준 발화는 약 4.2~5.0자/초.
# 3.0 이하는 늘어느린 톤, 5.5 초과는 자막이 다음 장면과 겹친다(실측 60초 대본 기준).
DENSITY_CPS_MIN = 3.0
DENSITY_CPS_MAX = 5.5
DENSITY_CPS_FALLBACK = 4.5   # 실측 불가 시 쓰는 값(출처를 '미측정'으로 명시)


def resolve_speech_density(reports):
    """레퍼런스 분석 결과들에서 실측 초당 글자수를 하나로 정한다.

    - 값이 여러 개면 중앙값(이상치 방어). 평균은 한 편이 튀면 전체가 밀린다.
    - 범위 밖이면 잘라내고, 아무것도 없으면 FALLBACK + measured=False.
    - LLM이 만들어 낸 값은 믿지 않는다. analyze_youtube가 코드에서 넣은 것만 쓴다.
    """
    vals = []
    for rep in (reports or []):
        if not isinstance(rep, dict):
            continue
        d = rep.get("speech_density")
        if not isinstance(d, dict) or d.get("source") != "measured":
            continue
        v = d.get("chars_per_sec")
        if isinstance(v, (int, float)) and v > 0:
            vals.append(float(v))
    if not vals:
        return {
            "chars_per_sec": DENSITY_CPS_FALLBACK,
            "measured": False,
            "n_refs": 0,
            "note": "레퍼런스 자막 타임스탬프를 못 읽어 실측 실패. 기본값으로 진행한다.",
        }
    vals.sort()
    mid = len(vals) // 2
    med = vals[mid] if len(vals) % 2 else round((vals[mid - 1] + vals[mid]) / 2, 2)
    clamped = min(DENSITY_CPS_MAX, max(DENSITY_CPS_MIN, med))
    note = ""
    if abs(clamped - med) > 0.01:
        note = f" 실측 중앙값 {med}자/초가 안전 범위({DENSITY_CPS_MIN}~{DENSITY_CPS_MAX}) 밖이라 보정했다."
    return {
        "chars_per_sec": round(clamped, 2),
        "measured": True,
        "n_refs": len(vals),
        "raw_values": vals,
        "note": note.strip(),
    }


def _reference_samples(rep, limit=3, each=60):
    """참고 예시는 '실제 레퍼런스 자막'에서만 뽑는다.

    rep['storyboard'][i]['text']는 분석 LLM이 방금 만든 대본이다. 그걸 예시로
    되먹이면 짧은 대사가 다시 학습되어 원인이 재현된다(스펙이 '1~2문장'이라 더 심함).
    """
    ta = str(rep.get("transcript_approx") or "").strip()
    if not ta:
        return []
    # 종결부호로 끊어 실제 문장을 고른다. 없는 자막은 공백 기준으로 자른다.
    sents = [s.strip() for s in re.split(r"[.!?。！？]+\s*", ta) if s.strip()]
    if len(sents) < 2:
        sents = [s.strip() for s in ta.split("  ") if s.strip()]
    out, seen = [], set()
    for s in sents:
        key = s[:24]
        if key in seen:
            continue
        seen.add(key)
        out.append(s[:each])
        if len(out) >= limit:
            break
    return out


def _compact_reference(reference_summary, target_scene_sec=None, density=None):
    """레퍼런스 분석 → 프롬프트용 압축 텍스트.

    target_scene_sec를 주면 그 길이에 맞춰 목표 글자수를 계산해 준다.
    """
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
    # 스타일 정보는 요약만 통과시킨다.
    sa = rep.get("style_analysis")
    if not isinstance(sa, dict):
        sa = rep if any(k.endswith("_style") for k in rep) else {}
    if isinstance(sa, dict) and any(sa.values()):
        _hs = sa.get("hook_style") or ""
        _cs = sa.get("cta_style") or ""
        _ts = sa.get("tone_style") or ""
        _sp = sa.get("sentence_patterns") or []
        _pc = sa.get("pacing") or ""
        _es = sa.get("ending_style") or ""
        parts = []
        if _hs:
            parts.append(f"훅: {_hs}")
        if _cs:
            parts.append(f"CTA: {_cs}")
        if _ts:
            parts.append(f"톤: {_ts}")
        if _es:
            parts.append(f"어미: {_es}")
        if _sp:
            parts.append(f"[문장 조각] {', '.join(str(x) for x in _sp[:3])}")
        if _pc:
            parts.append(f"전개 속도: {_pc}")
        if parts:
            keep.append("[레퍼런스 스타일] " + " / ".join(parts))

    # 실측 밀도 + 그 기준의 실제 문장 예시.
    if density is None:
        density = resolve_speech_density([rep])
    keep.append(_density_block(density, rep, target_scene_sec))

    if not keep:
        return raw[:1500]
    return "\n".join(keep)


def _density_block(density, rep, target_scene_sec):
    """밀도 지시 블록. 숫자는 전부 실측(또는 명시적 기본값)에서만 나온다."""
    cps = float(density.get("chars_per_sec") or DENSITY_CPS_FALLBACK)
    src = "실측" if density.get("measured") else "기본값(미측정)"
    lines = [f"[말하기 밀도 기준] {src} {cps}자/초 (레퍼런스 {density.get('n_refs', 0)}편 기준)"]
    if density.get("note"):
        lines.append(f"  - {density['note']}")
    if target_scene_sec:
        tgt = round(cps * float(target_scene_sec))
        lines.append(f"  - 이 장면은 {target_scene_sec}초 → narration은 공백 제외 약 {tgt}자 목표")
        lines.append(f"  - 장면마다 목표 ±20% 범위({round(tgt * 0.8)}~{round(tgt * 1.2)}자)를 지켜라")
    lines.append("  - 글자수만 채우려고 의미 없는 문장을 늘리지 마라. 정보가 없으면 정보를 더 찾아서 쓴다.")
    samples = _reference_samples(rep) if isinstance(rep, dict) else []
    if samples:
        lines.append("  - 이 레퍼런스가 실제로 말한 길이 예시(글자수 함께):")
        for s in samples:
            n = len(re.sub(r"\s+", "", s))
            lines.append(f"      · {s} ({n}자)")
    return "\n".join(lines)



def _short_ko(t, n=20):
    t = (t or '').strip()
    if len(t) <= n:
        return t
    cut = t[:n].rsplit(' ', 1)
    return cut[0] if len(cut) > 1 and cut[0] else t[:n]


# 단위 표기 정규화. 프롬프트에 '큰술/작은술' 을 쓰라고 지시해도 LLM 이 '1T' 를
# 쓴다(실측: '식용유 1T', '간장 1T'). T 는 '1톤' 으로 읽힐 수 있어 위험하다.
# 숫자+단위 조합만 바꾼다. 'Castell' 같은 단어 속 T 는 건드리지 않는다.
_UNIT_FIX = (
    (re.compile(r'(?<![A-Za-z])(\d+(?:\.\d+)?)\s*(?:큰술|큰\s*술|大匙|大勺|Tbsp|TBSP|tbsp)\b'), r'\1큰술'),
    (re.compile(r'(?<![A-Za-z])(\d+(?:\.\d+)?)\s*(?:작은술|작은\s*술|小匙|작은\s*숟가락)\b'), r'\1작은술'),
    (re.compile(r'(?<![A-Za-z])(\d+(?:\.\d+)?)\s*(?:스푼|스poons?|Tablespoon)\b'), r'\1큰술'),
    # T/S 는 단독일 때만 위험하다. 뒤에 글자가 붙으면 단어일 수 있다.
    (re.compile(r'(?<![A-Za-z])(\d+(?:\.\d+)?)\s*T(?![A-Za-z])'), r'\1큰술'),
    (re.compile(r'(?<![A-Za-z])(\d+(?:\.\d+)?)\s*S(?![A-Za-z])'), r'\1작은술'),
    # ml/L 은 그대로 두되 대소문자를 통일한다(1l -> 1L 은 그대로, 1L 은 1리터로 읽힘)
    (re.compile(r'(?<![A-Za-z])(\d+(?:\.\d+)?)\s*l(?![A-Za-z])'), r'\1L'),
)


def normalize_units(text: str) -> str:
    """숟가락 표기를 '큰술/작은술' 로 바꾼다. g/ml 은 그대로 둔다."""
    if not text:
        return text
    out = text
    for pat, rep in _UNIT_FIX:
        out = pat.sub(rep, out)
    # 중복 공백 정리(치환으로 생긴 것)
    out = re.sub(r'[ ]{2,}', ' ', out)
    # 1큰술큰술 같은 이중 적용 방지
    out = out.replace('큰술큰술', '큰술').replace('작은술작은술', '작은술')
    return out


def _normalize_item_units(item: Dict[str, Any]) -> None:
    """LLM 대본의 나레이션/자막/재료 분량 단위를 정규화한다."""
    if not isinstance(item, dict):
        return
    for key in ('narration_ko', 'subtitle_ko', 'text', 'subtitle'):
        v = item.get(key)
        if isinstance(v, str) and v.strip():
            item[key] = normalize_units(v)
    ing = item.get('ingredients')
    if isinstance(ing, list):
        for row in ing:
            if isinstance(row, dict):
                for k in ('amount', 'name', 'unit'):
                    if isinstance(row.get(k), str):
                        row[k] = normalize_units(row[k])


# 섹션별 영문 장면 묘사. 복구 폴백이 '전 씬 같은 문구'를 만들면 이미지가 전부
# 똑같아지므로 장면마다 달라야 한다.
_SEC_EN = {
    'HOOK': 'finished dish appetizing close-up',
    'INGREDIENTS': 'ingredients laid out on table',
    'PREP': 'hands preparing ingredients on cutting board',
    'HEAT': 'heating cookware on stove',
    'CORE': 'main cooking in progress',
    'SEASONING': 'adding seasoning to dish',
    'PLATING': 'plating the finished dish',
    'TASTE': 'tasting the finished dish',
    'CTA': 'finished dish presentation',
}

# 이미지 프롬프트에 들어오면 안 되는 값들(무효 지시어 + 옛 뉴스 기본값).
_BAD_KEYWORD = {
    'news', 'none', 'blank', 'blank sign', 'blank signs', 'no text', 'textless',
    'blank labels', 'no readable text', 'none text', 'no text.',
}


def _repair_scene_keywords(scene_guide_list, items, topic):
    """장면별 visual.keyword / description 복구. 반환값 없이 제자리에서 고친다.

    언제 호출해야 하는가
        반드시 '최종' scene_guide_list 에 대해, _convert_storyboard_items 를
        마지막으로 부른 '뒤에' 호출한다. items 를 직접 고치는 게 아니라 재구축된
        결과를 고쳐야 한다. 먼저 부르고 나중에 재구축하면 수정이 통째로 버려진다
        (실측: 레시피 6장면 전부 keyword='news' 로 나온 원인).
    """
    fallback = (topic or '').strip()[:20]
    for i, sc in enumerate(scene_guide_list):
        if not isinstance(sc, dict):
            continue
        it = items[i] if i < len(items) and isinstance(items[i], dict) else {}
        sec = str(sc.get('section') or '').strip().upper()
        narr = str(it.get('narration_ko') or it.get('text') or '').strip()
        kw = str(sc.get('keyword') or '').strip()
        if (not kw or kw.lower() in _BAD_KEYWORD) and (narr or fallback):
            # 그 장면 대사의 앞부분을 키워드로 (씬마다 달라진다)
            sc['keyword'] = _short_ko(narr) or fallback
        desc = str(sc.get('description') or '').strip()
        cur_kw = (sc.get('keyword') or fallback).strip()
        if not desc or desc.lower() in _BAD_KEYWORD or desc == kw:
            en = _SEC_EN.get(sec, 'cooking scene in progress')
            sc['description'] = (f"{en}, {cur_kw} cooking, steam rising, "
                                 f"photorealistic food photography")

    _dedupe_scene_keywords(scene_guide_list, items, fallback)


# 같은 keyword/description 이 여러 장면에 몰리면 이미지가 전부 같아진다.
# CTA 를 정리하는 과정에서 '완성. 많이 먹어. 어때?' 가 맨 앞과 맨 뒤에 남을 수 있다
# (실측). 섹션이 다르면 문장 앞에 섹션 접두어를 붙여 구분한다.
_SEC_PREFIX_KO = {
    'HOOK': '인사', 'INGREDIENTS': '재료', 'PREP': '손질', 'HEAT': '불 올리기',
    'CORE': '핵심 조리', 'SEASONING': '양념', 'PLATING': '플레이팅',
    'TASTE': '시식', 'CTA': '마무리',
}


def _dedupe_scene_keywords(scene_guide_list, items, fallback) -> None:
    seen = {}
    seen_desc = {}
    for i, sc in enumerate(scene_guide_list):
        if not isinstance(sc, dict):
            continue
        kw = str(sc.get('keyword') or '').strip()
        sec = str(sc.get('section') or '').strip().upper()
        desc = str(sc.get('description') or '').strip()
        if not kw:
            continue
        base = kw.lower()
        if base in seen:
            label = _SEC_PREFIX_KO.get(sec)
            cand = f"{label} · {kw}" if label else f"{kw} ({i + 1})"
            n = 2
            while cand.lower() in seen and n < 6:
                cand = f"{label} {n} · {kw}" if label else f"{kw} ({i + 1}.{n})"
                n += 1
            sc['keyword'] = cand
            if desc and kw in desc:
                desc = desc.replace(kw, cand, 1)
            seen[cand.lower()] = i
        else:
            seen[base] = i

        # description 중복. 이미지 프롬프트가 같으면 컷이 통째로 같아진다.
        # 키워드가 키워드에서 파생된 경우만 손대면 놓친다 — LLM 은 description 을
        # '완성 샷' 처럼 독립적으로 주기 때문에(실측) 여기서 따로 갈라야 한다.
        if desc:
            dbase = desc.lower()
            if dbase in seen_desc:
                en = _SEC_EN.get(sec, 'cooking scene in progress')
                desc = f"{desc}, {en}"
                sc['description'] = desc
                dbase = desc.lower()
            seen_desc.setdefault(dbase, i)


_PLACEHOLDER_HINTS = ("variant", "여기", "TODO", "xxx", "예시", "placeholder", "...")


def _plausible_addition(extra):
    """LLM이 돌려준 '이어붙일 내용'이 대사로 쓸 만한지 확인.

    길이만 늘어난다고 붙이면 안 된다. 실측으로 모델이 '김_variant' 같은
    자리표시자를 돌려왔고, 그게 그대로 대사에 들어갔다.
    """
    if not extra:
        return False
    if "_" in extra or any(h in extra for h in _PLACEHOLDER_HINTS):
        return False
    # 한글이 어느 정도는 있어야 한다(영문 단어만 붙는 경우 배제).
    hangul = sum(1 for c in extra if "\uac00" <= c <= "\ud7a3")
    if hangul < max(4, len(extra) // 4):
        return False
    # 너무 짧으면 의미가 없다(기존 대사보다 8자 이상 붙어야).
    return len(extra.replace(" ", "")) >= 8


def _expand_short_narrations(items, thin, *, target_chars, cps, cap, topic,
                             duration, resolved_axes, evidence_block="",
                             facts_text=""):
    """부족한 장면의 대사만 LLM에 되돌려 목표 길이까지 늘린다.

    thin: [(index, narration_text), ...] — items 안의 인덱스와 현재 대사.
    반환: 실제로 길이가 늘어난 장면 수. 실패하면 0.

    원칙
    - 한 번의 호출로 부족 장면 전부 처리한다(장면마다 부르면 과금이 커진다).
    - 기존 문장은 유지하고 '이어서 말할 내용'을 붙여달라고 한다. 재작성을 시키면
      분량·cta가 증발하므로.
    - 늘어난 뒤에도 부족하면 원본으로 되돌린다. 늘려 놓고 못 읽는 대본은 더 나쁘다.
    - 과금이 걸리므로 호출은 1회로 제한한다.
    """
    if not thin:
        return 0
    lang = str((resolved_axes or {}).get("lang") or "ko")
    axes = resolved_axes or {}
    spec_lines = []
    for i, tx in thin:
        it = items[i]
        v = it.get("visual") or {}
        sec = it.get("section") or it.get("type") or ""
        kw = v.get("keyword") or ""
        desc = (v.get("description") or "")[:220]
        need = max(0, target_chars - len(tx.replace(" ", "")))
        spec_lines.append(
            f"[장면 {i + 1}] 섹션={sec} / 화면 키워드={kw}\n"
            f"  현재 대사({len(tx.replace(' ', ''))}자): {tx}\n"
            f"  화면 B-roll: {desc}\n"
            f"  목표: 공백 제외 {target_chars}자 — 현재보다 {need}자 더 필요"
        )

    prompt = f"""아래는 요리 숏폼 대본에서 '너무 짧아서 무음이 생기는' 장면들이다.
목표는 장면 길이만큼 말이 채워지도록 대사를 늘리는 것이다. 뻗은 공백을 없애라.

[주제] {topic}
[영상 길이] {duration}초
[기준] {cps}자/초 (레퍼런스 실측 또는 기본값). 장면당 목표 공백 제외 {target_chars}자.
[톤] {axes.get('tone')} / [구조] {axes.get('structure')} / [CTA] {axes.get('cta')}

[확정된 조리 팩트 - 여기 없는 재료·수치를 새로 만들지 마라]
{facts_text[:1200] if facts_text else '(없음 — 화면에 보이는 행동과 일반 조리 상식만 쓴다)'}

[보통해야 할 장면]
{chr(10).join(spec_lines)}

[규칙]
1. 각 장면의 현재 대사는 그대로 두고, 뒤에 이어 붙일 내용만 쓴다. 앞 문장은 절대 바꾸지 마라.
2. 화면 B-roll에 보이는 행동·소리·질감·상태 변화(예: 김이 오른다, 색이 바뀐다)를 구체적으로 말해라.
3. 숫자·분량·온도·시간은 위 확정 팩트에 있는 것만 쓴다. 없으면 말하지 마라.
4. 마지막 장면은 CTA를 포함해야 한다.
5. '많이 먹어 어때' 같은 10자 단문으로 끝내지 마라.
6. 의미 없는 문장을 늘려 채우지 마라. 정보가 없으면 화면에서 보이는 것을 말하라.
7. 문장은 2~3문장으로 이어 쓰고, 쉼표로 끊지 마라.

[출력 형식] 아래 스키마에 맞는 JSON **하나만** 출력하라. 설명·마크다운·코드펜스 금지.
스키마: {{"lines": [ [<장면번호:int>, "<이어붙일 문장>"], ... ]}}
- 각 항목은 길이 2인 배열이다. 첫 값은 정수, 두 번째 값은 문자열이다.
- 대상 장면 번호만 포함한다. 없는 장면 번호는 넣지 마라.
- 이어붙일 문장은 그 장면 목표 분량을 채울 만큼 충분히 쓰되, 앞 문장을 반복하지 마라.

출력 예시:
{{"lines": [[1, "냉장고에 있던 반포기 김치를 쓰면 더 시원합니다. 뚜껑을 열면 김이 올라와요."], [2, "목살은 앞다리살로 썰면 기름이 남아 괜찮더라고요."]]}}
"""
    data = _llm_run(prompt, json_mode=True)
    # json_mode=True 인데도 문자열로 오는 경우가 있다(모델이 JSON을 안 만들 때).
    # 예전엔 바로 .get() 을 불러 AttributeError 로 죽었고, 호출자가 잡아서
    # '보조 실패' 로만 남았다 — 보강이 말없이 안 되는 것처럼 보였다(실측).
    if isinstance(data, str):
        try:
            from .llm_providers import extract_json as _ex
        except (ImportError, ValueError):
            from llm_providers import extract_json as _ex
        try:
            data = _ex(data)
        except Exception as _pe:
            print(f"[Shorts Fill] 응답이 JSON이 아니라 파싱 실패: {str(data)[:120]}")
            return 0
    if not isinstance(data, dict):
        print(f"[Shorts Fill] dict가 아닌 응답({type(data).__name__})이라 무시.")
        return 0
    rows = (data or {}).get("lines") or []
    if not isinstance(rows, list) or not rows:
        print("[Shorts Fill] 보강 응답에 lines가 없다.")
        return 0

    grown = 0
    for row in rows:
        try:
            idx, extra = int(row[0]), str(row[1] or "").strip()
        except (TypeError, ValueError, IndexError, KeyError, AttributeError):
            # 모델이 [{"a":1}] 처럼 엉뚱한 모양을 주면 여기서 죽지 않는다.
            continue
        if not (1 <= idx <= len(items)):
            continue
        it = items[idx - 1]
        cur = _narration_of(it).strip()
        if not cur:
            continue
        if not _plausible_addition(extra):
            print(f"[Shorts Fill] {idx}번 추가분이 비정상이라 버린다: {extra[:40]!r}")
            continue
        cand = (cur + " " + extra).strip()
        if len(cand.replace(" ", "")) <= len(cur.replace(" ", "")):
            continue
        if len(cand) > cap:
            # 여기도 예전엔 cand[:cap].rsplit(' ',1)로 단어 중간을 잘랐다. 같은 버그.
            cand = trim_narration_to_target(cand, target_chars, max_ratio=CAP_MAX_RATIO) or cur
        _set_narration(it, cand)
        grown += 1
    return grown


# 대사 상한 비율 = 7자/초 ÷ 4.5자/초. 장면 길이와 무관하게 항상 같은 값이어야
# 프롬프트의 '초당 7자 넘지 마라'와 코드의 상한이 같은 말을 하게 된다.
CAP_MAX_RATIO = 1.55
_SENT_SPLIT = re.compile(r"(?<=[.!?])\s+")
_CLAUSE_SPLIT = re.compile(r"(?<=[,、·])\s+")
# 한국어 문어결. LLM 이 쓴 대본은 마침표·쉼표 없이 이어 쓰는 경우가 많다(실측).
# 어미 뒤에서 끊으면 완전한 절로 남는다.
# 위험한 어미는 뺀다 — 다른 낱말에 붙어 있어서 쪼개진다:
#   '해요'(→불해요=불+해요) '지요'(→하지요=하+지요) '래요'(→그래요=그+래요)
#   '라고요'(→다르더라고요 를 자르면 '다르더' 가 늘어진다)
_KO_ENDINGS = ("입니다", "습니다", "거든요", "였습니다", "였습니다",
               "였어요", "네요", "예요", "어요", "줘요", "봐요", "했어요")

_KO_END_SPLIT = re.compile("(" + "|".join(_KO_ENDINGS) + r")\s+")
_SPLIT_MARK = "\x00"


def trim_narration_to_target(text, target_chars, max_ratio=CAP_MAX_RATIO):
    """대사를 목표 길이로 줄이되 **의심 없는 경계에서만** 자른다.

    예전 로직은 문장부호가 없으면 마지막 공백(단어 경계)에서 잘라서 대반이
    날아갔다(실측: 59자 → 25자, '…집에서 직접 써먹어' 에서 끊김).

    경계 우선순위:
      1. 문장 끝 (. ! ?)
      2. 절 끝 (, · 、)
      3. 한국어 어미 뒤  (거든요/입니다/네요 …) — 마침표가 없을 때 대부분 여기서 된다
      4. 단어 경계 — 위를 하나도 못 찾았을 때의 최후 수단

    어미 분리는 어미가 앞말에 붙어 있지 않게 '어미+공백'을 통째로 잘라낸다
    (되거든요 를 '되' + '거든요' 로 쪼개지 않도록).

    목표를 넘으면 '…' 같은 표기를 붙이지 않는다. TTS가 읽을 말이 아니라서
    읽히면 이상하고, 안 읽히면 무의미하다. 잘린 구간은 소리가 없는 게 맞다.
    """
    text = (text or "").strip()
    if len(text) <= target_chars:
        return text
    upper = int(target_chars * max_ratio)

    def _pick(parts):
        """목표를 넘지 않는 앞부분만 문장 단위로 담는다."""
        picked = []
        cur = 0
        for p in parts:
            add = len(p) + (1 if picked else 0)
            if cur + add > upper:
                break
            picked.append(p)
            cur += add
            if cur >= target_chars:
                break
        return " ".join(picked).strip() if picked else ""

    for splitter in (_SENT_SPLIT, _CLAUSE_SPLIT):
        parts = [p for p in splitter.split(text) if p.strip()]
        if len(parts) >= 2:
            got = _pick(parts)
            if got:
                return got

    # 한국어 어미 경계. 어미를 앞말에 붙여 둔 채로 자른다.
    if _KO_END_SPLIT.search(text):
        marked = _KO_END_SPLIT.sub(lambda m: m.group(1) + _SPLIT_MARK, text)
        parts = [p.strip() for p in marked.split(_SPLIT_MARK) if p.strip()]
        if len(parts) >= 2:
            got = _pick(parts)
            if got:
                return got

    # 문장부호도 어미 경계도 없는 경우의 최후 수단.
    safe = text[:upper]
    cut = safe.rfind(" ")
    return (safe[:cut] if cut > 0 else safe).strip()



def create_from_pattern(reference_summary, new_topic, duration=40, category="recipe_short",
                        format_id=None, style_id=None, platform_id=None, script_id=None, hook_id=None,
                        preset_id=None, tone_id=None, structure_id=None, cta_id=None,
                        reference_reports=None, expand_thin_scenes=True):
    """분석 리포트의 성공 패턴을 새 주제에 적용해 풀 패키지 생성.

    반환: 제목 + Hook Idea + 톤앤매너 + 해시태그 + 섹션 구조 스토리보드.
    shape은 /generate와 호환 (script/scenes/total_duration/target_duration).

    recipe_short + format 지정 시 모듈형 프롬프트(recipe_prompts.py:
    CORE + FORMAT + STYLE + VISUAL + OUTPUT + PLATFORM 조합)를 사용한다.
    그 외 카테고리는 기존 templates.py 지침을 그대로 사용한다.

    reference_reports
        링크를 여러 개 분석했을 때의 분석 결과 dict 리스트(선택).
        있으면 실측 말하기 밀도를 중앙값으로 뽑아 프롬프트에 넣는다(강제 아님).
    expand_thin_scenes
        대사가 장면 길이보다 짧아 무음이 생기면 LLM을 한 번 더 불러 늘린다(과금).
        False로 끄면 진단만 하고 원본을 그대로 둔다.
    """
    if not new_topic or not new_topic.strip():
        raise ValueError("새 주제를 입력하세요.")
    try:
        duration = int(duration or 40)
    except (TypeError, ValueError):
        duration = 40
    # 포맷 결정: 길이(제작 설정)가 유일한 진실.
    # format_id 미지정/'auto'면 길이로 자동결정, 스냅(강제 target 맞춤)은 하지 않는다.
    # 포맷은 장면 구조용, 목표 시간은 duration 그대로 프롬프트에 전달한다.
    _recipe_fmt = None
    _clamp_warnings = []
    if category == "recipe_short":
        try:
            from .recipe_prompts import get_format as _get_fmt, resolve_format_for_duration as _resolve_fmt
        except (ImportError, ValueError):
            from recipe_prompts import get_format as _get_fmt, resolve_format_for_duration as _resolve_fmt
        _fid = (format_id or '').strip() if isinstance(format_id, str) else format_id
        if not _fid or _fid == 'auto':
            _fid = _resolve_fmt(duration)
            print(f"[Shorts Format] duration {duration}s → 포맷 자동결정: {_fid} (스냅 없음)")
        _recipe_fmt = _get_fmt(_fid)
        # 포맷을 명시적으로 고른 경우에만 상한이 걸린다(auto는 길이에서 정해지므로 걸리지 않는다).
        # 여기서 조용히 줄이면 사용자는 "600초"를 넣고 333초 영상을 받는다(실측).
        # 여기서 조용히 줄이면 사용자는 "600초"를 넣고 333초 영상을 받는다(실측).
        # 경고 힌트를 누적해 최종 응답에 실어 사용자가 알 수 있게 한다.
        _limit = duration
        try:
            _limit = int(_recipe_fmt["max_sec"]) + 300
        except (TypeError, ValueError, KeyError):
            _limit = duration
        if duration > _limit:
            _clamp_warnings.append(
                f"요청 {duration}초가 포맷 '{_fid}'의 허용 상한({_limit}초)을 넘어 "
                f"{_limit}초로 조정했습니다. 더 긴 영상이면 길이 버튼(180/300/600)을 고르세요.")
            print(f"[Shorts Duration] {duration}s → {_limit}s로 조정 (포맷 {_fid} 상한)")
            duration = _limit
        duration = max(15, duration)
    else:
        if duration > 180:
            _clamp_warnings.append(f"요청 {duration}초가 최대 180초로 조정되었습니다.")
        duration = max(15, min(duration, 180))
    topic = new_topic.strip()

    # 장면 수는 포맷 범위를 따르되, 60초는 6장면으로 고정한다.
    # 실측: 장면당 8~12초를 유지한다. 장면 수를 길이로 나누면
    # 30초=4~6장면, 1분=6~8장면, 3분=15~20장면, 5분=25~30장면으로 늘어난다.
    # (이전처럼 90초 이하를 6장면으로 고정하니 3분도 6장면이라 대사가 모자랐다)
    if _recipe_fmt:
        # 장면당 6~12초 범위를 유지한다. 30초에도 최소 4장면은 있어야
        # 훅·재료·조리·마무리 구도가 성립한다(실측: 3장면이면 중간이 뭉갠다).
        _min_s = 4
        _target = max(_min_s, round(duration / 10))
        _max_s = max(_min_s, _target)
        min_scenes = max(_min_s, min(_max_s, _target))
        _max_scenes = _max_s
        print(f"[Shorts Scenes] {duration}s → 장면 {min_scenes}~{_max_scenes}개 "
              f"(장면당 {round(duration / _max_scenes)}초)")
    else:
        _max_scenes = max(5, min(30, round(duration / 10)))
        min_scenes = max(5, min(_max_scenes, round(duration / 10)))

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
            "김치 1컵, 케첩·고추장·설탕 각 1~3큰술, 치즈 100g 등)을 기준으로 삼되, "
            "재료소개(INGREDIENTS) 대사에서는 재료명만 간결히 읊고 세부 용량은 각 조리 장면 대사에 분산시켜라. "
            "숟가락은 '1T' 같은 약자로 쓰지 말고 반드시 '1큰술'/'1작은술'로 쓴다(1T 는 1톤 으로 읽힌다)"
        )
    elif category == "review_short":
        numeric_rule = "제품 스펙·가격은 확정 팩트에 있을 때만 숫자로 제시하고, 없으면 '취향과 예산에 따라' 수준으로 써라"
    else:
        numeric_rule = "통계·연구 수치는 확정 팩트에 있는 것만 인용하라"

    _get_api_key()
    # 폴백 체인은 _llm_run 이 내부에서 만든다 (설정 하드코딩 없음)
    # 근거 수집 표본 구성 (수집 실패는 '출처 없음' 으로 처리 — 추측 금지)
    # 밀도 기준: 실측값 우선, 없으면 기본값. 장면당 초는 위에서 이미 정해진
    # 장면 수(min_scenes~_max_scenes)를 그대로 쓴다 — 수식 중복을 만들지 않는다.
    _density = resolve_speech_density(reference_reports) if reference_reports else None
    if _density is None:
        _try_rep = None
        try:
            _try_rep = json.loads(str(reference_summary or ""))
        except Exception:
            _try_rep = None
        _density = resolve_speech_density([_try_rep] if isinstance(_try_rep, dict) else [])
    _gap = 0.5
    _scene_sec = max(3.0, (duration - _gap * _max_scenes) / _max_scenes)
    print(f"[Shorts Density] 프롬프트 밀도 주입: {_density['chars_per_sec']}자/초 "
          f"(실측={_density['measured']}), 장면당 {_scene_sec:.1f}초")
    pattern_text = _compact_reference(reference_summary, target_scene_sec=_scene_sec,
                                      density=_density)
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
        fact_prompt = (
            f"주제 '{topic}'에 사실/수치 근거가 있는 항목만 추려 JSON으로 정리해라.\n"
            '{"ingredients": [{"name": "재료", "amount": "수량"}], '
            '"steps": [{"order": 1, "action": "행동", "numbers": "수치 근거"}], '
            '"tips": ["팁"]}\n'
            "모든 값은 amount와 숫자 근거를 본문에서만 가져와 (근거 없으면 비워라).\n"
            + "\n".join(f"- {f}" for f in fact_lines)
        )
        try:
            facts_text = _llm_run_text(fact_prompt)
            print(f"[Shorts Facts] confirmed {len(fact_lines)} fact sentences.")
        except Exception as fe:
            print(f"[Shorts Facts] failed: {fe}")

    role_intro = template["role_intro"]
    # 사용자 추가 지시 블록 (f-string 안에서 백슬래시 불가 → 미리 조립)
    extra_block = ""
    if extra_instructions:
        extra_block = "[사용자 추가 지시 - 카테고리 지침보다 최우선 적용]\n    " + extra_instructions
    # 모듈형 프롬프트 (recipe_short + 포맷 지정 시): 기존 단일 지침을
    # CORE + FORMAT + STYLE + VISUAL + OUTPUT + PLATFORM 조합으로 대체한다.
    # 명시 파라미터 > 저장된 프리셋 > 기본값 순으로 style/platform을 결정한다.
    modular_block = ""
    category_instructions = template["instructions"]
    resolved_axes = None
    if _recipe_fmt:
        try:
            from .recipe_prompts import (
                compose_recipe_prompt, resolve_recipe_axes, RECIPE_PRESETS as _PRESETS,
                TONE_VARIANTS as _TONES, CTA_VARIANTS as _CTAS, STRUCTURE_VARIANTS as _STRUCTS,
                HOOK_VARIANTS as _HOOKS,
            )
        except (ImportError, ValueError):
            from recipe_prompts import (
                compose_recipe_prompt, resolve_recipe_axes, RECIPE_PRESETS as _PRESETS,
                TONE_VARIANTS as _TONES, CTA_VARIANTS as _CTAS, STRUCTURE_VARIANTS as _STRUCTS,
                HOOK_VARIANTS as _HOOKS,
            )
        # 프리셋이 교체돼도 예전 설정값이 남아 있지 않도록 축 유효성표를 함께 쓴다.
        _PRESET_MAP_IDS = {p["id"] for p in _PRESETS}
        _AXIS_IDS = {
            "tone": {t["id"] for t in _TONES},
            "cta": {c["id"] for c in _CTAS},
            "structure": {s["id"] for s in _STRUCTS},
            "hook": {h[0] for h in _HOOKS} | {"random"},
        }
        try:
            _preset_cfg = load_config().get("recipe_prompt_preset") or {}
        except Exception:
            _preset_cfg = {}
        # 축 우선순위: 명시 파라미터 > 프리셋에 내장된 축 > 저장된 설정 > 기본값.
        # (저장된 설정이 프리셋 축을 덮으면 "읽어주기 조리"를 골라도 mz_blunt로
        #  생성되는 문제가 생긴다. 프리셋을 고른 이상 그 프리셋의 축이 그 조합이다.)
        # 저장값은 UI에서 개별 축을 직접 고를 때만 쓰고, 유효하지 않은 ID는 버린다.
        def _saved(axis):
            v = _preset_cfg.get(axis)
            return v if v in _AXIS_IDS[axis] else None

        _saved_pid = _preset_cfg.get("preset")
        if _saved_pid not in _PRESET_MAP_IDS:
            _saved_pid = None
        _pid = preset_id or _saved_pid or "random"
        # 프리셋 ID가 유효하면 그 프리셋이 정한 축을 쓴다(_preset_cfg보다 우선).
        _pdef = next((p for p in _PRESETS if p["id"] == _pid), None)
        _hook = hook_id or (_pdef or {}).get("hook") or _saved("hook") or "random"
        _tone = tone_id or (_pdef or {}).get("tone") or _saved("tone")
        _struct = structure_id or (_pdef or {}).get("structure") or _saved("structure")
        _cta = cta_id or (_pdef or {}).get("cta") or _saved("cta")
        # 분석된 스타일이 프리셋보다 우선한다.
        # (사용자가 "이 영상 느낌으로" 하면 hook/tone/cta 축을 덮어쓴다)
        #
        # 다만 '사용자가 직접 고른 값'보다 분석이 앞서면 안 된다.
        # 예전엔 레퍼런스가 있기만 하면 무조건 덮어써서, UI에서 톤을 'casual_first'로
        # 골랐는데 'warm_recall'로 실행됐다(스텁 매트릭스에서 잡힘). structure만
        # 덮어쓰지 않아 축마다 동작이 제각각이었다.
        # 이제: 사용자가 명시한 축 > 레퍼런스 분석 > 프리셋 > 저장값.
        _style_ov = _style_overrides_from_reference(reference_summary)
        if _style_ov.get("hook") and not hook_id:
            _hook = _style_ov["hook"]
        if _style_ov.get("tone") and not tone_id:
            _tone = _style_ov["tone"]
        if _style_ov.get("cta") and not cta_id:
            _cta = _style_ov["cta"]
        # 분석이 실제로 덮어썼는지 기록한다(사유 로그용).
        _ov_applied = [k for k, v in (("hook", hook_id), ("tone", tone_id), ("cta", cta_id))
                       if not v and _style_ov.get(k)]
        if _ov_applied:
            print(f"[Shorts Axes] 레퍼런스 분석이 {'/'.join(_ov_applied)} 축을 덮어썼다 "
                  f"(사용자가 직접 고르지 않은 축만).")
        _ignored = [k for k, v in (("hook", hook_id), ("tone", tone_id), ("cta", cta_id))
                    if v and _style_ov.get(k) and _style_ov[k] != v]
        if _ignored:
            print(f"[Shorts Axes] 사용자가 고른 {'/'.join(_ignored)} 을(를) 유지한다"
                  f"(레퍼런스 분석은 무시).")
        # 재생성·수리 프롬프트에서도 같은 축을 쓰도록 확정해 둔다.
        # 정의 순서: (preset, hook, tone, cta, structure)
        resolved_axes = resolve_recipe_axes(_pid, hook=_hook, tone=_tone,
                                        structure=_struct, cta=_cta)
        # 레퍼런스 정보(스타일 + 실측 밀도)를 모듈러 프롬프트에 넣는다.
        # 이전엔 compose_recipe_prompt에 아무것도 넘기지 않아 pattern_text가 통째로
        # 버려졌다. 그래서 실측 밀도가 계산만 되고 LLM 프롬프트에 못 닿았다(스텁 테스트가 잡음).
        _ref_extra = (
            "[레퍼런스 반영]\n"
            "아래는 사용자가 참고로 준 실제 영상에서 뽑은 값이다. 구조·어미·리듬은 따르되\n"
            "대본 문장은 새 주제에 맞게 새로 써라. 아래 문장을 베끼지 마라.\n"
            f"{pattern_text}"
        ) if pattern_text else ""
        modular_block = compose_recipe_prompt(
            format_id=_recipe_fmt["id"],
            style_id=style_id or _preset_cfg.get("style") or "realistic",
            platform_id=platform_id or _preset_cfg.get("platform") or "youtube",
            hook_id=_hook,
            target_sec=duration,
            preset_id=_pid,
            tone_id=_tone,
            structure_id=_struct,
            cta_id=_cta,
            axes_overridden=bool(_style_ov),
            extra=_ref_extra,
        )
        category_instructions = ""
    # SCRIPT 레이어: 카테고리별 대본 포맷 (recipe 모듈과 독립적으로 동작, 전 카테고리 적용)
    try:
        from .script_formats import format_block as _script_block
    except (ImportError, ValueError):
        from script_formats import format_block as _script_block
    script_block = _script_block(script_id) if script_id else ""
    # 화자 지시는 카테고리에 따라 갈린다. 'BJ 이슈왕' 은 뉴스 1인 브리핑 전용.
    _speaker_directive = (
        'speaker는 전부 "BJ 이슈왕"으로 통일 (TTS 호환).'
        if _speaker_for(category) == "BJ 이슈왕" else
        'speaker는 전부 "나레이터"로 통일 (TTS 호환).'
    )
    prompt = f"""
    [선택된 카테고리: {template_name}]
    {role_intro}
    아래 [벤치마킹 패턴](훅 구조, 전개 속도, CTA 방식, 문체)을 계승해 [새 주제] 전용 풀 패키지를 작성하라.
    {_speaker_directive}

    [작성 규칙 - 위반 시 실패작]
    1. 분량: 목표 {duration}초. 초당 3.5음절 기준으로 대본을 채울 것. 2~3개 장면으로 끝내지 마라.
    2. 장면 수: 최소 {min_scenes}개 이상, 최대 {_max_scenes}개 이하. 각 장면 8~12초 분량, 대사는 3~4문장.       나레이션은 한 문장 15자 내외로 짧게 쓸 것. narration_ko를 비울 수 있는 장면은 전체 중 최대 2개까지이며,
       빈 장면은 반드시 subtitle_ko에 계량을 넣을 것. HOOK·CTA·INGREDIENTS의 narration_ko는 절대 비우지 마라.
       narration_ko는 장면 1초당 공백 제외 4~5자 이내로 쓴다.
       60초 영상이면 장면당 25~30자로 채워야 목표 길이에 맞는다. 이 길이를 절대 넘지 마라.
       duration_sec는 대사 글자수 ÷ 3.5로 계산한다. (예: 28자 → 8초)
       장면당 대사 길이는 장면 시간(초) × 3.5자로 계산한다. (예: 10초 장면 → 35자)
    3. 섹션 구성 (순서 고정, section 값은 아래 영문 태그 그대로):
{sections_spec}
       - MAIN이 여러 개면 같은 태그를 반복 사용해도 된다.
       - 섹션 태그는 분류용 표식일 뿐이다. HOOK 다음에 곧바로 STEP이 와도 된다.
         실제로 사람이 읽는 대본의 서술 순서는 아래 [최종 적용] 블록의 '서술 순서'를 따른다.
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
    - **마지막 장면은 반드시 CTA 문장으로 끝낸다.** 조리 설명으로 끝내지 마라.
      (예: "이 계정 계속 따라오시면 매주 하나씩 공유해요")
    - storyboard 각 아이템의 키는 section/speaker/narration_ko/subtitle_ko/sfx/duration_sec/visual 만 사용하라.
      dialogue/scene/voice 키 금지.

    [벤치마킹 패턴 - 구조·속도·CTA 방식만 참고하고, 포함된 대본 초안은 다른 영상의 것이므로 절대 베끼지 마라]
    {pattern_text}

    [스타일 반영]
    - 위 [분석된 스타일]이 있으면 훅·CTA·톤·문장 패턴을 그대로 유지한다. 단, 대사 내용은 새 주제에 맞게 다시 쓴다.
    - 문장 패턴은 해당 표현을 실제로 써보되, 같은 문장을 3번 이상 반복하지 않는다.
    - 전개 속도가 '빠름'이면 씬당 8~12초, '느림'이면 12~18초로 맞춘다.
    - [문장 패턴]에 나온 어미(예: '~어 주세요', '~면서', '~다가')를 반드시 대사에 쓴다.
      하나도 안 쓰면 분석이 무의미해진다. 최소 하나 이상을 자연스럽게 끼워 넣는다.

    [웹 검색 근거 - 배경 이해용으로만 읽고, 수치는 아래 확정 팩트만 사용하라]
    {(evidence_block[:800] + '...') if facts_text and len(evidence_block) > 800 else (evidence_block if evidence_block else '(근거 없음)')}

    [카테고리 전용 지침 - 위 일반 규칙보다 우선 적용]
    {category_instructions}
    {extra_block}
    {modular_block}
    {script_block}

    [확정 팩트 - 대본의 모든 수치는 이 목록에서만 가져와라, 목록 외 수치는 절대 지어내지 마라]
    {facts_text if facts_text else '(확정 팩트 없음 - 아래 규칙을 따를 것)'}

    [작성 규칙 추가]
    - 각 장면 대사에는 확정 팩트의 구체 수치를 1개 이상 포함하되, HOOK·CTA는 예외로 한다
    - 확정 팩트에 없는 수치는 절대 지어내지 마라. 없으면 수치 없이 쓰거나 '기호에 맞게'로 표현하라
    - {numeric_rule}
    - 출처 사이트명(만개의레시피, 블로그명 등)을 대사에 언급하지 마라

    [새 주제]
    {topic}
    """
    result_json = _call_storyboard_json(prompt, what="stage1")
    items = result_json.get("storyboard", [])
    # 모델이 최대 장면 수를 무시하고 더 많이 만들 수 있다. 넘치면 뒤에서 자른다.
    # (앞을 자르면 오프닝/핵심이 사라지고, HOOK은 반드시 첫 장면에 있어야 한다.)
    if len(items) > _max_scenes:
        print(f"[Shorts Trim] {len(items)}개 장면이 최대 {_max_scenes}개를 초과해 뒤에서 잘랐다.")
        items = items[:_max_scenes]
    if not items:
        raise ValueError("대본 생성 결과가 비어 있습니다.")

    # 대사 길이 강제(30자) + duration_sec 재계산은 모든 후처리 이후에 적용한다.
    # (Repair/Tone 패스가 items를 교체하면 Cap이 소실되므로 마지막에 해야 한다)

    # 분량 미달 시 1회 확장 (같은 스키마로 추가 장면 요청)
    def _total(itms):
        t = 0.0
        for it in itms:
            try:
                from .generator import calculate_duration
            except (ImportError, ValueError):
                from generator import calculate_duration
            tx = _narration_of(it)
            tx = re.sub(r'\(.*?\)', '', tx).strip()
            t += (calculate_duration(tx) if tx else min(max(float(it.get("duration_sec") or 3), 1.0), 15.0)) + 0.5
        return t

    if _total(items) < duration * _MIN_RATIO and len(items) < _max_scenes:
        last = "\n".join(f"- {i.get('section', '')}: {_narration_of(i)}" for i in items[-3:])
        ext_prompt = f"""
        위 대본은 {len(items)}개 장면으로 목표 {duration}초에 못 미친다.
        같은 주제({topic})로 이어지는 추가 장면 {max(2, min_scenes - len(items))}개를 같은 JSON 스키마(storyboard 배열)로만 출력하라.
        섹션은 MAIN/SECRET_TIP/CTA 중에서 이어지는 것만 사용하고 HOOK은 반복하지 마라.
        아이템 키는 section/speaker/narration_ko/subtitle_ko/sfx/duration_sec/visual 만 사용하라.
        앞부분 마지막 3장면:
        {last}
        """
        try:
            ext_json = _call_storyboard_json(ext_prompt, what="extend")
            ext_items = ext_json.get("storyboard", [])
            if ext_items:
                items = items + ext_items
                print(f"[Shorts Extend] Added {len(ext_items)} scenes.")
        except Exception as ext_e:
            print(f"[Shorts Extend] failed: {ext_e}")

    # 확장은 장면 수를 다시 세지 않고 그대로 붙인다. 그래서 여기서 한 번 더 정리한다.
    # (확장 결과가 최대 장면 수를 넘으면 뒤를 자르고, 대사가 빈 장면은 뺀다)
    if len(items) > _max_scenes:
        print(f"[Shorts Trim] 확장 후 {len(items)}개가 최대 {_max_scenes}개를 초과해 뒤에서 잘랐다.")
        items = items[:_max_scenes]
    items = [it for it in items if _narration_of(it).strip()]
    if len(items) < min_scenes:
        print(f"[Shorts Scenes] {len(items)}개로 요청 {min_scenes}개에 못 미친다(장면당 시간이 늘어 영상 길이는 유지).")

    script_list, scene_guide_list, current_time = _convert_storyboard_items(
        items, 0, 0, allow_empty_text=True, default_speaker=_speaker_for(category))
    if not script_list:
        raise ValueError("모델 응답에 유효한 장면이 없습니다. 다시 생성을 눌러주세요.")

    # 계량 검증: (1) 숫자 아예 없음  (2) 숫자는 있는데 단위가 없음 ('국간장 1과', '통깨 0.5')
    _EXEMPT_SEC = ("HOOK", "CTA", "INGREDIENTS")
    _UNIT_AFTER = (
        r"^\s*(?:/\s*\d+(?:\.\d+)?\s*)?"
        r"(?:g|kg|ml|L|㎖|큰술|작은술|중술|스푼|티스푼|tablespoon|teaspoon|컵|공기|인분|쪽|개|장|대|모|알|통|봉지|팩|병|그릇|접시|냄비|분|초|도|도금|번|가지|뭉치|T|S)"
    )
    import re as _re2
    _no_num, _no_unit = [], []
    for i, s in enumerate(script_list):
        if (scene_guide_list[i].get("section", "") or "").upper() in _EXEMPT_SEC:
            continue
        txt = (s.get("text", "") or "") + " " + (s.get("subtitle", "") or "")
        nums = list(_re2.finditer(r"\d+(?:\.\d+)?", txt))
        if not nums:
            _no_num.append(i)
            continue
        good = sum(1 for m in nums if _re2.match(_UNIT_AFTER, txt[m.end():]))
        if good == 0:
            _no_unit.append(i)

    # 확정 팩트가 없으면 없는 숫자를 지어낼 수 없으므로 단위 누락만 고친다.
    _need_fix = _no_unit + (_no_num if facts_text else [])
    numbered = "\n".join(
        f"{i + 1}. [{scene_guide_list[i].get('section', '')}] {s.get('text', '')}"
        for i, s in enumerate(script_list)
    )

    if _need_fix:
        _why = []
        if _no_num and facts_text:
            _why.append(f"숫자 없는 장면 {len(_no_num)}개 → 확정 팩트 수치 삽입")
        if _no_unit:
            _why.append(f"단위 없는 장면 {len(_no_unit)}개 → 단위 첨부")
        print(f"[Shorts Repair] {len(_need_fix)} scenes need unit/measure fix ({'; '.join(_why)})...")
        repair_prompt = f"""
        아래 {len(script_list)}개 장면 대본에서 계량 문제를 고쳐라.
        - 숫자가 아예 없는 장면: 확정 팩트 수치를 넣어라.
        - 숫자는 있는데 단위가 빠진 장면: 반드시 단위를 붙여라
          (나쁜 예: '국간장 1과', '버터 2를', '통깨 0.5를' → '국간장 1큰술', '버터 2큰술', '통깨 0.5큰술').
          단위는 g, ml, 큰술, 작은술, 스푼, 컵, 개, 장, 대, 통, 분, 초, 도만 사용한다.
          분량을 지어내지 말고, 모르면 확정 팩트에 있는 값만 쓴다.
        구조·순서·섹션·문체는 그대로 두고 대사 텍스트만 수정,
        전체를 같은 JSON 스키마(title/hook_idea/tone_and_manner/hashtags/storyboard)로 다시 출력하라.
        storyboard 아이템 키는 section/speaker/narration_ko/subtitle_ko/sfx/duration_sec/visual 만 사용하라.
        **[매우 중요] 장면 개수를 절대로 바꾸지 마라. 지금 {len(script_list)}개를 그대로 {len(script_list)}개로 출력하라.**
        (개수가 하나라도 달라지면 이 수정을 통째로 버린다 — 실측으로 자주 걸림)

        [확정 팩트]
        {(facts_text[:1500]) if facts_text else '(확정 팩트 없음)'}

        [현재 대본]
        {numbered}
        """
        try:
            rep_json = _call_storyboard_json(repair_prompt, what="repair")
            rep_items = rep_json.get("storyboard", [])
            if rep_items and len(rep_items) == len(items):
                _rs, _rg, _rt = _convert_storyboard_items(
                    rep_items, 0, 0, allow_empty_text=True,
                    default_speaker=_speaker_for(category))
                if _rs:
                    items = rep_items
                    result_json = rep_json
                    script_list, scene_guide_list, current_time = _rs, _rg, _rt
                    print("[Shorts Repair] applied.")
                else:
                    print("[Shorts Repair] skipped (repair returned empties, keeping original).")
            else:
                # 조용히 넘어가면 단위 수정이 사라진 걸 아무도 모른다(스텁 매트릭스에서 발견).
                print(f"[Shorts Repair] 개수 불일치로 수정이 버려졌다 "
                      f"(요청 {len(items)}개, 응답 {len(rep_items)}개). "
                      f"단위 고정이 적용되지 않았다. 원본 유지.")
        except Exception as rep_e:
            print(f"[Shorts Repair] failed: {rep_e}")

    # 톤/구조 준수 검사 + 1회 재생성.
    # 톤 수리 패스는 제거했다. 실측에서 "still violating"이 대부분이라 추가 LLM 호출
    # 대비 효과가 거의 없었고, 프롬프트가 단순해지면서 style_enforce_block로 대체한다.

    # 첫 문장 예시 복사 강제 재생성.
    # 실측: '배달 시키면 손해입니다'가 여러 프리셋에서 그대로 나왔다. 프롬프트에
    # '복사하지 말라'고 써도 예시가 하나뿐이면 모델은 그 예시를 따라 쓴다.
    # 프롬프트에서는 예시 문장을 빼고(구조만 설명) 여기서 결과물을 실제로 고친다.
    _HOOK_BANNED = ("배달 시키면", "집에서 났습니다", "안 만들 이유가 있나요", "금방 끝납니다")
    if items:
        _f0 = _narration_of(items[0])
        _hit = next((b for b in _HOOK_BANNED if b in _f0), None)
        if _hit:
            try:
                _hp = (
                    f"첫 문장만 다시 써라. 지금 첫 문장: '{_f0[:60]}'\n"
                    f"이 문장에 '{_hit}'이 들어 있어 프롬프트의 예시 문장을 그대로 베낀 것이다.\n"
                    f"이번 메뉴 '{topic}'에 맞는 새 첫 문장으로 바꿔라.\n"
                    f"같은 반전/공감 구조는 유지하되 실제 문구는 새로 써야 한다. 20~30자.\n"
                    f"나머지 {len(items) - 1}개 장면은 절대 건드리지 말고 그대로 둔다.\n"
                    f"같은 JSON 스키마로 전체를 다시 출력하라."
                )
                _hj = _call_storyboard_json(_hp, what="hookfix")
                _hi = _hj.get("storyboard", [])
                if _hi and len(_hi) == len(items):
                    _new0 = _narration_of(_hi[0]).strip()
                    if _new0 and not any(b in _new0 for b in _HOOK_BANNED):
                        _set_narration(items[0], _new0)
                        # 자막도 함께 맞춰야 첫 화면 문구가 남지 않는다.
                        _old_sub = str(items[0].get("subtitle_ko") or "").strip()
                        if _old_sub and _old_sub in _f0:
                            items[0]["subtitle_ko"] = _new0
                        print(f"[Shorts Hook] 예시 복사 감지 → 첫 문장을 '{_new0[:40]}'로 교체했다.")
                    else:
                        print("[Shorts Hook] 교체 시도했지만 여전히 예시 문장이라 원본을 유지했다.")
                else:
                    print("[Shorts Hook] shape 불일치로 첫 문장을 유지한다.")
            except Exception as hook_e:
                print(f"[Shorts Hook] 교체 실패(원본 유지): {hook_e}")

    # 마지막 장면 CTA 강제: 프롬프트 지시만으로는 모델이 조리 장면으로 끝낸다.
    if resolved_axes and items:
        try:
            from .recipe_prompts import _AXIS_MAPS as _AX
        except (ImportError, ValueError):
            from recipe_prompts import _AXIS_MAPS as _AX
        _cta_key = resolved_axes["cta"]
        _last = items[-1]
        _last_txt = _narration_of(_last)
        _cta_sig = {"save": "저장", "comment": "댓글", "subscribe": "구독",
                    "follow": "따라오", "emotion": "많이 먹", "ask_viewer": "여러분"}.get(_cta_key, "")
        if _cta_sig and _cta_sig not in _last_txt:
            # 중간 장면에 이미 CTA가 있으면 그 장면만 비운다.
            # 인덱스 0(훅)은 절대 건드리지 않는다 — 1번 장면이 지워지면 대본이
            # 도발 문장으로 시작하지 않아 앞에서 고친 훅 수정이 그대로 무너진다.
            _dup = [i for i in range(1, len(items) - 1)
                    if _cta_sig in _narration_of(items[i])]
            for i in _dup:
                print(f"[Shorts CTA] 중복 CTA가 있던 {i + 1}번 장면을 비웠다.")
                _set_narration(items[i], "")
            # 예전엔 이 문장으로 '덮어썼다'. 그 결과 마지막 장면이 11자로 뭉개져
            # 9.5초 장면 중 7초가 무음이 되었다(실측). 프롬프트에 "10자 단문 금지"를
            # 써도 코드가 강제로 짧게 만들어 버렸다.
            # 지금은 모델이 쓴 마지막 대사를 남기고 CTA 문장을 '이어붙인다'.
            # 조리 내용을 살리면서 길이는 늘어나고, 길이 부족은 뒤의 보강 패스가 메운다.
            _cta_tail = {
                "save": "나중에 해먹으려면 저장해두세요.",
                "comment": "오늘 저녁은 어떠신가요? 댓글로 남겨주세요.",
                "subscribe": "다음 편에서 더 맛있는 레시피로 찾아올게요. 구독하세요.",
                "follow": "이 계정 계속 따라오시면 매주 하나씩 공유해요.",
                "emotion": "완성입니다. 이대로 차려 먹으면 밥 한 끼 충분해요.",
                "ask_viewer": "여러분은 뭐 넣으면 더 맛있어요? 댓글로 알려주세요.",
            }.get(_cta_key, "")
            _cta_caption = {
                "save": "오늘 레시피 저장해두세요",
                "comment": "댓글로 다음 레시피 요청하기",
                "subscribe": "구독하고 다음 편 보기",
                "follow": "이 계정 계속 팔로우하기",
                "emotion": "오늘 레시피 저장해두세요",
                "ask_viewer": "댓글로 알려주세요",
            }.get(_cta_key, "")
            _merged_cta = (_last_txt.strip() + " " + _cta_tail).strip() if _last_txt.strip() \
                else _cta_tail
            _set_narration(_last, _merged_cta)
            # 대사를 CTA로 바꾸면 자막도 같이 바꿔야 한다(실측: 이전 조리 자막이 남았음)
            _last["subtitle_ko"] = _cta_caption
            _last["section"] = "CTA"
            # script_list/scene_guide_list는 여기서 직접 건드리지 않는다.
            # _convert_storyboard_items가 내부적으로 짧은 조각을 합치므로
            # items와 인덱스가 어긋난다(실측: 4개 → 2개 병합). 마지막에 items로
            # 다시 변환하므로 여기서 건드릴 필요가 없다.
            print(f"[Shorts CTA] 마지막 장면을 {_cta_key} CTA로 교체했다(자막 동기화).")

    # 섹션 정보 유지 (Step2 뱃지 표시용, section/type 둘 다 허용)
    for sc, it in zip(scene_guide_list, items):
        sec = (str(it.get("section") or it.get("type") or "")).strip().upper()
        if sec:
            sc["section"] = sec
    _repair_scene_keywords(scene_guide_list, items, topic)

    # 빈 대사 장면 제거.
    # CTA 중복 제거가 남긴 빈 문자열 대사(실측: 3분 대본 8번)가 그대로 결과에 노출되면
    # TTS가 읽을 게 없는 0자 장면이 된다. 자막만 남아 있어도 제거한다.
    _before = len(items)
    items = [it for it in items if _narration_of(it).strip()]
    if len(items) < _before:
        print(f"[Shorts Cleanup] 대사가 빈 장면 {_before - len(items)}개를 제거했다.")
    if not items:
        raise ValueError("대본 생성 결과가 비어 있습니다.")

    # 대사 길이 강제(길이 비례) + duration_sec 재계산 — 모든 후처리의 마지막에 적용한다.
    # Repair/Tone 패스가 items를 교체하면 이전 Cap이 소실되므로 여기서 해야 한다.
    # duration_sec는 대사 길이가 아니라 목표 길이를 장면 수로 나눈 값으로 고정한다.
    # (대사가 짧으면 무음 공백이 생기지만 문장은 안 잘린다)
    #
    # 아래 루프는 장면 사이에 0.5초 공백(SCENE_GAP_SEC)을 넣는다. 그 공백을
    # 빼지 않고 duration/N만 쓰면 총합이 duration + 0.5*N이 되어 180초가
    # 189초로 밀린다(실측: 300→315, 600→630, 30→34). 오디오는 마스터이므로
    # 이런 silent overshoot는 그대로 안 된다.
    # 단위 정규화: 프롬프트에 '큰술' 이라고 지시해도 LLM 은 '1T' 를 쓴다(실측).
    # 자막/나레이션이 다르면 화면과 TTS 가 다른 분량을 말하는 셈이므로 둘 다 고친다.
    _unit_fixed = 0
    for it in items:
        before = _narration_of(it)
        _normalize_item_units(it)
        if _narration_of(it) != before:
            _unit_fixed += 1
    if _unit_fixed:
        print(f"[Shorts Units] {_unit_fixed}개 장면의 단위 표기를 큰술/작은술로 고쳤다.")

    _gap = 0.5
    _n = max(1, len(items))
    _per_scene = max(3.0, (duration - _gap * _n) / _n)
    # cap/floor은 프롬프트에 준 것과 같은 자릿수를 써야 한다. 여기서 별도 상수를 쓰면
    # '목표 52자'라 해놓고 40자로 잘라버리는 일이 된다(그게 실측 버그였다).
    _cps = _density.get("chars_per_sec") or DENSITY_CPS_FALLBACK
    try:
        _cps = float(_cps)
    except (TypeError, ValueError):
        _cps = DENSITY_CPS_FALLBACK
    # _target: 그 장면에서 말해야 하는 분량(1초당 공백 제외 _cps자).
    # _cap   : 허용 상한. 비율은 항상 CAP_MAX_RATIO 하나로 통일한다
    #          (예전엔 여기만 1.11배라 프롬프트의 '초당 7자'와 어긋났다).
    _target = round(_per_scene * _cps)
    _cap = max(40, min(240, round(_target * CAP_MAX_RATIO)))
    # 원본이 '재료+양념을 한 문장에 몰아넣는' 밀집형 문법이면 문장당 상한을 올린다.
    # 실측: 신즈 '역대급 레시피'는 어미 조각(~ 준비해 주고)을 살리려면 45자+가 필요했는데
    # 30초 장면 상한(33자)에 잘려 전부 사라졌다. 상한을 올려도 시간 배정은 그대로라
    # 영상 길이는 안 늘어난다(오디오가 짧으면 무음 공백이 될 뿐).
    # 톤별 대사 상한.
    # 실측: bracket_quirk/자조개그는 대괄호 독백·농담 한 마디가 통째로 잘려나갔다.
    # (30초 장면 상한 33자 vs 독백 '[이거 안 태우면 어떡하지...]' 19자 + 서술 20자)
    # 톤 rule이 '필수'라고 말해도 모델이 100% 지킨다는 보장이 없어 길이 상한을 함께 푼다.
    _tone_now = str((resolved_axes or {}).get("tone") or "")
    if _tone_now in ("bracket_quirk", "self_deprecating"):
        _cap = max(_cap, _target)
        print(f"[Shorts Cap] {_tone_now} 톤 → 독백이 잘리지 않도록 상한 {_cap}자로 완화")
    for it in items:
        tx = _narration_of(it)
        if len(tx) > _cap:
            trimmed = trim_narration_to_target(tx, _target, max_ratio=CAP_MAX_RATIO)
            # Cap이 빈 문자열로 자르면 조리 정보가 통째로 사라진다. 자르지 않고 되돌린다.
            if not trimmed:
                print(f"[Shorts Cap] 자르다 빈 문자열이 될 수 있어 축약 취소 ({len(tx)}자 유지)")
            else:
                _set_narration(it, trimmed)
                print(f"[Shorts Cap] 대사 {len(tx)}자 -> {len(trimmed)}자로 축약(경계 절단)")
        it["duration_sec"] = _per_scene

    # 하한 검사. Cap은 '너무 긴' 것만 잡으므로 '너무 짧은' 대사는 아무도 못 잡는다.
    # 그 결과 장면 길이만큼 무음이 된다(실측: 김치찌개 60초 = 5장면 각 11.5초,
    # 대사 13~40자 → 실제 발화 약 20초, 나머지 40초 무음).
    _floor = max(8, round(_target * 0.8))
    _thin = [(i, _narration_of(it)) for i, it in enumerate(items)
             if 0 < len(_narration_of(it).replace(" ", "")) < _floor]
    if _thin:
        _thin_detail = ", ".join(
            f"{i + 1}번({len(t)}자/{_per_scene - len(t.replace(' ', '')) / _cps:.1f}초 무음)"
            for i, t in _thin
        )
        _sil_total = sum(max(0.0, _per_scene - len(t.replace(" ", "")) / _cps) for _, t in _thin)
        print(f"[Shorts Density] {len(items)}장면 중 {len(_thin)}개가 대사 부족 "
              f"(목표 {_target}자의 80%={_floor}자 미만, {_per_scene:.1f}초 장면, "
              f"{_cps}자/초 기준). {len(_thin)}개 합계 약 {_sil_total:.0f}초 무음.")
        print(f"[Shorts Density] 부족 장면: {_thin_detail}")
        print(f"[Shorts Density] 무음 원인은 대본이 짧은 것이지 타임라인 계산이 아니다. "
              f"장면 시간을 늘려도 소리는 늘지 않는다.")

    # 보강 패스: 부족한 장면만 LLM에 되돌려 늘린다.
    # 프롬프트 규칙만으로는 안 된다(실측: '43자 목표 ±20%'를 줬는데 6장면 전부
    # 25~30자에 머물렀다. 규칙은 확률이라 안 지킨다). 그래서 확인이 필요하다.
    # LLM을 한 번 더 부르므로 과금된다. 실패해도 원본은 이미 items에 있으므로
    # 더 나빠지지 않는다(되돌리기 실패를 삼키지 않고 조용히 넘어가되 로그를 남긴다).
    if _thin and expand_thin_scenes:
        try:
            _exp_ok = _expand_short_narrations(
                items, _thin, target_chars=_target, cps=_cps,
                cap=_cap, topic=topic, duration=duration,
                resolved_axes=resolved_axes, evidence_block=evidence_block,
                facts_text=facts_text,
            )
            if _exp_ok:
                print(f"[Shorts Fill] {_exp_ok}개 부족 장면을 LLM 보강으로 채웠다.")
        except _FATAL_MODEL_ERRORS:
            raise
        except Exception as _fe:
            print(f"[Shorts Fill] 보강 실패(원본 유지): {str(_fe)[:160]}")


    # 톤 rule 후처리: 브금 개그 / 자조 개그의 특징이 없으면 LLM 재시도 없이 지어 넣는다.
    # (프롬프트 rule에 '필수'라고 써도 모델이 놓친 실측 4/4. 규칙은 확률이라 확인이 필요하다)
    # Cap 뒤에 둔다 — 앞에서는 길이 상한에 잘려 독백만 반쪽 남았다(실측 '[연기만 나면').
    _tone_enforce = str((resolved_axes or {}).get("tone") or "")
    _all_txt = " ".join(_narration_of(it) for it in items)
    if _tone_enforce == "bracket_quirk":
        # 대괄호 독백은 TTS가 읽으면 안 되는 '화면 전용 지문'이다.
        # generator.py:215가 대사에서 대괄호를 통째로 지우므로 narration_ko에 넣으면
        # 100% 증발한다(실측). 원본 무니키친도 화면 자막에만 나오는 독백이다.
        # 1) 모델이 대사에与大括弧 독백을 이미 넣었다면 상단 자막으로 옮겨 살린다.
        for it in items:
            tx = _narration_of(it)
            if "[" in tx and "]" in tx:
                aside = " ".join(re.findall(r"\[[^\]]*\]", tx))
                tx_clean = re.sub(r"\[[^\]]*\]", "", tx)
                tx_clean = re.sub(r"[ \t]{2,}", " ", tx_clean).strip()
                _set_narration(it, tx_clean)
                _add_aside(it, aside)
        # 2) 독백이 아예 없으면 직접 만든다. 질문형 1회 포함.
        if not any(str(it.get("aside_ko") or "").strip() for it in items):
            _qidx = max(1, len(items) // 2)
            _oidx = min(len(items) - 2, _qidx + 1)
            for _i, _g in ((_qidx, "[이거 안 태우면 어떡하지]"),
                           (_oidx, "[연기만 나면 그만이죠]")):
                if _i == _oidx and len(items) < 3:
                    continue
                _add_aside(items[_i], _g)
            print("[Shorts Tone] 브금 개그 독백이 없어 상단 자막에 2회를 직접 넣었다.")
    elif _tone_enforce == "self_deprecating" and not any(
            k in _all_txt for k in ("먹으세", "ㅋㅋ", "제가 제일", "실력이 없어")):
        # 농담은 TTS로 읽혀야 하므로 대사에 붙인다(화면 전용이 아니다).
        _jidx = max(1, len(items) // 2)
        _set_narration(items[_jidx],
                       _narration_of(items[_jidx]).rstrip() + " 요리 실력이 없어도 맛은 있죠.")
        print("[Shorts Tone] 자조 개그 농담이 없어 한 마디를 직접 넣었다.")

    script_list, scene_guide_list, current_time = _convert_storyboard_items(
        items, 0, 0, allow_empty_text=True, default_speaker=_speaker_for(category))

    # keyword/description 복구는 '재구축 이후' 에 해야 한다.
    # 아래 1283행에 같은 복구 루프가 있으나 그것은 items 가 아니라 예전
    # scene_guide_list 를 고친다. 그런데 여기서 _convert_storyboard_items 를 다시
    # 부르면 items 에서 새로 만들기 때문에 그 수정이 통째로 버려진다.
    # 실측: 레시피 6장면 전부 keyword='news' 로 나왔던 원인.
    _repair_scene_keywords(scene_guide_list, items, topic)

    # _convert_storyboard_items는 duration_sec를 무시하고 대사 길이로 시간을
    # 다시 계산한다(generator.py:262). 목표 길이를 맞추려면 여기서 보정해야 한다.
    # 장면 수는 _n이지만 병합 후 실제 장면 수가 줄 수 있어 len(scene_guide_list)를 쓴다.
    _m = max(1, len(scene_guide_list))
    _per_scene = max(3.0, (duration - _gap * _m) / _m)
    _t = 0.0
    for _sc in scene_guide_list:
        _sc["time_start"] = round(_t, 1)
        _sc["time_end"] = round(_t + _per_scene, 1)
        _t += _per_scene + _gap
    # 마지막 공백은 영상의 끝이라 빼지 않는다.
    current_time = round(_t - _gap, 1)

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
    if current_time < duration * _MIN_RATIO:
        out["warning"] = f"요청 {duration}초 중 약 {current_time:.0f}초 분량만 생성되었습니다. 다시 생성을 눌러 보완하세요."
    elif current_time > duration * _MAX_RATIO:
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


def _describe_clip_images(frames, label):
    """프레임들을 Vision으로 2줄 요약. 실패하면 빈 문자열."""
    if not frames:
        return ""
    try:
        text = (_llm_run_text(
            "이 클립 장면을 사람 눈으로 묘사해라. 무엇이 나오는지와 카메라·연출. "
            "해석을 빼고 사실만. 한 문장으로.",
            images=list(frames)) or "").strip()
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

    _get_api_key()   # 폴백 체인이 열쇠를 찾도록 미리 확인

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
            summary = _describe_clip_images(frames, f"clip{i + 1}")
        desc = summary or note or "(분석 생략: 원격 파일)"
        clip_notes.append(f"클립{i + 1} [{source or '?'}]: {desc}")

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
            cand = _llm_run(p, json_mode=True)
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
