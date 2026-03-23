import React from 'react';
import { RefreshCw, Download } from 'lucide-react';

interface Step6ExportProps {
  renderResult: { video_path?: string; videoUrl?: string; [key: string]: string | number | undefined } | null;
  handleNewProject: () => void;
}

const Step6Export: React.FC<Step6ExportProps> = ({
  renderResult,
  handleNewProject
}) => {
  if (!renderResult) return null;

  const videoPath = renderResult.video_path || renderResult.videoUrl || '';
  const videoFilename = videoPath.split(/[\\/]/).pop();
  const videoUrl = `http://localhost:8000/exports/${videoFilename}`;

  return (
    <div className="flex-1 w-full flex flex-col items-center overflow-hidden min-h-0 bg-gray-900 rounded-3xl p-4 md:p-6 animate-in fade-in zoom-in-95 duration-500">
      <div className="flex-1 w-full max-w-6xl mx-auto relative group">
        <div className="absolute inset-0 bg-indigo-500/10 blur-3xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-1000"></div>
        <div className="relative h-full w-full bg-black rounded-2xl overflow-hidden shadow-2xl flex items-center justify-center border border-white/5">
          <video 
            controls 
            autoPlay
            className="w-full h-full object-contain"
            src={videoUrl}
          />
        </div>
      </div>

      <div className="flex gap-4 w-full max-w-6xl mx-auto shrink-0 mt-6">
        <button 
          onClick={handleNewProject}
          className="flex-1 bg-white/5 hover:bg-white/10 text-white font-bold py-4 rounded-2xl transition-all flex items-center justify-center gap-3 border border-white/10 backdrop-blur-sm shadow-lg text-base"
        >
          <RefreshCw size={20} className="text-indigo-400" />
          새 프로젝트 시작
        </button>
        <a 
          href={videoUrl}
          download
          className="flex-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-2xl shadow-xl shadow-indigo-900/40 transition-all flex items-center justify-center gap-3 text-base"
        >
          <Download size={20} />
          최종 비디오 다운로드
        </a>
      </div>
    </div>
  );
};

export default React.memo(Step6Export);
