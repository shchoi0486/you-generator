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
from typing import Any, Dict, Optional

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
        data: Dict[str, Any] = {"enabled": {}, "pinned": {}}
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


def get_enabled_overrides() -> Dict[str, bool]:
    return dict(_read().get("enabled") or {})


def get_pinned() -> Dict[str, bool]:
    """사용자가 '이걸로 고정' 한 항목. 폴백 체이에 맨 앞에 온다."""
    return dict(_read().get("pinned") or {})


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
    }
