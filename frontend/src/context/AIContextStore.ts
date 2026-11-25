import { createContext } from 'react';
import type { AIMessage, PendingToolApproval, BuyerPerception, MarketplaceIntelligence } from '../types/ai';

export interface AIContextType {
  messages: AIMessage[];
  isProcessing: boolean;
  pendingApproval: PendingToolApproval | null;
  lastPerception: BuyerPerception | null;
  lastIntelligence: MarketplaceIntelligence | null;
  sendMessage: (content: string, options?: { itemId?: string; buyerSession?: string; buyerId?: string; offeredPrice?: number; quantity?: number }) => Promise<void>;
  executeToolWithApproval: () => Promise<void>;
  cancelToolApproval: () => void;
  clearMessages: () => void;
}

export const AIContext = createContext<AIContextType | undefined>(undefined);
