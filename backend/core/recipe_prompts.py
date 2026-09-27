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
import re


# 훅 오프닝 변형 (매 생성마다 1종 무작위 선택 — 고정 오프닝 반복 방지).
# 예시 문장은 베끼지 말고 같은 구조로 이번 메뉴에 맞게 새로 쓰도록 지시한다.
HOOK_VARIANTS = [
    ("question",
     "[훅 변형: 질문형]\n"
     "- 첫 문장은 시청자에게 던지는 짧은 질문으로 시작한다.\n"
     "  (예: '이거 집에서 10분이면 된다면 믿겠어요?')"),
    ("provoke",
     "[훅 변형: 도발형]\n"
     "- 첫 문장은 상식을 뒤집는 단언으로 시작한다. 메뉴를 반드시 언급한다.\n"
     "- '이거 사먹지 마세요' 식으로 그 메뉴를 시키지 말라고 말하거나,\n"
     "  '이거 하면 되는데 뭘 사먹어요' 식으로 지혜를 알려 준다."),
    ("empathy",
     "[훅 변형: 공감형]\n"
     "- 첫 문장은 시청자의 실패 경험에 공감하며 시작한다.\n"
     "- '맨날 이거 하면 저렇게 되더라' 식으로 실패 상태를 먼저 보여준다."),
    ("number",
     "[훅 변형: 숫자형]\n"
     "- 첫 문장은 구체적인 숫자(시간·금액·개수)로 시작한다.\n"
     "  (예: '3천 원, 10분, 재료 5개면 끝납니다.')"),
    ("twist",
     "[훅 변형: 반전형]\n"
     "- 첫 문장은 예상과 다른 결과 선언으로 시작한다. 메뉴를 반드시 언급한다.\n"
     "- '식당 값 안 하고 집에서 이 맛' 처럼 결과의 이동을 짧게 선언한다."),
    ("regret",
     "[훅 변형: 후회형]\n"
     "- 첫 문장은 '왜 이제 먹었을까' 식의 진심 어린 후회로 시작한다.\n"
     "  (예: '이거 진짜 맛있는 걸 왜 이제 먹었나 후회했습니다.')"),
    ("greeting",
     "[훅 변형: 인사형]\n"
     "- 첫 문장은 짧은 인사 한 줄로 시작하고 바로 메뉴로 넘어간다.\n"
     "  (예: '안녕하세요. 오늘은 깍두기 간장 양념을 해봤습니다.')"),
]

