"""미디어 수집 캐시 (웹검색/AI/스톡 재사용).

문제: 후보 조회할 때마다 검색→다운로드→AI 생성을 처음부터 반복해서
느리고(장면당 수십 초), 돈 들고(API 과금), 디스크에 중복 파일이 쌓임.
해결: 쿼리/프롬프트 해시 키로 결과를 JSON + 파일로 저장해 재사용.
- 웹검색: (엔진, 검색어, 개수) → URL 목록 (TTL 7일)
- AI 이미지: (모델, 정제 프롬프트, WxH) → 파일 경로 (TTL 30일)
- 스톡: (쿼리, 개수) → 결과 목록 (TTL 7일)
- 다운로드 파일명: URL 해시 기반이라 같은 파일은 한 번만 저장됨
- refresh=True면 읽기만 건너뛰고 새로 저장 ("다시 생성" 버튼용)
"""
import hashlib
import json
import os
import time

CACHE_TTL = {
    "search": 7 * 24 * 3600,
    "ai": 30 * 24 * 3600,
    "stock": 7 * 24 * 3600,
}


def _base_dir():
    try:
        from .config_utils import get_asset_dir
    except (ImportError, ValueError):
        from config_utils import get_asset_dir
    d = os.path.join(get_asset_dir(), "previews", ".cache")
    os.makedirs(d, exist_ok=True)
    return d


def make_key(*parts):
    h = hashlib.sha1()
    for p in parts:
        h.update(str(p or "").encode("utf-8"))
        h.update(b"\x00")
    return h.hexdigest()[:24]


def _path(ns, key):
    return os.path.join(_base_dir(), f"{ns}_{key}.json")


def get(ns, key):
    """만료되지 않은 캐시면 data 반환, 없으면 None."""
    try:
        p = _path(ns, key)
        if not os.path.exists(p):
            return None
        with open(p, "r", encoding="utf-8") as f:
            obj = json.load(f)
        ttl = CACHE_TTL.get(ns, 3600)
        if time.time() - float(obj.get("ts", 0)) > ttl:
            return None
        return obj.get("data")
    except Exception as e:
        print(f"[MediaCache] get failed ({ns}): {e}")
        return None


def put(ns, key, data):
    try:
        with open(_path(ns, key), "w", encoding="utf-8") as f:
            json.dump({"ts": time.time(), "data": data}, f, ensure_ascii=False)
    except Exception as e:
        print(f"[MediaCache] put failed ({ns}): {e}")


def hashed_media_path(subdir, url, ext):
    """URL 해시 기반 저장 경로 (같은 URL = 같은 파일)."""
    from .config_utils import get_asset_dir
    d = os.path.join(get_asset_dir(), "previews", subdir)
    os.makedirs(d, exist_ok=True)
    name = make_key(url)[:16]
    if not ext.startswith("."):
        ext = "." + ext
    return os.path.join(d, f"{name}{ext}")
