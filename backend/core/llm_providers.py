"""프로바이더 중립 LLM 어댑터.

왜 이 파일이 필요했나
    core/llm.py 는 Gemini SDK 를 그대로 감싼 래퍼였다. 그래서 대본이 Gemini 만
    쓸 수 있었고, 사용자가 정한 "DeepSeek 주력 / Qwen 백업" 결론이 코드에
    반영될 자리가 아예 없었다. providers.yaml 에 DeepSeek 을 적어두어도
    어댑터가 없으니 '코드 없음' 으로만 떴다.

설계
    LLMAdapter.generate() -> str  하나만 구현하면 된다.
    DeepSeek 와 Qwen(DashScope) 은 둘 다 OpenAI 호환 /chat/completions 를
    제공하므로 OpenAICompatAdapter 하나로 둘을 처리한다.
    즉 어댑터 종류는 '프로토콜' 기준이지 '브랜드' 기준이 아니다.
    새 vendors 는 YAML 에 base_url 만 추가하면 된다.

비용
    대본은 토큰이 아니라 '편당 생성 횟수' 가 비용을 결정한다(긴 대본을 자주).
    그래서 requests 는 광범위하게 쓰고 SDK 는 Gemini(스트리밍/멀티모달) 만 쓴다.
"""
from __future__ import annotations

import json
import os
import re
import threading
from typing import Any, Dict, List, Optional

_LOCK = threading.RLock()
_JSON_BLOCK = re.compile(r"```(?:json)?\s*(.*?)```", re.S)


class LLMError(RuntimeError):
    """프로바이더 호출 실패. 폴백 체인이 이걸 보고 다음 모델로 간다."""


def extract_json(text: str) -> Any:
    """LLM 이 JSON 을 코드펜스나 설명문과 함께 섞어서 돌려주는 habit 을 무마한다.

    기존 shorts_lab._parse_json_response 와 같은 목적이며, 여기서 한 번만 한다.
    """
    s = (text or "").strip()
    if not s:
        raise LLMError("빈 응답")
    # 1) 코드펜스 안쪽
    m = _JSON_BLOCK.search(s)
    if m:
        s = m.group(1).strip()
    # 2) 첫 { 또는 [ 부터 대응하는 괄호까지
    for opener, closer in (("{", "}"), ("[", "]")):
        i = s.find(opener)
        if i == -1:
            continue
        depth = 0
        in_str = False
        esc = False
        for j in range(i, len(s)):
            c = s[j]
            if in_str:
                if esc:
                    esc = False
                elif c == "\\":
                    esc = True
                elif c == '"':
                    in_str = False
                continue
            if c == '"':
                in_str = True
            elif c == opener:
                depth += 1
            elif c == closer:
                depth -= 1
                if depth == 0:
                    try:
                        return json.loads(s[i:j + 1])
                    except json.JSONDecodeError:
                        break
    # 3) 통째로
    try:
        return json.loads(s)
    except json.JSONDecodeError as e:
        raise LLMError(f"JSON 파싱 실패: {str(e)[:80]} / 원문 120자: {s[:120]!r}")


# ── OpenAI 호환 (DeepSeek / Qwen DashScope / 그 외) ────────────────
class OpenAICompatAdapter:
    """POST {base_url}/chat/completions

    YAML 예:
        adapter: openai_compat
        base_url: https://api.deepseek.com
        model_id: deepseek-v4-flash
    """

    name = "openai_compat"

    def __init__(self, provider: Dict[str, Any], api_key: str):
        self.p = provider
        self.key = api_key
        self.base = (provider.get("base_url") or "").rstrip("/")
        if not self.base:
            raise LLMError(f"{provider.get('id')} 에 base_url 이 없습니다")

    def _url(self) -> str:
        base = self.base
        if base.endswith("/chat/completions"):
            return base
        if base.endswith("/v1"):
            return f"{base}/chat/completions"
        return f"{base}/v1/chat/completions"

    def generate(self, prompt: Any, *, system: str = "",
                 max_output_tokens: Optional[int] = None,
                 temperature: Optional[float] = None,
                 json_mode: bool = False,
                 images: Optional[List[bytes]] = None) -> str:
        import requests

        msgs: List[Dict[str, Any]] = []
        if system:
            msgs.append({"role": "system", "content": system})
        if images:
            # OpenAI 호환 비전 형식
            parts: List[Dict[str, Any]] = []
            if isinstance(prompt, str):
                parts.append({"type": "text", "text": prompt})
            else:
                parts.append({"type": "text", "text": str(prompt)})
            import base64 as _b64
            for raw in images:
                parts.append({
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:image/jpeg;base64,{_b64.b64encode(raw).decode()}"
                    },
                })
            msgs.append({"role": "user", "content": parts})
        else:
            msgs.append({"role": "user",
                         "content": prompt if isinstance(prompt, str) else str(prompt)})

        body: Dict[str, Any] = {"model": self.p.get("model_id"), "messages": msgs}
        if max_output_tokens:
            body["max_tokens"] = max_output_tokens
        if temperature is not None:
            body["temperature"] = temperature
        if json_mode:
            body["response_format"] = {"type": "json_object"}

        url = self._url()
        hdrs = {
            "Authorization": f"Bearer {self.key}",
            "Content-Type": "application/json",
        }
        for k, v in (self.p.get("headers") or {}).items():
            hdrs[k] = v

        try:
            r = requests.post(url, headers=hdrs, json=body,
                              timeout=self.p.get("timeout_sec") or 120)
        except Exception as e:
            raise LLMError(f"{self.p.get('id')} 요청 실패: {type(e).__name__} {e}")

        if r.status_code == 429:
            raise LLMError(f"{self.p.get('id')} 429 (할량 초과) — 다음 모델로 폴백")
        if r.status_code == 402:
            raise LLMError(f"{self.p.get('id')} 402 (결제 필요) — 다음 모델로 폴백")
        if r.status_code != 200:
            raise LLMError(f"{self.p.get('id')} HTTP {r.status_code}: {r.text[:180]}")
        try:
            data = r.json()
        except Exception as e:
            raise LLMError(f"{self.p.get('id')} 응답 JSON 아님: {r.text[:150]}")
        try:
            return (data["choices"][0]["message"]["content"] or "")
        except Exception:
            raise LLMError(f"{self.p.get('id')} 응답 형태 이상: {str(data)[:180]}")


