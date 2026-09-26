"""웹 근거 수집 (숏폼 대본 RAG용).

우선순위: Naver Blog (키 있을 때, 한국어 레시피/제품에 강함)
        → Tavily (키 있을 때, 일반 주제)
        → DuckDuckGo (키 불필요, 항상 시도)
키가 하나도 없어도 DDG로 동작한다. 전부 실패하면 grounded=False.
"""
import re

try:
    from .config_utils import load_config
except (ImportError, ValueError):
    from config_utils import load_config


def _strip_html(t):
    return re.sub(r"<[^>]+>", "", t or "").strip()


def naver_search(query, client_id, secret, count=4):
    import requests
    items = []
    try:
        r = requests.get(
            "https://openapi.naver.com/v1/search/blog.json",
            headers={
                "X-Naver-Client-Id": client_id,
                "X-Naver-Client-Secret": secret,
            },
            params={"query": query, "display": min(count, 10), "sort": "sim"},
            timeout=15,
        )
        if r.status_code != 200:
            print(f"Naver search failed: {r.status_code}")
            return items
        for it in r.json().get("items", [])[:count]:
            items.append({
                "title": _strip_html(it.get("title")),
                "snippet": _strip_html(it.get("description"))[:300],
                "link": it.get("link", ""),
                "source": "naver-blog",
            })
    except Exception as e:
        print(f"Naver search error: {e}")
    return items


def tavily_search(query, api_key, count=4):
    import requests
    items = []
    try:
        r = requests.post(
            "https://api.tavily.com/search",
            json={
                "api_key": api_key,
                "query": query,
                "search_depth": "basic",
                "max_results": min(count, 10),
                "include_answer": False,
            },
            timeout=20,
        )
        if r.status_code in (401, 403):
            print("Tavily: invalid API key.")
            return items
        if r.status_code != 200:
            print(f"Tavily failed: {r.status_code}")
            return items
        for it in r.json().get("results", [])[:count]:
            items.append({
                "title": it.get("title", ""),
                "snippet": (it.get("content", "") or "")[:300],
                "link": it.get("url", ""),
                "source": "tavily",
            })
    except Exception as e:
        print(f"Tavily error: {e}")
    return items


def ddg_search(query, count=4):
    items = []
    try:
        try:
            from ddgs import DDGS
        except ImportError:
            from duckduckgo_search import DDGS
        with DDGS() as ddgs:
            for r in ddgs.text(query, region="kr-kr", safesearch="moderate", max_results=count):
                items.append({
                    "title": r.get("title", ""),
                    "snippet": (r.get("body", "") or "")[:300],
                    "link": r.get("href", ""),
                    "source": "ddg",
                })
    except Exception as e:
        print(f"DDG search error: {e}")
    return items


# 주제와 무관한 일반론 페이지(예: '김치피자탕수육' 검색에 '김치 백과사전') 제거용
GENERIC_WORDS = {
    "레시피", "만들기", "만드는법", "만드는법", "요리", "방법", "쉽게", "초보",
    "recipe", "how", "make", "easy", "best",
}


def _topic_bigrams(topic):
    chars = re.sub(r"\s+", "", topic or "")
    return {chars[i:i + 2] for i in range(len(chars) - 1) if len(chars[i:i + 2]) == 2}


def is_relevant(item, topic):
    """제목+발췌에 주제 고유어가 있어야 통과."""
    text = f"{item.get('title', '')} {item.get('snippet', '')}"
    terms = [w for w in re.split(r"\s+", topic or "") if len(w) >= 2 and w not in GENERIC_WORDS]
    if any(t in text for t in terms):
        return True
    # 합성어(김치피자탕수육) 대응: 서로 다른 bigram 2개 이상 매치
    bigrams = _topic_bigrams(topic)
    hits = {b for b in bigrams if b in text}
    generic_hits = {b for b in hits if any(g.startswith(b) or b in g for g in GENERIC_WORDS)}
    return len(hits - generic_hits) >= 2 or (len(bigrams) <= 2 and len(hits) >= 1)


def filter_relevant(items, topic):
    kept = [it for it in items if is_relevant(it, topic)]
    dropped = len(items) - len(kept)
    if dropped:
        print(f"[Evidence] Dropped {dropped} irrelevant pages for topic '{topic[:20]}'.")
    # 전부 탈락하면 상위 2개만 남김 (빈 근거 방지)
    return kept or items[:2]


