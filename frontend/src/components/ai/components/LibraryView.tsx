import { Image as ImageIcon } from 'lucide-react';

export const LibraryView = () => (
  <div className="flex-1 p-6 space-y-4 overflow-y-auto">
    <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
      <ImageIcon className="h-4 w-4 text-blue-400" />
      <span>Library &amp; Media Gallery</span>
    </h3>

    <p className="text-xs text-slate-400">
      Saved visual assets, marketplace product snapshots, conversation
      resources, and generated design files.
    </p>

    <div className="grid grid-cols-2 gap-3 pt-2">
      <div className="h-28 rounded-xl bg-slate-900 border border-slate-800 p-3 flex flex-col justify-between opacity-80">
        <span className="text-[10px] font-mono text-blue-400">
          MARKETPLACE_UI.png
        </span>
        <span className="text-[11px] text-slate-300 font-medium">
          Dashboard Mockup
        </span>
      </div>
      <div className="h-28 rounded-xl bg-slate-900 border border-slate-800 p-3 flex flex-col justify-between opacity-80">
        <span className="text-[10px] font-mono text-blue-400">
          HERO_BANNER.png
        </span>
        <span className="text-[11px] text-slate-300 font-medium">
          Global Asset
        </span>
      </div>
      <div className="h-28 rounded-xl bg-slate-900 border border-slate-800 p-3 flex flex-col justify-between">
        <span className="text-[10px] font-mono text-slate-500">
          AI_CONTEXT
        </span>
        <span className="text-[11px] text-slate-300 font-medium">
          Conversation intelligence
        </span>
      </div>
      <div className="h-28 rounded-xl bg-slate-900 border border-slate-800 p-3 flex flex-col justify-between">
        <span className="text-[10px] font-mono text-slate-500">
          PRODUCT_CONTEXT
        </span>
        <span className="text-[11px] text-slate-300 font-medium">
          Active product information
        </span>
      </div>
    </div>
  </div>
);
