"""프로바이더 가격/키 관련 HTTP API.

   GET  /providers/pricing          가격표 전체 (프론트 팝업의 단일 출처)
   GET  /providers/keys             등록된 키 목록(마스킹) + 어떤 프로바이더가 준비됐는지
   POST /providers/keys             키 저장/삭제  { key_id, value }
   POST /providers/keys/validate    키 형식 + 실제 호출 검증 { key_id, value }
   POST /providers/keys/test        생성 실측(과금 발생) { kind, provider_id, prompt }
   GET  /providers/keys/capability  i2i 등 기능별 사용 가능 여부
   POST /providers/toggle           활성/비활성 (YAML 은 건드리지 않는다) { kind, id, enabled }
   POST /providers/pin              폴백 우선순위 고정 { kind, id, pinned }
   POST /providers/reset            이 PC 의 오버라이드 전부 해제
   GET  /providers/overrides        현재 오버라이드 상태

설계
   - 프론트는 더 이상 가격을 하드코딩하지 않는다. ModelPricingModal 도 이 API 를 쓴다.
   - 키는 절대 응답에 평문으로 나가지 않는다(마스킹만 보낸다).
   - 모든 enabled/available 판정은 백엔드가 한다(프론트가 추측하지 않게).
   - providers.yaml 은 읽기 전용. 사용자의 활성 상태는 provider_overrides.json 에 있다.
"""

from __future__ import annotations

import os
import tempfile
import time
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

try:
    from .core import key_store
    from .core import provider_overrides
    from .core.provider_registry import registry
except ImportError:  # pragma: no cover
    from core import key_store
    from core import provider_overrides
    from core.provider_registry import registry

router = APIRouter(prefix="/providers", tags=["providers"])


# ─────────────────────────────────────────────────────────────
# DTO
# ─────────────────────────────────────────────────────────────
class KeyPayload(BaseModel):
    key_id: str
    value: str = ""


class TogglePayload(BaseModel):
    kind: str
    id: str
    enabled: bool = True
    pinned: bool = False


class AutoEnablePayload(BaseModel):
    key_id: str
    enable: bool = True
    only_ready: bool = True     # 키가 있는 항목만 켠다


def _adapter_state(p: Dict[str, Any]) -> str:
    """어댑터 구현 상태를 정직하게 판정한다.

    어댑터 '이름' 이 YAML 에 적혀 있다는 것과 '실제로 동작하는 코드'가 있다는 건
    다르다. 스텁은 이름만 있고 "구현되지 않았습니다" 를 반환하는 가짜다.
    프��트가 '키만 넣으면 되죠?' 라고 속지 않도록 구분해서 알려준다.

    종류마다 어댑터 테이블이 따로 있다:
        이미지 → image_router._ADAPTERS
        영상   → i2v_router.I2V_ADAPTERS
        음성   → tts_router.TTS_ADAPTERS   ← 이걸 빠뜨려서 TTS 전체가
                                              '미구현' 으로 잡히고 있었다
    """
    name = p.get("adapter") or ""
    if not name:
        return "missing"

    tables = []
    for mod, attr in (("image_router", "_ADAPTERS"),
                      ("i2v_router", "I2V_ADAPTERS"),
                      ("tts_router", "TTS_ADAPTERS")):
        try:
            mod_ = __import__(f"{__package__ or '.'}.core.{mod}"
                              if __package__ else f"core.{mod}",
                              fromlist=[attr])
            tables.append(getattr(mod_, attr, {}) or {})
        except Exception:
            try:
                mod_ = __import__(f"core.{mod}", fromlist=[attr])
                tables.append(getattr(mod_, attr, {}) or {})
            except Exception:
                pass
    for tbl in tables:
        if name in tbl:
            return "yes"
    return "stub"


def _row(kind: str, p: Dict[str, Any]) -> Dict[str, Any]:
    """프론트 가격표 한 줄. 레지스트리 값을 문자열로 정규화한다."""
    usd_krw = registry.usd_krw()
    if kind == "video":
        per = p.get("cost_per_sec")
        unit = "초"
    elif kind == "tts":
        per = p.get("cost_per_1m_chars")
        unit = "100만자"
    else:
        per = p.get("cost_usd")
        unit = "장"

    src = registry.key_source(p) if p.get("key_env") else "none"
    ready = bool(p.get("enabled") and registry.usable(p))
    adapter_ok = _adapter_state(p) == "yes"

    def kr(v):
        try:
            n = float(v) * usd_krw
        except (TypeError, ValueError):
            return "-"
        return f"약 {round(n):,}원" if n >= 1 else f"약 {round(n)}원"

    return {
        "id": p["id"],
        "label": p.get("label") or p["id"],
        "adapter": p.get("adapter"),
        "unit": unit,
        "usd": per,
        "krw": kr(per) if isinstance(per, (int, float)) else (p.get("cost_note") or "-"),
        "quality": p.get("quality"),
        "speed": p.get("speed"),
        "modes": p.get("modes") or [],
        "max_refs": p.get("max_refs", 0),
        "i2i_verified": bool(p.get("i2i_verified")),
        "res": p.get("res"),
        "max_sec": p.get("max_sec"),
        "enabled": bool(p.get("enabled")),
        "byok": bool(p.get("byok")),
        "needs_key": bool(p.get("key_env")),
        "key_env": p.get("key_env"),
        "key_source": src,
        "has_key": bool(p.get("key_env")) and src != "none",
        "ready": ready,
        "adapter_implemented": adapter_ok,
        "adapter_state": _adapter_state(p),
        "signup": next((k.get("signup") for k in registry.api_keys()
                        if k.get("id") == p.get("key_env")), None),
        "notes": (p.get("notes") or "").strip(),
    }


