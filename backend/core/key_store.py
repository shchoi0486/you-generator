"""API 키 저장소 (BYOK).

왜 별도 모듈인가
  지금 키는 settings.yaml 에 평문이다(앞으로 판매할 소프트웨어인데).
  이 모듈은 세 가지를 한다.
    1) 암호화 저장 — 파일에 평문으로 남지 않게 한다.
    2) 마스킹 조회 — 프론트에는 앞 4자리와 끝 2자리만 보낸다.
    3) 무결성/출처 표시 — 키가 어디서 왔는지(설정 파일/키 저장소)를 구분한다.

암호화 방식
  Fernet(AES128-CBC+HMAC). 키는 data/.apikey.key 에 저장하고 chmod 600 으로 제한한다.
  cryptography 가 없으면 평문 fallback 을 쓰되 그 사실을 키 조회 응답에 '보안' 항목으로
  드러낸다(조용히 평문으로 저장하지 않는다).

저장 위치
  data/provider_keys.enc (settings.yaml 과 분리). 사용자가 지우면 초기화된다.
"""

from __future__ import annotations

import base64
import hashlib
import json
import os
import sys
import threading
from typing import Any, Dict, List, Optional, Tuple

try:
    from cryptography.fernet import Fernet, InvalidToken
    _HAS_CRYPTO = True
except ImportError:  # pragma: no cover
    Fernet = None  # type: ignore
    InvalidToken = Exception  # type: ignore
    _HAS_CRYPTO = False

_LOCK = threading.Lock()
_MEM: Optional[Dict[str, str]] = None


def _data_dir() -> str:
    """키 저장 디렉토리.

    번들(PyInstaller frozen)에서는 exe 안/옆은 쓰기 불가다. 사용자 데이터
    디렉토리(%LOCALAPPDATA%/YouGenerator)를 써야 키가 재시작에도 남고
    설치 폴더를 옮겨도 안 사라진다.
    """
    if getattr(sys, "frozen", False):
        base = os.environ.get("LOCALAPPDATA") or os.path.expanduser("~")
        d = os.path.join(base, "YouGenerator", "data")
    else:
        here = os.path.dirname(os.path.abspath(__file__))
        d = os.path.join(os.path.dirname(here), "data")
    os.makedirs(d, exist_ok=True)
    return d


def _key_path() -> str:
    return os.path.join(_data_dir(), ".apikey.key")


def _store_path() -> str:
    return os.path.join(_data_dir(), "provider_keys.enc")


def _fernet():
    if not _HAS_CRYPTO:
        return None
    kp = _key_path()
    if os.path.exists(kp):
        with open(kp, "rb") as f:
            return Fernet(f.read().strip())
    # 키를 키에서 유도하지 않는다. 별도 파일이 있어야 회전/폐기 가능하다.
    k = Fernet.generate_key()
    with open(kp, "wb") as f:
        f.write(k)
    try:
        os.chmod(kp, 0o600)
    except Exception:
        pass  # Windows 는 ACL 로 관리한다
    return Fernet(k)


def _load() -> Dict[str, str]:
    global _MEM
    with _LOCK:
        if _MEM is not None:
            return _MEM
        p = _store_path()
        raw = {}
        if os.path.exists(p):
            try:
                with open(p, "rb") as f:
                    blob = f.read()
                fn = _fernet()
                if fn is not None:
                    raw = json.loads(fn.decrypt(blob).decode("utf-8"))
                else:
                    raw = json.loads(blob.decode("utf-8"))
            except Exception:
                raw = {}   # 복구 불가 → 빈 저장소로 시작(사용자를 막지 않는다)
        _MEM = {str(k): str(v) for k, v in (raw or {}).items()}
        return _MEM


def _save(d: Dict[str, str]) -> None:
    global _MEM
    with _LOCK:
        payload = json.dumps(d, ensure_ascii=False).encode("utf-8")
        fn = _fernet()
        blob = fn.encrypt(payload) if fn is not None else payload
        with open(_store_path(), "wb") as f:
            f.write(blob)
        try:
            os.chmod(_store_path(), 0o600)
        except Exception:
            pass
        _MEM = dict(d)


def put(key_id: str, value: str) -> None:
    """키 저장. 빈 문자열이면 삭제."""
    v = (value or "").strip()
    d = dict(_load())
    if v:
        d[key_id] = v
    else:
        d.pop(key_id, None)
    _save(d)


def get(key_id: str) -> Optional[str]:
    return _load().get(key_id)


def resolve_key(name: str, config: Optional[dict] = None,
                env: Optional[str] = None) -> str:
    """키 해석 우선순위.

        1) 암호화 BYOK 저장소 (data/provider_keys.enc) — 앱 'API 키' 화면
        2) settings.yaml                            — 레거시/개발용
        3) 환경변수                                  — 서버 배포용

    이 함수를 쓰면 settings.yaml 에서 키를 직접 읽던 레거시 코드가 자동으로
    BYOK 저장소를 먼저 보게 된다. 사용자가 등록한 키는 settings.yaml 을
    거치지 않으므로 빌드에 실려 나갈 수도 없다.
    """
    if not name:
        return ""
    v = get(name)
    if v:
        return v
    if config:
        for sect in (config, config.get("image_gen"), config.get("video_gen"),
                     config.get("tts"), config.get("llm")):
            if isinstance(sect, dict):
                v = sect.get(name)
                if isinstance(v, str) and v.strip() and "YOUR_" not in v:
                    return v.strip()
    if env:
        return (os.environ.get(env) or "").strip()
    return ""


