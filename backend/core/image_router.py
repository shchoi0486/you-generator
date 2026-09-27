"""이미지 생성 통합 라우터.

기존 visual_engine.py 의 generate_image_* 5개 하드코딩 함수를 대체한다.
프로바이더 선택·폴백·비용 기록을 전담하고, 실제 호출은 어댑터에 위임한다.

핵심 계약
  generate(prompt)            -> 텍스트→이미지. 티어 폴백 체인을 순서대로 시도.
  generate_i2i(prompt, refs)  -> 참조 이미지→이미지. 제품 일관성의 전제 조건.
  search_stock(keyword)       -> 실사 사진 검색(AI 생성이 아님).
  ledger                      -> job 단위 비용/프로바이더 사용 기록.

폴백 규칙
  - 티어가 지정한 순서대로 시도한다.
  - 키가 없는 프로바이더는 건너뛴다(요청마다 키를 조작하지 않게 사전 필터).
  - 최근 실패한 프로바이더는 쿨다운 동안 건너뛴다.
  - 성공하면 그 결과를 반환하고, 전부 실패하면 마지막 오류를 담은 예외를 낸다.
  - 부분 성공(한 장 실패)은 예외가 아니라 None 을 돌려준다. 배치는 계속 돌아야 한다.
"""

from __future__ import annotations

import base64
import io
import os
import time
from typing import Any, Dict, List, Optional, Sequence

try:
    import requests
except ImportError:  # pragma: no cover
    requests = None

try:
    from .provider_registry import registry
except (ImportError, ValueError):
    from provider_registry import registry

try:
    from PIL import Image
except ImportError:  # pragma: no cover
    Image = None


class ImageGenerationError(RuntimeError):
    """모든 프로바이더가 실패했을 때."""


# ─────────────────────────────────────────────────────────────
# 비용 원장
# ─────────────────────────────────────────────────────────────
class CostLedger:
    """job 단위 비용 기록. 유료 전환의 근거가 되므로 사치가 아니다."""

    def __init__(self) -> None:
        self.rows: List[Dict[str, Any]] = []

    def add(self, provider_id: str, kind: str, units: float,
            cost: float, ok: bool, detail: str = "") -> None:
        self.rows.append({
            "ts": time.time(), "provider": provider_id, "kind": kind,
            "units": units, "cost_usd": round(cost, 6),
            "ok": ok, "detail": detail[:160],
        })

    def total(self) -> float:
        return round(sum(r["cost_usd"] for r in self.rows if r["ok"]), 6)

    def by_provider(self) -> Dict[str, Dict[str, Any]]:
        out: Dict[str, Dict[str, Any]] = {}
        for r in self.rows:
            d = out.setdefault(r["provider"], {"calls": 0, "ok": 0, "fail": 0, "cost_usd": 0.0})
            d["calls"] += 1
            d["ok" if r["ok"] else "fail"] += 1
            d["cost_usd"] = round(d["cost_usd"] + r["cost_usd"], 6)
        return out

    def summary(self) -> str:
        lines = [f"총 ${self.total():.4f} / {len(self.rows)}회"]
        for pid, d in sorted(self.by_provider().items()):
            lines.append(f"  {pid:26s} {d['calls']:3d}회 "
                         f"(성공 {d['ok']} / 실패 {d['fail']})  ${d['cost_usd']:.4f}")
        return "\n".join(lines)

    def clear(self) -> None:
        self.rows.clear()


ledger = CostLedger()


# ─────────────────────────────────────────────────────────────
# 유틸
# ─────────────────────────────────────────────────────────────
def _b64_from_json(resp) -> Optional[bytes]:
    try:
        j = resp.json()
    except Exception:
        return None
    res = j.get("result") or j
    if isinstance(res, dict):
        img = res.get("image") or res.get("images")
        if isinstance(img, str) and img:
            return base64.b64decode(img)
        if isinstance(img, list) and img and isinstance(img[0], str):
            return base64.b64decode(img[0])
    return None