# ─────────────────────────────────────────────────────────────
# 가격
# ─────────────────────────────────────────────────────────────
@router.get("/pricing")
def get_pricing() -> Dict[str, Any]:
    """프론트 가격표의 단일 출처. 하드코딩 금지."""
    tiers = {}
    for name, t in (registry.tiers() or {}).items():
        tiers[name] = {
            "label": t.get("label"),
            "desc": t.get("desc"),
            "i2i_allowed": bool(t.get("i2i_allowed")),
            "images": [p["id"] for p in registry.order_for("image", name) if registry.usable(p)],
            "videos": [p["id"] for p in registry.order_for("video", name) if registry.usable(p)],
        }
    return {
        "usd_krw": registry.usd_krw(),
        "image": [_row("image", p) for p in registry.section("image").values() if not p.get("hidden")],
        "video": [_row("video", p) for p in registry.section("video").values() if not p.get("hidden")],
        "tts": [_row("tts", p) for p in registry.section("tts").values() if not p.get("hidden")],
        "llm": [_row("llm", p) for p in registry.section("llm").values() if not p.get("hidden")],
        "tiers": tiers,
        "security": key_store.security_status(),
    }


@router.get("/keys")
def list_keys() -> Dict[str, Any]:
    """등록 가능한 키 목록 + 현재 준비된 프로바이더.

    프론트는 이 응답만 보고 '무엇이 필요하고 무엇이 준비됐는지' 를 그린다.
    enabled 여부는 provider_overrides(사용자 설정)까지 반영된 최종값이다.
    """
    masked = key_store.list_masked()
    rows = []
    for k in registry.api_keys():
        kid = k.get("id", "")
        kind = k.get("kind") or "secret"     # secret | url | plain
        # 별칭까지 포함해 실제로 키가 있는지 확인한다.
        #   qwen_api_key 항목의 키는 'dashscope_api_key' 로 저장돼 있을 수 있고,
        #   cloudflare_worker_url 은 settings.yaml 에 있을 수 있다.
        # 여기서 놓치면 UI 가 '미등록' 이라고 거짓말을 한다.
        resolved = registry.resolve_key({"key_env": kid})
        source = registry.key_source({"key_env": kid})
        if resolved and kid not in masked:
            masked[kid] = (resolved if kind != "secret" else key_store.mask(resolved))
        has_key = bool(resolved)

        enabled_users = [
            p["id"] for kk in ("image", "video", "tts", "llm")
            for p in registry.section(kk).values()
            if p.get("key_env") == kid
        ]
        active = [
            p["id"] for kk in ("image", "video", "tts", "llm")
            for p in registry.all(kk)
            if p.get("key_env") == kid
        ]
        # 이 키로 '실제로 쓸 수 있는' 모델 = 어댑터가 있고 켜져 있는 것
        usable_now = [
            p["id"] for kk in ("image", "video", "tts", "llm")
            for p in registry.all(kk)
            if p.get("key_env") == kid and _adapter_state(p) == "yes"
        ]
        rows.append({
            "id": kid,
            "label": k.get("label"),
            "uses": k.get("uses"),
            "signup": k.get("signup"),
            "required": bool(k.get("required")),
            "tier_hint": k.get("tier_hint"),
            "kind": kind,
            "has_key": has_key,
            "masked": masked.get(kid),
            "source": source,
            "enables": active,
            "usable_now": usable_now,
            "usable_count": len(usable_now),
            "enables_count": len(enabled_users),
        })
    return {
        "keys": rows,
        "security": key_store.security_status(),
        "i2i": _i2i_capability(),
        "i2v": _i2v_capability(),
        "tts": _tts_capability(),
        "overrides": provider_overrides.summary(),
    }


def _i2v_capability() -> Dict[str, Any]:
    try:
        from .core.i2v_router import i2v_availability
    except ImportError:
        from core.i2v_router import i2v_availability
    try:
        return i2v_availability()
    except Exception as e:
        return {"providers": [], "ready": [], "need_key": [],
                "missing_adapter": [], "reason": str(e)[:200]}


def _tts_capability() -> Dict[str, Any]:
    try:
        from .core.tts_router import availability
    except ImportError:
        from core.tts_router import availability
    try:
        return availability()
    except Exception as e:
        return {"providers": [], "ready": [], "free_ready": [],
                "need_key": [], "missing_adapter": [], "reason": str(e)[:200]}


def _i2i_capability() -> Dict[str, Any]:
    try:
        from .core.image_router import i2i_capability
    except ImportError:
        from core.image_router import i2i_capability
    try:
        return i2i_capability()
    except Exception as e:
        return {"available": False, "reason": str(e)[:200], "capable": [], "verified": [], "ready": []}


