import { createHash } from 'crypto';

jest.mock('../lib/prisma', () => require('./support/mockPrisma'));

import prisma from '../lib/prisma';
import {
  approvalPolicy,
  consumeApproval,
  issueApproval,
} from '../ai/agent/approvalStore';
import { resetAgentPrisma } from './support/mockPrisma';

describe('approval lifecycle policy', () => {
  afterEach(() => resetAgentPrisma());

  it('expires approvals after the configured TTL', async () => {
    const token = await issueApproval({
      userId: 'user-1',
      sessionId: 'session-1',
      toolName: 'delete_item',
      params: { itemId: 'item-1' },
    });

    await prisma.agentApproval.update({
      where: {
        tokenHash: createHash('sha256').update(token).digest('hex'),
      },
      data: { expiresAt: new Date(Date.now() - approvalPolicy.ttlMs - 1) },
    });

    await expect(
      consumeApproval({
        token,
        userId: 'user-1',
        sessionId: 'session-1',
        toolName: 'delete_item',
        params: { itemId: 'item-1' },
      })
    ).resolves.toMatchObject({ valid: false });
  });

  it('binds approvals to user, session, tool, and exact arguments, then consumes once', async () => {
    const token = await issueApproval({
      userId: 'user-1',
      sessionId: 'session-1',
      toolName: 'delete_item',
      params: { itemId: 'item-1', options: { force: true, reason: 'duplicate' } },
    });

    await expect(
      consumeApproval({
        token,
        userId: 'user-2',
        sessionId: 'session-1',
        toolName: 'delete_item',
        params: { itemId: 'item-1', options: { force: true, reason: 'duplicate' } },
      })
    ).resolves.toMatchObject({ valid: false });
    await expect(
      consumeApproval({
        token,
        userId: 'user-1',
        sessionId: 'session-2',
        toolName: 'delete_item',
        params: { itemId: 'item-1', options: { force: true, reason: 'duplicate' } },
      })
    ).resolves.toMatchObject({ valid: false });
    await expect(
      consumeApproval({
        token,
        userId: 'user-1',
        sessionId: 'session-1',
        toolName: 'update_item',
        params: { itemId: 'item-1', options: { force: true, reason: 'duplicate' } },
      })
    ).resolves.toMatchObject({ valid: false });
    await expect(
      consumeApproval({
        token,
        userId: 'user-1',
        sessionId: 'session-1',
        toolName: 'delete_item',
        params: { itemId: 'item-1', options: { force: false, reason: 'duplicate' } },
      })
    ).resolves.toMatchObject({ valid: false });

    await expect(
      consumeApproval({
        token,
        userId: 'user-1',
        sessionId: 'session-1',
        toolName: 'delete_item',
        params: { options: { reason: 'duplicate', force: true }, itemId: 'item-1' },
      })
    ).resolves.toMatchObject({ valid: true });
    await expect(
      consumeApproval({
        token,
        userId: 'user-1',
        sessionId: 'session-1',
        toolName: 'delete_item',
        params: { itemId: 'item-1', options: { force: true, reason: 'duplicate' } },
      })
    ).resolves.toMatchObject({ valid: false });
  });
});