def _looks_like_image(data: Optional[bytes]) -> bool:
    return bool(data) and len(data) > 800


def save_bytes(data: bytes, path: str) -> str:
    os.makedirs(os.path.dirname(os.path.abspath(path)) or ".", exist_ok=True)
    with open(path, "wb") as f:
        f.write(data)
    return path


def image_size(path: str, fallback=(1024, 1024)):
    """생성 이미지의 실제 크기. Ken Burns 크롭 계산에 쓴다."""
    if not Image:
        return fallback
    try:
        with Image.open(path) as im:
            return im.size
    except Exception:
        return fallback


# ─────────────────────────────────────────────────────────────
# 어댑터
#   각 어댑터는 (bytes | None, detail:str) 를 돌려준다.
#   실패는 예외가 아니라 None + 사유로 표현한다(폴백이 가능하도록).
# ─────────────────────────────────────────────────────────────
def _adapter_pollinations(p: Dict[str, Any], prompt: str, refs, w, h, **kw):
    """Pollinations GET /prompt/{prompt} — 키 없이 도는 유일한 이미지 경로.

    실측(2026-09-27) 결함 3가지
      1) nologo=true 를 줘도 워터마크가 남는다. 문서상 'needs account' 라서
         키가 있어야 제거된다. 키가 없으면 막을 수 없다.
      2) 세로 비율(9:16) 요청이 respected 되지 않는다(세로가 아닌 원본이 나온다).
      3) 품질이 제품 광고 수준에 미치지 못한다(투명 텀블러 → 빨간 타원).
    그래서 '무료 체험' 티어에서는 pexels(실사)를 항상 먼저 시도하고,
    AI 생성이 필요할 때만 여기로 온다. 생성 결과를 검증 없이 '제품샷'으로
    내세우면 사용자가 그대로 광고에 쓴다.
    """
    key = registry.resolve_key(p)
    model = "flux" if "flux" in p["id"] else "turbo"
    url = f"https://image.pollinations.ai/prompt/{requests.utils.quote(prompt)}"
    params: Dict[str, Any] = {
        "width": w, "height": h,
        "model": model,
        "nologo": "true",
        "enhance": "true",     # 실측에서 프롬프트 보강이 품질을 뚜렷히 올렸다
        "seed": kw.get("seed"),
    }
    if key:
        # 키가 있으면 헤더로 붙인다(문서상 nologo 가 실제로 적용된다).
        headers = {"Authorization": f"Bearer {key}"}
    else:
        headers = {}
        params["key"] = "anonymous"
    r = requests.get(url, params={k: v for k, v in params.items() if v is not None},
                     headers=headers, timeout=180)
    if r.status_code == 200 and _looks_like_image(r.content):
        note = f"HTTP 200 {len(r.content)}B" + ("" if key else " (무키: 워터마크 있음)")
        return r.content, note
    return None, f"HTTP {r.status_code}"


def _adapter_pexels(p: Dict[str, Any], prompt: str, refs, w, h, **kw):
    key = registry.resolve_key(p)
    if not key or not requests:
        return None, "키 없음"
    r = requests.get("https://api.pexels.com/v1/search",
                     params={"query": kw.get("search_query") or prompt[:60],
                             "per_page": kw.get("per_page", 1),
                             "orientation": "landscape"},
                     headers={"Authorization": key}, timeout=45)
    if not r.ok:
        return None, f"HTTP {r.status_code}"
    photos = (r.json() or {}).get("photos") or []
    if not photos:
        return None, "결과 없음"
    img = requests.get(photos[0]["src"]["original"], timeout=60)
    if img.ok and _looks_like_image(img.content):
        return img.content, photos[0].get("photographer", "")[:40]
    return None, "다운로드 실패"


