"""모듈형 요리 레시피 프롬프트.

기존의 숏폼 전용 단일 프롬프트를 아래 모듈로 분리한다.
고정 프롬프트(CORE) + 영상 포맷(FORMAT) + 스타일(STYLE) + 이미지 규칙(VISUAL)
+ 출력 규칙(OUTPUT) + 플랫폼 메타데이터(PLATFORM) 조합으로 생성한다.

- 플랫폼(YouTube/Instagram/TikTok)은 별도 프롬프트가 아니라
  마지막 출력 단계의 메타데이터 규칙으로만 처리한다.
- 숏폼 계열(Shorts/Reels/TikTok)은 모두 세로 숏폼이므로
  SHORT_30 / SHORT_60 포맷으로 커버한다.
"""

import random as _random


# 훅 오프닝 변형 (매 생성마다 1종 무작위 선택 — 고정 오프닝 반복 방지).
# 예시 문장은 베끼지 말고 같은 구조로 이번 메뉴에 맞게 새로 쓰도록 지시한다.
HOOK_VARIANTS = [
    ("question",
     "[훅 변형: 질문형]\n"
     "- 첫 문장은 시청자에게 던지는 짧은 질문으로 시작한다.\n"
     "  (예: '이거 집에서 10분이면 된다면 믿겠어요?')"),
    ("provoke",
     "[훅 변형: 도발형]\n"
     "- 첫 문장은 상식을 뒤집는 단언으로 시작한다.\n"
     "  (예: '배달 시키면 손해입니다.')"),
    ("empathy",
     "[훅 변형: 공감형]\n"
     "- 첫 문장은 시청자의 실패 경험에 공감하며 시작한다.\n"
     "  (예: '매번 눅눅하게 됐던 그 요리, 이유가 있었습니다.')"),
    ("number",
     "[훅 변형: 숫자형]\n"
     "- 첫 문장은 구체적인 숫자(시간·금액·개수)로 시작한다.\n"
     "  (예: '3천 원, 10분, 재료 5개면 끝납니다.')"),
    ("twist",
     "[훅 변형: 반전형]\n"
     "- 첫 문장은 예상과 다른 결과 선언으로 시작한다.\n"
     "  (예: '식당 맛이 집에서 났습니다. 그것도 더 진하게.')"),
]

HOOK_ANTI_COPY = (
    "- 위 예시 문장을 그대로 베끼지 말고, 같은 구조로 이번 메뉴·이번 영상에 맞게 새로 작성한다.\n"
    "- 직전 생성과 같은 첫 문장 패턴(기사식당~/안 만들 이유가 있나요? 등)을 반복하지 않는다."
)


def pick_hook_variant():
    """이번 생성에 쓸 훅 변형 1종을 무작위로 고른다. (id, 블록) 반환."""
    vid, vblock = _random.choice(HOOK_VARIANTS)
    return vid, vblock + "\n" + HOOK_ANTI_COPY


def resolve_hook_variant(hook_id):
    """훅 지정 해석: 유효 id면 고정, 'random'/없음이면 무작위. (id, 블록) 반환."""
    _hook_map = {v[0]: v[1] for v in HOOK_VARIANTS}
    if hook_id in _hook_map:
        return hook_id, _hook_map[hook_id] + "\n" + HOOK_ANTI_COPY
    return pick_hook_variant()


# 프론트 훅 선택 UI용 메타 (id/name/desc). 'random'은 매번 변경.
HOOK_META = [
    {"id": "random", "name": "매번 변경", "desc": "생성할 때마다 5종 중 무작위로 시작"},
    {"id": "question", "name": "질문형", "desc": "시청자에게 던지는 짧은 질문으로 시작"},
    {"id": "provoke", "name": "도발형", "desc": "상식을 뒤집는 단언으로 시작"},
    {"id": "empathy", "name": "공감형", "desc": "실패 경험에 공감하며 시작"},
    {"id": "number", "name": "숫자형", "desc": "시간·금액·개수 숫자로 시작"},
    {"id": "twist", "name": "반전형", "desc": "예상 밖 결과 선언으로 시작"},
]

# ============================================================
# 대본 다양화 축
# 훅만 바꿔도 첫 1~2문장만 달라지고 나머지는 95% 동일하다.
# 실제 산출물이 갈리려면 '문장 습관(톤)' '서술 순서(구조)' '마무리(CTA)' 축이 필요하다.
# 이 3축 + 훅을 한 세트로 묶은 것이 아래 RECIPE_PRESETS.
# ============================================================

TONE_VARIANTS = [
    {"id": "casual_first", "name": "담백 1인칭",
     "desc": "반말체, 욕심 없이 담백한 1인칭",
     "prompt": "[내레이션 톤: 담백 1인칭]\n"
               "- 1인칭 반말로 담담하게. '나最近 이거 해봤는데' 같은 자연스러운 구어체.\n"
               "- 감탄사·뻔한 형용사 남발 금지. 짧은 문장을 리듬감 있게 이어붙인다.",
     "rule": "나레이션 전체 240~300자. 문장당 20자 내외. 마침표로 끊지 말고\n"
             "- 어미가 이어지는 구어 리듬을 쓴다. 조동사('~한다')보다 '-해요/-했어요'체를 쓴다."},
    {"id": "mz_blunt", "name": "MZ 직설",
     "desc": "짧고 강한 단문 위주 쿨한 반말",
     "prompt": "[내레이션 톤: MZ 직설]\n"
               "- 아주 짧은 단문 위주. 수식어·부사·관형어를 다 걷어낸다.\n"
               "- 쿨한 반말체. '이거 하나면 끝.' 처럼 단정적으로 끊는다.",
     "rule": "나레이션 전체 200~250자로 짧게. 문장당 12자 이내.\n"
             "- 부사·관형어·종결어미('-습니다')를 쓰지 않는다. '한다' 体로 끊어 짧게 이어붙인다."},
    {"id": "sensory", "name": "감각 묘사",
     "desc": "오감 묘사 우선, 설명은 최소화",
     "prompt": "[내레이션 톤: 감각 묘사]\n"
               "- 지글거림·바삭함·찹쌀쌀함·냄새 등 오감 묘사를 매 장면 최소 1개씩 넣는다.\n"
               "- 맛의 설명보다 소리와 질감 묘사를 우선한다. 설명은 최대한 줄이고 보여지는 장면을 쓴다.",
     "rule": "나레이션 전체 240~300자. 조리 장면마다 오감 묘사(소리/질감/연기/냄새)를\n"
             "- 최소 1개씩 반드시 포함한다. '볶는다/넣는다' 같은 동작 동사만 있는 문장은 금지.\n"
             "- 계량은 narration_ko에 넣지 말고 subtitle_ko로 옮긴다. 오감 묘사 자리를 계량이 먹으면 안 된다."},
    {"id": "retro", "name": "실패 회고",
     "desc": "1인칭 과거형 회고, 후회 뉘앙스",
     "prompt": "[내레이션 톤: 실패 회고]\n"
               "- '저번에 이렇게 했다가 망했다' 식 1인칭 과거형 회고체.\n"
               "- 실수의 아쉬움과 찔릿함을 담담하게. 변명하지 않고 사실대로 말한다.",
     "rule": "나레이션 전체 250~300자. 조리 지시 문장을 제외한 서술은 반드시\n"
             "- '~했다/~했다' 과거형으로 쓴다. 현재형 조동사 나열을 피한다."},
    {"id": "authority", "name": "전문가 단언",
     "desc": "전문가 관점의 여유롭고 단정적인 문장",
     "prompt": "[내레이션 톤: 전문가 단언]\n"
               "- 셰프/요리사 관점. '이 단계를 건너뛰면 안 된다' 식의 단언을 쓴다.\n"
               "- 여유 있고 신뢰감 있는 문장. 급하게 떠보지 않고 근거를 제시한다.",
     "rule": "나레이션 전체 220~280자. 조리 지시마다 '~해야 한다/건너뛰면 안 된다' 식의\n"
             "- 단언을 최소 1개 포함한다. 동사만 나열하지 말고 이유를 한 문장으로 덧붙인다."},
]

