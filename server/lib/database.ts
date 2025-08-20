/**
 * Supabase database integration for CORA
 * Handles calls, call_turns, tool_calls, and call_summaries persistence
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';

interface Call {
  id?: string;
  tenant_id: string;
  twilio_sid: string;
  started_at: string;
  ended_at?: string;
  outcome?: string;
  caller_number: string;
  agent_number: string;
  cost_audio_tokens?: number;
  cost_text_tokens?: number;
}

interface CallTurn {
  id?: string;
  call_id: string;
  ts: string;
  role: 'user' | 'assistant' | 'tool';
  text: string;
  audio_ms?: number;
  event_type: string;
  raw: any;
}

interface ToolCall {
  id?: string;
  call_id: string;
  name: string;
  args: any;
  result: any;
  duration_ms: number;
  success: boolean;
}

interface CallSummary {
  call_id: string;
  summary_json: any;
  score_lead_quality?: number;
  next_actions?: string[];
  properties_mentioned?: string[];
}

export class DatabaseService {
  private supabase: SupabaseClient;
  
  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_KEY!
    );
  }
  
  /**
   * Create new call record
   */
  async createCall(callData: Omit<Call, 'id'>): Promise<string> {
    try {
      const { data, error } = await this.supabase
        .from('calls')
        .insert([callData])
        .select('id')
        .single();
      
      if (error) throw error;
      
      console.log(`📝 Created call record: ${data.id}`);
      return data.id;
      
    } catch (error) {
      console.error('❌ Error creating call:', error);
      throw error;
    }
  }
  
  /**
   * Update call record (for end time, outcome, costs)
   */
  async updateCall(callId: string, updates: Partial<Call>): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('calls')
        .update(updates)
        .eq('id', callId);
      
      if (error) throw error;
      
      console.log(`📝 Updated call ${callId}`);
      
    } catch (error) {
      console.error(`❌ Error updating call ${callId}:`, error);
    }
  }
  
  /**
   * Add turn to call transcript
   */
  async addCallTurn(turnData: Omit<CallTurn, 'id'>): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('call_turns')
        .insert([turnData]);
      
      if (error) throw error;
      
      console.log(`💬 Added ${turnData.role} turn to call ${turnData.call_id}`);
      
    } catch (error) {
      console.error('❌ Error adding call turn:', error);
    }
  }
  
  /**
   * Log tool call execution
   */
  async logToolCall(toolData: Omit<ToolCall, 'id'>): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('tool_calls')
        .insert([toolData]);
      
      if (error) throw error;
      
      console.log(`🔧 Logged tool call: ${toolData.name} for call ${toolData.call_id}`);
      
    } catch (error) {
      console.error('❌ Error logging tool call:', error);
    }
  }
  
  /**
   * Save call summary
   */
  async saveCallSummary(summaryData: CallSummary): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('call_summaries')
        .upsert([summaryData], {
          onConflict: 'call_id'
        });
      
      if (error) throw error;
      
      console.log(`📊 Saved summary for call ${summaryData.call_id}`);
      
    } catch (error) {
      console.error('❌ Error saving call summary:', error);
    }
  }
  
  /**
   * Get call by Twilio SID
   */
  async getCallByTwilioSid(twilioSid: string): Promise<Call | null> {
    try {
      const { data, error } = await this.supabase
        .from('calls')
        .select('*')
        .eq('twilio_sid', twilioSid)
        .single();
      
      if (error) {
        if (error.code === 'PGRST116') return null; // No rows returned
        throw error;
      }
      
      return data;
      
    } catch (error) {
      console.error('❌ Error getting call by Twilio SID:', error);
      return null;
    }
  }
  
  /**
   * Generate end-of-call summary using GPT-4
   */
  async generateCallSummary(callId: string): Promise<any> {
    try {
      // Get all call turns
      const { data: turns, error } = await this.supabase
        .from('call_turns')
        .select('*')
        .eq('call_id', callId)
        .order('ts', { ascending: true });
      
      if (error) throw error;
      
      // Get tool calls
      const { data: toolCalls } = await this.supabase
        .from('tool_calls')
        .select('*')
        .eq('call_id', callId);
      
      if (!turns || turns.length === 0) {
        console.warn(`⚠️ No turns found for call ${callId}`);
        return null;
      }
      
      // Build conversation context
      const conversation = turns
        .filter(turn => turn.role !== 'tool')
        .map(turn => `${turn.role}: ${turn.text}`)
        .join('\n');
      
      const tools = (toolCalls || [])
        .map(tool => `Tool: ${tool.name}(${JSON.stringify(tool.args)}) -> ${tool.success ? 'Success' : 'Failed'}`)
        .join('\n');
      
      // TODO: Use OpenAI to generate structured summary
      // For now, return mock summary
      const mockSummary = {
        outcome: this.inferOutcome(toolCalls || []),
        lead_intent: this.inferIntent(conversation),
        key_facts: this.extractKeyFacts(conversation),
        properties_mentioned: this.extractProperties(conversation),
        next_actions: this.generateNextActions(toolCalls || []),
        confidence: 0.85
      };
      
      return mockSummary;
      
    } catch (error) {
      console.error('❌ Error generating call summary:', error);
      return null;
    }
  }
  
  // Helper methods for mock summary generation
  private inferOutcome(toolCalls: ToolCall[]): string {
    if (toolCalls.some(t => t.name === 'book_showing' && t.success)) return 'book_showing';
    if (toolCalls.some(t => t.name === 'qualify_lead')) return 'qualify_lead';
    if (toolCalls.some(t => t.name === 'request_callback')) return 'request_callback';
    if (toolCalls.some(t => t.name === 'transfer_to_human')) return 'transfer';
    if (toolCalls.some(t => t.name === 'search_properties')) return 'shortlist';
    return 'other';
  }
  
  private inferIntent(conversation: string): string {
    const lower = conversation.toLowerCase();
    if (lower.includes('buy') || lower.includes('purchase')) return 'buy';
    if (lower.includes('sell') || lower.includes('listing')) return 'sell';
    return 'unknown';
  }
  
  private extractKeyFacts(conversation: string): string[] {
    const facts = [];
    const lower = conversation.toLowerCase();
    
    if (lower.includes('first time')) facts.push('First-time buyer');
    if (lower.includes('budget') || lower.includes('afford')) facts.push('Discussed budget');
    if (lower.includes('preapproved') || lower.includes('pre-approved')) facts.push('Pre-approved');
    if (lower.includes('timeline') || lower.includes('when')) facts.push('Timeline mentioned');
    
    return facts;
  }
  
  private extractProperties(conversation: string): string[] {
    const properties = [];
    const addressPattern = /\d+\s+[A-Za-z\s]+(Street|St|Avenue|Ave|Lane|Ln|Drive|Dr|Road|Rd)/gi;
    const matches = conversation.match(addressPattern);
    
    if (matches) {
      properties.push(...matches);
    }
    
    return [...new Set(properties)]; // Remove duplicates
  }
  
  private generateNextActions(toolCalls: ToolCall[]): string[] {
    const actions = [];
    
    if (toolCalls.some(t => t.name === 'book_showing' && t.success)) {
      actions.push('Confirm showing appointment');
      actions.push('Send property details');
    }
    
    if (toolCalls.some(t => t.name === 'qualify_lead')) {
      actions.push('Follow up on financing');
      actions.push('Send property recommendations');
    }
    
    if (toolCalls.some(t => t.name === 'request_callback')) {
      actions.push('Schedule callback within 30 minutes');
    }
    
    if (actions.length === 0) {
      actions.push('Follow up within 24 hours');
    }
    
    return actions;
  }
}

// Export singleton instance
export const db = new DatabaseService();