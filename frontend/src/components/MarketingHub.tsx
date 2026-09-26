import React from 'react';
import { Clapperboard, Smile, Package, Shirt, LayoutTemplate, ArrowLeft, Hammer } from 'lucide-react';

type ToolId = 'ad' | 'influencer' | 'product' | 'model' | 'detail';

const TOOLS: Array<{
  id: ToolId;
  name: string;
  desc: string;
  needs: string[];
  icon: React.FC<{ size: number; className?: string }>;
}> = [
  {
    id: 'ad',
    name: '광고 영상',
    desc: '제품·서비스 TVC급 광고 영상 제작',
    needs: ['제품명·핵심 장점·타깃', '제품 사진', '10~100초 길이 선택'],
    icon: Clapperboard,
  },
  {
    id: 'influencer',
    name: '인플루언서 쇼츠',
    desc: '인플루언서를 고르면 제품에 맞춰 쇼츠 자동 제작',
    needs: ['인플루언서 선택', '제품 사진 업로드'],
    icon: Smile,
  },
  {
    id: 'product',
    name: 'AI 제품컷',
    desc: '제품 사진 한 장을 감성 연출컷으로',
    needs: ['제품 사진 1장', '스타일 선택'],
    icon: Package,
  },
  {
    id: 'model',
    name: 'AI 모델컷',
    desc: '옷 사진만 올리면 AI 모델이 입고 촬영',
    needs: ['의류 사진', '모델 스타일 선택'],
    icon: Shirt,
  },
  {
    id: 'detail',
    name: '상세페이지',
    desc: '상품 정보로 상세페이지 이미지 제작',
    needs: ['상품명·가격·특징', '제품 사진'],
    icon: LayoutTemplate,
  },
];

const MarketingHub: React.FC = () => {
  const [tool, setTool] = React.useState<ToolId | null>(null);
  const active = TOOLS.find((t) => t.id === tool);

  if (active) {
    const Icon = active.icon;
    return (
      <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-y-auto custom-scrollbar">
        <div className="max-w-3xl w-full mx-auto py-6 px-2 space-y-5">
          <button
            onClick={() => setTool(null)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:text-gray-700 transition-all w-fit"
          >
            <ArrowLeft size={14} />
            마케팅 도구 목록
          </button>
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-8 space-y-5">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-rose-500 text-white shadow-md">
                <Icon size={24} />
              </div>
              <div>
                <h2 className="text-xl font-extrabold text-gray-900">{active.name}</h2>
                <p className="text-xs text-gray-500 font-medium">{active.desc}</p>
              </div>
              <span className="ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-amber-50 border border-amber-200 text-amber-600">
                <Hammer size={12} />
                준비중
              </span>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-black text-gray-400 uppercase tracking-wider">필요한 입력</p>
              {active.needs.map((n) => (
                <div key={n} className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm font-medium text-gray-400">
                  {n}
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-400 font-medium leading-relaxed">
              이 도구는 현재 준비 중입니다. 입력 항목이 확정되는 대로 생성 화면이 열립니다.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-y-auto custom-scrollbar">
      <div className="max-w-5xl w-full mx-auto py-8 px-2 space-y-6">
        <div className="space-y-2">
          <h2 className="text-2xl font-extrabold text-gray-900 tracking-tight">AI 마케팅</h2>
          <p className="text-gray-500 font-medium text-sm">제품을 파는 데 필요한 영상을 만듭니다. 도구를 선택하세요.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {TOOLS.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setTool(t.id)}
                className="group flex items-center gap-4 p-5 rounded-3xl border-2 border-gray-100 bg-white hover:border-rose-300 hover:shadow-xl hover:shadow-rose-100/50 transition-all text-left"
              >
                <div className="p-3 rounded-2xl bg-rose-50 text-rose-500 group-hover:bg-rose-500 group-hover:text-white transition-all shrink-0">
                  <Icon size={22} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-base font-extrabold text-gray-900">{t.name}</p>
                    <span className="px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-amber-50 border border-amber-200 text-amber-600">
                      준비중
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 font-medium mt-0.5 truncate">{t.desc}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default React.memo(MarketingHub);
