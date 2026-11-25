import { AlertCircle, X } from 'lucide-react';

interface ErrorBannerProps {
  errorMessage: string;
  onDismiss: () => void;
}

export const ErrorBanner = ({
  errorMessage,
  onDismiss
}: ErrorBannerProps) => (
  <div className="mx-3 mb-2 rounded-xl border border-rose-800/50 bg-rose-950/20 px-3 py-2.5">
    <div className="flex items-start gap-2">
      <AlertCircle className="h-4 w-4 text-rose-400 flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-semibold text-rose-300">
          AI connection problem
        </p>
        <p className="text-[10px] text-slate-400 mt-0.5 break-words">
          {errorMessage}
        </p>
      </div>
      <button
        onClick={onDismiss}
        className="text-slate-500 hover:text-slate-200"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  </div>
);
