import React from 'react';
import {
  ChevronDown, Eye, EyeOff, Loader2, Trash2, ExternalLink, Zap,
  Check, AlertTriangle, ShieldCheck, Search, X, Play, Lock,
} from 'lucide-react';
import { api, type ProviderKeyRow, type ProviderKeyList } from '../services/api';

/**
 * 프로바이더별 API 키 설정 (설정 화면 핵심).
 *
 *  설계 목표
 *   - 스크롤을 최소화한다. 16개 키 항목을 전부 펼쳐두면 화면이 3~4屏 된다.
 *     그래서 '한 줄 = 한 프로바이더' 로 접어 두고, 필요한 것만 펼친다.
 *   - 같은 프로바이더의 키와 그 프로바이더 전용 설정(모델 순서·간격 등)을
 *     같은 드롭다운 안에 넣는다. 사용자가 'FAL' 을 열면 FAL 키와
 *     FAL 관련 설정이 한 곳에 모인다.
 *   - 상태를 정직하게 보여준다. '키는 있는데 쓸 모델이 0개' 인 경우를
 *     '설정됨' 으로 표시하면 안 된다(실제로 그랬다).
 *
 *  저장은 언제나 암호화 저장소(key_store)로 한다.
 *  settings.yaml 평문 저장은 하지 않는다(빌드에 실릴 수 있다).
 */

export type KeyStatus = 'none' | 'saved' | 'usable' | 'broken';

interface Props {
  data: ProviderKeyList | null;
  loading: boolean;
  onRefresh: () => void | Promise<void>;
  /** 프로바이더별로 그 프로바이더 전용 설정을 그리는 슬롯 */
  extras?: Record<string, React.ReactNode>;
  /** TTS 미리듣기 등 전역 액션 */
  onTestTTS?: (keyId: string) => void | Promise<void>;
}

const STATUS_META: Record<KeyStatus, { label: string; cls: string; dot: string }> = {
  none: { label: '미등록', cls: 'text-gray-500 bg-gray-100 border-gray-200', dot: 'bg-gray-400' },
  saved: { label: '키만 있음', cls: 'text-amber-700 bg-amber-50 border-amber-200', dot: 'bg-amber-500' },
  usable: { label: '사용 가능', cls: 'text-emerald-700 bg-emerald-50 border-emerald-200', dot: 'bg-emerald-500' },
  broken: { label: '사용 불가', cls: 'text-red-700 bg-red-50 border-red-200', dot: 'bg-red-500' },
};

function statusOf(k: ProviderKeyRow): KeyStatus {
  if (k.kind === 'url' || k.kind === 'plain') return k.has_key ? 'saved' : 'none';
  if (k.has_key && k.usable_count > 0) return 'usable';
  if (k.has_key) return 'saved';
  return 'none';
}

