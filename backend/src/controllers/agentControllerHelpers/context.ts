import { Request } from 'express';

import {
  AgentContext,
  AgentRequest,
} from '../../ai/agent/types';

interface AuthenticatedUserContext {
  id?: string;
  name?: string;
  email?: string;
  role?: string;
  permissions?: string[];
  storeId?: string;
}

export function getBearerToken(
  req: Request
): string | null {
  const header = req.headers.authorization;

  if (!header) {
    return null;
  }

  if (!header.toLowerCase().startsWith('bearer ')) {
    return null;
  }

  return header.slice(7).trim() || null;
}

export function getUserId(
  req: Request
): string | undefined {
  return req.user?.id;
}

export function getAgentContext(
  req: Request
): AgentContext {
  const bodyContext = req.body?.context || {};
  const authenticatedUser =
    req.user as AuthenticatedUserContext | undefined;
  const bodyProduct = bodyContext.product;
  const bodyProject = bodyContext.project;
  const bodyUser = bodyContext.user;
  const attachments = Array.isArray(req.body?.attachments)
    ? req.body.attachments
    : Array.isArray(bodyContext.attachments)
      ? bodyContext.attachments
      : [];

  const messages = Array.isArray(bodyContext.messages)
    ? bodyContext.messages
    : Array.isArray(req.body?.history)
      ? req.body.history
          .filter(
            (item: any) =>
              item &&
              (item.role === 'user' ||
                item.role === 'model' ||
                item.role === 'assistant')
          )
          .map((item: any) => ({
            role: item.role === 'model' ? 'assistant' : item.role,
            content: Array.isArray(item.parts)
              ? item.parts.map((part: any) => part?.text || '').join('')
              : String(item.content || ''),
          }))
      : [];

  const resolvedUserId =
    authenticatedUser?.id;

  const resolvedUserName =
    bodyUser?.name ||
    authenticatedUser?.name;

  const resolvedUserEmail =
    bodyUser?.email ||
    authenticatedUser?.email;

  const resolvedUserRole =
    authenticatedUser?.role || 'GUEST';
  const resolvedPermissions =
    authenticatedUser?.permissions ||
    (resolvedUserRole === 'ADMIN' ? ['ALL'] : ['READ_ONLY']);

  return {
    ...bodyContext,
    conversationId:
      bodyContext.conversationId ||
      req.body?.conversationId ||
      req.body?.sessionId,
    taskId: bodyContext.taskId || req.body?.taskId,
    user: {
      userId: resolvedUserId,
      name: resolvedUserName,
      email: resolvedUserEmail,
      role: resolvedUserRole,
      permissions: resolvedPermissions,
      storeId: authenticatedUser?.storeId,
    },
    product: bodyProduct,
    project: bodyProject,
    messages,
    attachments,
    memory: Array.isArray(bodyContext.memory)
      ? bodyContext.memory
      : [],
    globalContext: bodyContext.globalContext || {},
    metadata: {
      ...(bodyContext.metadata || {}),
      authenticated: Boolean(authenticatedUser?.id),
      hasBearerToken: Boolean(getBearerToken(req)),
      source: 'tradara-agent-gateway',
    },
  };
}

export function buildAgentRequest(
  req: Request,
  context: AgentContext,
  message: string
): AgentRequest {
  const body = req.body || {};

  return {
    message,
    conversationId:
      body.conversationId ||
      body.threadId ||
      body.sessionId,
    sessionId: body.sessionId,
    taskId: body.taskId,
    itemId:
      body.itemId ||
      body.product?.id ||
      context.product?.itemId,
    buyerSession:
      body.buyerSession ||
      body.conversationId ||
      context.conversationId,
    userId: getUserId(req),
    agent: body.agent,
    intent: body.intent,
    context,
    attachments: context.attachments,
    stream: body.stream !== false,
    executeActions: body.executeActions === true,
    approvedAction: body.approvedAction,
    metadata: {
      ...(body.metadata || {}),
      threadId: body.threadId,
      sessionId: body.sessionId,
      confirmation: body.userConfirmationConfirmed === true,
      pendingTool: body.pendingTool,
      frontend: 'TradaraAISidebar',
    },
  };
}
