import { Prisma } from '@prisma/client';

import prisma from '../../lib/prisma';
import {
  AgentEvent,
  AgentToolCall,
  AgentToolResult,
} from './types';

function toJson(value: unknown): Prisma.InputJsonValue {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new Error('Agent persistence data could not be serialized.');
  }
  return JSON.parse(serialized) as Prisma.InputJsonValue;
}

export async function appendAgentEvents(
  taskId: string,
  events: AgentEvent[]
): Promise<void> {
  if (events.length === 0) return;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const latest = await prisma.agentEvent.findFirst({
      where: { taskId },
      orderBy: [{ sequence: 'desc' }, { createdAt: 'desc' }],
    });
    const startingSequence = Number(latest?.sequence || 0);

    try {
      await prisma.agentEvent.createMany({
        data: events.map((event, index) => {
          const sequence = startingSequence + index + 1;
          const payload = JSON.parse(
            JSON.stringify(
              { ...event, taskId, sequence },
              (key, value) =>
                key === 'approvalToken' ? undefined : value
            )
          ) as Prisma.InputJsonValue;
          return {
            taskId,
            requestId: event.requestId,
            sequence,
            eventType: event.type,
            payload,
          };
        }),
      });
      return;
    } catch (error: unknown) {
      if (attempt === 4) throw error;
    }
  }
}

export async function listAgentEvents(taskId: string, afterSequence = 0) {
  return prisma.agentEvent.findMany({
    where: {
      taskId,
      sequence: { gt: afterSequence },
    },
    orderBy: [{ sequence: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
  });
}

export async function startAgentExecution(input: {
  taskId: string;
  requestId: string;
  userId?: string;
  toolCall: AgentToolCall;
  startedAt: Date;
  attempt?: number;
}): Promise<void> {
  const attempt = input.attempt || 0;
  await prisma.agentExecution.upsert({
    where: {
      taskId_requestId_callId_attempt: {
        taskId: input.taskId,
        requestId: input.requestId,
        callId: input.toolCall.id,
        attempt,
      },
    },
    create: {
      taskId: input.taskId,
      requestId: input.requestId,
      userId: input.userId || null,
      callId: input.toolCall.id,
      attempt,
      toolName: input.toolCall.name,
      input: toJson(input.toolCall.args),
      status: 'running',
      outcomeState: 'reserved',
      uncertainReason: null,
      startedAt: input.startedAt,
      metadata: toJson(input.toolCall.metadata || {}),
    },
    update: {
      requestId: input.requestId,
      status: 'running',
      outcomeState: 'reserved',
      startedAt: input.startedAt,
      completedAt: null,
      durationMs: null,
      error: null,
      metadata: toJson(input.toolCall.metadata || {}),
    },
  });
}

export async function completeAgentExecution(input: {
  taskId: string;
  requestId: string;
  callId: string;
  attempt?: number;
  result: AgentToolResult;
  status?: 'completed' | 'failed' | 'waiting_approval';
}): Promise<void> {
  const attempt = input.attempt || 0;
  const data: Prisma.AgentExecutionUpdateInput = {
    status:
      input.status ||
      (input.result.success ? 'completed' : 'failed'),
    error: input.result.error || null,
    completedAt: new Date(),
    durationMs: input.result.durationMs ?? null,
  };

  if (input.result.result !== undefined) {
    data.result = toJson(input.result.result);
  }

  await prisma.agentExecution.update({
    where: {
      taskId_requestId_callId_attempt: {
        taskId: input.taskId,
        requestId: input.requestId,
        callId: input.callId,
        attempt,
      },
    },
    data,
  });
}

export async function listAgentExecutions(taskId: string) {
  return prisma.agentExecution.findMany({
    where: { taskId },
    orderBy: [{ startedAt: 'asc' }, { id: 'asc' }],
  });
}

export async function reserveAgentExecution(input: {
  taskId: string;
  requestId: string;
  callId: string;
  attempt?: number;
  ownerId: string;
  leaseMs: number;
}): Promise<boolean> {
  const now = new Date();
  const changed = await prisma.agentExecution.updateMany({
    where: {
      taskId: input.taskId,
      requestId: input.requestId,
      callId: input.callId,
      attempt: input.attempt || 0,
      OR: [
        { reservationOwner: null },
        { leaseExpiresAt: { lt: now } },
      ],
    },
    data: {
      reservationOwner: input.ownerId,
      leaseExpiresAt: new Date(now.getTime() + input.leaseMs),
      outcomeState: 'reserved',
    },
  });
  return changed.count === 1;
}

export async function markAgentExecutionUncertain(input: {
  taskId: string;
  requestId: string;
  callId: string;
  attempt?: number;
  reason: string;
  ownerId: string;
}): Promise<void> {
  await prisma.agentExecution.updateMany({
    where: {
      taskId: input.taskId,
      requestId: input.requestId,
      callId: input.callId,
      attempt: input.attempt || 0,
      reservationOwner: input.ownerId,
    },
    data: {
      status: 'uncertain',
      outcomeState: 'uncertain',
      uncertainReason: input.reason,
      completedAt: new Date(),
    },
  });
}
