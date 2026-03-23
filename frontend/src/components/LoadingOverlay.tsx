import React, { useState, useEffect } from 'react';

interface LoadingOverlayProps {
  loading: boolean;
  progress: {
    status?: string;
    progress?: number;
    message?: string;
    [key: string]: string | number | boolean | undefined | null;
  } | null;
  handleCancelTask: () => void;
}

const LoadingOverlay: React.FC<LoadingOverlayProps> = ({ loading, progress, handleCancelTask }) => {
  const [displayedProgress, setDisplayedProgress] = useState(0);

  // Smooth loading progress animation
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    if (loading) {
      const targetProgress = progress?.progress || 0;
      
      if (displayedProgress < targetProgress) {
        // 실제 진행률까지 빠르게 추격
        timer = setTimeout(() => {
          setDisplayedProgress(prev => Math.min(prev + 1, targetProgress));
        }, 20);
      } else if (displayedProgress >= targetProgress && displayedProgress < 99) {
        // 실제 진행률에 도달했어도 99%까지는 아주 천천히 가상으로 진행
        const incrementSpeed = displayedProgress < 90 ? 1500 : 5000;
        timer = setTimeout(() => {
          setDisplayedProgress(prev => prev + 1);
        }, incrementSpeed);
      }
    } else {
      timer = setTimeout(() => setDisplayedProgress(0), 0);
    }
    return () => clearTimeout(timer);
  }, [loading, progress?.progress, displayedProgress]);

  if (!loading) return null;

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/40 backdrop-blur-sm transition-all duration-300">
      <div className="text-center max-w-md w-full px-6 py-10 bg-white rounded-3xl shadow-2xl border border-gray-100 relative overflow-hidden">
        
        <div className="relative mb-6 inline-block">
          <div className="w-16 h-16 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-8 h-8 bg-indigo-50 rounded-full animate-pulse flex items-center justify-center">
              <div className="w-1.5 h-1.5 bg-indigo-600 rounded-full"></div>
            </div>
          </div>
        </div>
        <h3 className="text-xl font-black text-gray-900 mb-1 tracking-tight">
          {progress?.message || "잠시만 기다려 주세요"}
        </h3>
        <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-[0.2em] mb-6">AI Processing...</p>
        
        <div className="w-full bg-gray-100 h-2.5 rounded-full overflow-hidden mb-3 border border-gray-50 shadow-inner">
          <div 
            className="h-full bg-gradient-to-r from-indigo-500 to-purple-600 transition-all duration-500 ease-out relative"
            style={{ width: `${displayedProgress}%` }}
          >
            <div className="absolute top-0 right-0 h-full w-2 bg-white/20 animate-pulse"></div>
          </div>
        </div>
        <div className="flex justify-between items-center text-[11px] font-black mb-8">
          <span className="text-indigo-600 px-2 py-0.5 bg-indigo-50 rounded-md uppercase tracking-tighter shadow-sm border border-indigo-100/50">
            {progress?.status || 'Active'}
          </span>
          <span className="text-gray-400 tabular-nums font-bold">{displayedProgress}%</span>
        </div>

        {/* Cancellation Button */}
        <button 
          onClick={handleCancelTask}
          className="w-full py-3 bg-gray-50 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded-2xl text-xs font-bold transition-all border border-gray-100 hover:border-red-100 flex items-center justify-center gap-2 group"
        >
          <div className="w-1.5 h-1.5 bg-gray-300 group-hover:bg-red-400 rounded-full transition-colors"></div>
          작업 취소하기
        </button>
      </div>
    </div>
  );
};

export default React.memo(LoadingOverlay);
