import { AgentResponse } from '../../ai/agent/types';

export function buildLegacyResponse(
  result: AgentResponse
): Record<string, any> {
  const pendingToolDetails = result.pendingAction
    ? {
        toolName: result.pendingAction.toolName,
        params: result.pendingAction.params,
        reason: result.pendingAction.reason,
        approvalToken: result.pendingAction.approvalToken,
      }
    : undefined;

  const toolExecutions =
    result.toolResults?.map((tool) => ({
      toolName: tool.name,
      name: tool.name,
      status: tool.success ? 'completed' : 'failed',
      result: tool.result,
      error: tool.error,
      durationMs: tool.durationMs,
    })) || [];

  return {
    success: result.success,
    requestId: result.requestId,
    taskId: result.taskId,
    response: result.content,
    message: result.content,
    reply: result.content,
    content: result.content,
    agent: result.agent,
    intent: result.intent,
    status: result.status,
    plan: result.plan,
    toolCalls: result.toolCalls,
    toolResults: result.toolResults,
    toolExecutions,
    verification: result.verification,
    requiresConfirmation: Boolean(result.requiresApproval),
    requiresApproval: Boolean(result.requiresApproval),
    pendingToolDetails,
    pendingAction: result.pendingAction,
    metadata: result.metadata,
    error: result.error,
  };
}
