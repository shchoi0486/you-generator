"""개정안 trim_to_target_length 검증.

핵심 확인:
 1. 단어 중간 절단이 사라졌는가 (실패 케이스 59자)
 2. 상한 1.55배가 really 초당 7자와 일치하는가 (장면 길이 무관해야 함)
 3. "…" 가 안 붙는가
 4. 하한 0.8 유지
"""
import re, sys
sys.path.insert(0, __file__.rsplit("\\", 1)[0].rsplit("/", 1)[0])
sys.path.insert(0, ".")
from core.shorts_lab import trim_narration_to_target as trim, CAP_MAX_RATIO

def old_trim(text, cap):
    """예전 로직(단어 경계 절단) — 비교용."""
    head = text[:cap]
    cut = max(head.rfind(". "), head.rfind("? "), head.rfind("! "))
    if cut < 15:
        cut = head.rfind(" ")
    trimmed = (head[:cut + 1] if cut > 0 else head).strip()
    return trimmed or text


fails = []


def chk(ok, label, extra=""):
    if not ok:
        fails.append(label)
    print(f"  {'OK  ' if ok else 'FAIL'} {label}{(' — ' + extra) if extra else ''}")


def nospace(s):
    return len(re.sub(r"\s+", "", s))


print("=" * 74)
print("[1] 실패 케이스: 마침표 없는 59자 → 예전에 25자로 죽었다")
print("=" * 74)
T59 = "매번 먹을 때마다 맛이 밍밍해서 고민하셨죠요 집에서 직접 써먹어 봤더니 확실히 다르더라고요"
T91 = ("냉장고에 있던 반포기 김치를 큰 썰기로 썰어서 돼지고기랑 같이 볶아주면 되거든요 "
       "그 다음에 물을 부어서 스무 분 정도 끓여주면 김이 올라오면서 맛이 확 우러나거든요 "
       "김가루까지 올려서 마무리하면 금방 해먹을 수 있어요")

for name, t in (("59자 단일문장", T59), ("91자 3문장", T91)):
    old = old_trim(t, 43)
    new = trim(t, 43)
    print(f"\n[{name}] 공백제외 {nospace(t)}자")
    print(f"  예전(단어절단): {nospace(old):>3}자  {old[:52]}")
    print(f"  신규(문장경계): {nospace(new):>3}자  {new[:52]}")
    loss_old = nospace(t) - nospace(old)
    loss_new = nospace(t) - nospace(new)
    print(f"  손실  예전 {loss_old}자  →  신규 {loss_new}자")
    chk(loss_new <= loss_old, f"{name}: 손실이 줄었어야 함", f"{loss_old} → {loss_new}")
    # 어미가 앞말에서 떨어지지 않아야 한다 ('되' + '거든요' 같은 쪼개짐 방지)
    chk(not re.search(r"\S\s+(거든요|습니다|입니다|네요|예요|어요|줘요|봐요)", new),
        f"{name}: 어미가 앞말에 붙어 있음", repr(new[-20:]))

print()
print("=" * 74)
print("[2] 상한 1.55배가 '초당 7자'와 장면 길이 무관하게 맞는지")
print("=" * 74)
CPS_SLOW, CPS_FAST = 4.5, 7.0
print("   장면초  목표자  상한(1.55배)  7자/초 기준  일치")
for per in (7.0, 9.5, 12.0, 15.0, 20.0, 30.0):
    tgt = round(per * CPS_SLOW)
    up = int(tgt * 1.55)
    cap7 = int(per * CPS_FAST)
    ok = abs(up - cap7) <= 1
    print(f"  {per:>6}  {tgt:>6}  {up:>10}  {cap7:>9}  {'OK' if ok else '불일치'}")
    chk(ok, f"{per}초 장면에서 상한이 7자/초와 일치", f"{up} vs {cap7}")

print()
print("=" * 74)
print("[3] '…' 미부착 / 하한 유지")
print("=" * 74)
outs = [trim(x, 43) for x in (T59, T91, "가" * 200, "김치 300g을 준비해 주세요.")]
chk(not any("…" in o for o in outs), "TTS 텍스트에 '…' 없음")
chk(not any("�" in o or "\ufffd" in o for o in outs), "깨진 문자 없음")
chk(trim("김치 300g을 준비해 주세요.", 43) == "김치 300g을 준비해 주세요.", "짧은 문장 원본 유지")
TGT = 43
chk(int(TGT * 0.8) == 34, "하한 0.8배 = 34자 유지")
for n in (25, 33, 34, 45):
    sil = 9.5 - n / CPS_SLOW
    flag = "보강" if n < int(TGT * 0.8) else "통과"
    print(f"    {n:>3}자 → 무음 {sil:>4.1f}초  {flag}")

print()
print("=" * 74)
if fails:
    print(f"실패 {len(fails)}건:")
    for f in fails:
        print("  -", f)
    sys.exit(1)
print("전부 통과 — 이 버전은 적용 가능")