# ─────────────────────────────────────────────────────────────
# 키 저장
# ─────────────────────────────────────────────────────────────
@router.post("/keys")
def save_key(payload: KeyPayload) -> Dict[str, Any]:
    known = {k.get("id") for k in registry.api_keys()}
    if payload.key_id not in known:
        raise HTTPException(status_code=400, detail=f"알 수 없는 키 항목: {payload.key_id}")
    if payload.value:
        err = key_store.validate_format(payload.key_id, payload.value)
        if err:
            raise HTTPException(status_code=400, detail=err)
    key_store.put(payload.key_id, payload.value)

    # 저장 즉시 그 키를 쓰는 모델을 켠다. 사용자가 YAML 을 고치게 하지 않는다.
    turned_on: List[str] = []
    by_kind: Dict[str, int] = {}
    label_of = {k.get("id"): k.get("label") for k in registry.api_keys()}
    if payload.value:
        for kind in ("image", "video", "tts", "llm"):
            for name, p in registry.section(kind).items():
                if p.get("hidden") or (p.get("key_env") or "") != payload.key_id:
                    continue
                row = dict(p)
                row["id"] = name
                if not registry.usable(row):
                    continue      # 어댑터가 스텁이라 켜도 소용없다
                if provider_overrides.set_enabled(kind, name, True).get("ok"):
                    turned_on.append(f"{kind}/{name}")
                    by_kind[kind] = by_kind.get(kind, 0) + 1

    n = len(turned_on)
    who = label_of.get(payload.key_id) or payload.key_id
    # 예전 메시지: "이 키를 쓰는 모델 7개를 켰습니다: image/nano_banana_2_1k, ..."
    # 내부 ID 를 그대로 보여주면 사용자가 아무것도 못 한다. 종류별 개수만 준다.
    kind_text = " · ".join(
        f"{PLAN_KIND_LABEL.get(k, k)} {by_kind[k]}개"
        for k in PLAN_KIND_ORDER if by_kind.get(k))

    return {
        "ok": True,
        "key_id": payload.key_id,
        "deleted": not bool(payload.value),
        "masked": key_store.mask(payload.value) if payload.value else None,
        "enabled_now": turned_on,
        "enabled_count": n,
        "provider_label": who,
        "format_note": key_store.format_note(payload.key_id, payload.value),
        "message": (
            f"{who} 삭제 · 이 키를 쓰던 모델 {n}개는 꺼졌습니다." if not payload.value
            else (f"{who} 등록 · {kind_text} 켜짐" if n
                  else f"{who} 등록 · 켤 수 있는 모델 없음")
        ),
        "note": "이 PC 에만 저장됩니다. 설정 파일은 변경하지 않았습니다.",
    }


@router.post("/keys/validate")
def validate_key(payload: KeyPayload) -> Dict[str, Any]:
    """형식 검사 + (가능하면) 실제 API 호출 1회."""
    if not payload.value:
        raise HTTPException(status_code=400, detail="키가 비어 있습니다.")
    fmt = key_store.validate_format(payload.key_id, payload.value)
    if fmt:
        return {"ok": False, "stage": "format", "message": fmt}

    probe = {
        "gemini_api_key": _probe_gemini,
        "openai_api_key": _probe_openai,
        "pexels_api_key": _probe_pexels,
        "pollinations_api_key": _probe_pollinations,
        "minimax_api_key": _probe_minimax,
        "fal_api_key": _probe_fal,
        "cloudflare_api_token": _probe_cloudflare,
        "elevenlabs_api_key": _probe_elevenlabs,
        "deepseek_api_key": _probe_deepseek,
    }.get(payload.key_id)
    if not probe:
        return {"ok": True, "stage": "format",
                "message": "형식이 정상입니다. (이 항목은 실제 호출 검사를 지원하지 않습니다 — "
                           "등록 후 모델을 1회 생성해 확인하세요)"}
    try:
        ok, msg = probe(payload.value)
    except Exception as e:
        return {"ok": False, "stage": "network", "message": f"{type(e).__name__}: {str(e)[:180]}"}
    return {"ok": ok, "stage": "api", "message": msg,
            "format_note": key_store.format_note(payload.key_id, payload.value)}


def _probe_cloudflare(key: str):
    """Cloudflare 토큰 검증 API. 과금 없음, 권한까지 확인된다."""
    import requests
    r = requests.get("https://api.cloudflare.com/client/v4/user/tokens/verify",
                     headers={"Authorization": f"Bearer {key}"}, timeout=30)
    if r.ok:
        st = (r.json().get("result") or {}).get("status")
        return True, f"정상. 토큰 상태: {st}"
    return False, f"HTTP {r.status_code}: {r.text[:160]}"


def _probe_elevenlabs(key: str):
    """사용자 정보 조회. 과금 없음."""
    import requests
    r = requests.get("https://api.elevenlabs.io/v1/user",
                     headers={"xi-api-key": key}, timeout=30)
    if r.ok:
        return True, "정상. 계정 접근 가능"
    return False, f"HTTP {r.status_code}: {r.text[:160]}"


def _probe_deepseek(key: str):
    """잔액 조회. 과금 없음."""
    import requests
    r = requests.get("https://api.deepseek.com/user/balance",
                     headers={"Authorization": f"Bearer {key}"}, timeout=30)
    if r.ok:
        return True, f"정상. 잔액 {r.text[:80]}"
    return False, f"HTTP {r.status_code}: {r.text[:160]}"


def _probe_gemini(key: str):
    import requests
    r = requests.get("https://generativelanguage.googleapis.com/v1beta/models",
                     params={"key": key, "pageSize": 1}, timeout=30)
    if r.ok:
        return True, f"정상. 사용 가능 모델 {(r.json().get('models') or [{}])[0].get('name','')}"
    return False, f"HTTP {r.status_code}: {r.text[:160]}"


def _probe_openai(key: str):
    import requests
    r = requests.get("https://api.openai.com/v1/models",
                     headers={"Authorization": f"Bearer {key}"}, timeout=30)
    if r.ok:
        return True, "정상. API 접근 가능"
    return False, f"HTTP {r.status_code}: {r.text[:160]}"


