import React from 'react';
import { 
  Sparkles, 
  RefreshCw, 
  ArrowRight, 
  CheckCircle2, 
  Image as ImageIcon,
  Maximize,
  Search,
  ChevronLeft,
  Cloud,
  Loader2,
  Trash2,
  Plus,
  Library,
  X,
  Pencil,
  Edit2,
  Save
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  type AppContent, 
  type SceneCandidates
} from '../services/api';

interface Step4VisualProps {
  content: AppContent;
  activeSceneIndex: number;
  setActiveSceneIndex: (index: number) => void;
  selectedVisuals: Record<number, string[]>;
  setSelectedVisuals: React.Dispatch<React.SetStateAction<Record<number, string[]>>>;
  visualCandidates: Record<number, SceneCandidates>;
  setVisualCandidates: React.Dispatch<React.SetStateAction<Record<number, SceneCandidates>>>;
  isGeneratingAll: boolean;
  generationProgress: { current: number; total: number };
  stopGeneration: () => void;
  selectedAiModel: string;
  setSelectedAiModel: (model: string) => void;
  fetchAllCandidates: (force?: boolean) => void;
  fetchCandidates: (index: number, type?: 'all' | 'ai' | 'search', model?: string, isAppend?: boolean, customKeyword?: string) => void;
  editingSceneIndex: number | null;
  setEditingSceneIndex: (index: number | null) => void;
  editSceneValues: { keyword: string; description: string };
  setEditSceneValues: React.Dispatch<React.SetStateAction<{ keyword: string; description: string }>>;
  setContent: (content: AppContent) => void;
  setCurrentStep: (step: number) => void;
  zoomedImage: string | null;
  setZoomedImage: (url: string | null) => void;
  handleMoveToEdit: () => void;
  fetchingIndices: Set<string>;
}

