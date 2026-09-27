"""이미지 → 동영상(i2v) 생성 어댑터.

왜 fal 하나만 안 되는가
  중개 플랫폼(fal.ai / Replicate)과 제조사 직접 API(Google Vertex / Kling / MiniMax)는
  모두 가능하다. 어느 쪽이든 '제출 → 대기 → 결과 수신' 3단계 큐 구조라 인터페이스가 같다.
  그래서 어댑터로 분리한다. providers.yaml 의 model_ref 만 바꾸면 제공자가 교체된다.

설계
  - 폴백/헬스/비용원장은 image_router 의 것을 재사용한다(계층을 이중으로 만들지 않는다).
  - 폴링은 동기 블로킹 대신 상태 조회만 반복 호출한다. FastAPI 의 이벤트 루프를
    막지 않는다(다른 AI 코드의 async+time.sleep 는 루프 전체를 멈춘다).
  - 타임아웃이 과금 실패가 되지 않도록 '미수신'을 성공 시도 0건으로만 센다.
    즉 타임아웃 후에도 fal 은 request_id 로 나중에 조회할 수 있다(레코드를 남긴다).
  - fal_client 패키지가 없어도 REST 폴백이 동작한다(SDK 의존 없음).
"""

from __future__ import annotations

import base64
import io
import os
import time
from typing import Any, Dict, Optional

try:
    import requests
except ImportError:  # pragma: no cover
    requests = None

try:
    from .provider_registry import registry
except (ImportError, ValueError):
    from provider_registry import registry

try:
    from . import key_store
except (ImportError, ValueError):
    import key_store  # type: ignore


# ─────────────────────────────────────────────────────────────
# 공통 결과
# ─────────────────────────────────────────────────────────────
class I2VError(RuntimeError):
    pass


def _load_ref(ref) -> tuple[bytes, str]:
    """참조 이미지를 (바이트, mime) 로. 경로/URL/바이트/base64 를 받는다."""
    if isinstance(ref, (bytes, bytearray)):
        return bytes(ref), "image/png"
    if isinstance(ref, str):
        if ref.startswith("data:"):
            head, b64 = ref.split(",", 1)
            mime = head.split(";")[0].replace("data:", "")
            return base64.b64decode(b64), (mime or "image/png")
        if os.path.exists(ref):
            ext = os.path.splitext(ref)[1].lower()
            mime = {".jpg": "image/jpeg", ".jpeg": "image/jpeg",
                    ".webp": "image/webp", ".png": "image/png"}.get(ext, "image/png")
            with open(ref, "rb") as f:
                return f.read(), mime
        if ref.startswith("http"):
            r = requests.get(ref, timeout=120)
            r.raise_for_status()
            ct = (r.headers.get("Content-Type") or "image/png").split(";")[0]
            return r.content, ct
    if isinstance(ref, dict):
        if ref.get("bytes"):
            return ref["bytes"], ref.get("mime", "image/png")
        if ref.get("path") or ref.get("url"):
            return _load_ref(ref.get("path") or ref.get("url"))
    raise I2VError(f"참조 이미지를 읽을 수 없습니다: {type(ref)}")


def _public_image_url(ref, tmpdir: str) -> str:
    """i2v 는 보통 공개 URL 을 요구한다. 로컬 경로면 base64 data URI 로 준다.
    Veo/Kling 계열은 data URI 를 받는다. fal 은 data URI 를 hosting 하지 못하므로
    이 경우 fal 경로는 사전에 실패시키고 직접 API 로 안내한다.
    """
    if isinstance(ref, str) and ref.startswith(("http://", "https://")):
        return ref
    b, mime = _load_ref(ref)
    return f"data:{mime};base64," + base64.b64encode(b).decode("ascii")


