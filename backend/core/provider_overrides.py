"""사용자별 provider 활성 상태 오버라이드.

왜 필요한가
    providers.yaml 의 `enabled` 는 배포자에 의해 박힌 '기본값' 이다.
    사용자가 BYOK 키를 등록하면 그 키를 쓰는 모델을 곧바로 켤 수 있어야 하는데,
    지금은 사용자가 providers.yaml 을 손으로 고치도록 안내하고 있다.
    그건 (1) 파일을 모르는 사람이 못 하고 (2) 여러 사용자가 공유하면 서로의
    설정을 덮어쓴다.

원칙
    - providers.yaml 은 읽기 전용. 이 모듈이 병합한다.
    - 오버라이드는 이 PC(=이 사용자) 전용 파일에 있다. %LOCALAPPDATA%.
    - hidden 항목은 못 켠다(구 항목/대체된 항목이라 어댑터가 없을 수 있다).
    - 키가 없는데 켜면 실제로는 실패하므로, 켜기는 되게 두되 UI 가 경고한다.
"""
from __future__ import annotations

import json
import os
import sys
import threading
from typing import Any, Dict, List, Optional

_LOCK = threading.RLock()
_CACHE: Optional[Dict[str, Any]] = None

# 사용자가 임의로 켤 수 없는 항목 (숨김/구버전)
_BLOCKED = set()


def _data_dir() -> str:
    """key_store 와 같은 위치 규칙을 쓴다(번들에서 exe 폴더에 쓰면 안 됨)."""
    if getattr(sys, "frozen", False):
        base = os.environ.get("LOCALAPPDATA") or os.path.expanduser("~")
        d = os.path.join(base, "YouGenerator", "data")
    else:
        here = os.path.dirname(os.path.abspath(__file__))
        d = os.path.join(os.path.dirname(here), "data")
    os.makedirs(d, exist_ok=True)
    return d


def _path() -> str:
    return os.path.join(_data_dir(), "provider_overrides.json")


def _read() -> Dict[str, Any]:
    global _CACHE
    with _LOCK:
        if _CACHE is not None:
            return _CACHE
        p = _path()
        data: Dict[str, Any] = {"enabled": {}, "pinned": {}, "order": {}}
        if os.path.exists(p):
            try:
                with open(p, "r", encoding="utf-8") as f:
                    loaded = json.load(f)
                if isinstance(loaded, dict):
                    for k in ("enabled", "pinned"):
                        if isinstance(loaded.get(k), dict):
                            data[k] = {str(a): bool(b)
                                       for a, b in loaded[k].items()
                                       if isinstance(b, bool)}
                    # order: {kind: [id, ...]}
                    lo = loaded.get("order")
                    if isinstance(lo, dict):
                        data["order"] = {
                            str(k): [str(i) for i in (v or []) if isinstance(i, str)]
                            for k, v in lo.items()
                            if isinstance(v, list)
                        }
            except Exception:
                # 손상돼도 조용히 기본값으로 간다(앱이 죽으면 안 됨)
                pass
        _CACHE = data
        return data


def _write(d: Dict[str, Any]) -> None:
    global _CACHE
    with _LOCK:
        try:
            with open(_path(), "w", encoding="utf-8") as f:
                json.dump(d, f, ensure_ascii=False, indent=2)
        except Exception as e:
            raise RuntimeError(f"오버라이드 저장 실패: {e}")
        _CACHE = d


def reload() -> None:
    global _CACHE
    with _LOCK:
        _CACHE = None


def _known(kind: str, name: str) -> bool:
    """registry 에 실제로 있는 항목인지. 없으면 오버라이드를 쓰지 않는다.

    순환 임포트 방지를 위해 안쪽에서 임포트한다(provider_overrides -> registry).
    """
    try:
        from .provider_registry import registry
        return any(p.get("id") == name for p in registry.all(kind, only_enabled=False))
    except Exception:
        return True  # registry 를 못 읽으면 검증하지 않는다(앱을 막지 않는다)


def get_enabled_overrides() -> Dict[str, bool]:
    return dict(_read().get("enabled") or {})


def get_pinned() -> Dict[str, bool]:
    """사용자가 '이걸로 고정' 한 항목. 폴백 체이에 맨 앞에 온다."""
    return dict(_read().get("pinned") or {})


def get_order(kind: str) -> List[str]:
    """사용자가 직접 정한 우선순위. 앞의 것이 1순위.

    부분 지정도 된다 — 지정되지 않은 항목은 tiers 순서로 뒤에 붙는다.
    """
    raw = (_read().get("order") or {}).get(kind) or []
    return [str(x) for x in raw if isinstance(x, str)]


def set_order(kind: str, ids: List[str]) -> Dict[str, Any]:
    """우선순위 전체를 저장한다(빈 리스트면 기본 순서로 복귀).

    '위/아래' 버튼은 이 함수에 최종 배열을 통째로 보낸다.
    부분 저장은 하지 않는다 — 순서가 꼬이기 쉽고, 사용자가 '되돌리기' 를
    원할 때 전체를 한 번에 지우는 편이 명확하다.
    """
    if kind not in ("image", "video", "tts", "llm"):
        return {"ok": False, "error": f"알 수 없는 종류: {kind}"}
    clean: List[str] = []
    for i in ids or []:
        if not isinstance(i, str):
            continue
        if i not in clean:
            clean.append(i)
    with _LOCK:
        d = _read()
        d.setdefault("order", {})
        if not clean:
            d["order"].pop(kind, None)
        else:
            d["order"][kind] = clean
        _write(d)
    return {"ok": True, "kind": kind, "order": clean}


