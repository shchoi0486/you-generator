import React from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2 } from 'lucide-react';
import { api, type ProviderPricing, type ProviderKeyList } from '../services/api';
import ProviderKeySections from './ProviderKeySections';

/** 가격표는 백엔드 providers.yaml 이 단일 출처다(GET /providers/pricing).
 *  여기에는 값을 쓰지 않는다 — 예전엔 IMAGE_ROWS/VIDEO_ROWS 를 하드코딩했는데
 *  providers.yaml 과 별개로 살아남아 금액이 서로 어긋났다. */

type TabId = 'image' | 'video' | 'tts' | 'scenario' | 'keys';
const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'image', label: '이미지' },
  { id: 'video', label: '영상' },
  { id: 'tts', label: 'TTS·대본' },
  { id: 'scenario', label: '시나리오' },
  { id: 'keys', label: 'API 키' },
];

const krw = (usd: number, rate: number) => {
  const n = usd * rate;
  if (n < 0.01) return '0원';
  if (n < 10) return `약 ${Math.round(n).toLocaleString()}원`;
  return `약 ${Math.round(n).toLocaleString()}원`;
};

const Th: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <th className="px-2.5 py-2 text-left text-[10px] font-black text-gray-500 uppercase tracking-wider bg-gray-50">
    {children}
  </th>
);
const Td: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <td className={`px-2.5 py-2 text-xs text-gray-700 border-t border-gray-100 ${className}`}>
    {children}
  </td>
);

/** 상태 배지. '키만 있다'는 '아직 못 쓴다'와 구분해야 한다. */
const StatusBadge: React.FC<{ ready: boolean; hasKey: boolean; enabled: boolean }> = ({ ready, hasKey, enabled }) => {
  if (ready) return <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">사용 가능</span>;
  if (!enabled) return <span className="text-[10px] font-bold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">비활성</span>;
  if (hasKey) return <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">키 있음 · 활성 필요</span>;
  return <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">키 필요</span>;
};