def delete(key_id: str) -> bool:
    d = dict(_load())
    if key_id in d:
        del d[key_id]
        _save(d)
        return True
    return False


def has(key_id: str) -> bool:
    return bool(_load().get(key_id))


def mask(value: str) -> str:
    """앞 4 / 끝 2 만 남긴다. 8자 미만은 전부 마스킹(짧은 키가 새지 않게)."""
    v = (value or "").strip()
    if len(v) <= 8:
        return ("*" * max(len(v), 4))
    return f"{v[:4]}{'*' * (len(v) - 6)}{v[-2:]}"


def list_masked() -> Dict[str, str]:
    return {k: mask(v) for k, v in _load().items()}


def clear_all() -> None:
    _save({})


def security_status() -> Dict[str, Any]:
    fn = _fernet()
    return {
        "encrypted": bool(fn is not None),
        "method": "Fernet(AES128-CBC+HMAC)" if fn is not None else "PLAINTEXT FALLBACK",
        "warning": None if fn is not None else (
            "cryptography 가 설치되어 있지 않아 키가 평문으로 저장됩니다. "
            "pip install cryptography 를 권장합니다."),
        "store_path": _store_path(),
        "count": len(_load()),
    }


def fingerprint(value: str) -> str:
    """키 지문(앞 8자 해시). 사용자에게 '어떤 키가 들어있는지' 보여줄 때 쓴다."""
    return hashlib.sha256((value or "").encode("utf-8")).hexdigest()[:8]


# 알려진 접두사. '정보다'.
#
# 2026-09-27 교정: gemini_api_key 를 'AIza' 로만 거절했다가 사용자 키가
# 'AQ.Ab' 형식이라 저장이 막혔다. 실제로 그 키는 정상이었다
# (models 조회 HTTP 200, tokeninfo 는 400 이므로 OAuth 가 아님).
# 즉 Google 이 AIza 이외의 새 형식을 발급하고 있고, 접두사로 거절하면
# 정당한 키를 사용자에게 '잘못된 키' 라고 말하는 셈이 된다.
# 그래서 접두사는 '알려줄 뿐' 막지 않는다. 진짜 판정은 실제 API 호출이 한다.
KNOWN_PREFIXES: Dict[str, Tuple[str, ...]] = {
    "gemini_api_key": ("AIza", "AQ."),
    "cloudflare_api_token": ("cfat_", "cfsk_", "v1.0-"),
    "openai_api_key": ("sk-",),
    "fal_api_key": ("",),          # fal_ 로 시작하지만 형식이 자주 바뀐다
    "pexels_api_key": (),
    "minimax_api_key": (),
    "elevenlabs_api_key": (),
    "qwen_api_key": (),
    "deepseek_api_key": (),
    "kling_api_key": (),
    "seedream_api_key": (),
    "azure_speech_key": (),
    "typecast_api_key": (),
    "pollinations_api_key": (),
    "cloudflare_worker_url": ("https://",),
    "cloudflare_account_id": (),
}

# 이 접두사는 '확실히 다른 서비스의 키' 다. 이때만 저장을 막는다.
FOREIGN_PREFIX_HINTS: Dict[str, Tuple[Tuple[str, str], ...]] = {
    # (다른 서비스의 접두사, 그 서비스 이름)
    "gemini_api_key": (("sk-", "OpenAI"), ("cfat_", "Cloudflare"),
                       ("fal_", "fal.ai"), ("sk_", "ElevenLabs")),
    "openai_api_key": (("AIza", "Google"), ("cfat_", "Cloudflare"),
                       ("sk_", "ElevenLabs")),
    "pexels_api_key": (("sk-", "OpenAI"), ("AIza", "Google")),
    "fal_api_key": (("AIza", "Google"),),
}


def validate_format(key_id: str, value: str) -> Optional[str]:
    """형식 검사. '확실히 잘못된' 경우에만 에러를 돌려준다.

    접두사가 낯선 것은 막지 않는다(Google 키 형식 등). 대신 format_note() 으로
    '평소와 다릅니다' 를 알려 주고, 진짜 확인은 실제 API 호출이 담당한다.
    """
    v = (value or "").strip()
    if not v:
        return "키 값이 비어 있습니다."
    if len(v) < 16:
        return "값이 너무 짧습니다(16자 이상이어야 합니다)."

    for prefix, owner in FOREIGN_PREFIX_HINTS.get(key_id, ()):
        if v.startswith(prefix):
            return (f"이 값은 '{owner}' 의 키처럼 보입니다({prefix}...). "
                    f"해당 항목이 아닌 '{key_id}' 에는 들어가지 않습니다.")
    return None


def format_note(key_id: str, value: str) -> Optional[str]:
    """알려줄 만한 비정형 형식. 저장을 막지는 않는다.

    이미 차단되는 값에는 경고를 붙이지 않는다(에러 메시지 하나면 충분하다).
    """
    v = (value or "").strip()
    if not v or validate_format(key_id, v):
        return None
    presets = KNOWN_PREFIXES.get(key_id)
    if not presets or not v:
        return None
    if any(v.startswith(p) for p in presets if p):
        return None
    return (f"보통 '{', '.join(p for p in presets if p)}' 로 시작하는 값입니다. "
            f"형식이 바뀌었을 수 있으니 '검증' 으로 실제 호출을 확인하세요.")