def _probe_pexels(key: str):
    import requests
    r = requests.get("https://api.pexels.com/v1/search",
                     params={"query": "test", "per_page": 1},
                     headers={"Authorization": key}, timeout=30)
    if r.ok:
        return True, "정상. 검색 가능"
    return False, f"HTTP {r.status_code}: {r.text[:160]}"


def _probe_pollinations(key: str):
    import requests
    r = requests.get("https://image.pollinations.ai/prompt/a%20red%20apple",
                     params={"model": "flux", "width": 64, "height": 64, "nologo": "true",
                             "key": key}, timeout=60)
    if r.ok and len(r.content) > 400:
        return True, f"정상. {len(r.content)}B 생성됨 (워터마크 제거 확인 가능)"
    return False, f"HTTP {r.status_code}"


def _probe_minimax(key: str):
    import requests
    # 실제 생성은 과금이므로 모델 목록 조회로 가능 여부만 확인한다.
    r = requests.get("https://api.minimax.io/v1/models",
                     headers={"Authorization": f"Bearer {key}"}, timeout=30)
    if r.ok:
        return True, "정상. API 접근 가능"
    if r.status_code in (404, 405):
        return True, "키 형식이 정상입니다(모델 목록 미지원 서비스)."
    return False, f"HTTP {r.status_code}: {r.text[:160]}"


def _probe_fal(key: str):
    import requests
    r = requests.get("https://fal.ai/v1/models",
                     headers={"Authorization": f"Key {key}"}, timeout=30)
    if r.ok:
        return True, "정상. API 접근 가능"
    return False, f"HTTP {r.status_code}: {r.text[:160]}"


@router.post("/keys/test")
def test_provider(payload: Dict[str, Any]) -> Dict[str, Any]:
    """프로바이더 1개로 실제 생성 1회(과금됨). 어댑터 동작 확인용."""
    kind = payload.get("kind") or "image"
    pid = payload.get("provider_id")
    prompt = payload.get("prompt") or "a red apple on a wooden table, product photo"
    p = registry.get(kind, pid or "")
    if not p:
        raise HTTPException(status_code=400, detail=f"알 수 없는 프로바이더: {pid}")
    if not p.get("enabled"):
        raise HTTPException(
            status_code=400,
            detail=f"'{pid}' 는 providers.yaml 에서 enabled: false 입니다. "
                   f"키를 등록했으면 enabled: true 로 바꾸세요.")
    try:
        from .core.image_router import generate, ledger
    except ImportError:
        from core.image_router import generate, ledger
    out = f"data/_keytest/{pid}.png"
    try:
        path = generate(prompt, out, tier="premium", width=512, height=512,
                        prefer=pid)
    except Exception as e:
        return {"ok": False, "provider": pid, "message": f"{type(e).__name__}: {str(e)[:300]}"}
    if not path:
        return {"ok": False, "provider": pid, "message": "생성 실패(경로 없음)"}
    import os
    return {
        "ok": True, "provider": pid, "path": path,
        "bytes": os.path.getsize(path) if os.path.exists(path) else 0,
        "cost_usd": ledger.total(),
    }


@router.get("/keys/capability")
def capability() -> Dict[str, Any]:
    """기능별 사용 가능 여부. 프론트가 '왜 안 되냐'고 물으면 이걸 보여준다."""
    out: Dict[str, Any] = {
        "i2i": _i2i_capability(),
        "i2v": _i2v_capability(),
        "tts": _tts_capability(),
        "modes": {},
    }
    for kind in ("image", "video", "tts"):
        modes: Dict[str, List[str]] = {}
        for mode in ("t2i", "i2i", "search", "static", "i2v", "pan"):
            rows = [p["id"] for p in registry.supported(kind, mode)
                    if registry.usable(p) and p.get("enabled")]
            if rows:
                modes[mode] = rows
        out["modes"][kind] = modes
    return out


# ── 활성 상태 오버라이드 (providers.yaml 은 읽기 전용) ────────────
class TTSTestPayload(BaseModel):
    provider_id: str = ""
    text: str = "안녕하세요. 음성 미리듣기 테스트입니다."
    voice: str = ""