def move(kind: str, name: str, delta: int) -> Dict[str, Any]:
    """한 항목을 delta 칸 위/아래로 이동시킨다(위/아래 버튼의 백엔드).

    사용자가 지정한 부분 순서가 없으면 '현재 실제 체인 순서' 를 기준으로 삼아야
    화면에서 보이는 것과 결과가 어긋나지 않는다. 그래서 계산을 마친 뒤 저장한다.
    """
    from .provider_registry import registry
    cur = get_order(kind)
    known = [p["id"] for p in registry.all(kind, only_enabled=False)]
    if not cur:
        # 기본 순서(=화면에 보이는 순서)를 먼저 저장한다.
        cur = [p["id"] for p in registry.order_for(kind, _tier_for_plan())]
    if name not in cur:
        return {"ok": False, "error": f"순서에 없는 항목입니다: {name}"}
    i = cur.index(name)
    j = i + (1 if delta > 0 else -1)
    if j < 0 or j >= len(cur):
        return {"ok": False, "error": "이미 맨 앞/맨 뒤입니다.", "order": cur}
    cur[i], cur[j] = cur[j], cur[i]
    set_order(kind, cur)
    return {"ok": True, "kind": kind, "order": cur}


def _tier_for_plan() -> str:
    try:
        from .provider_registry import current_tier
        return current_tier()
    except Exception:
        return "free"


def clear_order(kind: str) -> Dict[str, Any]:
    return set_order(kind, [])



def effective_enabled(kind: str, name: str, yaml_cfg: Dict[str, Any]) -> bool:
    """YAML 기본값 + 사용자 오버라이드를 합친 최종 활성 상태."""
    ov = _read().get("enabled") or {}
    key = f"{kind}/{name}"
    if key in ov:
        return ov[key]
    return bool(yaml_cfg.get("enabled", False))


def set_enabled(kind: str, name: str, on: bool,
                 *, hidden: bool = False) -> Dict[str, Any]:
    """사용자 오버라이드로 활성 상태를 바꾼다.

    YAML 은 건드리지 않는다. on=False 면 'YAML 기본값으로 되돌리기' 가 된다.
    """
    if hidden:
        return {"ok": False,
                "error": "숨김 항목(구버전/대체된 항목)은 켤 수 없습니다."}
    if kind not in ("image", "video", "tts", "llm"):
        return {"ok": False, "error": f"알 수 없는 종류: {kind}"}
    if name in _BLOCKED:
        return {"ok": False, "error": f"'{name}' 은 잠금 상태입니다."}
    if name.startswith(("image/", "video/", "tts/", "llm/")) or "/" in name:
        # registry.all() 이 붙이는 'kind/id' 를 id 자리에 그대로 넘긴 경우다.
        # 이걸 그냥 쓰면 'llm/image/nano_banana_2_1k' 같은 쓰레기 키가
        # provider_overrides.json 에 쌓이고, 복구하는 데 hours 가 걸린다.
        err = (f"'{name}' 은 id 가 아니라 '종류/이름' 입니다. "
               f"name 에는 id 만 넣으세요 (예: nano_banana_2_1k).")
        return {"ok": False, "error": err}
    if not _known(kind, name):
        return {"ok": False,
                "error": f"'{kind}' 에 없는 항목입니다: {name} "
                         f"(providers.yaml 확인 필요)"}

    with _LOCK:
        d = _read()
        d.setdefault("enabled", {})
        d.setdefault("pinned", {})
        # False 를 저장하면 'YAML 기본값으로 돌아감'을 뜻한다
        d["enabled"][f"{kind}/{name}"] = bool(on)
        _write(d)
    return {"ok": True, "kind": kind, "id": name, "enabled": bool(on)}


def clear(kind: Optional[str] = None, name: Optional[str] = None) -> Dict[str, Any]:
    """오버라이드를 지운다(YAML 기본값 복귀)."""
    with _LOCK:
        d = _read()
        removed = []
        for bucket in ("enabled", "pinned"):
            for k in list((d.get(bucket) or {}).keys()):
                if kind and not k.startswith(f"{kind}/"):
                    continue
                if name and not k.endswith(f"/{name}"):
                    continue
                del d[bucket][k]
                removed.append(k)
        # 우선순위 지정도 함께 되돌린다(모델 하나만 지워도 순서는 원복이 맞다).
        for bk in list((d.get("order") or {}).keys()):
            if kind and bk != kind:
                continue
            d["order"].pop(bk, None)
            removed.append(f"order:{bk}")
        _write(d)
    return {"ok": True, "removed": removed}


def set_pinned(kind: str, name: str, on: bool) -> Dict[str, Any]:
    """폴백 체인 우선순위를 사용자 지정으로 맨 앞으로 올린다."""
    with _LOCK:
        d = _read()
        d.setdefault("pinned", {})
        k = f"{kind}/{name}"
        if on:
            d["pinned"][k] = True
        else:
            d["pinned"].pop(k, None)
        _write(d)
    return {"ok": True, "pinned": bool(on)}


def summary() -> Dict[str, Any]:
    d = _read()
    return {
        "path": _path(),
        "enabled": dict(d.get("enabled") or {}),
        "pinned": dict(d.get("pinned") or {}),
        "order": dict(d.get("order") or {}),
    }
