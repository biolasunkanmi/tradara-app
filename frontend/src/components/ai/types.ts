export interface Message {
  id: string;
  sender: 'ai' | 'user' | 'system';
  text: string;
  timestamp: string;
  createdAt?: string;
  requiresConfirmation?: boolean;
  pendingToolDetails?: {
    toolName: string;
    params: Record<string, unknown>;
  };
  toolExecutions?: Array<{
    toolName?: string;
    name?: string;
    status?: string;
    result?: unknown;
  }>;
  isError?: boolean;
  isStreaming?: boolean;
}

export interface ChatThread {
  id: string;
  title: string;
  category: 'pinned' | 'recent' | 'archived';
  preview: string;
  updatedAt?: string;
  serverSessionId?: string;
}

export interface HistoryItem {
  role: 'user' | 'model';
  parts: Array<{ text: string }>;
}

export interface TradaraAIContext {
  productId?: string;
  itemId?: string;
  productName?: string;
  price?: string;
  category?: string;
  description?: string;
  currency?: string;
  image?: string;
}

export interface TradaraAISidebarProps {
  isOpen: boolean;
  onClose: () => void;
  initialContext?: TradaraAIContext;
  isAuthenticated?: boolean;
  currentUser?: {
    id?: string;
    name?: string;
    email?: string;
    role?: 'BUYER' | 'SELLER' | 'ADMIN';
  };
}
