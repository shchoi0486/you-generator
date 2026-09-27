"""실제 LLM 1편 생성 — 대본 밀도 검증 (과금 발생).

사용자가 승인함. Qwen을 1순위로 올려뒀고, 실패하면 체인이 Gemini로 넘어간다.
이 스크립트는 실측 링크가 없으므로 밀도는 '기본값(미측정)' 경로로 간다.
대본이 60초를 채우는지만 본다 (원래 버그의 재현 여부).
"""
import sys, pathlib, json, re, time
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from core import shorts_lab as sl

# 실측 밀도 없음 → resolve_speech_density가 기본값 4.5 + '기본값(미측정)'로 표시한다.
reference = {
    "hook_summary": "어릴 적 시원했던 그 맛, 아무도 안 알려줬다",
    "hook_first3s": ["완성 찌개 클로즈업", "숟가락 들어오는 컷"],
    "content_pattern": [
        {"phase": "도입", "label": "공감/추억", "detail": "식탁 위 냄새로 시작"},
        {"phase": "전개", "label": "재고법", "detail": "재료·분량 나열 후 조리"},
        {"phase": "마무리", "label": "감정", "detail": "친근한 한 마디로 끝"},
    ],
    "why_it_works": ["첫 3초에 완성 컷", "재료가 바로 나와 정보 밀도 높음"],
    "tone": "친근한 1인칭 반말",
    "suggested_duration": 60,
    "hashtags": ["#김치찌개", "#집밥", "#요리"],
    "style_analysis": {
        "hook_style": "공감형", "cta_style": "감정 유도", "tone_style": "추억 회상",
        "sentence_patterns": ["~거든요", "~지요", "넣어 주고"],
        "pacing": "보통", "ending_style": "반말(~다 체)", "honorific": False,
    },
    "transcript_approx": (
        "이 김치찌개는 진짜 예전부터 우리 집에 있던 레시피예요. "
        "김치 한 컵에 돼지고기 200그램, 마늘 한 큰술 넣고 중불로 스무 분쯤 끓여주면 됩니다. "
        "간은 설탕 한 큰술로 맞추고 마지막에 참기름을 한 바퀴 둘러주면 끝납니다."
    ),
    # speech_density 없음 = 미측정 경로
}

print("=" * 72)
print("실제 생성 시작 (Qwen 1순위, 실패 시 Gemini 폴백)")
print(f"provider chain: {[p['id'] for p in __import__('core.provider_registry', fromlist=['registry']).registry.all('llm')]}")
print("=" * 72)

t0 = time.time()
out = sl.create_from_pattern(
    reference_summary=json.dumps(reference, ensure_ascii=False),
    new_topic="얼큰하고 시원한 김치찌개",
    duration=60,
    category="recipe_short",
    format_id="short_60",
    platform_id="youtube",
)
elapsed = time.time() - t0

scenes = out.get("scenes") or []
script = out.get("script") or []
print()
print("=" * 72)
print(f"결과: {len(scenes)}장면, {elapsed:.1f}초 소요")
print("=" * 72)

tot = 0.0
spoken = 0.0
rows = []
for i, sc in enumerate(scenes):
    d = float(sc.get("time_end") or 0) - float(sc.get("time_start") or 0)
    tot += d
    ent = script[i] if i < len(script) else {}
    tx = ent if isinstance(ent, str) else (ent.get("text") or "")
    tx = str(tx or "")
    n = len(re.sub(r"\s+", "", tx))
    cps = 4.5  # 이 실행은 기본값 경로
    spoken += n / cps
    rows.append((sc.get("section", ""), n, d, n / cps, max(0.0, d - n / cps), tx))

print(f"{'section':<13}{'자':>5}{'초':>7}{'발화':>8}{'무음':>8}  대사")
for sec, n, d, sp, si, tx in rows:
    flag = "" if si < 3.0 else "  <-- 무음 큼"
    print(f"{sec:<13}{n:>5}{d:>7.1f}{sp:>8.1f}{si:>8.1f}  {tx[:44]}{flag}")

print()
print(f"영상 {tot:.1f}초 / 실제 발화 약 {spoken:.0f}초 / 무음 약 {max(0.0, tot - spoken):.0f}초")
sil_ratio = max(0.0, tot - spoken) / tot * 100 if tot else 0
print(f"무음 비율 {sil_ratio:.0f}%")

print()
print("=== 재료 방출 여부 ===")
joined = " ".join(str(e if isinstance(e, str) else (e or {}).get("text", "")) for e in script)
ing = [r for r in rows if r[0] == "INGREDIENTS"]
if ing:
    print(f"  INGREDIENTS 대사({ing[0][1]}자): {ing[0][5][:90]}")
    for unit in ("g", "그램", "큰술", "작은술", "컵"):
        if unit in ing[0][5]:
            print(f"    분량 표기 '{unit}' 있음")
print(f"  대사 전체에 분량 단위 개수: "
      f"{sum(joined.count(u) for u in ('그램','큰술','작은술','컵','g '))}")

print()
print("=== 도움말/슬로건 잔존 ===")
for bad in ("두유", "도움", "많이 먹어", "어때"):
    if bad in joined:
        print(f"  '{bad}' 등장")

print()
print("=== 결과 저장 ===")
outp = pathlib.Path(__file__).resolve().parent / "last_real_run.json"
outp.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"  {outp}")
