"""다중 레퍼런스 → 중앙값 경로 검증 (무료).

예전엔 프론트가 setReport(data)로 덮어써서 1개만 전달됐다.
이제 reference_reports로 배열이 넘어오고 중앙값이 실제로 쓰이는지 확인한다.
"""
import sys, pathlib, json
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from core import shorts_lab as sl

fails = []


def chk(ok, label, extra=""):
    if not ok:
        fails.append(label)
    print(f"  {'OK  ' if ok else 'FAIL'} {label}{(' — ' + extra) if extra else ''}")


def rep(cps, vid, ta="레퍼런스가 이렇게 말한다. 훨씬 길게 이어지는 문장이다. 끝."):
    return {
        "video_id": vid,
        "hook_summary": f"후회형 도입 {vid}",
        "speech_density": {"source": "measured", "chars_per_sec": cps,
                           "char_count": 240, "speech_sec": 60},
        "transcript_approx": ta,
        "storyboard": [{"speaker": "나레이터", "text": "짧은 대본"}],
    }


print("=" * 70)
print("[1] 3개 링크 → 중앙값")
rs = [rep(4.2, "aaa"), rep(4.4, "bbb"), rep(4.6, "ccc")]
d = sl.resolve_speech_density(rs)
chk(d["n_refs"] == 3, "3편 집계", f"n={d['n_refs']}")
chk(d["measured"] is True, "measured=True")
chk(abs(d["chars_per_sec"] - 4.4) < 0.01, "중앙값 4.4", str(d["chars_per_sec"]))

print("\n[2] 이상치 방어")
rs_bad = [rep(4.0, "a"), rep(4.1, "b"), rep(4.2, "c"), rep(28.0, "z"), rep(0.8, "y")]
d2 = sl.resolve_speech_density(rs_bad)
chk(abs(d2["chars_per_sec"] - 4.1) < 0.6, "이상치 28.0/0.8이 중앙값을 끌어내지 않음",
    str(d2["chars_per_sec"]))
chk(d2["chars_per_sec"] <= sl.DENSITY_CPS_MAX, "상한 준수", str(d2["chars_per_sec"]))

print("\n[3] 미측정 링크가 섞여도 실측값만 사용")
rs_mixed = [rep(4.5, "good"),
            {"video_id": "nots", "speech_density": {"source": "unmeasured",
                                                    "chars_per_sec": None}}]
d3 = sl.resolve_speech_density(rs_mixed)
chk(d3["n_refs"] == 1, "실측 1편만 집계", f"n={d3['n_refs']}")
chk(d3["chars_per_sec"] == 4.5, "실측값 4.5 유지", str(d3["chars_per_sec"]))

print("\n[4] LLM이 지어낸 값은 믿지 않음")
rs_fake = [{"video_id": "f", "speech_density": {"source": "llm_guess", "chars_per_sec": 9.9},
            "chars_per_sec": 9.9, "style_analysis": {"pacing": "빠름"}}]
d4 = sl.resolve_speech_density(rs_fake)
chk(d4["measured"] is False, "LLM 추정값은 미측정 처리")
chk(d4["chars_per_sec"] == sl.DENSITY_CPS_FALLBACK, "기본값으로 대체", str(d4["chars_per_sec"]))

print("\n[5] 프롬프트에 중앙값 + 2개 예시가 들어가는가")
merged = json.dumps(rep(4.4, "bbb"), ensure_ascii=False)
block = sl._compact_reference(merged, target_scene_sec=9.5,
                              density=sl.resolve_speech_density(rs))
chk("4.4자/초" in block, "중앙값 4.4자/초 표시")
chk("레퍼런스 3편" in block, "3편 기준임을 명시")
chk("약 42자" in block, "9.5초 → 42자 목표", )
chk("레퍼런스 1편" not in block, "'1편'으로 잘못 표시되지 않음")
chk("글자수 함께" in block, "실제 문장 예시 포함")
chk("짧은 대본" not in block, "LLM 대사 예시 배제")

print("\n[6] API 스키마가 배열을 받는가")
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
import main as be
req = be.ShortsCreateRequest(reference=merged, new_topic="김치찌개",
                             reference_reports=rs)
chk(len(req.reference_reports or []) == 3, "reference_reports 3개 수신")
req2 = be.ShortsCreateRequest(reference=merged, new_topic="김치찌개")
chk(req2.reference_reports is None, "미지정 시 None (하위 호환)")

print("\n" + "=" * 70)
if fails:
    print(f"실패 {len(fails)}건: {fails}")
    sys.exit(1)
print("전부 통과")
