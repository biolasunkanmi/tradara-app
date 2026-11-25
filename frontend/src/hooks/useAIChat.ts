import { useCallback, useEffect, useRef, useState } from 'react';

export * from './aiChatSupport';

import {
  appendStreamText,
  extractEventText,
  getDefaultApiEndpoint,
  isTerminalEvent,
  parseSSEBlock,
  type AIChatRequestOptions,
  type ChatMessage,
  type SendMessageResult,
  type TradaraAgentEvent,
  type UseAIChatOptions,
} from './aiChatSupport';

export function useAIChat(options: UseAIChatOptions = {}) {
  const {
    apiEndpoint = getDefaultApiEndpoint(),
    getAuthToken,
    onError,
    onEvent,
    initialMessages = [],
  } = options;

  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeAgent, setActiveAgent] = useState<string | null>(null);
  const [activeIntent, setActiveIntent] = useState<string | null>(null);
  const [agentStatus, setAgentStatus] = useState<string | null>(null);
  const [currentPlan, setCurrentPlan] = useState<unknown>(null);
  const [pendingApproval, setPendingApproval] = useState<unknown>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const lastEventSequenceRef = useRef(0);
  const activeTaskIdRef = useRef<string | null>(null);
  const seenEventKeysRef = useRef(new Set<string>());

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortControllerRef.current?.abort();
    };
  }, []);

  const processAgentEvent = useCallback(
    (event: TradaraAgentEvent, assistantMessageId: string, accumulatedTextRef: { value: string }) => {
      const sequence =
        typeof event.sequence === 'number'
          ? event.sequence
          : typeof event.metadata?.sequence === 'number'
            ? event.metadata.sequence
            : undefined;
      if (typeof sequence === 'number') {
        if (sequence <= lastEventSequenceRef.current) return;
        lastEventSequenceRef.current = sequence;
      }
      const taskId =
        typeof event.taskId === 'string'
          ? event.taskId
          : typeof event.metadata?.taskId === 'string'
            ? event.metadata.taskId
            : null;
      if (taskId) activeTaskIdRef.current = taskId;
      const dedupeKey =
        typeof sequence === 'number'
          ? `${activeTaskIdRef.current || 'task'}:${sequence}`
          : null;
      if (dedupeKey) {
        if (seenEventKeysRef.current.has(dedupeKey)) return;
        seenEventKeysRef.current.add(dedupeKey);
      }
      const type = String(event.type || event.event || '').toLowerCase();

      if (event.agent || event.activeAgent) setActiveAgent(event.agent || event.activeAgent || null);
      if (event.intent || event.activeIntent) setActiveIntent(event.intent || event.activeIntent || null);
      if (event.status) setAgentStatus(event.status);
      if (event.plan !== undefined) setCurrentPlan(event.plan);

      if (type === 'approval_required' || type === 'requires_confirmation' || event.requiresConfirmation) {
        setPendingApproval(event.approval || event.pendingToolDetails || event.tool || event.toolCall || event.metadata || null);
      }

      if (type === 'approval_granted' || type === 'approval_completed') {
        setPendingApproval(null);
      }

      if (type === 'error' || type === 'failed') {
        const errorMessage = event.error || event.result?.error || 'Tradara AI encountered an error.';
        setError(errorMessage);
        setMessages((previous) =>
          previous.map((message) =>
            message.id === assistantMessageId
              ? {
                  ...message,
                  content: accumulatedTextRef.value || errorMessage,
                  isStreaming: false,
                  metadata: { ...message.metadata, agentEvent: event },
                }
              : message,
          ),
        );
        return;
      }

      const incomingText = extractEventText(event);
      if (incomingText) {
        accumulatedTextRef.value = appendStreamText(accumulatedTextRef.value, incomingText, event);
        setMessages((previous) =>
          previous.map((message) =>
            message.id === assistantMessageId
              ? {
                  ...message,
                  content: accumulatedTextRef.value,
                  isStreaming: true,
                  metadata: {
                    ...message.metadata,
                    agent: event.agent || event.activeAgent || message.metadata?.agent,
                    intent: event.intent || event.activeIntent || message.metadata?.intent,
                    lastEventType: type,
                  },
                }
              : message,
          ),
        );
      }

      const resultContent = typeof event.result?.content === 'string' ? event.result.content : '';
      if (resultContent && resultContent !== accumulatedTextRef.value) {
        accumulatedTextRef.value = resultContent;
        setMessages((previous) =>
          previous.map((message) =>
            message.id === assistantMessageId
              ? {
                  ...message,
                  content: resultContent,
                  isStreaming: !isTerminalEvent(event),
                  metadata: { ...message.metadata, result: event.result },
                }
              : message,
          ),
        );
      }

      if (type === 'verification' || event.verification) {
        setMessages((previous) =>
          previous.map((message) =>
            message.id === assistantMessageId
              ? {
                  ...message,
                  metadata: { ...message.metadata, verification: event.verification || event.result?.verification },
                }
              : message,
          ),
        );
      }

      if (event.metadata || event.tool || event.toolCall || event.toolResult) {
        setMessages((previous) =>
          previous.map((message) =>
            message.id === assistantMessageId
              ? {
                  ...message,
                  metadata: {
                    ...message.metadata,
                    eventMetadata: event.metadata,
                    tool: event.tool,
                    toolCall: event.toolCall,
                    toolResult: event.toolResult,
                  },
                }
              : message,
          ),
        );
      }

      if (isTerminalEvent(event)) {
        setMessages((previous) =>
          previous.map((message) =>
            message.id === assistantMessageId
              ? { ...message, isStreaming: false }
              : message,
          ),
        );
      }

      onEvent?.(event);
    },
    [onEvent],
  );

  const sendMessage = useCallback(
    async (prompt: string, requestOptions?: AIChatRequestOptions): Promise<SendMessageResult | undefined> => {
      const trimmed = prompt.trim();
      if (!trimmed || isLoading) return undefined;

      setError(null);
      setIsLoading(true);
      setAgentStatus('starting');
      setPendingApproval(null);

      if (abortControllerRef.current) abortControllerRef.current.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;
      const now = Date.now();
      const userMessageId = `msg_user_${now}_${Math.random().toString(36).slice(2, 8)}`;
      const assistantMessageId = `msg_assistant_${now}_${Math.random().toString(36).slice(2, 8)}`;
      const userMessage: ChatMessage = { id: userMessageId, sender: 'user', content: trimmed, timestamp: new Date().toISOString() };
      const assistantMessage: ChatMessage = { id: assistantMessageId, sender: 'assistant', content: '', timestamp: new Date().toISOString(), isStreaming: true };

      setMessages((previous) => [...previous, userMessage, assistantMessage]);

      const accumulatedTextRef = { value: '' };
      const receivedEvents: TradaraAgentEvent[] = [];
      let finalResult: unknown = undefined;

      try {
        const token = getAuthToken?.() || null;
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        };
        if (token) headers.Authorization = `Bearer ${token}`;

        const response = await fetch(`${apiEndpoint}`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            ...requestOptions,
            message: trimmed,
            stream: true,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          let serverMessage = `HTTP ${response.status}`;
          try {
            const json = await response.json();
            serverMessage = json?.error || json?.message || serverMessage;
          } catch {
            // keep the HTTP status when parsing fails
          }
          throw new Error(serverMessage);
        }

        if (!response.body) throw new Error('ReadableStream is not supported by the response body.');

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';
        let streamFinished = false;

        while (!streamFinished) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const blocks = buffer.split(/\r?\n\r?\n/);
          buffer = blocks.pop() || '';

          for (const block of blocks) {
            const parsed = parseSSEBlock(block);
            if (parsed === null) continue;
            if (parsed === '[DONE]') {
              streamFinished = true;
              break;
            }
            if (typeof parsed === 'string') {
              accumulatedTextRef.value = appendStreamText(accumulatedTextRef.value, parsed, { type: 'text', text: parsed });
              setMessages((previous) => previous.map((message) => (message.id === assistantMessageId ? { ...message, content: accumulatedTextRef.value, isStreaming: true } : message)));
              continue;
            }

            const event = parsed as TradaraAgentEvent;
            receivedEvents.push(event);
            if (event.result) finalResult = event.result;
            processAgentEvent(event, assistantMessageId, accumulatedTextRef);
            if (isTerminalEvent(event)) {
              setMessages((previous) => previous.map((message) => (message.id === assistantMessageId ? { ...message, isStreaming: false } : message)));
            }
          }
        }

        buffer += decoder.decode();
        if (buffer.trim()) {
          const parsed = parseSSEBlock(buffer);
          if (parsed && parsed !== '[DONE]' && typeof parsed !== 'string') {
            const event = parsed as TradaraAgentEvent;
            receivedEvents.push(event);
            if (event.result) finalResult = event.result;
            processAgentEvent(event, assistantMessageId, accumulatedTextRef);
          }
        }

        setMessages((previous) => previous.map((message) => (message.id === assistantMessageId ? { ...message, isStreaming: false } : message)));
        setAgentStatus((previous) => (previous === 'failed' ? previous : 'completed'));

        return {
          success: true,
          requestId: receivedEvents.find((event) => event.requestId)?.requestId,
          content: accumulatedTextRef.value,
          events: receivedEvents,
          metadata: receivedEvents[receivedEvents.length - 1]?.metadata,
          result: finalResult,
        };
      } catch (err: unknown) {
        if (typeof err === 'object' && err !== null && 'name' in err && err.name === 'AbortError') {
          setAgentStatus('stopped');
          setMessages((previous) => previous.map((message) => (message.id === assistantMessageId ? { ...message, isStreaming: false } : message)));
          return { success: false, content: accumulatedTextRef.value, events: receivedEvents, result: finalResult };
        }

        if (activeTaskIdRef.current) {
          try {
            const replayBase = apiEndpoint.replace(/\/agent\/?$/, '/agent');
            const replayUrl =
              `${replayBase}/tasks/${encodeURIComponent(activeTaskIdRef.current)}/events` +
              `?afterSequence=${lastEventSequenceRef.current}`;
            const replayToken = getAuthToken?.() || null;
            const replayHeaders: Record<string, string> = {
              Accept: 'application/json',
            };
            if (replayToken) replayHeaders.Authorization = `Bearer ${replayToken}`;
            const replayResponse = await fetch(replayUrl, {
              headers: replayHeaders,
              signal: controller.signal,
            });
            if (replayResponse.ok) {
              const replayData = await replayResponse.json() as {
                success?: boolean;
                events?: TradaraAgentEvent[];
              };
              if (replayData.success && Array.isArray(replayData.events)) {
                for (const replayEvent of replayData.events) {
                  receivedEvents.push(replayEvent);
                  processAgentEvent(replayEvent, assistantMessageId, accumulatedTextRef);
                }
              }
            }
          } catch {
            // Preserve the original stream error if replay is unavailable.
          }
        }

        const errorMessage =
          typeof err === 'object' && err !== null && 'message' in err && typeof err.message === 'string'
            ? err.message
            : 'Failed to communicate with the Tradara AI agent.';

        setError(errorMessage);
        setAgentStatus('failed');
        onError?.(err instanceof Error ? err : new Error(errorMessage));
        setMessages((previous) =>
          previous.map((message) =>
            message.id === assistantMessageId
              ? {
                  ...message,
                  content: accumulatedTextRef.value || 'Tradara AI could not complete this request.',
                  isStreaming: false,
                  metadata: { ...message.metadata, error: errorMessage },
                }
              : message,
          ),
        );
        return { success: false, content: accumulatedTextRef.value, events: receivedEvents, result: finalResult };
      } finally {
        if (abortControllerRef.current === controller) abortControllerRef.current = null;
        if (mountedRef.current) setIsLoading(false);
      }
    },
    [apiEndpoint, getAuthToken, isLoading, onError, processAgentEvent],
  );

  const stopStreaming = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setIsLoading(false);
    setAgentStatus('stopped');
    setMessages((previous) => previous.map((message) => (message.isStreaming ? { ...message, isStreaming: false } : message)));
  }, []);

  const clearMessages = useCallback(() => {
    stopStreaming();
    setMessages([]);
    setError(null);
    setActiveAgent(null);
    setActiveIntent(null);
    setAgentStatus(null);
    setCurrentPlan(null);
    setPendingApproval(null);
  }, [stopStreaming]);

  const setChatMessages = useCallback((nextMessages: ChatMessage[] | ((previous: ChatMessage[]) => ChatMessage[])) => {
    setMessages(nextMessages);
  }, []);

  const addMessage = useCallback((message: ChatMessage) => {
    setMessages((previous) => [...previous, message]);
  }, []);

  const updateMessage = useCallback((messageId: string, updater: Partial<ChatMessage> | ((message: ChatMessage) => ChatMessage)) => {
    setMessages((previous) =>
      previous.map((message) => {
        if (message.id !== messageId) return message;
        if (typeof updater === 'function') return updater(message);
        return { ...message, ...updater };
      }),
    );
  }, []);

  return {
    messages,
    isLoading,
    error,
    activeAgent,
    activeIntent,
    agentStatus,
    currentPlan,
    pendingApproval,
    sendMessage,
    stopStreaming,
    clearMessages,
    setChatMessages,
    addMessage,
    updateMessage,
  };
}

export default useAIChat;