def _adapter_gemini(p: Dict[str, Any], prompt: str, refs, w, h, **kw):
    key = registry.resolve_key(p)
    if not key or not requests:
        return None, "키 없음"
    from .config_utils import load_config
    cfg = load_config() or {}
    model = kw.get("model") or p.get("model_id") or "gemini-3.1-flash-lite-image"
    endpoint = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    parts: List[Dict[str, Any]] = [{"text": prompt}]
    # i2i: 참조 이미지를 인라인 파트로 넣는다(Gemini 멀티모달 스키마).
    for ref in (refs or []):
        try:
            b = _load_ref_bytes(ref)
            if b:
                parts.append({
                    "inline_data": {
                        "mime_type": ref.get("mime", "image/jpeg")
                        if isinstance(ref, dict) else "image/jpeg",
                        "data": base64.b64encode(b).decode(),
                    }
                })
        except Exception as e:
            return None, f"참조 이미지 실패: {e}"
    payload = {"contents": [{"parts": parts}],
               "generationConfig": {"responseModalities": ["IMAGE"]}}
    r = requests.post(endpoint, params={"key": key}, json=payload, timeout=180)
    if r.status_code == 200:
        d = _gemini_image_bytes(r.json())
        if d:
            return d, f"{model} {len(d)}B"
        return None, "이미지 없음(텍스트만 응답)"
    return None, f"HTTP {r.status_code} {r.text[:120]}"


def _gemini_image_bytes(j: Dict[str, Any]) -> Optional[bytes]:
    for cand in ((j.get("candidates") or [])):
        for part in ((cand.get("content") or {}).get("parts") or []):
            idata = part.get("inlineData") or part.get("inline_data")
            if idata and idata.get("data"):
                try:
                    return base64.b64decode(idata["data"])
                except Exception:
                    return None
    return None


def _adapter_zimage(p: Dict[str, Any], prompt: str, refs, w, h, **kw):
    """Z-Image 는 현재 로컬 Comfy/HF 경로가 없다. 서버가 있으면 호출한다."""
    from .config_utils import load_config
    cfg = load_config() or {}
    ig = cfg.get("image_gen") or {}
    base = ig.get("zimage_endpoint") or os.environ.get("ZIMAGE_ENDPOINT")
    if not base:
        return None, "Z-Image 엔드포인트 미설정"
    if not requests:
        return None, "requests 없음"
    r = requests.post(base.rstrip("/") + "/generate",
                      json={"prompt": prompt, "width": w, "height": h,
                            "steps": ig.get("zimage_steps", 4),
                            "model": p.get("model_id")},
                      timeout=180)
    if r.ok and _looks_like_image(r.content):
        return r.content, f"HTTP 200 {len(r.content)}B"
    return None, f"HTTP {r.status_code}"


def _adapter_seedream(p: Dict[str, Any], prompt: str, refs, w, h, **kw):
    return None, "어댑터 미구현"


def _adapter_cloudflare(p: Dict[str, Any], prompt: str, refs, w, h, **kw):
    key = registry.resolve_key(p)
    if not key or not requests:
        return None, "키 없음"
    from .config_utils import load_config
    cfg = load_config() or {}
    acc = (cfg.get("image_gen") or {}).get("cloudflare_account_id")
    if not acc:
        return None, "account_id 없음"
    url = f"https://api.cloudflare.com/client/v4/accounts/{acc}/ai/run/{p.get('model_id')}"
    # flux-1-schnell 은 prompt 외 속성을 400으로 거절한다(실측). 참조이미지도 불가.
    r = requests.post(url, headers={"Authorization": f"Bearer {key}",
                                    "Content-Type": "application/json"},
                      json={"prompt": prompt}, timeout=120)
    if r.status_code == 200:
        d = _b64_from_json(r) or (r.content if _looks_like_image(r.content) else None)
        if d:
            return d, "HTTP 200"
        return None, "이미지 없음"
    return None, f"HTTP {r.status_code}"


