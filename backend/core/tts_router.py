"""providers.yaml 과 tts_engine.py 를 잇는 다리.

왜 필요한가
    providers.yaml 은 "어떤 TTS 가 있고 얼마인지" 를 선언한다.
    tts_engine.py  는 "실제로 어떻게 호출하는지" 를 구현한다.
    둘 사이에 연결이 전혀 없었다. 그래서 UI 가 Qwen 을 보여도 선택해도
    레지스트리는 그것을 몰랐고, 실제로는 tts_engine 의 하드코딩된
    if/elif (engine == 'qwen' ...) 만 따라갔다.

이 모듈이 하는 일
    1) providers 의 adapter 이름 → tts_engine 워커 함수 연결
    2) providers 의 key_env 이름 → 워커가 읽는 config 키 이름 연결
       (providers 는 'qwen_api_key', 워커는 'dashscope_api_key' 를 읽는다)
    3) 프로바이더별 음성 이름 규약 변환
       (앱은 Azure식 'ko-KR-SunHiNeural' 을 쓰지만, Qwen은 'sohee',
        MiniMax는 'female-shaonv', ElevenLabs는 voice ID 를 쓴다)
    4) 프로바이더별 모델명 주입 (turbo/hd 구분 등)
    5) 폴백 체인 + 비용 원장

설계
    - 워커는 건드리지 않는다(동작하는 코드이므로). config 딕셔너리만 주입한다.
    - 키는 key_store(암호화)에서만 온다. settings.yaml 을 경유하지 않는다.
"""
from __future__ import annotations

import asyncio
import os
import sys
from typing import Any, Callable, Dict, List, Optional, Tuple

try:
    from . import key_store, tts_engine
    from .provider_registry import registry
except ImportError:  # pragma: no cover
    from core import key_store, tts_engine
    from core.provider_registry import registry


class TTSError(RuntimeError):
    pass


# 마지막 실패 원인. 워커가 예외를 삼키기 때문에 남겨둔다.
LAST_ERROR: Dict[str, Any] = {}


class _Capture:
    """워커 호출 동안 표준출력을 글러브로 돌린다.

    워커들이 print 로 실패 사유를 남기는데, 그게 사용자에게는 보이지 않는다.
    실패했을 때 "왜" 를 알려주려면 붙잡아야 한다.
    """

    def __init__(self) -> None:
        self._buf: Any = None
        self._old: Any = None

    def __enter__(self) -> "_Capture":
        import io
        self._old = sys.stdout
        self._buf = io.StringIO()
        sys.stdout = self._buf
        return self

    def __exit__(self, *exc: Any) -> None:
        try:
            sys.stdout = self._old
        except Exception:
            pass

    def text(self) -> str:
        try:
            return self._buf.getvalue() if self._buf else ""
        except Exception:
            return ""


def _unlink_quiet(path: str) -> None:
    try:
        if os.path.exists(path):
            os.remove(path)
    except Exception:
        pass


# ── 1) 어댑터 → 워커 ───────────────────────────────────────────────
def _w(name: str) -> Callable:
    fn = getattr(tts_engine, name, None)
    if not fn:
        raise TTSError(f"tts_engine.{name} 없음 — 워커가 사라졌다")
    return fn


TTS_ADAPTERS: Dict[str, Callable] = {
    "edge_tts":          _w("edge_tts_worker"),
    "azure_tts":         _w("azure_tts_worker"),
    "qwen_tts":          _w("qwen_tts_worker"),
    "minimax_tts":       _w("minimax_tts_worker"),
    "elevenlabs_tts":    _w("elevenlabs_tts_worker"),
    "openai_tts":        _w("openai_tts_worker"),
    "typecast_tts":      _w("typecast_tts_worker"),
    # Cloudflare Worker 가 Azure 로 중계한다. 워커 안에서 Azure 를 부른다.
    "cloudflare_azure_proxy": _w("azure_tts_worker"),
}

# ── 2) 키 이름 불일치 해소 ─────────────────────────────────────────
# providers.yaml 의 key_env → tts_engine 워커가 config 에서 읽는 이름
KEY_ALIASES: Dict[str, str] = {
    "qwen_api_key":      "dashscope_api_key",
    "azure_speech_key":  "azure_speech_key",
}

# 프록시 경로는 key_env 대신 별도 설정이 필요하다
PROXY_SETTINGS: Dict[str, Dict[str, Any]] = {
    "cloudflare_azure_proxy": {
        "needs": ["cloudflare_worker_url"],
        "flags": {"use_cloudflare_tts_proxy": True},
    },
}

