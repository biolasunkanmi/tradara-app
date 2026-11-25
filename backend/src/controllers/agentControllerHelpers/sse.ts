import { Response } from 'express';

import { AgentEvent } from '../../ai/agent/types';

export function writeSse(
  res: Response,
  payload: unknown
): void {
  try {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  } catch {
    // Client may have disconnected.
  }
}

export function writeSseDone(
  res: Response
): void {
  try {
    res.write('data: [DONE]\n\n');
  } catch {
    // Client may have disconnected.
  }
}

export function writeSseEvent(
  res: Response,
  event: AgentEvent
): void {
  switch (event.type) {
    case 'task_started':
    case 'plan_created':
    case 'plan_updated':
    case 'task_replanned':
    case 'step_started':
    case 'step_completed':
    case 'step_failed':
    case 'task_completed':
    case 'task_failed': {
      writeSse(res, {
        type: event.type,
        requestId: event.requestId,
        taskId: event.taskId,
        status: event.status,
        plan: event.plan,
        content: event.content,
        error: event.error,
        metadata: event.metadata,
        timestamp: event.timestamp,
      });
      return;
    }

    case 'tool_started': {
      writeSse(res, {
        type: 'tool',
        status: 'started',
        requestId: event.requestId,
        taskId: event.taskId,
        toolCall: event.toolCall,
        toolName: event.toolCall?.name,
        name: event.toolCall?.name,
        args: event.toolCall?.args,
        timestamp: event.timestamp,
      });
      return;
    }

    case 'start': {
      writeSse(res, {
        type: 'status',
        status: event.status || 'planning',
        requestId: event.requestId,
        taskId: event.taskId,
        agent: event.agent,
        intent: event.intent,
        timestamp: event.timestamp,
      });
      return;
    }

    case 'status': {
      writeSse(res, {
        type: 'status',
        status: event.status,
        requestId: event.requestId,
        taskId: event.taskId,
        agent: event.agent,
        intent: event.intent,
        metadata: event.metadata,
        timestamp: event.timestamp,
      });
      return;
    }

    case 'plan': {
      writeSse(res, {
        type: 'plan',
        requestId: event.requestId,
        taskId: event.taskId,
        plan: event.plan,
        agent: event.agent,
        intent: event.intent,
        timestamp: event.timestamp,
      });
      return;
    }

    case 'tool_start': {
      writeSse(res, {
        type: 'tool',
        status: 'started',
        requestId: event.requestId,
        taskId: event.taskId,
        toolCall: event.toolCall,
        toolName: event.toolCall?.name,
        name: event.toolCall?.name,
        args: event.toolCall?.args,
        timestamp: event.timestamp,
      });
      return;
    }

    case 'tool_result': {
      writeSse(res, {
        type: 'tool',
        status: event.toolResult?.success ? 'completed' : 'failed',
        requestId: event.requestId,
        taskId: event.taskId,
        toolResult: event.toolResult,
        toolName: event.toolResult?.name,
        name: event.toolResult?.name,
        result: event.toolResult?.result,
        error: event.toolResult?.error,
        timestamp: event.timestamp,
      });
      return;
    }

    case 'content': {
      if (event.content) {
        writeSse(res, {
          chunk: event.content,
          type: 'text',
          content: event.content,
          requestId: event.requestId,
          taskId: event.taskId,
          agent: event.agent,
          intent: event.intent,
          timestamp: event.timestamp,
        });
      }
      return;
    }

    case 'warning': {
      writeSse(res, {
        type: 'warning',
        warning: event.content || event.error || 'Tradara AI returned a warning.',
        requestId: event.requestId,
        taskId: event.taskId,
        metadata: event.metadata,
        timestamp: event.timestamp,
      });
      return;
    }

    case 'approval_required': {
      const pendingAction = event.pendingAction;

      writeSse(res, {
        type: 'approval_required',
        requestId: event.requestId,
        taskId: event.taskId,
        requiresConfirmation: true,
        requiresApproval: true,
        pendingToolDetails: pendingAction
          ? {
              toolName: pendingAction.toolName,
              params: pendingAction.params,
              reason: pendingAction.reason,
            }
          : undefined,
        pendingAction,
        content:
          event.content ||
          'This action requires your confirmation before it can be executed.',
        timestamp: event.timestamp,
      });
      return;
    }

    case 'verification': {
      writeSse(res, {
        type: 'verification',
        requestId: event.requestId,
        taskId: event.taskId,
        verification: event.verification,
        timestamp: event.timestamp,
      });
      return;
    }

    case 'complete': {
      writeSse(res, {
        type: 'status',
        status: 'completed',
        requestId: event.requestId,
        taskId: event.taskId,
        agent: event.agent,
        intent: event.intent,
        verification: event.verification,
        metadata: event.metadata,
        timestamp: event.timestamp,
      });
      return;
    }

    case 'error': {
      writeSse(res, {
        type: 'error',
        error: event.error || event.content || 'Tradara AI encountered an error.',
        requestId: event.requestId,
        taskId: event.taskId,
        status: 'failed',
        timestamp: event.timestamp,
      });
      return;
    }

    default: {
      writeSse(res, {
        type: 'agent_event',
        requestId: event.requestId,
        taskId: event.taskId,
        event,
        timestamp: event.timestamp,
      });
    }
  }
}
