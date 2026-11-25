import { Request, Response } from 'express';

import {
  AgentContext,
  AgentRequest,
  AgentResponse,
} from '../ai/agent/types';
import { executeAgent } from '../ai/agent/agentOrchestrator';
import executeAgentRequest from '../controllers/agentController';
import agentRoutes from '../routes/agentRoutes';
import aiRoutes from '../routes/aiRoutes';

jest.mock('../ai/agent/agentOrchestrator', () => ({
  executeAgent: jest.fn(),
}));

jest.mock('../controllers/aiController', () => ({
  getNegotiationHistory: jest.fn(),
  getProductAiConfig: jest.fn(),
  handleChatMessage: jest.fn(),
  upsertProductAiConfig: jest.fn(),
}));

jest.mock('../middleware/authMiddleware', () => ({
  authMiddleware: jest.fn((_req, _res, next) => next()),
  authenticateUser: jest.fn((_req, _res, next) => next()),
}));

jest.mock('../services/aiSalesService', () => ({
  AiSalesService: {
    updateSessionStatus: jest.fn(),
  },
}));

const mockedExecuteAgent =
  executeAgent as jest.MockedFunction<typeof executeAgent>;

interface MockResponse extends Partial<Response> {
  body?: unknown;
  statusCode: number;
  headers: Record<string, string>;
  chunks: string[];
  ended: boolean;
}

function createResponse(): MockResponse {
  const response: MockResponse = {
    statusCode: 200,
    headers: {},
    chunks: [],
    ended: false,
    writableEnded: false,
    headersSent: false,
  };

  response.status = jest.fn((statusCode: number) => {
    response.statusCode = statusCode;
    return response as Response;
  });
  response.json = jest.fn((body: unknown) => {
    response.body = body;
    response.headersSent = true;
    return response as Response;
  });
  response.setHeader = jest.fn((name: string, value: string) => {
    response.headers[name.toLowerCase()] = value;
    return response as Response;
  });
  response.flushHeaders = jest.fn(() => {
    response.headersSent = true;
  });
  response.write = jest.fn((chunk: string) => {
    response.chunks.push(chunk);
    return true;
  });
  response.end = jest.fn(() => {
    response.ended = true;
    response.writableEnded = true;
    return response as Response;
  });

  return response;
}

function createResult(
  overrides: Partial<AgentResponse> = {}
): AgentResponse {
  return {
    success: true,
    requestId: 'request-1',
    content: 'Agent response',
    agent: 'general',
    intent: 'general_question',
    status: 'completed',
    ...overrides,
  };
}

function parseSse(response: MockResponse): unknown[] {
  return response.chunks
    .join('')
    .split('\n\n')
    .filter((chunk) => chunk.startsWith('data: '))
    .map((chunk) => chunk.slice(6))
    .filter((payload) => payload !== '[DONE]')
    .map((payload) => JSON.parse(payload));
}

function createRequest(
  body: Record<string, unknown>,
  user?: Record<string, unknown>
): Request {
  return {
    body,
    headers: {},
    user,
  } as unknown as Request;
}

