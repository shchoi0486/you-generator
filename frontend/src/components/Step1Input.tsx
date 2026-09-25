import React from 'react';
import { Edit2, FileText, ExternalLink, Clock, Sparkles, Users, Clapperboard, ChefHat, ShoppingBag, Lightbulb, Plane } from 'lucide-react';
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
  setDuration: (duration: number) => void;
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
  shortsDuration: number;
  setShortsDuration: (v: number) => void;
  shortsCategory: string;
  setShortsCategory: (v: string) => void;
  onShortsComplete: (article: Article, content: AppContent) => void;
  onShortsDirectCreate: (topic: string, duration: number, category: string) => void;
  handleScrape: () => void;
  loading: boolean;
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
  shortsDuration,
  setShortsDuration,
  shortsCategory,
  setShortsCategory,
  onShortsComplete,
  onShortsDirectCreate,
  handleScrape,
  loading
}) => {
  const isNews = templateId === 'news_duo' || templateId === 'news_solo';
  const isShortsCat = templateId === 'recipe_short' || templateId === 'review_short' || templateId === 'knowledge_short' || templateId === 'travel_short';
  const isShortsLab = templateId === 'shorts_lab' || isShortsCat;
  return (
    <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar pb-10">
      <div className="space-y-8 max-w-4xl mx-auto">
        {/* Title Section */}
      <div className="space-y-2">
        <h2 className="text-3xl font-extrabold text-gray-900 tracking-tight">어떤 영상을 만들고 싶으세요?</h2>
        <p className="text-gray-500 font-medium">주제나 대본을 입력하면 구조화를 도와드립니다.</p>
      </div>
      
      <div className="space-y-6">
        {/* Template Select */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            onClick={() => setTemplateId(templateId === 'news_solo' ? 'news_solo' : 'news_duo')}
            className={`flex items-center gap-3 p-4 rounded-xl border-2 text-left transition-all ${
              isNews
                ? 'border-indigo-500 bg-indigo-50/60 shadow-md shadow-indigo-100'
                : 'border-gray-200 bg-white hover:border-gray-300'
            }`}
          >
            <div className={`p-2 rounded-lg ${isNews ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-500'}`}>
              <Users size={18} />
            </div>
            <div>
              <p className={`text-sm font-bold ${isNews ? 'text-indigo-700' : 'text-gray-700'}`}>뉴스 / 이슈 브리핑</p>
              <p className="text-[11px] text-gray-400 font-medium">기사 URL로 대본 생성</p>
            </div>
          </button>
          <button
            onClick={() => setTemplateId('shorts_lab')}
            className={`flex items-center gap-3 p-4 rounded-xl border-2 text-left transition-all ${
              isShortsLab
                ? 'border-indigo-500 bg-indigo-50/60 shadow-md shadow-indigo-100'
                : 'border-gray-200 bg-white hover:border-gray-300'
            }`}
          >
            <div className={`p-2 rounded-lg ${isShortsLab ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-500'}`}>
              <Clapperboard size={18} />
            </div>
            <div>
              <p className={`text-sm font-bold ${isShortsLab ? 'text-indigo-700' : 'text-gray-700'}`}>숏폼 분석·재창작</p>
              <p className="text-[11px] text-gray-400 font-medium">파일/유튜브 분석 후 패턴으로 새로 만들기</p>
            </div>
          </button>
        </div>

        {isShortsLab && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {SHORTS_CATEGORIES.map((c) => {
              const Icon = c.icon;
              const active = shortsCategory === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => setShortsCategory(c.id)}
                  title={c.desc}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${active ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'bg-white border-gray-100 text-gray-400'}`}
                >
                  <Icon size={14} />
                  {c.name}
                </button>
              );
            })}
          </div>
        )}

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

        {isShortsLab ? (
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
            duration={shortsDuration}
            setDuration={setShortsDuration}
            category={shortsCategory}
            setCategory={setShortsCategory}
            onDirectCreate={onShortsDirectCreate}
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

        {/* Bottom Action Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-gray-50">
          <div className="text-xs font-bold text-gray-300 tabular-nums">
            {inputType === 'text' ? `${directText.length} / 7,200 자` : 'URL 분석 대기 중'}
          </div>
          
          <div className="flex items-center gap-3 ml-auto">
              <div className="flex items-center gap-1.5 mr-2">
                {[
                  { label: '30초', value: 30 },
                  { label: '1분', value: 60 },
                  { label: '3분', value: 180 },
                  { label: '5분', value: 300 },
                  { label: '10분', value: 600 },
                  { label: '15분', value: 900 }
                ].map((preset) => (
                  <button
                    key={preset.value}
                    onClick={() => setDuration(preset.value)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all border ${
                      duration === preset.value 
                        ? 'bg-indigo-50 border-indigo-200 text-indigo-600' 
                        : 'bg-white border-gray-100 text-gray-400 hover:border-gray-200 hover:text-gray-600'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border border-gray-200" aria-label="영상 길이(초)">
                <Clock size={16} className="text-gray-400" />
                <input 
                  type="number" 
                  value={duration}
                  onChange={(e) => setDuration(parseInt(e.target.value) || 0)}
                  placeholder="초"
                  title="영상 길이(초)"
                  className="w-14 bg-transparent text-sm font-bold text-gray-700 outline-none"
                />
                <span className="text-xs font-bold text-gray-400">초 분량 대본 생성</span>
              </div>
            
            <button 
              onClick={handleScrape}
              disabled={(inputType === 'url' ? !url : !directText.trim()) || loading}
              className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 disabled:bg-gray-200 shadow-lg shadow-indigo-100 transition-all"
            >
              <Sparkles size={16} />
              대본 생성하기
            </button>
          </div>
        </div>
        </>
        )}
      </div>
    </div>
  </div>
);
};

export default React.memo(Step1Input);