# ── 3) 음성 이름 규약 변환 ─────────────────────────────────────────
# 앱 공통 음성(Azure/Edge 규약) → 프로바이더 네이티브 음성
#
#   ko-KR-SunHiNeural   여성 밝음      →  Qwen cherry,  MiniMax female-shaonv
#   ko-KR-JiMinNeural   여성 차분      →  Qwen sohee,   MiniMax female-tianxian
#   ko-KR-HyejinNeural  여성 중년      →  Qwen sunny,   MiniMax female-yue
#   ko-KR-InJoonNeural  남성 밝음      →  Qwen aiden,   MiniMax male-qn-qingse
#   ko-KR-SeoyunNeural  남성 차분      →  Qwen ryan,    MiniMax male-qn-jingying
#
# ElevenLabs 는 voice ID 를 쓰는데 이 ID 는 계정마다 다르다(계정 API 로 조회).
# 그래서 여기서 지어내지 않는다. 미매핑이면 호출 전에 명시적으로 실패시킨다.
NATIVE_VOICES: Dict[str, Dict[str, str]] = {
    "qwen_tts": {
        "ko-KR-SunHiNeural": "cherry",
        "ko-KR-JiMinNeural": "sohee",
        "ko-KR-HyejinNeural": "sunny",
        "ko-KR-InJoonNeural": "aiden",
        "ko-KR-SeoyunNeural": "ryan",
    },
    "minimax_tts": {
        "ko-KR-SunHiNeural": "female-shaonv",
        "ko-KR-JiMinNeural": "female-tianxian",
        "ko-KR-HyejinNeural": "female-yue",
        "ko-KR-InJoonNeural": "male-qn-qingse",
        "ko-KR-SeoyunNeural": "male-qn-jingying",
    },
}

# ElevenLabs voice ID (공개 기본값 아님 — 계정에 따라 다름)
ELEVENLABS_NEEDS_ID = True

# ── 4) 프로바이더별 모델 주입 ─────────────────────────────────────
MODEL_SETTINGS: Dict[str, Dict[str, Any]] = {
    "minimax_tts_turbo":  {"minimax_tts_model": "speech-2.5-turbo"},
    "minimax_tts_hd":     {"minimax_tts_model": "speech-2.5-hd"},
    "elevenlabs_flash":   {"elevenlabs_model": "eleven_flash_v2_5"},
    "elevenlabs_v2_v3":   {"elevenlabs_model": "eleven_multilingual_v2"},
    "qwen3_tts_flash":    {"qwen_model": "qwen3-tts-flash"},
}


# ── 설정 주입 ─────────────────────────────────────────────────────
def build_config(provider: Dict[str, Any]) -> Dict[str, Any]:
    """워커가 기대하는 config 딕셔너리를 만든다. 키는 key_store 에서만."""
    from .config_utils import load_config
    try:
        cfg: Dict[str, Any] = dict(load_config() or {})
    except Exception:
        cfg = {}

    pid = provider.get("id") or ""
    adapter = provider.get("adapter") or ""

    # 키 주입 (providers 이름 → 워커 이름)
    # 주의: 별칭은 '저장소 조회' 쪽에도 적용해야 한다.
    #   providers 는 'qwen_api_key' 라고 부르는데 실제로 저장된 키 이름은
    #   'dashscope_api_key' 다. 조회만 원래 이름으로 하면 키가 있는데
    #   "키 없음" 이라고 나온다( 실제로 이 버그가 있었다 ).
    key_env = provider.get("key_env")
    if key_env:
        worker_key = KEY_ALIASES.get(key_env, key_env)
        for lookup in dict.fromkeys([key_env, worker_key]):
            val = key_store.get(lookup) if hasattr(key_store, "get") else None
            if val:
                cfg[worker_key] = val
                break

    # 프록시 경로 설정
    for extra in PROXY_SETTINGS.get(adapter, {}).get("needs", []):
        v = key_store.get(extra) if hasattr(key_store, "get") else key_store.get(extra)
        if v:
            cfg[extra] = v
    for k, v in (PROXY_SETTINGS.get(adapter, {}).get("flags") or {}).items():
        cfg[k] = v

    # 모델명
    cfg.update(MODEL_SETTINGS.get(pid) or {})

    return cfg


