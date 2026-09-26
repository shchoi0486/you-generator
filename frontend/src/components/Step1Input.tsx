import React from 'react';
import { Edit2, FileText, ExternalLink, Sparkles, Users, Clapperboard, ChefHat, ShoppingBag, Lightbulb, Plane, ArrowLeft, ArrowRight, Zap } from 'lucide-react';
import ShortsLab from './ShortsLab';
import type { AppContent, Article, ShortsReport } from '../services/api';

const NEWS_SUBMODES = [
  { id: 'news_duo', name: '2인 대화', desc: 'BJ 이슈왕 vs 박 앵커' },
  { id: 'news_solo', name: '1인 브리핑', desc: 'BJ 혼자 직설 브리핑 (숏폼 겸용)' },
];

const SHORTS_CATEGORIES = [
  { id: 'recipe_short', name: '요리 / 레시피', desc: '계량·조리 순서까지 따라 만드는 레시피', icon: ChefHat },
  { id: 'review_short', name: '제품 리뷰 / 추천', desc: '스펙·가격·장단점 솔직 리뷰', icon: ShoppingBag },
  { id: 'knowledge_short', name: '지식 / 정보 전달', desc: '통념 깨고 3포인트 정리', icon: Lightbulb },
  { id: 'travel_short', name: '여행 / 브이로그', desc: '장소·코스·꿀팁 담는 여행 숏폼', icon: Plane },
];

interface Step1InputProps {
  projectName: string;
  setProjectName: (name: string) => void;
  inputType: 'url' | 'text';
  setInputType: (type: 'url' | 'text') => void;
  url: string;
  setUrl: (url: string) => void;
  directText: string;
  setDirectText: (text: string) => void;
  duration: number;
  setDuration: (v: number) => void;
  templateId: string;
  setTemplateId: (id: string) => void;
  shortsMode: 'file' | 'youtube';
  setShortsMode: (m: 'file' | 'youtube') => void;
  shortsYtUrl: string;
  setShortsYtUrl: (v: string) => void;
  shortsHint: string;
  setShortsHint: (v: string) => void;
  shortsReport: ShortsReport | null;
  setShortsReport: (r: ShortsReport | null) => void;
  shortsTopic: string;
  setShortsTopic: (v: string) => void;
  shortsCategory: string;
  setShortsCategory: (v: string) => void;
  onShortsComplete: (article: Article, content: AppContent) => void;
  onShortsDirectCreate: (topic: string, duration: number, category: string, reference?: string) => void | Promise<void>;
  handleScrape: () => void;
  loading: boolean;
  onAutoMake: (source: 'news' | 'shorts') => void;
  recipePreset: { format: string; style: string; platform: string; hook?: string };
  setRecipePreset: (p: { format: string; style: string; platform: string }) => void;
  phase: 'pick' | 'input';
  setPhase: (p: 'pick' | 'input') => void;
  onCategoryPick?: (tplId: string) => void;
  scriptId?: string;
  shortsReference: string;
  setShortsReference: (v: string) => void;
}

