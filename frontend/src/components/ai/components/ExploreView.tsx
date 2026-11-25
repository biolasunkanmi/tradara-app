import { Compass } from 'lucide-react';

const capabilities = [
  {
    title: 'General Intelligence',
    text: 'Ask questions about science, history, technology, business, mathematics and everyday topics.'
  },
  {
    title: 'Coding Partner',
    text: 'Explain, debug, design and improve JavaScript, TypeScript, React, Node.js and other code.'
  },
  {
    title: 'Marketplace Agent',
    text: 'Understand products, compare information, negotiate where configured, and guide purchase workflows.'
  },
  {
    title: 'Reasoning & Planning',
    text: 'Break large problems into steps and help you work through complex tasks.'
  },
  {
    title: 'Conversation Memory',
    text: 'Maintain the current conversation context so follow-up questions make sense.'
  }
];

export const ExploreView = () => (
  <div className="flex-1 p-6 space-y-4 overflow-y-auto">
    <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
      <Compass className="h-4 w-4 text-blue-400" />
      <span>Explore AI Intelligence</span>
    </h3>

    <p className="text-xs text-slate-400">
      Use Tradara AI for much more than product negotiation.
    </p>

    <div className="space-y-2 pt-1">
      {capabilities.map((item) => (
        <div
          key={item.title}
          className="p-3 rounded-xl bg-slate-900 border border-slate-800"
        >
          <span className="font-bold text-blue-400 block mb-1 text-xs">
            {item.title}
          </span>
          <span className="text-slate-400 text-[11px]">{item.text}</span>
        </div>
      ))}
    </div>
  </div>
);
