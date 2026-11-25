import React from 'react';
import { Code2, Copy } from 'lucide-react';

const renderInlineText = (text: string, keyPrefix: string = '') => {
  const parts = text.split(
    /(`[^`]+`|\*\*.*?\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g
  );

  return parts.map((part, index) => {
    const key = `${keyPrefix}-${index}`;

    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code
          key={key}
          className="px-1.5 py-0.5 rounded-md bg-slate-950 border border-slate-700 text-blue-300 font-mono text-[11px]"
        >
          {part.slice(1, -1)}
        </code>
      );
    }

    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={key} className="font-semibold text-slate-100">
          {part.slice(2, -2)}
        </strong>
      );
    }

    if (part.startsWith('*') && part.endsWith('*')) {
      return (
        <em key={key} className="italic text-slate-200">
          {part.slice(1, -1)}
        </em>
      );
    }

    const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);

    if (linkMatch) {
      return (
        <a
          key={key}
          href={linkMatch[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-400 hover:text-blue-300 underline underline-offset-2"
        >
          {linkMatch[1]}
        </a>
      );
    }

    return <React.Fragment key={key}>{part}</React.Fragment>;
  });
};

export const renderFormattedMessage = (text: string) => {
  if (!text) return null;

  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const elements: React.ReactNode[] = [];

  let inCodeBlock = false;
  let codeLanguage = '';
  let codeLines: string[] = [];

  const flushCodeBlock = (index: number) => {
    if (!codeLines.length && !inCodeBlock) {
      return;
    }

    const code = codeLines.join('\n');

    elements.push(
      <div
        key={`code-${index}`}
        className="my-3 overflow-hidden rounded-xl border border-slate-700 bg-[#08090d]"
      >
        <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800 bg-slate-950">
          <div className="flex items-center gap-2 text-[10px] text-slate-400">
            <Code2 className="h-3.5 w-3.5 text-blue-400" />
            <span>{codeLanguage || 'code'}</span>
          </div>

          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(code);
            }}
            className="p-1 rounded-md text-slate-500 hover:text-slate-200 hover:bg-slate-800 transition"
            title="Copy code"
          >
            <Copy className="h-3 w-3" />
          </button>
        </div>

        <pre className="overflow-x-auto p-3 text-[11px] leading-relaxed text-slate-300 font-mono">
          <code>{code}</code>
        </pre>
      </div>
    );

    codeLines = [];
    codeLanguage = '';
  };

  lines.forEach((line, lineIdx) => {
    const trimmed = line.trim();

    if (trimmed.startsWith('```')) {
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeLanguage = trimmed.slice(3).trim();
      } else {
        inCodeBlock = false;
        flushCodeBlock(lineIdx);
      }

      return;
    }

    if (inCodeBlock) {
      codeLines.push(line);
      return;
    }

    if (!trimmed) {
      elements.push(
        <div
          key={`space-${lineIdx}`}
          className="h-1.5"
        />
      );

      return;
    }

    const isBullet =
      trimmed.startsWith('â€¢') ||
      trimmed.startsWith('* ') ||
      trimmed.startsWith('- ') ||
      /^\d+\.\s/.test(trimmed);

    if (isBullet) {
      const numbered = /^\d+\.\s/.test(trimmed);

      const cleanedLine = numbered
        ? trimmed.replace(/^\d+\.\s*/, '')
        : trimmed.replace(/^[-*â€¢]\s*/, '');

      elements.push(
        <div
          key={`line-${lineIdx}`}
          className="flex items-start gap-2 my-1 pl-1"
        >
          <span className="text-blue-400 font-bold select-none min-w-[12px]">
            {numbered
              ? trimmed.match(/^\d+/)?.[0]
              : 'â€¢'}
          </span>

          <span className="flex-1">
            {renderInlineText(
              cleanedLine,
              `line-${lineIdx}`
            )}
          </span>
        </div>
      );

      return;
    }

    if (trimmed.startsWith('#')) {
      const headingText = trimmed.replace(
        /^#+\s*/,
        ''
      );

      elements.push(
        <div
          key={`heading-${lineIdx}`}
          className="font-semibold text-slate-100 mt-2 mb-1"
        >
          {renderInlineText(
            headingText,
            `heading-${lineIdx}`
          )}
        </div>
      );

      return;
    }

    elements.push(
      <div
        key={`line-${lineIdx}`}
        className="my-1"
      >
        {renderInlineText(
          line,
          `line-${lineIdx}`
        )}
      </div>
    );
  });

  if (inCodeBlock) {
    flushCodeBlock(lines.length);
  }

  return elements;
};
