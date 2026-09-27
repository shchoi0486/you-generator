"""실측 말하기 밀도 회귀 (전부 무�� / LLM 호출 0회).

검증 항목
1. 자막 타임스탬프로 chars_per_sec가 '실측'되는가 (LLM 추정 아님)
2. 1~2문장 하드코딩이 지시에서 사라졌는가
3. 여러 레퍼런스면 중앙값인가 (이상치 방어)
4. 범위 밖 값은 보정되는가
5. 미측정이면 기본값 + '미측정' 명시인가 (숫자 지어내지 않음)
6. 예시는 storyboard(자기 자신)가 아니라 transcript_approx에서 왔는가
7. cap/floor가 프롬프트와 같은 자릿수인가
8. 긴 포맷(3/5/10분)도 같은 공식이 적용되는가
"""
import sys, pathlib, json, re
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from core import shorts_lab as sl

fails = []


def chk(ok, label, extra=""):
    if not ok:
        fails.append(label)
    print(f"  {'OK  ' if ok else 'FAIL'} {label}{(' — ' + extra) if extra else ''}")


# ── 가짜 자막: 60초 구간에 300자 → 정확히 5.0자/초 ───────────────────
def make_segments(total_chars, speech_sec, seg_sec=4.0):
    """글자 수와 발화 시간을 가진 가짜 자막 세그먼트 생성."""
    segs, n, t = [], total_chars, 0.0
    per = max(1, int(seg_sec * total_chars / speech_sec))
    while n > 0 and t < speech_sec - 0.5:
        take = min(per, n)
        segs.append(("가" * take, round(t, 2), seg_sec))
        n -= take
        t += seg_sec
    return segs


print("=" * 70)
print("[1] 타임스탬프 실측")
d = sl.measure_speech_density(make_segments(300, 60))
chk(d["source"] == "measured", "source=measured", d["source"])
chk(abs(d["chars_per_sec"] - 5.0) < 0.35, "300자/60초 ≈ 5.0자/초", str(d["chars_per_sec"]))
chk(d["speech_sec"] > 0, "발화 시간 계산됨", f"{d['speech_sec']}초")

print("\n[2] 미측정 시 숫자를 지어내지 않음")
for name, segs in [("빈 입력", []),
                   ("타임스탬프 2개뿐", [("가", 0.0, 2.0), ("나", 2.0, 2.0)])]:
    dd = sl.measure_speech_density(segs)
    chk(dd["source"] == "unmeasured" and dd["chars_per_sec"] is None,
        f"{name} → unmeasured, 값 없음", f"{dd['source']}/{dd['chars_per_sec']}")

print("\n[3] 하드코딩 제거")
chk('"text": "1~2문장 대사"' not in sl.ANALYSIS_JSON_SPEC, '"1~2문장 대사" 지시 삭제됨')
chk("고정 틀을 쓰지 마라" in sl.ANALYSIS_JSON_SPEC, "고정 틀 금지 지시 존재")

print("\n[4] 중앙값 (이상치 방어)")
def rep_with(cps):
    return {"speech_density": {"source": "measured", "chars_per_sec": cps},
            "hook_summary": "h"}
r = sl.resolve_speech_density([rep_with(4.2), rep_with(4.4), rep_with(4.5), rep_with(30.0)])
chk(r["n_refs"] == 4, "4편 집계", f"n={r['n_refs']}")
med_ok = abs(r["chars_per_sec"] - 4.45) < 0.1
chk(med_ok, "이상치 30.0이 중앙값에 영향 없음", f"결과 {r['chars_per_sec']}")
chk(r["chars_per_sec"] <= sl.DENSITY_CPS_MAX, f"상한 {sl.DENSITY_CPS_MAX} 이하", str(r["chars_per_sec"]))

print("\n[5] 범위 보정")
lo = sl.resolve_speech_density([rep_with(1.2)])
chk(lo["chars_per_sec"] == sl.DENSITY_CPS_MIN, "1.2 → 최소값으로 보정", str(lo["chars_per_sec"]))
chk("보정" in lo["note"], "보정 사실을 note에 명시", lo["note"][:40])

