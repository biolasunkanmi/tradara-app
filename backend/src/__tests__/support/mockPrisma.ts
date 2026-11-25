type Row = Record<string, unknown>;

const tasks = new Map<string, Row>();
const steps = new Map<string, Row>();
const executions = new Map<string, Row>();
const approvals = new Map<string, Row>();
const events: Row[] = [];

function row(value: Row): Row {
  return { ...value };
}

function taskKey(where: Row): string {
  return String(where.taskId);
}

function stepKey(where: Row): string {
  const compound = where.taskId_stepId as Row;
  return `${compound.taskId}:${compound.stepId}`;
}

function executionKey(where: Row): string {
  const compound = where.taskId_requestId_callId_attempt as Row;
  return `${compound.taskId}:${compound.requestId}:${compound.callId}:${compound.attempt}`;
}

const agentTask = {
  findUnique: jest.fn(async ({ where }: { where: Row }) => {
    const result = tasks.get(taskKey(where));
    return result ? row(result) : null;
  }),
  create: jest.fn(async ({ data }: { data: Row }) => {
    const result = {
      id: `task-row-${String(data.taskId)}`,
      createdAt: new Date(),
      updatedAt: new Date(),
      version: 0,
      ...data,
    };
    tasks.set(String(data.taskId), result);
    return row(result);
  }),
  update: jest.fn(async ({ where, data }: { where: Row; data: Row }) => {
    const key = taskKey(where);
    const current = tasks.get(key);
    if (!current) throw new Error('Task not found.');
    const result = { ...current, ...data, updatedAt: new Date() };
    tasks.set(key, result);
    return row(result);
  }),
  updateMany: jest.fn(async ({ where, data }: { where: Row; data: Row }) => {
    const current = tasks.get(taskKey(where));
    if (!current) return { count: 0 };
    if (where.leaseExpiresAt && current.leaseExpiresAt instanceof Date &&
        current.leaseExpiresAt <= (where.leaseExpiresAt as { gt: Date }).gt) {
      return { count: 0 };
    }
    if (current.userId !== where.userId) return { count: 0 };
    if (Number(current.version || 0) !== Number(where.version || 0)) return { count: 0 };
    const result = { ...current };
    for (const [key, value] of Object.entries(data)) {
      if (value && typeof value === 'object' && 'increment' in (value as Row)) {
        result[key] = Number(result[key] || 0) + Number((value as Row).increment);
      } else {
        result[key] = value;
      }
    }
    result.updatedAt = new Date();
    tasks.set(taskKey(where), result);
    return { count: 1 };
  }),
};

const agentStep = {
  findMany: jest.fn(async ({ where }: { where: Row }) =>
    [...steps.values()].filter((step) =>
      (!where.taskId || step.taskId === where.taskId) &&
      (!where.status || step.status === where.status)
    ).map(row)
  ),
  update: jest.fn(async ({ where, data }: { where: Row; data: Row }) => {
    const compound = where.taskId_stepId as Row;
    const key = `${compound.taskId}:${compound.stepId}`;
    const current = steps.get(key);
    if (!current) throw new Error('Step not found.');
    const result = { ...current, ...data, updatedAt: new Date() };
    steps.set(key, result);
    return row(result);
  }),
  upsert: jest.fn(async ({ where, create, update }: {
    where: Row;
    create: Row;
    update: Row;
  }) => {
    const key = stepKey(where);
    const result = {
      id: `step-row-${key}`,
      updatedAt: new Date(),
      ...(steps.get(key) || create),
      ...update,
    };
    steps.set(key, result);
    return row(result);
  }),
  findFirst: jest.fn(async ({ where }: { where: Row }) =>
    [...steps.values()].find((step) =>
      step.taskId === where.taskId &&
      step.stepId === where.stepId &&
      (
        step.status === 'queued' ||
        (step.leaseExpiresAt instanceof Date &&
          step.leaseExpiresAt < new Date())
      )
    ) ? row([...steps.values()].find((step) =>
      step.taskId === where.taskId &&
      step.stepId === where.stepId
    ) as Row) : null
  ),
  updateMany: jest.fn(async ({ where, data }: { where: Row; data: Row }) => {
    const current = [...steps.values()].find((step) =>
      (!where.id || step.id === where.id) &&
      (!where.taskId || step.taskId === where.taskId) &&
      (!where.stepId || step.stepId === where.stepId) &&
      (!where.leaseOwner || step.leaseOwner === where.leaseOwner) &&
      (!where.status || step.status === where.status)
    );
    if (!current) return { count: 0 };
    if (where.leaseExpiresAt && current.leaseExpiresAt instanceof Date &&
        current.leaseExpiresAt <= (where.leaseExpiresAt as { gt: Date }).gt) {
      return { count: 0 };
    }
    if (where.status === 'executing' && current.leaseExpiresAt instanceof Date &&
        where.leaseExpiresAt && current.leaseExpiresAt <= (where.leaseExpiresAt as { gt: Date }).gt) {
      return { count: 0 };
    }
    const result = { ...current };
    for (const [key, value] of Object.entries(data)) {
      if (value && typeof value === 'object' && 'increment' in (value as Row)) {
        result[key] = Number(result[key] || 0) + Number((value as Row).increment);
      } else {
        result[key] = value;
      }
    }
    result.updatedAt = new Date();
    steps.set(`${String(current.taskId)}:${String(current.stepId)}`, result);
    return { count: 1 };
  }),
};

