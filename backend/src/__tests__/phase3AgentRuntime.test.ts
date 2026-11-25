import {
  createTaskState,
  getTaskState,
  updateTaskState,
} from '../ai/agent/taskStateStore';
import {
  AgentContext,
  AgentToolDefinition,
} from '../ai/agent/types';
import {
  registerAgentTool,
  executeAgentTool,
} from '../ai/agent/toolRegistry';
import { listAgentExecutions } from '../ai/agent/agentPersistence';

jest.mock('../lib/prisma', () => require('./support/mockPrisma'));
jest.mock('../services/aiSalesService', () => ({
  AiSalesService: {
    processMessage: jest.fn(),
  },
}));

import { AiSalesService } from '../services/aiSalesService';
import { executeAgent } from '../ai/agent/agentOrchestrator';
import { resetAgentPrisma } from './support/mockPrisma';

const mockedProcessMessage =
  AiSalesService.processMessage as jest.MockedFunction<
    typeof AiSalesService.processMessage
  >;

const testContext: AgentContext = {
  conversationId: 'phase3-session',
  user: {
    userId: 'phase3-user',
    role: 'BUYER',
  },
  metadata: {},
};

function registerTool(
  definition: Partial<AgentToolDefinition> &
    Pick<AgentToolDefinition, 'name' | 'execute'>
): void {
  registerAgentTool({
    description: 'Phase 3 controlled test tool',
    riskLevel: 'low',
    retrySafe: false,
    parameters: {
      type: 'object',
      properties: {},
    },
    ...definition,
  });
}

