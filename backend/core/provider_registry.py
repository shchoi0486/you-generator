"""AI 프로바이더 레지스트리.

config/providers.yaml 을 읽어 프로바이더 목록·폴백 체인·키 해석을 제공한다.
목적은 '모델 추가 시 Python 코드 수정'을 없애는 것이다.

설계 메모
  - 어댑터 이름(yaml 의 adapter)만 코드를 아는 값이다. 나머지는 전부 데이터다.
  - enabled: false 인 프로바이더는 조회 대상에서 기본 제외한다. 키를 등록했다고
    자동으로 켜지지 않는다(미검증 모델이 비용만 태우는 사고를 막기 위해).
  - 키는 settings.yaml 에서 이름을 참조만 한다. 이 파일에 평문 키를 쓰지 않는다.
"""

from __future__ import annotations

import os
import threading
from typing import Any, Dict, Iterable, List, Optional

try:
    import yaml
except ImportError:  # pragma: no cover
    yaml = None

_LOCK = threading.Lock()
_CACHE: Optional[Dict[str, Any]] = None
_HEALTH: Dict[str, Dict[str, Any]] = {}

# 같은 키를 가리키는 서로 다른 이름. 조회 때 전부 시도한다.
KEY_ALIASES: Dict[str, tuple] = {
    "fal_api_key": ("fal_key",),
    "qwen_api_key": ("dashscope_api_key",),
}

try:
    from . import provider_overrides as _overrides
except ImportError:  # pragma: no cover
    import provider_overrides as _overrides  # type: ignore


def _config_dir() -> str:
    # core/ 와 같은 레벨의 config/ 를 찾는다.
    here = os.path.dirname(os.path.abspath(__file__))
    for cand in (
        os.path.join(os.path.dirname(here), "config"),
        os.path.join(here, "config"),
        os.path.join(os.getcwd(), "config"),
    ):
        if os.path.isdir(cand) and os.path.exists(os.path.join(cand, "providers.yaml")):
            return cand
    return os.path.join(os.path.dirname(here), "config")


def _load_settings() -> Dict[str, Any]:
    try:
        from .config_utils import load_config
    except (ImportError, ValueError):
        from config_utils import load_config
    try:
        return load_config() or {}
    except Exception:
        return {}


def _load_raw() -> Dict[str, Any]:
    global _CACHE
    with _LOCK:
        if _CACHE is not None:
            return _CACHE
        path = os.path.join(_config_dir(), "providers.yaml")
        data: Dict[str, Any] = {}
        if yaml is not None and os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                data = yaml.safe_load(f) or {}
        _CACHE = data
        return data


def reload() -> None:
    """providers.yaml 을 다시 읽는다(개발 중 파일 수정 반영용)."""
    global _CACHE
    with _LOCK:
        _CACHE = None
    try:
        _overrides.reload()
    except Exception:
        pass


