"""LLM 비용 원장 + '편당 예상 비용' 계산.

왜 이 파일이 필요했나
    사용자가 DeepSeek 을 주력으로 밀기로 한 근거가 '편당 비용이 가장 낮다' 였다.
    그런데 우리 코드는 '편당 비용' 을 아무 데도 기록하지 않았다. 그래서
    "이 모델이 진짜 더 싼가" 를 숫자로 말할 수 없었다.
    request 건당 토큰 수는 그대로인데, 대본 1편을 만들 때 몇 번 호출하고
    각각 몇 토큰이 나가는지만 알면 편당 비용이 나온다.

두 가지를 구분한다
    1) 예상(고정)   REF_PROFILE — 화면에 항상 보여주는 '편당 약 N원'.
                      실측 표본 기반. 화폐는 USD, 원화로도 같이 준다.
    2) 실제(누적)   Ledger — 실제로 쓴 토큰/금액을 JSON 으로 쌓는다.
                      폴백으로 여러 모델을 돌았을 때 'B 모델도 돈 냈다' 를
                      빠뜨리지 않기 위해 '시도'가 아니라 '성공한 호출' 을 기록한다.

폴백 비용 누락 (실측된 문제)
    DeepSeek 402 -> Qwen 폴백 사건에서, "시도"만 세면 DeepSeek 이 0회로
    보이지만 실제로는 DeepSeek 오류 + Qwen 1회로 끝난 셈이다. 화면에는
    '이번 편에 쓴 모델' 이 모두 보여야 사용자가 돈을 추적할 수 있다.
"""
from __future__ import annotations

import json
import os
import threading
import time
from typing import Any, Dict, List, Optional

from .provider_overrides import _data_dir as user_data_dir

_LEDGER_FILE = "llm_cost_ledger.json"
_LOCK = threading.RLock()

# USD -> KRW. 고정 환율. 실시간 조회하지 않는다(오프라인에서도 동작해야 함).
USD_KRW = 1380.0

# ── 편당 예상 비용 계산에 쓰는 기준 ──────────────────────────────
# 60초 대본 1편 실측 (2026-09-27, recipe_short 프리셋, 근거 6개 첨부).
#   실측 전 가정값(900 in / 1500 out) 은 input 이 6배 빗나갔다.
#   모듈형 프롬프트 + 근거 텍스트가 붙으면 input 이 5천을 넘는다.
#   '편당 비용'을 근거 없이 말하면 안 되므로 여기 있는 숫자는 전부 실측이다.
#   근거 추출이 실제로 돌면(=fact_lines 가 있을 때) 2번째 소량 호출이 붙는다.
#   그때는 대략 +600 in / +400 out 이다. 하단 'extra_fact_call' 로 분리했다.
REF_PROFILE: Dict[str, Dict[str, int]] = {
    # 본문 생성 1회 실측값
    "gemini_3_5_flash_lite": {"calls": 1, "in": 5416, "out": 1808, "reasoning": 0},
}

# 본문 생성은 편당 정확히 1회 호출이다(구조상).
MAIN_CALLS_PER_SCRIPT = 1

# 근거 추출 보조 호출(선택 발생). 본문 생성에 더해진다.
EXTRA_FACT_CALL = {"in": 600, "out": 400, "reasoning": 0}

# 실측 실패 = 숫자를 지어내지 않는다. UI 는 '측정 실패/미측정' 을 보여준다.
UNMEASURED_NOTE = {
    "qwen3_8_flash": "실측 실패 — 본문 생성에서 120초 timeout 3회",
}

# 성공한 실행에서 배운 값이 여기에 누적된다(모델 id 별).
#   { id: {"calls": n, "in": 합계, "out": 합계, "reasoning": 합계, "runs": 편수} }
# 한 편이 여러 번 호출될 수 있으므로 calls 도 함께 누적한다.
_PROFILE_FILE = "llm_profile.json"


def _profile_path() -> str:
    return os.path.join(user_data_dir(), _PROFILE_FILE)


def _learned() -> Dict[str, Dict[str, Any]]:
    try:
        with open(_profile_path(), "r", encoding="utf-8") as f:
            d = json.load(f)
        if isinstance(d, dict) and isinstance(d.get("models"), dict):
            return d["models"]
    except Exception:
        pass
    return {}