HOOK_ANTI_COPY = (
    "- 위 예시 문장을 그대로 베끼지 말고, 같은 구조로 이번 메뉴·이번 영상에 맞게 새로 작성한다.\n"
    "- '배달 시키면 손해입니다' 같은 예시 첫 문장을 그대로 쓰면 실패한 대본이다.\n"
    "- 첫 문장에 메뉴 재료/동작이 드러나야 한다. '집에서 났습니다' 같은 두루뭉술한 문장을 쓰지 않는다.\n"
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
# HOOK_VARIANTS에서 자동 생성한다 — 손으로 나열하면 훅을 추가할 때 여기가 조용히
# 밀려 12개 프리셋 중 훅이 UI에 안 뜨는 버그가 났다(실측: regret/greeting 누락).
_HOOK_META_DESC = {
    "random": "생성할 때마다 7종 중 무작위로 시작",
    "question": "시청자에게 던지는 짧은 질문으로 시작",
    "provoke": "상식을 뒤집는 단언으로 시작",
    "empathy": "실패 경험에 공감하며 시작",
    "number": "시간·금액·개수 숫자로 시작",
    "twist": "예상 밖 결과 선언으로 시작",
    "regret": "'왜 이제 먹었을까' 식의 후회로 시작",
    "greeting": "짧은 인사 한 줄로 시작하고 바로 메뉴로",
}
HOOK_META = [{"id": "random", "name": "매번 변경", "desc": _HOOK_META_DESC["random"]}]
for _hid, _hblock in HOOK_VARIANTS:
    _hname = re.search(r"\[훅 변형: (.+?)\]", _hblock)
    HOOK_META.append({
        "id": _hid,
        "name": _hname.group(1) if _hname else _hid,
        "desc": _HOOK_META_DESC.get(_hid, ""),
    })

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
    {"id": "self_deprecating", "name": "자조 개그 반말",
     "desc": "청자에게 툭 던지는 자기 비하·친근한 농담이 섞인 반말",
     "prompt": "[내레이션 톤: 자조 개그 반말]\n"
               "- 나레이터가 청자에게 자기 비하/친근한 농담을 툭 던지는 반말체.\n"
               "- 예: '최소는 형이 먹으세요', '저는 고기 먹을게요', '깜부리는 네가 할 일이 있나'\n"
               "- 조리 지사는 정확히 하되 그 사이에 개그 포인트 한 마디씩을 섞는다.",
      "rule": "아래 2개는 선택이 아니라 필수다. 하나라도 빠지면 실패한 대본이다.\n"
              "- 1) 조리 장면 3개 중 1개 이상에 자기 비하/친근한 농담 한 마디를 넣는다.\n"
              "- 2) 대본은 반말(-다/-할게요)로 통일한다. 존댓말로 빠지지 않는다.\n"
              "- 농담은 조리 정보를 대신하지 않는다. 정보는 정확히 쓰고 농담은 한 문장.\n"
              "- 서술은 총 250~320자."},
    # ---- 아래 4종은 실루엣 예시로 톤 3분할한 결과다. ----
    # 분석기(Gemini)가 '친근 조리 나레이션'을 너무 넓게 씌워 서로 다른 4개 영상이
    # 한 톤으로 뭉쳤다. 어미 조감이 실제로 다르므로 어미를 기준으로 다시 갈랐다.
    # 출처: [레시피 읽어주는 여자] / [간장국수 채널] / [여보어때] / [무니키친]
    {"id": "polite_guide", "name": "낭독 존댓말",
     "desc": "~습니다와 ~요가 섞인 읽어주기 톤",
     "prompt": "[내레이션 톤: 낭독 존댓말]\n"
               "- 화면 밖의 누군가에게 읽어주듯 차분하고 또렷하게 말한다.\n"
               "- 조리 지시 문장은 ~습니다, 마무리 서술은 ~요를 섞어 쓴다.\n"
               "- 예: '소금 한 스푼 넣어 줍니다', '이렇게 하면 수육 끝이고요'\n"
               "- 반말·자기 개그를 넣지 않는다. 설명만 한다.",
      "rule": "나레이션 전체 260~320자. 조리 지시마다 '~습니다/~/줘요'를 쓴다.\n"
              "- 서술은 '~고요/~습니다'로 섞는다. 해요체·반말·자기 개그는 쓰지 않는다.\n"
              "- 재료와 손동작을 사실대로 이어 붙이는 흐름이 핵심이다."},
    {"id": "warm_recall", "name": "추억 회상",
     "desc": "~거든요·~죠 반말이 섞인 친근한 수제 요리",
     "prompt": "[내레이션 톤: 추억 회상]\n"
               "- '어렸을 때 먹던 ~'처럼 옛날 기억에서 출발한 친근한 톤.\n"
               "- ~거든요, ~죠, ~이에요가 자연스럽게 섞인다.\n"
               "- 예: '어렸을 때 즐겨 먹었거든요', '참 쉽죠?'\n"
               "- 손재주가 아닌 재료를 다루는 따뜻한 느낌을 낸다.",
      "rule": "나레이션 전체 240~300자. '~거든요/~죠/~이에요)를 쓴다.\n"
              "- '~습니다' 마무리는 쓰지 않는다. 기억 회상 첫 문장을 반드시 1회 쓴다.\n"
              "- '참 쉽죠?' 같은 리액션을 최소 1회 넣어 손재주 부담을 낮춘다."},
    {"id": "instruction_mix", "name": "지시 혼용 조리",
     "desc": "~해 줍니다와 ~입니다를 섞어 도구와 시간을 서술",
     "prompt": "[내레이션 톤: 지시 혼용 조리]\n"
               "- 도구·불·시간을 명시해 따라 하는 매뉴얼식 조리 안내.\n"
               "- 동작마다 '~해 줍니다/변해 줍니다/익어 줍니다'를 쓴다.\n"
               "- 예: '깍둑 썰기 해서 준비해 주세요', '고기색이 변할 때까지 볶아 줍니다'\n"
               "- 불의 세기와 몇 분인지까지 말한다.",
      "rule": "나레이션 전체 280~340자. 조리 동작마다 '~해 줍니다/변해 줍니다'를 쓴다.\n"
              "- 손질/불/시간 순서로 서술한다. 재료 손질과 조리를 생략 없이 다룬다.\n"
              "- 호기심형 개그(있습니다)는 넣지 않는다."},
    {"id": "bracket_quirk", "name": "브금 개그",
     "desc": "짧은 구어체 + 대괄호 독백으로 ASMR 분위기를 만듦",
     "prompt": "[내레이션 톤: 브금 개그]\n"
               "- 조리 동작 사이사이에 짧은 상황극 개그를 대괄호로 밀어 넣는다.\n"
               "- 예: '팬이 작아서... [넓은 보금자리로 이사해줬어요]', '[벌써부터 맛있어 보이면 어떡하지...]'\n"
               "- 재료가 '투척/합류' 되듯 작살 난소리를 넣는다.",
      "rule": "아래 3개는 선택이 아니라 필수다. 하나라도 빠지면 실패한 대본이다.\n"
              "- 1) [대괄호 독백]이 2회 이상 등장해야 한다. 조리 서술과 번갈아 쓴다.\n"
              "- 2) 그중 1회는 질문형 독백이다. 예: [이거 안 태우면 어떡하지...]\n"
              "- 3) 어미는 짧은 '~해요' 구어체로 통일한다. 설명은 건조하게 쓰지 않는다.\n"
              "- 서술은 총 300~380자. 대괄호 독백은 대사에 포함되는 한 문장이다."},
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
             "- '~증상 → ~때문입니다' 같은 고정 패턴을 반복하지 마라. 매 장면 다른 말로 쓴다.\n"
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
    {"id": "emotion", "name": "감정 유도",
     "desc": "'많이 먹어' '어때?' 같은 친근한 반응으로 끝내기",
     "prompt": "[마무리 CTA: 감정 유도]\n"
               "- 완성 직후 친근한 반응 한 마디로 끝낸다. 예: '완성. 많이 먹어. 어때?'\n"
               "- 반말로 툭 던지듯 짧게 마무리한다. 길게 설명하지 않는다."},
    {"id": "ask_viewer", "name": "시청자 질문",
     "desc": "마지막에 질문으로 시청자를 부르기",
     "prompt": "[마무리 CTA: 시청자 질문]\n"
               "- 마지막을 질문으로 끝내 시청자가 댓글을 남기게 만든다.\n"
               "- 예: '여러분은 뭐 넣으면 더 맛있어요?'"},
]

