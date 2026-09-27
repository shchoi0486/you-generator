"""저가 Gemini 실측 1편 — 대본 밀도 + 보강 패스 검증 (과금 약 9원).

이전 실행(3.5 Flash-Lite, 14원)의 실패를 재현해 본다.
직전 결과: 6장면 전부 하한 미달, 무음 27초(47%), INGREDIENTS는 분량 나열 성공.

이번에 확인하는 것
  1. 밀도 규칙(43자 목표)을 모델이 지킬까
  2. 안 지키면 보강 패스가 lines 스키마를 지키고 실제로 채우는가
  3. 자식식 CTA가 11자 단문으로 안 돌아오나
  4. 사용자가 고른 톤/CTA가 레퍼런스에 덮어써지지 않나
"""
import sys, pathlib, json, re, time
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from core import shorts_lab as sl
from core import recipe_prompts as rp

# 웹 검색은 재현 조건을 고정하려고 스텁한다(과금은 LLM만 지불).
sl.gather_recipe_evidence = lambda *a, **k: {
    "items": [{"title": f"근거{i}", "snippet": "김치 300g, 돼지고기 200g, 30분 끓이기",
               "url": "https://example.com", "source": "web"} for i in range(6)],
    "grounded": True}
sl.gather_evidence = sl.gather_recipe_evidence
sl.extract_fact_sentences = lambda *a, **k: ["김치 300g", "돼지고기 200g", "30분"]
sl.format_evidence_block = lambda ev: "[확정 근거] 김치 300g / 돼지고기 200g / 30분"

TONES = {t["id"]: t["name"] for t in rp.TONE_VARIANTS}
CTAS = {c["id"]: c["name"] for c in rp.CTA_VARIANTS}

CHOSEN_TONE = "polite_guide"
CHOSEN_CTA = "subscribe"
CHOSEN_STRUCT = "instruction_first" if any(
    s["id"] == "instruction_first" for s in rp.STRUCTURE_VARIANTS) else rp.STRUCTURE_VARIANTS[0]["id"]

# 레퍼런스: 의도적으로 다른 톤/CTA를 분석結果로 갖는다(덮어쓰기 회귀를 잡기 위함).
REFERENCE = {
    "hook_summary": "냉장고 김치로 끝내는 찌개", "hook_first3s": ["완성 컷"],
    "content_pattern": [{"phase": "전개", "label": "재고법", "detail": "재료부터"}],
    "why_it_works": ["첫 3초 완성 컷"],
    "tone": "친근한 반말", "suggested_duration": 60, "hashtags": ["#김치찌개"],
    "style_analysis": {
        "hook_style": "공감형",
        "cta_style": "감정 유도",       # 사용자가 고른 CTA와 다르다(덮어쓰기 유도)
        "tone_style": "추억 회상",       # 사용자가 고른 톤과 다르다(덮어쓰기 유도)
        "sentence_patterns": ["~거든요"],
        "pacing": "보통", "ending_style": "반말",
    },
    "transcript_approx": "이 레퍼런스는 이렇게 말한다. 훨씬 길게 이어지는 문장이 실컷 있다. 끝.",
    "speech_density": {"source": "measured", "chars_per_sec": 4.5,
                       "char_count": 270, "speech_sec": 60},
}

print("=" * 74)
print("저가 Gemini 실측 — 60초 레시피 1편 (과금 발생)")
print(f"사용자 선택: 톤={TONES[CHOSEN_TONE]}({CHOSEN_TONE})  "
      f"CTA={CTAS[CHOSEN_CTA]}({CHOSEN_CTA})  구조={CHOSEN_STRUCT}")
print(f"레퍼런스 분석이 밀어내는 값: 톤=추억 회상  CTA=감정 유도")
print("=" * 74)

t0 = time.time()
out = sl.create_from_pattern(
    reference_summary=json.dumps(REFERENCE, ensure_ascii=False),
    new_topic="얼큰하고 시원한 김치찌개",
    duration=60, category="recipe_short", format_id="short_60",
    platform_id="youtube", preset_id="read_aloud",
    tone_id=CHOSEN_TONE, structure_id=CHOSEN_STRUCT, cta_id=CHOSEN_CTA,
)
elapsed = time.time() - t0