const Step1Input: React.FC<Step1InputProps> = ({
  projectName,
  setProjectName,
  inputType,
  setInputType,
  url,
  setUrl,
  directText,
  setDirectText,
  duration,
  setDuration,
  templateId,
  setTemplateId,
  shortsMode,
  setShortsMode,
  shortsYtUrl,
  setShortsYtUrl,
  shortsHint,
  setShortsHint,
  shortsReport,
  setShortsReport,
  shortsTopic,
  setShortsTopic,
  shortsCategory,
  setShortsCategory,
  onShortsComplete,
  onShortsDirectCreate,
  handleScrape,
  loading,
  onAutoMake,
  recipePreset,
  setRecipePreset,
  phase,
  setPhase,
  onCategoryPick,
  scriptId = '',
  shortsReference,
  setShortsReference
}) => {
  const isNews = templateId === 'news_duo' || templateId === 'news_solo';
  const isShortsCat = templateId === 'recipe_short' || templateId === 'review_short' || templateId === 'knowledge_short' || templateId === 'travel_short';
  const isShortsLab = templateId === 'shorts_lab' || isShortsCat;
  // 1단계: 카테고리 먼저 선택 → 2단계: 입력 프로세스
  // (자동 제작은 각 카테고리 입력 화면 안에서 선택. 카드에는 액션 없음)
  // phase는 App에서 관리 (제작 설정 레일 표시 여부와 공유)

  const SHORTS_CARDS = SHORTS_CATEGORIES.map((c) => ({
    id: c.id, cat: c.id as string | undefined, name: c.name, desc: c.desc, icon: c.icon,
  }));
  const LONGFORM_CARD = {
    id: 'news_duo', cat: undefined as string | undefined,
    name: '뉴스 / 이슈 브리핑', desc: '기사 URL로 대본 생성', icon: Users,
  };
  const ANALYZE_CARD = {
    id: 'shorts_lab', cat: undefined as string | undefined,
    name: '숏폼 분석·재창작', desc: '파일/유튜브 분석 후 패턴으로 새로 만들기', icon: Clapperboard,
  };

  const pickCategory = (tplId: string, catId?: string) => {
    setTemplateId(tplId);
    if (catId) setShortsCategory(catId);
    setPhase('input');
    onCategoryPick?.(tplId);
  };

  const pickedCard =
    [...SHORTS_CARDS, LONGFORM_CARD, ANALYZE_CARD].find((c) => c.id === templateId)
    || SHORTS_CARDS.find((c) => c.id === shortsCategory);

  const renderPickCard = (c: { id: string; cat: string | undefined; name: string; desc: string; icon: React.FC<{ size: number; className?: string }> }) => {
    const Icon = c.icon;
    return (
      <button
        key={c.id}
        onClick={() => pickCategory(c.id, c.cat)}
        title={`${c.name} - ${c.desc}`}
        className="group flex items-center gap-3 px-4 py-3.5 rounded-2xl border border-gray-200 bg-white hover:border-indigo-300 hover:shadow-lg hover:shadow-indigo-100/50 transition-all text-left w-full h-full min-h-[74px]"
      >
        <div className="w-9 h-9 flex items-center justify-center rounded-xl bg-gray-100 text-gray-500 group-hover:bg-indigo-600 group-hover:text-white transition-all shrink-0">
          <Icon size={18} />
        </div>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="text-sm font-bold text-gray-800 whitespace-nowrap">{c.name}</p>
          <p className="text-xs text-gray-400 font-medium truncate mt-0.5">{c.desc}</p>
        </div>
        <ArrowRight size={16} className="text-gray-200 group-hover:text-indigo-500 group-hover:translate-x-0.5 transition-all shrink-0" />
      </button>
    );
  };

  return (
    <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar pb-10">
      <div className="space-y-8 max-w-5xl mx-auto">
        {/* Title Section */}
      <div className="space-y-2">
        <h2 className="text-3xl font-extrabold text-gray-900 tracking-tight">어떤 영상을 만들고 싶으세요?</h2>
        <p className="text-gray-500 font-medium">주제나 대본을 입력하면 구조화를 도와드립니다.</p>
      </div>

      <div className="space-y-6">
        {phase === 'pick' ? (
          /* 1단계: 동일 비율 2열. 좌=숏폼 4장 세로 쌓기 / 우=롱폼+가져오기 2장 세로 쌓기 */
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
            <div className="space-y-2.5">
              <div className="flex items-center gap-2 h-6">
                <span className="px-2 py-0.5 rounded-md bg-gray-900 text-white text-[10px] font-black tracking-wide">쇼츠 9:16</span>
                <span className="text-xs font-bold text-gray-400">짧고 강한 한 편</span>
              </div>
              <div className="flex flex-col gap-3">
                {SHORTS_CARDS.map(renderPickCard)}
              </div>
            </div>
            <div className="flex flex-col gap-4">
              <div className="space-y-2.5">
                <div className="flex items-center gap-2 h-6">
                  <span className="px-2 py-0.5 rounded-md bg-gray-900 text-white text-[10px] font-black tracking-wide">롱폼 16:9</span>
                  <span className="text-xs font-bold text-gray-400">깊이 있는 한 편</span>
                </div>
                {renderPickCard(LONGFORM_CARD)}
              </div>
              <div className="space-y-2.5">
                <div className="flex items-center gap-2 h-6">
                  <span className="px-2 py-0.5 rounded-md bg-gray-200 text-gray-600 text-[10px] font-black tracking-wide">가져오기</span>
                  <span className="text-xs font-bold text-gray-400">있는 영상을 분석해서 새로 만들기</span>
                </div>
                {renderPickCard(ANALYZE_CARD)}
              </div>
            </div>
          </div>
        ) : (
          /* 2단계: 선택된 카테고리 표시 + 변경 */
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPhase('pick')}
              title="카테고리 다시 선택"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:text-gray-700 transition-all"
            >
              <ArrowLeft size={14} />
              카테고리 변경
            </button>
            {pickedCard && (
              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-50 border border-indigo-200 text-indigo-600">
                <pickedCard.icon size={14} />
                {pickedCard.name}
              </span>
            )}
          </div>
        )}

        {phase === 'input' && (
          <div className="space-y-6">
        {isNews && (
          <div className="flex items-center gap-1.5">
            {NEWS_SUBMODES.map((m) => (
              <button
                key={m.id}
                onClick={() => setTemplateId(m.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${templateId === m.id ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'bg-white border-gray-100 text-gray-400'}`}
                title={m.desc}
              >
                {m.name}
              </button>
            ))}
          </div>
        )}

        {(isShortsLab ? (
          <ShortsLab
            onComplete={onShortsComplete}
            mode={shortsMode}
            setMode={setShortsMode}
            ytUrl={shortsYtUrl}
            setYtUrl={setShortsYtUrl}
            hint={shortsHint}
            setHint={setShortsHint}
            report={shortsReport}
            setReport={setShortsReport}
            topic={shortsTopic}
            setTopic={setShortsTopic}
            duration={duration}
            setDuration={setDuration}
            category={shortsCategory}
            setCategory={setShortsCategory}
            onDirectCreate={onShortsDirectCreate}
            onAutoMake={() => onAutoMake('shorts')}
            recipePreset={recipePreset}
            setRecipePreset={setRecipePreset}
            scriptId={scriptId}
            sourceRef={shortsReference}
            setSourceRef={setShortsReference}
          />
        ) : (
        <>
        {/* Project Name Input */}
        <div className="relative group">
          <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center gap-2 text-gray-400">
            <span className="text-xs font-bold uppercase tracking-widest">프로젝트:</span>
          </div>
          <input 
            type="text"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            placeholder="프로젝트 이름을 입력하세요"
            title="프로젝트 이름"
            className="w-full pl-24 pr-12 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all font-bold text-gray-700"
          />
          <Edit2 size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-300 group-hover:text-gray-400 transition-colors" />
        </div>

        {/* Input Type Toggle */}
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
              <FileText size={18} />
            </div>
            <span className="text-sm font-bold text-gray-700">대본 / 프롬프트</span>
            <span className="text-[10px] text-gray-400 font-medium">* 영어 또는 일본어 등 주제를 외국어로 주시면 해당 언어로 대본을 작성합니다.</span>
          </div>
          <div className="flex ml-auto bg-gray-100 p-1 rounded-lg">
            <button 
              onClick={() => setInputType('url')}
              className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${inputType === 'url' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              URL 입력
            </button>
            <button 
              onClick={() => setInputType('text')}
              className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${inputType === 'text' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              본문 직접 입력
            </button>
          </div>
        </div>

        {/* Main Input Area */}
        <div className="relative">
          {inputType === 'url' ? (
            <div className="relative group">
              <input 
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://news.naver.com/ 기사 주소를 입력하세요..."
                className="w-full px-5 py-3 bg-white border-2 border-gray-300 rounded-xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all text-sm font-medium"
              />
              <ExternalLink size={18} className="absolute right-5 top-3.5 text-gray-400" />
            </div>
          ) : (
            <div className="relative group">
              <textarea 
                value={directText}
                onChange={(e) => setDirectText(e.target.value)}
                placeholder="예시: 인공지능이 현대 교육 시스템에 미치는 영향을 설명해주세요..."
                className="w-full h-48 px-5 py-4 bg-white border-2 border-gray-300 rounded-xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all text-sm resize-none font-medium"
              />
            </div>
          )}
        </div>

        {/* Bottom Action Bar (영상 길이는 상단 제작 설정에서 정함) */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-gray-50">
          <div className="text-xs font-bold text-gray-300 tabular-nums">
            {inputType === 'text' ? `${directText.length} / 7,200 자` : 'URL 분석 대기 중'}
          </div>

          <div className="flex items-center gap-3 ml-auto">
            <span className="text-xs font-bold text-gray-400 tabular-nums">{duration}초 분량 대본 생성</span>
            <button
              onClick={handleScrape}
              disabled={(inputType === 'url' ? !url : !directText.trim()) || loading}
              className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 disabled:bg-gray-200 shadow-lg shadow-indigo-100 transition-all"
            >
              <Sparkles size={16} />
              대본 생성하기
            </button>
            <button
              onClick={() => onAutoMake('news')}
              disabled={(inputType === 'url' ? !url : !directText.trim()) || loading}
              title="대본부터 최종 영상까지 자동으로 만듭니다 (첫 후보 자동 선택)"
              className="flex items-center gap-2 px-6 py-2.5 bg-amber-500 text-white rounded-xl font-bold text-sm hover:bg-amber-600 disabled:bg-gray-200 shadow-lg shadow-amber-100 transition-all"
            >
              <Zap size={16} />
              자동으로 끝까지 만들기
            </button>
          </div>
        </div>
        </>
        ))}
          </div>
        )}
        {phase === 'pick' && (
          <div className="flex items-center gap-3 pt-2">
            <div className="flex-1 h-px bg-gray-100" />
            <p className="text-xs text-gray-400 font-medium whitespace-nowrap">
              만들 영상 종류를 먼저 고르면 입력 화면이 나타납니다
            </p>
            <div className="flex-1 h-px bg-gray-100" />
          </div>
        )}
      </div>
    </div>
  </div>
);
};

export default React.memo(Step1Input);