const ProviderKeySections: React.FC<Props> = ({ data, loading, onRefresh, extras, onTestTTS }) => {
  const [open, setOpen] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<Record<string, string>>({});
  const [reveal, setReveal] = React.useState<Record<string, boolean>>({});
  const [busy, setBusy] = React.useState<Record<string, string>>({});
  const [msg, setMsg] = React.useState<Record<string, { ok: boolean; text: string }>>({});
  const [note, setNote] = React.useState<Record<string, string>>({});
  const [q, setQ] = React.useState('');

  const keys = data?.keys ?? [];
  const registered = keys.filter((k) => k.has_key).length;
  const usable = keys.filter((k) => k.usable_count > 0).length;

  const filtered = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return keys;
    return keys.filter((k) =>
      [k.label, k.id, k.uses, k.tier_hint]
        .filter(Boolean)
        .some((s) => String(s).toLowerCase().includes(needle)));
  }, [keys, q]);

  const setBusyOn = (id: string, v: string) => setBusy((b) => ({ ...b, [id]: v }));

  const save = async (k: ProviderKeyRow) => {
    const value = (draft[k.id] ?? '').trim();
    if (!value) {
      setMsg((m) => ({ ...m, [k.id]: { ok: false, text: '키를 입력하세요.' } }));
      return;
    }
    setBusyOn(k.id, 'save');
    try {
      const r = await api.saveProviderKey(k.id, value);
      setDraft((d) => ({ ...d, [k.id]: '' }));
      setMsg((m) => ({ ...m, [k.id]: { ok: true, text: r.message } }));
      setNote((n) => {
        const x = { ...n };
        if (r.format_note) x[k.id] = r.format_note; else delete x[k.id];
        return x;
      });
      await onRefresh();
    } catch (e) {
      setMsg((m) => ({ ...m, [k.id]: { ok: false, text: (e as Error).message } }));
    } finally { setBusyOn(k.id, ''); }
  };

  const remove = async (k: ProviderKeyRow) => {
    setBusyOn(k.id, 'del');
    try {
      const r = await api.saveProviderKey(k.id, '');
      setMsg((m) => ({ ...m, [k.id]: { ok: true, text: r.message } }));
      await onRefresh();
    } catch (e) {
      setMsg((m) => ({ ...m, [k.id]: { ok: false, text: (e as Error).message } }));
    } finally { setBusyOn(k.id, ''); }
  };

  const check = async (k: ProviderKeyRow) => {
    const value = (draft[k.id] ?? '').trim();
    if (!value) {
      setMsg((m) => ({ ...m, [k.id]: { ok: false, text: '검증할 키를 입력하세요.' } }));
      return;
    }
    setBusyOn(k.id, 'check');
    setMsg((m) => ({ ...m, [k.id]: { ok: true, text: '검증 중...' } }));
    try {
      const r = await api.validateProviderKey(k.id, value);
      setMsg((m) => ({ ...m, [k.id]: { ok: !!r.ok, text: r.message || (r.ok ? '정상입니다.' : '실패') } }));
      if (r.format_note) setNote((n) => ({ ...n, [k.id]: r.format_note as string }));
    } catch (e) {
      setMsg((m) => ({ ...m, [k.id]: { ok: false, text: (e as Error).message } }));
    } finally { setBusyOn(k.id, ''); }
  };

  const enableAll = async (k: ProviderKeyRow) => {
    setBusyOn(k.id, 'on');
    try {
      const r = await api.autoEnableProviders(k.id);
      setMsg((m) => ({
        ...m,
        [k.id]: {
          ok: true,
          text: r.count
            ? `${r.count}개 켬: ${r.enabled.join(', ')}`
            : '이 키로 켤 수 있는 모델이 없습니다(어댑터 미구현).',
        },
      }));
      await onRefresh();
    } catch (e) {
      setMsg((m) => ({ ...m, [k.id]: { ok: false, text: (e as Error).message } }));
    } finally { setBusyOn(k.id, ''); }
  };

  const toggle = (id: string) => {
    setOpen((cur) => (cur === id ? null : id));
    setMsg((m) => { const n = { ...m }; delete n[id]; return n; });
  };

  return (
    <div className="bg-white rounded-3xl shadow-2xl shadow-gray-200/40 border border-gray-100 flex flex-col overflow-hidden">
      {/* 헤더: 진행도 요약 + 검색 */}
      <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50 shrink-0">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
              <ShieldCheck size={18} />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-bold text-gray-900 leading-tight">프로바이더 API 키</h3>
              <p className="text-[11px] text-gray-500 leading-tight">
                전체 {keys.length}종 중 <b className="text-emerald-600">{usable}종 사용 가능</b>
                {registered > usable && (
                  <> · 등록만 {registered - usable}종(모델 어댑터 없음)</>
                )}
              </p>
            </div>
          </div>
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="프로바이더 검색"
              aria-label="프로바이더 검색"
              className="w-40 md:w-52 pl-7 pr-7 py-1.5 bg-white border border-gray-200 rounded-lg text-xs outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100"
            />
            {q && (
              <button
                onClick={() => setQ('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"
                aria-label="검색 지우기"
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>
        {data?.security && !data.security.encrypted && (
          <p className="mt-2 text-[10px] text-red-600 font-bold flex items-center gap-1">
            <AlertTriangle size={11} /> 암호화 저장소가 초기화되지 않았습니다.
          </p>
        )}
      </div>

      {/* 목록: 한 줄 = 한 프로바이더 */}
      <div className="divide-y divide-gray-50">
        {loading && !keys.length && (
          <p className="py-6 text-center text-xs text-gray-400">불러오는 중...</p>
        )}
        {!loading && !filtered.length && (
          <p className="py-6 text-center text-xs text-gray-400">
            {q ? `'${q}' 에 해당하는 프로바이더가 없습니다.` : '키 항목이 없습니다.'}
          </p>
        )}

        {filtered.map((k) => {
          const st = statusOf(k);
          const meta = STATUS_META[st];
          const isOpen = open === k.id;
          const isUrl = k.kind === 'url';
          const isPlain = k.kind === 'plain';
          const b = busy[k.id] || '';
          const m = msg[k.id];
          return (
            <div key={k.id} className={isOpen ? 'bg-indigo-50/25' : ''}>
              {/* ── 접힌 한 줄 ── */}
              <button
                onClick={() => toggle(k.id)}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left hover:bg-gray-50 transition-colors"
                aria-expanded={isOpen}
              >
                <ChevronDown
                  size={15}
                  className={`text-gray-400 transition-transform shrink-0 ${isOpen ? 'rotate-180' : ''}`}
                />
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${meta.dot}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[13px] font-bold text-gray-800">{k.label}</span>
                    {k.required && (
                      <span className="text-[9px] font-black text-indigo-600 bg-indigo-50 px-1 rounded">필수</span>
                    )}
                    <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border ${meta.cls}`}>
                      {meta.label}
                    </span>
                    {k.has_key && (
                      <span className="text-[10px] font-mono text-gray-400 truncate max-w-[130px]">
                        {k.masked}
                      </span>
                    )}
                  </div>
                  {k.uses && (
                    <p className="text-[10.5px] text-gray-500 truncate">{k.uses}</p>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {k.usable_count > 0 && (
                    <span className="text-[10px] font-bold text-emerald-600 tabular-nums">
                      {k.usable_count}종
                    </span>
                  )}
                  {k.signup && (
                    <span
                      onClick={(e) => { e.stopPropagation(); window.open(k.signup!, '_blank'); }}
                      className="p-1 text-gray-400 hover:text-indigo-600"
                      title="발급받으러 가기"
                      role="button"
                      tabIndex={0}
                    >
                      <ExternalLink size={12} />
                    </span>
                  )}
                </div>
              </button>

              {/* ── 펼친 내용 ── */}
              {isOpen && (
                <div className="px-4 pb-4 pt-1 space-y-3">
                  {/* 키가 있는데 쓸 모델이 없을 때 (숨기면 안 된다) */}
                  {k.has_key && k.usable_count === 0 && (
                    <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-start gap-1.5">
                      <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                      <span>
                        키는 등록됐지만 <b>바로 쓸 수 있는 모델이 없습니다.</b>{' '}
                        {k.enables_count > 0
                          ? '모델 코드가 아직 없어서 켜도 소용없습니다.'
                          : '이 키를 쓰는 항목이 없습니다.'}
                      </span>
                    </p>
                  )}

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-gray-500 flex items-center gap-1.5">
                      {isUrl ? '프록시 URL' : isPlain ? '계정 ID' : 'API 키'}
                      <span className="text-[9px] font-normal text-gray-400">
                        {isUrl ? '(비밀값 아님)' : isPlain ? '(공개 값)' : ''}
                      </span>
                    </label>
                    <div className="flex gap-1.5">
                      <div className="relative flex-1">
                        <input
                          type={isUrl || isPlain || reveal[k.id] ? 'text' : 'password'}
                          value={draft[k.id] ?? ''}
                          onChange={(e) => setDraft((d) => ({ ...d, [k.id]: e.target.value }))}
                          onKeyDown={(e) => { if (e.key === 'Enter') save(k); }}
                          placeholder={k.has_key ? '새 값으로 교체' : (k.tier_hint || '키를 붙여넣으세요')}
                          autoComplete="off"
                          spellCheck={false}
                          aria-label={`${k.label} ${isUrl ? 'URL' : '키'}`}
                          className="w-full px-3 py-2 pr-9 bg-white border border-gray-200 rounded-lg text-xs outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 font-mono"
                        />
                        {!isUrl && !isPlain && (
                          <button
                            onClick={() => setReveal((s) => ({ ...s, [k.id]: !s[k.id] }))}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-indigo-600"
                            aria-label="키 보기/숨기기"
                          >
                            {reveal[k.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                          </button>
                        )}
                      </div>
                      <button
                        onClick={() => save(k)}
                        disabled={!!b || !(draft[k.id] ?? '').trim()}
                        className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-200 disabled:text-gray-400 text-white text-[11px] font-bold rounded-lg shrink-0 transition-colors"
                      >
                        {b === 'save' ? <Loader2 size={13} className="animate-spin" /> : '저장'}
                      </button>
                    </div>
                  </div>

                  {/* 액션 행 */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {!isUrl && !isPlain && (
                      <button
                        onClick={() => check(k)}
                        disabled={!!b}
                        className="px-2.5 py-1.5 bg-white border border-gray-200 hover:border-indigo-300 text-gray-600 text-[11px] font-bold rounded-lg flex items-center gap-1 transition-colors"
                      >
                        {b === 'check' ? <Loader2 size={11} className="animate-spin" /> : <Zap size={11} />}
                        검증
                      </button>
                    )}
                    {k.has_key && k.usable_count > 0 && (
                      <button
                        onClick={() => enableAll(k)}
                        disabled={!!b}
                        className="px-2.5 py-1.5 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 text-emerald-700 text-[11px] font-bold rounded-lg flex items-center gap-1 transition-colors"
                      >
                        {b === 'on' ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                        사용할 모델 켜기
                      </button>
                    )}
                    {onTestTTS && /tts|음성/i.test(k.uses ?? '') && (
                      <button
                        onClick={() => onTestTTS(k.id)}
                        disabled={!k.has_key}
                        className="px-2.5 py-1.5 bg-white border border-gray-200 hover:border-violet-300 text-violet-700 text-[11px] font-bold rounded-lg flex items-center gap-1 disabled:opacity-40 transition-colors"
                      >
                        <Play size={11} /> 미리듣기
                      </button>
                    )}
                    {k.has_key && (
                      <button
                        onClick={() => remove(k)}
                        disabled={!!b}
                        className="px-2.5 py-1.5 text-gray-400 hover:text-red-600 text-[11px] font-bold rounded-lg flex items-center gap-1 ml-auto transition-colors"
                      >
                        {b === 'del' ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
                        삭제
                      </button>
                    )}
                  </div>

                  {/* 결과 메시지 */}
                  {m && (
                    <p className={`text-[10.5px] font-medium px-2.5 py-1.5 rounded-lg border ${
                      m.ok ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                          : 'text-red-700 bg-red-50 border-red-200'}`}>
                      {m.text}
                    </p>
                  )}

                  {/* 형식 경고: 막지는 않는다. 실제 호출이 최종 판정이다. */}
                  {note[k.id] && (
                    <p className="text-[10.5px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 flex items-start gap-1.5">
                      <AlertTriangle size={11} className="mt-0.5 shrink-0" />
                      <span>{note[k.id]}</span>
                    </p>
                  )}

                  {/* 이 키로 쓸 수 있는 모델 */}
                  {k.usable_count > 0 && (
                    <div className="flex flex-wrap gap-1 pt-0.5">
                      {k.usable_now.map((id) => (
                        <span key={id} className="text-[9.5px] font-mono px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                          {id}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* 이 프로바이더 전용 설정 (모델 순서, 간격 등) */}
                  {extras?.[k.id] && (
                    <div className="pt-2 mt-1 border-t border-dashed border-gray-200">
                      {extras[k.id]}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50/50 shrink-0">
        <p className="text-[10px] text-gray-500 leading-relaxed flex items-start gap-1.5">
          <Lock size={11} className="mt-0.5 shrink-0 text-gray-400" />
          <span>
            키는 이 PC 의 암호화 저장소(Fernet)에만 저장됩니다. 설정 파일이나 빌드에
            포함되지 않으며, 다른 사용자에게 전달되지 않습니다.
            {data?.security?.store_path && (
              <> 위치: <code className="text-[9px]">{data.security.store_path}</code></>
            )}
          </span>
        </p>
      </div>
    </div>
  );
};

export default React.memo(ProviderKeySections);