def _adapter_pollinations_edit(p: Dict[str, Any], prompt: str, refs, w, h, **kw):
    """Pollinations /v1/images/edits — 2026-09-27 실측 기준 '사용 불가'.

    실측 결과 (이유를 남겨 둔다. 같은 착각을 다시 하지 않도록)
      - base URL 은 image.pollinations.ai 여야 한다(gen. 은 401).
      - Authorization: Bearer 헤더가 아니라면 401.
      - 그 조합이면 **HTTP 200 + 이미지가 온다**. 그래서 '작동한다'고 오판하기 쉽다.
      - 그러나 실제로는 **참조 이미지를 무시한다**.
        텀블러 참조 → 사람 사진 출력. model 인자(kontext/nanobanana/flux)를
        바꿔도 결과 바이트가 76,643B 로 동일 = model 도 무시된다.
      - 즉 이 엔드포인트는 i2i 가 아니라 t2i 이다. 200 OK 는 성공 신호가 아니다.
    위험: 이게 켜져 있으면 '제품이 매 컷 다른 물건' 상태가 되는데 사용자는
    그 사실을 눈으로 알기 어렵다(에러가 안 나니까). 그래서 무조건 막는다.
    """
    return None, ("사용 불가: 실측에서 참조 이미지를 무시하고 t2i 결과를 돌려준다 "
                   "(200 OK지만 i2i 아님). providers.yaml 도 enabled:false 다.")


def _adapter_ai_horde(p: Dict[str, Any], prompt: str, refs, w, h, **kw):
    """AI Horde — 키 불필요. 분산 크레딧이지만 대기시간이 분 단위다."""
    from .config_utils import load_config
    cfg = load_config() or {}
    apikey = (cfg.get("image_gen") or {}).get("ai_horde_api_key")
    hdr = {"Content-Type": "application/json"}
    if apikey:
        hdr["apikey"] = apikey
    try:
        r = requests.post("https://aihorde.net/api/v2/generate/async",
                          headers=hdr,
                          json={"prompt": prompt,
                                "params": {"width": w, "height": h},
                                "nsfw": False, "censor_nsfw": True,
                                "models": ["stable_diffusion_2.1"]},
                          timeout=30)
        if r.status_code not in (200, 202):
            return None, f"HTTP {r.status_code}"
        gen = (r.json() or {}).get("id")
        if not gen:
            return None, "작업 ID 없음"
        # AI Horde 는 폴링이 필요하다. 여긴 한 번만 확인한다(실사용 부적합이라).
        for _ in range(2):
            import time as _t
            _t.sleep(2)
            s = requests.get(f"https://aihorde.net/api/v2/generate/check/{gen}", timeout=20)
            if s.ok and s.json().get("done"):
                r2 = requests.get(f"https://aihorde.net/api/v2/generate/status/{gen}", timeout=20)
                return (r2.content if r2.ok and len(r2.content) > 800 else None), "done"
        return None, "아직 완료 안 됨(대기시간이 분 단위)"
    except Exception as e:
        return None, f"{type(e).__name__}: {e}"


def _adapter_local_sd(p: Dict[str, Any], prompt: str, refs, w, h, **kw):
    """로컬 ComfyUI / A1111. settings.yaml 의 local_sd_url 이 있어야 한다."""
    from .config_utils import load_config
    cfg = load_config() or {}
    base = ((cfg.get("image_gen") or {}).get("local_sd_url") or "").rstrip("/")
    if not base:
        return None, "local_sd_url 미설정"
    try:
        r = requests.post(f"{base}/sdapi/v1/txt2img",
                          json={"prompt": prompt, "width": w, "height": h, "steps": 25},
                          timeout=180)
        if r.ok:
            imgs = (r.json() or {}).get("images") or []
            if imgs:
                import base64 as _b
                return _b.b64decode(imgs[0]), "local_sd"
        return None, f"HTTP {r.status_code}"
    except Exception as e:
        return None, f"{type(e).__name__}: {e}"


