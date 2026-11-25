import {
  Compass,
  FolderKanban,
  Image as ImageIcon,
  MessageSquare,
  Settings,
  Sparkles,
  User
} from 'lucide-react';

type AiTab = 'chat' | 'library' | 'projects' | 'explore';

interface SidebarNavigationProps {
  activeTab: AiTab;
  isAuthenticated: boolean;
  userInitials: string;
  userTitle?: string;
  onTabChange: (tab: AiTab) => void;
}

export const SidebarNavigation = ({
  activeTab,
  isAuthenticated,
  userInitials,
  userTitle,
  onTabChange
}: SidebarNavigationProps) => (
  <div className="w-16 bg-[#070709] border-r border-slate-800/80 flex flex-col items-center py-4 justify-between select-none">
    <div className="space-y-4 flex flex-col items-center">
      <div
        className="h-10 w-10 rounded-xl bg-gradient-to-tr from-blue-600 to-sky-400 flex items-center justify-center shadow-lg shadow-blue-500/20 cursor-pointer"
        title="Tradara AI"
      >
        <Sparkles className="h-5 w-5 text-white" />
      </div>

      <div className="w-8 h-[1px] bg-slate-800" />

      <button
        onClick={() => onTabChange('chat')}
        title="Chat Workspace"
        className={`p-2.5 rounded-xl transition-all ${
          activeTab === 'chat'
            ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
        }`}
      >
        <MessageSquare className="h-5 w-5" />
      </button>

      <button
        onClick={() => onTabChange('library')}
        title="Library & Media"
        className={`p-2.5 rounded-xl transition-all ${
          activeTab === 'library'
            ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
        }`}
      >
        <ImageIcon className="h-5 w-5" />
      </button>

      <button
        onClick={() => onTabChange('projects')}
        title="Projects"
        className={`p-2.5 rounded-xl transition-all ${
          activeTab === 'projects'
            ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
        }`}
      >
        <FolderKanban className="h-5 w-5" />
      </button>

      <button
        onClick={() => onTabChange('explore')}
        title="Explore Intelligence"
        className={`p-2.5 rounded-xl transition-all ${
          activeTab === 'explore'
            ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
        }`}
      >
        <Compass className="h-5 w-5" />
      </button>
    </div>

    <div className="space-y-3 flex flex-col items-center">
      <button
        className="p-2.5 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-900 transition-all"
        title="Settings"
      >
        <Settings className="h-5 w-5" />
      </button>

      {isAuthenticated && userInitials ? (
        <div
          className="h-9 w-9 rounded-full bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-xs font-bold text-blue-400 shadow-sm"
          title={userTitle || 'Logged in user'}
        >
          {userInitials}
        </div>
      ) : (
        <div
          className="h-9 w-9 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-500 shadow-sm"
          title="Guest"
        >
          <User className="h-4 w-4 opacity-60" />
        </div>
      )}
    </div>
  </div>
);