# ── Gemini (기존 SDK 경로 유지) ──────────────────────────────────
class GeminiAdapter:
    name = "gemini"

    def __init__(self, provider: Dict[str, Any], api_key: str):
        self.p = provider
        self.key = api_key
        self.model_id = provider.get("model_id") or "gemini-3.5-flash-lite"

    def generate(self, prompt: Any, *, system: str = "",
                 max_output_tokens: Optional[int] = None,
                 temperature: Optional[float] = None,
                 json_mode: bool = False,
                 images: Optional[List[bytes]] = None) -> str:
        from . import llm as _gem

        # 클라이언트를 직접 준비한다. 예전엔 shorts_lab 이 호출 전에
        # configure() 를 해줬는데, 이제 폴백 체인이 각자 알아서 해야 한다
        # (DeepSeek 이 먼저 성공하면 Gemini 는 아예 configure 안 된다).
        try:
            _gem.configure(self.key)
        except Exception as e:
            raise LLMError(f"Gemini 클라이언트 준비 실패: {e}")

        cfg: Dict[str, Any] = {}
        if temperature is not None:
            cfg["temperature"] = temperature
        if max_output_tokens:
            cfg["max_output_tokens"] = max_output_tokens
        if json_mode:
            cfg["response_mime_type"] = "application/json"

        full = f"{system}\n\n{prompt}" if system else prompt
        parts: Any = full
        if images:
            from google.genai import types as _t
            items: List[Any] = [_t.Part.from_text(text=full)]
            for raw in images:
                items.append(_t.Part.from_bytes(data=raw, mime_type="image/jpeg"))
            parts = items

        try:
            model = _gem.get_model(self.model_id)
        except Exception as e:
            raise LLMError(f"Gemini 클라이언트 실패: {e}")
        try:
            resp = model.generate_content(parts, config=cfg or None)
        except Exception as e:
            msg = str(e)
            if "429" in msg or "RESOURCE_EXHAUSTED" in msg:
                raise LLMError(f"{self.model_id} 429 (할량 초과) — 다음 모델로 폴백")
            raise LLMError(f"{self.model_id} 실패: {msg[:180]}")
        return _gem.response_text(resp)


ADAPTERS = {
    "openai_compat": OpenAICompatAdapter,
    "gemini": GeminiAdapter,
}


def build(provider: Dict[str, Any], api_key: str):
    name = provider.get("adapter") or ""
    cls = ADAPTERS.get(name)
    if not cls:
        raise LLMError(f"'{name}' 어댑터가 없습니다 (연결 코드 없음)")
    return cls(provider, api_key)


# ── 폴백 체인 ─────────────────────────────────────────────────────
def generate_chain(
    providers: List[Dict[str, Any]],
    prompt: Any,
    *,
    system: str = "",
    max_output_tokens: Optional[int] = None,
    temperature: Optional[float] = None,
    json_mode: bool = False,
    images: Optional[List[bytes]] = None,
    parse_json: bool = False,
) -> Any:
    """providers 를 앞에서부터 시도한다. 전부 실패하면 마지막 사유를 낸다.

    앞의 하나가 '키 없음' 이면 조용히 건너뛴다(/ruins 를 낭비하지 않기 위해).
    """
    last = "사용 가능한 LLM 이 없습니다"
    for p in providers:
        if not p.get("enabled", True):
            continue
        key_env = p.get("key_env")
        key = ""
        if key_env:
            from . import key_store
            from .provider_registry import registry
            try:
                key = registry.resolve_key({"key_env": key_env}) or ""
            except Exception:
                key = ""
        if key_env and not key:
            last = f"{p.get('id')}: API 키 없음"
            continue
        try:
            ad = build(p, key)
            out = ad.generate(
                prompt, system=system,
                max_output_tokens=max_output_tokens,
                temperature=temperature, json_mode=json_mode,
                images=images,
            )
        except LLMError as e:
            last = f"{p.get('id')}: {e}"
            continue
        except Exception as e:
            last = f"{p.get('id')}: {type(e).__name__} {str(e)[:140]}"
            continue
        if not (out or "").strip():
            last = f"{p.get('id')}: 빈 응답"
            continue
        if parse_json:
            try:
                return extract_json(out)
            except LLMError as e:
                last = f"{p.get('id')}: {e}"
                continue
        return out
    raise LLMError(last)
