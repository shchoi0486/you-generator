"""카테고리별 대본 포맷(SCRIPT 레이어).

5계층 중 ③ SCRIPT FORMAT: 이야기를 어떤 방식으로 전개할 것인가.
- 영상 형태(숏폼/롱폼), 스타일(분위기), 플랫폼과는 독립된 레이어다.
- 카테고리마다 보여줄 포맷이 다르며, 각 카테고리의 첫 번째(recommended=True)가
  ★ 추천 기본값이다. 사용자는 언제든 다른 포맷으로 변경할 수 있다.
- ASMR처럼 스타일과 이름이 겹치는 경우도 역할을 분리한다.
  대본 포맷(나레이션을 줄이고 소리 중심 구성) vs 비주얼 스타일(매크로/질감 강조).
"""

SCRIPTS = {
    # ---------- 요리 / 레시피 ----------
    "cooking_tutorial": {
        "id": "cooking_tutorial",
        "name": "레시피 튜토리얼형",
        "group": "cooking",
        "flow": "완성 훅 → 재료 → 손질 → 핵심 조리 → 양념/팁 → 완성",
        "desc": "가장 기본적인 요리 영상. 재료와 조리 순서를 따라 하기 쉽게 전달",
        "recommended": True,
        "prompt": """
[대본 포맷: 레시피 튜토리얼형]
- 완성 음식 훅으로 시작해 재료 → 손질 → 핵심 조리 → 양념/팁 → 완성 순서로 전개한다.
- 각 단계에서 분량과 조리조건을 화면 자막 또는 나레이션으로 반드시 전달한다.
- 처음 보는 사람도 그대로 따라 할 수 있도록 단계별로 끊어서 설명한다.
""".strip(),
    },
    "cooking_visual": {
        "id": "cooking_visual",
        "name": "비주얼 훅형",
        "group": "cooking",
        "flow": "완성 비주얼 → 핵심 식감 장면 → 초간단 조리 → 완성",
        "desc": "음식의 비주얼과 식감을 강하게 보여주는 숏폼",
        "recommended": False,
        "prompt": """
[대본 포맷: 비주얼 훅형]
- 완성 비주얼(치즈 늘어남, 바삭함, 육즙 등)을 가장 먼저 강하게 보여준다.
- 핵심 식감 장면을 앞에서 배치하고 조리 과정은 최소한으로 압축한다.
- 나레이션은 짧은 감탄형 문장을 중심으로 구성한다.
  예: "이 치즈 늘어나는 거 보세요."
""".strip(),
    },
    "cooking_simple": {
        "id": "cooking_simple",
        "name": "초간단/자취형",
        "group": "cooking",
        "flow": "공감 문제 → 최소 재료 → 빠른 조리 → 결과",
        "desc": "재료 4개 이하, 도구 최소, 10분 내외 조리",
        "recommended": False,
        "prompt": """
[대본 포맷: 초간단/자취형]
- "배달 시키려다가 이걸로 바꿨습니다." 같은 공감 문제 제기로 시작한다.
- 재료는 4개 이하, 조리도구는 팬 하나 수준으로 최소화한다.
- 조리 과정은 빠르게 압축하고 결과물의 만족감을 마지막에 강조한다.
""".strip(),
    },
    "cooking_asmr": {
        "id": "cooking_asmr",
        "name": "ASMR 조리형",
        "group": "cooking",
        "flow": "완성 클로즈업 → 재료/손질 → 조리 소리 → 핵심 장면 → 완성",
        "desc": "나레이션을 줄이고 조리 소리 중심으로 구성",
        "recommended": False,
        "prompt": """
[대본 포맷: ASMR 조리형]
- 완성 클로즈업으로 시작해 재료/손질 → 조리 소리 → 핵심 장면 → 완성/먹는 소리로 전개한다.
- 나레이션을 줄이고 sound_prompt 비중을 높인다. 소리가 핵심인 장면은 나레이션을 비운다.
- 지글거림, 바삭함, 끓는 소리 등 실제 조리 소리를 장면마다 구체적으로 지정한다.
""".strip(),
    },
    # ---------- 제품 리뷰 / 추천 ----------
    "product_problem": {
        "id": "product_problem",
        "name": "문제-해결 리뷰형",
        "group": "product",
        "flow": "문제 제기 → 제품 소개 → 실제 사용 → 장점/단점 → 추천 대상",
        "desc": "불편을 겪는 사람을 중심으로 진행. 기본 추천",
        "recommended": True,
        "prompt": """
[대본 포맷: 문제-해결 리뷰형]
- "이런 불편 때문에 이 제품을 찾는 사람"을 중심으로 전개한다.
- 문제 제기 → 제품 등장 → 실제 사용 → 해결 과정 → 결과 → 추천 대상 순서로 구성한다.
- 장점만 나열하지 말고 단점 1개 이상을 반드시 포함한다.
- 마지막에 어떤 사람에게 맞는지 추천 대상을 명확히 한다.
""".strip(),
    },
    "product_handson": {
        "id": "product_handson",
        "name": "실사용 리뷰형",
        "group": "product",
        "flow": "제품 소개 → 실제 사용 → 장점 → 단점 → 사용감 → 총평",
        "desc": "직접 써본 솔직 후기 중심",
        "recommended": False,
        "prompt": """
[대본 포맷: 실사용 리뷰형]
- 제품 소개 → 실제 사용 장면 → 장점 → 단점 → 사용감 → 총평 순서로 구성한다.
- "직접 일주일 써봤는데" 같은 1인칭 실사용 톤을 유지한다.
- 스펙은 숫자로 정확히, 체감은 구체적인 상황으로 설명한다.
""".strip(),
    },
    "product_compare": {
        "id": "product_compare",
        "name": "비교형",
        "group": "product",
        "flow": "선택 상황 → A → B → 핵심 차이 → 목적별 선택 기준",
        "desc": "일반적인 제품 비교. 사용 목적별 선택 기준 제시",
        "recommended": False,
        "prompt": """
[대본 포맷: 비교형]
- 선택 상황 제시 → A 소개 → B 소개 → 핵심 차이 → 사용 목적별 선택 기준 순서로 구성한다.
- 막연한 우열이 아니라 "어떤 사람에게 무엇이 맞는지" 기준으로 정리한다.
- 가격, 핵심 스펙, 사용 편의의 3축으로 비교한다.
""".strip(),
    },
    "product_value": {
        "id": "product_value",
        "name": "가성비형",
        "group": "product",
        "flow": "가격 → 제공 가치 → 실제 사용 → 가격 대비 특징 → 적합 사용자",
        "desc": "가격 대비 가치를 중심으로",
        "recommended": False,
        "prompt": """
[대본 포맷: 가성비형]
- 가격을 먼저 제시하고 무엇을 제공하는지 → 실제 사용 → 가격 대비 특징 → 적합한 사용자 순서로 구성한다.
- 동급 가격대 제품과 비교했을 때의 차별점을 명확히 한다.
""".strip(),
    },
    # ---------- 지식 / 정보 전달 ----------
    "knowledge_3point": {
        "id": "knowledge_3point",
        "name": "핵심 3포인트형",
        "group": "knowledge",
        "flow": "질문/훅 → 핵심 1 → 핵심 2 → 핵심 3 → 한 줄 정리",
        "desc": "질문으로 시작해 3가지로 정리. 기본 추천",
        "recommended": True,
        "prompt": """
[대본 포맷: 핵심 3포인트형]
- 강한 질문이나 팩트로 시작해 핵심 1 → 핵심 2 → 핵심 3 → 한 줄 정리 순서로 구성한다.
- 각 포인트는 1~2문장으로 끝내고 사례를 1개씩 붙인다.
- 마지막에 한 줄 요약을 반드시 넣는다.
""".strip(),
    },
    "knowledge_qa": {
        "id": "knowledge_qa",
        "name": "질문-답변형",
        "group": "knowledge",
        "flow": "질문 → 왜 그런가 → 원리 → 사례 → 결론",
        "desc": "궁금증에서 원리까지 파고드는 설명",
        "recommended": False,
        "prompt": """
[대본 포맷: 질문-답변형]
- 질문 → 왜 그런가? → 원리 → 사례 → 결론 순서로 구성한다.
  예: "왜 비행기는 난기류에서 떨어지지 않을까?" → 난기류란? → 비행기에 작용하는 힘 → 실제 비행 상황 → 핵심 정리.
- 원리 설명은 전문 용어 없이 일상 비유로 풀어서 설명한다.
""".strip(),
    },
    "knowledge_myth": {
        "id": "knowledge_myth",
        "name": "오해-팩트형",
        "group": "knowledge",
        "flow": "흔한 오해 → 사실 확인 → 오해의 원인 → 실제 원리 → 요약",
        "desc": "통념을 깨는 구성. 사실관계 검증 필수",
        "recommended": False,
        "prompt": """
[대본 포맷: 오해-팩트형]
- 흔한 오해 → 사실 확인 → 왜 오해가 생겼나 → 실제 원리 → 요약 순서로 구성한다.
- 사실관계가 중요한 콘텐츠이므로 수치와 주장은 근거를 확인하고, 불확실한 내용은 단정하지 않는다.
""".strip(),
    },
    "knowledge_story": {
        "id": "knowledge_story",
        "name": "스토리 설명형",
        "group": "knowledge",
        "flow": "사건/상황 → 배경 → 전개 → 핵심 변화 → 현재 의미",
        "desc": "역사·과학·기업 이야기 등에 적합",
        "recommended": False,
        "prompt": """
[대본 포맷: 스토리 설명형]
- 사건/상황 → 배경 → 전개 → 핵심 변화 → 현재 의미 순서로 구성한다.
- 지식 콘텐츠 중에서도 역사, 과학, 기업 이야기처럼 흐름이 있는 주제에 적합하다.
- 시간 순서와 인과관계가 명확하도록 연결 문장을 사용한다.
""".strip(),
    },
    # ---------- 여행 / 브이로그 ----------
    "travel_course": {
        "id": "travel_course",
        "name": "여행 코스형",
        "group": "travel",
        "flow": "목적지 훅 → 장소 1 → 장소 2 → 장소 3 → 비용/시간 → 여행 팁",
        "desc": "장소 나열 + 동선 + 비용. 기본 추천",
        "recommended": True,
        "prompt": """
[대본 포맷: 여행 코스형]
- 여행지 훅 → 장소 1 → 장소 2 → 장소 3 → 비용/시간 → 여행 팁 순서로 구성한다.
- 각 장소마다 볼거리 1개와 소요 시간을 명시한다.
- 마지막에 총비용 감각과 동선 팁을 정리한다.
""".strip(),
    },
    "travel_spot": {
        "id": "travel_spot",
        "name": "장소 추천형",
        "group": "travel",
        "flow": "왜 가야 하나 → 장소 특징 → 볼거리 → 먹거리 → 가격/시간",
        "desc": '"여기 왜 가야 하냐면" 중심의 단일 장소 소개',
        "recommended": False,
        "prompt": """
[대본 포맷: 장소 추천형]
- "여기 왜 가야 하냐면"으로 시작해 장소 특징 → 볼거리 → 먹거리 → 가격/시간 → 추천 포인트 순서로 구성한다.
- 단일 장소를 깊게 소개하고, 누구와 가면 좋은지 대상을 명시한다.
""".strip(),
    },
    "travel_vlog": {
        "id": "travel_vlog",
        "name": "여행 브이로그형",
        "group": "travel",
        "flow": "출발 → 이동 → 첫인상 → 주요 경험 → 예상 밖 상황 → 마무리",
        "desc": "시간 흐름을 따라가는 기록형",
        "recommended": False,
        "prompt": """
[대본 포맷: 여행 브이로그형]
- 출발 → 이동 → 첫인상 → 주요 경험 → 예상 밖 상황 → 마무리 순서로 구성한다.
- 정보 전달보다 현장감과 감정 변화를 중심으로 1인칭 시점으로 전개한다.
""".strip(),
    },
    "travel_budget": {
        "id": "travel_budget",
        "name": "가성비 여행형",
        "group": "travel",
        "flow": "예산 제시 → 교통 → 숙박 → 식사 → 관광 → 총비용",
        "desc": "예산 안에서 짜는 실속 여행",
        "recommended": False,
        "prompt": """
[대본 포맷: 가성비 여행형]
- 예산 제시 → 교통 → 숙박 → 식사 → 관광 → 총비용 순서로 구성한다.
- 각 항목의 실제 금액을 명시하고 총비용이 예산 안에 들어오는지 확인한다.
""".strip(),
    },
    # ---------- 뉴스 / 이슈 브리핑 ----------
    "news_briefing": {
        "id": "news_briefing",
        "name": "이슈 브리핑형",
        "group": "news",
        "flow": "무슨 일 → 핵심 사실 → 배경 → 현재 상황 → 확인할 점",
        "desc": "사실/배경/전망 분리. 기본 추천",
        "recommended": True,
        "prompt": """
[대본 포맷: 이슈 브리핑형]
- 무슨 일이 일어났나 → 핵심 사실 → 배경 → 현재 상황 → 앞으로 확인할 점 순서로 구성한다.
- 사실, 출처, 발표 주체, 시점을 분리해서 다룬다. 확인되지 않은 내용은 추측임을 명시한다.
- 자극적인 단정("난리 났습니다" 등)보다 사실 전달을 우선한다.
""".strip(),
    },
    "news_summary": {
        "id": "news_summary",
        "name": "3분 요약형",
        "group": "news",
        "flow": "핵심 한 줄 → 배경 → 현재 상황 → 주요 쟁점 → 요약",
        "desc": "짧게 핵심만 정리",
        "recommended": False,
        "prompt": """
[대본 포맷: 3분 요약형]
- 핵심 한 줄 → 배경 → 현재 상황 → 주요 쟁점 → 요약 순서로 구성한다.
- 배경 설명은 최소한으로 줄이고 현재 상황과 쟁점에 비중을 둔다.
""".strip(),
    },
    "news_timeline": {
        "id": "news_timeline",
        "name": "사건 타임라인형",
        "group": "news",
        "flow": "시작 → 주요 사건 1 → 사건 2 → 사건 3 → 현재",
        "desc": "시간 순서로 사건 전개 정리",
        "recommended": False,
        "prompt": """
[대본 포맷: 사건 타임라인형]
- 시작 → 주요 사건 1 → 주요 사건 2 → 주요 사건 3 → 현재 순서로 구성한다.
- 각 사건마다 시점을 명시하고 사건 간의 인과관계를 연결 문장으로 잇는다.
""".strip(),
    },
    # ---------- 숏폼 분석·재창작 ----------
    "lab_structure": {
        "id": "lab_structure",
        "name": "구조 분석형",
        "group": "shorts_lab",
        "flow": "원본 훅 분석 → 전개 구조 분석 → 유지 요소 → 새 주제 적용",
        "desc": "원본 구조 추출 후 새 콘텐츠로. 기본 추천",
        "recommended": True,
        "prompt": """
[대본 포맷: 구조 분석형]
- 원본 훅 분석 → 전개 구조 분석 → 유지해야 할 요소 → 새 주제에 적용 → 새로운 대본 순서로 구성한다.
- 원본 콘텐츠를 그대로 복제하지 말고 구조적 특징(훅 방식, 전개 리듬, CTA 위치)을 추출해 새로운 소재에 적용한다.
""".strip(),
    },
    "lab_hook": {
        "id": "lab_hook",
        "name": "훅 재창작형",
        "group": "shorts_lab",
        "flow": "원본 훅 패턴 → 관심 유발 구조 → 새로운 소재 → 새 대본",
        "desc": "훅 패턴만 차용해 새로 만들기",
        "recommended": False,
        "prompt": """
[대본 포맷: 훅 재창작형]
- 원본 훅 패턴 분석 → 같은 관심 유발 구조 → 새로운 소재 → 새로운 대본 순서로 구성한다.
- 훅의 구조(질문형/숫자형/반전형 등)는 유지하고 소재와 문장은 완전히 새로 쓴다.
""".strip(),
    },
    "lab_format": {
        "id": "lab_format",
        "name": "포맷 재창작형",
        "group": "shorts_lab",
        "flow": "원본 영상 구조 → 장면별 패턴 → 내 콘텐츠로 변환",
        "desc": "장면 구조를 내 콘텐츠에 이식",
        "recommended": False,
        "prompt": """
[대본 포맷: 포맷 재창작형]
- 원본의 영상 구조 → 장면별 패턴 → 내 콘텐츠에 맞게 변환 → 새로운 대본 순서로 구성한다.
- 장면 수, 전환 리듬, 자막 운용 방식을 분석해 내 주제에 맞게 재배치한다.
""".strip(),
    },
}