@router.post("/tts/test")
async def tts_test(payload: TTSTestPayload) -> Dict[str, Any]:
    """TTS 1회 실측. 영상 전체를 만들기 전에 목소리를 먼저 확인한다.

    과금된다(짧은 문장이라 1회당 매우 작다). 그래도 '미리듣기' 용도로
    명시적으로 누를 때만 호출하도록 별도 엔드포인트로 분리했다.
    """
    import subprocess
    import time
    try:
        from ..core import tts_router
        from ..core.tts_engine import configure_ffmpeg
    except ImportError:
        from core import tts_router
        from core.tts_engine import configure_ffmpeg

    if len(payload.text) > 400:
        raise HTTPException(400, "테스트 문장은 400자 이내로 해주세요(과금 방지).")

    d = _tts_audio_dir()
    os.makedirs(d, exist_ok=True)
    stamp = f"{int(time.time() * 1000)}"
    mp3 = os.path.join(d, f"probe_{stamp}.mp3")
    wav = os.path.join(d, f"probe_{stamp}.wav")

    ok, detail = await tts_router.synthesize(
        payload.text, mp3,
        provider_id=payload.provider_id or None,
        voice=payload.voice or None,
    )
    size = os.path.getsize(mp3) if os.path.exists(mp3) else 0
    if not ok or size <= 0:
        _safe_unlink(mp3)
        try:
            from ..core import tts_router as _tr
        except ImportError:
            from core import tts_router as _tr
        return {"ok": False, "message": detail, "bytes": size,
                "diagnostic": dict(getattr(_tr, "LAST_ERROR", {}) or {})}

    # WAV 로 변환해 브라우저가 바로 재생하게 한다(mp3 는 브라우저 지원이 제각각)
    audio_url = None
    try:
        configure_ffmpeg()
        ff = os.environ.get("MOVIEPY_FFMPEG_BINARY", "ffmpeg")
        subprocess.run([ff, "-y", "-i", mp3, wav],
                       capture_output=True, timeout=60)
        if os.path.exists(wav) and os.path.getsize(wav) > 0:
            audio_url = f"/providers/tts/audio/{os.path.basename(wav)}"
    except Exception:
        pass
    _safe_unlink(mp3)

    return {
        "ok": True, "message": detail, "bytes": size,
        "audio_url": audio_url,
        "note": "테스트 1회당 과금됩니다. 목소리 확인은 이 정도면 충분합니다.",
    }


def _tts_audio_dir() -> str:
    return os.path.join(_asset_dir_hint(), "tts_probe")


def _asset_dir_hint() -> str:
    try:
        from ..core.tts_engine import get_asset_dir
        return get_asset_dir()
    except Exception:
        return os.path.join(tempfile.gettempdir(), "yougen_tts")


def _safe_unlink(p: str) -> None:
    try:
        if os.path.exists(p):
            os.remove(p)
    except Exception:
        pass


@router.get("/tts/audio/{name}")
def tts_audio(name: str) -> Any:
    """테스트 음성 재생용. 디렉토리 이탈을 막는다."""
    from fastapi.responses import FileResponse
    safe = os.path.basename(name)          # '../' 제거
    if not safe.startswith("probe_") or not safe.endswith(".wav"):
        raise HTTPException(400, "잘못된 파일 이름")
    p = os.path.join(_tts_audio_dir(), safe)
    if not os.path.exists(p):
        raise HTTPException(404, "음성 파일이 없거나 만료되었습니다. 다시 테스트하세요.")
    return FileResponse(p, media_type="audio/wav")


# ── 모델 선택 계획 (무엇이 실제로 쓰이고 얼마인가) ──────────────
def _kind_rows(kind: str, tier: str) -> List[Dict[str, Any]]:
    """이 종류의 모델 전체를 '선택 상태 + 비용' 과 함께 돌려준다.

    정렬: 1순위 고정(pin) -> 무료 -> 가격 오름차순.

    예전엔 '무료/표준/프리미엄' 탭을 UI 에 냈는데, 실제로 사용자가 궁금한 건
    두 가지였다: '무엇이 무료지' 와 '꺼내면 얼마리지'. 티어 선택은 그 두
    질문에 답을 안 해줬다(세 탭 중 뭘 골라야 하는지 오히려 혼란).
    그래서 티어는 UI 에서 뺐고, 서버는 '고정 > 무료 > 싼 순' 으로 정렬한다.
    싼 순으로 두면 아무것도 고르지 않아도 자동으로 0원 경로가 1순위가 된다.
    """
    by_id = {p["id"]: p for p in registry.section(kind).values()
             if not p.get("hidden") and p.get("enabled")}
    pinned_ids = [k.split("/", 1)[1] for k, v in provider_overrides.get_pinned().items()
                  if v and k.startswith(f"{kind}/") and k.split("/", 1)[1] in by_id]

    def cost_of(p: Dict[str, Any]) -> float:
        if kind == "video":
            return p.get("cost_per_sec") or 0.0
        if kind == "tts":
            return p.get("cost_per_1m_chars") or 0.0
        return p.get("cost_usd") or 0.0

    head = [by_id[i] for i in pinned_ids]
    enabled_rest = sorted((p for p in by_id.values() if p["id"] not in pinned_ids),
                          key=cost_of)
    # 꺼진 것도 보여야 한다. '뭘 더 켤 수 있지?' 가 다음 질문이기 때문��.
    # 안 켜면 사용자는 '영상 모델이 왜 1개뿐이냐' 고 오해한다(실제로는 13종).
    disabled = sorted(
        (p for p in registry.section(kind).values()
         if not p.get("hidden") and not p.get("enabled")), key=cost_of)
    final = head + enabled_rest + disabled

    out = []
    unit = "초" if kind == "video" else (
        "100만자" if kind == "tts" else "1M토큰" if kind == "llm" else "장")
    pin_set = {k.split("/", 1)[1] for k, v in provider_overrides.get_pinned().items()
               if v and k.startswith(f"{kind}/")}
    for p in final:
        if kind == "video":
            usd = p.get("cost_per_sec")
        elif kind == "tts":
            usd = p.get("cost_per_1m_chars")
        else:
            usd = p.get("cost_usd")
        has_key = bool(p.get("key_env")) and registry.usable(p)
        ready = bool(p.get("enabled")) and registry.usable(p) \
            and _adapter_state(p) == "yes"
        out.append({
            "id": p["id"],
            "label": p.get("label"),
            "adapter": p.get("adapter"),
            "adapter_state": _adapter_state(p),
            "enabled": bool(p.get("enabled")),
            "enabled_by_user": bool(p.get("enabled_by_user")),
            "needs_key": bool(p.get("key_env")),
            "has_key": has_key,
            "key_env": p.get("key_env"),
            "modes": p.get("modes") or [],
            "i2i_verified": p.get("i2i_verified"),
            "cost_usd": usd,
            "unit": unit,
            "cost_krw": round((usd or 0) * registry.usd_krw()),
            "quality": p.get("quality"),
            "res": p.get("res"),
            "tier_ranked": p["id"] in {x["id"] for x in head},
            "pinned": p["id"] in pin_set,
            "notes": (p.get("notes") or "").strip(),
            "ready": ready,
        })
    return out