STRUCTURE_VARIANTS = [
    {"id": "fail_try", "name": "실패 → 시도 → 결과",
     "desc": "망한 경험 → 바꿔본 것 → 결과",
     "prompt": "[대본 구조: 실패 → 시도 → 결과]\n"
               "- 1) 실패 경험 제시  2) 무엇을 바꿔봤는지  3) 결과\n"
               "- 세 구간이 각각 대본의 1/3 분량이 되게 나눈다.",
     "rule": "서술 순서를 반드시 [실패 경험] → [뭘 바꿔봤는지] → [결과]로 간다.\n"
             "- 2번 구간(시도)이 반드시 한 장면 이상 있어야 한다. 재료 나열로 바로 건너뛰지 않는다."},
    {"id": "conclusion_first", "name": "결론 먼저 → 근거",
     "desc": "역순 서술, 첫 문장에 결과/핵심",
     "prompt": "[대본 구조: 결론 먼저 → 근거]\n"
               "- 첫 문장에 최종 결과나 핵심 비결을 먼저 던진다.\n"
               "- 그 뒤에 재료·방법을 '근거'로 붙이며 역순으로 풀어간다.",
     "rule": "첫 문장이 곧 최종 결과나 핵심 비결이어야 한다.\n"
             "- 그 뒤를 '왜/어떻게'가 아니라 '근거로서의 방법'으로 이어간다. 준비 이야기부터 시작하지 않는다."},
    {"id": "silent_list", "name": "무언 나열",
     "desc": "이야기 없이 재료 → 동작 → 완성",
     "prompt": "[대본 구조: 무언 나열]\n"
               "- 서사 없이 재료 → 손동작 → 완성 이미지를 순서대로 나열한다.\n"
               "- 감탄문 대신 실제 행동 묘사로 채운다. 설명은 최소화한다.",
     "rule": "경험담·감상·감탄 문장을 한 문장도 쓰지 않는다.\n"
             "- 각 장면이 '무엇을/어떻게 하는지' 행동만 서술한다. 이유 설명은 금지."},
    {"id": "problem_cause_fix", "name": "문제 → 원인 → 해결",
     "desc": "잘 안 되는 증상 → 진단 → 해결 조각",
     "prompt": "[대본 구조: 문제 → 원인 → 해결]\n"
               "- '왜 안 되지?' 하는 증상 → 원인 진단 → 해결 조각 순서.\n"
               "- 해결책은 반드시 구체적인 조각·수치·불기 하나로 뭉쳐서 제시한다.",
     "rule": "서술 순서를 반드시 [잘 안 되는 증상] → [원인 진단] → [해결 조각]으로 간다.\n"
             "- 1·2번 구간은 각각 최소 한 문장이고, 3번에서 해결 조각·수치·불기를 확정한다."},
]

CTA_VARIANTS = [
    {"id": "save", "name": "저장 유도",
     "desc": "'나중에 해먹으려면 저장' + 이유 한 줄",
     "prompt": "[마무리 CTA: 저장 유도]\n"
               "- '나중에 해먹으려면 저장해둬요' 식으로 끝낸다.\n"
               "- 저장할 이유를 한 줄 붙인다 (예: 계량표가 있어서)."},
    {"id": "comment", "name": "댓글 유도",
     "desc": "질문형으로 끝내고 다음 편 연결",
     "prompt": "[마무리 CTA: 댓글 유도]\n"
               "- 시청자에게 질문을 던지는 문장으로 끝낸다.\n"
               "- '댓글로 남겨주시면 다음 레시피에 반영할게요' 식으로 예고를 건다."},
    {"id": "subscribe", "name": "구독 유도",
     "desc": "다음 편 예고로 구독 유도",
     "prompt": "[마무리 CTA: 구독 유도]\n"
               "- '다음 편에서 더 빠르게 되는 버전 보여드릴게요' 식으로 예고한다.\n"
               "- 채널을 구독해야 볼 수 있는 정보가 있음을 암시한다."},
    {"id": "follow", "name": "팔로우 유도",
     "desc": "정서적 약속으로 팔로우 유도",
     "prompt": "[마무리 CTA: 팔로우 유도]\n"
               "- '이 계정 계속 따라오시면 매주 하나씩 공유해요' 식의 정서적 약속으로 끝낸다."},
]

# 이름 붙은 프리셋 8종. 각 항목이 톤·구조·훅·CTA를 한 세트로 묶는다.
# 하나만 골라도 출력이 확실히 갈리고, 개별 축을 오버라이드할 수도 있다.
RECIPE_PRESETS = [
    {"id": "jachae_real", "name": "자취생 리얼",
     "desc": "실패 경험에서 출발해 담백한 1인칭으로 풀어봄",
     "hook": "question", "tone": "casual_first", "structure": "fail_try", "cta": "save"},
    {"id": "banjeon_meme", "name": "반전 밈",
     "desc": "결론을 먼저 던지고 MZ 반말로 근거를 붙임",
     "hook": "provoke", "tone": "mz_blunt", "structure": "conclusion_first", "cta": "comment"},
    {"id": "asmr_immersion", "name": "ASMR 몰입",
     "desc": "감각 묘사만으로 무언 나열, 구독으로 연결",
     "hook": "number", "tone": "sensory", "structure": "silent_list", "cta": "subscribe"},
    {"id": "fail_story", "name": "실패 회고",
     "desc": "망한 적을 회고하며 원인을 짚고 해결로 마무리",
     "hook": "empathy", "tone": "retro", "structure": "problem_cause_fix", "cta": "subscribe"},
    {"id": "ultra_list", "name": "초압축 리스트",
     "desc": "숫자로 시작해 짧고 강하게 끝내는 압축형",
     "hook": "number", "tone": "mz_blunt", "structure": "silent_list", "cta": "save"},
    {"id": "chef_secret", "name": "셰프 레시피",
     "desc": "전문가 단언으로 비결을 단계별로 공개",
     "hook": "twist", "tone": "authority", "structure": "problem_cause_fix", "cta": "follow"},
    {"id": "debate_check", "name": "논쟁 검증",
     "desc": "질문으로 시작해 반론을 근거로 정리",
     "hook": "question", "tone": "casual_first", "structure": "conclusion_first", "cta": "comment"},
    {"id": "challenge_30", "name": "30초 챌린지",
     "desc": "시간 압박을 내세워 도발적으로 시작",
     "hook": "provoke", "tone": "mz_blunt", "structure": "fail_try", "cta": "save"},
]

_HOOK_BLOCKS = {vid: vblock for vid, vblock in HOOK_VARIANTS}
_AXIS_LISTS = {
    "tone": TONE_VARIANTS,
    "structure": STRUCTURE_VARIANTS,
    "cta": CTA_VARIANTS,
}
_AXIS_MAPS = {k: {v["id"]: v for v in vs} for k, vs in _AXIS_LISTS.items()}
_PRESET_MAP = {p["id"]: p for p in RECIPE_PRESETS}


