export type TradaraAgentType =
  | 'general'
  | 'marketplace'
  | 'research'
  | 'marketing'
  | 'developer'
  | 'finance'
  | 'security'
  | 'support'
  | 'vision'
  | 'media'
  | 'content'
  | 'file'
  | 'planning';

export type TradaraAgentMetadata = Record<string, unknown>;

export interface TradaraAgentAttachment {
  id?: string;
  name: string;
  mimeType: string;
  url?: string;
  data?: string;
  size?: number;
  type?: 'image' | 'video' | 'audio' | 'document' | 'code' | 'other';
  metadata?: TradaraAgentMetadata;
}

export interface TradaraAgentMessage {
  id: string;
  sender: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  isStreaming?: boolean;
  metadata?: TradaraAgentMetadata;
}

export interface TradaraAgentRequest {
  message: string;
  conversationId?: string;
  sessionId?: string;
  taskId?: string;
  itemId?: string;
  userId?: string;
  agent?: TradaraAgentType;
  attachments?: TradaraAgentAttachment[];
  context?: Record<string, unknown>;
  executeActions?: boolean;
  approvedAction?: {
    toolName: string;
    params: Record<string, unknown>;
  };
  metadata?: TradaraAgentMetadata;
}

export interface TradaraAgentEvent {
  type: 'start' | 'status' | 'plan' | 'tool_start' | 'tool_result' | 'content' | 'warning' | 'approval_required' | 'verification' | 'complete' | 'error' | 'final';
  requestId?: string;
  timestamp?: string;
  content?: string;
  status?: string;
  agent?: TradaraAgentType;
  intent?: string;
  plan?: unknown;
  verification?: unknown;
  requiresApproval?: boolean;
  pendingAction?: {
    toolName: string;
    params: Record<string, unknown>;
    reason: string;
  };
  result?: Record<string, unknown>;
  error?: string;
  metadata?: TradaraAgentMetadata;
}

export interface UseTradaraAgentOptions {
  apiEndpoint?: string;
  backendUrl?: string;
  getAuthToken?: () => string | null;
  onEvent?: (event: TradaraAgentEvent) => void;
  onError?: (error: Error) => void;
}

export function resolveBackendUrl(explicitBackendUrl?: string): string {
  if (explicitBackendUrl) {
    return explicitBackendUrl.replace(/\/+$/, '');
  }

  const envUrl =
    (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_API_URL ||
    (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_BACKEND_URL ||
    '';

  return String(envUrl).replace(/\/+$/, '');
}

export function isStreamPayload(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object');
}

export function extractEventContent(raw: string): string {
  return raw.replace(/^data:\s*/, '').trim();
}