GROUP_NAMES = {
    "cooking": "요리 / 레시피",
    "product": "제품 리뷰 / 추천",
    "knowledge": "지식 / 정보 전달",
    "travel": "여행 / 브이로그",
    "news": "뉴스 / 이슈 브리핑",
    "shorts_lab": "숏폼 분석·재창작",
}

DEFAULTS = {
    "cooking": "cooking_tutorial",
    "product": "product_problem",
    "knowledge": "knowledge_3point",
    "travel": "travel_course",
    "news": "news_briefing",
    "shorts_lab": "lab_structure",
}


def get_script_format(script_id):
    """모르는 ID면 None (호출자가 무시)."""
    return SCRIPTS.get(script_id or "")


def list_script_formats(group=None):
    """특정 카테고리 그룹의 포맷 목록 (추천이 맨 앞). group 없으면 전체."""
    items = [s for s in SCRIPTS.values() if group is None or s["group"] == group]
    items.sort(key=lambda s: (not s["recommended"], s["name"]))
    return [
        {"id": s["id"], "name": s["name"], "group": s["group"],
         "flow": s["flow"], "desc": s["desc"], "recommended": s["recommended"]}
        for s in items
    ]


def recommended_id(group):
    """그룹의 ★ 추천 포맷 ID."""
    return DEFAULTS.get(group or "", "")


def format_block(script_id):
    """프롬프트에 삽입할 대본 포맷 블록. 모르면 빈 문자열."""
    s = get_script_format(script_id)
    if not s:
        return ""
    return "[대본 포맷: {}]\n전개: {}\n{}".format(s["name"], s["flow"], s["prompt"])