def _axis_valid(axis, value):
    if not value:
        return False
    if axis == "hook":
        return value in _HOOK_BLOCKS
    return value in _AXIS_MAPS.get(axis, {})


def _axis_name(axis, value):
    if axis == "hook":
        for m in HOOK_META:
            if m["id"] == value:
                return m["name"]
        return value
    m = _AXIS_MAPS.get(axis, {}).get(value)
    return m["name"] if m else value


def resolve_recipe_axes(preset_id="random", hook_id=None, tone_id=None,
                        cta_id=None, structure_id=None):
    """프리셋 + 개별 축 오버라이드 → 확정된 훅/톤/구조/CTA 4종.

    프리셋은 한 세트이므로 '아무 축이나 섞지 말고 이 조합의 일관된 흐름을 유지'
    지시를 함께 넣는다. 명시적 오버라이드가 프리셋 값을 이긴다.
    """
    p = dict(_PRESET_MAP[preset_id]) if preset_id in _PRESET_MAP else dict(_random.choice(RECIPE_PRESETS))
    for axis, override in (("hook", hook_id), ("tone", tone_id),
                           ("structure", structure_id), ("cta", cta_id)):
        if _axis_valid(axis, override):
            p[axis] = override
    return p


def preset_axes_block(p):
    """고정된 4축을 한 블록으로 — 미리보기 첫 화면에서 무엇이 적용됐는지 보이게 한다."""
    return (
        "[선택 프리셋] {name} — {desc}\n"
        "- 내레이션 톤: {tone}\n"
        "- 대본 구조: {structure}\n"
        "- 오프닝 훅: {hook}\n"
        "- 마무리 CTA: {cta}\n"
        "- 위 4개는 서로 맞물린 한 세트다. 이 조합의 톤과 흐름을 그대로 유지한다."
        .format(name=p["name"], desc=p["desc"],
                tone=_axis_name("tone", p["tone"]),
                structure=_axis_name("structure", p["structure"]),
                hook=_axis_name("hook", p["hook"]),
                cta=_axis_name("cta", p["cta"]))
    )


def style_enforce_block(p):
    """CORE가 길고 강해서 톤/구조를 삼키는 것을 막는 최종 강제 블록.

    실제로 생성해 보니 톤·구조가 거의 반영되지 않았다(전부 '친근한' 평서문).
    계량 규칙·역할은 유지하되 '문체와 서술 순서'만 이 블록이 최종 결정한다고
    우선순위를 명시하고, 자릿수/구성 같은 측정 가능한 조건으로 못 박는다.
    프롬프트 맨 뒤(출력 규칙 바로 앞)에 둬서 recency 효과를 쓴다.
    """
    tone = _AXIS_MAPS["tone"][p["tone"]]
    struct = _AXIS_MAPS["structure"][p["structure"]]
    return (
        "[최종 적용 — 문체와 서술 순서는 이 블록이 결정한다]\n"
        "- 이 블록은 CORE의 [역할]·[계량 규칙]보다 우선한다. 계량과 사실은 그대로 지키되,\n"
        "  문체(톤)와 서술 순서(구조)는 아래를 그대로 따른다.\n"
        "- 다른 어떤 규칙이 더 세 보여도 이 블록이 문체를 정한다.\n"
        "\n"
        "■ 문체 ({tname})\n"
        "{trule}\n"
        "\n"
        "■ 서술 순서 ({sname})\n"
        "{srule}\n"
        "\n"
        "■ 자기 점검\n"
        "- 위 두 조건을 지켰는지 마지막에 확인하고, 어겼으면 문장을 고쳐 쓴다.\n"
        "- 같은 문장 모양이 3번 이상 반복되면 문장을 다시 쓴다."
        .format(tname=tone["name"], trule=tone.get("rule") or tone["prompt"],
                sname=struct["name"], srule=struct.get("rule") or struct["prompt"])
    )


# ============================================================
# 톤/구조 준수 검사 (생성 후 1회 수리용)
# 프롬프트로 지시하는 것만으로는 LLM이 자꾸 평서문으로 돌아간다.
# 실제 생성해 보니 4개 프리셋이 전부 '친근한' 존댓말 평서문이었다.
# 기계적으로 검사해서 위반을 잡아내고, 잡혔을 때만 1회 재생성한다.
# ============================================================

_SENSORY_WORDS = (
    "지글", "바삭", "바삭바삭", "찹쌀", "고소", "짭짤", "매콤",
    "싱그러", "깔끔", "퍽퍽", "쫀득",
)
# 존댓말 어미 / 반말 어미 / 단정(반말) 어미
_POLITE_ENDINGS = ("습니다", "입니다", "됩니다", "하세요", "합시다")
_CASUAL_ENDINGS = ("해요", "했어요", "네요", "거든요", "해봤", "했어")
_BLANK_ENDINGS = ("한다", "썬다", " 넣는다", " 올린다", " 넣었", " 볶는다", " 두른다",
                  "뺀다", "친다", "섞는다", "끓인다", "만든다", "国宝")
_PREP_WORDS = ("준비합니다", "준비하세요", "준비한다", "재료", "썰고", "썰어", "손질",
               "꺼냅니다", "꺼내", "준비할")
_AUTHORITY_WORDS = ("해야 한다", "하면 안", "건너뛰면", "꼭 ", "반드시", "중요", "차이", "핵심")
_PROBLEM_WORDS = ("왜", "안 되", "안돼", "실패", "망했", "눅눅", " 맨날", " 자꾸", " 늘 ",
                  "맵다", "짜다", "물다", "헐겁", "부드럽게", "계속", "항상", "여전히")
_CAUSE_WORDS = ("때문", "이유", "수분", "온도", "순서", "때라", "설명", "차이")
_EXCLAIM_WORDS = ("대박", "진짜", "정말", "너무", "역대", "미친", "완전", "엄청", "짱")
_RESULT_WORDS = ("됩니다", "입니다", "끝납니다", "완성", "맛있", "성공", "결과", "간다")


def _count_any(text, words):
    return sum(text.count(w) for w in words if w)


