import { Pin, Plus, Search } from 'lucide-react';
import type { MouseEvent } from 'react';
import type { ChatThread } from '../types';

interface ThreadSearchBarProps {
  searchQuery: string;
  activeThreadId: string;
  pinnedThreads: ChatThread[];
  recentThreads: ChatThread[];
  onSearchChange: (value: string) => void;
  onNewChat: () => void;
  onSelectThread: (threadId: string) => void;
  onTogglePin: (event: MouseEvent, threadId: string) => void;
}

export const ThreadSearchBar = ({
  searchQuery,
  activeThreadId,
  pinnedThreads,
  recentThreads,
  onSearchChange,
  onNewChat,
  onSelectThread,
  onTogglePin
}: ThreadSearchBarProps) => (
  <div className="p-3 border-b border-slate-800/60 bg-slate-900/40 space-y-2.5">
    <div className="flex items-center justify-between gap-2">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500" />
        <input
          type="text"
          value={searchQuery}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search conversations..."
          className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500/50"
        />
      </div>

      <button
        onClick={onNewChat}
        className="px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-md shadow-blue-600/20"
      >
        <Plus className="h-3.5 w-3.5" />
        <span>New Chat</span>
      </button>
    </div>

    <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
      <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-1.5 py-1 flex items-center gap-1 flex-shrink-0">
        <Pin className="h-3 w-3 text-blue-400" />
        Chats:
      </div>

      {pinnedThreads.map((thread) => (
        <ThreadChip
          key={thread.id}
          thread={thread}
          active={activeThreadId === thread.id}
          onSelect={onSelectThread}
          onTogglePin={onTogglePin}
          pinned
        />
      ))}

      {recentThreads.slice(0, 5).map((thread) => (
        <ThreadChip
          key={thread.id}
          thread={thread}
          active={activeThreadId === thread.id}
          onSelect={onSelectThread}
          onTogglePin={onTogglePin}
        />
      ))}
    </div>
  </div>
);

interface ThreadChipProps {
  thread: ChatThread;
  active: boolean;
  pinned?: boolean;
  onSelect: (threadId: string) => void;
  onTogglePin: (event: MouseEvent, threadId: string) => void;
}

const ThreadChip = ({
  thread,
  active,
  pinned = false,
  onSelect,
  onTogglePin
}: ThreadChipProps) => (
  <div className="relative flex-shrink-0">
    <button
      onClick={() => onSelect(thread.id)}
      className={`px-2.5 py-1 pr-7 rounded-lg text-[11px] border transition-all truncate max-w-[160px] ${
        active
          ? 'bg-blue-600/30 border-blue-500 text-blue-300 font-medium'
          : pinned
            ? 'bg-slate-800/80 border-slate-700/50 text-slate-300 hover:bg-slate-800'
            : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800'
      }`}
    >
      {thread.title}
    </button>
    <button
      onClick={(event) => onTogglePin(event, thread.id)}
      className={`absolute right-1.5 top-1.5 ${
        pinned
          ? 'text-blue-400 hover:text-white'
          : 'opacity-40 hover:opacity-100 text-slate-400 hover:text-blue-400'
      }`}
      title={pinned ? 'Unpin' : 'Pin'}
    >
      <Pin className="h-2.5 w-2.5" />
    </button>
  </div>
);
