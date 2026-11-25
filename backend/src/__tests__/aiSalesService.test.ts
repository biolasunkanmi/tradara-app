process.env.GEMINI_API_KEY = 'test-key';
process.env.GEMINI_MAX_RETRIES = '0';
process.env.GEMINI_TIMEOUT_MS = '5000';
process.env.GEMINI_TOTAL_TIMEOUT_MS = '10000';
process.env.GEMINI_MODEL_COOLDOWN_MS = '1000';

const generateContentMock = jest.fn();
const prismaMock = {
  item: {
    findUnique: jest.fn(),
  },
  aiNegotiationSession: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  aiChatMessage: {
    findMany: jest.fn(),
    create: jest.fn(),
  },
  negotiationLearning: {
    upsert: jest.fn(),
  },
};
const negotiationEvaluateMock = jest.fn();

jest.mock('@google/genai', () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({
    models: {
      generateContent: generateContentMock,
    },
  })),
}));

jest.mock('../lib/prisma', () => ({
  __esModule: true,
  default: prismaMock,
}));

jest.mock('../services/negotiationEngine', () => ({
  NegotiationEngine: {
    evaluate: negotiationEvaluateMock,
  },
}));

const { AiSalesService } = require('../services/aiSalesService') as {
  AiSalesService: typeof import('../services/aiSalesService').AiSalesService;
};

function resetServiceState(): void {
  jest.clearAllMocks();
  generateContentMock.mockReset();
  negotiationEvaluateMock.mockReset();

  for (const model of [
    'gemini-3.8-flash',
    'gemini-3.5-flash-lite',
    'gemini-3.7-flash',
    'gemini-3.6-flash',
    'gemini-3.5-flash',
  ]) {
    prismaMock.aiNegotiationSession.findMany.mockResolvedValue([]);
    (AiSalesService as any).geminiModelHealth.delete(model);
  }

  prismaMock.item.findUnique.mockResolvedValue(null);
  prismaMock.aiNegotiationSession.findUnique.mockResolvedValue(null);
  prismaMock.aiNegotiationSession.findFirst.mockResolvedValue(null);
  prismaMock.aiNegotiationSession.create.mockResolvedValue({
    id: 'session-1',
    status: 'active',
    item: null,
    buyer: null,
  });
  prismaMock.aiNegotiationSession.update.mockResolvedValue({
    id: 'session-1',
    status: 'active',
  });
  prismaMock.aiChatMessage.findMany.mockResolvedValue([]);
  prismaMock.aiChatMessage.create.mockResolvedValue({});
  prismaMock.negotiationLearning.upsert.mockResolvedValue({});
}