# ─────────────────────────────────────────────────────────────
# 어댑터
# ─────────────────────────────────────────────────────────────
def _adapter_fal_i2v(p: Dict[str, Any], *, image_ref, prompt: str, seconds: int,
                     **kw) -> Optional[str]:
    """fal.ai 큐 방식.

    POST https://queue.fal.run/{model}  -> {request_id, status, response_url}
    GET  https://queue.fal.run/{model}/requests/{request_id}/status
    GET  https://queue.fal.run/{model}/requests/{request_id}

    SDK(fal_client) 대신 REST 를 쓴다. 이유: SDK 가 없어도 동작해야 하고(패키징
    문제), 큐 API 가 안정적이라 버전 차이가 없다.
    """
    key = registry.resolve_key(p)
    if not key or not requests:
        return None, "fal_api_key 없음"
    model = p.get("model_ref") or ""
    if not model:
        return None, "model_ref 없음(providers.yaml 에 fal 모델 경로 필요)"

    url_img = _public_image_url(image_ref, "")
    args: Dict[str, Any] = {"prompt": prompt or "", "image_url": url_img}
    for k_src, k_dst in (("duration_seconds", "duration"), ("res", "resolution")):
        if kw.get(k_src) is not None:
            args[k_dst] = kw[k_src]
    if p.get("res"):
        args.setdefault("resolution", p["res"])
    args.setdefault("duration", str(seconds))

    base = "https://queue.fal.run"
    hdr = {"Authorization": f"Key {key}", "Content-Type": "application/json"}
    t0 = time.time()
    try:
        r = requests.post(f"{base}/{model}", headers=hdr, json=args, timeout=120)
    except Exception as e:
        return None, f"제출 실패 {type(e).__name__}: {e}"
    if r.status_code not in (200, 202):
        return None, f"제출 HTTP {r.status_code}: {r.text[:160]}"
    try:
        j = r.json()
    except Exception:
        return None, f"제출 응답 비-JSON: {r.text[:160]}"
    rid = j.get("request_id")
    if not rid:
        # 동기 모드에서 바로 결과가 오는 경우
        return _harvest_fal(j, p, seconds)
    status_url = j.get("status_url") or f"{base}/{model}/requests/{rid}/status"
    resp_url = j.get("response_url") or f"{base}/{model}/requests/{rid}"

    # 폴링. 루프를 멈추지 않도록 GET 만 반복한다(SDK 폴링과 달리 sleep 은 짧게).
    max_wait = int(kw.get("max_wait", 900))   # 15분. 영상 생성은 오래 걸린다.
    poll = 0
    while time.time() - t0 < max_wait:
        try:
            s = requests.get(status_url, headers={"Authorization": f"Key {key}"}, timeout=30)
        except Exception:
            time.sleep(3)
            poll += 1
            continue
        if not s.ok:
            return None, f"상태 조회 HTTP {s.status_code}"
        sj = s.json()
        st = (sj.get("status") or "").upper()
        if st in ("COMPLETED",):
            try:
                g = requests.get(resp_url, headers={"Authorization": f"Key {key}"}, timeout=180)
                data = g.json() if g.ok else sj
            except Exception:
                data = sj
            return _harvest_fal(data, p, seconds)
        if st in ("FAILED",):
            return None, f"생성 실패: {str(sj.get('error') or sj)[:160]}"
        if poll >= 2:            # 처음엔 짧게, 이후 3초 간격
            time.sleep(3)
            poll += 1
    # 타임아웃: 과금은 이미 됐을 수 있다. 재시도하면 이중 과금이라 하지 않는다.
    return None, f"시간 초과({max_wait}초). fal request_id={rid} — 나중에 조회 가능"


def _harvest_fal(data: Dict[str, Any], p: Dict[str, Any], seconds: int) -> Optional[str]:
    """fal 응답에서 영상 URL 을 뽑는다(모델마다 키가 다르다)."""
    v = data.get("video") or data.get("videos") or data
    url = None
    if isinstance(v, str):
        url = v
    elif isinstance(v, dict):
        url = v.get("url") or v.get("video_url")
        if not url:
            for kk in ("url", "video_url", "file_url"):
                if isinstance(v.get(kk), str):
                    url = v[kk]
                    break
    elif isinstance(v, list) and v:
        f0 = v[0]
        url = f0.get("url") if isinstance(f0, dict) else (f0 if isinstance(f0, str) else None)
    if not url:
        return None, f"결과에 URL 없음(키: {sorted(data.keys())[:8]})"
    try:
        g = requests.get(url, timeout=180)
        if g.ok and len(g.content) > 2000:
            return url, g.content          # (경로, 바이트) 대신 (url, bytes) 를 아래에서 조립
    except Exception:
        pass
    return url, None


