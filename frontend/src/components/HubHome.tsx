import React from 'react';
import { Clapperboard, Megaphone, Send, ArrowRight } from 'lucide-react';

export type HubId = 'auto' | 'marketing' | 'posting';

interface HubHomeProps {
  onSelect: (hub: HubId) => void;
}

const HUBS: Array<{
  id: HubId;
  name: string;
  desc: string;
  tools: string[];
  icon: React.FC<{ size: number; className?: string }>;
  accent: string;
  chip: string;
}> = [
  {
    id: 'auto',
    name: 'AI 자동화 영상',
    desc: '유튜브 롱폼·쇼츠를 대본부터 렌더까지 자동으로',
    tools: ['롱폼', '쇼츠', '자동 제작'],
    icon: Clapperboard,
    accent: 'bg-indigo-600',
    chip: 'bg-indigo-50 text-indigo-600',
  },
  {
    id: 'marketing',
    name: 'AI 마케팅',
    desc: '광고·인플루언서·제품컷·모델컷·상세페이지',
    tools: ['광고 영상', '인플루언서 쇼츠', 'AI 제품컷', 'AI 모델컷', '상세페이지'],
    icon: Megaphone,
    accent: 'bg-rose-500',
    chip: 'bg-rose-50 text-rose-600',
  },
  {
    id: 'posting',
    name: 'AI 포스팅',
    desc: '블로그 글을 자동으로 만들고 발행까지',
    tools: ['WordPress', 'Naver'],
    icon: Send,
    accent: 'bg-emerald-500',
    chip: 'bg-emerald-50 text-emerald-600',
  },
];

const HubHome: React.FC<HubHomeProps> = ({ onSelect }) => {
  return (
    <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-y-auto custom-scrollbar">
      <div className="max-w-5xl w-full mx-auto py-8 px-2 space-y-6">
        <div className="space-y-2 text-center">
          <h2 className="text-3xl font-extrabold text-gray-900 tracking-tight">무엇을 만들까요?</h2>
          <p className="text-gray-500 font-medium">만들 종류를 먼저 고르면 전용 화면으로 이동합니다.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {HUBS.map((hub) => {
            const Icon = hub.icon;
            return (
              <button
                key={hub.id}
                onClick={() => onSelect(hub.id)}
                className="group flex flex-col items-start gap-4 p-6 rounded-3xl border-2 border-gray-100 bg-white hover:border-indigo-300 hover:shadow-xl hover:shadow-indigo-100/50 transition-all text-left"
              >
                <div className="flex items-center justify-between w-full">
                  <div className={`p-3 rounded-2xl ${hub.accent} text-white shadow-md`}>
                    <Icon size={24} />
                  </div>
                  <ArrowRight size={18} className="text-gray-300 group-hover:text-indigo-500 group-hover:translate-x-1 transition-all" />
                </div>
                <div>
                  <p className="text-lg font-extrabold text-gray-900">{hub.name}</p>
                  <p className="text-xs text-gray-500 font-medium mt-1 leading-relaxed">{hub.desc}</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {hub.tools.map((t) => (
                    <span key={t} className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${hub.chip}`}>
                      {t}
                    </span>
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default React.memo(HubHome);
