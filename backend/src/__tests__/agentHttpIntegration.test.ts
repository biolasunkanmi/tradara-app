import { createServer, Server } from 'http';
import jwt from 'jsonwebtoken';
import { app } from '../server';
import {
  registerAgentTool,
} from '../ai/agent/toolRegistry';
import { AiSalesService } from '../services/aiSalesService';

jest.mock('../lib/prisma', () => require('./support/mockPrisma'));
jest.mock('../services/aiSalesService', () => ({
  AiSalesService: {
    processMessage: jest.fn(),
    updateSessionStatus: jest.fn(),
  },
}));

const mockedProcessMessage =
  AiSalesService.processMessage as jest.Mock;

let server: Server;
let port: number;

function token(role: string, id: string): string {
  return jwt.sign(
    { id, role },
    process.env.JWT_SECRET || 'legendary_secret_key_2026'
  );
}

async function request(
  path: string,
  body: Record<string, unknown>,
  authToken?: string
): Promise<{
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}> {
  const response = await fetch(
    `http://127.0.0.1:${port}${path}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authToken
          ? { Authorization: `Bearer ${authToken}` }
          : {}),
      },
      body: JSON.stringify(body),
    }
  );

  return {
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    body: await response.text(),
  };
}

async function get(
  path: string,
  authToken?: string
): Promise<{ status: number; body: string }> {
  const response = await fetch(
    `http://127.0.0.1:${port}${path}`,
    {
      method: 'GET',
      headers: authToken
        ? { Authorization: `Bearer ${authToken}` }
        : {},
    }
  );
  return {
    status: response.status,
    body: await response.text(),
  };
}