const agentExecution = {
  upsert: jest.fn(async ({ where, create, update }: {
    where: Row;
    create: Row;
    update: Row;
  }) => {
    const key = executionKey(where);
    const result = {
      id: `execution-row-${key}`,
      ...(executions.get(key) || create),
      ...update,
    };
    executions.set(key, result);
    return row(result);
  }),
  update: jest.fn(async ({ where, data }: { where: Row; data: Row }) => {
    const key = executionKey(where);
    const current = executions.get(key);
    if (!current) throw new Error('Execution not found.');
    const result = { ...current, ...data };
    executions.set(key, result);
    return row(result);
  }),
  updateMany: jest.fn(async ({ where, data }: { where: Row; data: Row }) => {
    const current = [...executions.values()].find((entry) =>
      entry.taskId === where.taskId &&
      entry.requestId === where.requestId &&
      entry.callId === where.callId &&
      Number(entry.attempt || 0) === Number(where.attempt || 0) &&
      (!where.reservationOwner || entry.reservationOwner === where.reservationOwner)
    );
    if (!current) return { count: 0 };
    if (where.OR) {
      const leaseExpired =
        current.reservationOwner == null ||
        (current.leaseExpiresAt instanceof Date && current.leaseExpiresAt < new Date());
      if (!leaseExpired) return { count: 0 };
    }
    const result = { ...current, ...data };
    executions.set(
      `${String(current.taskId)}:${String(current.requestId)}:${String(current.callId)}:${Number(current.attempt || 0)}`,
      result
    );
    return { count: 1 };
  }),
  findMany: jest.fn(async ({ where }: { where: Row }) =>
    [...executions.values()]
      .filter((entry) => entry.taskId === where.taskId)
      .map(row)
  ),
};

const agentApproval = {
  count: jest.fn(async ({ where }: { where: Row }) =>
    [...approvals.values()].filter((approval) =>
      (!where.taskId || approval.taskId === where.taskId) &&
      (!where.userId || approval.userId === where.userId) &&
      approval.consumedAt === null
    ).length
  ),
  create: jest.fn(async ({ data }: { data: Row }) => {
    const result = {
      id: `approval-row-${String(data.tokenHash)}`,
      createdAt: new Date(),
      consumedAt: null,
      ...data,
    };
    approvals.set(String(data.tokenHash), result);
    return row(result);
  }),
  findUnique: jest.fn(async ({ where }: { where: Row }) => {
    const result = approvals.get(String(where.tokenHash));
    return result ? row(result) : null;
  }),
  update: jest.fn(async ({ where, data }: { where: Row; data: Row }) => {
    const key = String(where.tokenHash);
    const current = approvals.get(key);
    if (!current) throw new Error('Approval not found.');
    const result = { ...current, ...data };
    approvals.set(key, result);
    return row(result);
  }),
  updateMany: jest.fn(async ({ where, data }: { where: Row; data: Row }) => {
    const current = [...approvals.values()].find((approval) =>
      approval.id === where.id &&
      approval.consumedAt === null &&
      approval.expiresAt instanceof Date &&
      where.expiresAt instanceof Object &&
      where.expiresAt !== null &&
      approval.expiresAt > (where.expiresAt as { gt: Date }).gt
    );
    if (!current) return { count: 0 };
    const key = String(current.tokenHash);
    approvals.set(key, { ...current, ...data });
    return { count: 1 };
  }),
};

const agentEvent = {
  createMany: jest.fn(async ({ data }: { data: Row[] }) => {
    const createdAt = new Date();
    events.push(...data.map((entry) => ({
      id: `event-row-${events.length}`,
      createdAt,
      ...entry,
    })));
    return { count: data.length };
  }),
  findFirst: jest.fn(async ({ where, orderBy }: { where: Row; orderBy?: unknown }) =>
    [...events]
      .filter((entry) => entry.taskId === where.taskId)
      .sort((a, b) => Number(b.sequence || 0) - Number(a.sequence || 0))[0]
      ? row([...events]
          .filter((entry) => entry.taskId === where.taskId)
          .sort((a, b) => Number(b.sequence || 0) - Number(a.sequence || 0))[0])
      : null
  ),
  findMany: jest.fn(async ({ where }: { where: Row }) =>
    events
      .filter((entry) => entry.taskId === where.taskId)
      .filter((entry) =>
        !where.sequence ||
        Number(entry.sequence || 0) >
          Number((where.sequence as { gt: number }).gt)
      )
      .sort((a, b) => Number(a.sequence || 0) - Number(b.sequence || 0))
      .map(row)
  ),
};

const prisma = {
  agentTask,
  agentStep,
  agentExecution,
  agentApproval,
  agentEvent,
};

export function resetAgentPrisma(): void {
  tasks.clear();
  steps.clear();
  executions.clear();
  approvals.clear();
  events.length = 0;
  for (const model of Object.values(prisma)) {
    for (const method of Object.values(model)) {
      if (typeof method === 'function' && 'mockClear' in method) {
        method.mockClear();
      }
    }
  }
}

export { prisma };
export default prisma;
