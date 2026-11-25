import { Request, Response } from 'express';

import { AgentEvent } from '../ai/agent/types';
import { executeAgent } from '../ai/agent/agentOrchestrator';
import {
  listAgentEvents,
  listAgentExecutions,
} from '../ai/agent/agentPersistence';
import { getTaskState } from '../ai/agent/taskStateStore';
import { inspectAndPrepareRecovery } from '../ai/agent/crashRecovery';
import {
  buildAgentRequest,
  getAgentContext,
} from './agentControllerHelpers/context';
import {
  writeSse,
  writeSseDone,
  writeSseEvent,
} from './agentControllerHelpers/sse';
import { buildLegacyResponse } from './agentControllerHelpers/legacy';

function getRequestedTaskId(req: Request): string | undefined {
  const taskId = req.params.taskId;
  return typeof taskId === 'string' && taskId.trim()
    ? taskId.trim()
    : undefined;
}

export const executeAgentRequest = async (
  req: Request,
  res: Response
): Promise<void> => {
  const startedAt = Date.now();

  try {
    const body = req.body || {};
    const message =
      typeof body.message === 'string'
        ? body.message.trim()
        : '';

    if (!message) {
      res.status(400).json({
        success: false,
        error: 'message is required.',
      });
      return;
    }

    const context = getAgentContext(req);
    const request = buildAgentRequest(
      req,
      context,
      message
    );
    const wantsStream = request.stream !== false;

    if (!wantsStream) {
      const result = await executeAgent(
        request,
        context,
        {
          executeActions:
            request.executeActions === true,
        }
      );

      const response = buildLegacyResponse(result);

      res
        .status(result.success ? 200 : 500)
        .json({
          ...response,
          durationMs: Date.now() - startedAt,
        });

      return;
    }

    res.status(200);
    res.setHeader(
      'Content-Type',
      'text/event-stream; charset=utf-8'
    );
    res.setHeader(
      'Cache-Control',
      'no-cache, no-transform'
    );
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    try {
      res.flushHeaders?.();
    } catch {
      // Not available on every Express response.
    }

    writeSse(res, {
      type: 'connected',
      status: 'connected',
      timestamp: new Date().toISOString(),
    });

    const sendEvent = (event: AgentEvent) => {
      if (res.writableEnded) {
        return;
      }

      writeSseEvent(res, event);
    };

    const result = await executeAgent(
      request,
      context,
      {
        executeActions:
          request.executeActions === true,
      },
      sendEvent
    );

    if (!res.writableEnded) {
      const legacy = buildLegacyResponse(result);

      writeSse(res, {
        type: 'final',
        done: true,
        requestId: result.requestId,
        taskId: result.taskId,
        response: result.content,
        message: result.content,
        content: result.content,
        agent: result.agent,
        intent: result.intent,
        status: result.status,
        success: result.success,
        plan: result.plan,
        toolExecutions: legacy.toolExecutions,
        toolResults: result.toolResults,
        toolCalls: result.toolCalls,
        verification: result.verification,
        requiresConfirmation: Boolean(result.requiresApproval),
        requiresApproval: Boolean(result.requiresApproval),
        pendingToolDetails: legacy.pendingToolDetails,
        pendingAction: result.pendingAction,
        metadata: {
          ...(result.metadata || {}),
          durationMs: Date.now() - startedAt,
        },
        timestamp: new Date().toISOString(),
      });

      writeSseDone(res);
      res.end();
    }
  } catch (error: any) {
    console.error(
      '[Tradara Agent Gateway Error]:',
      error
    );

    const errorMessage =
      error?.message ||
      'Failed to execute Tradara AI agent.';

    const errorPayload = {
      type: 'error',
      requestId: `agent_error_${Date.now()}`,
      timestamp: new Date().toISOString(),
      status: 'failed',
      success: false,
      error: errorMessage,
    };

    if (!res.headersSent) {
      res.status(500).json(errorPayload);
      return;
    }

    try {
      writeSse(res, errorPayload);
      writeSseDone(res);
      res.end();
    } catch {
      // Ignore disconnected clients.
    }
  }
};

export const getAgentTaskRequest = async (
  req: Request,
  res: Response
): Promise<void> => {
  const taskId = getRequestedTaskId(req);
  if (!taskId) {
    res.status(400).json({
      success: false,
      error: 'taskId is required.',
    });
    return;
  }

  const userId = req.user?.id;
  if (!userId || userId === 'usr_guest_anonymous') {
    res.status(401).json({
      success: false,
      error: 'Authentication is required to access agent tasks.',
    });
    return;
  }

  try {
    const task = await getTaskState(taskId, userId);
    if (!task) {
      res.status(404).json({
        success: false,
        error: 'Agent task was not found.',
      });
      return;
    }

    const [executions, events] = await Promise.all([
      listAgentExecutions(task.taskId),
      listAgentEvents(task.taskId),
    ]);
    res.json({
      success: true,
      task,
      executions,
      events: events.map((event) => event.payload),
    });
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      error.message === 'Task does not belong to the authenticated user.'
    ) {
      res.status(404).json({
        success: false,
        error: 'Agent task was not found.',
      });
      return;
    }

    console.error('[Tradara Agent Task Read Error]:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve agent task.',
    });
  }
};

export const getAgentTaskEventsRequest = async (
  req: Request,
  res: Response
): Promise<void> => {
  const taskId = getRequestedTaskId(req);
  if (!taskId) {
    res.status(400).json({
      success: false,
      error: 'taskId is required.',
    });
    return;
  }

  const userId = req.user?.id;
  if (!userId || userId === 'usr_guest_anonymous') {
    res.status(401).json({
      success: false,
      error: 'Authentication is required to access agent events.',
    });
    return;
  }

  try {
    const task = await getTaskState(taskId, userId);
    if (!task) {
      res.status(404).json({
        success: false,
        error: 'Agent task was not found.',
      });
      return;
    }

    const rawAfter = req.query.afterSequence;
    const afterSequence =
      typeof rawAfter === 'string' && /^\d+$/.test(rawAfter)
        ? Math.max(0, Number(rawAfter))
        : 0;
    const events = await listAgentEvents(task.taskId, afterSequence);
    res.json({
      success: true,
      taskId: task.taskId,
      events: events.map((event) => event.payload),
    });
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      error.message === 'Task does not belong to the authenticated user.'
    ) {
      res.status(404).json({
        success: false,
        error: 'Agent task was not found.',
      });
      return;
    }

    console.error('[Tradara Agent Event Read Error]:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve agent events.',
    });
  }
};

export const getAgentTaskRecoveryRequest = async (
  req: Request,
  res: Response
): Promise<void> => {
  const taskId = getRequestedTaskId(req);
  const userId = req.user?.id;
  if (!taskId) {
    res.status(400).json({ success: false, error: 'taskId is required.' });
    return;
  }
  if (!userId || userId === 'usr_guest_anonymous') {
    res.status(401).json({ success: false, error: 'Authentication is required to inspect agent recovery.' });
    return;
  }

  try {
    const report = await inspectAndPrepareRecovery({
      taskId,
      ownerId: userId,
    });
    if (!report) {
      res.status(404).json({ success: false, error: 'Agent task was not found.' });
      return;
    }
    res.json({ success: true, recovery: report });
  } catch (error: unknown) {
    console.error('[Tradara Agent Recovery Read Error]:', error);
    res.status(500).json({ success: false, error: 'Failed to inspect agent recovery.' });
  }
};

export default executeAgentRequest;