# ── 음성 해석 ─────────────────────────────────────────────────────
def resolve_voice(provider: Dict[str, Any], voice: Optional[str]) -> str:
    """앱용 음성 이름을 이 프로바이더가 이해하는 이름으로 바꾼다.

    바꾸지 못하면 예외를 던진다. 조용히 엉뚱한 이름으로 보내면
    프로바이더가 다른 사람 목소리로 읽어버리고 아무도 모른다.
    """
    voice = voice or "ko-KR-SunHiNeural"
    adapter = provider.get("adapter") or ""

    if adapter in ("edge_tts", "azure_tts", "cloudflare_azure_proxy",
                   "openai_tts"):
        return voice

    table = NATIVE_VOICES.get(adapter)
    if table is not None:
        if voice in table:
            return table[voice]
        # 이미 네이티브 이름이면 통과(사용자가 직접 지정한 경우)
        if voice in table.values():
            return voice
        raise TTSError(
            f"'{voice}' 음성을 {provider.get('label')} 로 변환할 수 없습니다. "
            f"사용 가능: {', '.join(sorted(set(table.values())))}")

    if adapter == "elevenlabs_tts":
        raise TTSError(
            "ElevenLabs 는 계정별 voice ID 가 필요합니다. "
            "ElevenLabs 설정 화면에서 voice ID 를 선택하세요.")

    return voice


# ── 생성 ──────────────────────────────────────────────────────────
async def synthesize(
    text: str,
    output_path: str,
    *,
    provider_id: Optional[str] = None,
    voice: Optional[str] = None,
    rate: str = "+0%",
    pitch: str = "+0Hz",
    tier: str = "free",
    prefer: Optional[List[str]] = None,
    retries: int = 2,
    backoff: float = 3.0,
) -> Tuple[bool, str]:
    """TTS 한 개 생성.

    provider_id 를 주면 그것만 시도하고, 아니면 티어 폴백 체인을 탄다.
    retries
        edge_tts 는 속도 제한에 걸리면 "No audio was received" 로 실패한다.
        즉�� 실패하면 3초 간격으로 최대 2회 더 시도한다.
    반환: (성공여부, 설명)
    """
    if not (text or "").strip():
        return False, "텍스트가 비어 있음"

    if provider_id:
        p = registry.get("tts", provider_id)
        if not p:
            return False, f"'{provider_id}' 은(는) 없는 TTS 모델입니다."
        if p.get("hidden"):
            return False, f"'{provider_id}' 은(는) 사용 중단된 항목입니다."
        chain = [p]
    else:
        chain = registry.order_for("tts", tier)
        if prefer:
            by_id = {x["id"]: x for x in chain}
            head = [by_id[i] for i in prefer if i in by_id]
            chain = head + [x for x in chain if x["id"] not in {h["id"] for h in head}]

    if not chain:
        return False, "사용 가능한 TTS 가 없습니다. API 키를 등록하세요."

    last = "시도한 프로바이더 없음"
    for p in chain:
        adapter = p.get("adapter") or ""
        fn = TTS_ADAPTERS.get(adapter)
        if not fn:
            last = f"{p['id']}: 어댑터 미구현({adapter})"
            continue

        cfg = build_config(p)
        # 키가 필요한 프로바이더에 키가 없으면 건너뛴다(/ruins 를 낭비하지 않는다)
        if p.get("key_env") and not (
                cfg.get(KEY_ALIASES.get(p["key_env"], p["key_env"]))):
            LAST_ERROR.clear()
            LAST_ERROR.update({
                "provider": p.get("id"),
                "error": "API 키 없음",
                "hint": (f"'{p['key_env']}' 키를 등록하세요. "
                         f"키가 'settings.yaml' 이 아니라 암호화 저장소에 있어야 합니다."),
            })
            last = f"{p['id']}: API 키 없음"
            continue
        if adapter == "cloudflare_azure_proxy" and not cfg.get("cloudflare_worker_url"):
            LAST_ERROR.clear()
            LAST_ERROR.update({
                "provider": p.get("id"),
                "error": "cloudflare_worker_url 미설정",
                "hint": "Worker URL 을 키로 등록하세요.",
            })
            last = f"{p['id']}: cloudflare_worker_url 미설정"
            continue

        try:
            v = resolve_voice(p, voice)
        except TTSError as e:
            LAST_ERROR.clear()
            LAST_ERROR.update({"provider": p.get("id"), "error": str(e)})
            last = f"{p['id']}: {e}"
            continue

        os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
        # 워커들은 예외를 삼키고 False 만 돌려준다. 실패 이유를 잃지 않으려면
        # 표준출력을 붙잡아야 한다(사용자가 "왜 안 되지?" 물으면 이걸 보여준다).
        # 재시도도 여기서 한다. edge_tts 는 속도 제한에 걸리면
        # "No audio was received" 로 실패하고 0바이트 파일을 남긴다.
        for attempt in range(retries + 1):
            cap = _Capture()
            ok = False
            try:
                with cap:
                    if adapter == "edge_tts":
                        ok = await fn(text, v, output_path, rate=rate, pitch=pitch)
                    elif adapter in ("azure_tts", "cloudflare_azure_proxy"):
                        ok = await fn(text, v, output_path, cfg, rate=rate, pitch=pitch)
                    else:
                        ok = await fn(text, v, output_path, cfg)
            except Exception as e:
                import traceback
                LAST_ERROR.clear()
                LAST_ERROR.update({
                    "provider": p.get("id"), "adapter": adapter, "voice": v,
                    "error": f"{type(e).__name__}: {e}",
                    "worker_log": cap.text()[-800:],
                    "traceback": traceback.format_exc()[-1200:],
                })
                last = f"{p['id']}: 예외 {type(e).__name__} {e}"
                break

            if ok and os.path.exists(output_path) \
                    and os.path.getsize(output_path) > 0:
                LAST_ERROR.clear()
                return True, (f"{p['id']} ({p.get('label')}) "
                              f"{os.path.getsize(output_path)}B")

            log = cap.text()
            # 실패가 남긴 0바이트 파일을 지운다. 안 지우면 다음 attempt 가
            # "이미 있다"고 착각하고, 캐시 로직도 오염된다.
            _unlink_quiet(output_path)

            throttled = ("no audio was received" in log.lower()
                         or "no audio" in log.lower())
            if attempt < retries and (throttled or not log.strip()):
                wait = backoff * (attempt + 1)
                LAST_ERROR.clear()
                LAST_ERROR.update({
                    "provider": p.get("id"), "attempt": attempt + 1,
                    "reason": "속도 제한으로 추정, 재시도",
                    "worker_log": log[-400:],
                })
                await asyncio.sleep(wait)
                continue

            LAST_ERROR.clear()
            LAST_ERROR.update({
                "provider": p.get("id"), "adapter": adapter, "voice": v,
                "error": ("속도 제한(no audio was received)"
                          if throttled else
                          "워커가 False 를 반환했고 오디오 파일이 없음"),
                "worker_log": log[-800:],
            })
            last = (f"{p['id']}: 속도 제한 (잠시 후 다시 시도)"
                    if throttled else f"{p['id']}: 생성 실패(빈 파일 또는 False)")
            break

    return False, last


