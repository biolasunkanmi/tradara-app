import {
  AgentContext,
  AgentToolDefinition,
} from '../ai/agent/types';
import {
  executeAgentTool,
  registerAgentTool,
  refreshMarketplaceTools,
} from '../ai/agent/toolRegistry';
import {
  toolRegistry as marketplaceToolRegistry,
} from '../ai/tools/ToolRegistry';
import { ToolDefinition } from '../ai/tools/types';

jest.mock('../lib/prisma', () => require('./support/mockPrisma'));
jest.mock('../services/aiSalesService', () => ({
  AiSalesService: {
    processMessage: jest.fn(),
  },
}));

const { executeAgent } = require('../ai/agent/agentOrchestrator') as {
  executeAgent: typeof import('../ai/agent/agentOrchestrator').executeAgent;
};
const {
  AiSalesService,
} = require('../services/aiSalesService') as {
  AiSalesService: {
    processMessage: jest.Mock;
  };
};
const { resetAgentPrisma } = require('./support/mockPrisma') as {
  resetAgentPrisma: () => void;
};

const context: AgentContext = {
  conversationId: 'tool-test-session',
  user: {
    userId: 'user-1',
    role: 'BUYER',
  },
  metadata: {},
};

function registerTestTool(
  definition: Partial<AgentToolDefinition> &
    Pick<AgentToolDefinition, 'name' | 'execute'>
): void {
  registerAgentTool({
    description: 'Dynamic tool execution test tool',
    riskLevel: 'low',
    parameters: {
      type: 'object',
      properties: {},
    },
    ...definition,
  });
}

