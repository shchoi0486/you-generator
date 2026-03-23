import React from 'react';
import { Edit2, FileText, ExternalLink, Clock, Sparkles } from 'lucide-react';

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
  handleScrape,
  loading
}) => {
  return (
    <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar pb-10">
      <div className="space-y-8 max-w-4xl mx-auto">
        {/* Title Section */}
      <div className="space-y-2">
        <h2 className="text-3xl font-extrabold text-gray-900 tracking-tight">어떤 영상을 만들고 싶으세요?</h2>
        <p className="text-gray-500 font-medium">주제나 대본을 입력하면 구조화를 도와드립니다.</p>
      </div>
      
      <div className="space-y-6">
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
      </div>
    </div>
  </div>
);
};

export default React.memo(Step1Input);
