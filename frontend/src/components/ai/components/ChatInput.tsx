import type { FormEvent, RefObject } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Send,
  StopCircle,
  Zap
} from 'lucide-react';

interface ChatInputProps {
  inputRef: RefObject<HTMLInputElement | null>;
  currentMessage: string;
  isProductContextActive: boolean;
  isGenerating: boolean;
  connectionState: 'ready' | 'connecting' | 'online' | 'error';
  onMessageChange: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
}

export const ChatInput = ({
  inputRef,
  currentMessage,
  isProductContextActive,
  isGenerating,
  connectionState,
  onMessageChange,
  onSubmit,
  onStop
}: ChatInputProps) => {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isGenerating) {
      onStop();
      return;
    }

    onSubmit();
  };

  return (
    <div className="p-3 border-t border-slate-800 bg-[#0f0f13]">
      <form
        onSubmit={handleSubmit}
        className="relative flex items-center"
      >
        <input
          ref={inputRef}
          type="text"
          value={currentMessage}
          onChange={(event) => onMessageChange(event.target.value)}
          placeholder={
            isProductContextActive
              ? 'Ask about the product, price, specs, or anything else...'
              : 'Ask anything or give Tradara AI an instruction...'
          }
          className="w-full bg-slate-900 border border-slate-800 rounded-2xl pl-4 pr-12 py-3 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500/50 shadow-inner"
        />
        <button
          type="submit"
          disabled={!currentMessage.trim() && !isGenerating}
          className={`absolute right-2 p-2 rounded-xl text-white transition-all shadow-md ${
            isGenerating
              ? 'bg-rose-600 hover:bg-rose-500 shadow-rose-600/20'
              : 'bg-blue-600 hover:bg-blue-500 shadow-blue-600/20'
          } disabled:opacity-40`}
          title={isGenerating ? 'Stop generation' : 'Send message'}
        >
          {isGenerating ? (
            <StopCircle className="h-3.5 w-3.5" />
          ) : (
            <Send className="h-3.5 w-3.5" />
          )}
        </button>
      </form>

      <div className="flex items-center justify-between mt-2 px-1 text-[10px] text-slate-500">
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          Ctrl/âŒ˜ + K to focus
        </span>
        <span className="flex items-center gap-1">
          {connectionState === 'online' ? (
            <>
              <CheckCircle2 className="h-3 w-3 text-blue-400" />
              AI connected
            </>
          ) : connectionState === 'error' ? (
            <>
              <AlertCircle className="h-3 w-3 text-rose-400" />
              Backend unavailable
            </>
          ) : (
            <>
              <Zap className="h-3 w-3 text-blue-400" />
              {isGenerating ? 'Processing' : 'Ready'}
            </>
          )}
        </span>
      </div>
    </div>
  );
};
