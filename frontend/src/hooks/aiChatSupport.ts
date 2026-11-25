export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  isStreaming?: boolean;
  metadata?: Record<string, unknown>;
}

export interface AIChatAttachment {
  id?: string;
  type: 'image' | 'video' | 'audio' | 'file' | 'document';
  name?: string;
  url?: string;
  mimeType?: string;
  size?: number;
  data?: string;
  metadata?: Record<string, unknown>;
}

export interface AIChatContext {
  user?: Record<string, unknown>;
  product?: Record<string, unknown>;
  project?: Record<string, unknown>;
  messages?: Array<Record<string, unknown>>;
  attachments?: AIChatAttachment[];
  memory?: Array<Record<string, unknown>>;
  globalContext?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface AIChatRequestOptions {
  metadata?: Record<string, unknown>;
  context?: AIChatContext;
  attachments?: AIChatAttachment[];
  itemId?: string;
  conversationId?: string;
  sessionId?: string;
  taskId?: string;
  buyerSession?: string;
  userId?: string;
  agent?: string;
  intent?: string;
  executeActions?: boolean;
  approvedAction?: Record<string, unknown>;
  stream?: boolean;
}

export interface UseAIChatOptions {
  apiEndpoint?: string;
  getAuthToken?: () => string | null;
  onError?: (error: Error) => void;
  onEvent?: (event: TradaraAgentEvent) => void;
  initialMessages?: ChatMessage[];
}

export interface TradaraAgentEvent {
  type?: string;
  event?: string;
  requestId?: string;
  messageId?: string;
  timestamp?: string;
  text?: string;
  content?: string;
  delta?: string;
  chunk?: string;
  status?: string;
  agent?: string;
  activeAgent?: string;
  intent?: string;
  activeIntent?: string;
  plan?: unknown;
  result?: { content?: string } | unknown;
  verification?: unknown;
  tool?: unknown;
  toolCall?: unknown;
  toolResult?: unknown;
  approval?: unknown;
  requiresConfirmation?: boolean;
  pendingToolDetails?: unknown;
  error?: string;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface SendMessageResult {
  success: boolean;
  requestId?: string;
  content: string;
  events: TradaraAgentEvent[];
  metadata?: Record<string, unknown>;
  result?: unknown;
}

export function getDefaultApiEndpoint(): string {
  const env = import.meta.env as Record<string, string | undefined>;
  const configuredBase = env.VITE_API_URL || env.VITE_BACKEND_URL || '';

  if (!configuredBase) return '/api/ai/agent';

  const normalized = configuredBase.replace(/\/+$/, '');
  if (normalized.endsWith('/api/ai/agent')) return normalized;
  if (normalized.endsWith('/api/ai')) return `${normalized}/agent`;
  if (normalized.endsWith('/api')) return `${normalized}/ai/agent`;
  return `${normalized}/api/ai/agent`;
}

export function extractEventText(event: TradaraAgentEvent): string {
  const candidates = [event.delta, event.chunk, event.text, event.content];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.length > 0) return candidate;
  }
  return '';
}

export function isTerminalEvent(event: TradaraAgentEvent): boolean {
  const type = String(event.type || event.event || '').toLowerCase();
  return ['done', 'complete', 'completed', 'final', 'finish', 'finished'].includes(type);
}

export function appendStreamText(current: string, incoming: string, event: TradaraAgentEvent): string {
  if (!incoming) return current;
  const type = String(event.type || event.event || '').toLowerCase();
  const looksLikeDelta = ['chunk', 'content', 'delta', 'text'].includes(type);

  if (looksLikeDelta) return current + incoming;
  if (event.result && typeof event.result === 'object' && event.result !== null && 'content' in event.result && typeof event.result.content === 'string' && event.result.content === incoming) return incoming;
  if (incoming === current) return current;
  if (incoming.startsWith(current)) return incoming;
  if (current.endsWith(incoming)) return current;
  if (current.includes(incoming) && incoming.length > 20) return current;
  return current + incoming;
}

export function parseSSEData(rawData: string): TradaraAgentEvent | string | null {
  const data = rawData.trim();
  if (!data) return null;
  if (data === '[DONE]') return '[DONE]';

  try {
    const parsed = JSON.parse(data);
    if (typeof parsed === 'string') return { type: 'text', text: parsed };
    if (parsed && typeof parsed === 'object') return parsed as TradaraAgentEvent;
    return null;
  } catch {
    return { type: 'text', text: data };
  }
}

export function parseSSEBlock(block: string): TradaraAgentEvent | string | null {
  const lines = block.split(/\r?\n/);
  const dataLines: string[] = [];
  let eventName = '';

  for (const line of lines) {
    if (line.startsWith(':')) continue;
    if (line.startsWith('event:')) {
      eventName = line.slice(6).trim();
      continue;
    }
    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).replace(/^ /, ''));
    }
  }

  if (!dataLines.length) return null;

  const payload = dataLines.join('\n');
  const parsed = parseSSEData(payload);

  if (parsed && parsed !== '[DONE]' && typeof parsed === 'object' && eventName && !('type' in parsed)) {
    (parsed as TradaraAgentEvent).type = eventName;
  }

  return parsed;
}