def _project(rows: List[Dict[str, Any]], kind: str,
             scenes: int = 4, i2v_scenes: int = 0, i2v_sec: int = 5) -> Dict[str, Any]:
    """현재 상태로 한 편 만들 때 얼마가 듣는지 추정한다.

    i2v 는 전 장면에 돌리면 비싸므로 '핵심 장면 몇 개' 만 올린다는 전제다.
    """
    live = [r for r in rows if r["ready"]]
    if not live:
        return {"usd": 0.0, "krw": 0, "billed": "none", "first": None,
                "first_label": "", "unit": "장",
                "note": "사용 가능한 모델 없음 (키를 등록하세요)"}

    first = live[0]
    cost = 0.0
    detail = []

    # 대본처럼 '장당' 비용이 없는 종류는 0원으로 표기하면 안 된다.
    # '별도 과금' 으로 명시해야 사용자가 잘못 안심하지 않는다.
    if first.get("cost_usd") is None:
        return {
            "usd": 0.0, "krw": 0, "billed": "separate",
            "first": first["id"], "first_label": first["label"],
            "unit": first.get("unit") or "토큰",
            "note": "토큰 사용량 비례 (별도 과금)",
        }

    if kind == "video":
        free_first = first["cost_usd"] in (0, None)
        if free_first:
            detail.append(f"{first['label']} (무료) → Ken Burns 로 전 장면 처리")
        else:
            # 유료 영상은 '핵심 장면' 에만 쓴다. 전 장면이면 폭발한다.
            cost = (first["cost_usd"] or 0) * i2v_sec * i2v_scenes
            detail.append(
                f"{first['label']} ${first['cost_usd']}/초 × {i2v_scenes}장면 × "
                f"{i2v_sec}초 = ${cost:.3f}")
    else:
        if kind == "image":
            n = scenes
            detail.append(f"{first['label']} × {n}장면")
        elif kind == "tts":
            n = 1
            detail.append(f"{first['label']} (대본 1편 기준)")
        else:
            n = 1
            detail.append(f"{first['label']} (대본 1편 기준)")
        cost = (first["cost_usd"] or 0) * n

    return {
        "usd": round(cost, 4),
        "krw": round(cost * registry.usd_krw()),
        "billed": "fixed",
        "first": first["id"],
        "first_label": first["label"],
        "unit": first["unit"],
        "note": " · ".join(detail),
    }


def _llm_rows() -> List[Dict[str, Any]]:
    """대본 모델 = providers.yaml 의 llm 섹션 (단일 출처).

    예전엔 settings.yaml 의 gemini_text_models 를 읽었다. 그게 실제 경로였고
    providers.yaml 의 llm 섹션은 어댑터가 없는 장식이었다 — 서로 다른 두 목록이
    어긋난 채로 있었다. 이제 providers.yaml 한 곳만 본다.
    """
    try:
        from ..core.llm_providers import ADAPTERS as LLM_ADAPTERS
    except ImportError:
        from core.llm_providers import ADAPTERS as LLM_ADAPTERS

    pin_set = {k.split("/", 1)[1] for k, v in provider_overrides.get_pinned().items()
               if v and k.startswith("llm/")}

    src = registry.section("llm")
    order_of = {k: (v.get("order") or 999) for k, v in src.items()}
    by_id = {k: v for k, v in src.items()
             if not v.get("hidden") and v.get("enabled")}

    pinned = sorted((by_id[i] for i in pin_set if i in by_id),
                    key=lambda p: (order_of.get(p["id"], 999), p["id"]))
    rest = sorted((p for k, p in by_id.items() if k not in pin_set),
                  key=lambda p: (order_of.get(p["id"], 999), p["id"]))
    disabled = sorted((p for p in src.values()
                       if not p.get("hidden") and not p.get("enabled")),
                      key=lambda p: (order_of.get(p["id"], 999), p["id"]))
    final = pinned + rest + disabled

    krw = registry.usd_krw()
    out: List[Dict[str, Any]] = []
    for i, p in enumerate(final):
        pid = p["id"]
        ad = p.get("adapter")
        state = "yes" if ad in LLM_ADAPTERS else ("missing" if not ad else "stub")
        has_key = bool(p.get("key_env")) and registry.usable(p)
        cin = p.get("cost_input_per_1m")
        cout = p.get("cost_output_per_1m")
        out.append({
            "id": pid,
            "label": p.get("label"),
            "adapter": ad,
            "adapter_state": state,
            "enabled": bool(p.get("enabled")),
            "enabled_by_user": bool(p.get("enabled_by_user")),
            "needs_key": bool(p.get("key_env")),
            "has_key": has_key,
            "key_env": p.get("key_env"),
            "modes": ["text"],
            # 장당 비용이 아니라 토큰 과금이라 '별도' 로 표기한다
            "cost_usd": None,
            "cost_krw": None,
            "unit": "토큰",
            "cost_input_per_1m": cin,
            "cost_output_per_1m": cout,
            "cost_input_krw": round((cin or 0) * krw),
            "cost_output_krw": round((cout or 0) * krw),
            "quality": p.get("quality"),
            "model_id": p.get("model_id"),
            "base_url": p.get("base_url"),
            "tier_ranked": pid in pin_set,
            "pinned": pid in pin_set,
            "order": order_of.get(pid, i + 1),
            "tier_hint": p.get("tier_hint") or "",
            "notes": (p.get("notes") or "").strip(),
            "ready": bool(p.get("enabled")) and has_key and state == "yes",
        })
    return out


