import { Prisma } from '@prisma/client';

import prisma from '../../lib/prisma';
import {
  AgentPlan,
  AgentTaskState,
} from './types';

type StoredTask = {
  taskId: string;
  requestId: string;
  conversationId: string | null;
  userId: string | null;
  originalRequest: string;
  plan: Prisma.JsonValue;
  completedStepIds: string[];
  pendingStepIds: string[];
  failedStepIds: string[];
  status: string;
  approvalState: string;
  finalOutcome: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function clonePlan(plan: AgentPlan): AgentPlan {
  return JSON.parse(JSON.stringify(plan)) as AgentPlan;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isAgentPlan(value: unknown): value is AgentPlan {
  if (!isRecord(value) || !Array.isArray(value.steps)) return false;
  return (
    typeof value.goal === 'string' &&
    typeof value.intent === 'string' &&
    typeof value.agent === 'string' &&
    value.steps.every(
      (step) =>
        isRecord(step) &&
        typeof step.id === 'string' &&
        typeof step.description === 'string' &&
        typeof step.status === 'string'
    )
  );
}

function normalizeApprovalState(
  value: string
): AgentTaskState['approvalState'] {
  if (
    value === 'not_required' ||
    value === 'pending' ||
    value === 'approved' ||
    value === 'consumed'
  ) {
    return value;
  }
  throw new Error('Stored agent task has an invalid approval state.');
}

function assertOwner(state: StoredTask, userId?: string): void {
  if (state.userId !== (userId || null)) {
    throw new Error('Task does not belong to the authenticated user.');
  }
}

function toTaskState(state: StoredTask): AgentTaskState {
  if (!isAgentPlan(state.plan)) {
    throw new Error('Stored agent task has an invalid plan.');
  }

  return {
    taskId: state.taskId,
    requestId: state.requestId,
    conversationId: state.conversationId || undefined,
    userId: state.userId || undefined,
    originalRequest: state.originalRequest,
    plan: clonePlan(state.plan),
    completedStepIds: [...state.completedStepIds],
    pendingStepIds: [...state.pendingStepIds],
    failedStepIds: [...state.failedStepIds],
    status: state.status as AgentTaskState['status'],
    approvalState: normalizeApprovalState(state.approvalState),
    finalOutcome: state.finalOutcome || undefined,
    createdAt: state.createdAt.toISOString(),
    updatedAt: state.updatedAt.toISOString(),
  };
}

function toJson(value: unknown): Prisma.InputJsonValue {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new Error('Agent task data could not be serialized.');
  }
  return JSON.parse(serialized) as Prisma.InputJsonValue;
}

async function persistPlanSteps(
  taskId: string,
  plan: AgentPlan
): Promise<void> {
  for (const step of plan.steps) {
    await prisma.agentStep.upsert({
      where: {
        taskId_stepId: {
          taskId,
          stepId: step.id,
        },
      },
      create: {
        taskId,
        stepId: step.id,
        description: step.description,
        status: step.status,
        data: toJson(step),
      },
      update: {
        description: step.description,
        status: step.status,
        data: toJson(step),
      },
    });
  }
}

export async function createTaskState(input: {
  taskId: string;
  requestId?: string;
  conversationId?: string;
  userId?: string;
  originalRequest: string;
  plan: AgentPlan;
}): Promise<AgentTaskState> {
  const existing = await prisma.agentTask.findUnique({
    where: { taskId: input.taskId },
  });
  if (existing) {
    assertOwner(existing, input.userId);
  }

  const plan = clonePlan(input.plan);
  const completedStepIds = plan.steps
    .filter((step) => step.status === 'completed')
    .map((step) => step.id);
  const pendingStepIds = plan.steps
    .filter((step) => step.status !== 'completed')
    .map((step) => step.id);
  const data = {
    requestId: input.requestId || '',
    conversationId: input.conversationId || null,
    userId: input.userId || null,
    originalRequest: input.originalRequest,
    plan: toJson(plan),
    completedStepIds,
    pendingStepIds,
    failedStepIds: [],
    status: 'planning' as const,
    approvalState: 'not_required' as const,
    finalOutcome: null,
  };

  const state = existing
    ? await prisma.agentTask.update({
        where: { taskId: input.taskId },
        data,
      })
    : await prisma.agentTask.create({
        data: {
          taskId: input.taskId,
          ...data,
        },
      });

  await persistPlanSteps(input.taskId, plan);
  return toTaskState(state);
}

export async function updateTaskState(
  taskId: string,
  userId: string | undefined,
  update: Partial<Omit<AgentTaskState, 'taskId' | 'userId' | 'plan'>> & {
    plan?: AgentPlan;
  }
): Promise<AgentTaskState> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const current = await prisma.agentTask.findUnique({ where: { taskId } });
    if (!current) throw new Error('Task state was not found.');
    assertOwner(current, userId);

    const data: Prisma.AgentTaskUpdateInput = {
      version: { increment: 1 },
    };
    if (update.requestId !== undefined) data.requestId = update.requestId;
    if (update.conversationId !== undefined) {
      data.conversationId = update.conversationId || null;
    }
    if (update.originalRequest !== undefined) data.originalRequest = update.originalRequest;
    if (update.plan !== undefined) data.plan = toJson(clonePlan(update.plan));
    if (update.completedStepIds !== undefined) data.completedStepIds = update.completedStepIds;
    if (update.pendingStepIds !== undefined) data.pendingStepIds = update.pendingStepIds;
    if (update.failedStepIds !== undefined) data.failedStepIds = update.failedStepIds;
    if (update.status !== undefined) data.status = update.status;
    if (update.approvalState !== undefined) data.approvalState = update.approvalState;
    if (update.finalOutcome !== undefined) data.finalOutcome = update.finalOutcome || null;

    const changed = await prisma.agentTask.updateMany({
      where: { taskId, userId: current.userId, version: current.version || 0 },
      data,
    });
    if (changed.count === 1) {
      const state = await prisma.agentTask.findUnique({ where: { taskId } });
      if (!state) throw new Error('Task state was not found after update.');
      if (update.plan) await persistPlanSteps(taskId, update.plan);
      return toTaskState(state);
    }
  }
  throw new Error('Agent task changed concurrently; retry the operation.');
}

