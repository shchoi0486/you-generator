import React, { useState } from 'react';
import { Upload, Link2, Zap, Hash, Clock, Loader2, X, Settings2, Check, FileText, ExternalLink, Sparkles } from 'lucide-react';
import { api, type ShortsReport, type AppContent, type Article, type RecipeOptions } from '../services/api';
import {
  FALLBACK_RECIPE_OPTIONS as RECIPE_FALLBACK,
  EMPTY_RECIPE_PRESET,
  type RecipePresetState,
} from '../constants/recipeOptions';

const CATEGORY_LABELS: Record<string, string> = {
  recipe_short: '요리 / 레시피',
  review_short: '제품 리뷰 / 추천',
  knowledge_short: '지식 / 정보',
  travel_short: '여행 / 브로그',
};

// 백엔드 /shorts/recipe-options 실패 시 폴백.
// 목록은 ../constants/recipeOptions 에서 공유한다 — 이 컴포넌트와
// VideoPresetPanel에 복붙돼 있어 한쪽만 고쳐 훅 2종이 누락된 버그가 났다.
const FALLBACK_RECIPE_OPTIONS = RECIPE_FALLBACK as unknown as RecipeOptions;

type RecipePresetOption = { id: string; name: string; desc: string };

interface ShortsLabProps {
  onComplete: (article: Article, content: AppContent) => void;
  mode: 'file' | 'youtube';
  setMode: (m: 'file' | 'youtube') => void;
  ytUrl: string;
  setYtUrl: (v: string) => void;
  hint: string;
  setHint: (v: string) => void;
  report: ShortsReport | null;
  setReport: (r: ShortsReport | null) => void;
  topic: string;
  setTopic: (v: string) => void;
  duration: number;
  category: string;
  onDirectCreate: (topic: string, duration: number, category: string, reference?: string) => void | Promise<void>;
  onAutoMake?: () => void;
  recipePreset?: RecipePresetState;
  setRecipePreset?: (p: RecipePresetState) => void;
  scriptId?: string;
  sourceRef?: string;
  setSourceRef?: (v: string) => void;
}

