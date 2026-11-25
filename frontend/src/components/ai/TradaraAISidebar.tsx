import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { ChatThread, Message, TradaraAISidebarProps } from './types';
import { renderFormattedMessage } from './markdownRenderer';
import { buildHistory, buildProductPayload, resolveProductId } from './utils/chatHelpers';
import { ChatInput } from './components/ChatInput';
import { ErrorBanner } from './components/ErrorBanner';
import { ExploreView } from './components/ExploreView';
import { LibraryView } from './components/LibraryView';
import { ProjectsView } from './components/ProjectsView';
import { SidebarHeader } from './components/SidebarHeader';
import { SidebarNavigation } from './components/SidebarNavigation';
import { ThreadSearchBar } from './components/ThreadSearchBar';

type AiTab = 'chat' | 'library' | 'projects' | 'explore';

type ConnectionState = 'ready' | 'connecting' | 'online' | 'error';

const getWelcomeText = (initialContext?: TradaraAISidebarProps['initialContext']) => {
  if (initialContext?.productName) {
    return `Hello! I’m Tradara AI. I can help you understand, compare, and negotiate "${initialContext.productName}"${initialContext.price ? `, currently listed at ${initialContext.currency || '₦'}${initialContext.price}` : ''}.`;
  }

  return 'Hello! I’m Tradara AI. Ask me anything — general questions, coding, mathematics, business, product research, or marketplace guidance.';
};