class ProviderRegistry:
    # ── 조회 ────────────────────────────────────────────────
    def section(self, kind: str) -> Dict[str, Dict[str, Any]]:
        out = {}
        for name, cfg in (_load_raw().get(kind) or {}).items():
            if not isinstance(cfg, dict):
                continue
            row = dict(cfg)
            row.setdefault("id", name)
            row.setdefault("kind", kind)
            row["yaml_enabled"] = bool(cfg.get("enabled", False))
            row["enabled"] = _overrides.effective_enabled(kind, name, cfg)
            row["enabled_by_user"] = (
                row["enabled"] != row["yaml_enabled"])
            out[name] = row
        return out

    def get(self, kind: str, name: str) -> Optional[Dict[str, Any]]:
        item = (_load_raw().get(kind) or {}).get(name)
        if not isinstance(item, dict):
            return None
        row = dict(item)
        row["id"] = name
        row["kind"] = kind
        row["yaml_enabled"] = bool(item.get("enabled", False))
        row["enabled"] = _overrides.effective_enabled(kind, name, item)
        row["enabled_by_user"] = row["enabled"] != row["yaml_enabled"]
        return row

    def all(self, kind: str, only_enabled: bool = True) -> List[Dict[str, Any]]:
        out = []
        for name, cfg in (self.section(kind)).items():
            if not isinstance(cfg, dict):
                continue
            if cfg.get("hidden"):
                continue          # 구 항목/대체된 항목. 폴백에도 넣지 않는다.
            if only_enabled and not cfg.get("enabled", False):
                continue
            row = dict(cfg)
            row["id"] = name
            row["kind"] = kind
            out.append(row)
        return out

    def api_keys(self) -> List[Dict[str, Any]]:
        """BYOK 키 등록 화면이 읽는 목록."""
        return [dict(x) for x in (_load_raw().get("api_keys") or [])
                if isinstance(x, dict)]

    def usd_krw(self) -> float:
        try:
            return float((_load_raw().get("pricing") or {}).get("usd_krw", 1370))
        except (TypeError, ValueError):
            return 1370.0

    def supported(self, kind: str, mode: str) -> List[Dict[str, Any]]:
        """mode(t2i/i2i/search/static) 를 지원하는 프로바이더만."""
        return [p for p in self.all(kind) if mode in (p.get("modes") or [])]

    def order_for(self, kind: str, tier: str = "free") -> List[Dict[str, Any]]:
        """티어에 적힌 순서대로 프로바이더를 돌려준다. 없는 항목은 건너뛴다.

        사용자가 '고정'한 항목은 티어 순서와 무관하게 맨 앞에 온다.
        (유료 모델을 쓰고 싶지만 기본 폴백이 무료 모델이라 우연히 돌아가는 걸 방지)
        """
        tiers = _load_raw().get("tiers") or {}
        t = tiers.get(tier) or {}
        ids = list(t.get(f"{kind}_order") or [])
        by_id = {p["id"]: p for p in self.all(kind)}
        out = [by_id[i] for i in ids if i in by_id]

        pinned = _overrides.get_pinned()
        pin_ids = [k.split("/", 1)[1] for k, v in pinned.items()
                   if v and k.startswith(f"{kind}/")]
        if pin_ids:
            # 고정한 모델은 티어 순서와 무관하게 맨 앞으로 온다.
            # 티어 목록 안에 있더라도 '원래 위치' 로 되돌려 보내지 않는다.
            # 그래야 '1순위로 지정' 이 실제로 통한다.
            pinned_rows = [by_id[i] for i in pin_ids
                           if i in by_id and by_id[i].get("enabled")]
            out = pinned_rows + [p for p in out if p["id"] not in pin_ids]

        # 티어에 없는 enabled 항목은 뒤에 붙인다(추가된 모델이 사라지지 않도록).
        listed = {p["id"] for p in out}
        for p in sorted(self.all(kind),
                        key=lambda x: (x.get("cost_usd", x.get("cost_per_sec", 0)) or 0)):
            if p["id"] not in listed:
                out.append(p)
        return out

    def tier(self, name: str) -> Dict[str, Any]:
        return dict((_load_raw().get("tiers") or {}).get(name) or {})

    def tiers(self) -> Dict[str, Dict[str, Any]]:
        return dict(_load_raw().get("tiers") or {})

    def i2i_allowed(self, tier: str = "free") -> bool:
        return bool(self.tier(tier).get("i2i_allowed", False))

    # ── 키 ──────────────────────────────────────────────────
    def resolve_key(self, provider: Dict[str, Any]) -> Optional[str]:
        """provider 의 key_env 가 가리키는 실제 키 값.

        우선순위: BYOK 키 저장소(암호화) > settings.yaml > 환경변수.
        BYOK 를 먼저 보는 이유: 판매 소프트웨어에서 사용자가 등록한 키가
        관리자 설정에 덮어써지면 안 된다. 두 곳에 다 있으면 BYOK 가 이긴다.
        """
        key_env = provider.get("key_env")
        if not key_env:
            return None
        try:
            from . import key_store
        except (ImportError, ValueError):
            import key_store
        for name in self._key_names(key_env):
            try:
                v = key_store.get(name)
                if v:
                    return v
            except Exception:
                pass
        cfg = _load_settings()
        for name in self._key_names(key_env):
            val = cfg.get(name)
            if val is None:
                val = (cfg.get("image_gen") or {}).get(name)
            if val is None:
                val = (cfg.get("video_gen") or {}).get(name)
            if val is None:
                val = (cfg.get("tts") or {}).get(name)
            if isinstance(val, str) and val.strip():
                return val.strip()
        for name in self._key_names(key_env):
            val = os.environ.get(name)
            if isinstance(val, str) and val.strip():
                return val.strip()
        return None

    @staticmethod
    def _key_names(key_env: str) -> List[str]:
        """조회할 키 이름들(정규명 + 별칭).

        실제로 같은 키를 가리키는데 이름이 다른 경우가 있다.
          fal_api_key  ← 설정 화면은 'fal_key' 로 저장한다
          qwen_api_key ← tts_engine 은 'dashscope_api_key' 를 읽는다
        이걸 안 맞추면 '키를 넣었는데 왜 안 되냐'가 된다.
        """
        names = [key_env]
        for alias in KEY_ALIASES.get(key_env, ()):
            if alias not in names:
                names.append(alias)
        for auto in (key_env.replace("_api_key", "_key"),
                     key_env.replace("_key", "_api_key")):
            if auto != key_env and auto not in names:
                names.append(auto)
        return names

    def key_source(self, provider: Dict[str, Any]) -> str:
        """키가 어디서 왔는지: byok / settings / env / none."""
        key_env = provider.get("key_env")
        if not key_env:
            return "none"
        try:
            from . import key_store
        except (ImportError, ValueError):
            import key_store
        names = self._key_names(key_env)
        try:
            if any(key_store.get(n) for n in names):
                return "byok"
        except Exception:
            pass
        cfg = _load_settings()
        for n in names:
            if cfg.get(n) or (cfg.get("image_gen") or {}).get(n):
                return "settings"
        for n in names:
            if os.environ.get(n):
                return "env"
        return "none"

    def usable(self, provider: Dict[str, Any]) -> bool:
        """키가 필요하면 키가 있어야 실제로 쓸 수 있다."""
        if not provider.get("key_env"):
            return True
        return bool(self.resolve_key(provider))

    def missing_key_providers(self) -> List[Dict[str, Any]]:
        return [p for p in self.all("image", only_enabled=False)
                if p.get("key_env") and not self.resolve_key(p)]

    # ── 헬스 ────────────────────────────────────────────────
    def mark_health(self, provider_id: str, ok: bool, detail: str = "") -> None:
        import time
        _HEALTH[provider_id] = {"ok": bool(ok), "detail": detail[:200], "ts": time.time()}

    def health(self, provider_id: str) -> Dict[str, Any]:
        return dict(_HEALTH.get(provider_id) or {"ok": True, "detail": ""})

    def unhealthy(self, provider_id: str, cooldown_sec: float = 300.0) -> bool:
        """최근에 실패한 프로바이더를 잠시 건너뛴다.

        외부 free tier 는 죽었다 살아난다(실측: pollinations 가 3주간 응답하지 않음).
        실패한 경로를 끝까지 반복하면 전체 파이프라인이 느려지므로 쿨다운을 둔다.
        """
        h = _HEALTH.get(provider_id)
        if not h or h.get("ok", True):
            return False
        import time
        ts = h.get("ts", 0.0)
        return (time.time() - ts) < cooldown_sec

    # ── 비용 ────────────────────────────────────────────────
    def estimate(self, provider: Dict[str, Any], units: float = 1.0) -> float:
        for key in ("cost_usd", "cost_per_sec", "cost_per_1m_chars"):
            if key in provider:
                return float(provider[key] or 0.0) * units
        return 0.0


# 레지스트리 인스턴스는 전역 1개. 파일은 프로세스 수명 동안 캐시한다.
registry = ProviderRegistry()