def _adapter_minimax_image(p: Dict[str, Any], prompt: str, refs, w, h, **kw):
    """MiniMax image-01 — 최저가(장당 $0.0035). BYOK 필요."""
    key = registry.resolve_key(p)
    if not key or not requests:
        return None, "키 없음"
    from .config_utils import load_config
    cfg = load_config() or {}
    base = ((cfg.get("image_gen") or {}).get("minimax_base_url")
            or "https://api.minimax.io/v1").rstrip("/")
    r = requests.post(f"{base}/image_generation",
                      headers={"Authorization": f"Bearer {key}",
                               "Content-Type": "application/json"},
                      json={"model": "image-01", "prompt": prompt,
                            "aspect_ratio": _aspect_ratio(w, h),
                            "response_format": "url", "n": 1},
                      timeout=180)
    if r.status_code != 200:
        return None, f"HTTP {r.status_code} {r.text[:120]}"
    j = r.json() or {}
    url = ((j.get("data") or {}).get("image_urls") or [None])[0]
    if not url:
        return None, f"이미지 URL 없음 {j}"
    img = requests.get(url, timeout=120)
    if img.ok and _looks_like_image(img.content):
        return img.content, "minimax image-01"
    return None, "다운로드 실패"


def _aspect_ratio(w: int, h: int) -> str:
    r = (w / h) if h else 1.0
    for target, name in ((1.0, "1:1"), (0.5625, "9:16"), (1.7778, "16:9"),
                         (0.75, "3:4"), (1.3333, "4:3"), (0.4286, "3:7")):
        if abs(r - target) < 0.08:
            return name
    return "1:1"


def _adapter_openai_image(p: Dict[str, Any], prompt: str, refs, w, h, **kw):
    """OpenAI GPT Image — 토큰 과금이라 장당 고정가가 없다."""
    key = registry.resolve_key(p)
    if not key or not requests:
        return None, "키 없음"
    size = "1024x1024" if max(w, h) <= 1100 else "1536x1024"
    payload = {"model": "gpt-image-1", "prompt": prompt, "size": size, "n": 1}
    files = []
    opened = []
    try:
        for i, rp in enumerate(refs or []):
            b = _load_ref_bytes(rp)
            f = io.BytesIO(b)
            opened.append(f)
            files.append(("image[]", (f"ref{i}.png", f, "image/png")))
        if files:
            r = requests.post("https://api.openai.com/v1/images/edits",
                              headers={"Authorization": f"Bearer {key}"},
                              files=files, data={"model": "gpt-image-1", "size": size,
                                                 "prompt": prompt}, timeout=240)
        else:
            r = requests.post("https://api.openai.com/v1/images/generations",
                              headers={"Authorization": f"Bearer {key}",
                                       "Content-Type": "application/json"},
                              json={"model": "gpt-image-1", "prompt": prompt,
                                    "size": size, "n": 1}, timeout=240)
        if r.status_code != 200:
            return None, f"HTTP {r.status_code} {r.text[:120]}"
        d0 = (r.json().get("data") or [{}])[0]
        if d0.get("b64_json"):
            return base64.b64decode(d0["b64_json"]), "gpt-image-1"
        if d0.get("url"):
            return requests.get(d0["url"], timeout=120).content, "gpt-image-1(url)"
        return None, "이미지 없음"
    finally:
        for f in opened:
            try:
                f.close()
            except Exception:
                pass


def _adapter_video_elsewhere(p: Dict[str, Any], prompt: str, refs, w, h, **kw):
    """i2v 는 core/i2v_router.generate_i2v() 가 담당한다.

    이미지 라우터로 i2v 를 부르면 안 된다. 폴링(분 단위)과 오디오 합성이 끼어 있어서
    경로가 완전히 다르다. 여기서는 '위치가 다름' 을 분명히 알린다.
    """
    return None, f"'{p.get('label')}' 은 i2v 입니다. core.i2v_router.generate_i2v() 를 쓰세요."


