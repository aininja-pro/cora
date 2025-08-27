/**
 * Python Backend API Client for Voice Server
 * Handles call lifecycle and tool execution via HTTP
 */

export interface CreateCallRequest {
  tenant_id: string;
  caller_number: string;
  agent_number: string;
  twilio_sid: string;
}

export interface CreateCallResponse {
  call_id: string;
  jwt_token: string;
  tenant: {
    id: string;
    name: string;
    agent_display_name: string;
    brand_name: string;
  };
  agent: {
    id: string;
    name: string;
  };
}

export interface CallEvent {
  type: "turn" | "tool_call" | "tool_result" | "status" | "summary";
  ts: string; // ISO timestamp
  role?: "user" | "assistant";
  text?: string;
  ms?: number;
  tool_name?: string;
  tool_args?: any;
  tool_result?: any;
  meta?: any;
  outcome?: string;
  next_actions?: string[];
}

export interface ToolExecuteRequest {
  call_id: string;
  tenant_id: string;
  tool: "search_properties" | "book_showing" | "qualify_lead" | "request_callback" | "transfer_to_human";
  args: any;
}

export interface ToolEnvelope {
  ok: boolean;
  data?: any;
  error?: {
    code: "VALIDATION_FAILED" | "NOT_FOUND" | "TOOL_FAILED" | "TIMEOUT";
    message: string;
    retryable: boolean;
  };
}

export class BackendClient {
  private baseUrl: string;
  private jwtToken?: string;
  private callId?: string;
  private tenantId?: string;

  constructor(baseUrl: string = process.env.BACKEND_URL || 'http://localhost:8000') {
    this.baseUrl = baseUrl;
  }

  /**
   * Create call record and get JWT token
   */
  async createCall(request: CreateCallRequest): Promise<CreateCallResponse> {
    const response = await fetch(`${this.baseUrl}/api/calls`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`Failed to create call: ${response.status} ${response.statusText}`);
    }

    const result = await response.json() as CreateCallResponse;
    
    // Store auth context for subsequent requests
    this.jwtToken = result.jwt_token;
    this.callId = result.call_id;
    this.tenantId = result.tenant.id;
    
    console.log(`🔐 Backend auth established: call=${this.callId}, tenant=${this.tenantId}`);
    
    return result;
  }

  /**
   * Add event to call timeline
   */
  async addCallEvent(event: CallEvent): Promise<void> {
    if (!this.jwtToken || !this.callId) {
      throw new Error('Must create call first');
    }

    const response = await fetch(`${this.baseUrl}/api/calls/${this.callId}/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.jwtToken}`,
      },
      body: JSON.stringify(event),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`❌ Failed to add call event: ${response.status} - ${error}`);
      // Don't crash on event failures - just log and continue
      return;
    }

    console.log(`📝 Added ${event.type} event to call timeline`);
  }

  /**
   * Execute business tool via Python backend
   */
  async executeTool(tool: string, args: any): Promise<ToolEnvelope> {
    if (!this.jwtToken || !this.callId || !this.tenantId) {
      throw new Error('Must create call first');
    }

    const request: ToolExecuteRequest = {
      call_id: this.callId,
      tenant_id: this.tenantId,
      tool: tool as any,
      args,
    };

    console.log(`🔧 Executing tool ${tool} via backend...`);

    const response = await fetch(`${this.baseUrl}/api/tools/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.jwtToken}`,
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`❌ Tool execution failed: ${response.status} - ${error}`);
      return {
        ok: false,
        error: {
          code: "TOOL_FAILED",
          message: `Backend error: ${response.status}`,
          retryable: false
        }
      };
    }

    const result = await response.json() as ToolEnvelope;
    console.log(`✅ Tool ${tool} executed successfully`);
    
    return result;
  }

  /**
   * Send turn event (user or assistant speech)
   */
  async addTurn(role: "user" | "assistant", text: string, ms?: number): Promise<void> {
    await this.addCallEvent({
      type: "turn",
      ts: new Date().toISOString(),
      role,
      text,
      ms,
    });
  }

  /**
   * Send tool call event
   */
  async addToolCall(toolName: string, args: any): Promise<void> {
    await this.addCallEvent({
      type: "tool_call",
      ts: new Date().toISOString(),
      tool_name: toolName,
      tool_args: args,
    });
  }

  /**
   * Send tool result event
   */
  async addToolResult(toolName: string, result: any): Promise<void> {
    await this.addCallEvent({
      type: "tool_result", 
      ts: new Date().toISOString(),
      tool_name: toolName,
      tool_result: result,
    });
  }

  /**
   * Send status event
   */
  async addStatus(name: string, meta?: any): Promise<void> {
    await this.addCallEvent({
      type: "status",
      ts: new Date().toISOString(),
      meta: { name, ...meta },
    });
  }

  /**
   * Send call summary
   */
  async addSummary(outcome: string, text: string, nextActions: string[]): Promise<void> {
    await this.addCallEvent({
      type: "summary",
      ts: new Date().toISOString(),
      outcome,
      text,
      next_actions: nextActions,
    });
  }
}