const ShortsLab: React.FC<ShortsLabProps> = ({
  onComplete,
  mode = 'file',
  setMode = () => {},
  ytUrl = '',
  setYtUrl = () => {},
  hint = '',
  setHint = () => {},
  report = null,
  setReport = () => {},
  topic = '',
  setTopic = () => {},
  duration = 60,
  category = 'recipe_short',
  onDirectCreate = () => {},
  onAutoMake,
  recipePreset = EMPTY_RECIPE_PRESET,
  setRecipePreset = () => {},
  scriptId = '',
  sourceRef = '',
  setSourceRef = () => {},
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [patternName, setPatternName] = useState('');
  const [, setLibRefresh] = useState(0);
  const [showPromptModal, setShowPromptModal] = useState(false);
  const [basePrompt, setBasePrompt] = useState('');
  const [basePromptName, setBasePromptName] = useState('');
  const [extraPrompt, setExtraPrompt] = useState('');
  const [promptSaving, setPromptSaving] = useState(false);
  // 모듈형 레시피 프롬프트 설정 (recipe_short 전용)
  const [recipeOptions, setRecipeOptions] = useState<typeof FALLBACK_RECIPE_OPTIONS | null>(null);
  const [presetDraft, setPresetDraft] = useState({ format: 'auto', style: 'realistic', platform: 'youtube', hook: 'random', preset: 'random', tone: '', structure: '', cta: '' });
  const [composedPreview, setComposedPreview] = useState('');
  const [resolvedFormatName, setResolvedFormatName] = useState('');
  // 원본 레시피 가져오기 (URL / 본문 직접 입력) — 뉴스 입력과 같은 UX
  const [sourceTab, setSourceTab] = useState<'none' | 'url' | 'text'>('none');
  const [sourceUrl, setSourceUrl] = useState('');
  const [sourceText, setSourceText] = useState('');
  const [sourceTitle, setSourceTitle] = useState('');
  const [sourceLoading, setSourceLoading] = useState(false);

  const fetchSourceUrl = async (): Promise<string> => {
    if (!sourceUrl.trim()) return sourceRef;
    setError(null);
    setSourceLoading(true);
    try {
      const data = await api.scrapeNews({ url: sourceUrl.trim() });
      const full = (data?.full_text as string) || '';
      if (!full.trim()) throw new Error('본문을 가져오지 못했습니다.');
      const rawTitle = ((data?.title as string) || '').trim();
      setSourceTitle(rawTitle);
      setSourceRef(full);
      // 주제가 비어 있으면 긁어온 제목으로 자동 입력 → 버튼 활성화
      if (!topic.trim() && rawTitle) {
        const cleaned = rawTitle
          .replace(/\s*:\s*네이버 블로그\s*$/i, '')
          .replace(/\s*-\s*네이버 블로그\s*$/i, '')
          .trim();
        if (cleaned) setTopic(cleaned);
      }
      return full;
    } catch (e) {
      setError((e as Error).message || 'URL 분석 중 오류가 발생했습니다.');
      return sourceRef;
    } finally {
      setSourceLoading(false);
    }
  };

  const loadComposedPreview = async (draft: { format: string; style: string; platform: string; hook?: string; preset?: string; tone?: string; structure?: string; cta?: string }) => {
    try {
      const r = await api.getRecipePromptPreview(
        draft.format || 'auto', draft.style || 'realistic', draft.platform || 'youtube',
        draft.hook || 'random', duration, draft.preset || 'random',
        draft.tone || undefined, draft.structure || undefined, draft.cta || undefined,
      );
      setComposedPreview(r?.prompt || '');
      setResolvedFormatName(r?.format?.id === draft.format ? '' : (r?.format?.name || ''));
    } catch {
      setComposedPreview('');
      setResolvedFormatName('');
    }
  };

  const openPromptModal = async () => {
    setShowPromptModal(true);
    setBasePrompt('');
    // 요리/레시피는 모듈형 프롬프트 설정 화면 (고정+포맷+스타일+플랫폼+추가 지시)
    if (category === 'recipe_short') {
      // 영상 구조 선택 UI 제거 — 길이에 맞춰 자동 결정으로 고정
      const draft = {
        format: 'auto',
        style: recipePreset.style,
        platform: recipePreset.platform,
        hook: recipePreset.hook || 'random',
        preset: recipePreset.preset || 'random',
        tone: recipePreset.tone || '',
        structure: recipePreset.structure || '',
        cta: recipePreset.cta || '',
      };
      setPresetDraft(draft);
      try {
        const o = await api.getRecipeOptions();
        if (o && o.formats) setRecipeOptions(o);
        else setRecipeOptions(FALLBACK_RECIPE_OPTIONS);
      } catch {
        setRecipeOptions(FALLBACK_RECIPE_OPTIONS);
      }
      setBasePromptName('레시피 기본 규칙 (CORE)');
      loadComposedPreview(draft);
      try {
        const cfg = await api.getConfig();
        // 서버 config는 '처음 한 번만' 초기값으로 쓴다. 이게 draft를 덮으면
        // 제작 설정에서 고른 프리셋이 프롬프트 확인 화면에서 '매번 변경'으로
        // 보이다가, 여기서 저장하면 제작 설정까지 되돌아간다(실측).
        // 순서: recipePreset(제작 설정) > 서버 config(신규 사용자에만 의미 있음).
        const saved = (cfg?.recipe_prompt_preset || {}) as Partial<typeof draft>;
        const railIsUntouched =
          !recipePreset.preset || recipePreset.preset === 'random';
        if (railIsUntouched && (saved.style || saved.platform || saved.preset)) {
          // 구 기본값 short_60 → auto 마이그레이션
          const savedFmt = saved.format || draft.format;
          const merged = {
            format: savedFmt === 'short_60' ? 'auto' : savedFmt,
            style: saved.style || draft.style,
            platform: saved.platform || draft.platform,
            hook: saved.hook || draft.hook || 'random',
            preset: saved.preset || draft.preset,
            tone: saved.tone ?? draft.tone,
            structure: saved.structure ?? draft.structure,
            cta: saved.cta ?? draft.cta,
          };
          setPresetDraft(merged);
          loadComposedPreview(merged);
        }
        const extras = (cfg?.category_extra_instructions || {}) as Record<string, string>;
        setExtraPrompt(extras[category] || '');
      } catch (e) {
        setError((e as Error).message || '프롬프트를 불러오지 못했습니다.');
      }
      return;
    }
    try {
      const t = await api.getPromptTemplate(category);
      setBasePromptName(t?.name || '');
      setBasePrompt(t?.instructions || '');
      const cfg = await api.getConfig();
      const extras = (cfg?.category_extra_instructions || {}) as Record<string, string>;
      setExtraPrompt(extras[category] || '');
    } catch (e) {
      setError((e as Error).message || '프롬프트를 불러오지 못했습니다.');
    }
  };

  const saveRecipePreset = async () => {
    setPromptSaving(true);
    try {
      const toSave = { ...presetDraft, format: 'auto' };
      setRecipePreset(toSave);
      const cfg = await api.getConfig();
      const extras = { ...((cfg?.category_extra_instructions || {}) as Record<string, string>) };
      if (extraPrompt.trim()) {
        extras[category] = extraPrompt.trim();
      } else {
        delete extras[category];
      }
      await api.updateConfig({ ...(cfg || {}), category_extra_instructions: extras, recipe_prompt_preset: toSave });
      setShowPromptModal(false);
    } catch (e) {
      setError((e as Error).message || '프롬프트 저장에 실패했습니다.');
    } finally {
      setPromptSaving(false);
    }
  };

  const saveExtraPrompt = async () => {
    setPromptSaving(true);
    try {
      const cfg = await api.getConfig();
      const extras = { ...((cfg?.category_extra_instructions || {}) as Record<string, string>) };
      if (extraPrompt.trim()) {
        extras[category] = extraPrompt.trim();
      } else {
        delete extras[category];
      }
      await api.updateConfig({ ...(cfg || {}), category_extra_instructions: extras });
    } catch (e) {
      setError((e as Error).message || '프롬프트 저장에 실패했습니다.');
    } finally {
      setPromptSaving(false);
    }
  };

  const loadPatterns = (): Array<{ name: string; savedAt: string; report: ShortsReport }> => {
    try {
      const raw = localStorage.getItem('shorts-patterns');
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  };

  const handleAnalyze = async () => {
    setError(null);
    setAnalyzing(true);
    try {
      let data: ShortsReport | null = null;
      if (mode === 'file') {
        if (!file) return;
        data = await api.analyzeShortsMedia(file, hint);
      } else {
        if (!ytUrl.trim()) return;
        data = await api.analyzeShortsUrl(ytUrl.trim());
      }
      setReport(data);
    } catch (e) {
      setError((e as Error).message || '분석 중 오류가 발생했습니다.');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleCreate = async () => {
    if (!report || !topic.trim()) return;
    setError(null);
    setCreating(true);
    try {
      const content = await api.createShorts({
        reference: JSON.stringify(report),
        new_topic: topic.trim(),
        duration,
        category,
        ...(scriptId ? { script_id: scriptId } : {}),
        ...(category === 'recipe_short' ? {
          ...(recipePreset.format && recipePreset.format !== 'auto' ? { format_id: recipePreset.format } : {}),
          style_id: recipePreset.style,
          platform_id: recipePreset.platform,
          hook_id: recipePreset.hook || 'random',
          preset_id: recipePreset.preset || 'random',
          ...(recipePreset.tone ? { tone_id: recipePreset.tone } : {}),
          ...(recipePreset.structure ? { structure_id: recipePreset.structure } : {}),
          ...(recipePreset.cta ? { cta_id: recipePreset.cta } : {}),
        } : {}),
      });
      const contentTyped = content as AppContent;
      const title = contentTyped.title || topic.trim().slice(0, 50);
      onComplete(
        { title, full_text: `${title}\n\n[벤치마킹 패턴]\n${report.hook_summary || ''}\n${(report.why_it_works || []).join('\n')}` },
        contentTyped,
      );
    } catch (e) {
      setError((e as Error).message || '대본 생성 중 오류가 발생했습니다.');
    } finally {
      setCreating(false);
    }
  };

  const handleDirectCreate = async () => {
    if (!topic.trim() || creating) return;
    setCreating(true);
    try {
      let ref = sourceRef;
      if (sourceTab === 'url') {
        ref = await fetchSourceUrl();
      } else if (sourceTab === 'text') {
        ref = sourceText;
        setSourceRef(sourceText);
      }
      await onDirectCreate(topic.trim(), duration, category, ref);
    } finally {
      setCreating(false);
    }
  };

  const handleSavePattern = () => {
    if (!report) return;
    const name = patternName.trim() || (report.hook_summary || '이름 없는 패턴').slice(0, 30);
    const lib = loadPatterns().filter((p) => p.name !== name);
    lib.unshift({ name, savedAt: new Date().toISOString(), report });
    try {
      localStorage.setItem('shorts-patterns', JSON.stringify(lib.slice(0, 30)));
    } catch {
      setError('보관함 저장 공간이 부족합니다.');
      return;
    }
    setPatternName('');
    setLibRefresh((v) => v + 1);
  };

  const handleLoadPattern = (name: string) => {
    const found = loadPatterns().find((p) => p.name === name);
    if (found) setReport(found.report);
  };

  const handleDeletePattern = (name: string) => {
    const lib = loadPatterns().filter((p) => p.name !== name);
    try {
      localStorage.setItem('shorts-patterns', JSON.stringify(lib));
    } catch {
      setError('보관함 저장 공간이 부족합니다.');
      return;
    }
    setLibRefresh((v) => v + 1);
  };

  // 프리셋이 지정한 축과 개별 오버라이드 중 실제로 적용될 값을 화면에 보여준다.
  // 출처를 나눠야 한다: presetDraft는 '프롬프트 확인' 모달을 열어야 갱신되는 로컬
  // 복사본이라, 모달 밖에서 읽으면 항상 초기값(매번 변경)이 showed다(실측).
  // 모달이 열려 있으면 편집 중인 draft를, 닫혀 있으면 제작 설정의 진실을 보여준다.
  const _opts = recipeOptions || FALLBACK_RECIPE_OPTIONS;
  const _src = showPromptModal ? presetDraft : recipePreset;
  const _nameOf = (list: Array<{ id: string; name: string }> | undefined, id?: string) =>
    (id ? list?.find((x) => x.id === id)?.name : undefined) || '';
  const _preset = _opts.presets.find((p) => p.id === (_src.preset || 'random')) as
    (RecipePresetOption & { tone?: string; structure?: string; hook?: string; cta?: string }) | undefined;
  const _isRandomPreset = !_preset || !_preset.tone;
  const _fallback = (label: string) => (_isRandomPreset ? '생성 시 무작위' : label);
  // 요약에는 옛 프리셋 이름(읽어주기 낭독 등) 대신 '톤 + 전개' 로 보여준다.
  // 12장 카드가 6톤 + 2칩으로 접혔으므로, 이름만 보면 무엇을 고른 건지 안 보인다.
  const _fam = _opts.families?.find((f) => f.variants.some((v) => v.preset === _src.preset));
  const _var = _fam?.variants.find((v) => v.preset === _src.preset);
  const activePresetName = (_src.preset || 'random') === 'random'
    ? '매번 다르게'
    : (_fam ? `${_fam.name} · ${_var?.name ?? ''}`.trim() : '매번 변경');
  const activeToneName = _fam?.name || _nameOf(_opts.tones, _src.tone || _preset?.tone)
    || _fallback('프리셋 지정대로');
  const activeStructureName = _var?.name
    || _nameOf(_opts.structures, _src.structure || _preset?.structure)
    || _fallback('프리셋 지정대로');
  const activeHookName = _nameOf(_opts.hooks, _src.hook || _preset?.hook) || _fallback('프리셋 지정대로');
  const activeCtaName = _nameOf(_opts.ctas, _src.cta || _preset?.cta) || _fallback('프리셋 지정대로');

  return (
    <div className="space-y-6">
      {/* 패턴 보관함 */}
      {(() => {
        const lib = loadPatterns();
        if (lib.length === 0) return null;
        return (
          <div className="p-4 bg-gray-50 border border-gray-100 rounded-xl space-y-2">
            <p className="text-xs font-black text-gray-500">내 패턴 보관함 ({lib.length})</p>
            <div className="flex flex-wrap gap-1.5">
              {lib.map((p) => (
                <span key={p.name} className="flex items-center gap-1 pl-2.5 pr-1 py-1 bg-white border border-gray-200 rounded-lg text-[11px] font-bold text-gray-700">
                  <button onClick={() => handleLoadPattern(p.name)} title="불러오기" className="hover:text-indigo-600">{p.name}</button>
                  <button onClick={() => handleDeletePattern(p.name)} title="삭제" className="p-0.5 text-gray-300 hover:text-red-500">
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          </div>
        );
      })()}

      {/* 바로 만들기 */}
      <div className="p-4 bg-indigo-50/60 border border-indigo-100 rounded-xl space-y-3">
        <div className="flex items-center gap-2">
          <p className="text-sm font-bold text-gray-800 flex-1">주제로 바로 만들기 <span className="text-[11px] font-medium text-gray-400">(분석 없이 카테고리 기본 패턴으로 생성)</span></p>
          {category === 'recipe_short' && (
            <span
              title={`선택한 대본 프리셋: ${activePresetName}`}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold border border-indigo-200 bg-indigo-50 text-indigo-700"
            >
              <Sparkles size={12} /> {activePresetName}
            </span>
          )}
          <button
            onClick={openPromptModal}
            title="프롬프트 확인/수정"
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold border border-gray-200 bg-white text-gray-500 hover:border-indigo-300 hover:text-indigo-600 transition-all"
          >
            <Settings2 size={13} /> 프롬프트 확인/수정
          </button>
        </div>
        <input
          type="text"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="주제 입력 (예: 된장찌개 레시피)"
          className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm outline-none focus:border-indigo-500"
        />
        {/* 원본 레시피 가져오기 (선택) — URL 분석 또는 본문 직접 입력 */}
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2">
            <FileText size={14} className="text-indigo-500 shrink-0" />
            <span className="text-xs font-bold text-gray-700">원본 레시피</span>
            <span className="text-[10px] text-gray-400 font-medium">블로그·사이트 URL 또는 직접 입력한 레시피를 토대로 생성</span>
            <div className="flex ml-auto bg-gray-100 p-0.5 rounded-lg shrink-0">
              {([
                { id: 'none', label: '사용 안 함' },
                { id: 'url', label: 'URL 입력' },
                { id: 'text', label: '본문 직접 입력' },
              ] as const).map((t) => (
                <button
                  key={t.id}
                  onClick={() => setSourceTab(t.id)}
                  className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-all ${sourceTab === t.id ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          {sourceTab === 'url' && (
            <div className="px-3 pb-3 space-y-2 border-t border-gray-100 pt-2">
              <div className="relative">
                <input
                  type="text"
                  value={sourceUrl}
                  onChange={(e) => setSourceUrl(e.target.value)}
                  placeholder="https://blog.naver.com/... 레시피 주소를 입력하세요..."
                  className="w-full px-4 py-2.5 bg-white border-2 border-gray-300 rounded-xl focus:border-indigo-500 outline-none transition-all text-sm font-medium"
                />
                <ExternalLink size={16} className="absolute right-4 top-3 text-gray-400" />
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={fetchSourceUrl}
                  disabled={sourceLoading || !sourceUrl.trim()}
                  className="px-4 py-1.5 bg-white border border-indigo-200 text-indigo-600 rounded-lg text-xs font-bold hover:bg-indigo-50 disabled:bg-gray-100 disabled:text-gray-400 disabled:border-gray-200 transition-all"
                >
                  {sourceLoading ? '불러오는 중...' : '불러오기'}
                </button>
                {sourceTitle && <span className="text-[11px] font-bold text-gray-600 truncate flex-1">{sourceTitle}</span>}
                {sourceRef && sourceTitle && (
                  <span className="text-[10px] font-bold text-gray-400 tabular-nums shrink-0">{sourceRef.length.toLocaleString()}자 확보</span>
                )}
              </div>
            </div>
          )}
          {sourceTab === 'text' && (
            <div className="px-3 pb-3 border-t border-gray-100 pt-2">
              <textarea
                value={sourceText}
                onChange={(e) => { setSourceText(e.target.value); setSourceRef(e.target.value); }}
                placeholder="예시: 김치피자탕수육 레시피... 재료와 조리 순서를 그대로 붙여넣으세요"
                className="w-full h-28 px-4 py-3 bg-white border-2 border-gray-300 rounded-xl focus:border-indigo-500 outline-none transition-all text-sm resize-none font-medium"
              />
              <p className="text-[10px] font-bold text-gray-400 tabular-nums text-right">{sourceText.length.toLocaleString()}자</p>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          {/* 영상 길이는 제작 설정이 단일 주인이다. 여기서는 읽기 전용으로만 표시한다. */}
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold border border-indigo-200 bg-indigo-50 text-indigo-700">
            <Clock size={12} /> {duration}초
            <span className="font-medium text-indigo-400">· 제작 설정에서 변경</span>
          </span>
          <button
            onClick={handleDirectCreate}
            disabled={creating || !topic.trim()}
            className="ml-auto flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 disabled:bg-gray-200 transition-all"
          >
            {creating ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
            바로 만들기
          </button>
          {onAutoMake && (
            <button
              onClick={onAutoMake}
              disabled={creating || !topic.trim()}
              title="주제 입력부터 최종 영상까지 자동으로 만듭니다 (첫 후보 자동 선택)"
              className="flex items-center gap-2 px-6 py-2.5 bg-amber-500 text-white rounded-xl font-bold text-sm hover:bg-amber-600 disabled:bg-gray-200 shadow-lg shadow-amber-100 transition-all"
            >
              <Zap size={16} />
              자동으로 끝까지 만들기
            </button>
          )}
        </div>
      </div>

      {/* Mode Tabs */}
      <div className="flex bg-gray-100 p-1 rounded-lg w-fit">
        <button
          onClick={() => { setMode('file'); setReport(null); }}
          className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 ${mode === 'file' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
        >
          <Upload size={14} /> 파일 업로드
        </button>
        <button
          onClick={() => { setMode('youtube'); setReport(null); }}
          className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 ${mode === 'youtube' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
        >
          <Link2 size={14} /> 유튜브 링크
        </button>
      </div>

      {/* Input Area */}
      {mode === 'file' ? (
        <div className="space-y-3">
          <label className="block border-2 border-dashed border-gray-300 rounded-xl p-6 text-center cursor-pointer hover:border-indigo-400 transition-all">
            <input
              type="file"
              accept="image/*,video/mp4,video/webm,video/quicktime"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
            <Upload size={20} className="mx-auto text-gray-400 mb-2" />
            <p className="text-sm font-bold text-gray-700">{file ? file.name : '이미지/영상 파일 선택 (최대 100MB)'}</p>
            <p className="text-[11px] text-gray-400 mt-1">요리·제품홍보 레퍼런스 영상을 그대로 분석합니다</p>
          </label>
          <input
            type="text"
            value={hint}
            onChange={(e) => setHint(e.target.value)}
            placeholder="힌트 (선택, 예: 김치찌개 레시피 릴스)"
            className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm outline-none focus:border-indigo-500"
          />
        </div>
      ) : (
        <div className="space-y-2">
          <input
            type="text"
            value={ytUrl}
            onChange={(e) => setYtUrl(e.target.value)}
            placeholder="https://www.youtube.com/shorts/... (YouTube만 지원)"
            className="w-full px-5 py-3 bg-white border-2 border-gray-300 rounded-xl focus:border-indigo-500 outline-none transition-all text-sm font-medium"
          />
          <p className="text-[11px] text-gray-400">자막+메타데이터 기반 분석. 인스타/틱톡은 지원하지 않습니다.</p>
        </div>
      )}

      <button
        onClick={handleAnalyze}
        disabled={analyzing || (mode === 'file' ? !file : !(ytUrl || '').trim())}
        className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 disabled:bg-gray-200 transition-all"
      >
        {analyzing ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
        레퍼런스 분석하기
      </button>

      {error && (
        <div className="p-4 bg-red-50 border border-red-100 rounded-xl text-red-600 text-xs font-bold">{error}</div>
      )}

      {/* Report */}
      {report && (
        <div className="space-y-4 bg-gray-50 rounded-2xl p-5 border border-gray-100">
          <div>
            <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-1">Hook Summary</p>
            <p className="text-sm font-bold text-gray-800">{report.hook_summary || '-'}</p>
            {(report.hook_first3s?.length ?? 0) > 0 && (
              <ul className="mt-1 space-y-0.5">
                {report.hook_first3s!.map((h, i) => (
                  <li key={i} className="text-xs text-gray-600">· {h}</li>
                ))}
              </ul>
            )}
          </div>

          {(report.content_pattern?.length ?? 0) > 0 && (
            <div>
              <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-1">Content Pattern</p>
              <div className="space-y-1.5">
                {report.content_pattern!.map((p, i) => (
                  <div key={i} className="text-xs bg-white rounded-lg px-3 py-2 border border-gray-100">
                    <span className="font-black text-indigo-600">{i + 1}. {p.phase}</span>
                    <span className="text-gray-400 font-bold"> ({p.label})</span>
                    <p className="text-gray-600 mt-0.5">{p.detail}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              { label: '조회수', value: report.stats?.views },
              { label: '좋아요', value: report.stats?.likes },
              { label: '댓글', value: report.stats?.comments },
            ].map((s) => (
              <div key={s.label} className="bg-white rounded-lg py-2 border border-gray-100">
                <p className="text-[10px] font-bold text-gray-400">{s.label}</p>
                <p className="text-sm font-black text-gray-800 tabular-nums">
                  {s.value ? Number(s.value).toLocaleString() : '-'}
                </p>
              </div>
            ))}
          </div>
          {report.stats_note && <p className="text-[10px] text-gray-400">{report.stats_note}</p>}

          {(report.why_it_works?.length ?? 0) > 0 && (
            <div>
              <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-1">왜 반응했나</p>
              <ul className="space-y-0.5">
                {report.why_it_works!.map((w, i) => (
                  <li key={i} className="text-xs text-gray-600">· {w}</li>
                ))}
              </ul>
            </div>
          )}

          {(report.hashtags?.length ?? 0) > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {report.hashtags!.map((h, i) => (
                <span key={i} className="text-[11px] font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded-md flex items-center gap-0.5">
                  <Hash size={10} />{h.replace(/^#/, '')}
                </span>
              ))}
            </div>
          )}

          {(report.tone || report.suggested_duration) && (
            <p className="text-xs text-gray-500 flex items-center gap-1.5">
              <Clock size={12} /> 톤: {report.tone || '-'} · 권장 길이: {report.suggested_duration || '-'}초
            </p>
          )}

          {/* Create from pattern */}
          <div className="pt-3 border-t border-gray-200 space-y-3">
            <p className="text-sm font-bold text-gray-800">
              이 패턴으로 새로 만들기
              <span className="ml-2 text-[11px] font-bold text-indigo-600">· {CATEGORY_LABELS[category] || category}</span>
            </p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={patternName}
                onChange={(e) => setPatternName(e.target.value)}
                placeholder="패턴 이름 (예: 17세 비행기 훅)"
                className="flex-1 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs outline-none focus:border-indigo-500"
              />
              <button
                onClick={handleSavePattern}
                className="shrink-0 px-3 py-1.5 bg-white border border-indigo-200 text-indigo-600 rounded-lg text-[11px] font-bold hover:bg-indigo-50 transition-all"
              >
                패턴 저장
              </button>
            </div>
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="새 주제 입력 (예: 된장찌개 레시피)"
              className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm outline-none focus:border-indigo-500"
            />
            <div className="flex items-center gap-3">
              {/* 길이 선택은 '제작 설정'의 단일 셀렉터가 유일한 진실이다.
                  여기에도 버튼을 두면 같은 상태를 두 곳에서 고치게 되고,
                  값도 어긋났다(여기는 15/30/40/60, 제작 설정은 30/60/180/300/600). */}
              <button
                onClick={handleCreate}
                disabled={creating || !topic.trim()}
                className="ml-auto flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 disabled:bg-gray-200 transition-all"
              >
                {creating ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
                대본 생성
              </button>
            </div>
          </div>
        </div>
      )}
      {showPromptModal && (
        <div
          className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setShowPromptModal(false)}
        >
          <div
            className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100">
              <Settings2 size={16} className="text-indigo-600" />
              <p className="text-sm font-bold text-gray-800 flex-1">
                프롬프트 확인/수정 · {basePromptName || CATEGORY_LABELS[category] || category}
              </p>
              <button onClick={() => setShowPromptModal(false)} className="p-1 text-gray-400 hover:text-gray-700">
                <X size={16} />
              </button>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto">
              {category === 'recipe_short' ? (
                <>
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-2.5 flex items-center gap-2">
                    <Check size={14} className="text-emerald-600 shrink-0" />
                    <p className="text-xs font-bold text-emerald-800">
                      고정 프롬프트 · 레시피 기본 규칙 (CORE) 적용 중
                    </p>
                  </div>
                  <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-[11px] font-bold leading-relaxed text-gray-500">
                    🎬 영상 구조: 자동 (길이 {duration}초{resolvedFormatName ? ` → ${resolvedFormatName} 구조` : ''}) · 시간·장면 구성은 제작 설정의 영상 길이를 따릅니다
                  </div>
                  <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 px-4 py-3">
                    <p className="text-xs font-bold text-indigo-800 mb-1.5">현재 대본 설정</p>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-indigo-900">
                      <span>프리셋: <b>{activePresetName}</b></span>
                      <span>톤: <b>{activeToneName}</b></span>
                      <span>구조: <b>{activeStructureName}</b></span>
                      <span>훅: <b>{activeHookName}</b></span>
                      <span>스타일: <b>{(recipeOptions || FALLBACK_RECIPE_OPTIONS).styles.find((s) => s.id === presetDraft.style)?.name || presetDraft.style}</b></span>
                      <span>플랫폼: <b>{(recipeOptions || FALLBACK_RECIPE_OPTIONS).platforms.find((p) => p.id === presetDraft.platform)?.name || presetDraft.platform}</b></span>
                      <span className="col-span-2">CTA: <b>{activeCtaName}</b></span>
                    </div>
                    <p className="text-[10px] text-indigo-400 mt-1.5">프리셋·스타일·톤·구조·훅·CTA 변경은 제작 설정 레일의 「대본 다양화」에서 하세요</p>
                  </div>
                  <details className="rounded-xl border border-gray-200 bg-gray-50 overflow-hidden">
                    <summary className="px-4 py-2.5 text-xs font-bold text-gray-500 cursor-pointer hover:text-indigo-600">
                      조합된 프롬프트 미리보기 (프리셋: {activePresetName} · 읽기 전용)
                    </summary>
                    <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap px-4 py-3 border-t border-gray-200 text-[11px] text-gray-600">
                      {composedPreview || '불러오는 중...'}
                    </pre>
                  </details>
                  <div className="space-y-1.5">
                    <p className="text-xs font-bold text-gray-700">■ 추가 지시 (항상 덧붙임)</p>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { label: '+ 자취생 밈 스타일', text: '자취생 눈높이의 B급 밈과 드립을 섞어서 써줘.' },
                        { label: '+ 1분 빠른 레시피', text: '전체 분량을 60초 안에 끝내고, 각 단계는 10초 이내로 압축해줘.' },
                        { label: '+ ASMR/음성 집중', text: '지글거림·바삭함 같은 소리 묘사를 대사에 적극 넣어줘.' },
                        { label: '+ 감성 요리', text: '따뜻하고 감성적인 분위기로, 여유 있는 말투로 써줘.' },
                      ].map((t) => (
                        <button
                          key={t.label}
                          onClick={() => setExtraPrompt((prev) => (prev ? prev.replace(/\s+$/, '') + '\n' : '') + t.text)}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-bold border border-indigo-200 bg-indigo-50/60 text-indigo-600 hover:bg-indigo-100 transition-all"
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                    <textarea
                      value={extraPrompt}
                      onChange={(e) => setExtraPrompt(e.target.value)}
                      placeholder="예: 자취생 눈높이로 써줘, 밈을 섞어줘 (비우면 기본 조합만 사용)"
                      rows={3}
                      className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-xs outline-none focus:border-indigo-500 resize-y"
                    />
                  </div>
                </>
              ) : (
                <>
              <div className="space-y-1.5">
                <p className="text-xs font-bold text-gray-500">고정 프롬프트 (읽기 전용)</p>
                <pre className="w-full max-h-56 overflow-y-auto whitespace-pre-wrap px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-[11px] text-gray-600">
                  {basePrompt || '불러오는 중...'}
                </pre>
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-bold text-gray-700">추가 지시 (이 카테고리에 항상 덧붙임)</p>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { label: '+ 자취생 밈 스타일', text: '자취생 눈높이의 B급 밈과 드립을 섞어서 써줘.' },
                    { label: '+ 1분 빠른 레시피', text: '전체 분량을 60초 안에 끝내고, 각 단계는 10초 이내로 압축해줘.' },
                    { label: '+ ASMR/음성 집중', text: '지글거림·바삭함 같은 소리 묘사를 대사에 적극 넣어줘.' },
                    { label: '+ 자취생 1분 ASMR 세트', text: '[카테고리: 자취생 밈 · 1분 레시피 · ASMR]\n- 목표 길이 60초(±3초), 장면 8~10개.\n- 자취생 제약: 도구는 프라이팬/에어프라이어/전자레인지/냄비 중 1~2개, 재료 6개 이하, 설거지 최소, 마트·편의점에서 구할 수 있는 재료만 쓴다.\n- 톤: 자취생 공감 밈("월세 내고 남은 통장 잔고" 류)을 전체에서 2개 이하로 쓴다. 매 문장 남발하지 말고, 특정인·집단 비하 표현은 금지한다.\n- ASMR/음성 집중: 나레이션은 한 문장 15자 내외로 짧게 쓴다. 지글지글/바삭/치즈 늘어나는 소리가 핵심인 장면은 나레이션을 비우고(narration_ko: ""), 계량은 subtitle_ko로 처리한다. sfx 필드에 장면별 핵심 소리를 구체적으로 적고, BGM은 없거나 아주 낮게 둔다.' },
                  ].map((t) => (
                    <button
                      key={t.label}
                      onClick={() => setExtraPrompt((prev) => (prev ? prev.replace(/\s+$/, '') + '\n' : '') + t.text)}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-bold border border-indigo-200 bg-indigo-50/60 text-indigo-600 hover:bg-indigo-100 transition-all"
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                <textarea
                  value={extraPrompt}
                  onChange={(e) => setExtraPrompt(e.target.value)}
                  placeholder="예: 자취생 눈높이로 써줘, 밈을 섞어줘 (비우면 기본 프롬프트만 사용)"
                  rows={4}
                  className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl text-xs outline-none focus:border-indigo-500 resize-y"
                />
              </div>
                </>
              )}
            </div>
            <div className="flex items-center gap-2 px-5 py-4 border-t border-gray-100">
              {category !== 'recipe_short' && (
              <button
                onClick={() => setExtraPrompt('')}
                className="px-4 py-2 bg-white border border-gray-200 text-gray-500 rounded-xl text-xs font-bold hover:border-gray-300"
              >
                기본값으로 복원
              </button>
              )}
              <button
                onClick={category === 'recipe_short' ? saveRecipePreset : saveExtraPrompt}
                disabled={promptSaving}
                className="ml-auto px-5 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 disabled:bg-gray-200"
              >
                {promptSaving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default React.memo(ShortsLab);