def check_tone_compliance(narrations, tone_id, structure_id):
    """선택한 톤/구조를 지켰는지 검사. 위반 설명 리스트 반환(빈 리스트면 통과)."""
    scenes = [t for t in (narrations or []) if (t or "").strip()]
    if len(scenes) < 2:
        return []
    joined = "\n".join(scenes)
    first = scenes[0]
    v = []

    if tone_id == "mz_blunt":
        polite = _count_any(joined, _POLITE_ENDINGS)
        if polite >= 2:
            v.append(f"존댓말 어미가 {polite}번 나왔다. '한다' 体 단문으로 다시 써라.")
        avg = len(joined.replace(" ", "")) / max(1, len(scenes))
        if avg > 34:
            v.append(f"장면당 평균 {avg:.0f}자로 길다. 문장당 12자 이내 단문으로 줄여라.")
    elif tone_id == "casual_first":
        polite = _count_any(joined, _POLITE_ENDINGS)
        casual = _count_any(joined, _CASUAL_ENDINGS)
        if polite > casual:
            v.append(f"존댓말({polite})이 반말({casual})보다 많다. 1인칭 반말 구어체로 다시 써라.")
    elif tone_id == "sensory":
        hit = _count_any(joined, _SENSORY_WORDS)
        need = max(2, len(scenes) // 2)
        if hit < need:
            v.append(f"오감 묘사가 {hit}개뿐이다(필요 최소 {need}개). 지글거림·바삭함·냄새 등 "
                     f"소리/질감 묘사를 매 조리 장면에 넣어라. 계량은 subtitle_ko로 옮기고.")
    elif tone_id == "retro":
        past = joined.count("했다") + joined.count("였다") + joined.count("했다.") + joined.count("이었다")
        if past < 2:
            v.append(f"과거형 서술이 {past}개뿐이다. 조리 지시 외 서술을 '~했다' 과거형 회고체로 바꿔라.")
    elif tone_id == "authority":
        if _count_any(joined, _AUTHORITY_WORDS) < 2:
            v.append("전문가 단언이 부족하다. 조리 지시마다 '~해야 한다/~하면 안 된다' 식 "
                     "단언과 이유를 최소 1개씩 넣어라.")

    if structure_id == "silent_list":
        hit = _count_any(joined, _EXCLAIM_WORDS)
        if hit >= 2:
            v.append(f"감탄·감상 표현이 {hit}개 나왔다. 무언 나열 구조에서는 경험담·감탄을 빼고 "
                     f"행동만 서술하라.")
    elif structure_id == "conclusion_first":
        # '배달 시키면 손해다' 같은 도발형 단언도 결론 먼저로 유효하다.
        # 그래서 '결과 표현 없음'이 아니라 '준비 이야기부터 시작'일 때만 위반으로 본다.
        if not _count_any(first, _RESULT_WORDS) and _count_any(first, _PREP_WORDS):
            v.append("첫 문장이 재료 준비로 시작한다. 완성 상태나 핵심 비결을 첫 문장에 먼저 던져라.")
    elif structure_id == "fail_try":
        if not _count_any(first, _PROBLEM_WORDS):
            v.append("첫 문장이 실패 경험으로 시작하지 않는다. '왜/맨날/늘 ~되는' 형태의 "
                     "문제 제시로 시작하고, 2번째 구간에 '무엇을 바꿔봤는지'를 넣어라.")
    elif structure_id == "problem_cause_fix":
        if not (_count_any(first, _PROBLEM_WORDS) and _count_any(joined, _CAUSE_WORDS)):
            v.append("문제 증상이나 원인 진단이 없다. [잘 안 되는 증상] → [원인] → [해결 조각] "
                     "순서로 다시 써라.")
    return v


CORE_RECIPE_PROMPT = """
[역할]
너는 실제로 집에서 따라 할 수 있는 요리 레시피와 영상 대본을 작성하는 전문 작가다.
레시피는 실제 조리 가능한 수준으로 구체적으로 작성하며,
재료의 분량, 조리 시간, 온도, 불세기 등 필요한 조건을 임의로 생략하지 않는다.
과장된 조리법이나 실제로 구현하기 어려운 레시피를 만들지 않는다.

[계량 규칙]
- 모든 식재료와 조미료는 실제 계량 가능한 정확한 분량을 사용한다.
- 단위는 g, ml, 스푼, 컵, 초, 분, 도, 약불, 중불, 강불만 사용한다.
- 1컵 = 200ml, 1스푼 = 15ml.
- 다음과 같이 정확한 분량을 회피하는 표현은 사용하지 않는다.
  적당히, 적절히, 알아서, 약간, 조금, 한 줌, 취향껏,
  넉넉히, 대충, 살짝(계량을 대신하는 경우).
- 모든 식재료와 조미료는 최소 한 번 정확한 분량을 표시한다. 주재료도 반드시 정확한 분량을 표시한다.
- 실제 계량이 어려운 재료도 가능한 경우 g, ml, 스푼 또는 컵으로 환산한다.
- 분량을 억지로 지나치게 세분화하여 부자연스러운 숫자를 만들지 않는다.

[조리 조건]
각 조리 단계에는 해당 단계에 필요한 조리 조건을 명확하게 표시한다.
필요한 경우 다음 중 하나 이상을 포함한다.
- 재료 분량
- 조리 시간
- 조리 온도
- 불세기
가열 도구를 사용하는 경우 사용하는 도구를 명확하게 표시한다.
예: 팬 중불에서 2분 / 에어프라이어 180도에서 10분 / 전자레인지 700W에서 2분.
조리 도구에 따라 필요한 조건을 누락하지 않는다.
불필요한 계량값이나 조건을 억지로 추가하지 않는다.

[조리 순서]
기본적인 조리 흐름은 다음 순서를 따른다.
재료 준비 → 재료 손질 → 가열 또는 조리 준비 → 핵심 조리 → 양념 및 간 조절 → 완성 및 플레이팅.
실제 조리 순서가 다른 경우에는 실제 레시피의 논리를 우선한다.
이미 완성된 음식을 다시 조리하는 것처럼 시간순서를 뒤섞지 않는다.

[실제 조리시간과 영상시간]
영상 재생시간과 실제 조리시간을 혼동하지 않는다.
예를 들어 영상이 60초라도 실제 조리에 15분이 필요하다면 15분 조리라고 정확하게 표시한다.
에어프라이어, 오븐, 냄비 등에서 기다리는 시간이 필요한 경우
영상에서는 점프컷으로 압축할 수 있지만 실제 조리시간은 정확하게 유지한다.

[식품 안전]
- 닭고기, 돼지고기, 소고기, 계란 등 충분한 가열이 필요한 재료는
  필요한 경우 적절한 조리 시간 또는 내부 온도를 명시한다.
- 전자레인지 사용 시 반드시 "전자레인지 가능 용기"를 사용하도록 한다.
- 생고기와 완성 음식의 조리도구 및 접시 사용에 주의한다.
- 실제 조리 안전성을 해칠 수 있는 표현은 사용하지 않는다.

[레시피 표현]
레시피는 실제 사람이 따라 하기 쉬운 자연스러운 말투로 작성한다.
불필요하게 전문적인 요리 용어를 남발하지 않는다.
사용자가 바로 이해할 수 있도록 "무엇을 / 얼마나 / 어떻게 / 얼마나 오래" 조리하는지가 명확해야 한다.

[메뉴명]
신조어, 줄임말 또는 합성 메뉴명은 첫 등장 시 의미를 설명한다.
예: 김피탕 → 김치피자탕수육. 이후에는 짧은 메뉴명을 사용할 수 있다.

[영상 대본 원칙]
영상 대본을 작성할 경우 실제 조리 흐름과 대본의 순서가 일치해야 한다.
나레이션은 화면에서 실제로 일어나는 행동과 일치해야 한다.
화면에서 하지 않은 행동을 나레이션으로 설명하지 않는다.
반대로 중요한 조리 행동을 화면과 나레이션 모두에서 명확하게 전달한다.

[나레이션]
나레이션은 실제 사람이 말하는 것처럼 자연스럽게 작성한다.
지나치게 광고처럼 과장하지 않는다.
필요한 경우 "바삭하게", "노릇하게", "치즈가 쭉 늘어납니다",
"감칠맛이 확 올라옵니다" 같은 생생한 표현을 사용할 수 있다.
단, 실제 음식의 상태와 맞지 않는 과장 표현은 사용하지 않는다.
""".strip()

FORMATS = {
    "short_30": {
        "id": "short_30",
        "name": "30초 숏폼",
        "desc": "세로형 · 30초 · 5~6장면",
        "target_sec": 30,
        "min_sec": 27,
        "max_sec": 33,
        "scene_min": 5,
        "scene_max": 6,
        "time_label": "27~33초",
        "scenes_label": "5~6개",
        "composition": "HOOK(0~4초) → INGREDIENTS → PREP → CORE → PLATING → CTA(마지막 3초)",
        "prompt": """
[영상 포맷: 30초 숏폼]
- 세로형 숏폼 영상
- 목표 길이: 30초 (전체 duration_sec 합계 27~33초 범위)
- 장면 수: 5~6개
- 각 장면 duration_sec는 정수
- CTA는 2초 이내로 짧게

[구성]
HOOK(0~4초) → INGREDIENTS → PREP → CORE → PLATING → CTA(마지막 3초).
모든 단계를 별도의 장면으로 만들 필요는 없다.
재료 소개는 조리 장면과 결합할 수 있다.
"INGREDIENTS 장면이 반드시 존재"가 아니라 "INGREDIENTS 정보가 반드시 전달"되도록 한다.

[HOOK]
- 시작 0~3초는 완성 음식의 강한 비주얼을 보여준다.
- 첫 문장에서 메뉴가 무엇인지 바로 설명한다.
- 인사, 자기소개, "오늘은~" 같은 도입은 사용하지 않는다.
- 가격, 속도, 비주얼 중 하나의 소구점만 선택한다.
- 선택한 소구점은 나레이션과 자막에서 일치시킨다.

[재료 소개]
- 재료를 길게 읽지 않는다. 핵심 재료만 빠르게 보여준다.
- 세부 분량은 화면 자막과 조리 단계에서 전달한다.
- 재료 소개만으로 영상 시간을 과도하게 사용하지 않는다.

[조리]
- 가장 중요한 조리 과정에 시간을 집중한다.
- 반복적인 손질이나 단순 대기 과정은 빠른 컷 또는 점프컷으로 처리한다.
- 실제 조리시간과 영상시간을 혼동하지 않는다.

[나레이션]
- 짧고 빠르게 전달한다. 한 문장에 너무 많은 정보를 넣지 않는다.
- 전체 장면 중 최대 1개까지 narration_ko를 비워둘 수 있다.

[CTA]
- 마지막 2~3초 이내, 짧고 자연스럽게 작성한다.
- 구독, 좋아요를 과도하게 반복하지 않는다.

[마지막 장면]
- 완성 음식 클로즈업, 필요한 경우 먹는 소리 또는 바삭한 소리, 짧은 마무리 문장.
- CTA가 필요한 경우 같은 장면에서 처리할 수 있다.
""".strip(),
    },
    "short_60": {
        "id": "short_60",
        "name": "60초 숏폼",
        "desc": "세로형 · 60초 · 6~8장면",
        "target_sec": 60,
        "min_sec": 57,
        "max_sec": 63,
        "scene_min": 6,
        "scene_max": 8,
        "time_label": "57~63초",
        "scenes_label": "6~8개",
        "composition": "HOOK(0~5초) → INGREDIENTS → PREP → HEAT → CORE → SEASONING → PLATING → CTA",
        "prompt": """
[영상 포맷: 60초 숏폼]
- 세로형 숏폼 영상
- 목표 길이: 60초 (전체 duration_sec 합계 57~63초 범위)
- 장면 수: 6~8개
- 각 장면 duration_sec는 정수
- 설명은 30초보다 조금 더 자세히

[기본 구성]
HOOK(0~5초) → INGREDIENTS → PREP → HEAT → CORE → SEASONING → PLATING → CTA.
실제 레시피에 따라 일부 장면은 합칠 수 있다.
"INGREDIENTS 정보가 반드시 전달"되도록 하며, 별도 장면이 아니어도 된다.

[HOOK: 0~5초]
- 완성 음식 클로즈업으로 시작한다.
- 첫 문장에서 메뉴명을 명확하게 말한다.
- 인사나 자기소개를 하지 않는다.
- 가격 / 속도 / 비주얼 중 하나만 선택한다.
- 나레이션과 자막은 같은 소구점을 전달한다.

[INGREDIENTS: 5~10초]
- 재료명을 빠르게 보여준다.
- "탕수육, 신김치, 케첩, 모짜렐라 치즈를 준비합니다." 같은 자연스러운 나레이션을 사용한다.
- 세부 g/ml 분량은 화면 자막과 조리 장면에서 전달한다.
- 재료를 하나씩 길게 설명하지 않는다.

[PREP]
- 필요한 재료 손질을 보여준다.
- 손질 과정에서 필요한 분량을 화면에 표시한다.
- 반복적이거나 중요도가 낮은 과정은 빠르게 처리한다.

[HEAT]
- 팬, 냄비, 오븐, 에어프라이어, 전자레인지 등 실제 사용하는 조리도구를 명시한다.
- 온도, 불세기, 시간 중 필요한 조건을 표시한다.

[CORE]
- 음식의 핵심이 만들어지는 장면을 가장 중요하게 다룬다.
- 중요한 식감 변화와 조리 포인트를 보여준다.
- 고기나 계란 등 충분한 가열이 필요한 재료는 안전한 조리조건을 명시한다.

[SEASONING]
- 양념과 간의 분량을 정확하게 표시한다.
- "적당히", "조금", "약간" 등의 표현으로 분량을 대신하지 않는다.
- 양념을 넣는 순서와 필요한 조리시간을 명확하게 한다.

[PLATING]
- 새로운 조리 과정은 넣지 않는다.
- 완성 음식의 형태와 식감을 보여준다.
- 치즈가 늘어나는 장면, 바삭한 소리, 김이 올라오는 장면 등 실제 음식의 특징을 강조한다.

[CTA]
- 마지막 3초 이내, 짧고 자연스럽게 작성한다.
- 음식 영상의 분위기를 깨는 과도한 효과음이나 환호성을 사용하지 않는다.

[무음]
- narration_ko가 없는 장면은 최대 2개까지 허용한다.
- 무음 장면에는 "(무음)" 등의 텍스트를 절대 넣지 않는다. 빈 문자열("") 자체를 무음으로 사용한다.
""".strip(),
    },
    "long_5": {
        "id": "long_5",
        "name": "5분 롱폼",
        "desc": "가로/세로 · 약 5분 · 10~15장면",
        "target_sec": 300,
        "min_sec": 270,
        "max_sec": 330,
        "scene_min": 10,
        "scene_max": 15,
        "time_label": "270~330초 (4:30~5:30)",
        "scenes_label": "10~15개",
        "composition": "HOOK → 완성 소개 → 재료 → 손질 → 조리 과정 → 핵심 포인트 → 플레이팅 → 시식 → CTA (전 과정 상세 + 중간 팁)",
        "prompt": """
[영상 포맷: YouTube Long-form 5분]
- 가로형 또는 세로형 롱폼 영상
- 목표 길이: 약 5분 (전체 duration_sec 합계 270~330초 범위)
- 장면 수: 10~15개
- 각 장면은 실제 설명과 조리 흐름에 맞춰 구성한다.
- 조리 과정을 상세히 풀고 실제 조리시간과 병행 설명한다.

[전체 구성]
1. HOOK
2. 완성 음식 소개
3. 재료 소개
4. 재료 손질
5. 조리 과정
6. 핵심 조리 포인트
7. 완성 및 플레이팅
8. 시식
9. 마무리/CTA

[HOOK]
- 시작 5~10초 안에 완성 결과물을 보여준다.
- 메뉴가 무엇인지 바로 설명한다.
- 이 요리의 핵심적인 특징을 하나 제시한다.
- 불필요한 자기소개나 긴 인사말은 생략한다.

[재료 소개]
- 숏폼보다 충분히 설명할 수 있다. 각 재료의 분량을 명확하게 보여준다.
- 단순히 재료 이름만 나열하지 말고 필요한 경우 해당 재료가 어떤 역할을 하는지 설명한다.

[손질]
- 재료 손질 방법을 실제로 따라 할 수 있도록 설명한다.
- 칼질 크기나 손질 상태가 결과물에 영향을 미치는 경우 설명한다.

[조리]
- 실제 조리 순서를 자세하게 보여준다.
- 각 단계의 시간, 온도, 불세기 등을 표시한다.
- 조리 과정에서 발생하는 중요한 변화도 설명한다.
  예: 고기가 익으면서 수분이 빠지는 과정 / 양념이 졸아드는 정도 /
      소스 농도가 변하는 시점 / 치즈가 녹는 상태.

[실패 방지 팁]
- 필요한 경우 조리 과정 중간에 실패하기 쉬운 부분을 설명한다.
  예: 불이 너무 세면 타는 경우 / 물을 너무 많이 넣으면 소스가 묽어지는 경우 /
      재료를 너무 일찍 넣으면 식감이 떨어지는 경우.

[시식]
- 완성 음식의 식감과 맛을 자연스럽게 표현한다.
- 단순한 "맛있어요"만 반복하지 않는다.
- 실제 음식에서 확인할 수 있는 특징을 중심으로 설명한다.

[CTA]
- 마지막에 자연스럽게 마무리한다.
- 영상 내용과 관계없는 과도한 홍보 문구는 사용하지 않는다.

[나레이션]
- 숏폼보다 설명을 충분히 한다.
- 조리 이유와 실패 방지 팁을 포함한다.
- 각 조리 단계에서 필요한 계량과 조리조건을 설명한다.
- 장면 전환이 자연스럽도록 연결 문장을 사용한다.

[영상 연출]
- 클로즈업과 전체샷을 적절히 교차한다.
- 중요한 조리 과정은 여러 각도에서 보여준다.
- 조리 대기시간은 필요에 따라 압축한다.
""".strip(),
    },
}

STYLES = {
    "realistic": {
        "id": "realistic",
        "name": "현실적인 요리",
        "desc": "한국 가정식 기본값",
        "prompt": """
[스타일: REALISTIC]
- 실제 한국 가정에서 촬영한 것처럼 자연스럽게 표현한다.
- 과도하게 고급스럽거나 광고처럼 연출하지 않는다.
- 음식의 색과 질감을 실제 조리 결과에 가깝게 표현한다.

[VISUAL STYLE]
small Korean home kitchen,
warm natural daylight,
light wood counter,
photorealistic,
hands only,
no face,
no text,
no watermark
""".strip(),
    },
    "jasuisaeng": {
        "id": "jasuisaeng",
        "name": "자취생",
        "desc": "원룸 주방 · 단순 · 빠른 컷",
        "prompt": """
[스타일: 자취생]
- 일반적인 가정 또는 원룸 주방에서 실제로 만들 수 있는 분위기.
- 복잡한 전문 조리도구를 사용하지 않는다.
- 구하기 어려운 재료를 불필요하게 사용하지 않는다.
- 조리 과정은 최대한 단순하게 구성한다.
- 설거지와 조리도구 사용량도 가능한 경우 줄인다.

[말투]
- 친근하고 빠른 말투.
- 실제 자취생이 친구에게 알려주는 듯한 느낌.
- 과도한 광고 문구는 사용하지 않는다.

[연출]
- 작은 주방, 손과 음식 중심, 현실적인 조리도구, 빠른 컷.
- 완성 음식의 비주얼을 강하게 보여준다.

[VISUAL STYLE]
compact studio kitchen,
simple cheap ingredients,
casual bright lighting,
quick meal vibe,
photorealistic,
hands only
""".strip(),
    },
    "asmr": {
        "id": "asmr",
        "name": "ASMR",
        "desc": "음식 소리 중심",
        "prompt": """
[스타일: ASMR / 음식 소리 중심]
- 음식의 실제 조리 소리를 강조한다.
- 불필요한 배경음과 과도한 효과음을 최소화한다.
- 팬에서 지글거리는 소리, 칼로 재료를 써는 소리, 튀김의 바삭한 소리,
  소스가 끓는 소리, 치즈가 늘어나는 소리, 접시에 담는 소리 등
  실제 발생 가능한 소리를 중심으로 구성한다.
- 나레이션은 필요한 정보만 짧게 전달한다.
- 소리 자체가 중요한 장면은 narration_ko를 빈 문자열로 만들 수 있다.
- 단, 실제 존재하지 않는 소리를 임의로 만들어내는 표현은 사용하지 않는다.

[VISUAL STYLE]
extreme close-up,
sharp focus on texture,
soft diffused natural light,
crisp details,
sound-focused framing,
no face
""".strip(),
    },
    "cinematic": {
        "id": "cinematic",
        "name": "시네마틱",
        "desc": "영화적인 고급 음식 영상",
        "prompt": """
[스타일: CINEMATIC FOOD]
- 고급스럽고 영화적인 음식 영상 분위기.
- 음식의 질감과 빛을 강조한다.
- 얕은 심도와 자연스러운 렌즈 효과를 사용한다.
- 불필요한 화면 요소를 최소화한다.
- 얼굴은 보여주지 않는다. 손과 음식 중심으로 촬영한다.

[VISUAL STYLE]
cinematic warm lighting,
shallow depth of field,
moody atmosphere,
slow motion feel,
rich colors,
film grain,
photorealistic
""".strip(),
    },
}

VISUAL_PROMPT_RULES = """
[이미지 생성 프롬프트 공통 규칙]
모든 visual_prompt_en은 영어로 작성한다.
각 장면의 visual_prompt_en은 다음 구조를 기본으로 한다.
[STYLE ANCHOR] + [SCENE ACTION] + [FOOD STATE] + [CAMERA] + [LIGHTING] + [SAFETY / EXCLUSION]

[STYLE ANCHOR]
small Korean home kitchen,
warm natural light,
same white ceramic plate,
same kitchen environment,
same food appearance,
photorealistic food photography

[장면 일관성]
동일한 레시피의 모든 장면에서 다음 요소를 일관되게 유지한다.
- 주방, 접시, 주요 조리도구, 음식의 색상, 음식의 형태, 재료의 양과 상태, 조리 단계.
장면마다 갑자기 다른 주방이나 다른 접시를 사용하지 않는다.

[카메라]
장면의 목적에 따라 다음 표현을 사용한다.
- close-up, extreme close-up, overhead shot, medium shot, macro food shot.
음식의 핵심 조리 장면은 close-up 또는 macro shot을 우선한다.

[식감]
음식의 특성에 맞는 시각적 표현을 사용한다.
예: crispy texture / bubbling sauce / steam rising / stretching mozzarella /
    glossy sauce / golden brown crust / juicy meat / tender texture.
음식에 존재하지 않는 식감 표현은 사용하지 않는다.
"8k" 같은 품질 토큰에만 의존하지 말고 photorealistic, high-detail food photography,
natural texture, realistic lighting, sharp food texture를 우선한다.

[제외 요소]
모든 장면에 다음을 기본 적용한다.
no text, no subtitles, no watermark, no logo, no face,
no distorted hands, no extra fingers, no duplicated ingredients.
""".strip()

OUTPUT_PROMPT = """
[출력 형식]
반드시 JSON 구조로 출력한다. 장면 배열의 키 이름은 아래와 정확히 일치시킨다
(앱 변환기가 visual.keyword / visual.description으로 읽는다).
{
  "title": "",
  "description": "",
  "total_cooking_time": "",
  "video_duration_sec": 0,
  "ingredients": [
    { "name": "", "amount": "", "unit": "" }
  ],
  "storyboard": [
    {
      "section": "HOOK",
      "speaker": "BJ 이슈왕",
      "narration_ko": "",
      "subtitle_ko": "",
      "sfx": "",
      "sound_prompt": "",
      "duration_sec": 0,
      "visual": {
        "type": "ai_image",
        "keyword": "한국어 키워드 (예: 된장찌개 끓는 냄비)",
        "description": "English B-roll prompt",
        "stock_query": "melting cheese",
        "filming_guide": "팬 위 치즈를 클로즈업으로 2초간 촬영"
      }
    }
  ]
}

[scene type → section 값]
다음 중 하나를 section에 사용한다.
HOOK, INGREDIENTS, PREP, HEAT, CORE, SEASONING, PLATING, TASTE, CTA.
영상 포맷에 따라 사용하지 않는 type은 생략할 수 있다.

[duration_sec]
정수만 사용한다. 전체 duration_sec 합계는 선택된 영상 포맷의 목표 길이를 따른다.

[narration_ko]
실제로 TTS가 읽을 문장만 작성한다.
"(무음)", "무음", "효과음" 등의 설명을 narration_ko 안에 작성하지 않는다.
무음 장면은 빈 문자열 ""로 표시한다.
쉼표(,)로 문장을 끊어 별도 장면으로 나누지 않는다.
'명사+수량'(예: 감자 2개)은 반드시 같은 장면의 같은 문장에 둔다.
(나쁨: 장면A "닭 10호 2마리, 감자" / 장면B "2개, 당근 1개")
(좋음: 장면A "닭 10호 2마리" / 장면B "감자 2개, 당근 1개")
한 장면의 narration_ko는 완결된 문장(또는 쉼표로 연결된 완결 어절 묶음)으로만 작성한다.

[subtitle_ko]
화면에 표시할 실제 자막만 작성한다.
불필요하게 narration_ko와 완전히 동일한 긴 문장을 반복하지 않는다.

[visual]
반드시 객체 형태로 작성한다. 문자열 하나로 때우지 않는다.
- keyword: 한국어 명사구 (예: 된장찌개 끓는 냄비). 빈말이 아니고 매 장면 구체적으로.
- description: 이미지 또는 영상 생성 모델에 직접 전달할 수 있는 영어 프롬프트.
  화면에 자막이나 글자를 생성하도록 요청하지 않는다.
- stock_query: 스톡 검색용 영어 키워드 2~3개.
- filming_guide: 직접 촬영용 한글 가이드 1줄.
- 중요: 모든 장면에 같은 keyword/description을 복사하지 마라.
  각 장면은 해당 장면에서 다루는 재료·동작 중심의 서로 다른 구체적 문구여야 한다.
  예: HOOK "완성된 김치피자탕수육 클로즈업" / PREP "도마 위 손질된 재료들" 처럼 장면 내용이 드러나야 한다.

[sound_prompt]
해당 장면에서 필요한 실제 음식 소리 또는 최소한의 효과음을 작성한다.
""".strip()

PLATFORMS = {
    "youtube": {
        "id": "youtube",
        "name": "YouTube",
        "desc": "제목·설명·해시태그",
        "prompt": """
[YouTube 메타데이터 규칙]
- 제목: 짧고 핵심 메뉴 포함, 핵심 키워드 포함
- 설명: 레시피 핵심을 간략히 요약
- 해시태그: 3~5개
""".strip(),
    },
    "instagram": {
        "id": "instagram",
        "name": "Instagram",
        "desc": "짧은 캡션·해시태그",
        "prompt": """
[Instagram 메타데이터 규칙]
- 첫 3초가 핵심: 오프닝에 결론을 보여준다
- 자막을 크고 선명하게 강조한다
- 세로 꽉 찬 프레임 구도로 작성한다
- 캡션은 간결한 메시지 + 해시태그 5~8개
""".strip(),
    },
    "tiktok": {
        "id": "tiktok",
        "name": "TikTok",
        "desc": "짧은 후킹 캡션",
        "prompt": """
[TikTok 메타데이터 규칙]
- 첫 1초 후킹 문구로 시작한다
- 장면 전환은 빠르게 2~3초 단위로 끊는다
- 효과음을 활발하게 사용한다
- 대화체 나레이션 + 해시태그 5~10개
""".strip(),
    },
}

DEFAULT_FORMAT = "short_60"
DEFAULT_STYLE = "realistic"
DEFAULT_PLATFORM = "youtube"

# ---- 선택값 → 프롬프트 변수 매핑 (UI 선택이 그대로 프롬프트에 주입된다) ----
FORMAT_SPECS = {
    "short_30": {
        "time": "27~33초", "target": 30, "scenes": "5~6개",
        "composition": "HOOK(0~4초) → INGREDIENTS → PREP → CORE → PLATING → CTA(마지막 3초)",
        "cta": "CTA 2초 이내",
    },
    "short_60": {
        "time": "57~63초", "target": 60, "scenes": "6~8개",
        "composition": "HOOK(0~5초) → INGREDIENTS → PREP → HEAT → CORE → SEASONING → PLATING → CTA",
        "cta": "CTA 마지막 3초 이내",
    },
    "long_5": {
        "time": "270~330초 (4:30~5:30)", "target": 300, "scenes": "10~15개",
        "composition": "HOOK → 완성 소개 → 재료 → 손질 → 조리 과정 → 핵심 포인트 → 플레이팅 → 시식 → CTA (전 과정 상세 분할 + 중간 팁 포함)",
        "cta": "마지막에 자연스럽게 마무리",
    },
}

STYLE_VISUAL_BASE = {
    "realistic": "small Korean home kitchen, warm natural daylight, light wood counter, photorealistic, hands only, no face, no text, no watermark",
    "jasuisaeng": "compact studio kitchen, simple cheap ingredients, casual bright lighting, quick meal vibe, photorealistic, hands only",
    "asmr": "extreme close-up, sharp focus on texture, soft diffused natural light, crisp details, sound-focused framing, no face",
    "cinematic": "cinematic warm lighting, shallow depth of field, moody atmosphere, slow motion feel, rich colors, film grain, photorealistic",
}

PLATFORM_RULES = {
    "youtube": "제목: 짧고 핵심 메뉴 포함 / 설명: 레시피 핵심 간략히 / 해시태그 3~5개",
    "instagram": "첫 3초에 핵심 / 자막 강조 / 세로 꽉찬 프레임 / 해시태그 5~8개",
    "tiktok": "첫 1초 후킹 / 장면 2~3초 단위 전환 / 효과음 활발 / 대화체 나레이션 / 해시태그 5~10개",
}


def get_format(format_id):
    """모르는 ID면 기본값(short_60)으로 폴백."""
    return FORMATS.get(format_id or "", FORMATS[DEFAULT_FORMAT])


def get_style(style_id):
    """모르는 ID면 기본값(realistic)으로 폴백."""
    return STYLES.get(style_id or "", STYLES[DEFAULT_STYLE])


def get_platform(platform_id):
    """모르는 ID면 기본값(youtube)으로 폴백."""
    return PLATFORMS.get(platform_id or "", PLATFORMS[DEFAULT_PLATFORM])


def resolve_format_for_duration(duration):
    """길이(초)에 가장 가까운 포맷 ID. 프론트 표시·기본값용."""
    try:
        duration = int(duration or 60)
    except (TypeError, ValueError):
        duration = 60
    best, best_gap = DEFAULT_FORMAT, None
    for fid, f in FORMATS.items():
        gap = abs(f["target_sec"] - duration)
        if best_gap is None or gap < best_gap:
            best, best_gap = fid, gap
    return best


def compose_recipe_prompt(format_id=DEFAULT_FORMAT, style_id=DEFAULT_STYLE,
                           platform_id=DEFAULT_PLATFORM, extra="", hook_id="random",
                           target_sec=None, preset_id="random", tone_id=None,
                           cta_id=None, structure_id=None):
    """CORE + FORMAT + STYLE + VISUAL + OUTPUT + PLATFORM (+추가 지시) 조합.

    UI 선택값이 변수로 주입된다:
    - 포맷 → 장면 수/구성/CTA 구조 (시간은 target_sec = 제작 설정 길이가 우선)
    - 스타일 → VISUAL 기본값 (각 장면 description은 이 기본값 + 장면 행동)
    - 플랫폼 → 메타데이터 규칙
    - 프리셋 → 훅/톤/구조/CTA 4축의 한 세트 (개별 축 오버라이드 가능)
    길이(제작 설정)가 유일한 진실이다. 포맷의 target이 아니라 target_sec를
    프롬프트에 적는다 (예: 90초 + short_60 구조 = 90초 목표 숏폼).
    """
    fmt = get_format(format_id)
    style = get_style(style_id)
    plat = get_platform(platform_id)
    spec = FORMAT_SPECS.get(fmt["id"], FORMAT_SPECS[DEFAULT_FORMAT])
    visual_base = STYLE_VISUAL_BASE.get(style["id"], STYLE_VISUAL_BASE[DEFAULT_STYLE])
    plat_rule = PLATFORM_RULES.get(plat["id"], PLATFORM_RULES[DEFAULT_PLATFORM])
    axes = resolve_recipe_axes(preset_id, hook_id, tone_id, cta_id, structure_id)
    preset_block = preset_axes_block(axes)
    header = (
        "[포맷] {} / {} / 장면 {}\n"
        "[스타일] {} / {}\n"
        "[플랫폼] {} / {}".format(
            fmt["id"], spec["time"], spec["scenes"],
            style["id"], visual_base,
            plat["id"], plat_rule,
        )
    )
    try:
        tgt = int(target_sec)
    except (TypeError, ValueError):
        tgt = int(spec["target"])
    video_spec = (
        "[영상 사양 - 선택값 반영]\n"
        "- 포맷: {} (장면 구조용, 시간은 아래 목표를 따른다)\n"
        "- 총 영상시간: {} (목표 {}초)\n"
        "- 장면 수: {}\n"
        "- 구성: {}\n"
        "- {}\n"
        "- 각 장면 duration_sec는 정수".format(
            fmt["id"], spec["time"], tgt,
            spec["scenes"], spec["composition"], spec["cta"],
        )
    )
    style_spec = (
        "[스타일 - 선택값 반영]\n"
        "- 시각 기본: {}\n"
        "- 각 장면 visual.description은 위 기본값에 장면별 행동을 추가해서 작성한다.".format(
            visual_base
        )
    )
    platform_spec = "[플랫폼 규칙 - 선택값 반영]\n- {}: {}".format(plat["name"], plat_rule)
    output_spec = OUTPUT_PROMPT.replace("video_duration_sec\": 0", "video_duration_sec\": {}".format(tgt))
    hook_block = _HOOK_BLOCKS.get(axes["hook"], "") + "\n" + HOOK_ANTI_COPY
    tone_block = _AXIS_MAPS["tone"][axes["tone"]]["prompt"]
    structure_block = _AXIS_MAPS["structure"][axes["structure"]]["prompt"]
    cta_block = _AXIS_MAPS["cta"][axes["cta"]]["prompt"]
    print(f"[Recipe Prompt] preset={axes['id']} hook={axes['hook']} tone={axes['tone']} "
          f"structure={axes['structure']} cta={axes['cta']} (format={fmt['id']}, target={tgt}s, style={style['id']})")
    blocks = [
        header,
        # 프리셋/훅/톤/구조/CTA는 대본의 뼈대이자 LLM 우선순위가 가장 높은 앞쪽에 둔다.
        # (뒤에 두면 무시되고, 프론트 미리보기의 첫 화면에도 안 보여서 확인이 안 된다.)
        preset_block,
        hook_block,
        tone_block,
        structure_block,
        cta_block,
        CORE_RECIPE_PROMPT,
        fmt["prompt"],
        style["prompt"],
        VISUAL_PROMPT_RULES,
        video_spec,
        style_spec,
        platform_spec,
        # 톤/구조는 CORE에 밀려 실제 생성에서 무시됐다. 마지막에 다시 못 박는다.
        style_enforce_block(axes),
        output_spec,
        plat["prompt"],
    ]
    if (extra or "").strip():
        blocks.append("[사용자 추가 지시 - 위 규칙과 충돌하지 않는 범위에서 반영]\n" + extra.strip())
    return "\n\n".join(blocks)


def list_recipe_options():
    """프론트 설정 화면용 목록 (선택값 매핑 포함)."""
    auto_fmt = {"id": "auto", "name": "자동", "desc": "영상 길이에 맞춰 자동 선택",
                "target_sec": None, "min_sec": None, "max_sec": None,
                "scene_min": None, "scene_max": None,
                "time": "자동", "scenes": "자동",
                "composition": "길이에 맞는 구조 자동 선택"}
    return {
        "formats": [auto_fmt] + [
            {"id": f["id"], "name": f["name"], "desc": f["desc"],
             "target_sec": f["target_sec"], "min_sec": f["min_sec"],
             "max_sec": f["max_sec"], "scene_min": f["scene_min"],
             "scene_max": f["scene_max"],
             "time": FORMAT_SPECS[f["id"]]["time"],
             "scenes": FORMAT_SPECS[f["id"]]["scenes"],
             "composition": FORMAT_SPECS[f["id"]]["composition"]}
            for f in FORMATS.values()
        ],
        "styles": [
            {"id": s["id"], "name": s["name"], "desc": s["desc"],
             "visual_base": STYLE_VISUAL_BASE.get(s["id"], "")}
            for s in STYLES.values()
        ],
        "platforms": [
            {"id": p["id"], "name": p["name"], "desc": p["desc"],
             "rule": PLATFORM_RULES.get(p["id"], "")}
            for p in PLATFORMS.values()
        ],
        "hooks": HOOK_META,
        "presets": [
            {"id": "random", "name": "매번 변경", "desc": "생성할 때마다 8종 중 무작위 세트"}
        ] + [dict(p) for p in RECIPE_PRESETS],
        "tones": [{"id": v["id"], "name": v["name"], "desc": v["desc"]} for v in TONE_VARIANTS],
        "structures": [{"id": v["id"], "name": v["name"], "desc": v["desc"]} for v in STRUCTURE_VARIANTS],
        "ctas": [{"id": v["id"], "name": v["name"], "desc": v["desc"]} for v in CTA_VARIANTS],
        "defaults": {
            "format": DEFAULT_FORMAT,
            "style": DEFAULT_STYLE,
            "platform": DEFAULT_PLATFORM,
            "hook": "random",
            "preset": "random",
        },
    }