describe('AiSalesService deterministic regression coverage', () => {
  beforeEach(() => {
    resetServiceState();
  });

  it('parses assistant text and deduplicates structured tool calls', () => {
    const parsed = (AiSalesService as any).parseGeminiResponse({
      text: 'I can check that.',
      functionCalls: () => [
        {
          id: 'call-1',
          name: 'lookup_item',
          args: { itemId: 'item-1' },
        },
      ],
      candidates: [
        {
          content: {
            parts: [
              {
                text: 'Additional context.',
              },
              {
                functionCall: {
                  id: 'call-1',
                  name: 'lookup_item',
                  args: { itemId: 'item-1' },
                },
              },
              {
                function_call: {
                  id: 'call-2',
                  name: 'reserve_item',
                  arguments: { quantity: 1 },
                },
              },
            ],
          },
        },
      ],
    });

    expect(parsed.text).toBe('I can check that.');
    expect(parsed.toolCalls).toEqual([
      {
        id: 'call-1',
        name: 'lookup_item',
        arguments: { itemId: 'item-1' },
      },
      {
        id: 'call-2',
        name: 'reserve_item',
        arguments: { quantity: 1 },
      },
    ]);
  });

  it('rotates to the next model after a transient generation failure', async () => {
    generateContentMock
      .mockRejectedValueOnce(
        Object.assign(new Error('provider unavailable'), {
          status: 503,
        })
      )
      .mockResolvedValueOnce({
        text: 'Fallback response',
      });

    const result = await (AiSalesService as any).generateWithModelFallback({
      contents: 'hello',
    });

    expect(result.response).toEqual({
      text: 'Fallback response',
    });
    expect(result.model).toBe('gemini-3.5-flash-lite');
    expect(generateContentMock).toHaveBeenCalledTimes(2);
    expect(generateContentMock.mock.calls[0][0].model).toBe(
      'gemini-3.8-flash'
    );
    expect(generateContentMock.mock.calls[1][0].model).toBe(
      'gemini-3.5-flash-lite'
    );
  });

  it('classifies retryable provider errors without treating auth errors as transient', () => {
    const isTransient = (error: unknown) =>
      (AiSalesService as any).isTransientGeminiError(error);

    expect(isTransient({ status: 429 })).toBe(true);
    expect(isTransient(new Error('network connection reset'))).toBe(true);
    expect(isTransient({ status: 401, message: 'invalid API key' })).toBe(
      false
    );
    expect(
      (AiSalesService as any).getGeminiErrorStatus({
        response: { status: 502 },
      })
    ).toBe(502);
  });

  it('returns approval metadata for tool calls that require confirmation', async () => {
    generateContentMock.mockResolvedValue({
      functionCalls: () => [
        {
          id: 'call-delete',
          name: 'delete_listing',
          args: { itemId: 'item-1' },
        },
      ],
    });

    const result = await AiSalesService.processMessage({
      buyerSession: 'buyer-session-1',
      message: 'Delete this listing',
      agentTools: [
        {
          name: 'delete_listing',
          description: 'Delete a listing',
          requiresApproval: true,
          parameters: {
            type: 'object',
            properties: {
              itemId: { type: 'string' },
            },
          },
        },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.reply).toContain('required operation');
    expect(result.requiresConfirmation).toBe(true);
    expect(result.pendingToolDetails).toMatchObject({
      toolName: 'delete_listing',
      params: { itemId: 'item-1' },
    });
    expect(result.toolCalls).toEqual([
      {
        id: 'call-delete',
        name: 'delete_listing',
        arguments: { itemId: 'item-1' },
      },
    ]);
  });

  it('preserves deterministic negotiation results in the public response', async () => {
    const negotiation = {
      status: 'countered',
      counterOffer: 175,
      message: 'The counter-offer is 175.',
    };

    negotiationEvaluateMock.mockResolvedValue(negotiation);
    prismaMock.item.findUnique.mockResolvedValue({
      id: 'item-1',
      stockName: 'Phone',
      price: 200,
      currency: 'NGN',
      aiConfig: {
        minimumPrice: 150,
        targetPrice: 190,
      },
      seller: null,
    });
    generateContentMock.mockResolvedValue({
      text: '',
    });

    const result = await AiSalesService.processMessage({
      itemId: 'item-1',
      buyerSession: 'buyer-session-1',
      message: 'Can you do 160?',
      offeredPrice: 160,
    });

    expect(negotiationEvaluateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        item: expect.objectContaining({ id: 'item-1' }),
        offeredPrice: 160,
        quantity: 1,
      })
    );
    expect(result.negotiation).toEqual(negotiation);
    expect(result.reply).toBe('The counter-offer is 175.');
    expect(result.response).toBe(result.reply);
  });

  it('maps provider generation failures to the existing public error', async () => {
    generateContentMock.mockRejectedValue(
      Object.assign(new Error('invalid API key'), {
        status: 401,
      })
    );

    await expect(
      AiSalesService.processMessage({
        buyerSession: 'buyer-session-1',
        message: 'Hello',
      })
    ).rejects.toThrow('The AI model could not generate a response.');
  });

  it('rejects invalid public input before contacting external dependencies', async () => {
    await expect(
      AiSalesService.processMessage({
        buyerSession: 'buyer-session-1',
        message: '   ',
      })
    ).rejects.toThrow('A valid message is required.');

    await expect(
      AiSalesService.processMessage({
        buyerSession: '',
        message: 'Hello',
      })
    ).rejects.toThrow('buyerSession is required.');

    expect(generateContentMock).not.toHaveBeenCalled();
    expect(prismaMock.aiNegotiationSession.create).not.toHaveBeenCalled();
  });
});