def _adapter_kenburns_stub(p: Dict[str, Any], prompt: str, refs, w, h, **kw):
    """Ken Burns 는 ffmpeg 합성이라 이미지 어댑터가 아니다.

    providers.yaml 에는 있어도 image.generate() 는 호출하지 않는다.
    (video 파이프라인에서 video_engine 이 사용한다)
    """
    return None, "Ken Burns 는 이미지 생성기가 아니다(ffmpeg 합성)"


def _adapter_azure_proxy_stub(p: Dict[str, Any], prompt: str, refs, w, h, **kw):
    """Cloudflare Worker → Azure TTS 프록시. TTS 전용이라 이미지 라우터에선 미사용."""
    return None, "TTS 전용 어댑터"


def _adapter_not_implemented(adapter_name: str):
    """아직 코드를 쓰지 않은 어댑터용 스텁.

    '없는 어댑터'로 조용히 넘어가면 사용자는 왜 안 되는지 모른다.
    대신 열거형으로 만들어야 한다(그래야 TODO 가 남는다).
    """
    def _stub(p: Dict[str, Any], prompt: str, refs, w, h, **kw):
        return None, (f"'{adapter_name}' 어댑터 미구현 "
                      f"({p.get('label', p.get('id', '?'))})")
    _stub.__name__ = f"_stub_{adapter_name}"
    return _stub


_ADAPTERS = {
    "pollinations": _adapter_pollinations,
    "pollinations_edit": _adapter_pollinations_edit,
    "pexels": _adapter_pexels,
    "gemini_image": _adapter_gemini,
    "zimage": _adapter_zimage,
    "seedream": _adapter_seedream,
    "cloudflare": _adapter_cloudflare,
    "minimax_image": _adapter_minimax_image,
    "openai_image": _adapter_openai_image,
    "horde": _adapter_ai_horde,
    "local_sd": _adapter_local_sd,
    "kenburns": _adapter_kenburns_stub,
    "cloudflare_azure_proxy": _adapter_azure_proxy_stub,
    "qwen_tts": _adapter_not_implemented("qwen_tts"),
    "minimax_tts": _adapter_not_implemented("minimax_tts"),
    "elevenlabs_tts": _adapter_not_implemented("elevenlabs_tts"),
    "azure_tts": _adapter_not_implemented("azure_tts"),
    # i2v 는 core/i2v_router.py 의 I2V_ADAPTERS 가 담당한다(동기/비동기 폴링이 달라서).
    # 여기에도 이름만 등록해 둔다 — 어댑터 없음으로 오해하지 않게 하기 위함.
    "fal_i2v": _adapter_video_elsewhere,
    "veo_google_i2v": _adapter_video_elsewhere,
    "direct_i2v": _adapter_video_elsewhere,
    "veo_i2v": _adapter_not_implemented("veo_i2v (i2v_router 로 이동)"),
    "sora_i2v": _adapter_not_implemented("sora_i2v (i2v_router 로 이동)"),
    "minimax_i2v": _adapter_not_implemented("minimax_i2v (i2v_router 로 이동)"),
    "kling_i2v": _adapter_not_implemented("kling_i2v (i2v_router 로 이동)"),
}


def _load_ref_bytes(ref) -> bytes:
    """참조 이미지를 바이트로. 경로/URL/data-uri/base64 를 모두 받는다."""
    if isinstance(ref, (bytes, bytearray)):
        return bytes(ref)
    if isinstance(ref, str):
        if ref.startswith("data:"):
            return base64.b64decode(ref.split(",", 1)[1])
        if os.path.exists(ref):
            with open(ref, "rb") as f:
                return f.read()
        if ref.startswith("http"):
            r = requests.get(ref, timeout=60)
            r.raise_for_status()
            return r.content
    if isinstance(ref, dict):
        if ref.get("bytes"):
            return ref["bytes"]
        if ref.get("path"):
            return _load_ref_bytes(ref["path"])
        if ref.get("url"):
            return _load_ref_bytes(ref["url"])
    raise ValueError(f"참조 이미지 해석 실패: {type(ref)}")