PLAN_KIND_ORDER = ("llm", "image", "video", "tts")
PLAN_KIND_LABEL = {"llm": "대본", "image": "이미지", "video": "영상", "tts": "음성"}


@router.get("/plan")
def plan(scenes: int = 4, i2v_scenes: int = 0, i2v_sec: int = 5) -> Dict[str, Any]:
    """모델 선택 화면이 그리는 전부.

    티어 파라미터를 뺐다. 예전에는 '무료/표준/프리미엄' 을 고르게 했는데,
    사용자가 진짜 알고 싶었던 건 '무엇이 무료지 / 얼마인지' 뿐이었다.
    티어는 UI 를 복잡하게만 했고 결정에는 도움이 안 됐다.

    '켜는 것' 은 지출이 아니다. '실제로 무엇이 쓰이고 얼마인가' 가 중요하다.
    그래서 1순위와 그 비용을 항상 함께 준다.
    """
    out: Dict[str, Any] = {
        "kind_order": list(PLAN_KIND_ORDER),
        "usd_krw": registry.usd_krw(),
        "kinds": {},
        "totals": {},
    }
    for kind in PLAN_KIND_ORDER:
        rows = _llm_rows() if kind == "llm" else _kind_rows(kind, "free")
        out["kinds"][kind] = {
            "label": PLAN_KIND_LABEL[kind],
            "rows": rows,
            "model_count": len(rows),
            "model_on": sum(1 for r in rows if r.get("enabled")),
            "model_ready": sum(1 for r in rows if r.get("ready")),
            # 무료 / 유료 분리. 사용자가 가장 먼저 묻는 것이 이것이다.
            "free_count": sum(1 for r in rows
                              if (r.get("cost_usd") in (0, None)) and r.get("ready")),
            "paid_count": sum(1 for r in rows
                              if (r.get("cost_usd") or 0) > 0),
            "key_count": len({r.get("key_env") for r in rows if r.get("key_env")}),
        }
        out["totals"][kind] = _project(rows, kind, scenes, i2v_scenes, i2v_sec)

    # ── 키 그룹 ──
    # 같은 키가 여러 모델을 담당한다(예: Gemini 키 = 대본 + 이미지 + 영상).
    # 그래서 '모델 목록' 과 '키 목록' 을 따로 두면 사용자가 "이 키가 어디에
    # 쓰이는지" 매번 짝을 맞춰야 한다. 여기서 kind 안에서 key_env 로 묶어준다.
    key_meta = {k.get("id"): k for k in registry.api_keys()}
    for kind in PLAN_KIND_ORDER:
        rows = out["kinds"][kind]["rows"]
        groups: List[Dict[str, Any]] = []
        by_key: Dict[str, Dict[str, Any]] = {}
        for r in rows:
            ke = r.get("key_env") or ""
            gk = ke or "__nokey__"
            if gk not in by_key:
                meta = key_meta.get(ke) or {}
                resolved = registry.resolve_key({"key_env": ke}) if ke else None
                g = {
                    "key_env": ke or None,
                    "label": (meta.get("label")
                              or ("키 불필요" if not ke else ke)),
                    "uses": meta.get("uses") or "",
                    "signup": meta.get("signup"),
                    "required": bool(meta.get("required")),
                    "tier_hint": meta.get("tier_hint") or "",
                    "kind": (meta.get("kind") or ("none" if not ke else "secret")),
                    "has_key": bool(resolved),
                    "masked": (key_store.mask(resolved) if resolved
                               and (meta.get("kind") or "secret") == "secret"
                               else resolved),
                    "models": [],
                }
                by_key[gk] = g
                groups.append(g)
            by_key[gk]["models"].append(r)
        # 키가 있는 그룹을 먼저, 그 다음 키 불필요 그룹
        groups.sort(key=lambda g: (not g["key_env"], g["label"]))
        # 이미 쓸 수 있는 그룹만 펼쳐��고, 나머지는 '나머지' 로 접는다.
        # 안 하면 이미지 항목에 프로바이더가 8개씩 늘어 스크롤이 다시 생긴다.
        relevant, rest = [], []
        for g in groups:
            usable = g["has_key"] or any(
                m.get("ready") or (m.get("enabled") and m.get("adapter_state") == "yes")
                for m in g["models"])
            (relevant if usable else rest).append(g)
        # 헤더용 집계를 kind 안의 key_groups 에도 넣어 둔다(프론트가 바로 쓸 수 있게).
        out["kinds"][kind]["key_groups"] = relevant
        out["kinds"][kind]["key_groups_rest"] = rest

    # ── 합계 ──
    # 대본(LLM) 과금은 '편당 고정액' 이 아니라 토큰 사용량 비례라 합계에 넣으면
    # '0원' 이라는 잘못된 안심을 준다. 그래서 '별도 과금' 으로 분리한다.
    paid = []
    for k in ("image", "video", "tts"):
        t = out["totals"][k]
        if t.get("krw", 0) > 0:
            paid.append(f"{out['kinds'][k]['label']} {t['note']}")
    fixed_krw = sum(out["totals"][k].get("krw", 0) for k in ("image", "video", "tts"))
    llm_first = out["totals"]["llm"].get("first_label") or ""
    llm_separate = bool(llm_first) and any(
        r.get("ready") for r in out["kinds"]["llm"]["rows"])

    out["fixed_krw"] = fixed_krw
    out["total_krw"] = fixed_krw
    out["total_usd"] = round(sum(out["totals"][k].get("usd", 0)
                                 for k in ("image", "video", "tts")), 4)
    out["llm_separate"] = llm_separate
    out["has_cost"] = bool(paid) or llm_separate
    if paid and llm_separate:
        out["cost_warning"] = (" · ".join(paid)
                               + f" · 대본({llm_first}) 은 토큰 사용량에 비례해 별도 과금")
    elif paid:
        out["cost_warning"] = " · ".join(paid)
    elif llm_separate:
        out["cost_warning"] = (
            f"이미지·영상·음성은 무료 경로입니다(0원). "
            f"단, 대본({llm_first}) 은 토큰 사용량에 비례해 Google AI Studio 에 과금됩니다. "
            f"무료 할량 안이면 $0 입니다.")
    else:
        out["cost_warning"] = "이미지·영상·음성 모두 무료 경로입니다. 실제 과금 0원."
    return out