describe('agent controller regression coverage', () => {
  beforeEach(() => {
    mockedExecuteAgent.mockReset();
  });

  it('rejects missing and empty messages with the existing response shape', async () => {
    const missingResponse = createResponse();
    await executeAgentRequest(
      createRequest({}),
      missingResponse as Response
    );

    expect(missingResponse.statusCode).toBe(400);
    expect(missingResponse.body).toEqual({
      success: false,
      error: 'message is required.',
    });

    const emptyResponse = createResponse();
    await executeAgentRequest(
      createRequest({ message: '   ' }),
      emptyResponse as Response
    );

    expect(emptyResponse.statusCode).toBe(400);
    expect(emptyResponse.body).toEqual({
      success: false,
      error: 'message is required.',
    });
    expect(mockedExecuteAgent).not.toHaveBeenCalled();
  });

  it('preserves authenticated context, history, attachments, and request fields', async () => {
    mockedExecuteAgent.mockResolvedValue(createResult());
    const response = createResponse();
    const request = createRequest(
      {
        message: '  What is this product? ',
        stream: false,
        conversationId: 'conversation-1',
        threadId: 'thread-1',
        sessionId: 'session-1',
        itemId: 'item-1',
        buyerSession: 'buyer-1',
        attachments: [{ name: 'photo.png', mimeType: 'image/png' }],
        history: [
          { role: 'user', parts: [{ text: 'Previous question' }] },
          { role: 'model', parts: [{ text: 'Previous answer' }] },
        ],
        context: {
          user: { name: 'Body Name' },
          product: { itemId: 'context-item' },
          project: { projectId: 'project-1' },
          metadata: { source: 'test' },
        },
        metadata: { client: 'test-client' },
      },
      {
        id: 'user-1',
        name: 'Authenticated Name',
        email: 'user@example.com',
        role: 'buyer',
      }
    );
    request.headers = { authorization: 'Bearer test-token' };

    await executeAgentRequest(
      request,
      response as Response
    );

    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      response: 'Agent response',
      message: 'Agent response',
      reply: 'Agent response',
      content: 'Agent response',
    });

    const [agentRequest, context] =
      mockedExecuteAgent.mock.calls[0] as [
        AgentRequest,
        AgentContext
      ];

    expect(agentRequest).toMatchObject({
      message: 'What is this product?',
      conversationId: 'conversation-1',
      sessionId: 'session-1',
      itemId: 'item-1',
      buyerSession: 'buyer-1',
      userId: 'user-1',
      stream: false,
      context,
    });
    expect(context).toMatchObject({
      conversationId: 'conversation-1',
      user: {
        userId: 'user-1',
        name: 'Body Name',
        email: 'user@example.com',
        role: 'buyer',
      },
      product: { itemId: 'context-item' },
      project: { projectId: 'project-1' },
      attachments: [{ name: 'photo.png', mimeType: 'image/png' }],
      messages: [
        { role: 'user', content: 'Previous question' },
        { role: 'assistant', content: 'Previous answer' },
      ],
      metadata: {
        source: 'tradara-agent-gateway',
        authenticated: true,
        hasBearerToken: true,
      },
    });
  });

  it('returns the legacy response shape and status for agent failures', async () => {
    mockedExecuteAgent.mockResolvedValue(
      createResult({
        success: false,
        status: 'failed',
        error: 'Agent failed',
      })
    );
    const response = createResponse();

    await executeAgentRequest(
      createRequest({
        message: 'Fail this request',
        stream: false,
      }),
      response as Response
    );

    expect(response.statusCode).toBe(500);
    expect(response.body).toMatchObject({
      success: false,
      error: 'Agent failed',
      requiresConfirmation: false,
      requiresApproval: false,
    });
  });

  it('does not use caller-supplied identity to authorize agent tool execution', async () => {
    mockedExecuteAgent.mockResolvedValue(createResult());
    const response = createResponse();

    await executeAgentRequest(
      createRequest(
        {
          message: 'Update this product',
          stream: false,
          userId: 'seller-from-body',
          context: {
            user: {
              userId: 'seller-from-context',
              role: 'SELLER',
            },
          },
        },
        {
          id: 'usr_guest_anonymous',
          role: 'GUEST',
          permissions: ['READ_ONLY'],
        }
      ),
      response as Response
    );

    const [agentRequest, context] =
      mockedExecuteAgent.mock.calls[0] as [
        AgentRequest,
        AgentContext
      ];

    expect(agentRequest.userId).toBe('usr_guest_anonymous');
    expect(context.user).toMatchObject({
      userId: 'usr_guest_anonymous',
      role: 'GUEST',
    });
  });

  it('streams connection, agent events, final response, and DONE in order', async () => {
    mockedExecuteAgent.mockImplementation(
      async (
        _request,
        _context,
        _options,
        onEvent
      ) => {
        onEvent?.({
          type: 'start',
          requestId: 'request-1',
          timestamp: '2026-01-01T00:00:00.000Z',
          status: 'planning',
        });
        onEvent?.({
          type: 'content',
          requestId: 'request-1',
          timestamp: '2026-01-01T00:00:01.000Z',
          content: 'Hello',
        });
        onEvent?.({
          type: 'complete',
          requestId: 'request-1',
          timestamp: '2026-01-01T00:00:02.000Z',
          status: 'completed',
        });
        return createResult();
      }
    );
    const response = createResponse();

    await executeAgentRequest(
      createRequest({ message: 'Stream this' }),
      response as Response
    );

    expect(response.headers).toMatchObject({
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });
    expect(response.ended).toBe(true);

    const payloads = parseSse(response) as Array<{
      type: string;
      status?: string;
      content?: string;
      done?: boolean;
    }>;

    expect(payloads.map((payload) => payload.type)).toEqual([
      'connected',
      'status',
      'text',
      'status',
      'final',
    ]);
    expect(payloads[2]).toMatchObject({
      type: 'text',
      content: 'Hello',
    });
    expect(payloads[4]).toMatchObject({
      type: 'final',
      done: true,
      content: 'Agent response',
    });
    expect(response.chunks.at(-1)).toBe('data: [DONE]\n\n');
  });

  it('sends an SSE error and DONE when execution fails after headers begin', async () => {
    mockedExecuteAgent.mockRejectedValue(
      new Error('stream failure')
    );
    const response = createResponse();

    await executeAgentRequest(
      createRequest({ message: 'Stream failure' }),
      response as Response
    );

    const payloads = parseSse(response) as Array<{
      type: string;
      error?: string;
    }>;

    expect(payloads).toHaveLength(2);
    expect(payloads[0]).toMatchObject({
      type: 'connected',
    });
    expect(payloads[1]).toMatchObject({
      type: 'error',
      error: 'stream failure',
    });
    expect(response.chunks.at(-1)).toBe('data: [DONE]\n\n');
    expect(response.ended).toBe(true);
  });

  it('keeps both agent route registrations wired to the controller', () => {
    const agentPost = agentRoutes.stack.find(
      (layer) => layer.route?.path === '/' &&
        layer.route.methods.post
    );
    const chatPost = aiRoutes.stack.find(
      (layer) => layer.route?.path === '/chat' &&
        layer.route.methods.post
    );

    expect(agentPost).toBeDefined();
    expect(chatPost).toBeDefined();
    expect(agentPost?.route?.stack.at(-1)?.handle).toBe(
      executeAgentRequest
    );
    expect(chatPost?.route?.stack.at(-1)?.handle).toBe(
      executeAgentRequest
    );
  });
});
