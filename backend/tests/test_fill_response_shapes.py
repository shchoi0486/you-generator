"""보강 패스가 문자열 응답을 받아도 죽지 않는가 (실측 버그 회귀).

실측: Gemini 가 json_mode=True 인데 문자열을 돌려주면
     'str' object has no attribute 'get' 로 죽었고, 호출자가 잡아서
     '보강 실패(원본 유지)' 만 남겼다. 보강이 말없이 안 되는 것처럼 보였다.
"""
import sys, pathlib, json
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from core import shorts_lab as sl

fails = []


def chk(ok, label, extra=""):
    if not ok:
        fails.append(label)
    print(f"  {'OK  ' if ok else 'FAIL'} {label}{(' — ' + extra) if extra else ''}")


BASE = "어릴 적 시원했던 그 맛이 그리워서 늘 실패하셨지요"
ITEMS = lambda: [{"section": "HOOK", "speaker": "나레이터",
                  "narration_ko": BASE, "subtitle_ko": ""}]


def call(ret):
    items = ITEMS()
    sl._llm_run = lambda p, **k: ret
    try:
        g = sl._expand_short_narrations(items, [(0, BASE)], target_chars=43, cps=4.5,
                                        cap=66, topic="t", duration=60, resolved_axes={})
        return g, items[0]["narration_ko"]
    except Exception as e:
        return f"EXC:{type(e).__name__}", items[0]["narration_ko"]


print("=" * 70)
print("보강 패스 응답 형태별 동작")
print("=" * 70)

# 1) 정상 dict
g, txt = call({"lines": [[1, "냉장고 반포기 김치를 쓰면 더 시원합니다. 뚜껑을 열면 김이 올라와요."]]})
chk(g == 1, "dict 응답 → 보강됨", f"grown={g}")
chk("냉장고" in txt, "추가분이 붙음")

# 2) 문자열 JSON (실측 버그)
g, txt = call('{"lines": [[1, "냉장고 반포기 김치를 쓰면 더 시원합니다. 뚜껑을 열면 김이 올라와요."]]}')
chk(not str(g).startswith("EXC"), "JSON 문자열 응답 → 예외 없음", str(g))
chk(g == 1, "JSON 문자열 → 보강됨", f"grown={g}")
chk("냉장고" in txt, "문자열 응답에서도 추가분이 붙음")

# 3) 마크다운으로 감싼 JSON 문자열
g, txt = call('```json\n{"lines": [[1, "냉장고 반포기 김치를 쓰면 더 시원합니다. 뚜껑을 열면 김이 올라와요."]]}\n```')
chk(not str(g).startswith("EXC"), "마크다운 감싼 JSON → 예외 없음", str(g))
chk(g == 1, "마크다운 감싼 JSON → 보강됨", f"grown={g}")

# 4) 완전한 비-JSON 텍스트 (모델이 지시 무시)
g, txt = call("죄송하지만 저 그런 요청을 도와드릴 수 없습니다.")
chk(g == 0, "비-JSON 텍스트 → 0 반환", str(g))
chk(txt == BASE, "비-JSON일 때 원본 그대로")

# 5) None
g, txt = call(None)
chk(g == 0, "None 응답 → 0 반환", str(g))
chk(txt == BASE, "None일 때 원본 그대로")

# 6) 리스트 응답
g, txt = call([[1, "냉장고 반포기 김치를 쓰면 더 시원합니다. 뚜껑을 열면 김이 올라와요."]])
chk(not str(g).startswith("EXC"), "리스트 응답 → 예외 없음", str(g))

# 7) lines는 있지만 rows 형태가 이상
g, txt = call({"lines": [{"a": 1}]})
chk(g == 0, "형식이 잘못된 rows → 0 반환(크래시 없음)", str(g))
chk(txt == BASE, "형식 오류 시 원본 유지")

print()
print("=" * 70)
if fails:
    print(f"실패 {len(fails)}건: {fails}")
    sys.exit(1)
print("전부 통과")
