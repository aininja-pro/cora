/**
 * Python Backend API Client for Voice Server
 * Handles call lifecycle and tool execution via HTTP
 */

export type BackendClient = {
  baseUrl: string;
  jwt: string;
  postEvent: (callId: string, evt: {type:"turn";role:"user"|"assistant";text:string;ts:string}) =>
    Promise<{ ok: boolean; status: number; body: string }>;
  execTool: (payload: any) =>
    Promise<{ ok: boolean; status: number; body: string }>;
};

export function makeBackendClient(baseUrl: string, jwt: string): BackendClient {
  async function post(path: string, body: any) {
    const r = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type":"application/json", "Authorization":`Bearer ${jwt}` },
      body: JSON.stringify(body),
    });
    const t = await r.text().catch(()=> "");
    if (!r.ok) console.error("BACKEND HTTP", r.status, t.slice(0,300));
    return { ok: r.ok, status: r.status, body: t };
  }
  return {
    baseUrl, jwt,
    postEvent: (callId, evt) => post(`/api/calls/${callId}/events`, evt),
    execTool: (payload) => post(`/api/tools/execute`, payload),
  };
}

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
   * Post event (ChatGPT transcript handler format with HTTP verification)
   */
  async postEvent(callId: string, evt: {
    type: "turn",
    role: "user" | "assistant", 
    text: string,
    ts: string
  }): Promise<{ ok: boolean, status?: number, error?: any }> {
    if (!this.jwtToken) {
      console.error("postEvent: No JWT token available");
      return { ok: false, error: "No JWT token" };
    }

    try {
      const response = await fetch(`${this.baseUrl}/api/calls/${callId}/events`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.jwtToken}`
        },
        body: JSON.stringify(evt)
      });
      
      const ok = response.ok;
      const text = await response.text().catch(() => "");
      
      if (!ok) {
        console.error("postEvent HTTP", response.status, text);
      }
      
      return { ok, status: response.status, error: ok ? undefined : text };
    } catch (error) {
      console.error("postEvent exception", error);
      return { ok: false, error: String(error) };
    }
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

  /**
   * Send SMS notification via backend
   */
  async sendSMS(request: {
    template: string;
    to: string;
    payload: Record<string, any>;
    idempotency_key?: string;
  }): Promise<{ok: boolean, notification_id?: string, status?: string, error?: string}> {
    if (!this.jwtToken || !this.tenantId) {
      console.error("sendSMS: No JWT token or tenant ID available");
      return { ok: false, error: "No authentication" };
    }

    const smsRequest = {
      tenant_id: this.tenantId,
      to: request.to,
      template: request.template,
      payload: request.payload,
      idempotency_key: request.idempotency_key,
    };

    try {
      const response = await fetch(`${this.baseUrl}/api/notifications/sms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.jwtToken}`,
        },
        body: JSON.stringify(smsRequest),
      });

      const result = await response.json();

      if (!response.ok) {
        console.error(`❌ SMS send failed: ${response.status} - ${result.detail || result.error}`);
        return { 
          ok: false, 
          error: result.detail?.message || result.error || `HTTP ${response.status}` 
        };
      }

      console.log(`📱 SMS sent successfully: template=${request.template}, id=${result.notification_id}`);
      return {
        ok: true,
        notification_id: result.notification_id,
        status: result.status,
      };
    } catch (error) {
      console.error("sendSMS exception:", error);
      return { ok: false, error: String(error) };
    }
  }
}