export const TradaraAISidebar: React.FC<TradaraAISidebarProps> = ({
  isOpen,
  onClose,
  initialContext,
  isAuthenticated = false,
  currentUser
}) => {
  const [activeTab, setActiveTab] = useState<AiTab>('chat');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentMessage, setCurrentMessage] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>('ready');
  const [errorMessage, setErrorMessage] = useState('');
  const [generationController, setGenerationController] = useState<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const buyerSession = useMemo(() => {
    if (typeof window === 'undefined') return 'session_fallback';
    const stored = localStorage.getItem('tradara_buyer_session');
    if (stored) return stored;
    const next = `session_${Math.random().toString(36).slice(2, 15)}${Date.now().toString(36)}`;
    localStorage.setItem('tradara_buyer_session', next);
    return next;
  }, []);

  const initialThread: ChatThread = {
    id: 'conv-default-1',
    title: initialContext?.productName ? `Inquiring about ${initialContext.productName}` : 'General AI Assistant',
    category: 'recent',
    preview: initialContext?.productName ? `Ready to explore ${initialContext.productName}.` : 'Ask anything or give Tradara AI an instruction.',
    updatedAt: 'Just now'
  };

  const [threads, setThreads] = useState<ChatThread[]>([initialThread]);
  const [activeThreadId, setActiveThreadId] = useState('conv-default-1');
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'm1',
      sender: 'ai',
      text: getWelcomeText(initialContext),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);

  const storageKey = `tradara_ai_workspace_${currentUser?.id || buyerSession}`;

  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const saved = localStorage.getItem(storageKey);
      if (!saved) return;

      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed.threads) && parsed.threads.length > 0) {
        setThreads(parsed.threads);
      }
      if (parsed.activeThreadId) {
        setActiveThreadId(parsed.activeThreadId);
      }
      if (parsed.messagesByThread && typeof parsed.messagesByThread === 'object') {
        const activeMessages = parsed.messagesByThread[parsed.activeThreadId || activeThreadId];
        if (Array.isArray(activeMessages) && activeMessages.length > 0) {
          setMessages(activeMessages);
        }
      }
    } catch (error) {
      console.warn('[Tradara AI] Failed to restore local workspace:', error);
    }
  }, [storageKey, activeThreadId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const previous = localStorage.getItem(storageKey);
      const existing = previous ? JSON.parse(previous) : {};
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          threads,
          activeThreadId,
          messagesByThread: { ...(existing.messagesByThread || {}), [activeThreadId]: messages }
        })
      );
    } catch (error) {
      console.warn('[Tradara AI] Failed to persist workspace:', error);
    }
  }, [threads, messages, activeThreadId, storageKey]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!isOpen) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 150);
    return () => window.clearTimeout(timer);
  }, [isOpen, activeThreadId]);

  const getUserInitials = () => {
    if (!isAuthenticated || !currentUser) return '';
    if (currentUser.name) {
      const parts = currentUser.name.trim().split(/\s+/);
      if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
      return currentUser.name.slice(0, 2).toUpperCase();
    }
    if (currentUser.email) return currentUser.email.slice(0, 2).toUpperCase();
    return 'U';
  };

  const userInitials = getUserInitials();
  const isProductContextActive = Boolean(resolveProductId(initialContext));

  const visibleThreads = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return threads.filter((thread) => {
      if (!query) return true;
      return [thread.title, thread.preview].some((value) => value.toLowerCase().includes(query));
    });
  }, [searchQuery, threads]);

  const pinnedThreads = visibleThreads.filter((thread) => thread.category === 'pinned');
  const recentThreads = visibleThreads.filter((thread) => thread.category !== 'pinned');

  const connectionLabel =
    connectionState === 'online'
      ? 'AI connected'
      : connectionState === 'connecting'
        ? 'Connecting to backend'
        : connectionState === 'error'
          ? 'Backend unavailable'
          : 'Ready';

  const handleNewChat = () => {
    const newThreadId = `conv-${Date.now()}`;
    const newThread: ChatThread = {
      id: newThreadId,
      title: 'New Conversation',
      category: 'recent',
      preview: 'Start a new conversation…',
      updatedAt: 'Just now'
    };

    setThreads((prev) => [newThread, ...prev]);
    setActiveThreadId(newThreadId);
    setMessages([
      {
        id: `m_${Date.now()}`,
        sender: 'ai',
        text: getWelcomeText(initialContext),
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ]);
    setCurrentMessage('');
    setErrorMessage('');
  };

  const handleSelectThread = (threadId: string) => {
    setActiveThreadId(threadId);
    const saved = localStorage.getItem(storageKey);
    if (!saved) return;

    try {
      const parsed = JSON.parse(saved);
      const nextMessages = parsed.messagesByThread?.[threadId];
      if (Array.isArray(nextMessages) && nextMessages.length > 0) {
        setMessages(nextMessages);
      }
    } catch (error) {
      console.warn('[Tradara AI] Failed to load message thread:', error);
    }
  };

  const handleTogglePin = (event: React.MouseEvent, threadId: string) => {
    event.stopPropagation();
    setThreads((prev) =>
      prev.map((thread) => {
        if (thread.id !== threadId) return thread;
        return {
          ...thread,
          category: thread.category === 'pinned' ? 'recent' : 'pinned'
        };
      })
    );
  };

  const handleStop = () => {
    generationController?.abort();
    setIsGenerating(false);
    setConnectionState('ready');
  };

  const handleSendMessage = async (confirmation = false, pendingTool?: Record<string, unknown>, overrideText?: string) => {
    const text = (overrideText ?? currentMessage).trim();
    if (!text && !pendingTool) return;

    const controller = new AbortController();
    setGenerationController(controller);
    setIsGenerating(true);
    setConnectionState('connecting');
    setErrorMessage('');

    const userText = text || 'Confirm Action';
    const now = new Date();
    const userMessage: Message = {
      id: `msg_${Date.now()}`,
      sender: 'user',
      text: userText,
      timestamp: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      createdAt: now.toISOString()
    };

    if (text && !pendingTool) {
      setMessages((prev) => [...prev, userMessage]);
      setCurrentMessage('');
      setThreads((prev) =>
        prev.map((thread) =>
          thread.id === activeThreadId
            ? {
                ...thread,
                title: thread.title === 'New Conversation' || thread.title === 'General AI Assistant' ? (userText.length > 30 ? `${userText.slice(0, 30)}...` : userText) : thread.title,
                preview: userText,
                updatedAt: 'Just now'
              }
            : thread
        )
      );
    }

    const assistantMessageId = `ai_${Date.now()}`;
    const assistantTimestamp = new Date();
    setMessages((prev) => [
      ...prev,
      {
        id: assistantMessageId,
        sender: 'ai',
        text: '',
        timestamp: assistantTimestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        createdAt: assistantTimestamp.toISOString(),
        isStreaming: true
      }
    ]);

    try {
      const backendUrl = (import.meta.env.VITE_API_URL || 'https://tradara-backend.onrender.com').replace(/\/+$/, '');
      const endpoint = `${backendUrl}/api/ai/chat`;
      const payload = {
        message: userText,
        history: buildHistory(messages),
        conversationHistory: buildHistory(messages),
        product: buildProductPayload(initialContext),
        itemId: resolveProductId(initialContext),
        buyerSession,
        buyerId: currentUser?.id,
        sessionId: undefined,
        threadId: activeThreadId,
        userConfirmationConfirmed: confirmation,
        pendingTool
      };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream'
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody?.error || errorBody?.message || `Tradara AI returned HTTP ${response.status}.`);
      }

      const data = await response.json().catch(() => ({}));
      const reply = data.reply || data.response || data.message || data.content || 'The AI returned an empty response.';

      setMessages((prev) =>
        prev.map((message) =>
          message.id === assistantMessageId
            ? {
                ...message,
                text: reply,
                isStreaming: false,
                isError: false,
                toolExecutions: data.toolExecutions || data.toolExecution || undefined
              }
            : message
        )
      );

      if (data.sessionId) {
        setThreads((prev) =>
          prev.map((thread) =>
            thread.id === activeThreadId ? { ...thread, serverSessionId: data.sessionId } : thread
          )
        );
      }

      setConnectionState('online');
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'name' in error && error.name === 'AbortError') {
        setMessages((prev) =>
          prev.map((message) =>
            message.id === assistantMessageId
              ? { ...message, text: message.text || 'Generation stopped by the user.', isStreaming: false }
              : message
          )
        );
        setConnectionState('ready');
        return;
      }

      const message = error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
        ? error.message
        : 'Tradara AI could not connect to the intelligence backend.';
      setConnectionState('error');
      setErrorMessage(message);
      setMessages((prev) =>
        prev.map((message) =>
          message.id === assistantMessageId
            ? {
                ...message,
                text: `I couldn't complete that request because the Tradara AI service returned an error.\n\n**Connection error:** ${message}\n\nPlease try again.`,
                isStreaming: false,
                isError: true
              }
            : message
        )
      );
    } finally {
      setIsGenerating(false);
      setGenerationController(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[1000px] bg-[#090b12] text-slate-100 shadow-2xl border-l border-slate-800">
      <SidebarNavigation
        activeTab={activeTab}
        isAuthenticated={isAuthenticated}
        userInitials={userInitials}
        userTitle={currentUser?.name || currentUser?.email || 'Guest'}
        onTabChange={setActiveTab}
      />

      <div className="flex min-h-0 flex-1 flex-col bg-[#0d1018]">
        <SidebarHeader
          connectionState={connectionState}
          connectionLabel={connectionLabel}
          threadTitle={threads.find((thread) => thread.id === activeThreadId)?.title}
          onClose={onClose}
        />

        {activeTab === 'chat' ? (
          <>
            <ThreadSearchBar
              searchQuery={searchQuery}
              activeThreadId={activeThreadId}
              pinnedThreads={pinnedThreads}
              recentThreads={recentThreads}
              onSearchChange={setSearchQuery}
              onNewChat={handleNewChat}
              onSelectThread={handleSelectThread}
              onTogglePin={handleTogglePin}
            />

            {errorMessage && <ErrorBanner errorMessage={errorMessage} onDismiss={() => setErrorMessage('')} />}

            <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-[#0d1018]">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl border px-3 py-2 text-sm shadow-sm ${
                      message.sender === 'user'
                        ? 'border-blue-500/40 bg-blue-600/20 text-blue-50'
                        : message.sender === 'system'
                          ? 'border-slate-700 bg-slate-900 text-slate-300'
                          : 'border-slate-800 bg-slate-900 text-slate-100'
                    }`}
                  >
                    {message.isStreaming ? (
                      <div className="flex items-center gap-2 text-blue-300">
                        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-blue-400" />
                        <span>Thinking…</span>
                      </div>
                    ) : (
                      <div className="prose prose-invert max-w-none text-[12px] leading-relaxed text-slate-100">
                        {renderFormattedMessage(message.text)}
                      </div>
                    )}
                    <div className="mt-2 text-[10px] text-slate-500">{message.timestamp}</div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            <ChatInput
              inputRef={inputRef}
              currentMessage={currentMessage}
              isProductContextActive={isProductContextActive}
              isGenerating={isGenerating}
              connectionState={connectionState}
              onMessageChange={setCurrentMessage}
              onSubmit={() => void handleSendMessage()}
              onStop={handleStop}
            />
          </>
        ) : activeTab === 'library' ? (
          <LibraryView />
        ) : activeTab === 'projects' ? (
          <ProjectsView />
        ) : (
          <ExploreView />
        )}
      </div>
    </div>
  );
};

export default TradaraAISidebar;