const ModelPricingModal: React.FC<{
  initialTab?: TabId;
  onClose: () => void;
}> = ({ initialTab = 'image', onClose }) => {
  const [tab, setTab] = React.useState<TabId>(initialTab);
  const [data, setData] = React.useState<ProviderPricing | null>(null);
  const [keyData, setKeyData] = React.useState<ProviderKeyList | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const p = await api.getProviderPricing();
        if (alive) setData(p);
      } catch (e) {
        if (alive) setErr((e as Error).message || '가격 정보를 불러오지 못했습니다.');
      }
      try {
        const k = await api.getProviderKeys();
        if (alive) setKeyData(k);
      } catch { /* 키 목록은 선택 사항 */ }
    })();
    return () => { alive = false; };
  }, []);

  const refreshKeys = React.useCallback(async () => {
    try {
      const k = await api.getProviderKeys();
      setKeyData(k);
      setData(await api.getProviderPricing());
    } catch { /* 무시 */ }
  }, []);

  return createPortal(
    <div
      className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100">
          <p className="text-sm font-bold text-gray-800 flex-1">AI 모델 가격 · 키 관리</p>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-700">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 pt-3">
          <div className="flex gap-1 border-b border-gray-100">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-3 py-2 text-[11px] font-black border-b-2 -mb-px transition-colors ${
                  tab === t.id
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-gray-400 hover:text-gray-600'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-5 overflow-y-auto">
          {err && (
            <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
              <p className="text-xs font-bold text-red-700">{err}</p>
              <p className="text-[11px] text-red-600 mt-0.5">
                백엔드가 안 떠 있으면 잠시 후 다시 열어 주세요.
              </p>
            </div>
          )}

          {!data && !err && (
            <div className="flex items-center justify-center py-10 gap-2 text-gray-400">
              <Loader2 size={16} className="animate-spin" />
              <span className="text-xs font-bold">가격 정보를 불러오는 중...</span>
            </div>
          )}

          {/* ── 이미지 ────────────────────────────────────── */}
          {tab === 'image' && data && (
            <table className="w-full">
              <thead>
                <tr>
                  <Th>모델</Th><Th>단가</Th><Th>원화</Th><Th>참조</Th><Th>품질</Th><Th>상태</Th>
                </tr>
              </thead>
              <tbody>
                {data.image.map((r) => (
                  <tr key={r.id} className={r.usd === 0 ? 'bg-emerald-50/40' : ''}>
                    <Td className="font-bold text-gray-800">
                      {r.label}
                      {r.notes && (
                        <p className="text-[10px] font-normal text-gray-400 mt-0.5 leading-snug max-w-[220px]">
                          {r.notes}
                        </p>
                      )}
                    </Td>
                    <Td className="tabular-nums font-semibold">
                      {typeof r.usd === 'number' ? (r.usd === 0 ? '무료' : `$${r.usd}`) : r.krw}
                    </Td>
                    <Td className="tabular-nums text-gray-500">{r.krw}</Td>
                    <Td className="text-[10px]">
                      {r.max_refs > 0
                        ? <span className={r.i2i_verified ? 'text-emerald-600 font-bold' : 'text-amber-600'}>
                            {r.modes.join('/')}{r.i2i_verified ? ' ✓' : ' (미검증)'}
                          </span>
                        : <span className="text-gray-300">-</span>}
                    </Td>
                    <Td className="tabular-nums">{r.quality ?? '-'}</Td>
                    <Td><StatusBadge ready={r.ready} hasKey={r.has_key} enabled={r.enabled} /></Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* ── 영상 ──────────────────────────────────────── */}
          {tab === 'video' && data && (
            <>
              <table className="w-full">
                <thead>
                  <tr>
                    <Th>모델</Th><Th>해상도</Th><Th>초당</Th><Th>5초</Th><Th>10초</Th><Th>상태</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.video.map((r) => {
                    const per = typeof r.usd === 'number' ? r.usd : 0;
                    return (
                      <tr key={r.id} className={per === 0 ? 'bg-emerald-50/40' : ''}>
                        <Td className="font-bold text-gray-800">
                          {r.label}
                          {r.max_sec && (
                            <span className="ml-1 text-[10px] font-normal text-gray-400">최대 {r.max_sec}초</span>
                          )}
                        </Td>
                        <Td className="text-[11px] text-gray-500">{r.res || '-'}</Td>
                        <Td className="tabular-nums font-semibold">
                          {per === 0 ? '무료' : `$${per.toFixed(2)}`}
                        </Td>
                        <Td className="tabular-nums text-gray-500">
                          {per === 0 ? '0원' : `${krw(per * 5, data.usd_krw)}`}
                        </Td>
                        <Td className="tabular-nums text-gray-500">
                          {per === 0 ? '0원' : `${krw(per * 10, data.usd_krw)}`}
                        </Td>
                        <Td><StatusBadge ready={r.ready} hasKey={r.has_key} enabled={r.enabled} /></Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="mt-3 text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                영상은 '길이 × 단가'입니다. 60초 전체에 적용하면 수만 원이므로
                Ken Burns(무료)를 기본으로 하고 핵심 장면만 i2v 로 올리세요.
              </p>
            </>
          )}

          {/* ── TTS·대본 ──────────────────────────────────── */}
          {tab === 'tts' && data && (
            <>
              <table className="w-full">
                <thead>
                  <tr><Th>모델</Th><Th>단위</Th><Th>단가</Th><Th>원화</Th><Th>상태</Th></tr>
                </thead>
                <tbody>
                  {data.tts.map((r) => (
                    <tr key={r.id} className={r.usd === 0 ? 'bg-emerald-50/40' : ''}>
                      <Td className="font-bold text-gray-800">{r.label}</Td>
                      <Td className="text-[11px] text-gray-500">{r.unit}</Td>
                      <Td className="tabular-nums font-semibold">
                        {typeof r.usd === 'number' ? `$${r.usd}` : r.krw}
                      </Td>
                      <Td className="tabular-nums text-gray-500">{r.krw}</Td>
                      <Td><StatusBadge ready={r.ready} hasKey={r.has_key} enabled={r.enabled} /></Td>
                    </tr>
                  ))}
                  {data.llm.map((r) => (
                    <tr key={r.id}>
                      <Td className="font-bold text-gray-800">{r.label} <span className="text-[10px] font-normal text-gray-400">(대본)</span></Td>
                      <Td className="text-[11px] text-gray-500">1M 토큰</Td>
                      <Td className="tabular-nums font-semibold">
                        {r.notes ? r.notes : (typeof r.usd === 'number' ? `$${r.usd}` : r.krw)}
                      </Td>
                      <Td className="tabular-nums text-gray-500">{r.krw}</Td>
                      <Td><StatusBadge ready={r.ready} hasKey={r.has_key} enabled={r.enabled} /></Td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-3 text-[11px] text-gray-500">
                60초 영상은 한국어 약 700자입니다. TTS 는 전체 비용에서 가장 작은 항목이라
                ElevenLabs(한국어 중간, 10배 가격) 대신 저렴한 경로를 권합니다.
              </p>
            </>
          )}

          {/* ── 시나리오 (실제 계산) ───────────────────────── */}
          {tab === 'scenario' && data && <ScenarioTab data={data} />}

          {/* ── API 키 (설정 화면과 동일한 컴포넌트) ── */}
          {tab === 'keys' && (
            <ProviderKeySections
              data={keyData}
              loading={false}
              onRefresh={refreshKeys}
            />
          )}
        </div>

        <div className="px-5 py-3 border-t border-gray-100 bg-gray-50">
          <p className="text-[10px] text-gray-400 font-medium leading-relaxed">
            환율 약 {data?.usd_krw?.toLocaleString() || '1,370'}원 표시용입니다.
            실제 청구 금액은 각 provider 공식가 기준이며, 재생성 횟수만큼 곱해집니다.
          </p>
        </div>
      </div>
    </div>,
    document.body
  );
};

/** 시나리오 비용을 실제로 계산한다.
 *  예전엔 합계가 문자열 리터럴('약 3,500원')로 들어 있어서 rows 를 더하지도
 *  값이 바뀌지 않았다. 여기서는 전부 곱셈으로 계산한다. */
const ScenarioTab: React.FC<{ data: ProviderPricing }> = ({ data }) => {
  const R = data.usd_krw;
  const byId = React.useMemo(() => {
    const m: Record<string, any> = {};
    for (const sec of ['image', 'video', 'tts', 'llm'] as const) {
      for (const r of data[sec]) m[r.id] = r;
    }
    return m;
  }, [data]);

  const pick = (id: string) => byId[id];

  /** 이미지 6장 비용. 참조이미지가 필요하면 i2i 를 지원하는 첫 항목만. */
  const imgCost = (id: string, count: number, needRefs: boolean): { usd: number; label: string } | null => {
    const r = pick(id);
    if (!r || typeof r.usd !== 'number') return null;
    if (needRefs && !(r.max_refs > 0)) return null;
    return { usd: r.usd * count, label: `${r.label} × ${count}장` };
  };

  const scriptCost = (id: string) => {
    const r = pick(id);
    if (!r) return null;
    // 실측: 5k in / 2k out 1회 호출
    const notes = r.notes || '';
    const mi = notes.match(/입력[^$]*\$([\d.]+)/);
    const mo = notes.match(/출력[^$]*\$([\d.]+)/);
    const ci = mi ? parseFloat(mi[1]) : (typeof r.usd === 'number' ? r.usd : 0);
    const co = mo ? parseFloat(mo[1]) : ci * 4;
    return { usd: (5000 / 1e6) * ci + (2000 / 1e6) * co, label: r.label };
  };

  const ttsCost = (id: string, chars = 2000) => {
    const r = pick(id);
    if (!r || typeof r.usd !== 'number') return null;
    return { usd: (r.usd / 1e6) * chars, label: `${r.label} ${chars.toLocaleString()}자` };
  };

  const videoCost = (id: string, seconds: number) => {
    const r = pick(id);
    if (!r || typeof r.usd !== 'number') return null;
    return { usd: r.usd * seconds, label: `${r.label} ${seconds}초` };
  };

  const PLANS = React.useMemo(() => {
    const P = [] as Array<{ name: string; note: string; items: Array<{ k: string; v: string; c: number }>; total: number }>;
    const TTS_KEY = 'cloudflare_azure_proxy';
    const tts = () => ttsCost(TTS_KEY) || { usd: 0.0022, label: 'Cloudflare→Azure 2,000자' };

    // A안: 전부 무료/저가
    {
      const t = tts();
      const items = [
        { k: '대본', v: 'Gemini Flash-Lite', c: scriptCost('gemini_flash_lite')?.usd ?? 0 },
        { k: '이미지', v: 'Pexels 실사 사진', c: 0 },
        { k: '영상', v: 'Ken Burns', c: 0 },
        { k: 'TTS', v: t.label, c: t.usd },
      ];
      P.push({ name: 'A안 · 무료', note: '참조 이미지 미사용', items, total: items.reduce((a, b) => a + b.c, 0) });
    }
    // B안: 참조 이미지 (제품 광고의 최소 요구)
    {
      const t = tts();
      const img = imgCost('nano_banana_2_1k', 6, true);
      const items = [
        { k: '대본', v: 'Gemini Flash-Lite', c: scriptCost('gemini_flash_lite')?.usd ?? 0 },
        { k: '이미지', v: img?.label ?? 'Nano Banana 2 1K × 6장', c: img?.usd ?? 0.402 },
        { k: '영상', v: 'Ken Burns', c: 0 },
        { k: 'TTS', v: t.label, c: t.usd },
      ];
      P.push({ name: 'B안 · 제품 일관성', note: '참조 이미지 6장 전부', items, total: items.reduce((a, b) => a + b.c, 0) });
    }
    // C안: 참조 이미지 + 핵심 장면 i2v 2장(5초)
    {
      const t = tts();
      const img = imgCost('nano_banana_2_1k', 6, true);
      const vid = videoCost('veo_3_1_lite', 10);
      const items = [
        { k: '대본', v: 'Gemini Flash-Lite', c: scriptCost('gemini_flash_lite')?.usd ?? 0 },
        { k: '이미지', v: img?.label ?? 'Nano Banana 2 1K × 6장', c: img?.usd ?? 0.402 },
        { k: '영상', v: 'Veo Lite 2장면×5초 (나머지 Ken Burns)', c: vid?.usd ?? 0.5 },
        { k: 'TTS', v: t.label, c: t.usd },
      ];
      P.push({ name: 'C안 · 동작 추가', note: '핵심 2장면만 i2v', items, total: items.reduce((a, b) => a + b.c, 0) });
    }
    // D안: 최저가 이미지 + 동작
    {
      const t = tts();
      const img = imgCost('minimax_image_01', 6, false);
      const vid = videoCost('minimax_h3_768p', 10);
      const items = [
        { k: '대본', v: 'DeepSeek V4 Flash', c: scriptCost('deepseek_v4_flash')?.usd ?? 0.0013 },
        { k: '이미지', v: img?.label ?? 'MiniMax image-01 × 6장', c: img?.usd ?? 0.021 },
        { k: '영상', v: 'MiniMax H3 2장면×5초', c: vid?.usd ?? 0.8 },
        { k: 'TTS', v: t.label, c: t.usd },
      ];
      P.push({ name: 'D안 · 최저가', note: '참조 이미지 없음 — 제품 일관성 보장 안 됨', items, total: items.reduce((a, b) => a + b.c, 0) });
    }
    return P;
  }, [byId, R]);

  return (
    <div className="space-y-3">
      <p className="text-xs font-bold text-gray-500">
        30초 쇼츠 1편 · 이미지 6장 + TTS 2,000자 + 최종 채택본 1회 기준 (실제 계산)
      </p>
      {PLANS.map((s) => (
        <div key={s.name} className="rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-3 py-2 flex items-center justify-between bg-gray-50 border-b border-gray-100">
            <p className="text-xs font-extrabold text-gray-800">{s.name}</p>
            <p className="text-[10px] font-bold text-gray-400">{s.note}</p>
          </div>
          {s.items.map((it, i) => (
            <div key={i} className="flex items-center gap-2 px-3 py-1.5 text-xs border-t border-gray-50">
              <span className="w-10 font-bold text-gray-400 shrink-0">{it.k}</span>
              <span className="flex-1 text-gray-700">{it.v}</span>
              <span className="font-bold text-gray-800 tabular-nums">
                {it.c === 0 ? '무료' : krw(it.c, R)}
              </span>
            </div>
          ))}
          <p className="px-3 py-2 text-xs font-extrabold text-indigo-600 bg-indigo-50/60 border-t border-indigo-100">
            합계 {krw(s.total, R)}
            {s.total > 0 && <span className="ml-1.5 font-bold text-gray-400">(${s.total.toFixed(4)})</span>}
          </p>
        </div>
      ))}
      <p className="text-[11px] text-amber-700 font-bold bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
        재생성 횟수만큼 곱해집니다. 장면당 3회 재생하면 ×3.
        영상은 '길이 × 단가'이므로 전체 60초에 AI 영상을 돌리면 수만 원이 됩니다.
      </p>
    </div>
  );
};

export default React.memo(ModelPricingModal);
