import React from 'react';
import { FileText, Clock, ChevronRight } from 'lucide-react';
import { type AppContent, type Article, type ScriptItem } from '../services/api';

interface Step2ReviewProps {
  article: Article | null;
  content: AppContent | null;
  duration: number;
  setDuration: (duration: number) => void;
  handleGenerate: () => void;
  setContent: (content: AppContent | null) => void;
  setAudio: (audio: { url?: string; srtUrl?: string; audio_path?: string; srt_path?: string; [key: string]: unknown } | null) => void;
  getTimelineRange: (data: ScriptItem[] | undefined, idx: number) => { start: string, end: string, duration: string };
  setCurrentStep: (step: number) => void;
  loading: boolean;
}

const Step2Review: React.FC<Step2ReviewProps> = ({
  article,
  content,
  duration,
  setDuration,
  handleGenerate,
  setContent,
  setAudio,
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
            </label>
            <div className="flex flex-wrap gap-2 justify-end">
              {[30, 60, 180, 300].map((sec) => (
                <button
                  key={sec}
                  onClick={() => setDuration(sec)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    duration === sec 
                      ? 'bg-indigo-600 text-white shadow-md' 
                      : 'bg-white text-gray-500 border border-gray-200 hover:border-indigo-300'
                  }`}
                >
                  {sec >= 60 ? `${sec/60}분` : `${sec}초`}
                </button>
              ))}
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
            {content.scenes.map((scene, idx) => (
              <div key={idx} className="bg-white rounded-xl p-3.5 border border-gray-100 hover:border-indigo-100 transition-all shadow-sm space-y-2.5">
                <div className="flex items-center justify-between border-b border-gray-50 pb-1.5">
                  <div className="flex items-center gap-3">
                    <span className="px-2 py-0.5 bg-indigo-600 text-white rounded-full text-[10px] font-black uppercase tracking-wider">
                      Scene {idx + 1}
                    </span>
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
                      <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Voice Script</label>
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
                        }
                      }}
                      className="w-full bg-indigo-50/30 border border-indigo-100 rounded-lg p-2.5 text-[15px] text-gray-900 font-bold leading-relaxed italic focus:ring-2 focus:ring-indigo-500/5 focus:border-indigo-500 outline-none resize-none h-23 custom-scrollbar transition-all"
                      placeholder="대본 내용을 입력하세요..."
                    />
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
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default React.memo(Step2Review);
