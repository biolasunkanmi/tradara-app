import { createHash, randomBytes } from 'crypto';
import { Prisma } from '@prisma/client';

import prisma from '../../lib/prisma';

export type ApprovalRequest = {
  token?: string;
  userId?: string;
  sessionId?: string;
  taskId?: string;
  toolName: string;
  params: Record<string, unknown>;
  reason?: string;
};

const APPROVAL_TTL_MS = 5 * 60 * 1000;

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    return `{${keys
      .map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function serializeParams(
  params: Record<string, unknown>
): Prisma.InputJsonValue {
  return JSON.parse(stableSerialize(params)) as Prisma.InputJsonValue;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function resolvedIdentity(request: ApprovalRequest) {
  return {
    userId: request.userId || 'usr_guest_anonymous',
    sessionId: request.sessionId || 'general-agent-session',
  };
}

export async function issueApproval(
  request: Omit<ApprovalRequest, 'token'>
): Promise<string> {
  const token = randomBytes(32).toString('hex');
  const identity = resolvedIdentity(request);

  await prisma.agentApproval.create({
    data: {
      tokenHash: hashToken(token),
      taskId: request.taskId || null,
      userId: identity.userId,
      sessionId: identity.sessionId,
      toolName: request.toolName,
      params: serializeParams(request.params),
      reason:
        request.reason ||
        'This action requires explicit user approval before execution.',
      expiresAt: new Date(Date.now() + APPROVAL_TTL_MS),
      consumedAt: null,
    },
  });

  return token;
}

export async function consumeApproval(
  request: ApprovalRequest
): Promise<{ valid: boolean; reason?: string }> {
  if (!request.token) {
    return {
      valid: false,
      reason: 'A valid approval token is required.',
    };
  }

  const approval = await prisma.agentApproval.findUnique({
    where: { tokenHash: hashToken(request.token) },
  });
  if (!approval) {
    return {
      valid: false,
      reason: 'The approval is expired, invalid, or already used.',
    };
  }

  const identity = resolvedIdentity(request);
  if (
    approval.userId !== identity.userId ||
    approval.sessionId !== identity.sessionId ||
    (request.taskId !== undefined &&
      approval.taskId !== null &&
      approval.taskId !== request.taskId) ||
    approval.toolName !== request.toolName ||
    stableSerialize(approval.params) !== stableSerialize(request.params)
  ) {
    return {
      valid: false,
      reason: 'The approval does not match this user, session, tool, or arguments.',
    };
  }

  const now = new Date();
  const consumed = await prisma.agentApproval.updateMany({
    where: {
      id: approval.id,
      consumedAt: null,
      expiresAt: { gt: now },
    },
    data: { consumedAt: now },
  });

  if (consumed.count !== 1) {
    return {
      valid: false,
      reason: 'The approval is expired, invalid, or already used.',
    };
  }

  return { valid: true };
}

export const approvalPolicy = {
  ttlMs: APPROVAL_TTL_MS,
};
