import React from 'react';
import { 
  Video, 
  Home, 
  Folder, 
  Settings as SettingsIcon,
  Film
} from 'lucide-react';

interface SidebarProps {
  activeMenu: string;
  setActiveMenu: (menu: string) => void;
}

const SidebarItem = React.memo(({ icon: Icon, label, active, onClick }: {
  icon: React.FC<{ size: number }>;
  label: string;
  active: boolean;
  onClick: () => void;
}) => (
  <button 
    onClick={onClick}
    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
      active 
        ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' 
        : 'text-gray-500 hover:bg-gray-100'
    }`}
  >
    <Icon size={18} />
    <span className="font-medium text-sm">{label}</span>
  </button>
));

const Sidebar: React.FC<SidebarProps> = ({ activeMenu, setActiveMenu }) => {
  return (
    <aside className="w-56 bg-white border-right border-gray-200 flex flex-col p-4 z-20 shadow-sm shrink-0">
      <div className="flex items-center gap-2 px-2 py-6 mb-4">
        <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white">
          <Video size={20} />
        </div>
        <span className="font-extrabold text-xl tracking-tight text-gray-900">
          VideoCreator<span className="text-indigo-600">.pro</span>
        </span>
      </div>

      <nav className="flex-1 space-y-1">
        <SidebarItem 
          icon={Home} 
          label="Home" 
          active={activeMenu === 'Home'} 
          onClick={() => setActiveMenu('Home')} 
        />
        <SidebarItem 
          icon={Folder} 
          label="Projects" 
          active={activeMenu === 'Projects'} 
          onClick={() => setActiveMenu('Projects')} 
        />
        <SidebarItem 
          icon={Film} 
          label="Editor" 
          active={activeMenu === 'Editor'} 
          onClick={() => setActiveMenu('Editor')} 
        />
        <SidebarItem 
          icon={SettingsIcon} 
          label="Settings" 
          active={activeMenu === 'Settings'} 
          onClick={() => setActiveMenu('Settings')} 
        />
      </nav>
    </aside>
  );
};

export default React.memo(Sidebar);