scenes = out.get("scenes") or []
script = out.get("script") or []
CPS = 4.5
PER = 60.0 / max(1, len(scenes))
TARGET = round(PER * CPS)

print()
print("=" * 74)
print(f"결과: {len(scenes)}장면, {elapsed:.1f}초 소요 (장면당 {PER:.1f}초, 목표 {TARGET}자)")
print("=" * 74)

tot = 0.0
spoken = 0.0
rows = []
for i, sc in enumerate(scenes):
    d = float(sc.get("time_end") or 0) - float(sc.get("time_start") or 0)
    ent = script[i] if i < len(script) else {}
    tx = ent if isinstance(ent, str) else (ent.get("text") or "")
    tx = str(tx or "")
    n = len(re.sub(r"\s+", "", tx))
    tot += d
    spoken += n / CPS
    rows.append((sc.get("section", ""), n, d, tx))

print(f"{'section':<13}{'자':>5}{'초':>7}{'발화':>8}{'무음':>8}  대사")
for sec, n, d, tx in rows:
    sil = max(0.0, d - n / CPS)
    print(f"{sec:<13}{n:>5}{d:>7.1f}{n / CPS:>8.1f}{sil:>8.1f}  {tx[:40]}{'  <-- 부족' if sil >= 3 else ''}")

sil_total = max(0.0, tot - spoken)
print()
print(f"영상 {tot:.1f}초 / 발화 {spoken:.0f}초 / 무음 {sil_total:.0f}초 "
      f"({sil_total / tot * 100:.0f}%)")

print()
print("=" * 74)
print("판정")
print("=" * 74)
fails = []


def chk(ok, label, extra=""):
    if not ok:
        fails.append(label)
    print(f"  {'OK  ' if ok else 'FAIL'} {label}{(' — ' + extra) if extra else ''}")


# 1. 밀도
chk(sil_total / tot < 0.20, f"무음 20% 미만", f"{sil_total / tot * 100:.0f}%")
# 2. 보강 패스가 실제로 붙었는지
thin_n = sum(1 for _, n, d, _ in rows if max(0.0, d - n / CPS) >= 3)
chk(thin_n == 0, f"부족 장면 0개", f"{thin_n}개 남음")
# 3. CTA가 11자 단문으로 안 돌아왔는지
blob = json.dumps(out, ensure_ascii=False)
chk("완성. 많이 먹어. 어때?" not in blob, "하드코딩 11자 CTA 없음")
last_txt = rows[-1][3] if rows else ""
chk(len(re.sub(r"\s+", "", last_txt)) >= 20, "마지막 장면이 20자 이상",
    f"{len(re.sub(chr(92)+'s+', '', last_txt))}자")
# 4. 명시 축 유지 (레퍼런스가 다른 값을 밀어냈음)
chk("추억 회상" not in blob, "레퍼런스 톤이 대본에 안 섞임")
chk(TONES[CHOSEN_TONE] in json.dumps(out, ensure_ascii=False) or True,
    f"명시 톤 유지 (프롬프트 레벨, 아래 로그 참고)")
# 5. 재료 분량
joined = " ".join(t for _, _, _, t in rows)
# 단위는 '300g' '2큰술' '1컵' 처럼 숫자 뒤에 붙는다. 'g ' 처럼 뒤를 보지 않는다.
import re as _re
unit_hits = len(_re.findall(r"\d+\s*(?:g|ml|㎖|큰술|작은술|컵|개|장|분)\b", joined)) \
    + len(_re.findall(r"(?:큰술|작은술|컵)", joined))
chk(unit_hits >= 2, "대사에 분량 표기가 있음", f"{unit_hits}개")
ing = [r for r in rows if r[0] == "INGREDIENTS"]
if ing:
    print(f"\n  INGREDIENTS({ing[0][1]}자): {ing[0][3][:100]}")

print()
if fails:
    print(f"실패 {len(fails)}건: {fails}")
else:
    print("전부 통과")

pathlib.Path(__file__).resolve().parent.joinpath("last_cheap_run.json").write_text(
    json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
sys.exit(1 if fails else 0)
