"""대본 생성 매트릭스 회귀 (전부 스텁, 과금 0).

길이 5종 x CTA 6종 x 톤 10종을 돌려서 구조 버그를 전부 잡는다.
지난 세션에서 난 NameError / cap 잘림 / CTA 덮어쓰기 같은 것이 전부 여기서 잡혔다.

무료를 위해 3가지를 스텁으로 막는다:
  - 웹 근거 수집(DDG) — 느리고 비결정적
  - 팩트 추출 LLM
  - 본문 생성 LLM
"""
import sys, pathlib, json, re, itertools, traceback
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from core import shorts_lab as sl
from core import recipe_prompts as rp

# ── 1. 웹 근거/팩트를 스텁으로 (네트워크 0) ──────────────────────
STUB_EVIDENCE = {"items": [{"title": f"근거{i}", "snippet": "김치 300g, 30분 끓이기",
                            "url": "https://example.com", "source": "web"}
                           for i in range(6)], "grounded": True}
sl.gather_recipe_evidence = lambda *a, **k: STUB_EVIDENCE
sl.gather_evidence = lambda *a, **k: STUB_EVIDENCE
sl.extract_fact_sentences = lambda *a, **k: ["김치 300g", "돼지고기 200g", "30분"]
sl.format_evidence_block = lambda ev: "[근거] 김치 300g / 30분"

# ── 2. 본문 생성 스텁 ──────────────────────────────────────────
def _scene(section, n_chars, kw):
    """section 마다 서로 다른 길이를 만든다(짧은 장면이 섞여야 후처리가 실제로 돈다)."""
    base = {
        "HOOK": "어릴 적 시원했던 그 냄새가 지금도 생각납니다. 집에서 바로 해먹어 봅니다.",
        "INGREDIENTS": "김치 300g과 돼지고기 200g, 마늘 한 큰술을 준비합니다. 국간장으로 밑간을 합니다.",
        "PREP": "김치는 큰 썰기로 곱게 썰고 돼지고기는 앞다리살을 씻어 물기를 빼줍니다.",
        "HEAT": "중불로 올려 스무 분쯤 끓여주면 김이 올라오면서 맛이 우러납니다. 뚜껑은 열었다 닫습니다.",
        "CORE": "불을 줄여 한 시간 더 저으면 김치가 완전히 풀어 부드러워집니다. 계란을 하나 풀어 넣습니다.",
        "SEASONING": "설탕 한 큰술과 참기름 한 작은술로 마지막 간을 맞춥니다. 간을 보며 조절합니다.",
        "PLATING": "뜨거운 밥에 푸른 채소를 얹어 그릇에 담습니다. 김가루를 올려 마무리하면 예쁩니다.",
        "TASTE": "한입 베어 물면 칼칼한 국물이 온몸에 퍼집니다. 사골보다 이게 낫습니다.",
        "CTA": "완성입니다. 이대로 차려 먹으면 밥 한 끼 충분해요.",
    }.get(section, "조리 방법을 단계별로 설명합니다.")
    if n_chars and len(base.replace(" ", "")) > n_chars:
        base = base[:n_chars].rsplit(" ", 1)[0] + "."
    return {
        "section": section, "speaker": "나레이터",
        "narration_ko": base, "subtitle_ko": base[:18],
        "sfx": "", "sound_prompt": "조리 소리",
        "duration_sec": 10,
        "visual": {"type": "ai_image", "keyword": kw,
                   "description": f"english b-roll prompt for {kw}",
                   "stock_query": kw, "filming_guide": "클로즈업 촬영"},
    }

CAPTURED = []
_call_seq = {"n": 0}


def _unique_board(seed):
    """매 호출마다 다른 keyword/description을 낸다.
    extend/repair 호출이 같은 걸 돌려주면 후처리가 그걸 중복으로 보고
    'description 중복' 오탐이 난다(테스트가 제품 결함을 측정해야지
    스텁 결함을 측정하면 안 된다)."""
    secs = ["HOOK", "INGREDIENTS", "PREP", "HEAT", "CORE", "SEASONING", "PLATING", "CTA"]
    return [_scene(s, 14 if i % 3 == 0 else 0, f"kw{seed}_{i} {s}")
            for i, s in enumerate(secs)]


