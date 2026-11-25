import prisma from '../../lib/prisma';
import { getTaskState } from './taskStateStore';

export type CrashRecoveryReport = {
  taskId: string;
  state: string;
  abandonedSteps: string[];
  uncertainExecutions: string[];
  pendingApprovals: number;
  disposition: 'recoverable' | 'waiting_approval' | 'uncertain';
};

export async function inspectAndPrepareRecovery(input: {
  taskId: string;
  ownerId: string;
}): Promise<CrashRecoveryReport | undefined> {
  const task = await getTaskState(input.taskId, input.ownerId);
  if (!task) return undefined;

  const now = new Date();
  const [abandonedSteps, uncertainExecutions, pendingApprovals] =
    await Promise.all([
      prisma.agentStep.findMany({
        where: {
          taskId: input.taskId,
          status: 'executing',
          OR: [
            { leaseExpiresAt: null },
            { leaseExpiresAt: { lt: now } },
          ],
        },
      }),
      prisma.agentExecution.findMany({
        where: {
          taskId: input.taskId,
          OR: [
            { outcomeState: 'uncertain' },
            { status: 'uncertain' },
          ],
        },
      }),
      prisma.agentApproval.count({
        where: {
          taskId: input.taskId,
          userId: input.ownerId,
          consumedAt: null,
          expiresAt: { gt: now },
        },
      }),
    ]);

  if (abandonedSteps.length > 0) {
    await prisma.agentStep.updateMany({
      where: {
        taskId: input.taskId,
        status: 'executing',
        OR: [
          { leaseExpiresAt: null },
          { leaseExpiresAt: { lt: now } },
        ],
      },
      data: {
        status: 'queued',
        leaseOwner: null,
        leaseExpiresAt: null,
      },
    });
  }

  const disposition =
    uncertainExecutions.length > 0
      ? 'uncertain'
      : pendingApprovals > 0
        ? 'waiting_approval'
        : 'recoverable';

  if (disposition !== 'recoverable' || task.status === 'executing') {
    await prisma.agentTask.updateMany({
      where: {
        taskId: input.taskId,
        userId: input.ownerId,
      },
      data: {
        status: disposition,
        approvalState: pendingApprovals > 0 ? 'pending' : task.approvalState,
      },
    });
  }

  return {
    taskId: input.taskId,
    state: disposition,
    abandonedSteps: abandonedSteps.map((step) => step.stepId),
    uncertainExecutions: uncertainExecutions.map((execution) => execution.callId),
    pendingApprovals,
    disposition,
  };
}