# ─────────────────────────────────────────────────────────────
# 공개 API
# ─────────────────────────────────────────────────────────────
def _candidates(kind: str, mode: str, tier: str, prefer: Optional[str] = None):
    """티어 순서 → 모드 필터 → 키 보유 → 헬스 확인 순으로 걸러낸다."""
    rows = registry.order_for(kind, tier)
    out: List[Dict[str, Any]] = []
    if prefer:
        pv = registry.get(kind, prefer)
        if pv and registry.usable(pv):
            out.append(pv)
    for p in rows:
        if mode not in (p.get("modes") or []):
            continue
        if not registry.usable(p):
            continue
        if registry.unhealthy(p["id"]):
            continue
        if any(x["id"] == p["id"] for x in out):
            continue
        out.append(p)
    return out


def generate(prompt: str, output_path: str, *, tier: str = "free",
             width: int = 1024, height: int = 1024, mode: str = "t2i",
             refs: Optional[Sequence] = None, prefer: Optional[str] = None,
             **kw) -> Optional[str]:
    """이미지 1장 생성. 실패하면 None(배치는 계속), 전부 실패하면 예외.

    반환: 저장된 파일 경로 또는 None
    """
    if requests is None:
        raise ImageGenerationError("requests 가 설치되어 있지 않습니다.")
    cands = _candidates("image", mode, tier, prefer)
    if not cands:
        raise ImageGenerationError(
            f"사용 가능한 {mode} 프로바이더가 없습니다 "
            f"(tier={tier}). providers.yaml 의 enabled 와 키를 확인하세요.")
    last = ""
    for p in cands:
        fn = _ADAPTERS.get(p.get("adapter") or "")
        if not fn:
            last = f"{p['id']}: 어댑터 없음"
            continue
        units = max(width, height) / 1024.0
        cost = float(p.get("cost_usd") or 0.0) * units
        t0 = time.time()
        try:
            data, detail = fn(p, prompt, refs, width, height, **kw)
        except Exception as e:
            data, detail = None, f"{type(e).__name__}: {e}"
        dt = time.time() - t0
        if data and _looks_like_image(data):
            save_bytes(data, output_path)
            registry.mark_health(p["id"], True)
            ledger.add(p["id"], mode, units, cost, True, f"{dt:.1f}s {detail}")
            print(f"[image:{mode}] {p['id']} 성공 {dt:.1f}s "
                  f"${cost:.4f} -> {os.path.basename(output_path)}")
            return output_path
        registry.mark_health(p["id"], False, detail)
        ledger.add(p["id"], mode, units, 0.0, False, detail)
        last = f"{p['id']}: {detail}"
        print(f"[image:{mode}] {p['id']} 실패 — {detail}")
    raise ImageGenerationError(f"모든 {mode} 프로바이더 실패. 마지막: {last}")


def generate_i2i(prompt: str, output_path: str, refs: Sequence, *,
                 tier: str = "standard", width: int = 1024, height: int = 1024,
                 **kw) -> Optional[str]:
    """참조 이미지를 바탕으로 생성. 제품 일관성의 전제 조건.

    참조 이미지를 지원하는 켜진 프로바이더가 하나도 없으면, 그 사실을 그대로
    알린다(무료 폴백으로 조용히 t2i 결과를 내놓으면 '제품이 매 컷 다르다'는
    사용자가 보기 최악의 상태가 된다).
    """
    if not refs:
        raise ImageGenerationError("참조 이미지가 없습니다.")
    if not registry.i2i_allowed(tier):
        raise ImageGenerationError(
            f"'{tier}' 티어에서는 참조 이미지(i2i)를 쓸 수 없습니다. "
            "standard 이상으로 올리세요.")
    # 폴백으로 t2i 결과를 조용히 내놓으면 '제품이 매 컷 다른 물건으로 보인다'는
    # 사용자가 보기 최악의 상태가 된다. 못 하는 이유를 그대로 알린다.
    cap = i2i_capability()
    if not cap["available"]:
        raise ImageGenerationError(
            "참조 이미지(i2i)를 실제로 쓸 수 있는 경로가 없습니다.\n"
            f"  i2i 지원으로 등록됨 : {cap['capable'] or '없음'}\n"
            f"  실측 확인된 경로     : {cap['verified'] or '없음'}\n"
            f"  원인: {cap['reason']}\n"
            "  ※ Pollinations 는 200 을 주면서 실제로는 참조 이미지를 무시한다"
            "(실측: 텀블러 입력 -> 사람 사진 출력). 그래서 '지원'만으로 켜지 않는다.")
    return generate(prompt, output_path, tier=tier, width=width, height=height,
                    mode="i2i", refs=refs, **kw)