# 이름 붙은 프리셋 12종. 각 항목이 톤·구조·훅·CTA를 한 세트로 묶는다.
# 하나만 골라도 출력이 확실히 갈리고, 개별 축을 오버라이드할 수도 있다.
#
# 2026-09-27 전면 교체: 기존 8종(자취생/반전밈/ASMR 등)은 분석 기반이 아니라
# chatGPT가 상상해 만든 축이라 실제 한국 숏폼 문대와 어긋났다. 아래 12종은
# 실제 유튜버 6개 영상의 대본을 문법 분석해 뽑은 축 조합이다.
#
#   1) 정호영 셰프님     (레시피 읽어주는 여자) → 담백 1인칭
#   2) 간장국수          (제목/채널 없음)       → 추억 회상
#   3) 이영복 간짜장     (여보어때)             → 지시 혼용 조리
#   4) 양배추 두부월남쌈 (무니키친)              → 브금 개그
#   A) 역대급 레시피     (신즈shinz)            → MZ 직설
#   B) 오백만 원짜리 찜닭(1분요리 뚝딱이형)       → 자조 개그 반말
#
# 'source' 는 출처 표기용이며 생성에는 쓰이지 않는다(프리셋에 길이 고정 없음).
# 길이는 항상 제작 설정의 30/60/180/300/600 중 하나로 따로 고른다.
RECIPE_PRESETS = [
    # ---- 1) 레시피 읽어주는 여자: 담백 1인칭 ----
    {"id": "read_aloud", "name": "읽어주기 낭독",
     "desc": "'왜 이제 먹었지' 한마디로 열고, 조리 과정은 빠짐없이 읽어주듯 말함",
     "source": "레시피 읽어주는 여자",
     "hook": "regret", "tone": "casual_first", "structure": "silent_list", "cta": "emotion"},
    {"id": "read_aloud_problem", "name": "안 되지? 낭독",
     "desc": "'왜 안 되지?' 증상으로 열고, 원인을 짚은 뒤 낭독 톤으로 해결",
     "source": "레시피 읽어주는 여자",
     "hook": "empathy", "tone": "casual_first", "structure": "problem_cause_fix", "cta": "emotion"},
    # ---- 2) 간장국수 채널: 추억 회상 ----
    {"id": "childhood_noodle", "name": "어릴 때 그 국수",
     "desc": "옛날 기억으로 시작해 '이거 되려나?' 걱정 없이 따라 하는 느낌",
     "source": "간장국수 채널",
     "hook": "empathy", "tone": "warm_recall", "structure": "silent_list", "cta": "emotion"},
    {"id": "childhood_question", "name": "기억나는 그 맛",
     "desc": "'어릴 때 왜 이 맛이었을까?' 물음으로 열고, 추억으로 답을 찾음",
     "source": "간장국수 채널",
     "hook": "question", "tone": "warm_recall", "structure": "problem_cause_fix", "cta": "emotion"},
    # ---- 3) 여보어때: 지시 혼용 조리 ----
    {"id": "chef_manuals", "name": "손따라 하기",
     "desc": "손질부터 불 세기까지, 단계 빠짐없이 따라만 하면 되는 안내",
     "source": "여보어때",
     "hook": "greeting", "tone": "instruction_mix", "structure": "silent_list", "cta": "emotion"},
    {"id": "chef_manuals_provoke", "name": "손따라 하기 반전",
     "desc": "손따라 하기 톤은 그대로 두고, 첫마디만 '이거 사먹지 마세요'로 뒤집음",
     "source": "여보어때",
     "hook": "provoke", "tone": "instruction_mix", "structure": "conclusion_first", "cta": "emotion"},
    # ---- 4) 무니키친: 브금 개그 ----
    {"id": "moony_bracket", "name": "브금 개그 리듬",
     "desc": "'안녕하세요'로 시작해 조리 사이사이에 짧은 속삭임이 끼어드는 리듬",
     "source": "무니키친",
     "hook": "greeting", "tone": "bracket_quirk", "structure": "silent_list", "cta": "emotion"},
    {"id": "moony_bracket_provoke", "name": "브금 개그 결론 먼저",
     "desc": "개그 리듬은 그대로 두고, 결과부터 던져서 시청을 붙들어 둠",
     "source": "무니키친",
     "hook": "twist", "tone": "bracket_quirk", "structure": "conclusion_first", "cta": "emotion"},
    # ---- A) 신즈shinz: MZ 직설 ----
    {"id": "shinzo_blunt", "name": "한 입 대본",
     "desc": "사다 쓰듯 말없이 딱딱 끊어내는 초압축 나레이션",
     "source": "신즈shinz",
     "hook": "provoke", "tone": "mz_blunt", "structure": "silent_list", "cta": "ask_viewer"},
    {"id": "shinzo_blunt_provoke", "name": "한 입 대본 반박형",
     "desc": "한 입 대본의 속도를 유지한 채, '이거 틀렸어요' 질문으로 반박부터 시작",
     "source": "신즈shinz",
     "hook": "question", "tone": "mz_blunt", "structure": "problem_cause_fix", "cta": "ask_viewer"},
    # ---- B) 1분요리 뚝딱이형: 자조 개그 반말 ----
    {"id": "ttukddik_banter", "name": "친근하게 툭",
     "desc": "'최소는 형이 먹으세요' 같은 한마디를 조리 사이에 툭 던지는 반말",
     "source": "1분요리 뚝딱이형",
     "hook": "provoke", "tone": "self_deprecating", "structure": "silent_list", "cta": "emotion"},
    {"id": "ttukddik_banter_provoke", "name": "친근하게 툭 실패론",
     "desc": "친근한 반말로 먼저 망한 이야기를 꺼내고, 그다음 해결로 넘어감",
     "source": "1분요리 뚝딱이형",
     "hook": "empathy", "tone": "self_deprecating", "structure": "fail_try", "cta": "emotion"},
]

# ── 화면용: 톤 6 × 변형 2 ───────────────────────────────────────
# 왜 이게 있나
#     RECIPE_PRESETS 12개는 '톤 × 정보순서' 를 미리 엮은 것이다. 그런데 카드로
#     펼쳐서 보여주면 이름에 톤/구조/CTA 가 섞여서 뜻이 안 읽힌다
#     ('브금 개그 리듬' 과 '브금 개그 결론 먼저' 는 나레이터가 똑같고 순서만 다르다).
#     12장을 6장 + 칩 2개로 줄이고, 각 카드에 '첫마디 예시' 를 넣는다.
#     이름을 보고 고르면 거의 틀리지만, 첫마디를 읽으면 바로 안다.
#     preset id 는 그대로라 저장된 설정과 생성 경로는 손댈 필요가 없다.
PRESET_FAMILIES = [
    {
        "id": "casual_first",
        "name": "담백 낭독",
        "desc": "조리 과정을 빠짐없이 읽어주듯. 조용하고 편안하게.",
        "example": ["아, 이거 왜 이제야.", "근데 진짜 10분이면 돼."],
        "variants": [
            {"preset": "read_aloud", "name": "그냥 진행",
             "desc": "재료 → 손질 → 조리 → 완성",
             "example": ["아, 이거 왜 이제야.", "닭갈비 하나 하면 저녁 끝."]},
            {"preset": "read_aloud_problem", "name": "왜 안 되지?",
             "desc": "안 되는 증상 → 원인 → 해결",
             "example": ["닭이 질겨? 그건 양념이 먼저야.",
                         "꿀 먼저 넣고, 그 다음에 간장."]},
        ],
    },
    {
        "id": "warm_recall",
        "name": "옛날 기억",
        "desc": "다 먹어본 그 맛으로. 따뜻하고 천천히.",
        "example": ["옛날에 아빠가 하던 그거, 기억나?", "그때는 이거 안 사도 돼."],
        "variants": [
            {"preset": "childhood_noodle", "name": "그냥 진행",
             "desc": "재료 → 조리 → 완성",
             "example": ["옛날에 아빠가 하던 그거, 기억나?",
                         "면은 두 손으로 쳐넣었지."]},
            {"preset": "childhood_question", "name": "왜 그 맛?",
             "desc": "물음으로 열고 → 추억으로 답",
             "example": ["왜 그때는 이 맛이었을까?",
                         "장 오래 끓였기 때문이야."]},
        ],
    },
    {
        "id": "instruction_mix",
        "name": "따라만 하기",
        "desc": "단계 안내형. 뭐를 해야 하는지 또렷하게.",
        "example": ["오늘 저녁은 이거면 끝.", "근육 먼저 넣고, 그 다음 양념."],
        "variants": [
            {"preset": "chef_manuals", "name": "순서대로",
             "desc": "손질부터 불 세기까지 순서대로",
             "example": ["오늘 저녁은 이거면 끝.", "근육 먼저 넣고, 그 다음 양념."]},
            {"preset": "chef_manuals_provoke", "name": "결과부터",
             "desc": "완성물 보여준 뒤 → 레시피로",
             "example": ["이거 사먹지 마세요.", "10분이면 됩니다."]},
        ],
    },
    {
        "id": "bracket_quirk",
        "name": "브금 개그",
        "desc": "재미 먼저. 조리 사이사이에 한마디씩 툭.",
        "example": ["[자막] 근데 이거 왜 이렇게 맛있지?"],
        "variants": [
            {"preset": "moony_bracket", "name": "순서대로",
             "desc": "인사 → 조리 → 자막 툭툭",
             "example": ["안녕하세요, 오늘의 요리는.",
                         "[자막] 근데 이거 왜 이렇게 맛있지?"]},
            {"preset": "moony_bracket_provoke", "name": "결과부터",
             "desc": "완성부터 보여주고 → 만드는 법",
             "example": ["[자막] 이거 완성물입니다.",
                         "[자막] 만드는 건 10분."]},
        ],
    },
    {
        "id": "mz_blunt",
        "name": "한 입 대본",
        "desc": "사다 쓰듯. 짧고 강한 단문.",
        "example": ["면 넣었다. 끓었다. 끝."],
        "variants": [
            {"preset": "shinzo_blunt", "name": "순서대로",
             "desc": "동작만 나열, 설명 없음",
             "example": ["닭 넣었다.", "양념 넣었다.", "끓었다. 끝."]},
            {"preset": "shinzo_blunt_provoke", "name": "반박",
             "desc": "'그게 틀렸다' 는 반박부터",
             "example": ["닭갈비가 어렵다고?", "양념이 먼저야. 그게 다야."]},
        ],
    },
    {
        "id": "self_deprecating",
        "name": "친근하게 툭",
        "desc": "아저씨 반말. 조리 사이에 툭 던지는 말.",
        "example": ["최소는 형이 먹으세요."],
        "variants": [
            {"preset": "ttukddik_banter", "name": "순서대로",
             "desc": "반말 한마디씩, 조리 사이사이에",
             "example": ["최소는 형이 먹으세요.", "근데 이건 진짜 쉬워."]},
            {"preset": "ttukddik_banter_provoke", "name": "실패담",
             "desc": "망한 이야기 먼저 → 해결로",
             "example": ["내가 맨날 망쳤거든.", "근데 이건 되더라."]},
        ],
    },
]