def _profile_for(provider: Dict[str, Any]) -> Optional[Dict[str, int]]:
    """실측 우선. 배운 값이 없으면 사람이 확인한 시드값, 그것도 없으면 None.

    반환값은 '호출 1회당' 평균이다. 편당(=호출 N회)으로 바꾸는 것은
    estimate_usd 의 몫 — 여기서 곱하지 않는다.
    """
    pid = provider.get("id")
    m = _learned().get(pid)
    if m and m.get("runs"):
        calls = max(1, int(m.get("calls") or 1))
        return {
            "calls": calls,
            "in": int(m.get("in", 0)) // calls,
            "out": int(m.get("out", 0)) // calls,
            "reasoning": int(m.get("reasoning", 0)) // calls,
            "samples": calls,
        }
    return REF_PROFILE.get(pid)


def estimate_usd(provider: Dict[str, Any]) -> Dict[str, Any]:
    """대본 1편(기본 60초) 기준 예상 비용.

    = 실측 '호출 1회당' 평균 x 본문 생성 1회 (+ 근거 추출 1회분 여유)

    실측값이 없는 프로바이더는 estimated=False 를 돌려준다.
    숫자를 지어내는 것보다 '측정 실패' 를 보이는 게 낫다.
    (DeepSeek 은 잔액 0, Qwen 은 timeout 으로 아직 실측값이 없다)
    """
    p = _profile_for(provider)
    if p is None:
        return {"usd": None, "krw": None, "known": False, "estimated": False,
                "note": UNMEASURED_NOTE.get(provider.get("id"), "아직 1편을 생성하지 않음")}
    cin = provider.get("cost_input_per_1m")
    cout = provider.get("cost_output_per_1m")
    if cin is None and cout is None:
        return {"usd": None, "krw": None, "known": False, "estimated": False,
                "note": "가격 미등록", **p}
    cin = float(cin or 0.0)
    cout = float(cout or 0.0)
    # 근거 추출이 붙는 편이 더 잦아서 항상 더해 준다(보수적 상한).
    n = MAIN_CALLS_PER_SCRIPT
    in_tok = p["in"] * n + EXTRA_FACT_CALL["in"]
    out_tok = p["out"] * n + EXTRA_FACT_CALL["out"]
    reas_tok = p["reasoning"] * n
    usd = (in_tok * cin + (out_tok + reas_tok) * cout) / 1_000_000.0
    return {
        "usd": round(usd, 6),
        "krw": round(usd * USD_KRW, 1),
        "known": True, "estimated": False,
        "script_in": in_tok, "script_out": out_tok,
        "script_reasoning": reas_tok,
        **p,
    }


def format_krw(v: Optional[float]) -> str:
    # None 은 '가격 정보가 없다/아직 몰라' 두 경우가 겹친다.
    # '가격 미등록' 이라고 쓰면 사용자는 providers.yaml 을 고치려 하고,
    # 실제로는 한 번만 돌리면 나오는 값이다. 그래서 '미측정' 으로 둔다.
    if v is None:
        return "미측정"
    if v < 1:
        return f"{v:.2f}원"
    if v < 100:
        return f"{v:.0f}원"
    return f"{v:,.0f}원"


# ── 실제 사용량 원장 ─────────────────────────────────────────────
def _empty() -> Dict[str, Any]:
    return {"version": 1, "totals": {}, "recent": []}


def _path() -> str:
    return os.path.join(user_data_dir(), _LEDGER_FILE)


def _read() -> Dict[str, Any]:
    p = _path()
    try:
        with open(p, "r", encoding="utf-8") as f:
            d = json.load(f)
        if isinstance(d, dict) and isinstance(d.get("totals"), dict):
            d.setdefault("recent", [])
            return d
    except Exception:
        pass
    return _empty()


def _write(d: Dict[str, Any]) -> None:
    p = _path()
    try:
        os.makedirs(os.path.dirname(p), exist_ok=True)
        tmp = p + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(d, f, ensure_ascii=False, indent=2)
        os.replace(tmp, p)
    except Exception:
        pass  # 비용 기록 실패가 본 작업을 막으면 안 된다


