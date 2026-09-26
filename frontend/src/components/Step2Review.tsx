import React from 'react';
import { FileText, Clock, ChevronRight } from 'lucide-react';
import { type AppContent, type Article, type ScriptItem } from '../services/api';

interface Step2ReviewProps {
  article: Article | null;
  content: AppContent | null;
  duration: number;
  handleGenerate: () => void;
  setContent: (content: AppContent | null) => void;
  setAudio: (audio: { url?: string; srtUrl?: string; audio_path?: string; srt_path?: string; [key: string]: unknown } | null) => void;
  setAudioScriptSig: (sig: string | null) => void;
  getTimelineRange: (data: ScriptItem[] | undefined, idx: number) => { start: string, end: string, duration: string };
  setCurrentStep: (step: number) => void;
  loading: boolean;
}

const Step2Review: React.FC<Step2ReviewProps> = ({
  article,
  content,
  duration,
  handleGenerate,
  setContent,
  setAudio,
  setAudioScriptSig,
  getTimelineRange,
  setCurrentStep,
  loading
}) => {
  if (!article) return null;

  return (
    <div className="flex-1 flex flex-col min-h-0 space-y-4 overflow-hidden">
      {!content ? (
        <div className="flex-1 flex flex-col min-h-0 space-y-4 overflow-y-auto custom-scrollbar pr-2 pb-6">
          <div className="flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                <FileText size={20} />
              </div>
              <h2 className="text-xl font-bold text-gray-900">대본 및 장면 가이드 생성</h2>
            </div>
          </div>

          <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100 shrink-0">
            <h3 className="text-lg font-bold text-gray-900 mb-2">{article.title}</h3>
            <p className="text-gray-600 text-sm leading-relaxed max-h-48 overflow-y-auto custom-scrollbar">
              {article.full_text}
            </p>
          </div>

          <div className="bg-indigo-50/50 rounded-2xl p-4 border border-indigo-100 flex items-center justify-between gap-4 shrink-0">
            <label className="text-sm font-bold text-indigo-900 flex items-center gap-2 shrink-0">
              <Clock size={16} /> 예상 영상 길이: <span className="text-indigo-600">{duration}초</span>
              <span className="text-[11px] font-medium text-indigo-400">· 제작 설정에서 변경</span>
            </label>
            <div className="flex flex-wrap gap-2 justify-end">
              <button 
                onClick={handleGenerate}
                disabled={loading}
                className="ml-4 px-6 py-2 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 disabled:bg-gray-200 shadow-lg shadow-indigo-100 transition-all flex items-center gap-2"
              >
                대본 및 장면 가이드 생성하기
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-h-0 space-y-4 overflow-hidden">
          <div className="flex items-center justify-between shrink-0 bg-white z-10 py-1">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                <FileText size={20} />
              </div>
              <h2 className="text-xl font-bold text-gray-900">생성된 대본 및 장면 가이드</h2>
            </div>
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setContent(null)}
                className="px-4 py-2 text-gray-500 hover:text-gray-700 font-bold text-sm transition-colors"
                title="다시 생성"
              >
                다시 생성
              </button>
              <button 
                onClick={() => setCurrentStep(3)}
                className="px-6 py-2 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 shadow-lg shadow-indigo-100 transition-all flex items-center gap-2"
                title="음성 생성"
              >
                다음 단계: 음성 생성
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-3 min-h-0 pb-10">
            {(() => {
              const lastEnd = content.scenes.length > 0
                ? Number((content.scenes[content.scenes.length - 1] as unknown as Record<string, unknown>).time_end || 0)
                : 0;
              const total = content.total_duration ?? lastEnd;
              const target = content.target_duration ?? duration;
              const short = target > 0 && total < target * 0.7;
              return (
                <div className={`rounded-xl px-4 py-2.5 border text-xs font-bold flex items-center gap-2 ${short ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-indigo-50/60 border-indigo-100 text-indigo-700'}`}>
                  <Clock size={14} />
                  <span>실제 분량: 약 {Math.round(total)}초 / 요청 {target}초 ({content.scenes.length}개 장면)</span>
                  {short && <span>— 분량 미달. 다시 생성을 눌러 보완하세요.</span>}
                </div>
              );
            })()}
            {content.warning && (
              <div className="rounded-xl px-4 py-2.5 border text-xs font-bold bg-amber-50 border-amber-200 text-amber-700">
                {content.warning}
              </div>
            )}
            {(content.title || content.hook_idea || (content.hashtags?.length ?? 0) > 0) && (
              <div className="rounded-xl px-4 py-3 border border-purple-100 bg-purple-50/50 space-y-1.5">
                {content.title && <p className="text-sm font-black text-gray-900">{content.title}</p>}
                {(content.servings || (content.tools?.length ?? 0) > 0 || (content.total_cost_krw ?? 0) > 0) && (
                  <p className="text-[11px] text-gray-500">
                    {[content.servings,
                      (content.tools?.length ?? 0) > 0 ? `도구: ${content.tools!.join('·')}` : '',
                      (content.total_cost_krw ?? 0) > 0 ? `예상 비용: ${Number(content.total_cost_krw).toLocaleString()}원` : '',
                    ].filter(Boolean).join(' · ')}
                  </p>
                )}
                {content.hook_idea && <p className="text-xs text-gray-600"><span className="font-black text-purple-600">HOOK </span>{content.hook_idea}</p>}
                {content.tone_and_manner && <p className="text-[11px] text-gray-500">톤앤매너: {content.tone_and_manner}</p>}
                {content.grounded !== undefined && (
                  <p className={`text-[11px] font-bold ${content.grounded ? 'text-green-600' : 'text-gray-400'}`}>
                    {content.grounded ? `웹 자료 ${(content.sources || []).length}건 기반` : '웹 근거 없음 (일반 지식 기반)'}
                  </p>
                )}
                {(content.sources?.length ?? 0) > 0 && (
                  <div className="space-y-0.5 pt-0.5">
                    {content.sources!.slice(0, 6).map((s, i) => (
                      <a key={i} href={s.link} target="_blank" rel="noreferrer" className="block text-[10px] text-indigo-500 hover:underline truncate">
                        [{i + 1}] {s.title || s.link}
                      </a>
                    ))}
                  </div>
                )}
                {(content.hashtags?.length ?? 0) > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {content.hashtags!.map((h, i) => (
                      <span key={i} className="text-[10px] font-bold text-purple-700 bg-white px-2 py-0.5 rounded-md border border-purple-100">{h.startsWith('#') ? h : `#${h}`}</span>
                    ))}
                  </div>
                )}
              </div>
            )}
            {content.scenes.map((scene, idx) => (
              <div key={idx} className="bg-white rounded-xl p-3.5 border border-gray-100 hover:border-indigo-100 transition-all shadow-sm space-y-2.5">
                <div className="flex items-center justify-between border-b border-gray-50 pb-1.5">
                  <div className="flex items-center gap-3">
                    <span className="px-2 py-0.5 bg-indigo-600 text-white rounded-full text-[10px] font-black uppercase tracking-wider">
                      Scene {idx + 1}
                    </span>
                    {scene.section && (
                      <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full text-[10px] font-black uppercase tracking-wider">
                        {scene.section}
                      </span>
                    )}
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Speaker:</span>
                      <span className="text-[11px] font-bold text-indigo-600">
                        {content.script.find((s) => s.scene_index === idx)?.speaker || 'Narrator'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 ml-2">
                      <Clock size={12} className="text-gray-300" />
                      <span className="text-[10px] font-bold text-gray-400">
                        {getTimelineRange(content.script, idx).start}s - {getTimelineRange(content.script, idx).end}s
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-1 max-w-md ml-4">
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest whitespace-nowrap" aria-label="Scene 주제">Topic:</span>
                    <input 
                      type="text"
                      title="장면 키워드"
                      aria-label="장면 키워드"
                      value={scene.keyword}
                      onChange={(e) => {
                        const newScenes = [...content.scenes];
                        newScenes[idx].keyword = e.target.value;
                        setContent({ ...content, scenes: newScenes });
                      }}
                      className="w-full text-[11px] font-bold text-gray-700 bg-gray-50 border border-transparent hover:border-gray-200 focus:border-indigo-500 rounded px-2 py-0.5 outline-none transition-all"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <div className="w-1 h-3 bg-indigo-500 rounded-full"></div>
                      <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Voice Script · 하단 자막(TTS)</label>
                    </div>
                    <textarea 
                      title="대본 내용"
                      value={content.script.find((s) => s.scene_index === idx)?.text || ''}
                      onChange={(e) => {
                        const newScript = [...content.script];
                        const scriptIdx = newScript.findIndex((s) => s.scene_index === idx);
                        if (scriptIdx !== -1) {
                          newScript[scriptIdx].text = e.target.value;
                          setContent({ ...content, script: newScript });
                          setAudio(null);
                          setAudioScriptSig(null);
                        }
                      }}
                      className="w-full bg-indigo-50/30 border border-indigo-100 rounded-lg p-2.5 text-[15px] text-gray-900 font-bold leading-relaxed italic focus:ring-2 focus:ring-indigo-500/5 focus:border-indigo-500 outline-none resize-none h-23 custom-scrollbar transition-all"
                      placeholder="대본 내용을 입력하세요... (비우면 무음 구간)"
                    />
                    {(() => {
                      const item = content.script.find((s) => s.scene_index === idx);
                      if (!item || (!item.subtitle && !item.sfx)) return null;
                      return (
                        <div className="space-y-1 pt-1">
                          {item.subtitle ? (
                            <p className="text-[11px] text-gray-600 font-medium leading-relaxed">
                              <span className="font-black text-teal-600">자막 </span>{item.subtitle}
                            </p>
                          ) : null}
                          {item.sfx ? (
                            <p className="text-[11px] text-gray-500 font-medium leading-relaxed">
                              <span className="font-black text-amber-600">효과음 </span>{item.sfx}
                            </p>
                          ) : null}
                        </div>
                      );
                    })()}
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <div className="w-1 h-3 bg-purple-500 rounded-full"></div>
                      <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest" title="이미지/비디오 생성을 위한 프롬프트">Visual Guide (Prompt)</label>
                    </div>
                    <textarea 
                      title="이미지/비디오 생성을 위한 프롬프트"
                      value={scene.description}
                      onChange={(e) => {
                        const newScenes = [...content.scenes];
                        newScenes[idx].description = e.target.value;
                        setContent({ ...content, scenes: newScenes });
                      }}
                      className="w-full bg-purple-50/30 border border-purple-100 rounded-lg p-2.5 text-xs text-gray-600 font-medium leading-relaxed focus:ring-2 focus:ring-purple-500/5 focus:border-purple-500 outline-none resize-none h-23 custom-scrollbar transition-all"
                      placeholder="이미지/비디오 생성을 위한 프롬프트를 입력하세요..."
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-[9px] font-black text-amber-600 uppercase tracking-widest whitespace-nowrap" title="영상 상단에 표시되는 씬 요약 자막">TOP 상단 자막</span>
                  <textarea
                    rows={2}
                    value={scene.subtitle || ''}
                    onChange={(e) => {
                      const newScenes = [...content.scenes];
                      newScenes[idx].subtitle = e.target.value;
                      setContent({ ...content, scenes: newScenes });
                    }}
                    placeholder="상단 밴드 자막 (Enter=줄바꿈, 재료+분량 목록 가능)"
                    title="상단 자막"
                    className="flex-1 resize-none leading-snug text-[11px] font-bold text-gray-700 bg-amber-50/60 border border-amber-200/60 rounded-lg px-2.5 py-1.5 outline-none focus:border-amber-500 transition-all custom-scrollbar"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default React.memo(Step2Review);