describe('phase 3 task state management', () => {
  afterEach(() => {
    resetAgentPrisma();
    mockedProcessMessage.mockReset();
  });

  it('tracks pending and completed plan steps', async () => {
    const plan = {
      goal: 'Find and compare products',
      intent: 'product_comparison' as const,
      agent: 'marketplace' as const,
      steps: [
        { id: 'gather', description: 'Gather products', status: 'completed' as const },
        { id: 'compare', description: 'Compare products', status: 'queued' as const, dependsOn: ['gather'] },
      ],
    };

    const state = await createTaskState({
      taskId: 'task-1',
      conversationId: 'conversation-1',
      userId: 'user-1',
      originalRequest: plan.goal,
      plan,
    });

    expect(state.completedStepIds).toEqual(['gather']);
    expect(state.pendingStepIds).toEqual(['compare']);
    await expect(getTaskState('task-1', 'user-1')).resolves.toMatchObject({
      taskId: 'task-1',
      status: 'planning',
    });
  });

  describe('phase 3 orchestrated execution', () => {
    afterEach(() => {
      resetAgentPrisma();
      mockedProcessMessage.mockReset();
    });

    it('executes sequential tools and emits an ordered successful lifecycle', async () => {
      const first = jest.fn().mockResolvedValue({ value: 'first-result' });
      const second = jest.fn().mockResolvedValue({ value: 'second-result' });
      registerTool({ name: 'phase3_first', execute: first });
      registerTool({ name: 'phase3_second', execute: second });

      mockedProcessMessage
        .mockResolvedValueOnce({
          toolCalls: [{ id: 'one', name: 'phase3_first', arguments: {} }],
          content: '',
        })
        .mockResolvedValueOnce({
          toolCalls: [{ id: 'two', name: 'phase3_second', arguments: {} }],
          content: '',
        })
        .mockResolvedValueOnce({
          toolCalls: [],
          content: 'Both steps completed.',
        });

      const events: string[] = [];
      const result = await executeAgent(
        { message: 'Complete this multi-step task', taskId: 'task-sequence' },
        testContext,
        { enablePlanning: false },
        (event) => events.push(event.type)
      );

      expect(first).toHaveBeenCalledTimes(1);
      expect(second).toHaveBeenCalledTimes(1);
      expect(result.success).toBe(true);
      expect(result.toolResults?.map((item) => item.name)).toEqual([
        'phase3_first',
        'phase3_second',
      ]);
      expect(events.indexOf('task_started')).toBeLessThan(
        events.indexOf('step_started')
      );
      expect(events).toContain('step_completed');
      expect(events[events.length - 1]).toBe('task_completed');
    });

    it('retries a recoverable failure only for an explicitly retry-safe tool', async () => {
      const execute = jest
        .fn()
        .mockRejectedValueOnce(new Error('temporary network failure'))
        .mockResolvedValueOnce({ value: 'recovered' });
      registerTool({
        name: 'phase3_retryable',
        execute,
        retrySafe: true,
      });
      mockedProcessMessage
        .mockResolvedValueOnce({
          toolCalls: [{ id: 'retry', name: 'phase3_retryable', arguments: {} }],
          content: '',
        })
        .mockResolvedValueOnce({
          toolCalls: [],
          content: 'Recovered using the safe retry.',
        });

      const result = await executeAgent(
        { message: 'Recover this task' },
        testContext,
        { enablePlanning: false, maxRetriesPerTool: 1 }
      );

      expect(execute).toHaveBeenCalledTimes(2);
      expect(result.success).toBe(true);
      expect(result.toolResults).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ success: false }),
          expect.objectContaining({
            success: true,
            metadata: expect.objectContaining({ retryAttempt: 1 }),
          }),
        ])
      );
      if (!result.taskId) {
        throw new Error('Agent response did not include its task ID.');
      }
      const persistedExecutions = await listAgentExecutions(result.taskId);
      expect(persistedExecutions.map((execution) => execution.attempt)).toEqual([
        0,
        1,
      ]);
    });

    it('does not retry a non-idempotent tool after a recoverable failure', async () => {
      const execute = jest
        .fn()
        .mockRejectedValue(new Error('temporary gateway failure'));
      registerTool({
        name: 'phase3_non_idempotent',
        execute,
        retrySafe: false,
      });
      mockedProcessMessage
        .mockResolvedValueOnce({
          toolCalls: [{ id: 'write', name: 'phase3_non_idempotent', arguments: {} }],
          content: '',
        })
        .mockResolvedValueOnce({
          toolCalls: [],
          content: 'The operation could not be completed.',
        });

      const events: string[] = [];
      const result = await executeAgent(
        { message: 'Perform this write operation' },
        testContext,
        { enablePlanning: false, maxRetriesPerTool: 2 },
        (event) => events.push(event.type)
      );

      expect(execute).toHaveBeenCalledTimes(1);
      expect(result.success).toBe(false);
      expect(result.status).toBe('failed');
      expect(result.content).not.toContain('completed successfully');
      expect(events).toContain('step_failed');
      expect(events[events.length - 1]).toBe('task_failed');
    });

    it('records a timeout as failure and ignores a late completion', async () => {
      let resolveLate: (value: unknown) => void = () => undefined;
      const execute = jest.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveLate = resolve;
          })
      );
      registerTool({
        name: 'phase3_timeout',
        execute,
        retrySafe: false,
      });
      mockedProcessMessage
        .mockResolvedValueOnce({
          toolCalls: [{ id: 'timeout', name: 'phase3_timeout', arguments: {} }],
          content: '',
        })
        .mockResolvedValueOnce({
          toolCalls: [],
          content: 'The operation timed out and was not confirmed.',
        });

      const result = await executeAgent(
        { message: 'Run the timed operation' },
        testContext,
        { enablePlanning: false, toolTimeoutMs: 5 }
      );

      expect(result.success).toBe(false);
      expect(result.status).toBe('failed');
      expect(result.toolResults).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            success: false,
            error: expect.stringContaining('timed out'),
          }),
        ])
      );
      const recorded = result.toolResults?.[0];
      resolveLate({ success: true, completed: true });
      await new Promise((resolve) => setImmediate(resolve));
      expect(recorded?.success).toBe(false);
    });

    it('stops at the execution budget without entering an infinite loop', async () => {
      const execute = jest.fn().mockResolvedValue({ value: 'ok' });
      registerTool({ name: 'phase3_budget', execute });
      mockedProcessMessage.mockResolvedValue({
        toolCalls: [{ id: 'budget', name: 'phase3_budget', arguments: {} }],
        content: '',
      });

      const result = await executeAgent(
        { message: 'Keep working forever' },
        testContext,
        { enablePlanning: false, maxSteps: 2, maxToolCalls: 2 }
      );

      expect(execute).toHaveBeenCalledTimes(1);
      expect(result.metadata).toMatchObject({
        loopTerminatedByLimit: true,
      });
      expect(result.content).toContain('execution limit');
    });

    it('replans after unusable output and prevents an identical failed call', async () => {
      const emptySearch = jest.fn().mockResolvedValue({ items: [] });
      const fallbackSearch = jest.fn().mockResolvedValue({ items: ['match'] });
      registerTool({ name: 'phase3_empty_search', execute: emptySearch });
      registerTool({ name: 'phase3_fallback_search', execute: fallbackSearch });
      mockedProcessMessage
        .mockResolvedValueOnce({
          toolCalls: [{ id: 'empty', name: 'phase3_empty_search', arguments: {} }],
          content: '',
        })
        .mockResolvedValueOnce({
          toolCalls: [{ id: 'fallback', name: 'phase3_fallback_search', arguments: {} }],
          content: '',
        })
        .mockResolvedValueOnce({
          toolCalls: [],
          content: 'The fallback search found a match.',
        });

      const result = await executeAgent(
        { message: 'Find an available match' },
        testContext,
        { enablePlanning: false }
      );

      expect(emptySearch).toHaveBeenCalledTimes(1);
      expect(fallbackSearch).toHaveBeenCalledTimes(1);
      expect(result.success).toBe(true);
      expect(result.toolResults?.map((item) => item.name)).toEqual(
        expect.arrayContaining([
          'get_current_context',
          'phase3_empty_search',
          'phase3_fallback_search',
        ])
      );
    });

    it('blocks an identical failed call from being executed again', async () => {
      const execute = jest.fn().mockRejectedValue(
        new Error('permanent validation failure')
      );
      registerTool({ name: 'phase3_duplicate_failure', execute });
      mockedProcessMessage
        .mockResolvedValueOnce({
          toolCalls: [{ id: 'failure-1', name: 'phase3_duplicate_failure', arguments: {} }],
          content: '',
        })
        .mockResolvedValueOnce({
          toolCalls: [{ id: 'failure-2', name: 'phase3_duplicate_failure', arguments: {} }],
          content: '',
        })
        .mockResolvedValueOnce({
          toolCalls: [],
          content: 'The operation could not be completed.',
        });

      const result = await executeAgent(
        { message: 'Repeat the invalid operation' },
        testContext,
        { enablePlanning: false }
      );

      expect(execute).toHaveBeenCalledTimes(1);
      expect(result.success).toBe(false);
      expect(result.toolResults).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            error: expect.stringContaining('already failed'),
          }),
        ])
      );
    });

    it('validates known result contracts without rejecting valid empty searches', async () => {
      const emptySearch = jest.fn().mockResolvedValue({ items: [] });
      const malformed = jest.fn().mockResolvedValue({ wrong: true });
      registerTool({
        name: 'phase3_valid_empty_search',
        execute: emptySearch,
        validateResult: (value) => ({
          valid: Boolean(
            value &&
            typeof value === 'object' &&
            Array.isArray((value as { items?: unknown }).items)
          ),
          kind: 'empty',
          details: { itemCount: 0 },
        }),
      });
      registerTool({
        name: 'phase3_malformed_result',
        execute: malformed,
        validateResult: () => ({
          valid: false,
          kind: 'malformed',
          error: 'Expected an items array.',
          details: { requiredFields: ['items'] },
        }),
      });
      registerTool({
        name: 'phase3_incomplete_result',
        execute: jest.fn().mockResolvedValue({ items: null }),
        validateResult: () => ({
          valid: false,
          kind: 'incomplete',
          error: 'The items field is incomplete.',
          details: { requiredFields: ['items'] },
        }),
      });

      const emptyResult = await executeAgentTool(
        'phase3_valid_empty_search',
        {},
        testContext
      );
      const malformedResult = await executeAgentTool(
        'phase3_malformed_result',
        {},
        testContext
      );
      const incompleteResult = await executeAgentTool(
        'phase3_incomplete_result',
        {},
        testContext
      );

      expect(emptyResult.success).toBe(true);
      expect(emptyResult.metadata).toMatchObject({
        resultValidation: { valid: true, kind: 'empty' },
      });
      expect(malformedResult.success).toBe(false);
      expect(malformedResult.metadata).toMatchObject({
        resultValidation: { valid: false, kind: 'malformed' },
      });
      expect(malformedResult.result).toEqual({ wrong: true });
      expect(incompleteResult.success).toBe(false);
      expect(incompleteResult.metadata).toMatchObject({
        resultValidation: { valid: false, kind: 'incomplete' },
      });
    });

    it('pauses for approval and resumes only with the bound approval token', async () => {
      const execute = jest.fn().mockResolvedValue({ deleted: true });
      registerTool({
        name: 'phase3_protected_action',
        execute,
        riskLevel: 'critical',
        requiresApproval: true,
      });
      mockedProcessMessage.mockResolvedValueOnce({
        toolCalls: [{
          id: 'protected',
          name: 'phase3_protected_action',
          arguments: { itemId: 'item-1' },
        }],
        content: '',
      });

      const pausedEvents: string[] = [];
      const paused = await executeAgent(
        {
          message: 'Delete the item',
          taskId: 'task-approval',
        },
        testContext,
        { enablePlanning: false, executeActions: true },
        (event) => pausedEvents.push(event.type)
      );

      expect(paused.status).toBe('waiting_approval');
      expect(paused.requiresApproval).toBe(true);
      expect(execute).not.toHaveBeenCalled();
      expect(pausedEvents).toContain('approval_required');
      expect(pausedEvents[pausedEvents.length - 1]).toBe(
        'approval_required'
      );

      mockedProcessMessage
        .mockReset()
        .mockResolvedValueOnce({
          toolCalls: [{
            id: 'protected-approved',
            name: 'phase3_protected_action',
            arguments: { itemId: 'item-1' },
          }],
          content: '',
        })
        .mockResolvedValueOnce({
          toolCalls: [],
          content: 'The protected action was confirmed by the backend.',
        });

      const resumed = await executeAgent(
        {
          message: 'Continue the approved item action',
          taskId: 'task-approval',
          executeActions: true,
          approvedAction: {
            toolName: 'phase3_protected_action',
            params: { itemId: 'item-1' },
            approvalToken: paused.pendingAction?.approvalToken,
          },
        },
        testContext,
        { enablePlanning: false, executeActions: true }
      );

      expect(execute).toHaveBeenCalledTimes(1);
      expect(resumed.success).toBe(true);
      expect(resumed.status).toBe('completed');
    });
  });

  it('rejects cross-user reads and updates', async () => {
    await createTaskState({
      taskId: 'task-2',
      userId: 'owner',
      originalRequest: 'Private task',
      plan: {
        goal: 'Private task',
        intent: 'planning',
        agent: 'planning',
        steps: [],
      },
    });

    await expect(getTaskState('task-2', 'other-user')).rejects.toThrow(
      'Task does not belong to the authenticated user.'
    );
    await expect(
      updateTaskState('task-2', 'other-user', { status: 'cancelled' })
    ).rejects.toThrow('Task does not belong to the authenticated user.');
  });

  it('records approval state and final outcome', async () => {
    await createTaskState({
      taskId: 'task-3',
      userId: 'user-3',
      originalRequest: 'Create a listing',
      plan: {
        goal: 'Create a listing',
        intent: 'automation',
        agent: 'marketplace',
        steps: [{ id: 'create', description: 'Create listing', status: 'queued' }],
      },
    });

    const updated = await updateTaskState('task-3', 'user-3', {
      status: 'waiting_approval',
      approvalState: 'pending',
      finalOutcome: 'Waiting for explicit approval.',
    });

    expect(updated).toMatchObject({
      status: 'waiting_approval',
      approvalState: 'pending',
      finalOutcome: 'Waiting for explicit approval.',
    });
  });
});