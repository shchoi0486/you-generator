import React from 'react';
import { 
  ChevronRight, 
  Plus, 
  Save, 
  CheckCircle2 
} from 'lucide-react';

interface HeaderProps {
  activeMenu: string;
  handleNewProject: () => void;
  handleSaveProject: () => void;
  isSaving: boolean;
}

const Header: React.FC<HeaderProps> = ({ 
  activeMenu, 
  handleNewProject, 
  handleSaveProject, 
  isSaving 
}) => {
  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center px-8 z-10 justify-between">
      <div className="flex items-center gap-2 text-gray-400 text-sm">
        <span>Dashboard</span>
        <ChevronRight size={14} />
        <span className="text-gray-900 font-medium">{activeMenu}</span>
      </div>
      {(activeMenu === 'Home' || activeMenu === 'Editor') && (
        <div className="flex items-center gap-2">
          <button 
            onClick={handleNewProject}
            className="bg-gray-900 text-white px-4 py-1.5 rounded-full text-xs font-bold hover:bg-gray-800 transition-colors flex items-center gap-2"
          >
            <Plus size={12} />
            New Project
          </button>
          <button 
            onClick={handleSaveProject}
            disabled={isSaving}
            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-2 ${
              isSaving 
                ? 'bg-green-600 text-white shadow-lg shadow-green-100' 
                : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-md shadow-indigo-100'
            }`}
          >
            {isSaving ? <CheckCircle2 size={12} /> : <Save size={12} />}
            {isSaving ? '저장됨' : '저장'}
          </button>
        </div>
      )}
    </header>
  );
};

export default React.memo(Header);
