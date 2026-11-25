import { ArrowLeft, X } from 'lucide-react';

interface SidebarHeaderProps {
  connectionState: 'ready' | 'connecting' | 'online' | 'error';
  connectionLabel: string;
  threadTitle?: string;
  onClose: () => void;
}

export const SidebarHeader = ({
  connectionState,
  connectionLabel,
  threadTitle,
  onClose
}: SidebarHeaderProps) => (
  <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between bg-[#0f0f13]/90 backdrop-blur-md">
    <div className="flex items-center gap-3 min-w-0">
      <button
        onClick={onClose}
        title="Return to Marketplace"
        className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white transition-all flex items-center justify-center shadow-sm"
      >
        <ArrowLeft className="h-4 w-4" />
      </button>

      <div className="flex items-center gap-2.5 min-w-0">
        <div
          className={`h-2.5 w-2.5 rounded-full ${
            connectionState === 'error'
              ? 'bg-rose-500'
              : connectionState === 'connecting'
                ? 'bg-amber-400 animate-pulse'
                : 'bg-blue-500 animate-pulse'
          }`}
        />

        <div className="min-w-0">
          <h2 className="text-xs font-bold tracking-wider text-slate-100 flex items-center gap-1.5">
            <span>TRADARA AI</span>
            <span className="px-1.5 py-0.5 rounded text-[9px] bg-blue-500/20 text-blue-400 font-mono border border-blue-500/30">
              AGENTIC
            </span>
          </h2>
          <p className="text-[10px] text-slate-400 truncate">
            {connectionLabel}
            {threadTitle ? ` â€¢ ${threadTitle}` : ''}
          </p>
        </div>
      </div>
    </div>

    <button
      onClick={onClose}
      title="Return to Marketplace"
      className="px-2.5 py-1.5 rounded-xl bg-slate-900 hover:bg-rose-500/20 border border-slate-800 hover:border-rose-500/40 text-slate-300 hover:text-rose-400 transition-all flex items-center gap-1.5 shadow-sm text-xs font-semibold"
    >
      <span className="hidden sm:inline">Return</span>
      <X className="h-4 w-4 text-rose-400 font-bold" />
    </button>
  </div>
);