def _adapter_google_veo_i2v(p: Dict[str, Any], *, image_ref, prompt: str, seconds: int,
                            **kw) -> Optional[str]:
    """Google Gemini API 의 Veo (직접 경로).

    fal 과 같은 $0.05/초 라 중개 수수료가 없다. 키가 GEMINI_API_KEY 하나면 된다.
    generateContent 로 동영상을 만들고, 롱폼은 파일 API 로 받아온다.
    """
    key = registry.resolve_key(p)
    if not key or not requests:
        return None, "gemini_api_key 없음"
    model = p.get("model_ref") or "veo-3.1-generate-001"
    b, mime = _load_ref(image_ref)
    parts = [
        {"text": prompt or "부드러운 카메라 이동, 자연스러운 움직임"},
        {"inline_data": {"mime_type": mime, "data": base64.b64encode(b).decode()}},
    ]
    ep = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    payload = {"instances": [{"prompt": {"parts": parts}}],
               "parameters": {"aspectRatio": (p.get("res") or "720p")[:4] if p.get("res") else "16:9",
                              "durationSeconds": seconds}}
    try:
        r = requests.post(ep, params={"key": key}, json=payload, timeout=600)
    except Exception as e:
        return None, f"Veo 요청 실패 {type(e).__name__}: {e}"
    if r.status_code != 200:
        return None, f"Veo HTTP {r.status_code}: {r.text[:160]}"
    j = r.json()
    for cand in (j.get("candidates") or []):
        for part in ((cand.get("content") or {}).get("parts") or []):
            vd = part.get("videoData") or part.get("video_data")
            if vd and (vd.get("data") or vd.get("uri")):
                if vd.get("data"):
                    return None, base64.b64decode(vd["data"])   # 아래에서 (None, bytes) 로 사용
                if vd.get("uri"):
                    g = requests.get(vd["uri"], params={"key": key}, timeout=180)
                    if g.ok and len(g.content) > 2000:
                        return None, g.content
    return None, "Veo 응답에 영상이 없음(할량/지역/미지원 가능)"


def _adapter_direct_i2v(p: Dict[str, Any], *, image_ref, prompt: str, seconds: int,
                        **kw) -> Optional[str]:
    """제조사 직접 REST (Kling / MiniMax 등)의 공통 패턴.

    providers.yaml 에 아래 키를 주면 아무 코드 추가 없이 새 제조사가 된다.
      submit_url, status_url_template, result_url_template, auth_header, auth_prefix,
      body_template(선택), image_field, prompt_field
    """
    key = registry.resolve_key(p)
    if not key or not requests:
        return None, f"{p.get('key_env')} 없음"
    submit = p.get("submit_url")
    if not submit:
        return None, "submit_url 미설정(providers.yaml)"
    url_img = _public_image_url(image_ref, "")
    body = dict(p.get("body") or {})
    if p.get("image_field"):
        body[p["image_field"]] = url_img
    if p.get("prompt_field"):
        body[p["prompt_field"]] = prompt or ""
    hdr = {"Content-Type": "application/json"}
    ah = p.get("auth_header", "Authorization")
    ap = p.get("auth_prefix", "Bearer ")
    if ah:
        hdr[ah] = f"{ap}{key}"
    try:
        r = requests.post(submit, headers=hdr, json=body, timeout=120)
    except Exception as e:
        return None, f"제출 실패 {type(e).__name__}: {e}"
    if r.status_code not in (200, 201, 202):
        return None, f"제출 HTTP {r.status_code}: {r.text[:160]}"
    try:
        j = r.json()
    except Exception:
        return None, "제출 응답 비-JSON"
    task = j.get("task_id") or j.get("id") or j.get("taskId") or (j.get("data") or {}).get("task_id")
    if not task:
        return _harvest_fal(j, p, seconds)   # 동기 응답일 수 있음
    st_tpl = p.get("status_url_template")
    if not st_tpl:
        return None, f"task {task} 받았으나 status_url_template 미설정(폴링 불가)"
    hdr2 = {ah: f"{ap}{key}"} if ah else {}
    max_wait = int(kw.get("max_wait", 900))
    t0 = time.time()
    while time.time() - t0 < max_wait:
        try:
            s = requests.get(st_tpl.format(id=task, task_id=task), headers=hdr2, timeout=30)
        except Exception:
            time.sleep(3)
            continue
        if not s.ok:
            return None, f"상태 조회 HTTP {s.status_code}"
        sj = s.json()
        st = str(sj.get("status") or sj.get("state") or "").upper()
        content = (sj.get("data") or {}).get("content") or (sj.get("result") or {}).get("content")
        if content or st in ("SUCCESS", "SUCCEEDED", "DONE", "COMPLETED"):
            url = content if isinstance(content, str) else None
            if not url:
                url = _harvest_fal(sj, p, seconds)
                return url
            try:
                g = requests.get(url, timeout=180)
                if g.ok and len(g.content) > 2000:
                    return url, g.content
            except Exception:
                pass
            return url, None
        if st in ("FAIL", "FAILED", "ERROR"):
            return None, f"생성 실패: {str(sj.get('error') or sj)[:160]}"
        time.sleep(3)
    return None, f"시간 초과({max_wait}초). task {task}"


# 반환 규약: 어댑터는 (video_url | None, bytes | detail) 를 돌려준다.
#   - 성공: (url, bytes) 또는 (None, bytes)  ← 둘 중 하나는 반드시 채워진다
#   - 실패: (None, "사유 문자열")
I2V_ADAPTERS = {
    "fal_i2v": _adapter_fal_i2v,
    "veo_google_i2v": _adapter_google_veo_i2v,
    "direct_i2v": _adapter_direct_i2v,
}


