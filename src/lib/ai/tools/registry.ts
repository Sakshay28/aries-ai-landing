// ═══════════════════════════════════════════════════════════
// 🧠 AI Tool Calling Registry
// ═══════════════════════════════════════════════════════════
// Central registry for all AI tools/functions. Decouples Gemini's
// tool calls from their execution implementations.
// ═══════════════════════════════════════════════════════════

import { LocationSendContext } from '@/lib/location/service';

export interface ToolContext {
  tenantId: string;
  phone: string;
  conversationId: string;
  accessToken: string;
  phoneNumberId: string;
  senderId?: string | null;
  flowId?: string | null;
  campaignId?: string | null;
}

export interface AITool {
  execute(ctx: ToolContext, args: Record<string, any>): Promise<{ success: boolean; error?: string }>;
}

class AIToolRegistry {
  private registry: Map<string, AITool> = new Map();

  /**
   * Register a tool executor.
   */
  public register(name: string, tool: AITool): void {
    this.registry.set(name, tool);
    console.log(`[tool-registry] Registered tool: "${name}"`);
  }

  /**
   * Execute a tool by name.
   */
  public async execute(
    name: string,
    ctx: ToolContext,
    args: Record<string, any>
  ): Promise<{ success: boolean; error?: string }> {
    console.log(`[tool-registry] Executing tool "${name}" with args:`, JSON.stringify(args));
    
    const tool = this.registry.get(name);
    if (!tool) {
      const errorMsg = `Tool "${name}" is not registered or supported.`;
      console.warn(`[tool-registry] ${errorMsg}`);
      return { success: false, error: errorMsg };
    }

    try {
      const start = Date.now();
      const result = await tool.execute(ctx, args);
      console.log(`[tool-registry] Tool "${name}" finished in ${Date.now() - start}ms (success: ${result.success})`);
      return result;
    } catch (err: any) {
      const errorMsg = err.message || `Failed to execute tool "${name}"`;
      console.error(`[tool-registry] Exception in tool "${name}":`, errorMsg);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Check if a tool is registered.
   */
  public has(name: string): boolean {
    return this.registry.has(name);
  }
}

// Export singleton instance
export const ToolRegistry = new AIToolRegistry();

// Import and register core tools
import { SendLocationTool } from './sendLocation';
ToolRegistry.register('send_location', new SendLocationTool());