def search_stock(query: str, output_path: str, *, tier: str = "free",
                 per_page: int = 1) -> Optional[str]:
    return generate(query, output_path, tier=tier, mode="search",
                    search_query=query, per_page=per_page)


def generate_ad_image(scenario_prompt: str, output_path: str, *, tier: str = "free",
                      width: int = 832, height: int = 1472,
                      prefer_photo: bool = True, **kw) -> Optional[str]:
    """제품 광고용 이미지 1장.

    무료 티어에서 AI 생성을 1순위로 두면 안 된다. 실측에서:
      - Pexels 실사 사진: 물的真实함(실제 제품 사진), 워터마크 없음, 무료
      - Pollinations AI: 워터마크 있음 + 제품 형태가 매 컷 무너짐 + 세로 미지원
    즉 '제품 광고'라는 목적을 보면 실사 사진이 AI 생성보다 압도적으로 낫다.
    AI 로 찍어야 하는 구도(분해도·단면·분사 장면)만 pexels 로는 불가능하므로
    그때 폴백으로 생성한다.
    prefer_photo=False 를 주면 생성부터 시도한다(분해도/단면 연출용).
    """
    if prefer_photo:
        try:
            _kw = dict(kw)
            _kw.setdefault("search_query", scenario_prompt[:60])
            _kw.setdefault("per_page", 1)
            r = generate(scenario_prompt, output_path, tier=tier,
                         width=width, height=height, mode="search", **_kw)
            if r:
                return r
        except ImageGenerationError as e:
            print(f"[ad] 실사 검색 실패 -> AI 생성으로 폴백: {str(e)[:80]}")
    return generate(scenario_prompt, output_path, tier=tier,
                    width=width, height=height, mode="t2i", **kw)


def i2i_capability() -> Dict[str, Any]:
    """i2i 현황. '지원'과 '실증'을 구분한다.

    지원( modes 에 i2i ) != 실증( 실제로 참조 이미지를 반영함이 확인됨 ).
    2026-09-27 실측에서 Pollinations 가 '지원'이라 적혀 있었지만 실제로는
    참조 이미지를 무시했다. 그래서 verified 플래그를 따로 둔다.
    """
    allp = registry.all("image", only_enabled=False)
    capable = [p for p in allp if "i2i" in (p.get("modes") or [])]
    verified = [p for p in capable if p.get("i2i_verified")]
    ready = [p for p in verified
             if p.get("enabled") and registry.usable(p)
             and not registry.unhealthy(p["id"])]
    return {
        "capable": [f"{p['id']}({'키있음' if registry.usable(p) else '키없음'}"
                    f"{'/미실증' if not p.get('i2i_verified') else '/실증'})"
                    for p in capable],
        "verified": [p["id"] for p in verified],
        "ready": [p["id"] for p in ready],
        "available": bool(ready),
        "reason": "" if ready else (
            "참조 이미지를 실제로 반영함이 확인된 경로가 없습니다. "
            "i2i_verified: true 는 눈으로 확인한 뒤에만 켭니다. "
            "후보: gemini_nano_banana_2(키 있음, 할량 필요) / seedream_5(키 필요)"),
    }