def generate_i2v(image_ref, output_path: str, *, provider_id: str, prompt: str = "",
                 seconds: int = 5, tier: str = "premium", **kw) -> str:
    """이미지 1장 → 영상 1개. 성공하면 저장된 파일 경로.

    실패하면 I2VError 를 던진다(부분 성공을 조용히 만들지 않는다).
    """
    if requests is None:
        raise I2VError("requests 가 없습니다.")
    p = registry.get("video", provider_id)
    if not p:
        raise I2VError(f"알 수 없는 영상 프로바이더: {provider_id}")
    if not p.get("enabled"):
        raise I2VError(f"'{provider_id}' 는 providers.yaml 에서 enabled: false 입니다. "
                       f"키를 등록했으면 true 로 바꾸세요.")
    if not registry.usable(p):
        raise I2VError(f"'{p.get('label')}' 에 필요한 키({p.get('key_env')})가 없습니다.")

    fn = I2V_ADAPTERS.get(p.get("adapter") or "")
    if not fn:
        raise I2VError(f"'{p.get('adapter')}' 어댑터가 구현되지 않았습니다 "
                       f"({p.get('label')}).")

    t0 = time.time()
    try:
        out = fn(p, image_ref=image_ref, prompt=prompt, seconds=seconds, **kw)
    except I2VError:
        raise
    except Exception as e:
        raise I2VError(f"{p.get('label')} 실패: {type(e).__name__}: {str(e)[:200]}") from e

    url, data = out if isinstance(out, tuple) else (None, out)
    if data and isinstance(data, (bytes, bytearray)) and len(data) > 2000:
        os.makedirs(os.path.dirname(os.path.abspath(output_path)) or ".", exist_ok=True)
        with open(output_path, "wb") as f:
            f.write(data)
        registry.mark_health(p["id"], True)
        cost = float(p.get("cost_per_sec") or 0) * seconds
        print(f"[i2v] {p['id']} 성공 {time.time() - t0:.1f}s ${cost:.3f} -> {os.path.basename(output_path)}")
        return output_path
    if url and isinstance(url, str) and url.startswith(("http://", "https://")):
        # 바이트를 못 받았지만 URL 이 있으면 내려받아 본다.
        try:
            g = requests.get(url, timeout=180)
            if g.ok and len(g.content) > 2000:
                os.makedirs(os.path.dirname(os.path.abspath(output_path)) or ".", exist_ok=True)
                with open(output_path, "wb") as f:
                    f.write(g.content)
                registry.mark_health(p["id"], True)
                return output_path
        except Exception:
            pass
        return url   # URL 을 그대로 넘겨 상위(ffmpeg)가 받게 한다
    raise I2VError(str(data) if isinstance(data, str) and data else f"{p['id']} 결과 없음")


def i2v_availability() -> Dict[str, Any]:
    """enabled 여부와 무관하게 i2v 후보 전체를 보여준다.

    키를 아직 등록하지 않은 항목도 '이 키만 있으면 된다'고 보여줘야 하므로
    registry.all()(기본 enabled 필터) 대신 section()(전체)을 쓴다.
    """
    rows = []
    for name, p in registry.section("video").items():
        if "i2v" not in (p.get("modes") or []):
            continue
        rows.append({
            "id": p["id"], "label": p.get("label"),
            "adapter": p.get("adapter"),
            "adapter_ok": p.get("adapter") in I2V_ADAPTERS,
            "enabled": bool(p.get("enabled")),
            "has_key": bool(p.get("key_env")) and registry.usable(p),
            "needs_key": bool(p.get("key_env")),
            "key_env": p.get("key_env"),
            "cost_per_sec": p.get("cost_per_sec"),
            "res": p.get("res"),
            "max_sec": p.get("max_sec"),
        })
    ready = [r["id"] for r in rows
            if r["enabled"] and r["has_key"] and r["adapter_ok"]]
    need_key = [r["id"] for r in rows
                if r["adapter_ok"] and not r["has_key"]]
    missing_adapter = [r["id"] for r in rows if not r["adapter_ok"]]
    return {
        "providers": rows,
        "ready": ready,
        "need_key": need_key,
        "missing_adapter": missing_adapter,
        "note": ("어댑터가 붙어 있고 키만 등록하면 바로 쓸 수 있다. "
                 "새 제공자는 providers.yaml 에 model_ref(중개) 또는 submit_url(직접)만 "
                 "추가하면 코드를 고치지 않는다."),
    }
