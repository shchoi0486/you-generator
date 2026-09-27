"""레시피 60초 대본 밀도 회귀.

실측 실패 케이스(김치찌개 60초)를 그대로 고정한다.
- 5장면 x 11.5초인데 대사가 13~40자뿐 -> 실제 발화 약 20초, 나머지 무음
- INGREDIENTS 장면이 "김치 1컵"만 말하고 나머지 재료/분량 누락
"""
import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from core import recipe_prompts as rp

FAILED = [
    ("HOOK", "어릴 적 식탁 위에서 늘 맡았던 그 냄새, 기억하시죠?"),
    ("INGREDIENTS", "김치 1컵을 준비해 주시고요."),
    ("PREP", "설탕 1큰술을 넣고 볶아주거든요."),
    ("HEAT", "총 25분 동안 불에 올려 끓여주죠. 2인분 기준으로 넉넉하게 끓여내지요."),
    ("CTA", "완성. 많이 먹어 어때?"),
]

PER_SCENE = 11.5
FLOOR = round(PER_SCENE * 3.0)   # 35
TARGET = round(PER_SCENE * 4.5)  # 52

print("=" * 68)
print(f"기준: {PER_SCENE}초 장면 -> 하한 {FLOOR}자 / 목표 {TARGET}자")
print("=" * 68)

fails = 0

# 1) 실패 케이스가 실제로 하한을 위반하는가 (진단 로직이 잡는지)
#    여기서는 '부족으로 탐지되는 것'이 통과 조건이다.
print("\n[1] 실패 케이스 밀도 진단 (탐지되면 통과)")
detected = 0
for i, (sec, tx) in enumerate(FAILED, 1):
    n = len(tx.replace(" ", ""))
    silent = PER_SCENE - n / 4.5
    bad = n < FLOOR
    if bad:
        detected += 1
    print(f"  {i}번 {sec:<12} {n:>3}자  발화 {n / 4.5:>4.1f}초  "
          f"무음 {silent:>4.1f}초  {'탐지' if bad else '놓침'}")
if detected != len(FAILED):
    fails += 1
print(f"  {'OK ' if detected == len(FAILED) else 'MISS'} "
      f"{detected}/{len(FAILED)}개 부족 장면 탐지")

# 2) 프롬프트에 밀도 규칙이 들어갔는가
print("\n[2] CORE 프롬프트 밀도 규칙")
core = rp.CORE_RECIPE_PROMPT
for probe, label in [
    ("1초당", "1초당 글자수 기준"),
    ("무음", "무음 금지 경고"),
    ("2~3문장", "단문 금지"),
]:
    ok = probe in core
    if not ok:
        fails += 1
    print(f"  {'OK ' if ok else 'MISS'} {label}")

# 3) INGREDIENTS가 분량 나열을 요구하는가
print("\n[3] INGREDIENTS 규칙 (30초/60초)")
for fid, label in [("short_30", "30초"), ("short_60", "60초")]:
    p = rp.FORMATS[fid]["prompt"]
    has_amount = ("분량" in p) or ("g/ml" in p)
    defer = "화면 자막과 조리 장면에서 전달" in p   # 분량을 대사에서 빠뜨리던 문구
    ok = has_amount and not defer
    if not ok:
        fails += 1
    print(f"  {'OK ' if ok else 'MISS'} {label}: 분량요구={has_amount} 분량위임문구={defer}")

# 4) narration_ko 출력 스펙(OUTPUT_PROMPT)에 밀도 기준이 있는가
#    (포맷별 prompt가 아니라 공유 출력 스펙에 넣었다)
print("\n[4] narration_ko 출력 스펙")
out = rp.OUTPUT_PROMPT
checks = [
    ("1초당 4~5자", "1초당 글자수 기준"),
    ("duration_sec", "장면 길이 기준 언급"),
    ("무음", "무음 발생 경고"),
]
for probe, label in checks:
    ok = probe in out
    if not ok:
        fails += 1
    print(f"  {'OK ' if ok else 'MISS'} {label}")

print("\n" + "=" * 68)
print(f"실패 {fails}건")
sys.exit(1 if fails else 0)