describe('agent HTTP integration', () => {
  const execute = jest.fn().mockResolvedValue({
    updated: true,
  });
  const stepOne = jest.fn().mockResolvedValue({ value: 'one' });
  const stepTwo = jest.fn().mockResolvedValue({ value: 'two' });
  const failedStep = jest.fn().mockRejectedValue(
    new Error('HTTP step failed')
  );
  const timeoutStep = jest.fn().mockImplementation(
    () => new Promise(() => undefined)
  );

  beforeAll(async () => {
    registerAgentTool({
      name: 'http_critical_action',
      description: 'HTTP integration critical action',
      riskLevel: 'critical',
      parameters: {
        type: 'object',
        properties: {
          itemId: { type: 'string', required: true },
        },
        required: ['itemId'],
      },
      execute,
    });
    registerAgentTool({
      name: 'http_step_one',
      description: 'HTTP multi-step first step',
      riskLevel: 'low',
      execute: stepOne,
    });
    registerAgentTool({
      name: 'http_step_two',
      description: 'HTTP multi-step second step',
      riskLevel: 'low',
      execute: stepTwo,
    });
    registerAgentTool({
      name: 'http_failed_step',
      description: 'HTTP failed step',
      riskLevel: 'low',
      execute: failedStep,
    });
    registerAgentTool({
      name: 'http_timeout_step',
      description: 'HTTP timeout step',
      riskLevel: 'low',
      timeoutMs: 5,
      execute: timeoutStep,
    });

    server = createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        if (!address || typeof address === 'string') {
          throw new Error('HTTP test server did not bind to a port.');
        }
        port = address.port;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  beforeEach(() => {
    const { resetAgentPrisma } = require('./support/mockPrisma') as {
      resetAgentPrisma: () => void;
    };
    resetAgentPrisma();
    mockedProcessMessage.mockReset();
    execute.mockClear();
    stepOne.mockClear();
    stepTwo.mockClear();
    failedStep.mockClear();
    timeoutStep.mockClear();
  });

  it('runs authentication, authorization, approval, resume, mismatch, failure, and SSE through Express', async () => {
    mockedProcessMessage.mockResolvedValue({
      content: 'HTTP request completed.',
      toolCalls: [],
    });

    const unauthenticated = await request(
      '/api/ai/agent',
      { message: 'Hello', stream: false }
    );
    expect(unauthenticated.status).toBe(200);
    expect(JSON.parse(unauthenticated.body).success).toBe(true);

    const sellerToken = token('SELLER', 'seller-http');
    const authorized = await request(
      '/api/ai/agent',
      {
        message: 'Hello seller',
        stream: false,
        context: { user: { role: 'ADMIN', userId: 'forged' } },
      },
      sellerToken
    );
    expect(authorized.status).toBe(200);
    expect(mockedProcessMessage.mock.calls.at(-1)?.[0].systemPrompt).toContain(
      'Role: SELLER'
    );
    expect(mockedProcessMessage.mock.calls.at(-1)?.[0].systemPrompt).not.toContain(
      'Role: ADMIN'
    );

    mockedProcessMessage
      .mockResolvedValueOnce({
        content: '',
        toolCalls: [
          {
            id: 'http-approval',
            name: 'http_critical_action',
            arguments: { itemId: 'item-http' },
          },
        ],
      });

    const pending = await request(
      '/api/ai/agent',
      {
        message: 'Update item',
        stream: false,
        conversationId: 'http-session',
        executeActions: true,
      },
      sellerToken
    );
    const pendingBody = JSON.parse(pending.body);
    expect(pending.status).toBe(200);
    expect(pendingBody.status).toBe('waiting_approval');
    expect(pendingBody.pendingAction.approvalToken).toEqual(
      expect.any(String)
    );
    expect(execute).not.toHaveBeenCalled();

    mockedProcessMessage
      .mockResolvedValueOnce({
        content: '',
        toolCalls: [
          {
            id: 'http-approval-resume',
            name: 'http_critical_action',
            arguments: { itemId: 'item-http' },
          },
        ],
      })
      .mockResolvedValueOnce({
        content: 'Action resumed.',
        toolCalls: [],
      });

    const resumed = await request(
      '/api/ai/agent',
      {
        message: 'Update item',
        stream: false,
        conversationId: 'http-session',
        executeActions: true,
        approvedAction: {
          toolName: 'http_critical_action',
          params: { itemId: 'item-http' },
          approvalToken: pendingBody.pendingAction.approvalToken,
        },
      },
      sellerToken
    );
    expect(resumed.status).toBe(200);
    expect(execute).toHaveBeenCalledTimes(1);

    mockedProcessMessage.mockResolvedValueOnce({
      content: '',
      toolCalls: [
        {
          id: 'http-replay',
          name: 'http_critical_action',
          arguments: { itemId: 'item-http' },
        },
      ],
    });

    const replayed = await request(
      '/api/ai/agent',
      {
        message: 'Update item',
        stream: false,
        conversationId: 'http-session',
        executeActions: true,
        approvedAction: {
          toolName: 'http_critical_action',
          params: { itemId: 'item-http' },
          approvalToken: pendingBody.pendingAction.approvalToken,
        },
      },
      sellerToken
    );
    expect(JSON.parse(replayed.body).status).toBe('waiting_approval');
    expect(execute).toHaveBeenCalledTimes(1);

    mockedProcessMessage.mockResolvedValueOnce({
      content: '',
      toolCalls: [
        {
          id: 'http-mismatch',
          name: 'http_critical_action',
          arguments: { itemId: 'item-other' },
        },
      ],
    });

    const mismatched = await request(
      '/api/ai/agent',
      {
        message: 'Update item',
        stream: false,
        conversationId: 'http-session-2',
        executeActions: true,
        approvedAction: {
          toolName: 'http_critical_action',
          params: { itemId: 'item-http' },
          approvalToken: pendingBody.pendingAction.approvalToken,
        },
      },
      token('SELLER', 'different-user')
    );
    expect(JSON.parse(mismatched.body).status).toBe('waiting_approval');
    expect(execute).toHaveBeenCalledTimes(1);

    mockedProcessMessage.mockResolvedValueOnce({
      content: '',
      toolCalls: [
        {
          id: 'http-failure-pending',
          name: 'http_critical_action',
          arguments: { itemId: 'item-failure' },
        },
      ],
    });

    const failurePending = await request(
      '/api/ai/agent',
      {
        message: 'Update item',
        stream: false,
        conversationId: 'http-failure-session',
        executeActions: true,
      },
      sellerToken
    );
    const failurePendingBody = JSON.parse(failurePending.body);
    execute.mockRejectedValueOnce(new Error('HTTP handler failure'));
    mockedProcessMessage
      .mockResolvedValueOnce({
        content: '',
        toolCalls: [
          {
            id: 'http-failure',
            name: 'http_critical_action',
            arguments: { itemId: 'item-failure' },
          },
        ],
      })
      .mockResolvedValueOnce({
        content: 'Failure observed.',
        toolCalls: [],
      });

    const failure = await request(
      '/api/ai/agent',
      {
        message: 'Update item',
        stream: false,
        conversationId: 'http-failure-session',
        executeActions: true,
        approvedAction: {
          toolName: 'http_critical_action',
          params: { itemId: 'item-failure' },
          approvalToken: failurePendingBody.pendingAction.approvalToken,
        },
      },
      sellerToken
    );
    expect(JSON.parse(failure.body).toolResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          success: false,
          error: 'HTTP handler failure',
        }),
      ])
    );

    mockedProcessMessage.mockResolvedValueOnce({
      content: 'SSE complete.',
      toolCalls: [],
    });
    const sse = await request(
      '/api/ai/chat',
      { message: 'Stream this response' },
      sellerToken
    );
    expect(sse.status).toBe(200);
    expect(sse.headers['content-type']).toContain('text/event-stream');
    expect(sse.body.indexOf('"type":"connected"')).toBeGreaterThanOrEqual(0);
    expect(sse.body.indexOf('"type":"final"')).toBeGreaterThan(
      sse.body.indexOf('"type":"connected"')
    );
    expect(sse.body.endsWith('data: [DONE]\n\n')).toBe(true);
  });

  it('preserves legacy SSE events while exposing real successful multi-step lifecycle events', async () => {
    mockedProcessMessage
      .mockResolvedValueOnce({
        content: '',
        toolCalls: [
          { id: 'step-one', name: 'http_step_one', arguments: {} },
        ],
      })
      .mockResolvedValueOnce({
        content: '',
        toolCalls: [
          { id: 'step-two', name: 'http_step_two', arguments: {} },
        ],
      })
      .mockResolvedValueOnce({
        content: 'HTTP multi-step complete.',
        toolCalls: [],
      });

    const userToken = token('BUYER', 'http-user-1');
    const response = await request(
      '/api/ai/chat',
      { message: 'Run the multi-step task' },
      userToken
    );
    const payloads = response.body
      .split('\n\n')
      .filter((chunk) => chunk.startsWith('data: {'))
      .map((chunk) => JSON.parse(chunk.replace(/^data:\s*/, '')));
    const types = payloads.map((payload) => payload.type);

    expect(response.status).toBe(200);
    expect(stepOne).toHaveBeenCalledTimes(1);
    expect(stepTwo).toHaveBeenCalledTimes(1);
    expect(types).toContain('connected');
    expect(types).toContain('task_started');
    expect(types).toContain('step_started');
    expect(types).toContain('step_completed');
    expect(types).toContain('task_completed');
    expect(types).toContain('final');
    expect(payloads.at(-1)).toMatchObject({
      type: 'final',
      success: true,
      status: 'completed',
    });
    expect(response.body.endsWith('data: [DONE]\n\n')).toBe(true);

    const taskId = payloads.at(-1)?.taskId as string;
    expect(taskId).toEqual(expect.any(String));
    const storedTaskResponse = await get(
      `/api/ai/agent/tasks/${encodeURIComponent(taskId)}`,
      userToken
    );
    const storedTask = JSON.parse(storedTaskResponse.body);
    expect(storedTaskResponse.status).toBe(200);
    expect(storedTask).toMatchObject({
      success: true,
      task: {
        taskId,
        status: 'completed',
      },
    });
    expect(storedTask.executions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ toolName: 'http_step_one', status: 'completed' }),
        expect.objectContaining({ toolName: 'http_step_two', status: 'completed' }),
      ])
    );
    expect(storedTask.events.map((event: { type: string }) => event.type)).toEqual(
      expect.arrayContaining(['task_started', 'step_started', 'task_completed'])
    );

    const foreignTaskResponse = await get(
      `/api/ai/agent/tasks/${encodeURIComponent(taskId)}`,
      token('BUYER', 'another-user')
    );
    expect(foreignTaskResponse.status).toBe(404);

    const unauthenticatedEvents = await get(
      `/api/ai/agent/tasks/${encodeURIComponent(taskId)}/events`
    );
    expect(unauthenticatedEvents.status).toBe(401);
  });

  it('reports failed and timed-out HTTP tasks without false completion', async () => {
    mockedProcessMessage
      .mockResolvedValueOnce({
        content: '',
        toolCalls: [
          { id: 'failed-step', name: 'http_failed_step', arguments: {} },
        ],
      })
      .mockResolvedValueOnce({
        content: 'The step failed and was not completed.',
        toolCalls: [],
      });

    const failed = await request(
      '/api/ai/agent',
      { message: 'Run a failing task' },
      token('BUYER', 'http-user-2')
    );
    const failedPayloads = failed.body
      .split('\n\n')
      .filter((chunk) => chunk.startsWith('data: {'))
      .map((chunk) => JSON.parse(chunk.replace(/^data:\s*/, '')));

    expect(failedPayloads.at(-1)).toMatchObject({
      type: 'final',
      success: false,
      status: 'failed',
    });
    expect(
      failedPayloads.some((payload) => payload.type === 'task_completed')
    ).toBe(false);

    mockedProcessMessage
      .mockReset()
      .mockResolvedValueOnce({
        content: '',
        toolCalls: [
          { id: 'timeout-step', name: 'http_timeout_step', arguments: {} },
        ],
      })
      .mockResolvedValueOnce({
        content: 'The timeout is unconfirmed.',
        toolCalls: [],
      });

    const timedOut = await request(
      '/api/ai/chat',
      { message: 'Run a timed task' },
      token('BUYER', 'http-user-3')
    );
    const timeoutPayloads = timedOut.body
      .split('\n\n')
      .filter((chunk) => chunk.startsWith('data: {'))
      .map((chunk) => JSON.parse(chunk.replace(/^data:\s*/, '')));

    expect(timeoutPayloads.at(-1)).toMatchObject({
      type: 'final',
      success: false,
      status: 'failed',
    });
    expect(
      timeoutPayloads.some((payload) => payload.type === 'task_completed')
    ).toBe(false);
    expect(timedOut.body).toContain('timed out');
  });

  it('keeps approval-paused SSE isolated to the authenticated user', async () => {
    mockedProcessMessage.mockResolvedValueOnce({
      content: '',
      toolCalls: [
        {
          id: 'approval-http',
          name: 'http_critical_action',
          arguments: { itemId: 'isolated-item' },
        },
      ],
    });

    const ownerToken = token('SELLER', 'http-owner');
    const response = await request(
      '/api/ai/agent',
      {
        message: 'Approve this action',
        executeActions: true,
        conversationId: 'isolated-session',
      },
      ownerToken
    );
    const payloads = response.body
      .split('\n\n')
      .filter((chunk) => chunk.startsWith('data: {'))
      .map((chunk) => JSON.parse(chunk.replace(/^data:\s*/, '')));

    expect(payloads.at(-1)).toMatchObject({
      type: 'final',
      success: true,
      status: 'waiting_approval',
      requiresApproval: true,
    });
    expect(
      payloads.some((payload) => payload.type === 'approval_required')
    ).toBe(true);

    const pendingAction = payloads.at(-1)?.pendingAction;
    const approvalToken = pendingAction.approvalToken as string;
    const storedTask = await get(
      `/api/ai/agent/tasks/${encodeURIComponent(payloads.at(-1)?.taskId)}`,
      ownerToken
    );
    expect(storedTask.status).toBe(200);
    const storedTaskBody = JSON.parse(storedTask.body);
    expect(storedTask.body).not.toContain(approvalToken);
    const storedApprovalEvent = storedTaskBody.events.find(
      (event: { type: string }) => event.type === 'approval_required'
    );
    expect(storedApprovalEvent.pendingAction).not.toHaveProperty('approvalToken');

    mockedProcessMessage.mockReset().mockResolvedValueOnce({
      content: '',
      toolCalls: [
        {
          id: 'approval-cross-user',
          name: 'http_critical_action',
          arguments: { itemId: 'isolated-item' },
        },
      ],
    });
    const crossUser = await request(
      '/api/ai/agent',
      {
        message: 'Reuse another user approval',
        stream: false,
        executeActions: true,
        conversationId: 'isolated-session',
        approvedAction: {
          toolName: 'http_critical_action',
          params: { itemId: 'isolated-item' },
          approvalToken: 'not-the-owner-token',
        },
      },
      token('SELLER', 'http-other')
    );
    expect(JSON.parse(crossUser.body).status).toBe('waiting_approval');
    expect(execute).not.toHaveBeenCalled();
  });
});
