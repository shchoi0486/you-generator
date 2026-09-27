"""create_from_pattern 안의 밀도 진단이 실제 파이프라인에서 동작하는지 확인.

LLM은 실제 호출 없이 스텁을 주입한다(과금 없음).
"""
import sys, pathlib, json
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from core import shorts_lab as sl

# 사용자가 실제로 받은稀疏 대본 (김치찌개 60초)
STUB = {
    "title": "얼큰하고 시원한 김치찌개",
    "description": "냉장고 김치로 끝내는 25분 김치찌개",
    "total_cooking_time": "25분",
    "video_duration_sec": 60,
    "ingredients": [
        {"name": "김치", "amount": "1", "unit": "컵"},
        {"name": "돼지고기", "amount": "200", "unit": "g"},
    ],
    "storyboard": [
        {"section": "HOOK", "speaker": "나레이터",
         "narration_ko": "어릴 적 식탁 위에서 늘 맡았던 그 냄새, 기억하시죠?",
         "subtitle_ko": "어릴 적 식탁의 그 냄새",
         "sfx": "", "sound_prompt": "찌개 끓는 소리",
         "duration_sec": 12,
         "visual": {"type": "ai_image", "keyword": "김치찌개 최종 플레이팅",
                    "description": "close-up of kimchi jjigae in a bowl",
                    "stock_query": "kimchi stew", "filming_guide": "완성된 찌개를 45도로 클로즈업"}},
        {"section": "INGREDIENTS", "speaker": "나레이터",
         "narration_ko": "김치 1컵을 준비해 주시고요.",
         "subtitle_ko": "김치 1컵 준비",
         "sfx": "", "sound_prompt": "재료 넣는 소리",
         "duration_sec": 12,
         "visual": {"type": "ai_image", "keyword": "김치 돼지고기 마늘 재료",
                    "description": "overhead of chopped kimchi and pork",
                    "stock_query": "kimchi pork", "filaming_guide": "재료 오버헤드"}},
        {"section": "PREP", "speaker": "나레이터",
         "narration_ko": "설탕 1큰술을 넣고 볶아주거든요.",
         "subtitle_ko": "설탕 1큰술",
         "sfx": "", "sound_prompt": " 볶는 소리",
         "duration_sec": 12,
         "visual": {"type": "ai_image", "keyword": "김치 볶는 손",
                    "description": "hands stir frying kimchi in a pan",
                    "stock_query": "stir frying", "filming_guide": "팬 위 손 클로즈업"}},
        {"section": "HEAT", "speaker": "나레이터",
         "narration_ko": "총 25분 동안 불에 올려 끓여주죠. 2인분 기준으로 넉넉하게 끓여내지요.",
         "subtitle_ko": "25분 끓이기",
         "sfx": "", "sound_prompt": "끓는 소리",
         "duration_sec": 12,
         "visual": {"type": "ai_image", "keyword": "찌개 끓는 냄비",
                    "description": "kimchi jjigae boiling in a pot",
                    "stock_query": "boiling stew", "filming_guide": "Steam rising from pot"}},
        {"section": "CTA", "speaker": "나레이터",
         "narration_ko": "완성. 많이 먹어 어때?",
         "subtitle_ko": "많이 먹어",
         "sfx": "", "sound_prompt": "",
         "duration_sec": 12,
         "visual": {"type": "ai_image", "keyword": "김치찌개 한 그릇",
                    "description": "a single bowl of kimchi jjigae",
                    "stock_query": "jjigae bowl", "filming_guide": "한 그릇 클로즈업"}},
    ],
}


def fake_generate(*a, **k):
    return json.dumps(STUB, ensure_ascii=False)


sl._llm_run_text = lambda *a, **k: "、冷凍庫の白菜 1カップ、豚 200g。"


def _fake_run(prompt, **k):
    # json_mode=True면 파싱된 dict를 돌려준다(실제 _llm_run과 동일契约).
    return json.loads(json.dumps(STUB, ensure_ascii=False))


sl._llm_run = _fake_run

print("=" * 66)
print("create_from_pattern 스텁 실행 (LLM 과금 없음)")
print("=" * 66)

out = sl.create_from_pattern(
    reference_summary="이전에 성공한 레시피短视频",
    new_topic="얼큰하고 시원한 김치찌개",
    duration=60,
    category="recipe_short",
    format_id="short_60",
    style_id="home_kitchen",
    platform_id="youtube",
    preset_id="emotional_story",
    tone_id="emotional_story",
    structure_id="hook_explain",
    cta_id="comment_prompt",
)

scenes = out.get("scenes") or []
script = out.get("script") or []
print("\n[결과] scenes=%d  script=%d" % (len(scenes), len(script)))
print("  장면 키:", sorted(scenes[0].keys()) if scenes else "-")
print("\n[결과] TTS가 읽을 실제 음성(script) 기준")
total = 0.0
spoken = 0.0
for i, sc in enumerate(scenes):
    d = float(sc.get("time_end") or 0) - float(sc.get("time_start") or 0)
    total += d
    ent = script[i] if i < len(script) else {}
    tx = ent if isinstance(ent, str) else (ent.get("text") or ent.get("narration_ko") or "")
    n = len(str(tx).replace(" ", ""))
    spoken += n / 4.5
    print(f"  {sc.get('section',''):<12} {n:>3}자 / {d:>4.1f}초  "
          f"발화 {n / 4.5:>4.1f}초  무음 {max(0.0, d - n / 4.5):>4.1f}초")
print(f"  영상 {total:.1f}초 중 실제 발화 약 {spoken:.0f}초 "
      f"-> 무음 약 {total - spoken:.0f}초")

# ---- 기존 회귀 8항목이 새 cap(3.5->5.0배)에서도 유지되는지 확인 ----
print("\n[기존 회귀 재확인]")
alltext = json.dumps(out, ensure_ascii=False)
fails = 0


def chk(ok, label):
    global fails
    if not ok:
        fails += 1
    print(f"  {'OK ' if ok else 'FAIL'} {label}")


chk("news" not in alltext.lower(), "news 잔존 0건")
chk("1T" not in alltext and "1S" not in alltext, "1T/1S 단위 0건")
tops = [s.get("subtitle", "") for s in scenes]
chk(not any("[" in t or "]" in t for t in tops), "하단 대괄호 독백 0건")
chk(all(s.get("section") for s in scenes), "section 누락 0건")
kw = [s.get("keyword") for s in scenes]
chk(len(kw) == len(set(kw)), "keyword 중복 0건")
de = [s.get("description") for s in scenes]
chk(len(de) == len(set(de)), "description 중복 0건")
spk = {e.get("speaker") for e in script if isinstance(e, dict)}
chk(spk <= {"나레이터"}, f"화자 나레이터만 (확인: {spk})")
chk(57.0 <= total <= 63.0, f"타임라인 57~63초 (확인: {total:.1f}초)")

print("\n" + "=" * 66)
print(f"기존 회귀 실패 {fails}건")
sys.exit(1 if fails else 0)
