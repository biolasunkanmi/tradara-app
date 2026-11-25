jest.mock('../lib/prisma', () => require('./support/mockPrisma'));

import prisma from '../lib/prisma';
import {
  appendAgentEvents,
  listAgentEvents,
  reserveAgentExecution,
  startAgentExecution,
} from '../ai/agent/agentPersistence';
import {
  claimAgentStep,
  createTaskState,
  renewAgentStepLease,
  updateTaskState,
  releaseAgentStep,
} from '../ai/agent/taskStateStore';
import { consumeApproval, issueApproval } from '../ai/agent/approvalStore';
import { guestOwnerId, hashGuestToken } from '../ai/agent/guestIdentity';
import { inspectAndPrepareRecovery } from '../ai/agent/crashRecovery';
import { resetAgentPrisma } from './support/mockPrisma';

describe('durable agent hardening', () => {
  afterEach(() => resetAgentPrisma());

  it('isolates authenticated and guest owners and uses hashed guest identity', async () => {
    await createTaskState({
      taskId: 'owner-task',
      userId: 'user-owner',
      originalRequest: 'private',
      plan: { goal: 'private', intent: 'general_question', agent: 'general', steps: [] },
    });
    await expect(createTaskState({
      taskId: 'owner-task',
      userId: 'other-user',
      originalRequest: 'private',
      plan: { goal: 'private', intent: 'general_question', agent: 'general', steps: [] },
    })).rejects.toThrow();

    const token = 'a'.repeat(64);
    expect(guestOwnerId(token)).toBe(`guest:${hashGuestToken(token)}`);
  });

  it('protects task updates from concurrent version writers', async () => {
    await createTaskState({
      taskId: 'version-task',
      userId: 'owner',
      originalRequest: 'test',
      plan: { goal: 'test', intent: 'general_question', agent: 'general', steps: [] },
    });

    await Promise.all([
      updateTaskState('version-task', 'owner', { status: 'executing' }),
      updateTaskState('version-task', 'owner', { approvalState: 'approved' }),
    ]);
    const row = await prisma.agentTask.findUnique({ where: { taskId: 'version-task' } });
    expect(row.version).toBe(2);
  });

  it('claims a step once and rejects stale lease renewal', async () => {
    await createTaskState({
      taskId: 'lease-task',
      userId: 'owner',
      originalRequest: 'test',
      plan: {
        goal: 'test',
        intent: 'automation',
        agent: 'marketplace',
        steps: [{ id: 'work', description: 'work', status: 'queued' }],
      },
    });

    await expect(claimAgentStep({
      taskId: 'lease-task',
      stepId: 'work',
      ownerId: 'worker-1',
      leaseMs: 1000,
    })).resolves.toBe(true);
    await expect(claimAgentStep({
      taskId: 'lease-task',
      stepId: 'work',
      ownerId: 'worker-2',
      leaseMs: 1000,
    })).resolves.toBe(false);
    await expect(renewAgentStepLease({
      taskId: 'lease-task',
      stepId: 'work',
      ownerId: 'worker-2',
      leaseMs: 1000,
    })).resolves.toBe(false);
    await expect(releaseAgentStep({
      taskId: 'lease-task',
      stepId: 'work',
      ownerId: 'worker-1',
      status: 'completed',
    })).resolves.toBe(true);
  });

  it('records events in monotonic sequence and supports afterSequence replay', async () => {
    await appendAgentEvents('event-task', [
      { type: 'start', requestId: 'request-1', timestamp: new Date().toISOString() },
      { type: 'task_completed', requestId: 'request-1', timestamp: new Date().toISOString() },
    ]);
    const events = await listAgentEvents('event-task', 1);
    expect(events).toHaveLength(1);
    expect(events[0].sequence).toBe(2);
    expect(events[0].payload).not.toHaveProperty('approvalToken');
  });

  it('allows only one approval consumer', async () => {
    const token = await issueApproval({
      taskId: 'approval-task',
      userId: 'owner',
      sessionId: 'session',
      toolName: 'delete_item',
      params: { options: { force: true }, itemId: 'item-1' },
    });
    const results = await Promise.all([
      consumeApproval({
        token,
        taskId: 'approval-task',
        userId: 'owner',
        sessionId: 'session',
        toolName: 'delete_item',
        params: { itemId: 'item-1', options: { force: true } },
      }),
      consumeApproval({
        token,
        taskId: 'approval-task',
        userId: 'owner',
        sessionId: 'session',
        toolName: 'delete_item',
        params: { options: { force: true }, itemId: 'item-1' },
      }),
    ]);
    expect(results.filter((result) => result.valid)).toHaveLength(1);
  });

  it('reserves execution and can mark interrupted work uncertain', async () => {
    await startAgentExecution({
      taskId: 'execution-task',
      requestId: 'request',
      userId: 'owner',
      toolCall: { id: 'call', name: 'write_item', args: { itemId: 'item-1' } },
      startedAt: new Date(),
    });
    await expect(reserveAgentExecution({
      taskId: 'execution-task',
      requestId: 'request',
      callId: 'call',
      ownerId: 'worker-1',
      leaseMs: 30000,
    })).resolves.toBe(true);
    await expect(reserveAgentExecution({
      taskId: 'execution-task',
      requestId: 'request',
      callId: 'call',
      ownerId: 'worker-2',
      leaseMs: 30000,
    })).resolves.toBe(false);
  });

  it('prepares bounded crash recovery without repeating uncertain work', async () => {
    await createTaskState({
      taskId: 'crash-task',
      userId: 'owner',
      originalRequest: 'recover',
      plan: {
        goal: 'recover',
        intent: 'automation',
        agent: 'marketplace',
        steps: [{ id: 'uncertain-step', description: 'write', status: 'executing' }],
      },
    });
    await prisma.agentStep.update({
      where: { taskId_stepId: { taskId: 'crash-task', stepId: 'uncertain-step' } },
      data: {
        status: 'executing',
        leaseExpiresAt: new Date(Date.now() - 1000),
      },
    });
    await startAgentExecution({
      taskId: 'crash-task',
      requestId: 'crash-request',
      userId: 'owner',
      toolCall: { id: 'uncertain-call', name: 'write_item', args: { itemId: '1' } },
      startedAt: new Date(),
    });
    await prisma.agentExecution.update({
      where: {
        taskId_requestId_callId_attempt: {
          taskId: 'crash-task',
          requestId: 'crash-request',
          callId: 'uncertain-call',
          attempt: 0,
        },
      },
      data: { status: 'uncertain', outcomeState: 'uncertain' },
    });

    const report = await inspectAndPrepareRecovery({
      taskId: 'crash-task',
      ownerId: 'owner',
    });
    expect(report).toMatchObject({
      disposition: 'uncertain',
      abandonedSteps: ['uncertain-step'],
      uncertainExecutions: ['uncertain-call'],
    });
  });
});