_FAMILY_BY_PRESET = {}
for _fam in PRESET_FAMILIES:
    for _i, _var in enumerate(_fam["variants"]):
        _FAMILY_BY_PRESET[_var["preset"]] = {
            "family_id": _fam["id"],
            "variant": _i,
        }


def family_of(preset_id: str):
    """프리셋 id → 어느 family's 몇 번째 변형인지. 없으면 None."""
    return _FAMILY_BY_PRESET.get(preset_id)


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


AXIS_KEYS = ("hook", "tone", "structure", "cta")


def resolve_recipe_axes(preset_id="random", **overrides):
    """프리셋 + 축 오버라이드 → 확정된 훅/톤/구조/CTA 4종.

    프리셋은 한 세트이므로 '아무 축이나 섞지 말고 이 조합의 일관된 흐름을 유지'
    지시를 함께 넣는다. 명시적 오버라이드가 프리셋 값을 이긴다.

    오버라이드는 슬롯 이름(hook/tone/structure/cta)으로만 받는다.
    예전엔 위치 인자 (preset, hook, tone, cta, structure) 였는데, cta 와
    structure 가 서로 자리를 바꿔도 '조용히 무시되고 안 바뀌는' 버그가 났다.
    '값이 안 바뀌는' 이 '먹지 않는' 과 구분되지 않아 찾느라 오래 걸렸다(실측).
    모르는 슬롯을 넘기면 즉시 TypeError 를 낸다 — 조용히 버리지 않는다.
    """
    bad = sorted(set(overrides) - set(AXIS_KEYS))
    if bad:
        raise TypeError(
            f"resolve_recipe_axes: 모르는 축 {bad}. "
            f"허용되는 슬롯은 {list(AXIS_KEYS)} 입니다.")
    p = dict(_PRESET_MAP[preset_id]) if preset_id in _PRESET_MAP else dict(_random.choice(RECIPE_PRESETS))
    for axis in AXIS_KEYS:
        v = overrides.get(axis)
        if _axis_valid(axis, v):
            p[axis] = v
    return p


def preset_axes_block(p, overridden=False):
    """고정된 4축을 한 블록으로 — 미리보기 첫 화면에서 무엇이 적용됐는지 보이게 한다.

    overridden=True면 프리셋 이름/설명을 그대로 싣지 않는다. 레퍼런스 분석으로
    축이 덮어써졌는데 프리셋 이름이 앞에 나오면 모델이 그쪽으로 기운다(실측).
    """
    if overridden:
        return (
            "[선택한 축] 아래 4개가 이 영상의 대본 톤을 결정한다.\n"
            "- 내레이션 톤: {tone}\n"
            "- 대본 구조: {structure}\n"
            "- 오프닝 훅: {hook}\n"
            "- 마무리 CTA: {cta}\n"
            "- 위 4개를 서로 맞물린 한 세트로 보고 톤과 흐름을 끝까지 유지한다."
            .format(tone=_axis_name("tone", p["tone"]),
                    structure=_axis_name("structure", p["structure"]),
                    hook=_axis_name("hook", p["hook"]),
                    cta=_axis_name("cta", p["cta"]))
        )
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


