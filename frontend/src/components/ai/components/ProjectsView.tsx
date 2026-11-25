import { FolderKanban, PanelLeft } from 'lucide-react';

export const ProjectsView = () => (
  <div className="flex-1 p-6 space-y-4 overflow-y-auto">
    <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
      <FolderKanban className="h-4 w-4 text-blue-400" />
      <span>TRADARA Active Projects</span>
    </h3>

    <div className="space-y-2.5 pt-1">
      <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h4 className="text-xs font-bold text-slate-200">
              TRADARA OS Marketplace
            </h4>
            <p className="text-[11px] text-slate-400 mt-1">
              Full-stack React, TypeScript, Prisma, MongoDB &amp; Agentic AI.
            </p>
          </div>
          <PanelLeft className="h-4 w-4 text-blue-400" />
        </div>
      </div>

      <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800">
        <h4 className="text-xs font-bold text-slate-200">
          AI Intelligence Core
        </h4>
        <p className="text-[11px] text-slate-400 mt-1">
          General reasoning, marketplace assistance, tool execution, memory
          and negotiation.
        </p>
      </div>
    </div>
  </div>
);