# ── 상태 조회 ─────────────────────────────────────────────────────
def availability() -> Dict[str, Any]:
    rows = []
    for name, p in registry.section("tts").items():
        if p.get("hidden"):
            continue
        adapter = p.get("adapter") or ""
        row = dict(p)
        row["id"] = name
        cfg = build_config(row)
        worker_key = KEY_ALIASES.get(p.get("key_env") or "", p.get("key_env") or "")
        has_key = bool(worker_key and cfg.get(worker_key))
        # 프록시는 URL 설정이 있어야 실제로 된다
        if adapter == "cloudflare_azure_proxy":
            has_key = has_key or bool(cfg.get("cloudflare_worker_url"))
        rows.append({
            "id": name,
            "label": p.get("label"),
            "adapter": adapter,
            "adapter_ok": adapter in TTS_ADAPTERS,
            "enabled": bool(p.get("enabled")),
            "has_key": has_key,
            "needs_key": bool(p.get("key_env")),
            "key_env": p.get("key_env"),
            "cost_per_1m_chars": p.get("cost_per_1m_chars"),
            "free": not p.get("key_env"),
        })
    return {
        "providers": rows,
        "ready": [r["id"] for r in rows
                  if r["enabled"] and r["has_key"] and r["adapter_ok"]],
        "free_ready": [r["id"] for r in rows
                       if r["enabled"] and r["adapter_ok"] and r["free"]],
        "missing_adapter": [r["id"] for r in rows if not r["adapter_ok"]],
        # 키가 필요한 항목만. edge_tts 처럼 키가 필요 없는 항목은 넣지 않는다.
        "need_key": [r["id"] for r in rows
                     if r["adapter_ok"] and r["needs_key"] and not r["has_key"]],
    }