def _row_cost(provider: Optional[Dict[str, Any]],
              u: Dict[str, int]) -> Optional[float]:
    if not provider:
        return None
    cin = provider.get("cost_input_per_1m")
    cout = provider.get("cost_output_per_1m")
    if cin is None and cout is None:
        return None
    # reasoning 토큰은 output 과 동일 단가로 계산한다(추론 모델은 대체로 그렇다).
    total_out = u.get("out", 0) + u.get("reasoning", 0)
    usd = (u.get("in", 0) * float(cin or 0.0)
           + total_out * float(cout or 0.0)) / 1_000_000.0
    return round(usd, 6)


def _learn(provider: Dict[str, Any], u: Dict[str, int]) -> None:
    """성공한 호출의 토큰 수를 누적한다. 이 합계로 '편당 예상 비용'이 배워진다.

    실패한 호출은 배우지 않는다(429/402 는 토큰이 정상 생성되지 않았다).
    """
    pid = provider.get("id")
    if not pid:
        # YAML 을 직접 읽으면 id 가 없다(키로만 존재). registry.all() 을 쓰면 붙는다.
        # 여기서 통과시키면 JSON 에 "null" 키로 쌓여 모든 프로바이더가 섞인다.
        return
    if not any(int(u.get(k) or 0) for k in ("in", "out", "reasoning")):
        return
    with _LOCK:
        try:
            d = _learned()
            m = d.get(pid) or {"calls": 0, "in": 0, "out": 0,
                               "reasoning": 0, "runs": 0, "label": provider.get("label")}
            m["calls"] = int(m.get("calls", 0)) + 1
            m["in"] = int(m.get("in", 0)) + u["in"]
            m["out"] = int(m.get("out", 0)) + u["out"]
            m["reasoning"] = int(m.get("reasoning", 0)) + u["reasoning"]
            m["runs"] = int(m.get("runs", 0)) + 1
            m["label"] = provider.get("label") or m.get("label")
            m["ts"] = int(time.time())
            d[pid] = m
            path = _profile_path()
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, "w", encoding="utf-8") as f:
                json.dump({"version": 1, "models": d}, f, ensure_ascii=False, indent=2)
        except Exception:
            pass


def record(provider: Dict[str, Any], usage: Dict[str, int], *,
           ok: bool, ms: int, error: str = "") -> None:
    """호출 1회를 원장에 쌓는다. 폴백으로 실패한 호출도 남긴다(과금 없음)."""
    u = {
        "in": int(usage.get("in") or 0),
        "out": int(usage.get("out") or 0),
        "reasoning": int(usage.get("reasoning") or 0),
    }
    pid = provider.get("id") or "?"
    usd = _row_cost(provider, u)
    with _LOCK:
        d = _read()
        t = d["totals"].setdefault(pid, {
            "id": pid, "label": provider.get("label") or pid,
            "calls": 0, "ok": 0, "failed": 0,
            "in": 0, "out": 0, "reasoning": 0, "usd": 0.0, "ms": 0,
        })
        t["label"] = provider.get("label") or pid
        t["calls"] += 1
        t["ok" if ok else "failed"] += 1
        t["in"] += u["in"]
        t["out"] += u["out"]
        t["reasoning"] += u["reasoning"]
        t["ms"] += ms
        if usd is not None:
            t["usd"] = round(float(t.get("usd", 0.0)) + usd, 6)
        d["recent"].insert(0, {
            "ts": int(time.time()), "id": pid,
            "label": provider.get("label") or pid, "ok": ok, "ms": ms,
            "usd": usd, "error": error[:120], **u,
        })
        d["recent"] = d["recent"][:60]
        _write(d)
    if ok:
        _learn(provider, u)


def totals() -> Dict[str, Any]:
    with _LOCK:
        d = _read()
        rows = sorted(d["totals"].values(),
                      key=lambda r: (-float(r.get("usd") or 0.0), r.get("id", "")))
        grand = round(sum(float(r.get("usd") or 0.0) for r in rows), 6)
        return {
            "rows": rows,
            "total_usd": grand,
            "total_krw": round(grand * USD_KRW, 1),
            "usd_krw": USD_KRW,
        }
