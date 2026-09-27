import React from 'react';
import {
  Loader2, AlertTriangle, Info, Zap, Check, Wallet, Film, ImageIcon,
  Volume2, Type, Pin, KeyRound, ExternalLink, Trash2, Eye, EyeOff, Play,
} from 'lucide-react';
import { api, type ProviderPlan, type ProviderPlanRow } from '../services/api';

/**
 * 대본 / 이미지 / 영상 / 음성 — 카드 4개, 2열.
 *
 *  계층 (이게 핵심)
 *    카드 (대본/이미지/…)
 *      └ 프로바이더  ← 키를 가진 곳. Google Gemini / Pexels / fal.ai …
 *          └ 상세 모델  ← 그 키가 여는 것. Nano Banana 2 Lite / Sora 2 Pro …
 *
 *    예전에는 키 목록과 모델 목록이 따로 있어서 "이 키로 뭐가 열리지?" 를
 *    매번 짝을 맞춰야 했다. 지금은 프로바이더가 Detailed 모델의 머리이다.
 *
 *  무료 / 유료
 *    카드 머리에 [무료 n] [유료 n] 버튼. 누르면 그 항목만 펼친다.
 *    '무엇이 무료지 / 얼마인지' 가 사용자의 진짜 질문이고,
 *    예전의 티어 탭은 그 질문에 답을 못 했다.
 *
 *  과금
 *    켜는 건 무료. 실제로 생성할 때만 과금되고 그때도 1순위만 쓴다.
 *    정렬이 '고정 > 무료 > 싼 순' 이므로 아무것도 안 골라도 0원 경로가 1순위.
 */

const KIND_META: Record<string, {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  blurb: string;
}> = {
  llm: { icon: Type, blurb: '대본 문장' },
  image: { icon: ImageIcon, blurb: '장면 그림' },
  video: { icon: Film, blurb: '장면 영상 (i2v)' },
  tts: { icon: Volume2, blurb: '음성' },
};

/** 2열 배치. Z 모양 읽기 순서 = 대본 → 이미지 → 영상 → 음성 */
const COL1 = ['llm', 'video'];
const COL2 = ['image', 'tts'];

interface KeyGroup {
  key_env: string | null;
  label: string;
  uses: string;
  signup: string | null;
  required: boolean;
  tier_hint: string;
  kind: 'secret' | 'url' | 'plain' | 'none';
  has_key: boolean;
  masked: string | null;
  models: ProviderPlanRow[];
}

interface Props {
  plan: ProviderPlan | null;
  loading: boolean;
  onRefresh: () => void | Promise<void>;
  scenes: number;
  onScenes: (n: number) => void;
  i2vScenes: number;
  onI2v: (n: number) => void;
  onTestTTS: (label: string) => void | Promise<void>;
}