def _fake_run(prompt, **k):
    CAPTURED.append(prompt)
    # 보강 패스는 json_mode이지만 lines 를 요구한다(스텐에 혼동되면 안 되게 분기).
    if "이어붙일 내용" in prompt or '"lines"' in prompt:
        return {"lines": [[1, "냉장고 반포기 김치를 쓰면 더 시원합니다. 뚜껑을 열면 김이 올라와요."],
                          [2, "목살은 앞다리살로 썰면 기름이 남아 괜찮더라고요. 한 덩이씩 나눠 주세요."]]}
    if k.get("json_mode"):
        _call_seq["n"] += 1
        # 가장 짧은 스텁을 일부러 섞어야 하한 검사/보강이 실제로 돈다.
        return {
            "title": "얼큰한 김치찌개", "description": "냉장고 김치로 끝내는 찌개",
            "total_cooking_time": "30분", "video_duration_sec": 60,
            "ingredients": [{"name": "김치", "amount": "300", "unit": "g"},
                            {"name": "돼지고기", "amount": "200", "unit": "g"}],
            "storyboard": _unique_board(_call_seq["n"]),
        }
    return {"lines": []}


sl._llm_run = _fake_run
sl._llm_run_text = lambda p, **k: "김치 300g, 돼지고기 200g, 30분"

REFERENCE = {
    "hook_summary": "공감 도입", "hook_first3s": ["완성 컷"],
    "content_pattern": [{"phase": "도입", "label": "추억", "detail": "냄새로 시작"}],
    "why_it_works": ["첫 3초 완성 컷"],
    "tone": "친근한 반말", "suggested_duration": 60, "hashtags": ["#김치찌개"],
    "style_analysis": {"hook_style": "공감형", "cta_style": "감정 유도",
                       "tone_style": "추억 회상", "sentence_patterns": ["~거든요"],
                       "pacing": "보통", "ending_style": "반말"},
    "transcript_approx": "이 레퍼런스는 이렇게 말한다. 훨씬 길게 이어지는 문장이 실컷 있다. 끝.",
    "speech_density": {"source": "measured", "chars_per_sec": 4.5,
                       "char_count": 270, "speech_sec": 60},
}

LENGTHS = [("short_30", 30), ("short_60", 60), ("long_3", 180),
           ("long_5", 300), ("long_10", 600)]
CTAS = [c["id"] for c in rp.CTA_VARIANTS]
TONES = [t["id"] for t in rp.TONE_VARIANTS]
STRUCTS = [s["id"] for s in rp.STRUCTURE_VARIANTS]
HOOKS = [h[0] if isinstance(h, (list, tuple)) else h for h in rp.HOOK_VARIANTS]
# 프롬프트에는 id 가 아니라 이름이 렌더된다.
TONE_NAME = {t["id"]: t["name"] for t in rp.TONE_VARIANTS}
CTA_NAME = {c["id"]: c["name"] for c in rp.CTA_VARIANTS}

fails = []
crashes = []


def rec(case, label, detail=""):
    if not case:
        fails.append(f"{label} {detail}".strip())


def run_one(fid, dur, cta, tone, struct):
    CAPTURED.clear()
    try:
        out = sl.create_from_pattern(
            reference_summary=json.dumps(REFERENCE, ensure_ascii=False),
            new_topic="얼큰한 김치찌개", duration=dur, category="recipe_short",
            format_id=fid, platform_id="youtube", cta_id=cta,
            tone_id=tone, structure_id=struct, hook_id="empathy",
        )
    except Exception as e:
        crashes.append(f"{fid}/{cta}/{tone}/{struct}: {type(e).__name__}: {str(e)[:120]}")
        return None
    return out


