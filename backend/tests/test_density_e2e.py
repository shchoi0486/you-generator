"""실측 밀도가 실제 LLM 프롬프트까지 도달하는지 (스텁, 과금 0).

analyze_youtube 없이 analyze_youtube가 만들 '결과물 형태'를 그대로 만들어
create_from_pattern에 넣고, 그때 LLM에 실제로 전송되는 프롬프트를 가로챈다.
"""
import sys, pathlib, json
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from core import shorts_lab as sl

# ── 실측 자막 240자 / 60초 = 4.0자/초 ─────────────────────────────
segs = []
per = 20
t = 0.0
left = 240
while left > 0 and t < 56:
    take = min(per, left)
    segs.append(("가" * take, round(t, 2), 4.0))
    left -= take
    t += 4.0
measured = sl.measure_speech_density(segs)
print(f"실측: {measured['chars_per_sec']}자/초 (글자 {measured['char_count']} / "
      f"발화 {measured['speech_sec']}초) source={measured['source']}")

# ── analyze_youtube가 반환하는 형태의 레퍼런스 ───────────────────
report = {
    "hook_summary": "후회형 도입",
    "hook_first3s": ["완성 컷", "먹방 입"],
    "content_pattern": [{"phase": "도입", "label": "후회", "detail": "왜 이제 먹었지"}],
    "why_it_works": ["첫 3초 완성 컷"],
    "tone": "친근한 반말",
    "suggested_duration": 60,
    "hashtags": ["#김치찌개"],
    "source_type": "youtube",
    "speech_density": measured,
    "style_analysis": {
        "hook_style": "후회형", "cta_style": "감정 유도", "tone_style": "실패 회고",
        "sentence_patterns": ["넣어 주고", "끓여내지요"],
        "pacing": "보통", "ending_style": "반말(~다 체)", "honorific": False,
    },
    "transcript_approx": (
        "어릴 적 식탁 위에서 늘 맡았던 그 냄새가 지금도 생각나요. "
        "김치 1컵에 돼지고기 200그램 넣고 중불로 천천히 끓여주면 됩니다. "
        "설탕 한 큰술로 간을 맞추고最后 마지막에 참기름을 한 바퀴 둘러주세요."
    ),
    "storyboard": [{"speaker": "나레이터", "text": "짧은 대본"}],
}

STUB = {
    "title": "얼큰한 김치찌개", "description": "d", "total_cooking_time": "25분",
    "video_duration_sec": 60,
    "ingredients": [{"name": "김치", "amount": "1", "unit": "컵"},
                    {"name": "돼지고기", "amount": "200", "unit": "g"}],
    "storyboard": [
        {"section": "HOOK", "speaker": "나레이터",
         "narration_ko": "어릴 적 식탁 위에서 늘 맡았던 그 냄새가 지금도 생각나요. "
                         "냉장고에 있던 재료로 오늘 바로 만들어보겠습니다. "
                         "이 집 김치찌개는 매일 밥상 가운데 놓입니다.",
         "subtitle_ko": "어릴 적 식탁의 그 냄새", "sfx": "", "sound_prompt": "끓는 소리",
         "duration_sec": 12,
         "visual": {"type": "ai_image", "keyword": "김치찌개 완성",
                    "description": "close-up kimchi jjigae", "stock_query": "jjigae",
                    "filming_guide": "완성 컷 클로즈업"}},
        {"section": "INGREDIENTS", "speaker": "나레이터",
         "narration_ko": "김치 1컵, 돼지고기 200그램, 마늘 1큰술을 준비합니다. "
                         "국간장으로 밑간을 하고 식초로 새콤함을 더해줍니다.",
         "subtitle_ko": "재료와 분량", "sfx": "", "sound_prompt": "",
         "duration_sec": 12,
         "visual": {"type": "ai_image", "keyword": "재료 썰기",
                    "description": "chopping kimchi overhead", "stock_query": "chopping",
                    "filming_guide": "재료 오버헤드"}},
        {"section": "PREP", "speaker": "나레이터",
         "narration_ko": "김치는 큰 썰기로 적당히 썰고 돼지고기는 앞다리살을 사용합니다. "
                         " beforehand 미지근한 물에 씻어 물기를 빼고 시작합니다.",
         "subtitle_ko": "김치 썰기", "sfx": "", "sound_prompt": "칼질 소리",
         "duration_sec": 12,
         "visual": {"type": "ai_image", "keyword": "김치 손질",
                    "description": "hands slicing kimchi", "stock_query": "slicing",
                    "filaming_guide": "도마 위 손 클로즈업"}},
        {"section": "HEAT", "speaker": "나레이터",
         "narration_ko": "중불로 올려 끓여주면서 기름을 살짝 긁어내면 김이 납니다. "
                         "25분 정도 끓여야 김치가 부드러워집니다.",
         "subtitle_ko": "중불 25분", "sfx": "", "sound_prompt": "끓는 소리",
         "duration_sec": 12,
         "visual": {"type": "ai_image", "keyword": "찌개 끓는 냄비",
                    "description": "boiling jjigae pot", "stock_query": "boiling stew",
                    "filming_guide": "김 피는 냄비"}},
        {"section": "CTA", "speaker": "나레이터",
         "narration_ko": "완성했습니다. 이 한 그릇이면 밥 한 끼 충분합니다. "
                         "여러분도 한번 만들어보시고 알려주세요.",
         "subtitle_ko": "완성", "sfx": "", "sound_prompt": "",
         "duration_sec": 12,
         "visual": {"type": "ai_image", "keyword": "김치찌개 한 그릇",
                    "description": "single bowl of jjigae", "stock_query": "jjigae bowl",
                    "filaming_guide": "한 그릇 클로즈업"}},
    ],
}