const ModelPlanCard: React.FC<Props> = ({
  plan, loading, onRefresh, scenes, onScenes, i2vScenes, onI2v, onTestTTS,
}) => {
  const [openKey, setOpenKey] = React.useState<Record<string, boolean>>({});
  const [busy, setBusy] = React.useState<Record<string, boolean>>({});
  const [warn, setWarn] = React.useState<Record<string, string[]>>({});
  const [msg, setMsg] = React.useState<Record<string, { ok: boolean; text: string }>>({});
  const [draft, setDraft] = React.useState<Record<string, string>>({});
  const [reveal, setReveal] = React.useState<Record<string, boolean>>({});

  const order = plan?.kind_order?.length ? plan.kind_order : ['llm', 'image', 'video', 'tts'];

  const toggleModel = async (kind: string, r: ProviderPlanRow) => {
    setBusy((b) => ({ ...b, [r.id]: true }));
    setWarn((w) => { const x = { ...w }; delete x[r.id]; return x; });
    try {
      const res = await api.toggleProvider(kind, r.id, !r.enabled);
      if (res.warnings?.length) setWarn((w) => ({ ...w, [r.id]: res.warnings }));
      await onRefresh();
    } catch (e) {
      setWarn((w) => ({ ...w, [r.id]: [(e as Error).message] }));
    } finally { setBusy((b) => ({ ...b, [r.id]: false })); }
  };

  const pinModel = async (kind: string, r: ProviderPlanRow, pin: boolean) => {
    setBusy((b) => ({ ...b, [r.id]: true }));
    try {
      if (pin && !r.enabled) await api.toggleProvider(kind, r.id, true);
      await api.pinProvider(kind, r.id, pin);
      await onRefresh();
    } catch (e) {
      setWarn((w) => ({ ...w, [r.id]: [(e as Error).message] }));
    } finally { setBusy((b) => ({ ...b, [r.id]: false })); }
  };

  // 메시지는 '누른 카드'에만 보여야 한다.
  // 같은 키가 대본·이미지·영상 3개 카드에 있으므로 key_env 만으로 저장하면
  // 한 번 저장했더니 메시지가 3곳에 똑같이 떴다.
  const msgKey = (kind: string, g: KeyGroup) => `${kind}/${g.key_env ?? 'nokey'}`;

  const saveKey = async (kind: string, g: KeyGroup) => {
    if (!g.key_env) return;
    const value = (draft[g.key_env] ?? '').trim();
    const mk = msgKey(kind, g);
    if (!value) { setMsg((m) => ({ ...m, [mk]: { ok: false, text: '키를 입력하세요.' } })); return; }
    setBusy((b) => ({ ...b, [g.key_env!]: true }));
    try {
      const r = await api.saveProviderKey(g.key_env, value);
      setDraft((d) => ({ ...d, [g.key_env!]: '' }));
      setMsg((m) => ({ ...m, [mk]: { ok: true, text: r.message } }));
      await onRefresh();
    } catch (e) {
      setMsg((m) => ({ ...m, [mk]: { ok: false, text: (e as Error).message } }));
    } finally { setBusy((b) => ({ ...b, [g.key_env!]: false })); }
  };

  const checkKey = async (kind: string, g: KeyGroup) => {
    if (!g.key_env) return;
    const value = (draft[g.key_env] ?? '').trim();
    const mk = msgKey(kind, g);
    if (!value) { setMsg((m) => ({ ...m, [mk]: { ok: false, text: '검증할 키를 입력하세요.' } })); return; }
    setBusy((b) => ({ ...b, [g.key_env!]: true }));
    setMsg((m) => ({ ...m, [mk]: { ok: true, text: '검증 중...' } }));
    try {
      const r = await api.validateProviderKey(g.key_env, value);
      setMsg((m) => ({ ...m, [mk]: { ok: !!r.ok, text: r.message || (r.ok ? '정상입니다.' : '실패') } }));
    } catch (e) {
      setMsg((m) => ({ ...m, [mk]: { ok: false, text: (e as Error).message } }));
    } finally { setBusy((b) => ({ ...b, [g.key_env!]: false })); }
  };

  const removeKey = async (kind: string, g: KeyGroup) => {
    if (!g.key_env) return;
    const mk = msgKey(kind, g);
    setBusy((b) => ({ ...b, [g.key_env!]: true }));
    try {
      const r = await api.saveProviderKey(g.key_env, '');
      setMsg((m) => ({ ...m, [mk]: { ok: true, text: r.message } }));
      await onRefresh();
    } catch (e) {
      setMsg((m) => ({ ...m, [mk]: { ok: false, text: (e as Error).message } }));
    } finally { setBusy((b) => ({ ...b, [g.key_env!]: false })); }
  };

  const enableAll = async (kind: string, g: KeyGroup) => {
    if (!g.key_env) return;
    const mk = msgKey(kind, g);
    setBusy((b) => ({ ...b, [g.key_env!]: true }));
    try {
      const r = await api.autoEnableProviders(g.key_env);
      setMsg((m) => ({ ...m, [mk]: {
        ok: true, text: r.count ? `${r.count}개 켰습니다` : '켜둘 모델이 없습니다(코드 없음).',
      } }));
      await onRefresh();
    } catch (e) {
      setMsg((m) => ({ ...m, [mk]: { ok: false, text: (e as Error).message } }));
    } finally { setBusy((b) => ({ ...b, [g.key_env!]: false })); }
  };

  if (loading && !plan) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 flex items-center justify-center gap-2 text-xs text-gray-400">
        <Loader2 size={14} className="animate-spin" /> 불러오는 중...
      </div>
    );
  }
  if (!plan) return null;

  const shared = {
    plan, openKey, setOpenKey, busy, warn, msg, draft,
    setDraft, reveal, setReveal, onToggleModel: toggleModel, onPin: pinModel,
    onSaveKey: saveKey, onCheckKey: checkKey, onRemoveKey: removeKey,
    onEnableAll: enableAll, onTestTTS,
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {/* ── 공통 헤더 ─────────────────────────────────────── */}
      <div className="px-4 py-3.5 border-b border-gray-100 bg-gray-50/50">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center text-violet-600">
              <Wallet size={16} />
            </div>
            <div>
              <h3 className="text-[13px] font-bold text-gray-800">모델 선택</h3>
              <p className="text-[10.5px] text-gray-500">
                프로바이더(키) 아래에 그 키가 여는 상세 모델이 나옵니다.
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[9.5px] text-gray-400 font-bold uppercase">이미지·영상·음성</p>
            <p className={`text-lg font-black tabular-nums leading-tight ${
              plan.fixed_krw > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
              {plan.fixed_krw.toLocaleString()}원
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 mt-3 flex-wrap">
          <NumField label="장면 수" value={scenes} min={1} max={30} onChange={onScenes} />
          <NumField label="i2v 장면" value={i2vScenes} min={0} max={30} onChange={onI2v} />
        </div>

        <p className={`mt-2.5 text-[10.5px] px-2.5 py-1.5 rounded-lg border flex items-start gap-1.5 ${
          plan.has_cost
            ? 'text-amber-700 bg-amber-50 border-amber-200'
            : 'text-emerald-700 bg-emerald-50 border-emerald-200'}`}>
          {plan.has_cost
            ? <AlertTriangle size={11} className="mt-0.5 shrink-0" />
            : <Check size={11} className="mt-0.5 shrink-0" />}
          <span>{plan.cost_warning}</span>
        </p>
      </div>

      {/* ── 2열 카드 ───────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-0">
        <div className="min-w-0 lg:border-r border-gray-100">
          {order.filter((k) => COL1.includes(k) && plan.kinds[k]).map((kind) => (
            <KindCard key={kind} kind={kind} {...shared} />
          ))}
        </div>
        <div className="min-w-0">
          {order.filter((k) => COL2.includes(k) && plan.kinds[k]).map((kind) => (
            <KindCard key={kind} kind={kind} {...shared} />
          ))}
        </div>
      </div>
    </div>
  );
};

type Shared = {
  plan: ProviderPlan;
  openKey: Record<string, boolean>;
  setOpenKey: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  busy: Record<string, boolean>;
  warn: Record<string, string[]>;
  msg: Record<string, { ok: boolean; text: string }>;
  draft: Record<string, string>;
  setDraft: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  reveal: Record<string, boolean>;
  setReveal: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  onToggleModel: (kind: string, r: ProviderPlanRow) => void;
  onPin: (kind: string, r: ProviderPlanRow, pin: boolean) => void;
  onSaveKey: (kind: string, g: KeyGroup) => void;
  onCheckKey: (kind: string, g: KeyGroup) => void;
  onRemoveKey: (kind: string, g: KeyGroup) => void;
  onEnableAll: (kind: string, g: KeyGroup) => void;
  onTestTTS: (label: string) => void | Promise<void>;
};

/** 종류 1개 = 카드 1장 */
const KindCard: React.FC<Shared & { kind: string }> = ({ kind, ...p }) => {
  const info = p.plan.kinds[kind];
  const meta = KIND_META[kind];
  const Icon = meta?.icon ?? Zap;
  const total = p.plan.totals[kind];
  const separate = total?.billed === 'separate';

  // 필터를 두지 않는다. 각 줄에 이미 '무료 / 27원 / 별도' 가 붙어 있어서
  // 칩은 같은 정보를 두 번 보여줄 뿐이었고, 켜/off 색이 비슷해서
  // 어느 쪽이 선택됐는지 오히려 헷갈렸다. 전부 보이게 하고 가격 라벨로 구분한다.

  const groups = [...info.key_groups, ...(info.key_groups_rest ?? [])]
    .filter((g) => g.models.length > 0);

  return (
    <section className="border-b border-gray-100 last:border-b-0">
      {/* 카드 머리 */}
      <div className="px-4 pt-3.5 pb-2.5 bg-white">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
            <Icon size={14} className="text-gray-600" />
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="text-[13px] font-bold text-gray-900 leading-tight">
              {info.label}
            </h4>
            <p className="text-[9.5px] text-gray-400 leading-tight">{meta?.blurb}</p>
          </div>
          <span className={`text-[11px] font-black tabular-nums shrink-0 ${
            separate ? 'text-gray-500' : (total?.krw ?? 0) > 0
              ? 'text-amber-600' : 'text-emerald-600'}`}>
            {separate ? '별도과금'
              : (total?.krw ?? 0) > 0 ? `${(total?.krw ?? 0).toLocaleString()}원`
                : '0원'}
          </span>
        </div>

        <div className="flex items-center gap-1.5 mt-2 flex-wrap text-[9.5px]">
          <span className="text-gray-500">
            전체 <b className="text-gray-700">{info.model_count}</b>종
          </span>
          {separate ? (
            // 대본은 장당 가격이 아니라 토큰 과금이라 무료/유료로 나눌 수 없다.
            // 0/0 으로 표시하면 '뭔가 깨졌네' 하고 보여서 따로 쓴다.
            <span className="text-gray-500 font-bold">별도 과금 {info.model_count}</span>
          ) : (
            <>
              <span className="text-emerald-600 font-bold">무료 {info.free_count}</span>
              <span className="text-amber-600 font-bold">유료 {info.paid_count}</span>
            </>
          )}
          <span className="text-gray-400">· 켜짐 {info.model_on}</span>
          <span className="text-gray-400">· 키 {info.key_count}개</span>
        </div>
      </div>

      {/* 카드 본문 */}
      <div className="px-3 pb-3 space-y-2">
        {kind === 'llm' && (
          <Note tone="blue">
            대본은 <b>토큰 사용량</b>에 비례해 과금됩니다(장당 비용 없음).
          </Note>
        )}
        {kind === 'video' && (
          <Note tone="amber">
            무료 경로는 <b>Ken Burns 하나</b>뿐입니다. i2v {info.paid_count}종은 전부 유료
            키가 필요하며, <b>실제 생성 1회도 아직 검증하지 않았습니다.</b>
          </Note>
        )}

        {groups.map((g) => (
          <ProviderBlock
            key={g.key_env ?? 'nokey'} g={g} kind={kind} total={total} p={p}
            firstLabel={total?.first ?? null}
          />
        ))}
      </div>
    </section>
  );
};

/** 프로바이더(키) 블록 + 그 아래 상세 모델들 */
const ProviderBlock: React.FC<{
  g: KeyGroup; kind: string; total: { first: string | null } | undefined;
  p: Shared; firstLabel: string | null;
  }> = ({ g, kind, p, firstLabel }) => {
  const kid = g.key_env ?? '';
  const mk = `${kind}/${kid}`;
  const isUrl = g.kind === 'url';
  const isPlain = g.kind === 'plain';
  const nOn = g.models.filter((m) => m.enabled).length;
  const isOpen = !!p.openKey[kid];

  return (
    <div className={`rounded-xl border overflow-hidden ${
      g.has_key ? 'border-gray-200' : 'border-dashed border-gray-300'}`}>
      {/* ── 프로바이더 머리 ── */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 bg-gray-50 border-b border-gray-200">
        <KeyRound size={12} className={g.has_key ? 'text-emerald-600' : 'text-gray-400'} />
        <span className="text-[11px] font-extrabold text-gray-800">{g.label}</span>
        <span className={`text-[8.5px] font-black px-1 py-px rounded ${
          g.has_key ? 'text-emerald-700 bg-emerald-100' : 'text-gray-500 bg-gray-200'}`}>
          {g.has_key ? '키 있음' : '키 필요'}
        </span>
        {g.required && (
          <span className="text-[8.5px] font-black text-indigo-600 bg-indigo-50 px-1 rounded">필수</span>
        )}
        {g.has_key && g.masked && (
          <span className="text-[9px] font-mono text-gray-400 truncate">{g.masked}</span>
        )}
        <span className="flex-1" />
        {g.signup && (
          <span onClick={(e) => { e.stopPropagation(); window.open(g.signup!, '_blank'); }}
            className="p-0.5 text-gray-400 hover:text-indigo-600" title="발급" role="button" tabIndex={0}>
            <ExternalLink size={11} />
          </span>
        )}
        {kid && (
          <button onClick={() => p.setOpenKey((o) => ({ ...o, [kid]: !o[kid] }))}
            className="px-1.5 py-0.5 text-[9.5px] font-bold text-indigo-600 hover:underline">
            {isOpen ? '닫기' : g.has_key ? '키 변경' : '키 입력'}
          </button>
        )}
      </div>

      {/* 키 입력 */}
      {isOpen && kid && (
        <div className="px-2 py-2 space-y-1.5 bg-white border-b border-gray-100">
          <div className="flex gap-1">
            <div className="relative flex-1">
              <input
                type={isUrl || isPlain || p.reveal[kid] ? 'text' : 'password'}
                value={p.draft[kid] ?? ''}
                onChange={(e) => p.setDraft((d) => ({ ...d, [kid]: e.target.value }))}
                onKeyDown={(e) => { if (e.key === 'Enter') p.onSaveKey(kind, g); }}
                placeholder={g.has_key ? '새 값으로 교체' : '키를 붙여넣으세요'}
                autoComplete="off" spellCheck={false} aria-label={`${g.label} 키`}
                className="w-full px-2 py-1 pr-7 bg-white border border-gray-200 rounded text-[10.5px] font-mono outline-none focus:border-indigo-400"
              />
              {!isUrl && !isPlain && (
                <button onClick={() => p.setReveal((r) => ({ ...r, [kid]: !r[kid] }))}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400"
                  aria-label="키 보기">
                  {p.reveal[kid] ? <EyeOff size={12} /> : <Eye size={12} />}
                </button>
              )}
            </div>
            <button onClick={() => p.onSaveKey(kind, g)} disabled={p.busy[kid] || !p.draft[kid]?.trim()}
              className="px-2 py-1 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-200 text-white text-[10px] font-bold rounded shrink-0">
              {p.busy[kid] ? <Loader2 size={10} className="animate-spin" /> : '저장'}
            </button>
          </div>
          <div className="flex items-center gap-1 flex-wrap">
            {!isUrl && !isPlain && (
              <button onClick={() => p.onCheckKey(kind, g)} disabled={p.busy[kid]}
                className="px-1.5 py-0.5 bg-white border border-gray-200 text-gray-600 text-[9.5px] font-bold rounded flex items-center gap-0.5">
                <Zap size={9} /> 검증
              </button>
            )}
            {g.has_key && nOn < g.models.length && (
              <button onClick={() => p.onEnableAll(kind, g)} disabled={p.busy[kid]}
                className="px-1.5 py-0.5 bg-emerald-50 border border-emerald-200 text-emerald-700 text-[9.5px] font-bold rounded flex items-center gap-0.5">
                <Check size={9} /> 전부 켜기
              </button>
            )}
            {g.has_key && p.onTestTTS && /tts|음성/i.test(g.uses + g.label) && (
              <button onClick={() => p.onTestTTS(g.label)}
                className="px-1.5 py-0.5 bg-white border border-gray-200 text-violet-700 text-[9.5px] font-bold rounded flex items-center gap-0.5">
                <Play size={9} /> 미리듣기
              </button>
            )}
            {g.has_key && (
              <button onClick={() => p.onRemoveKey(kind, g)} disabled={p.busy[kid]}
                className="px-1.5 py-0.5 text-gray-400 hover:text-red-600 text-[9.5px] font-bold rounded flex items-center gap-0.5 ml-auto">
                {p.busy[kid] ? <Loader2 size={9} className="animate-spin" /> : <Trash2 size={9} />} 삭제
              </button>
            )}
          </div>
          {p.msg[mk] && (
            <p className={`text-[9.5px] px-1.5 py-1 rounded border flex items-start gap-1 ${
              p.msg[mk].ok ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                           : 'text-red-700 bg-red-50 border-red-200'}`}>
              {p.msg[mk].ok && <Check size={9} className="mt-0.5 shrink-0" />}
              <span>{p.msg[mk].text}</span>
            </p>
          )}
        </div>
      )}

      {/* ── 상세 모델 (프로바이더 아래) ── */}
      <div className="pl-2 pr-1.5 py-1 space-y-px">
        {g.models.map((r) => (
          <ModelRow
            key={r.id} r={r} kind={kind} p={p}
            isFirst={firstLabel === r.id}
            warn={p.warn[r.id]}
          />
        ))}
      </div>
    </div>
  );
};

/** 상세 모델 1줄 — 왼쪽 세로선으로 프로바이더와 연결한다 */
const ModelRow: React.FC<{
  r: ProviderPlanRow; kind: string; p: Shared; isFirst: boolean;
  warn?: string[];
}> = ({ r, kind, p, isFirst, warn }) => {
  return (
    <div className="relative pl-2.5">
      {/* 프로바이더 연결선 */}
      <span className="absolute left-0 top-0 bottom-0 w-px bg-gray-200" aria-hidden />
      <span className="absolute left-0 top-1/2 w-1.5 h-px bg-gray-200" aria-hidden />
      <div className={`flex items-center gap-1.5 px-1.5 py-1 rounded-md ${
        isFirst ? 'bg-violet-50' : r.ready ? 'bg-emerald-50/50' : ''}`}>
        {isFirst ? <Pin size={10} className="text-violet-600 shrink-0" />
          : r.ready ? <Check size={10} className="text-emerald-600 shrink-0" />
            : <span className="w-[10px] shrink-0" />}
        <span className={`text-[10.5px] font-semibold truncate min-w-0 ${
          r.ready || r.enabled ? 'text-gray-800' : 'text-gray-400'}`}>
          {r.label}
        </span>
        {isFirst && (
          <span className="text-[8px] font-black text-violet-700 bg-violet-100 px-1 rounded shrink-0">1순위</span>
        )}
        {r.modes.includes('i2i') && (
          <span className={`text-[8px] font-black px-1 rounded shrink-0 ${
            r.i2i_verified ? 'text-emerald-600 bg-emerald-50' : 'text-amber-600 bg-amber-50'}`}>
            i2i{r.i2i_verified ? '✓' : ' 미검증'}
          </span>
        )}
        {r.adapter_state === 'config' && (
          <span className="text-[8px] font-black text-blue-600 bg-blue-50 px-1 rounded shrink-0">설정</span>
        )}
        {r.adapter_state === 'stub' && (
          <span className="text-[8px] font-black text-gray-400 bg-gray-100 px-1 rounded shrink-0">코드없음</span>
        )}
        <span className="flex-1" />
        <span className={`text-[9.5px] font-bold tabular-nums shrink-0 ${
          r.cost_krw == null ? 'text-gray-400'
            : r.cost_krw > 0 ? 'text-amber-700' : 'text-emerald-600'}`}>
          {r.cost_krw == null ? '별도'
            : r.cost_krw > 0 ? `${r.cost_krw.toLocaleString()}원` : '무료'}
        </span>
        {r.adapter_state === 'yes' && !isFirst && (
          <button onClick={() => p.onPin(kind, r, true)}
            disabled={p.busy[r.id] || (r.needs_key && !r.has_key)}
            className="p-0.5 text-gray-300 hover:text-violet-600 disabled:opacity-30 shrink-0"
            title="1순위로" aria-label={`${r.label} 1순위로`}>
            <Pin size={9} />
          </button>
        )}
        {isFirst && r.pinned && (
          <button onClick={() => p.onPin(kind, r, false)}
            className="p-0.5 text-violet-500 hover:text-gray-500 shrink-0"
            title="고정 해제" aria-label={`${r.label} 고정 해제`}>
            <Pin size={9} />
          </button>
        )}
        <button
          onClick={() => p.onToggleModel(kind, r)}
          disabled={p.busy[r.id] || r.adapter_state !== 'yes' || (r.needs_key && !r.has_key)}
          title={r.adapter_state !== 'yes'
            ? (r.adapter_state === 'config' ? '프로바이더 설정에서 관리합니다' : '연결 코드가 아직 없습니다')
            : r.needs_key && !r.has_key ? '먼저 키를 등록하세요'
              : r.enabled ? '끄기' : '켜기'}
          className={`w-6.5 h-3 rounded-full relative shrink-0 transition-colors disabled:opacity-40 ${
            r.enabled ? 'bg-emerald-500' : 'bg-gray-200'}`}
          aria-label={`${r.label} ${r.enabled ? '끄기' : '켜기'}`}>
          <span className={`absolute top-0.5 w-2 h-2 bg-white rounded-full transition-all ${
            r.enabled ? 'left-3.5' : 'left-0.5'}`} />
        </button>
      </div>
      {warn && (
        <p className="mt-0.5 text-[9px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
          {warn.join(' / ')}
        </p>
      )}
      {r.enabled && r.notes && (
        <p className="text-[8.5px] text-gray-400 px-1.5 pb-0.5 leading-relaxed">{r.notes}</p>
      )}
    </div>
  );
};

/** 작은 안내 상자 */
const Note: React.FC<{ tone: 'blue' | 'amber'; children: React.ReactNode }> =
  ({ tone, children }) => (
    <p className={`text-[9.5px] px-2 py-1.5 rounded-lg border flex items-start gap-1 ${
      tone === 'blue'
        ? 'text-blue-700 bg-blue-50 border-blue-200'
        : 'text-amber-700 bg-amber-50 border-amber-200'}`}>
      {tone === 'blue'
        ? <Info size={10} className="mt-0.5 shrink-0" />
        : <AlertTriangle size={10} className="mt-0.5 shrink-0" />}
      <span>{children}</span>
    </p>
  );

/** 숫자 입력 */
const NumField: React.FC<{ label: string; value: number; min: number; max: number;
  onChange: (n: number) => void }> = ({ label, value, min, max, onChange }) => (
  <label className="flex items-center gap-1.5 text-[10.5px] text-gray-500">
    {label}
    <input type="number" min={min} max={max} value={value}
      onChange={(e) => {
        const n = parseInt(e.target.value, 10);
        if (!isNaN(n) && n >= min && n <= max) onChange(n);
      }}
      aria-label={label}
      className="w-12 px-1.5 py-0.5 border border-gray-200 rounded text-[11px] text-center tabular-nums" />
  </label>
);

export default React.memo(ModelPlanCard);