describe('dynamic tool execution pipeline', () => {
  beforeEach(() => {
    resetAgentPrisma();
    AiSalesService.processMessage.mockReset();
  });

  it('executes a valid model-selected tool and feeds its result into follow-up reasoning', async () => {
    const execute = jest.fn().mockResolvedValue({
      value: 'lookup-result',
    });
    const toolName = 'test_lookup_tool';

    registerTestTool({
      name: toolName,
      execute,
    });

    AiSalesService.processMessage
      .mockResolvedValueOnce({
        toolCalls: [
          {
            id: 'model-call-1',
            name: toolName,
            arguments: {},
          },
        ],
        content: '',
      })
      .mockResolvedValueOnce({
        content: 'The lookup completed.',
        toolCalls: [],
      });

    const result = await executeAgent(
      {
        message: 'Please perform a lookup',
        stream: false,
      },
      context,
      {
        enablePlanning: false,
        enableVerification: false,
        executeActions: true,
      }
    );

    expect(execute).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        conversationId: 'tool-test-session',
      })
    );
    expect(result.toolResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: toolName,
          success: true,
          result: expect.objectContaining({
            result: { value: 'lookup-result' },
          }),
        }),
      ])
    );
    expect(result.content).toBe('The lookup completed.');
    expect(AiSalesService.processMessage).toHaveBeenCalledTimes(2);
    expect(
      AiSalesService.processMessage.mock.calls[1][0].toolResults
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: toolName,
          success: true,
        }),
      ])
    );
  });

  it('rejects unknown tools without invoking a handler or reporting success', async () => {
    AiSalesService.processMessage
      .mockResolvedValueOnce({
        toolCalls: [
          {
            id: 'unknown-call',
            name: 'tool_that_does_not_exist',
            arguments: {},
          },
        ],
        content: '',
      })
    const result = await executeAgent(
      {
        message: 'Use an unknown tool',
      },
      context,
      {
        enablePlanning: false,
        enableVerification: false,
      }
    );

    expect(result.toolResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'tool_that_does_not_exist',
          success: false,
          error: "Tool 'tool_that_does_not_exist' is not registered.",
        }),
      ])
    );
    expect(result.content).toBe(
      'Tradara AI could not produce a final response for this request.'
    );
  });

  it('rejects invalid arguments before calling the registered handler', async () => {
    const execute = jest.fn().mockResolvedValue({
      value: 'should-not-run',
    });
    const toolName = 'test_required_argument_tool';

    registerTestTool({
      name: toolName,
      execute,
      parameters: {
        type: 'object',
        properties: {
          itemId: {
            type: 'string',
            required: true,
          },
        },
        required: ['itemId'],
      },
    });

    const result = await executeAgentTool(
      toolName,
      {},
      context,
      { executeActions: true }
    );

    expect(execute).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(result.error).toBe(
      'Missing required parameter "itemId".'
    );
    expect(result.metadata).toMatchObject({
      phase: 'argument-validation',
    });
  });

  it('does not execute approval-required tools before explicit approval', async () => {
    const execute = jest.fn().mockResolvedValue({
      deleted: true,
    });
    const toolName = 'test_delete_tool';

    registerTestTool({
      name: toolName,
      execute,
      riskLevel: 'critical',
      parameters: {
        type: 'object',
        properties: {
          itemId: { type: 'string' },
        },
        required: ['itemId'],
      },
    });

    AiSalesService.processMessage.mockResolvedValueOnce({
      toolCalls: [
        {
          id: 'approval-call',
          name: toolName,
          arguments: { itemId: 'item-1' },
        },
      ],
      content: '',
    });

    const result = await executeAgent(
      {
        message: 'Delete the item',
      },
      context,
      {
        enablePlanning: false,
        enableVerification: false,
        executeActions: true,
      }
    );

    expect(result.status).toBe('waiting_approval');
    expect(result.toolResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: toolName,
          success: false,
          error:
            'This action requires explicit user approval before execution.',
        }),
      ])
    );
    expect(execute).not.toHaveBeenCalled();
  });

  it('executes a critical tool when the approved action is supplied', async () => {
    const execute = jest.fn().mockResolvedValue({
      deleted: true,
    });
    const toolName = 'test_approved_delete_tool';

    registerTestTool({
      name: toolName,
      execute,
      riskLevel: 'critical',
      parameters: {
        type: 'object',
        properties: {
          itemId: { type: 'string' },
        },
        required: ['itemId'],
      },
    });

    const result = await executeAgentTool(
      toolName,
      { itemId: 'item-1' },
      context,
      { executeActions: true, approved: true }
    );

    expect(execute).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
  });

  it('enforces role authorization through the real ToolRegistry contract before the handler runs', async () => {
    const execute = jest.fn().mockResolvedValue({
      success: true,
      data: { updated: true },
      riskLevel: 'EXECUTE',
    });
    const toolName = 'test_seller_only_action';

    marketplaceToolRegistry.registerTool({
      name: toolName,
      description: 'Seller-only test action',
      riskLevel: 'EXECUTE',
      allowedRoles: ['SELLER'],
      parameters: {
        type: 'object',
        properties: {
          itemId: {
            type: 'string',
            description: 'Item identifier',
          },
        },
        required: ['itemId'],
      },
      handler: async (params) => {
        execute(params, { userId: 'seller-1', role: 'SELLER', permissions: [] });
        return {
          success: true,
          data: { updated: true },
          riskLevel: 'EXECUTE',
        };
      },
      execute: async (params, _context) => {
        execute(params, _context);
        return { updated: true };
      },
    });
    refreshMarketplaceTools();

    const unauthorizedResult = await marketplaceToolRegistry.executeTool(
      toolName,
      { itemId: 'item-1' },
      {
        userId: 'buyer-1',
        role: 'BUYER',
        permissions: [],
      },
      true
    );

    expect(unauthorizedResult.success).toBe(false);
    expect(unauthorizedResult.error).toContain(
      'Role \'BUYER\' does not have permission to execute tool'
    );
    expect(execute).not.toHaveBeenCalled();

    const authorizedResult = await marketplaceToolRegistry.executeTool(
      toolName,
      { itemId: 'item-1' },
      {
        userId: 'seller-1',
        role: 'SELLER',
        permissions: [],
      },
      true
    );

    expect(authorizedResult.success).toBe(true);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('resumes only a matching approved action and blocks mismatched tool or arguments', async () => {
    const execute = jest.fn().mockResolvedValue({
      updated: true,
    });
    const toolName = 'test_resume_action';

    registerTestTool({
      name: toolName,
      execute,
      riskLevel: 'critical',
      parameters: {
        type: 'object',
        properties: {
          itemId: { type: 'string' },
        },
        required: ['itemId'],
      },
    });

    const initialModelCall = {
      toolCalls: [
        {
          id: 'resume-call',
          name: toolName,
          arguments: { itemId: 'item-1' },
        },
      ],
      content: '',
    };

    AiSalesService.processMessage
      .mockImplementationOnce(async () => initialModelCall)
      .mockImplementationOnce(async () => ({
        content: 'Action completed.',
        toolCalls: [],
      }));

    const mismatchedTool = await executeAgent(
      {
        message: 'Delete the item',
        approvedAction: {
          toolName: 'different_action',
          params: { itemId: 'item-1' },
        },
      },
      context,
      {
        enablePlanning: false,
        enableVerification: false,
        executeActions: true,
      }
    );

    expect(mismatchedTool.status).toBe('waiting_approval');
    expect(execute).not.toHaveBeenCalled();

    AiSalesService.processMessage.mockReset();
    AiSalesService.processMessage
      .mockImplementationOnce(async () => initialModelCall)
      .mockImplementationOnce(async () => ({
        content: 'Action completed.',
        toolCalls: [],
      }));

    const mismatchedArguments = await executeAgent(
      {
        message: 'Delete the item',
        approvedAction: {
          toolName,
          params: { itemId: 'different-item' },
          approvalToken:
            mismatchedTool.pendingAction?.approvalToken,
        },
      },
      context,
      {
        enablePlanning: false,
        enableVerification: false,
        executeActions: true,
      }
    );

    expect(mismatchedArguments.status).toBe('waiting_approval');
    expect(execute).not.toHaveBeenCalled();

    AiSalesService.processMessage.mockReset();
    AiSalesService.processMessage
      .mockImplementationOnce(async () => initialModelCall)
      .mockImplementationOnce(async () => ({
        content: 'Action completed.',
        toolCalls: [],
      }));

    const matchingApproval = await executeAgent(
      {
        message: 'Delete the item',
        conversationId: 'tool-test-session',
        approvedAction: {
          toolName,
          params: { itemId: 'item-1' },
          approvalToken:
            mismatchedTool.pendingAction?.approvalToken,
        },
      },
      context,
      {
        enablePlanning: false,
        enableVerification: false,
        executeActions: true,
      }
    );

    expect(execute).toHaveBeenCalledTimes(1);
    expect(matchingApproval.toolResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: toolName,
          success: true,
        }),
      ])
    );
  });

  it('normalizes a structured handler failure instead of reporting success', async () => {
    const toolName = 'test_failing_handler_tool';

    registerTestTool({
      name: toolName,
      execute: jest.fn().mockResolvedValue({
        success: false,
        error: 'controlled tool failure',
      }),
    });

    const result = await executeAgentTool(
      toolName,
      {},
      context,
      { executeActions: true }
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('controlled tool failure');
    expect(result.result).toEqual({
      success: false,
      error: 'controlled tool failure',
    });
  });

  it('converts tool exceptions and timeouts into controlled failures', async () => {
    const throwingTool = 'test_throwing_tool';
    const timeoutTool = 'test_timeout_tool';

    registerTestTool({
      name: throwingTool,
      execute: jest.fn().mockRejectedValue(
        new Error('handler exploded')
      ),
    });
    registerTestTool({
      name: timeoutTool,
      timeoutMs: 5,
      execute: jest.fn(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve({ late: true }), 50);
          })
      ),
    });

    const thrownResult = await executeAgentTool(
      throwingTool,
      {},
      context,
      { executeActions: true }
    );
    const timeoutResult = await executeAgentTool(
      timeoutTool,
      {},
      context,
      { executeActions: true }
    );

    expect(thrownResult).toMatchObject({
      success: false,
      error: 'handler exploded',
    });
    expect(timeoutResult).toMatchObject({
      success: false,
      error: 'Tool "test_timeout_tool" timed out after 5ms.',
    });
  });
});