export async function getTaskState(
  taskId: string,
  userId?: string
): Promise<AgentTaskState | undefined> {
  const state = await prisma.agentTask.findUnique({
    where: { taskId },
  });
  if (!state) return undefined;
  assertOwner(state, userId);
  return toTaskState(state);
}

export async function claimAgentStep(input: {
  taskId: string;
  stepId: string;
  ownerId: string;
  leaseMs: number;
}): Promise<boolean> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + input.leaseMs);
  const step = await prisma.agentStep.findFirst({
    where: {
      taskId: input.taskId,
      stepId: input.stepId,
      OR: [
        { status: 'queued' },
        { leaseExpiresAt: { lt: now } },
      ],
    },
  });
  if (!step) return false;

  const claimed = await prisma.agentStep.updateMany({
    where: {
      id: step.id,
      OR: [
        { status: 'queued' },
        { leaseExpiresAt: { lt: now } },
      ],
    },
    data: {
      status: 'executing',
      leaseOwner: input.ownerId,
      leaseExpiresAt: expiresAt,
      claimedAt: now,
      heartbeatAt: now,
      attempt: { increment: 1 },
    },
  });
  return claimed.count === 1;
}

export async function renewAgentStepLease(input: {
  taskId: string;
  stepId: string;
  ownerId: string;
  leaseMs: number;
}): Promise<boolean> {
  const now = new Date();
  const renewed = await prisma.agentStep.updateMany({
    where: {
      taskId: input.taskId,
      stepId: input.stepId,
      status: 'executing',
      leaseOwner: input.ownerId,
      leaseExpiresAt: { gt: now },
    },
    data: {
      leaseExpiresAt: new Date(now.getTime() + input.leaseMs),
      heartbeatAt: now,
    },
  });
  return renewed.count === 1;
}

export async function releaseAgentStep(input: {
  taskId: string;
  stepId: string;
  ownerId: string;
  status: 'completed' | 'failed' | 'queued';
}): Promise<boolean> {
  const now = new Date();
  const released = await prisma.agentStep.updateMany({
    where: {
      taskId: input.taskId,
      stepId: input.stepId,
      leaseOwner: input.ownerId,
      leaseExpiresAt: { gt: now },
    },
    data: {
      status: input.status,
      leaseOwner: null,
      leaseExpiresAt: null,
      heartbeatAt: new Date(),
    },
  });
  return released.count === 1;
}