def check(out, fid, dur, cta, tone, struct, case):
    tag = f"{fid}/{cta}/{tone}/{struct}"
    if out is None:
        return
    scenes = out.get("scenes") or []
    script = out.get("script") or []
    rec(len(scenes) > 0, f"[{tag}] 장면 0개")
    if not scenes:
        return
    blob = json.dumps(out, ensure_ascii=False)
    low = blob.lower()
    # 타임라인
    total = sum(float(s.get("time_end") or 0) - float(s.get("time_start") or 0)
                for s in scenes)
    tol = max(3.0, dur * 0.06)
    rec(abs(total - dur) <= tol, f"[{tag}] 타임라인 {total:.1f} != {dur} (허용±{tol:.1f})")
    # news 침투
    rec("bj 이슈왕" not in blob and "news" not in low, f"[{tag}] 뉴스 화자/키워드 침투")
    # 단위
    rec("1T" not in blob and "1S" not in blob, f"[{tag}] 1T/1S 단위 잔존")
    rec("적당히" not in blob and "대충" not in blob, f"[{tag}] 뭉뚱그린 분량 표현")
    # 화자
    for e in script:
        if isinstance(e, dict):
            rec(e.get("speaker") in (None, "", "나레이터"),
                f"[{tag}] 화자 '{e.get('speaker')}'")
    # 중복
    kws = [s.get("keyword") for s in scenes]
    rec(len(kws) == len(set(kws)), f"[{tag}] keyword 중복")
    des = [s.get("description") for s in scenes]
    rec(len(des) == len(set(des)), f"[{tag}] description 중복")
    # section
    rec(all(s.get("section") for s in scenes), f"[{tag}] section 누락")
    # 하단 대괄호 없음
    rec(not any(re.search(r"[\[\(]", str(s.get("subtitle") or "")) for s in scenes),
        f"[{tag}] 하단 자막에 독백 괄호")
    # CTA가 마지막에
    last = str((script[-1] if script else {}).get("text", "")
               if isinstance(script[-1] if script else {}, dict) else script[-1] if script else "")
    rec(len(last.strip()) > 0, f"[{tag}] 마지막 장면 대사 비어있음")
    # 밀도 규칙이 프롬프트에 들어갔는지
    p = max(CAPTURED, key=len) if CAPTURED else ""
    rec("자/초" in p, f"[{tag}] 밀도 기준 미주입")
    # CTA가 11자 단문으로 잘리지 않았는지
    rec("완성. 많이 먹어. 어때?" not in blob, f"[{tag}] 하드코딩 11자 CTA 잔존")
    # 사용자가 명시한 축이 레퍼런스에 덮어써지지 않았는지.
    # 프롬프트에는 id 가 아니라 한글 이름이 렌더된다(톤/CTA 축 이름 기준).
    rec(TONE_NAME.get(tone, "\x00") in p, f"[{tag}] 명시 톤 '{tone}' 이름이 프롬프트에 없음")
    rec(CTA_NAME.get(cta, "\x00") in p, f"[{tag}] 명시 CTA '{cta}' 이름이 프롬프트에 없음")


print("=" * 74)
print(f"매트릭스: 길이 {len(LENGTHS)} x CTA {len(CTAS)} x 톤 {len(TONES)} x 구조 {len(STRUCTS)}")
total_cases = len(LENGTHS) * len(CTAS) * len(TONES) * len(STRUCTS)
print(f"= {total_cases} 케이스 (스텁, 과금 0)")
print("=" * 74)

n = 0
progress = {}
for (fid, dur), cta in itertools.product(LENGTHS, CTAS):
    for tone, struct in itertools.product(TONES, STRUCTS):
        n += 1
        out = run_one(fid, dur, cta, tone, struct)
        check(out, fid, dur, cta, tone, struct, fid)
        if n % 25 == 0:
            print(f"  ... {n}/{total_cases} (크래시 {len(crashes)}, 위반 {len(fails)})")

print()
print("=" * 74)
print(f"완료 {n} 케이스")
print("=" * 74)

if crashes:
    print(f"\n[크래시 {len(crashes)}건] — 처음 12개")
    seen = set()
    shown = 0
    for c in crashes:
        key = c.split(":")[0].split(":", 1)[-1]
        sig = c.split(": ", 1)[-1][:60]
        if sig in seen:
            continue
        seen.add(sig)
        print("  -", c)
        shown += 1
        if shown >= 12:
            break

if fails:
    # 같은 유형끼리 묶어 본다
    by_kind = {}
    for f in fails:
        kind = re.sub(r"\[[^\]]+\]\s*", "", f)
        kind = re.sub(r"[\d.]+", "N", kind)
        by_kind.setdefault(kind, []).append(f)
    print(f"\n[위반 {len(fails)}건 / 유형 {len(by_kind)}]")
    for kind, lst in sorted(by_kind.items(), key=lambda kv: -len(kv[1])):
        print(f"  {len(lst):>4}건  {kind}")
        print(f"         예: {lst[0][:110]}")

print()
if crashes or fails:
    sys.exit(1)
print("전부 통과")
