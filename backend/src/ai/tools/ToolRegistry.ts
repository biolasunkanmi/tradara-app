// ==========================================
// FILE: backend/src/ai/tools/toolRegistry.ts
// TRADARA AI — Unified Tool Registry
// PHASE 2 — DYNAMIC TOOL EXECUTION
// ==========================================

import {
  ToolDefinition,
  RegisteredToolMap,
  SecurityContext,
  ToolExecutionResult,
} from './types';

import { productTools } from './productTools';
import { orderTools } from './orderTools';
import { analyticsTools } from './analyticsTools';
import { generalTools } from './generalTools';

export class ToolRegistry {
  private static instance: ToolRegistry;

  private tools: RegisteredToolMap = {};

  private constructor() {
    this.registerDefaultTools();
  }

  public static getInstance(): ToolRegistry {
    if (!ToolRegistry.instance) {
      ToolRegistry.instance = new ToolRegistry();
    }

    return ToolRegistry.instance;
  }

  /**
   * Register all built-in capability families.
   *
   * Existing marketplace tools remain intact.
   * General-purpose tools are added as a separate family.
   */
  private registerDefaultTools(): void {
    const defaultTools: ToolDefinition[] = [
      ...productTools,
      ...orderTools,
      ...analyticsTools,
      ...generalTools,
    ];

    for (const tool of defaultTools) {
      this.registerTool(tool);
    }
  }

  /**
   * Register or replace a tool.
   *
   * Duplicate registrations are reported to make accidental
   * name collisions easier to identify during development.
   */
  public registerTool(tool: ToolDefinition): void {
    if (!tool || typeof tool.name !== 'string' || !tool.name.trim()) {
      throw new Error(
        '[ToolRegistry] Cannot register a tool without a valid name.'
      );
    }

    if (this.tools[tool.name]) {
      console.warn(
        `[ToolRegistry] Warning: Tool '${tool.name}' is being overwritten.`
      );
    }

    this.tools[tool.name] = tool;
  }

  /**
   * Remove a registered tool.
   *
   * This supports future capability management and testing.
   */
  public unregisterTool(toolName: string): boolean {
    if (!this.tools[toolName]) {
      return false;
    }

    delete this.tools[toolName];
    return true;
  }

  /**
   * Find a registered tool by its exact name.
   */
  public getTool(toolName: string): ToolDefinition | undefined {
    return this.tools[toolName];
  }

  /**
   * Return all registered tools.
   */
  public getAllTools(): ToolDefinition[] {
    return Object.values(this.tools);
  }

  /**
   * Return tool definitions suitable for model/tool discovery.
   */
  public getAllDefinitions(): Array<{
    name: string;
    description: string;
    parameters: ToolDefinition['parameters'];
  }> {
    return Object.values(this.tools).map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    }));
  }

  /**
   * Return tools allowed for a specific role.
   *
   * Tools without an allowedRoles restriction remain available
   * according to the original registry behavior.
   */
  public getToolsForRole(role: string): ToolDefinition[] {
    return Object.values(this.tools).filter((tool) =>
      tool.allowedRoles
        ? tool.allowedRoles.includes(role as SecurityContext['role'])
        : true
    );
  }

  /**
   * Execute a tool while preserving role and approval checks.
   *
   * General-purpose tools still pass through this same execution
   * boundary; adding a tool does not bypass registry security.
   */
  public async executeTool(
    toolName: string,
    params: any,
    context: SecurityContext,
    userConfirmationConfirmed: boolean = false
  ): Promise<ToolExecutionResult> {
    const tool = this.getTool(toolName);

    if (!tool) {
      return {
        success: false,
        error: `Tool '${toolName}' is not registered in ToolRegistry.`,
        riskLevel: 'READ',
      };
    }

    if (
      tool.allowedRoles &&
      !tool.allowedRoles.includes(context.role)
    ) {
      return {
        success: false,
        error: `Access Denied: Role '${context.role}' does not have permission to execute tool '${toolName}'.`,
        riskLevel: tool.riskLevel || 'READ',
      };
    }

    if (
      tool.riskLevel === 'EXECUTE' &&
      !userConfirmationConfirmed
    ) {
      return {
        success: false,
        riskLevel: 'EXECUTE',
        requiresApproval: true,
        error: `High-risk tool '${toolName}' requires explicit human approval before execution.`,
        metadata: {
          pendingToolName: toolName,
          pendingParams: params,
        },
      };
    }

    try {
      if (typeof tool.handler === 'function') {
        return await tool.handler(params, context);
      }

      if (typeof tool.execute === 'function') {
        const data = await tool.execute(params, context);

        return {
          success: true,
          data,
          riskLevel: tool.riskLevel || 'READ',
        };
      }

      throw new Error(
        `Tool '${toolName}' is missing an execution implementation.`
      );
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : `An error occurred while executing tool '${toolName}'.`;

      return {
        success: false,
        error: message,
        riskLevel: tool.riskLevel || 'READ',
      };
    }
  }

  /**
   * Return basic registry diagnostics.
   *
   * This helps verify which capabilities are registered without
   * executing any of them.
   */
  public getDiagnostics(): {
    totalTools: number;
    marketplaceTools: string[];
    generalTools: string[];
    toolNames: string[];
  } {
    const tools = this.getAllTools();

    const generalToolNames = new Set(
      generalTools.map((tool) => tool.name)
    );

    return {
      totalTools: tools.length,

      marketplaceTools: tools
        .filter((tool) => !generalToolNames.has(tool.name))
        .map((tool) => tool.name),

      generalTools: tools
        .filter((tool) => generalToolNames.has(tool.name))
        .map((tool) => tool.name),

      toolNames: tools.map((tool) => tool.name),
    };
  }
}

export const toolRegistry = ToolRegistry.getInstance();