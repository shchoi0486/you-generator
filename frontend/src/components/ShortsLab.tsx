import React, { useState } from 'react';
import { Upload, Link2, Zap, Hash, Clock, Loader2, X, Settings2 } from 'lucide-react';
import { api, type ShortsReport, type AppContent, type Article } from '../services/api';

const CATEGORY_LABELS: Record<string, string> = {
  recipe_short: '요리 / 레시피',
  review_short: '제품 리뷰 / 추천',
  knowledge_short: '지식 / 정보',
  travel_short: '여행 / 브이로그',
};

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
  setDuration: (v: number) => void;
  category: string;
  setCategory: (v: string) => void;
  onDirectCreate: (topic: string, duration: number, category: string) => void;
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
  duration = 40,
  setDuration = () => {},
  category = 'recipe_short',
  onDirectCreate = () => {},
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

  const openPromptModal = async () => {
    setShowPromptModal(true);
    setBasePrompt('');
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
    await onDirectCreate(topic.trim(), duration, category);
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
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            {[15, 30, 40, 60].map((s) => (
              <button
                key={s}
                onClick={() => setDuration(s)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all ${duration === s ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'bg-white border-gray-100 text-gray-400'}`}
              >
                {s}초
              </button>
            ))}
          </div>
          <button
            onClick={handleDirectCreate}
            disabled={creating || !topic.trim()}
            className="ml-auto flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 disabled:bg-gray-200 transition-all"
          >
            {creating ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
            바로 만들기
          </button>
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
              <div className="flex items-center gap-1.5">
                {[15, 30, 40, 60].map((s) => (
                  <button
                    key={s}
                    onClick={() => setDuration(s)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all ${duration === s ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'bg-white border-gray-100 text-gray-400'}`}
                  >
                    {s}초
                  </button>
                ))}
              </div>
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
            </div>
            <div className="flex items-center gap-2 px-5 py-4 border-t border-gray-100">
              <button
                onClick={() => setExtraPrompt('')}
                className="px-4 py-2 bg-white border border-gray-200 text-gray-500 rounded-xl text-xs font-bold hover:border-gray-300"
              >
                기본값으로 복원
              </button>
              <button
                onClick={saveExtraPrompt}
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