captured = {"prompts": []}


def _cap_run(prompt, **k):
    # repair/regen 패스가 여러 번 돌 수 있어 '마지막' 호출만 보면 stage1 프롬프트를 못 본다.
    captured["prompts"].append(prompt)
    return json.loads(json.dumps(STUB, ensure_ascii=False))


def _cap_text(prompt, **k):
    captured["prompts"].append(prompt)
    return "냉장고 김치 1컵, 돼지고기 200g"


sl._llm_run = _cap_run
sl._llm_run_text = _cap_text

print(f"\n[캡처된 LLM 호출 {len(captured['prompts'])}회]")

out = sl.create_from_pattern(
    reference_summary=json.dumps(report, ensure_ascii=False),
    new_topic="얼큰한 김치찌개",
    duration=60,
    category="recipe_short",
    format_id="short_60",
    preset_id="regret_talk",
)

# 대본 생성 프롬프트(가장 긴 것)를 찾는다 — 밀도 블록은 여기 있어야 한다.
prompts = captured["prompts"]
p = max(prompts, key=len) if prompts else ""
cps = measured["chars_per_sec"]
scenes_hint = max(4, round(60 / 10))
scene_sec = max(3.0, (60 - 0.5 * scenes_hint) / scenes_hint)
want_chars = round(cps * scene_sec)
want_lo, want_hi = round(want_chars * 0.8), round(want_chars * 1.2)

print("\n" + "=" * 70)
print(f"LLM에 실제 전송된 프롬프트 검증 (기대값: {cps}자/초, "
      f"{scene_sec}초 → {want_chars}자)")
print("=" * 70)
fails = []


def chk(ok, label, extra=""):
    if not ok:
        fails.append(label)
    print(f"  {'OK  ' if ok else 'FAIL'} {label}{(' — ' + extra) if extra else ''}")


chk(f"{cps}자/초" in p, f"실측 {cps}자/초가 프롬프트에 들어감")
chk("실측" in p, "'실측'임을 명시")
chk("자/초" in p, "단위가 자/초로 표시")
chk(f"약 {want_chars}자 목표" in p, f"{scene_sec}초 → {want_chars}자 목표가 계산됨")
chk(f"{want_lo}~{want_hi}자" in p, f"±20% 범위({want_lo}~{want_hi}자) 제시")
chk("1~2문장 대사" not in p, "'1~2문장 대사' 지시는 없음")
chk("글자수 함께" in p, "실제 레퍼런스 문장 예시(글자수 포함)")
chk("짧은 대본" not in p, "LLM이 만든 storyboard 대사는 예시로 안 들어감")
chk("베끼지 마라" in p, "레퍼런스 복사 금지 가드 존재")
# 두 개의 충돌하는 밀도 기준이 없어야 한다 (하드코딩 4~5 vs 실측값).
chk("그 숫자가 최우선" in p, "실측값이 하드코딩 기본범위보다 우선된다고 명시")
# 실측 5.0인데 하드코딩 4~5가 '기준'으로 다시 나오면 충돌이다.
core_conflict = ("1초당 공백 포함 5~6자" in p)
chk(not core_conflict, "CORE의 구속력 있는 하드코딩 밀도 문장 없음")

print("\n[프롬프트의 밀도 블록]")
for line in p.split("\n"):
    if "밀도" in line or "자/초" in line or "자 목표" in line or "글자수 함께" in line:
        print("   ", line.strip()[:110])

print("\n[결과 밀도]")
scenes = out.get("scenes") or []
script = out.get("script") or []
spoken = 0.0
tot = 0.0
for i, sc in enumerate(scenes):
    d = float(sc.get("time_end") or 0) - float(sc.get("time_start") or 0)
    tot += d
    ent = script[i] if i < len(script) else {}
    tx = ent if isinstance(ent, str) else (ent.get("text") or "")
    n = len(str(tx).replace(" ", ""))
    spoken += n / 4.0
    print(f"   {sc.get('section',''):<12} {n:>3}자 / {d:>4.1f}초  "
          f"발화 {n / 4.0:>4.1f}초  무음 {max(0.0, d - n / 4.0):>4.1f}초")
print(f"   영상 {tot:.1f}초 / 발화 {spoken:.0f}초 -> 무음 {max(0.0, tot - spoken):.0f}초")

print("\n" + "=" * 70)
print("실패 0건" if not fails else f"실패 {len(fails)}건: {fails}")
sys.exit(1 if fails else 0)