def role_split_block():
    """대사(text)와 상단 자막(subtitle_ko)의 역할을 확실히 나눈다.

    실제 생성에서 재료 나열이 대사에 들어가 글자수를 다 먹고, 오프닝과 본문을
    잇는 다리 문구가 들어갈 자리가 없었다. 대사는 '듣는 것'만, 재료·분량은
    '보는 것'으로 보내면 대사 부담이 줄고 문체를 넣을 여유가 생긴다.
    """
    return (
        "[역할 분리 — 대사 vs 상단 자막]\n"
        "■ 상단 자막(subtitle_ko) = 보조 요약\n"
        "- 오프닩/다리 문구처럼 화면에서 한 번 보여주면 되는 한 줄 요약.\n"
        "  (예: '집에서 15분 만에 끓이는 된장찌개!')\n"
        "- 재료 목록을 여기에 넣지 마라. 재료는 대사가 읽고 하단 자막에 그대로 나온다.\n"
        "- 비우면 상단 밴드가 사라진다.\n"
        "\n"
        "■ 대사(narration_ko) = 듣는 것 + 하단 자막에 그대로 나오는 것\n"
        "- 재료명과 분량을 읽어도 된다. 하단 자막은 TTS와 싱크되므로\n"
        "  재료를 읽으면 화면에도 같은 텍스트가 표시된다.\n"
        "- 장면당 15~25자 내외. 조리 동사 + 이유/팁을 함께 넣어 분량을 채운다."
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
    # 훅은 앞쪽 hook_block이 있지만, 그게 CORE에 밀려 '~해봤어요' 평서문으로
    # 바뀌는 일이 실측됐다(질문형 훅인데 질문 없이 나감). 마지막에 한 번 더 못 박는다.
    hook_txt = _HOOK_BLOCKS.get(p["hook"], "")
    return (
        "[최종 적용 — 문체와 서술 순서는 이 블록이 결정한다]\n"
        "- 이 블록은 CORE의 [역할]·[계량 규칙]보다 우선한다. 계량과 사실은 그대로 지키되,\n"
        "  문체(톤)와 서술 순서(구조)는 아래를 그대로 따른다.\n"
        "- 다른 어떤 규칙이 더 세 보여도 이 블록이 문체를 정한다.\n"
        "\n"
        "■ 오프닝 훅 ({hname}) — 첫 문장에 반드시 지킬 것\n"
        "{hook_rule}\n"
        "\n"
        "■ 문체 ({tname})\n"
        "{trule}\n"
        "\n"
        "■ 서술 순서 ({sname})\n"
        "{srule}\n"
        "\n"
        "■ 자기 점검\n"
        "- 첫 문장이 위 훅 형식과 다르면 문장을 고쳐 쓴다.\n"
        "- 위 톤·구조 조건을 지켰는지 확인하고, 어겼으면 고쳐 쓴다.\n"
        "- 같은 문장 모양이 3번 이상 반복되면 문장을 다시 쓴다."
        .format(hname=_axis_name("hook", p["hook"]), hook_rule=hook_txt,
                tname=tone["name"], trule=tone.get("rule") or tone["prompt"],
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
실제로 집에서 따라 할 수 있는 요리 레시피와 영상 대본을 작성하는 전문 작가다.
재료 분량·조리 시간·온도·불기는 절대 생략하지 않고, 과장한 조리법을 만들지 않는다.

[계량 규칙]
- 모든 식재료·조미료는 정확한 분량을 사용한다. 단위는 g, ml, 큰술, 작은술, 컵, 초, 분, 도, 약불, 중불, 강불만 쓴다. 1컵=200ml, 1큰술=15ml, 1작은술=5ml.
- 'T', 'S', 'Tbsp', 'tbsp', 'tbs' 같은 영문/약자로 쓰지 말고 반드시 '큰술'/'작은술'로 쓴다. T 는 1톤으로 읽힐 수 있어 위험하다.
- '적당히·적절히·알아서·약간·조금·한 줌·취향껏·넉넉히·대충·살짝'처럼 분량을 대신하는 표현은 금지.
- 실제 계량이 어려운 재료도 가능하면 g/ml/큰술/작은술/컵으로 환산한다. 억지로 세분화해 부자연스러운 숫자를 만들지 않는다.

[영상 대본 원칙]
- 나레이션은 화면에서 실제로 일어나는 행동과 일치해야 한다. 화면에 없는 행동을 설명하지 않고, 중요한 조리 행동은 반드시 둘 다로 전달한다.

[실제 조리시간]
- 영상 재생시간과 실제 조리시간을 혼동하지 않는다. 영상 60초여도 실제 조리가 15분이면 15분으로 정확히 표시한다.

[나레이션]
- 실제 사람이 말하듯 자연스럽게. 과장된 광어체는 피하되 '바삭하게·노릇하게·감칠맛이 확 올라옵니다' 같은 생생한 표현은 허용한다.
- [대본 밀도 — 무음 금지] 장면 길이만큼 말이 꽉 차야 한다.
  - **기준은 프롬프트에 들어온 [말하기 밀도 기준]의 자/초 값이다. 그 숫자가 최우선이며,
    아래 기본 범위와 충돌하면 [말하기 밀도 기준]을 따른다.** (레퍼런스 실측값이 있을 때)
  - [말하기 밀도 기준]이 없으면 기본값: 1초당 공백 제외 4~5자.
    11.5초 장면이면 공백 제외 50자 안팎, 15초 장면이면 65~70자 안팎이 기준이다.
  - 한 문장짜리 대사로 끝내지 말고 2~3문장으로 이어 쓴다. "많이 먹어. 어때?" 같은 10자 내외 단문은 금지.
  - 이 기준보다 짧게 쓰면 그 장면 길이만큼 무음이 생겨 영상이 끊겨 보인다. 절대 짧게 쓰지 않는다.
- [초과 금지] 반대로 1초당 공백 제외 7자를 넘기지 않는다. 읽는 데 시간이 더 걸리면 자막이 다음 장면과 겹친다.
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
[서술 밀도: 압축] 30초는 이유·팁을 생략하고 동사 중심으로만 쓴다.
- 나쁨: "두부를 나중에 넣어야 부서지지 않습니다." (이유 설명)
- 좋음: "두부는 마지막에 넣습니다." (동사만)
- 조리 단계는 '무엇을 → 어떻게' 두 단어로 끝낸다. 배경 설명은 하지 않는다.

[영상 포맷: 30초 숏폼] 세로형. 목표 30초 (합계 27~33초). 장면 5~6개.
[구성] HOOK(0~4초) → INGREDIENTS → PREP → CORE → PLATING → CTA(마지막 3초).
- 모든 단계를 별도 장면으로 만들 필요는 없다. 재료 소개는 조리 장면과 결합할 수 있다. "INGREDIENTS 정보가 반드시 전달"되도록 한다.
- HOOK: 완성 음식 클로즈업으로 시작. 첫 문장에서 메뉴명 명확히. 인사·자기소개 금지. 가격/속도/비주얼 중 하나만 선택해 나레이션과 자막에 일치시킨다.
- 재료는 핵심만 빠르게 읽되 **각 재료의 분량은 반드시 말한다**. "김치 1컵, 돼지고기 200g, 마늘 1큰술입니다."처럼 이름과 분량을 함께. 두루뭉술하게("많이 넣습니다") 넘기지 않는다.
- 조리는 가장 중요한 과정에 시간을 집중. 반복 손질·단순 대기는 점프컷으로 처리.
- CTA는 마지막 2~3초 이내 짧고 자연스럽게. 구독·좋아요 과도 반복 금지.
- 무음 장면(narration_ko 빈 문자열)은 최대 2개까지.
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
[서술 밀도: 표준] 60초는 동사 + 이유 한 문장씩 포함한다.
- 나쁨: "두부를 나중에 넣습니다." (이유 없음 — 30초 스타일)
- 좋음: "두부는 나중에 넣어야 부서지지 않습니다." (이유 포함)
- 조리 단계마다 '왜'를 한 문장으로 설명한다. 실패 방지 팁은 생략해도 된다.

[영상 포맷: 60초 숏폼] 세로형. 목표 60초 (합계 57~63초). 장면 6~8개. 설명은 30초보다 조금 더 자세히.
- HOOK: 완성 음식 클로즈업으로 시작. 첫 문장에서 메뉴명 명확히. 인사·자기소개 금지. 가격/속도/비주얼 중 하나만 선택해 나레이션과 자막에 일치시킨다.
- INGREDIENTS: 이 장면에서 **전체 재료와 정확한 분량을 모두** 말한다. 위 ingredients 배열의 모든 항목을 "재료명 + 분량"으로 나열한다. 예: "돼지고기 200g, 김치 1컵, 마늘 1큰술, 생마요리 1큰술입니다." 하나만 말하고 나머지 재료를 빼면 안 된다. 두루뭉술한 표현("많이 넣습니다", "적당히")은 금지.
- PREP/HEAT: 손질과 조리도구(팬·냄비·오븐·에어프라이어)를 명시. 온도·불세기·시간 중 필요한 조건 표시.
- CORE: 핵심이 만들어지는 장면을 가장 중요하게. 식감 변화와 조리 포인트 보여준다. 고기·계란 등은 안전한 조리조건 명시.
- SEASONING: 양념 분량 정확히. '적당히·조금·약간' 금지. 넣는 순서와 필요 시간 명확히.
- PLATING: 새 조리 과정 넣지 않음. 완성 음식 형태와 식감(치즈 늘어나는 장면, 바삭한 소리, 김)을 강조.
- CTA: 마지막 3초 이내 짧고 자연스럽게. 분위기를 깨는 과도한 효과음·환호성 금지.
""".strip(),
    },
    "long_3": {
        "id": "long_3",
        "name": "3분 중장편",
        "desc": "세로형 · 3분 · 15~20장면",
        "target_sec": 180,
        "min_sec": 165,
        "max_sec": 195,
        "scene_min": 15,
        "scene_max": 20,
        "time_label": "165~195초 (2:45~3:15)",
        "scenes_label": "15~20개",
        "composition": "HOOK → 재료 → 손질 → 조리 과정(중간 단계 요약) → 조합 → 플레이팅 → 시식 → CTA",
        "prompt": """
[서술 밀도: 중간 상세] 3분은 60초보다 자세하되 5분처럼 파고들지 않는다.
- 나쁨: "두부를 나중에 넣으면 됩니다." (근거 없음)
- 좋음: "두부는 국물이 졸아들 때 넣습니다. 일찍 넣으면 간이 퍼지고 형태가 무너져요." (이유 한 문장)
- 조리 단계마다 '왜' 한 문장. 실패 방지 팁은 핵심 2~3곳에만 넣는다.

[영상 포맷: 3분 중장편] 세로형. 목표 180초 (합계 165~195초). 장면 15~20개.
[전체 구성] HOOK(0~5초) → 재료 → 손질 → 조리 과정 → 중간 단계 요약 → 조합 → 플레이팅 → 시식 → CTA
- HOOK: 첫 문장에 메뉴명과 결과 한마디. 인사·자기소개 금지.
- 재료: 계량을 함께 제시. 왜 그 양인지 짧게 덧붙인다.
- 손질: 칼질·손질 상태가 결과에 영향을 주는 경우에만 설명.
- 조리: 실제 순서대로. 단계마다 시간·불기·온도를 표시한다.
- 중간 요약: 절반 지점에서 지금까지 뭘 했는지 한 문장으로 정리해 시청자를 놓치지 않게 한다.
- 실패 방지: 과한 불, 물 과다, 투입 타이밍 같은 흔한 실수 2~3곳만 짚는다.
- 시식: '맛있어요' 반복 대신 구체적인 맛·식감.
- 나레이션: 조리 이유와 핵심 계량을 포함하되, 같은 말을 반복하지 않는다.
- 연출: 클로즈업과 전체샷 교차. 대기시간은 압축.
""".strip(),
    },
    "long_5": {
        "id": "long_5",
        "name": "5분 롱폼",
        "desc": "가로/세로 · 약 5분 · 22~32장면",
        "target_sec": 300,
        "min_sec": 270,
        "max_sec": 330,
        "scene_min": 22,
        "scene_max": 32,
        "time_label": "270~330초 (4:30~5:30)",
        "scenes_label": "10~15개",
        "composition": "HOOK → 완성 소개 → 재료 → 손질 → 조리 과정 → 핵심 포인트 → 플레이팅 → 시식 → CTA (전 과정 상세 + 중간 팁)",
        "prompt": """
[서술 밀도: 상세] 5분은 이유·팁·실패 방지를 모두 포함한다.
- 나쁨: "두부는 나중에 넣어야 부서지지 않습니다." (이유만 — 60초 스타일)
- 좋음: "두부는 조리 후반에 넣어야 합니다. 일찍 넣으면 국물에 형태가 무너지고, 두부 특유의 부드러운 식감이 사라집니다." (이유+결과+팁)
- 조리 단계마다 '왜', '어떤 변화가 생기는지', '실수하면 어떻게 되는지'를 모두 설명한다.

[영상 포맷: YouTube Long-form 5분] 가로/세로 롱폼. 목표 약 5분 (합계 270~330초). 장면 10~15개. 숏폼보다 설명을 충분히 하고 실패 방지 팁을 포함한다.
[전체 구성] HOOK → 완성 음식 소개 → 재료 소개 → 재료 손질 → 조리 과정 → 핵심 조리 포인트 → 완성 및 플레이팅 → 시식 → 마무리/CTA
- HOOK: 5~10초 안에 완성 결과물 보여주고 메뉴와 핵심 특징 하나 제시. 자기소개·긴 인사 생략.
- 재료: 숏폼보다 충분히 설명. 필요시 재료의 역할도 설명.
- 손질: 따라 할 수 있게. 칼질 크기·손질 상태가 결과에 영향을 주면 설명.
- 조리: 실제 순서 자세히. 각 단계의 시간·온도·불기 표시. 중요한 변화(수분 감소, 소스 농도, 치즈 녹는 상태) 설명.
- 실패 방지 팁: 과한 불, 물 과다, 재료 투입 타이밍 같은 흔한 실수와 그 이유.
- 시식: 식감과 맛을 '맛있어요' 반복이 아니라 구체적으로.
- 나레이션: 조리 이유·실패 방지 팁·각 단계 계량과 조리조건 포함.
- 연출: 클로즈업과 전체샷 교차. 중요 과정은 여러 각도. 대기시간은 필요시 압축.
- 장면 전환이 자연스럽도록 연결 문장을 사용한다.
""".strip(),
    },
    "long_10": {
        "id": "long_10",
        "name": "10분 풀롱폼",
        "desc": "가로/세로 · 10분 · 25~35장면",
        "target_sec": 600,
        "min_sec": 540,
        "max_sec": 660,
        "scene_min": 25,
        "scene_max": 35,
        "time_label": "540~660초 (9:00~11:00)",
        "scenes_label": "25~35개",
        "composition": "HOOK → 완성 소개 → 재료(계량) → 손질 → 조리 과정(구간별 분할 + 중간 팁 3회) → 플레이팅 → 시식 → CTA",
        "prompt": """
[서술 밀도: 최대 상세] 10분은 전 과정을 빠짐없이 분할해 담는다.
- 조리 단계마다 '왜', '어떤 변화가 생기는지', '실수하면 어떻게 되는지'를 모두 설명한다.
- 같은 조리를 다시 반복하지 않는다. 각 구간이 새 정보를 하나씩 담는다.

[영상 포맷: 10분 풀롱폼] 가로/세로. 목표 600초 (합계 540~660초). 장면 25~35개.
[전체 구성] HOOK → 완성 소개 → 재료(계량 포함) → 손질 → 조리 과정 → 핵심 포인트 → 플레이팅 → 시식 → CTA
- HOOK: 5~10초 안에 완성 결과물 보여주고 메뉴와 핵심 특징 하나 제시. 자기소개·긴 인사 생략.
- 재료: 계량과 재료별 역할을 함께 설명.
- 손질: 칼질 크기·손질 상태가 결과에 영향을 주면 자세히 설명.
- 조리: 실제 순서대로. 각 단계의 시간·온도·불기 표시. 구간마다 중간 팁 3회 삽입.
- 핵심 포인트: 조리 중반부에서 비결을 한 번 정리해 재확인시킨다.
- 실패 방지 팁: 과한 불, 물 과다, 투입 타이밍 등 흔한 실수와 그 이유.
- 시식: 식감과 맛을 '맛있어요' 반복이 아니라 구체적으로.
- 나레이션: 조리 이유·실패 방지 팁·각 단계 계량과 조리조건을 모두 포함.
- 연출: 클로즈업과 전체샷 교차. 대기시간은 필요시 압축.
- 장면 전환이 자연스럽도록 연결 문장을 사용한다.
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
[이미지 프롬프트 구조] 영어로: [STYLE ANCHOR] + [SCENE ACTION] + [FOOD STATE] + [CAMERA] + [LIGHTING]
- STYLE ANCHOR: small Korean home kitchen, warm natural light, same white ceramic plate, photorealistic food photography
- CAMERA: close-up, extreme close-up, overhead shot, medium shot, macro food shot. 핵심 조리 장면은 close-up/macro 우선
- 식감: crispy texture / bubbling sauce / steam rising / stretching mozzarella / glossy sauce / golden brown crust. 존재하지 않는 식감은 쓰지 않는다. '8k' 같은 품질 토큰 금지
- 장면 일관성: 주방·접시·조리도구·음식 색상·형태·재료 상태를 모든 장면에서 유지
- 제외 요소 (모든 장면 기본): no text, no subtitles, no watermark, no logo, no face, no distorted hands, no extra fingers, no duplicated ingredients
""".strip()

OUTPUT_PROMPT = """
[출력 형식] 반드시 JSON만 출력. 키 이름은 아래와 정확히 일치시킨다.
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
      "speaker": "나레이터",
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

[section] HOOK, INGREDIENTS, PREP, HEAT, CORE, SEASONING, PLATING, TASTE, CTA 중 선택. 포맷에 맞지 않는 건 생략.
[duration_sec] 정수만. 전체 합계는 목표 영상 길이를 따른다.
[narration_ko] TTS가 읽을 문장만. '무음' 같은 설명 금지, 무음 장면은 빈 문자열 "". 쉼표로 문장을 나누지 않는다. '명사+수량'(감자 2개)은 같은 문장에 둔다. 한 장면은 완결된 문장으로만. **길이는 duration_sec에 맞춰라 — 공백 제외 1초당 4~5자(단, [말하기 밀도 기준]이 있으면 그 값 우선). 11초 장면이면 45~55자. 이보다 짧으면 그 구간만큼 무음이 된다.** 마지막 점검: 모든 장면의 narration_ko 글자수가 [말하기 밀도 기준]의 초당 글자수 × duration_sec 이상인지 확인하고 미달이면 문장을 추가한다.
[subtitle_ko] 실제 자막만. narration_ko와 완전히 동일한 긴 문장 반복 금지.
[visual] 객체로. keyword는 한국어 구체적 명사구, description은 영어 프롬프트(화면 글자 생성 금지). stock_query는 영문 키워드 2~3개. filming_guide는 한글 1줄. 모든 장면에 같은 값 복사 금지 — 장면 내용이 드러나야 한다.
[sound_prompt] 실제 음식 소리 또는 최소 효과음.
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
    "long_3": {
        "time": "165~195초 (2:45~3:15)", "target": 180, "scenes": "15~20개",
        "composition": "HOOK(0~5초) → 재료 → 손질 → 조리 과정(중간에 단계 요약 1회) → 조합 → 마무리 볶기/조립 → 플레이팅 → 시식 → CTA",
        "cta": "마지막 5초 안에 마무리",
    },
    "long_5": {
        "time": "270~330초 (4:30~5:30)", "target": 300, "scenes": "22~32개",
        "composition": "HOOK → 완성 소개 → 재료 → 손질 → 조리 과정 → 핵심 포인트 → 플레이팅 → 시식 → CTA (전 과정 상세 분할 + 중간 팁 포함)",
        "cta": "마지막에 자연스럽게 마무리",
    },
    "long_10": {
        "time": "540~660초 (9:00~11:00)", "target": 600, "scenes": "25~35개",
        "composition": "HOOK → 완성 소개 → 재료(계량 포함) → 손질 → 조리 과정(구간별 상세 분할 + 중간 팁 3회) → 조합 → 플레이팅 → 시식 → CTA (전 과정 완전 분할)",
        "cta": "마지막 10초 안에 마무리",
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
    """길이(초)에 가장 가까운 포맷 ID. 프론트 표시·기본값용.

    포맷이 3개뿐일 때 180초는 short_60(60)과 long_5(300) 거리가 같아 순서상
    short_60이 이겼다(실측: 3분 로그가 'format=short_60, target=180s').
    long_3/long_10을 추가해 5개 길이 단계(30/60/3분/5분/10분)를 각각 받는다.
    """
    try:
        duration = int(duration or 60)
    except (TypeError, ValueError):
        duration = 60
    best, best_gap = DEFAULT_FORMAT, None
    for fid, f in FORMATS.items():
        # 경계 조정이 아니라 '포맷 대표 길이'다. 기본 target_sec와 조금 달라도 된다.
        #  - long_3를 150으로: 90~120초는 short_60, 150~240초는 long_3이 되도록.
        #  - long_10을 660으로: 360~450초는 long_5, 600초 이상은 long_10이 되도록.
        eff = {"long_3": 150, "long_10": 660}.get(fid, f["target_sec"])
        gap = abs(eff - duration)
        if best_gap is None or gap < best_gap:
            best, best_gap = fid, gap
    return best


def compose_recipe_prompt(format_id=DEFAULT_FORMAT, style_id=DEFAULT_STYLE,
                           platform_id=DEFAULT_PLATFORM, extra="", hook_id="random",
                           target_sec=None, preset_id="random", tone_id=None,
                           cta_id=None, structure_id=None, axes_overridden=False):
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
    axes = resolve_recipe_axes(preset_id, hook=hook_id, tone=tone_id,
                               structure=structure_id, cta=cta_id)
    preset_block = preset_axes_block(axes, overridden=axes_overridden)
    try:
        tgt = int(target_sec)
    except (TypeError, ValueError):
        tgt = int(spec["target"])
    # 목표가 포맷 구간 밖이면 포맷의 시간/장면수 문자열을 그대로 쓰면 안 된다.
    # 실측: short_30 + 180초 프롬프트에 '총 영상시간: 27~33초 (목표 180초)'와
    # '장면 수: 5~6개'가 동시에 들어가 모델이 5~6개를 따랐다(요청은 18개).
    # 목표가 유일한 진실이므로 구간 밖에서는 목표만 적는다.
    _in_band = True
    try:
        _in_band = int(fmt["min_sec"]) <= tgt <= int(fmt["max_sec"])
    except (KeyError, TypeError, ValueError):
        _in_band = True
    if _in_band:
        _time_line = "{} (목표 {}초)".format(spec["time"], tgt)
        _scene_line = spec["scenes"]
    else:
        _time_line = "목표 {}초 (포맷 시간대 밖 — 아래 목표를 그대로 따른다)".format(tgt)
        _scene_line = "아래 [장면 수] 지시를 따른다"
    header = (
        "[포맷] {} / 목표 {tgt}초 기준 / {scenes}\n"
        "[스타일] {} / {}\n"
        "[플랫폼] {} / {}".format(
            fmt["id"],
            style["id"], visual_base,
            plat["id"], plat_rule,
            tgt=tgt, scenes=("포맷 표준 구성" if _in_band else "목표 길이에 맞춘 구성"),
        )
    )
    video_spec = (
        "[영상 사양 - 선택값 반영]\n"
        "- 포맷: {} (장면 구조용, 시간은 아래 목표를 따른다)\n"
        "- 총 영상시간: {}\n"
        "- 장면 수: {}\n"
        "- 구성: {}\n"
        "- {}\n"
        "- 각 장면 duration_sec는 정수".format(
            fmt["id"], _time_line,
            _scene_line, spec["composition"], spec["cta"],
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
    cta_block = _AXIS_MAPS["cta"][axes["cta"]]["prompt"]
    print(f"[Recipe Prompt] preset={axes['id']} hook={axes['hook']} tone={axes['tone']} "
          f"structure={axes['structure']} cta={axes['cta']} (format={fmt['id']}, target={tgt}s, style={style['id']})")
    # fmt["prompt"] 안에 '목표 30초 (합계 27~33초). 장면 5~6개'처럼 시간이 박혀 있다.
    # 목표가 그 구간 밖이면 이 문장이 목표를 덮어쓴다(실측: 180초 요청에 5~6개 장면).
    # 구간 밖에서는 시간/장면수 문장을 통째로 걷어내고, 목표는 video_spec가 담당한다.
    if _in_band:
        _fmt_prompt = fmt["prompt"]
    else:
        _fmt_prompt = "\n".join(
            ln for ln in fmt["prompt"].split("\n")
            if "목표" not in ln and "장면" not in ln and "합계" not in ln
        )
    blocks = [
        header,
        # 훅/CTA는 LLM 우선순위가 높은 앞쪽에 둔다. 톤/구조는 맨 뒤에서
        # style_enforce_block 하나로 못 박는다(앞에 두면 CORE에 밀려 무시됨).
        preset_block,
        hook_block,
        # 역할 분리는 CORE보다 앞에 둔다. CORE의 [계량 규칙]이 재료를 대사에
        # 넣도록 밀어내기 때문에, 그 전에 "재료는 자막"이라고 선언해야 한다.
        role_split_block(),
        cta_block,
        CORE_RECIPE_PROMPT,
        _fmt_prompt,
        style["prompt"],
        VISUAL_PROMPT_RULES,
        video_spec,
        style_spec,
        platform_spec,
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
        "families": [dict(f) for f in PRESET_FAMILIES],
        "presets": [
            {"id": "random", "name": "매번 변경",
             "desc": f"생성할 때마다 {len(RECIPE_PRESETS)}종 중 무작위 세트"}
        ] + [dict(p) for p in RECIPE_PRESETS],
        "tones": [{"id": v["id"], "name": v["name"], "desc": v["desc"]} for v in TONE_VARIANTS],
        "structures": [{"id": v["id"], "name": v["name"], "desc": v["desc"]} for v in STRUCTURE_VARIANTS],
        "ctas": [{"id": v["id"], "name": v["name"], "desc": v["desc"]} for v in CTA_VARIANTS],
        "defaults": {
            # format은 'auto'가 정답이다. 길이(제작 설정)가 유일한 진실이고
            # short_60 같은 고정값을 여기 보내면 프론트가 60초용 지시를 굳이 고르게 된다.
            # 프론트는 이 값을 읽지 않고 항상 'auto'를 쓰지만, 헷갈리지 않게 명시한다.
            "format": "auto",
            "style": DEFAULT_STYLE,
            "platform": DEFAULT_PLATFORM,
            "hook": "random",
            "preset": "random",
            "duration_presets": [30, 60, 180, 300, 600],
        },
    }