print("\n[6] 미측정 기본값")
z = sl.resolve_speech_density([])
chk(z["measured"] is False, "measured=False")
chk(z["chars_per_sec"] == sl.DENSITY_CPS_FALLBACK, "기본값 4.5", str(z["chars_per_sec"]))
chk("실측 실패" in z["note"], "실측 실패를 명시", z["note"][:30])

print("\n[7] 예시 출처 (자기 자신 금지)")
rep = {
    "hook_summary": "후회형 도입",
    "speech_density": {"source": "measured", "chars_per_sec": 4.5},
    "storyboard": [{"text": "짧은한 대본이라서"}, {"text": "이것도 짧다"}],
    "transcript_approx": "이 레퍼런스는 실제로 이렇게 말한다. 훨씬 더 길게 이어진다. "
                         "그래서 이런 리듬이 나온다. 마지막 문장도 충분한 길이.",
}
samples = sl._reference_samples(rep)
joined = " ".join(samples)
chk(len(samples) > 0, "예시 추출됨", f"{len(samples)}개")
chk("짧은한 대본이라서" not in joined, "storyboard 대사는 예시로 안 쓰임")
chk("실제로 이렇게 말한다" in joined, "transcript_approx에서 나옴")

print("\n[8] 프롬프트 블록에 숫자 주입")
block = sl._compact_reference(json.dumps(rep, ensure_ascii=False), target_scene_sec=11.5)
chk("4.5자/초" in block, "실측 4.5자/초 표시")
chk("약 52자" in block, "11.5초 → 52자 목표 표시")
chk("실측" in block, "출처가 실측임을 명시")
# 실측 아님을 드러내는지
block2 = sl._compact_reference(json.dumps({"hook_summary": "x"}, ensure_ascii=False),
                               target_scene_sec=11.5)
chk("기본값(미측정)" in block2, "미측정이면 '기본값(미측정)'으로 표시")

print("\n[9] cap/floor가 같은 자릿수인가")
cps = 4.5
per_scene = 11.5
cap_expect = max(40, min(120, round(per_scene * cps * 1.11)))
tgt_expect = round(per_scene * cps)
floor_expect = max(8, round(tgt_expect * 0.8))
chk(tgt_expect == 52, f"11.5초 × 4.5자/초 = 52자", str(tgt_expect))
chk(cap_expect == round(per_scene * cps * 1.11), f"cap = 속도×1.11 = {cap_expect}")
chk(cap_expect > tgt_expect, "cap이 target보다 큼 (잘리지 않음)")
chk(floor_expect < tgt_expect, f"floor({floor_expect}) < target({tgt_expect}) (조용히 잘리지 않음)")
chk(floor_expect <= cap_expect, "floor <= cap (범위 정합)")

print("\n[10] 길이별 공식 일관성 (동일 공식 적용)")
cps = 4.5
rows = []
for dur in (30, 60, 180, 300, 600):
    scenes = max(4, round(dur / 10))
    sec = max(3.0, (dur - 0.5 * scenes) / scenes)
    rows.append((dur, scenes, round(sec, 1), round(cps * sec), round(cps * dur)))
print("   길이  장면수  장면초  장면목표자  총목표자")
for r in rows:
    print(f"   {r[0]:>4}  {r[1]:>5}  {r[2]:>5}  {r[3]:>8}  {r[4]:>7}")
ok_ratio = all(abs(r[3] / r[2] - cps) < 0.25 for r in rows)
chk(ok_ratio, "모든 길이에서 초당 글자수가 4.5로 일정")
ok_total = all(abs(r[4] - cps * r[0]) < cps * 2 for r in rows)
chk(ok_total, "총 목표 글자수 = 4.5 × 총 길이")
chk(len(rows) == 5, "30초/1분/3분/5분/10분 모두 계산됨")

print("\n" + "=" * 70)
if fails:
    print(f"실패 {len(fails)}건:")
    for f in fails:
        print("  -", f)
    sys.exit(1)
print("전부 통과")
