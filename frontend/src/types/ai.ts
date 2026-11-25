export interface ToolExecutionPayload {
  toolName: string;
  parameters: Record<string, unknown>;
  confirmed?: boolean;
}

export interface ToolExecutionResult<T = unknown> {
  success: boolean;
  message?: string;
  result?: T;
  error?: string;
}

export interface ToolDefinitionSchema {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface PendingToolApproval {
  toolName: string;
  parameters: Record<string, unknown>;
  riskLevel: 'READ_ONLY' | 'LOW' | 'MEDIUM' | 'HIGH' | 'EXECUTE';
}

export interface ToolCallItem {
  toolName: string;
  parameters: Record<string, unknown>;
  result?: ToolExecutionResult<unknown>;
  status: 'pending' | 'completed' | 'failed';
}

export interface AIMessage {
  id: string;
  sender: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  agreedPrice?: number;
  status?: string;
  toolCalls?: ToolCallItem[];
}

export interface BuyerPerception {
  sentiment: 'positive' | 'neutral' | 'negative' | 'frustrated' | 'eager';
  urgency: 'low' | 'medium' | 'high';
  priceSensitivity: 'low' | 'medium' | 'high';
  detectedIntent: 'inquiry' | 'bargain' | 'specs_check' | 'human_request' | 'bulk_inquiry' | 'closing';
  estimatedMaxBudget?: number;
}

export interface MarketplaceIntelligence {
  itemHistoricalConversions: number;
  averageAgreedDiscountPercent: number;
  buyerPastNegotiationCount: number;
  buyerSuccessfulDeals: number;
  categoryDemandScore: number;
}