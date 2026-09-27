"""Gemini 호출 어댑터 (google-genai 신 SDK).

구 패키지(google-generativeai)는 지원 종료됐으므로 신 SDK로 통일한다.
기존 호출 패턴을 그대로 유지하기 위한 얇은 래퍼:
- genai.configure(api_key)  -> configure(api_key)
- genai.GenerativeModel(name) -> get_model(name)
- model.generate_content(x).text (동기)
- model.generate_content_async(x) (비동기)
- 구 멀티모달 파트 {"mime_type","data"} 자동 변환
"""
from google import genai as _genai
from google.genai import types as _types
import warnings

# 신 SDK 자동 함수호출(AFC) 안내 문구는 우리 호출과 무관한 노이즈라 숨김
warnings.filterwarnings(
    "ignore",
    message=".*automatic function calling.*",
)

_client = None
_api_key = None


def configure(api_key):
    """API 키 설정 (기존 genai.configure 대체)."""
    global _client, _api_key
    if not api_key:
        raise ValueError("Gemini API Key is missing.")
    if _client is None or _api_key != api_key:
        _client = _genai.Client(api_key=api_key)
        _api_key = api_key
    return _client


def _get_client():
    if _client is None:
        raise ValueError("Gemini client not configured. Call configure(api_key) first.")
    return _client


def _normalize_contents(contents):
    """구 SDK 파트를 신 SDK 형식으로 변환."""
    if isinstance(contents, str):
        return contents
    if isinstance(contents, (list, tuple)):
        out = []
        for p in contents:
            if isinstance(p, dict) and "data" in p:
                out.append(_types.Part.from_bytes(
                    data=p["data"],
                    mime_type=p.get("mime_type", "image/jpeg"),
                ))
            else:
                out.append(p)
        return out
    return contents


def response_text(resp):
    """응답 텍스트 안전 추출 (차단/빈 응답 시 빈 문자열)."""
    try:
        t = resp.text
        return t if isinstance(t, str) else ""
    except Exception:
        return ""


class GenModel:
    """구 GenerativeModel 대체 래퍼."""

    def __init__(self, model_name, client=None):
        self.model_name = model_name
        self._client = client

    def _cli(self):
        return self._client or _get_client()

    def generate_content(self, contents, config=None):
        """config 는 새 google-genai SDK 의 GenerateContentConfig 다.

        구 SDK 에서는 config={'temperature': ...} 같은 dict 를 받던 않아서
        llm_providers.GeminiAdapter 가 넘겨주던 인자를 버리고 있었다.
        """
        kwargs = {"model": self.model_name,
                  "contents": _normalize_contents(contents)}
        if config:
            from google.genai import types as _types
            if isinstance(config, dict):
                config = _types.GenerateContentConfig(**{
                    k: v for k, v in config.items() if v is not None
                })
            kwargs["config"] = config
        return self._cli().models.generate_content(**kwargs)

    async def generate_content_async(self, contents, config=None):
        kwargs = {"model": self.model_name,
                  "contents": _normalize_contents(contents)}
        if config:
            from google.genai import types as _types
            if isinstance(config, dict):
                config = _types.GenerateContentConfig(**{
                    k: v for k, v in config.items() if v is not None
                })
            kwargs["config"] = config
        return await self._cli().aio.models.generate_content(**kwargs)


def get_model(model_name, client=None):
    return GenModel(model_name, client=client)