const Step4Visual: React.FC<Step4VisualProps> = ({ 
  content,
  activeSceneIndex,
  setActiveSceneIndex,
  selectedVisuals,
  setSelectedVisuals,
  visualCandidates,
  setVisualCandidates,
  isGeneratingAll,
  generationProgress,
  stopGeneration,
  selectedAiModel,
  setSelectedAiModel,
  fetchAllCandidates,
  fetchCandidates,
  editingSceneIndex,
  setEditingSceneIndex,
  editSceneValues,
  setEditSceneValues,
  setContent,
  setCurrentStep,
  zoomedImage,
  setZoomedImage,
  handleMoveToEdit,
  fetchingIndices
}) => {
  if (!content) return null;

  return (
    <div className="flex flex-col h-full bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Step 3 Concept Header */}
      <div className="flex items-center justify-between shrink-0 px-6 py-3 border-b border-gray-100 bg-white">
        <div className="flex items-center gap-3">
          <div className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg">
            <Library size={18} />
          </div>
          <h2 className="text-lg font-bold text-gray-900">시각 자료 선택</h2>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={() => setCurrentStep(3)}
            className="text-gray-400 hover:text-gray-600 flex items-center gap-1.5 text-[10px] font-bold transition-colors whitespace-nowrap"
          >
            <ChevronLeft size={14} />
            목소리 설정
          </button>
          
          <div className="h-4 w-px bg-gray-200 mx-1"></div>
          
          <div className="flex items-center gap-3">
            {isGeneratingAll ? (
              <div className="flex items-center gap-3 bg-indigo-50 px-3 py-1.5 rounded-xl border border-indigo-100/50">
                <div className="flex items-center gap-2">
                  <div className="w-24 h-1.5 bg-indigo-100 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-indigo-600 transition-all duration-500"
                      style={{ width: `${generationProgress.total > 0 ? (generationProgress.current / generationProgress.total) * 100 : 0}%` }}
                    />
                  </div>
                  <span className="text-[9px] font-black text-indigo-600">
                    {generationProgress.total > 0 ? Math.round((generationProgress.current / generationProgress.total) * 100) : 0}%
                  </span>
                </div>
                <button 
                  onClick={stopGeneration}
                  className="p-1 text-red-500 hover:bg-red-50 rounded-lg transition-all"
                  title="생성 중단"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 mr-2">
                  <select 
                    value={selectedAiModel}
                    onChange={(e) => setSelectedAiModel(e.target.value)}
                    className="px-2 py-1 bg-white border border-gray-200 rounded-lg text-[10px] font-bold text-gray-700 focus:border-indigo-500 outline-none transition-all cursor-pointer hover:border-gray-300"
                    title="이미지 생성 모델 선택"
                  >
                    <option value="pollinations">Pollinations (기본)</option>
                    <option value="cloudflare">Cloudflare AI</option>
                    <option value="local_sd">Local SD</option>
                    <option value="zimage">Z-Image</option>
                    <option value="horde">AI Horde</option>
                    <option value="dall-e-3">DALL-E 3</option>
                    <option value="stable-diffusion-xl">SD XL</option>
                    <option value="recraft-v3">Recraft V3</option>
                    <option value="flux-1.1-pro">FLUX 1.1 Pro</option>
                    <option value="flux-pro">FLUX Pro</option>
                    <option value="flux-dev">FLUX Dev</option>
                    <option value="flux-schnell">FLUX Schnell</option>
                    <option value="midjourney">Midjourney</option>
                  </select>
                </div>

                <button 
                  onClick={() => fetchAllCandidates(false)}
                  className="text-indigo-600 hover:text-indigo-700 disabled:text-gray-300 flex items-center gap-1.5 text-[10px] font-bold transition-all whitespace-nowrap"
                >
                  <Sparkles size={14} />
                  전체 이미지 생성
                </button>

                <button 
                  onClick={() => fetchAllCandidates(true)}
                  className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-bold transition-all border border-gray-200 text-gray-700 hover:border-indigo-200 hover:text-indigo-600 bg-white whitespace-nowrap"
                >
                  <RefreshCw size={14} />
                  전체 다시 생성
                </button>
              </>
            )}
          </div>

          <div className="h-4 w-px bg-gray-200 mx-1"></div>

          <div className="flex items-center gap-2">
            <div className="px-2 py-1 bg-gray-50 rounded-lg border border-gray-100 mr-1">
              <span className="text-[10px] font-bold text-gray-500">
                선택됨: <span className="text-indigo-600">{Object.keys(selectedVisuals).length}</span>/{content.scenes.length}
              </span>
            </div>
            <button 
              onClick={handleMoveToEdit}
              disabled={Object.keys(selectedVisuals).length < content.scenes.length}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-200 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all shadow-md shadow-indigo-100"
            >
              편집 단계로 이동
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden bg-white">
        {/* Left: Scene List */}
        <div className="w-[340px] border-r border-gray-100 bg-gray-50/20 flex flex-col shrink-0 overflow-hidden h-full">
          <div className="p-2 border-b border-gray-50">
            <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
              <Library size={12} />
              장면 리스트
            </h3>
          </div>
          <div className="flex-1 overflow-y-auto p-1.5 space-y-1.5 custom-scrollbar">
            {content.scenes.map((scene, idx) => {
              const isSelected = activeSceneIndex === idx;
              const hasVisual = selectedVisuals[idx] && selectedVisuals[idx].length > 0;
              const firstAiImage = visualCandidates[idx]?.ai?.[0]?.url;
              const displayImageUrl = hasVisual ? selectedVisuals[idx][0] : firstAiImage;
              
              return (
                <button
                  key={idx}
                  onClick={() => setActiveSceneIndex(idx)}
                  className={`w-full text-left p-1.5 rounded-xl transition-all border flex items-center gap-3 ${
                    isSelected 
                    ? 'bg-white border-indigo-600 shadow-sm ring-1 ring-indigo-600/5' 
                    : 'bg-transparent border-transparent hover:bg-white hover:border-gray-200'
                  }`}
                >
                  {/* Thumbnail Preview */}
                  <div className={`shrink-0 w-12 h-8 rounded-lg overflow-hidden bg-gray-100 border border-gray-100 flex items-center justify-center relative ${isSelected ? 'ring-2 ring-indigo-50' : ''}`}>
                    {displayImageUrl ? (
                      <img 
                        src={`http://localhost:8000${displayImageUrl}`} 
                        className="w-full h-full object-cover"
                        alt=""
                        key={displayImageUrl} // URL 변경 시 이미지 강제 갱신
                      />
                    ) : (
                      <ImageIcon size={12} className="text-gray-300" />
                    )}

                    {/* Loading Overlay */}
                    {(fetchingIndices.has(`${idx}-ai`) || fetchingIndices.has(`${idx}-search`)) && (
                      <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px] flex items-center justify-center z-10">
                        <Loader2 size={12} className="text-indigo-600 animate-spin" />
                      </div>
                    )}

                    <div className={`absolute top-0.5 left-0.5 w-3 h-3 rounded shadow-sm flex items-center justify-center text-[6px] font-black z-20 ${
                      isSelected ? 'bg-indigo-600 text-white' : 'bg-white/80 text-gray-400'
                    }`}>
                      {idx + 1}
                    </div>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className={`text-[11px] font-black truncate shrink-0 ${isSelected ? 'text-gray-900' : 'text-gray-500'}`}>
                        {scene.keyword}
                      </p>
                      <span className="text-[10px] text-gray-300 font-light shrink-0">|</span>
                      <p className="text-[10px] text-gray-400 truncate flex-1 font-medium">
                        {scene.description}
                      </p>
                      {hasVisual && !fetchingIndices.has(`${idx}-ai`) && !fetchingIndices.has(`${idx}-search`) && (
                        <CheckCircle2 size={10} className="text-green-500 shrink-0 ml-auto" />
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: Candidates Area */}
        <div className="flex-1 flex flex-col bg-white overflow-hidden">
          {/* Compressed Scene Context & Controls */}
          <div className="px-6 py-2 bg-white shrink-0 border-b border-gray-50/50 shadow-sm relative z-10">
            <div className="flex items-center gap-4">
              <div className="flex-1 min-w-0">
                {editingSceneIndex === activeSceneIndex ? (
                  <motion.div 
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col gap-2 p-3 bg-indigo-50/30 rounded-2xl border border-indigo-100/50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="shrink-0 bg-indigo-600 text-white text-[9px] font-black px-2 py-0.5 rounded shadow-sm uppercase tracking-wider italic">
                        장면 {activeSceneIndex + 1}
                      </div>
                      <input 
                        type="text"
                        value={editSceneValues.keyword}
                        onChange={(e) => setEditSceneValues(prev => ({ ...prev, keyword: e.target.value }))}
                        className="flex-1 px-3 py-1.5 bg-white border border-indigo-100/50 rounded-xl text-xs font-bold focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/5 outline-none transition-all shadow-sm"
                        placeholder="키워드 (예: 서울 번화가 야경)"
                        autoFocus
                      />
                    </div>
                    <div className="flex gap-2">
                      <textarea 
                        value={editSceneValues.description}
                        onChange={(e) => setEditSceneValues(prev => ({ ...prev, description: e.target.value }))}
                        className="flex-1 px-3 py-2 bg-white border border-indigo-100/50 rounded-xl text-xs font-medium focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/5 outline-none transition-all shadow-sm resize-none h-20"
                        placeholder="장면 설명/프롬프트"
                      />
                      <div className="flex flex-col gap-2">
                        <button 
                          onClick={() => {
                            const newScenes = [...content.scenes];
                            newScenes[activeSceneIndex] = {
                              ...newScenes[activeSceneIndex],
                              keyword: editSceneValues.keyword,
                              description: editSceneValues.description
                            };
                            setContent({ ...content, scenes: newScenes });
                            setEditingSceneIndex(null);
                          }}
                          className="flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-[11px] font-black hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
                        >
                          <Save size={14} />
                          저장
                        </button>
                        <button 
                          onClick={() => setEditingSceneIndex(null)}
                          className="flex items-center justify-center gap-2 px-4 py-2 bg-white text-gray-400 rounded-xl text-[11px] font-black hover:text-gray-600 transition-all border border-gray-100"
                        >
                          <X size={14} />
                          취소
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex items-center gap-4 py-0.5"
                  >
                    {/* Keyword Section */}
                    <div className="flex items-center gap-2.5 shrink-0 group">
                      <div className="shrink-0 bg-indigo-600 text-white text-[10px] font-black px-2.5 py-1 rounded-lg shadow-sm uppercase tracking-wider italic">
                        장면 {activeSceneIndex + 1}
                      </div>
                      <h3 className="text-base font-black text-gray-900 tracking-tight">
                        {content.scenes[activeSceneIndex].keyword}
                      </h3>
                      <button 
                        onClick={() => {
                          setEditingSceneIndex(activeSceneIndex);
                          setEditSceneValues({
                            keyword: content.scenes[activeSceneIndex].keyword,
                            description: content.scenes[activeSceneIndex].description
                          });
                        }}
                        className="p-1.5 text-gray-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                        title="키워드 수정"
                      >
                        <Pencil size={14} />
                      </button>
                    </div>

                    <div className="h-4 w-px bg-gray-200 shrink-0 mx-1" />

                    {/* Description Section */}
                    <div className="flex-1 flex items-center gap-3 min-w-0 group relative">
                      <p className="text-[13px] text-gray-500 font-medium leading-relaxed truncate">
                        {content.scenes[activeSceneIndex].description}
                      </p>
                      
                      <button 
                        onClick={() => {
                          setEditingSceneIndex(activeSceneIndex);
                          setEditSceneValues({
                            keyword: content.scenes[activeSceneIndex].keyword,
                            description: content.scenes[activeSceneIndex].description
                          });
                        }}
                        className="p-1.5 text-gray-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all opacity-0 group-hover:opacity-100 shrink-0"
                        title="가이드 수정"
                      >
                        <Edit2 size={14} />
                      </button>
                    </div>

                    {/* Quick Action */}
                    <button 
                      onClick={() => fetchCandidates(activeSceneIndex, 'all', selectedAiModel)}
                      className="ml-auto flex items-center gap-2 px-2.5 py-1 rounded-xl text-[10px] font-black transition-all border border-indigo-100 text-indigo-600 hover:bg-indigo-50 bg-white whitespace-nowrap shadow-sm active:scale-95"
                    >
                      <RefreshCw size={14} className={(fetchingIndices.has(`${activeSceneIndex}-ai`) || fetchingIndices.has(`${activeSceneIndex}-search`)) ? "animate-spin" : ""} />
                      다시 생성
                    </button>
                  </motion.div>
                )}
              </div>
            </div>
          </div>

          {!visualCandidates[activeSceneIndex] ? (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex-1 flex flex-col items-center justify-center bg-gray-50/10 p-12"
            >
              <div className="relative mb-8">
                <motion.div 
                  animate={{ 
                    scale: [1, 1.1, 1],
                    opacity: [0.2, 0.3, 0.2]
                  }}
                  transition={{ duration: 4, repeat: Infinity }}
                  className="absolute inset-0 bg-indigo-200 blur-3xl rounded-full" 
                />
                <div className="relative w-24 h-24 bg-white rounded-3xl shadow-xl flex items-center justify-center border border-indigo-50">
                  <ImageIcon size={40} className="text-indigo-200" />
                  <motion.div 
                    animate={{ y: [0, -5, 0] }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="absolute -top-2 -right-2 bg-indigo-600 p-2 rounded-2xl shadow-lg shadow-indigo-200"
                  >
                    <Sparkles size={16} className="text-white" />
                  </motion.div>
                </div>
              </div>
              <div className="text-center space-y-2.5">
                <h3 className="text-xl font-black text-gray-900 tracking-tight">시각 자료 생성 대기 중</h3>
                <p className="text-sm text-gray-400 font-medium max-w-sm leading-relaxed mx-auto">
                  상단의 <span className="text-indigo-600 font-bold">'전체 이미지 생성'</span> 버튼을 눌러 모든 장면을 한꺼번에 준비하거나,<br />
                  장면별로 <span className="text-indigo-600 font-bold">'다시 생성'</span> 버튼을 클릭하여 시각자료를 구성해보세요.
                </p>
              </div>
            </motion.div>
          ) : (
            <div className="flex-1 overflow-y-auto px-6 py-4 custom-scrollbar">
              <div className="flex flex-col gap-0">
                {/* Candidates Sections */}
                {[
                  { title: 'AI 생성 이미지', items: visualCandidates[activeSceneIndex]?.ai || [], Icon: Sparkles, type: 'ai' },
                  { title: '웹 검색 이미지', items: visualCandidates[activeSceneIndex]?.search || [], Icon: Cloud, type: 'search' }
                ].map((section, sIdx) => (
                  <div key={sIdx} className={`flex flex-col gap-2 ${section.type === 'search' ? 'mt-4 pt-5 border-t border-gray-50' : ''}`}>
                    <div className="flex items-center justify-between px-1 pt-1.5">
                      <div className="flex items-center gap-2.5">
                        <div className={`p-1 rounded-lg ${section.type === 'ai' ? 'bg-indigo-600 text-white shadow-indigo-100' : 'bg-sky-500 text-white shadow-sky-100'} shadow-md`}>
                          <section.Icon size={12} />
                        </div>
                        <div>
                          <h4 className="text-[11px] font-black text-gray-900 tracking-tight leading-none">{section.title}</h4>
                          <div className="flex items-center gap-1 mt-0.5">
                            <span className="text-[8.5px] text-gray-400 font-bold tracking-tighter">
                              {section.items?.length || 0}개 발견
                            </span>
                            <div className="w-0.5 h-0.5 rounded-full bg-gray-200" />
                            <span className="text-[8.5px] text-indigo-500 font-black uppercase tracking-widest">
                              {section.type === 'ai' ? selectedAiModel : '전체 검색'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-gray-50 border border-gray-100">
                          <div className={`w-1 h-1 rounded-full ${fetchingIndices.has(`${activeSceneIndex}-${section.type}`) ? 'bg-amber-400 animate-pulse' : 'bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.4)]'}`} />
                          <span className="text-[8.5px] font-black text-gray-500 uppercase tracking-widest">
                            {fetchingIndices.has(`${activeSceneIndex}-${section.type}`) ? '생성 중' : '안정'}
                          </span>
                        </div>
                        
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setVisualCandidates(prev => {
                              const current = prev[activeSceneIndex] || { ai: [], search: [], graph: [] };
                              return {
                                ...prev,
                                [activeSceneIndex]: {
                                  ...current,
                                  ai: section.type === 'ai' ? [] : current.ai,
                                  search: section.type === 'search' ? [] : current.search
                                }
                              };
                            });
                            fetchCandidates(activeSceneIndex, section.type as 'ai' | 'search', selectedAiModel);
                          }}
                          disabled={fetchingIndices.has(`${activeSceneIndex}-${section.type}`)}
                          className="p-1 rounded-lg bg-white text-gray-400 hover:text-indigo-600 hover:border-indigo-200 hover:bg-indigo-50/50 transition-all border border-gray-100 shadow-sm disabled:opacity-50 active:scale-90"
                          title="새로고침"
                        >
                          <RefreshCw size={11} className={fetchingIndices.has(`${activeSceneIndex}-${section.type}`) ? "animate-spin" : ""} />
                        </button>
                      </div>
                    </div>

                    <AnimatePresence mode="popLayout" initial={false}>
                      {section.items && section.items.length > 0 ? (
                        <motion.div 
                          layout
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5"
                        >
                          {section.items.map((candidate, cIdx) => {
                            const isSelected = selectedVisuals[activeSceneIndex]?.includes(candidate.url);
                            return (
                              <motion.div 
                                layout
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.5, transition: { duration: 0.2 } }}
                                transition={{ 
                                  type: "spring",
                                  stiffness: 200,
                                  damping: 25,
                                  delay: cIdx * 0.03
                                }}
                                key={candidate.url}
                                className={`group relative aspect-video rounded-3xl overflow-hidden border-2 transition-all cursor-pointer ${
                                  isSelected 
                                  ? 'border-indigo-600 ring-8 ring-indigo-50 shadow-2xl scale-[1.02] z-10' 
                                  : 'border-gray-50 hover:border-indigo-200 hover:shadow-xl shadow-md'
                                }`}
                                onClick={() => {
                                  setSelectedVisuals(prev => {
                                    const current = prev[activeSceneIndex] || [];
                                    const isAlreadySelected = current.includes(candidate.url);
                                    
                                    if (isAlreadySelected) {
                                      // 해제: 선택된 목록에서 제거
                                      return {
                                        ...prev,
                                        [activeSceneIndex]: current.filter(url => url !== candidate.url)
                                      };
                                    } else {
                                      // 추가: 선택된 목록 끝에 추가
                                      return {
                                        ...prev,
                                        [activeSceneIndex]: [...current, candidate.url]
                                      };
                                    }
                                  });
                                }}
                              >
                                <img 
                                  src={candidate.url.startsWith('http') ? candidate.url : `http://localhost:8000${candidate.url.startsWith('/') ? '' : '/'}${candidate.url.replace('/assets/assets/', '/assets/')}`}
                                  className={`w-full h-full object-cover transition-transform duration-1000 ${isSelected ? 'scale-110' : 'group-hover:scale-115'}`}
                                  alt=""
                                  loading="lazy"
                                />
                                <div className={`absolute inset-0 bg-gradient-to-t transition-opacity duration-500 ${isSelected ? 'from-indigo-900/60 opacity-100' : 'from-black/90 opacity-0 group-hover:opacity-100'}`} />
                                
                                {/* Selection Indicator (Number based on selection order) */}
                                {isSelected && (
                                  <motion.div 
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    className="absolute top-2 right-2 bg-indigo-600 text-white w-5 h-5 flex items-center justify-center rounded-full shadow-lg ring-2 ring-white/20 text-[10px] font-black z-20"
                                  >
                                    {(selectedVisuals[activeSceneIndex]?.indexOf(candidate.url) || 0) + 1}
                                  </motion.div>
                                )}

                                {/* Action Buttons (Simplified and Positioned at corners) */}
                                <div className="absolute inset-x-2 bottom-2 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-1 group-hover:translate-y-0 z-20">
                                  <button 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setVisualCandidates(prev => {
                                        const current = prev[activeSceneIndex];
                                        const list = section.type === 'ai' ? current.ai : current.search;
                                        return {
                                          ...prev,
                                          [activeSceneIndex]: {
                                            ...current,
                                            [section.type]: list.filter((_, i) => i !== cIdx)
                                          }
                                        };
                                      });
                                    }}
                                    className="p-1.5 bg-red-500/80 hover:bg-red-500 backdrop-blur-md text-white rounded-lg transition-all hover:scale-110 border border-white/10 shadow-lg"
                                    title="삭제"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                  
                                  <button 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setZoomedImage(`http://localhost:8000${candidate.url}`);
                                    }}
                                    className="p-1.5 bg-black/40 hover:bg-black/60 backdrop-blur-md text-white rounded-lg transition-all hover:scale-110 border border-white/10 shadow-lg"
                                    title="크게 보기"
                                  >
                                    <Maximize size={12} />
                                  </button>
                                </div>
                              </motion.div>
                            );
                          })}
                          
                          {/* Add More Card */}
                          {!fetchingIndices.has(`${activeSceneIndex}-${section.type}`) && (
                            <motion.button 
                              layout
                              initial={{ opacity: 0, scale: 0.9 }}
                              animate={{ opacity: 1, scale: 1 }}
                              onClick={(e) => {
                                e.stopPropagation();
                                fetchCandidates(activeSceneIndex, section.type as 'ai' | 'search', section.type === 'ai' ? selectedAiModel : undefined, true);
                              }}
                              className="group relative aspect-video rounded-3xl border-2 border-dashed border-gray-100 hover:border-indigo-300 hover:bg-indigo-50/30 transition-all flex flex-col items-center justify-center gap-2 bg-gray-50/10 shadow-sm hover:shadow-indigo-50"
                              title={`${section.title} 추가 생성/검색`}
                            >
                              <div className="w-10 h-10 rounded-2xl bg-white border border-gray-100 flex items-center justify-center text-gray-400 group-hover:text-indigo-600 group-hover:scale-110 transition-all shadow-md group-hover:shadow-lg">
                                <Plus size={20} strokeWidth={3} />
                              </div>
                              <div className="text-center">
                                <span className="block text-[11px] font-black text-gray-500 group-hover:text-indigo-700 uppercase tracking-widest">추가 생성</span>
                              </div>
                            </motion.button>
                          )}

                          {/* Loading Card - Only shown during explicit 'Generate More' (isAppend) or if list is empty */}
                          {fetchingIndices.has(`${activeSceneIndex}-${section.type}`) && (section.items.length === 0 || isGeneratingAll === false) && (
                            <motion.div 
                              layout
                              initial={{ opacity: 0, scale: 0.9 }}
                              animate={{ opacity: 1, scale: 1 }}
                              className="aspect-video rounded-3xl border-2 border-indigo-100 bg-indigo-50/10 flex flex-col items-center justify-center gap-4 animate-pulse shadow-sm"
                            >
                              <div className="w-12 h-12 rounded-2xl bg-indigo-100/50 flex items-center justify-center">
                                <Loader2 size={28} className="text-indigo-600 animate-spin" />
                              </div>
                              <div className="text-center space-y-1">
                                <span className="block text-[10px] font-black text-indigo-600 uppercase tracking-widest">생성 중</span>
                              </div>
                            </motion.div>
                          )}
                        </motion.div>
                      ) : (
                        <motion.div 
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="h-64 flex flex-col items-center justify-center bg-gray-50/30 rounded-[3rem] border-2 border-gray-100 border-dashed text-gray-300 space-y-5 transition-all hover:bg-gray-50/50"
                        >
                          <div className="p-5 bg-white rounded-[2rem] shadow-xl border border-gray-50 group-hover:scale-110 transition-transform duration-500">
                            <Search size={40} className="opacity-20 text-indigo-600" />
                          </div>
                          <div className="text-center">
                            <h5 className="text-[13px] font-black text-gray-500 uppercase tracking-widest mb-1">발견된 이미지가 없습니다</h5>
                            <p className="text-[10px] text-gray-400 font-medium mb-6">이미지 생성을 시작해보세요</p>
                            <button 
                              onClick={() => fetchCandidates(activeSceneIndex, section.type as 'ai' | 'search', selectedAiModel)}
                              className="px-8 py-3 bg-indigo-600 text-white rounded-2xl text-[12px] font-black hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 uppercase tracking-widest active:scale-95 flex items-center gap-2 mx-auto"
                            >
                              <Sparkles size={16} />
                              지금 생성하기
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Image Zoom Modal */}
      {zoomedImage && (
        <div 
          className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-xl flex items-center justify-center p-4 md:p-10 animate-in fade-in duration-300"
          onClick={() => setZoomedImage(null)}
        >
          <button 
            title="확대 이미지 닫기"
            className="absolute top-6 right-6 w-12 h-12 bg-white/10 hover:bg-white/20 text-white rounded-full flex items-center justify-center transition-all"
            onClick={() => setZoomedImage(null)}
          >
            <X size={24} />
          </button>
          <img 
            src={zoomedImage} 
            className="max-w-full max-h-full object-contain rounded-2xl shadow-2xl animate-in zoom-in-95 duration-500" 
            alt="Zoomed" 
          />
        </div>
      )}
    </div>
  );
};

export default React.memo(Step4Visual);
