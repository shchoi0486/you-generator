import React from 'react';
import { Folder, Plus, Video, Trash2, Clock, CheckCircle2 } from 'lucide-react';
import { type ProjectMeta } from '../services/api';

interface ProjectListProps {
  projectId: string;
  projects: ProjectMeta[];
  handleNewProject: () => void;
  handleLoadProject: (id: string) => void;
  handleDeleteProject: (id: string) => void;
}

const ProjectList: React.FC<ProjectListProps> = ({
  projectId,
  projects,
  handleNewProject,
  handleLoadProject,
  handleDeleteProject
}) => {
  const projectsList = [...projects].sort((a: ProjectMeta, b: ProjectMeta) => {
    const timeA = a.lastModified ? new Date(a.lastModified).getTime() : 0;
    const timeB = b.lastModified ? new Date(b.lastModified).getTime() : 0;
    return timeB - timeA;
  });

  return (
    <div className="bg-white rounded-3xl shadow-2xl shadow-gray-200/40 border border-gray-100 p-4 md:p-10 flex-1 w-full flex flex-col overflow-hidden min-h-0">
      <div className="flex items-center justify-between mb-8 shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
            <Folder size={20} />
          </div>
          <h2 className="text-2xl font-bold text-gray-900">프로젝트 관리</h2>
        </div>
        <button 
          onClick={handleNewProject}
          className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg shadow-indigo-200 transition-all flex items-center gap-2"
        >
          <Plus size={18} />
          새 프로젝트 만들기
        </button>
      </div>

      <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar pb-10">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projectsList.length === 0 ? (
            <div className="col-span-full py-20 flex flex-col items-center justify-center text-gray-400 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200 flex-1">
              <Folder size={48} className="mb-4 opacity-20" />
              <p className="font-bold">저장된 프로젝트가 없습니다.</p>
              <p className="text-sm">새 프로젝트를 시작해보세요!</p>
            </div>
          ) : (
            projectsList.map((p: ProjectMeta) => (
              <div 
                key={p.id} 
                className={`group p-5 rounded-3xl border-2 transition-all cursor-pointer hover:shadow-2xl hover:shadow-gray-200/40 ${
                  p.id === projectId 
                    ? 'border-indigo-600 bg-indigo-50/30 ring-4 ring-indigo-500/5 shadow-xl shadow-indigo-100/20' 
                    : 'border-gray-100 bg-white hover:border-indigo-200 shadow-sm'
                }`}
                onClick={() => handleLoadProject(p.id)}
              >
                <div className="flex justify-between items-start mb-4">
                  <div className={`p-2 rounded-lg ${p.id === projectId ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-400 group-hover:bg-indigo-100 group-hover:text-indigo-600'}`}>
                    <Video size={18} />
                  </div>
                  <button
                    title="Delete project"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteProject(p.id);
                    }}
                    className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                
                <div className="space-y-1 mb-4">
                  <h3 className="font-bold text-gray-900 truncate group-hover:text-indigo-600 transition-colors">
                    {p.projectName || '제목 없는 프로젝트'}
                  </h3>
                  <div className="flex items-center gap-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                    <Clock size={10} />
                    {p.lastModified ? new Date(p.lastModified).toLocaleString() : '날짜 정보 없음'}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-gray-50">
                  <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-tighter ${
                    p.currentStep === 5 ? 'bg-green-100 text-green-600' : 'bg-indigo-100 text-indigo-600'
                  }`}>
                    Step {p.currentStep || 1} / 5
                  </span>
                  {p.id === projectId && (
                    <span className="text-[10px] font-bold text-indigo-600 flex items-center gap-1">
                      <CheckCircle2 size={10} /> 현재 작업 중
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default React.memo(ProjectList);