def gather_evidence(topic, count=6):
    """주제에 대한 웹 근거 수집. {items, grounded} 반환."""
    try:
        config = load_config()
    except Exception:
        config = {}
    items = []

    naver_id = config.get("naver_client_id")
    naver_secret = config.get("naver_client_secret")
    if naver_id and naver_secret:
        items += naver_search(topic, naver_id, naver_secret, count=3)

    tavily_key = config.get("tavily_api_key")
    if tavily_key and len(items) < count:
        items += tavily_search(topic, tavily_key, count=count - len(items))

    if len(items) < 2:
        items += ddg_search(topic, count=count)

    # 중복 링크 제거
    seen, uniq = set(), []
    for it in items:
        link = it.get("link", "")
        if link and link in seen:
            continue
        seen.add(link)
        uniq.append(it)
    uniq = filter_relevant(uniq, topic)
    return {"items": uniq[:count], "grounded": len(uniq) > 0}


def fetch_page_text(url, limit=1500):
    """상위 결과 본문을 직접 긁어옴 (수치·재료·순서 확보용). 실패하면 빈 문자열."""
    import requests
    try:
        r = requests.get(
            url,
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"},
            timeout=10,
        )
        ctype = r.headers.get("Content-Type", "")
        if r.status_code != 200 or "html" not in ctype:
            return ""
        html = re.sub(r"<(script|style|nav|header|footer)[^>]*>.*?</\1>", " ", r.text, flags=re.S | re.I)
        text = re.sub(r"\s+", " ", _strip_html(html)).strip()
        return text[:limit]
    except Exception as e:
        print(f"Page fetch failed ({url[:60]}): {e}")
        return ""


FOOD_HINT_WORDS = (
    "레시피", "요리", "만들기", "반찬", "음식", "맛집", "김치", "찌개", "볶음",
    "구이", "찜", "탕", "국", "밥", "면", "빵", "케이크", "쿠키", "반죽",
    "소스", "조리", "에어프라이어", "전자레인지",
)


def gather_recipe_evidence(topic, count=6):
    """요리 주제용: 기본 검색 + '재료 분량 순서' 확장 쿼리 병합."""
    base = gather_evidence(topic, count=count)
    if not any(w in (topic or "") for w in FOOD_HINT_WORDS):
        return base
    extra = gather_evidence(f"{topic} 재료 분량 만드는 순서", count=3)
    seen = {it.get("link", "") for it in base["items"]}
    for it in extra["items"]:
        if it.get("link", "") not in seen:
            seen.add(it.get("link", ""))
            base["items"].append(it)
    # 상위 2개 본문 직접 수집 (발췌에는 없는 분량·온도·시간 확보)
    full_texts = []
    for it in base["items"][:4]:
        if len(full_texts) >= 2:
            break
        body = fetch_page_text(it.get("link", ""))
        if len(body) > 300:
            full_texts.append({
                "title": (it.get("title", "") + " (본문)"),
                "snippet": body,
                "link": it.get("link", ""),
                "source": "page",
            })
    base["items"] = (full_texts + base["items"])[: count + 2]
    base["grounded"] = len(base["items"]) > 0
    return base


def format_evidence_block(evidence):
    items = (evidence or {}).get("items", [])
    if not items:
        return ""
    lines = []
    for i, it in enumerate(items, 1):
        # 본문 수집분은 길게 (수치·순서 보존), 발췌는 짧게
        cap = 1000 if it.get("source") == "page" else 250
        lines.append(f"[{i}] {it.get('title', '')} — {(it.get('snippet', '') or '')[:cap]}")
    return "\n".join(lines)


# 수치·분량·시간·온도가 들어간 문장 우선 추출 (팩트 확정용)
FACT_UNIT_PATTERN = re.compile(
    r"\d+\s*(도|분|초|시간|g|kg|ml|l|cc|스푼|큰술|작은술|컵|개|장|봉지|팩|통|마리|포기|단|쪽|알|톨|인분|T\b)"
)


def extract_fact_sentences(evidence, limit=14):
    """근거 텍스트에서 수치가 박힌 문장만 추려 반환."""
    items = (evidence or {}).get("items", [])
    facts = []
    for it in items:
        blob = f"{it.get('title', '')}. {it.get('snippet', '') or ''}"
        # 문장 분리 (. ! ? 줄바꿈 기준)
        for sent in re.split(r"(?<=[.!?\n])\s+", blob):
            sent = re.sub(r"\s+", " ", sent).strip()
            if len(sent) < 12 or len(sent) > 220:
                continue
            if FACT_UNIT_PATTERN.search(sent) and sent not in facts:
                facts.append(sent)
            if len(facts) >= limit:
                return facts
    return facts