@router.get("/overrides")
def get_overrides() -> Dict[str, Any]:
    """이 PC 에 저장된 사용자 오버라이드."""
    return provider_overrides.summary()


@router.post("/toggle")
def toggle(body: TogglePayload) -> Dict[str, Any]:
    """모델을 켜고 끈다. YAML 을 고치지 않고 이 PC 의 오버라이드만 바꾼다."""
    src = registry.section(body.kind).get(body.id)
    hidden = bool((src or {}).get("hidden"))
    if src is None:
        raise HTTPException(404, f"'{body.id}' 은(는) 없는 {body.kind} 모델입니다.")
    res = provider_overrides.set_enabled(body.kind, body.id, body.enabled,
                                          hidden=hidden)
    if not res.get("ok"):
        raise HTTPException(400, res.get("error", "활성화 실패"))

    row = dict(src)
    row["id"] = body.id
    row["kind"] = body.kind
    row["enabled"] = body.enabled
    has_key = bool(row.get("key_env")) and registry.usable(row)
    # 키 없는 모델을 켜도 실제로는 실패한다. UI 가 즉시 알 수 있게 알려준다.
    warnings: List[str] = []
    if body.enabled and row.get("key_env") and not has_key:
        warnings.append(f"'{body.id}' 은 API 키가 없어 실제로는 실패합니다. "
                        f"키를 먼저 등록하세요.")
    if body.enabled and body.kind == "image" and "i2i" in (row.get("modes") or []) \
            and not row.get("i2i_verified"):
        warnings.append("이 모델의 i2i(참조 이미지)는 아직 육안 검증 전입니다. "
                        "t2i 만 권장합니다.")
    if body.pinned:
        provider_overrides.set_pinned(body.kind, body.id, True)

    return {
        "ok": True,
        "kind": body.kind,
        "id": body.id,
        "enabled": body.enabled,
        "has_key": has_key,
        "adapter": row.get("adapter"),
        "warnings": warnings,
        "note": ("사용자 설정만 변경했습니다. providers.yaml 은 수정하지 않았습니다. "
                 "'기본값으로 되돌리기' 는 enabled=false 로 저장하면 됩니다."),
    }


@router.post("/pin")
def pin(body: TogglePayload) -> Dict[str, Any]:
    """폴백 체인에서 이 모델을 맨 앞에 고정한다."""
    if registry.section(body.kind).get(body.id) is None:
        raise HTTPException(404, f"'{body.id}' 은(는) 없는 {body.kind} 모델입니다.")
    return provider_overrides.set_pinned(body.kind, body.id, body.pinned)


@router.post("/auto-enable")
def auto_enable(body: AutoEnablePayload) -> Dict[str, Any]:
    """키를 등록했으니 그 키를 쓰는 모델을 켠다.

    사용자가 providers.yaml 을 손으로 고치게 하지 않기 위한 핵심 API.
    """
    turned_on: List[str] = []
    skipped: List[Dict[str, str]] = []
    for kind in ("image", "video", "tts", "llm"):
        for name, p in registry.section(kind).items():
            if p.get("hidden"):
                continue
            if (p.get("key_env") or "") != body.key_id:
                continue
            row = dict(p)
            row["id"] = name
            if body.only_ready and not registry.usable(row):
                continue
            if row.get("enabled") and not provider_overrides.get_enabled_overrides().get(
                    f"{kind}/{name}"):
                continue          # 이미 YAML 기본값으로 켜져 있음
            if provider_overrides.set_enabled(kind, name, body.enable).get("ok"):
                turned_on.append(f"{kind}/{name}")
            else:
                skipped.append({"id": name, "reason": "잠김/숨김"})
    return {
        "ok": True,
        "key_id": body.key_id,
        "enabled": turned_on,
        "skipped": skipped,
        "count": len(turned_on),
    }


@router.post("/reset")
def reset() -> Dict[str, Any]:
    """이 PC 의 모든 활성 오버라이드를 지우고 YAML 기본값으로 되돌린다."""
    return provider_overrides.clear()
