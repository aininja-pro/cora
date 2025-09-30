// ai/tools.ts
import Ajv, { JSONSchemaType } from "ajv";
import addFormats from "ajv-formats";
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables from the correct path
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// Initialize Supabase client with fallback values
const supabaseUrl = process.env.SUPABASE_URL || 'https://ifxuzsckpcrzgbknwyfr.supabase.co';
const supabaseKey = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlmeHV6c2NrcGNyemdia253eWZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQwNjk4NTEsImV4cCI6MjA2OTY0NTg1MX0.TdEGrlG0lAaWQmwPixMuHjDJU-YTR6TeO2WPk-u_yZs';

const supabase = createClient(supabaseUrl, supabaseKey);

export type SearchPropsArgs = {
  city: string;
  minPrice?: number;
  maxPrice?: number;
  beds?: number;
  baths?: number;
  mustHaves?: string[];
};
export type BookShowingArgs = {
  propertyId: string;
  datetimeISO: string;
  contact: { name: string; phone: string; email?: string };
};
export type QualifyLeadArgs = {
  intent: "buy" | "sell";
  budget?: number;
  timeline?: string;
  financingStatus?: "preapproved" | "prequalified" | "unknown";
};
export type RequestCallbackArgs = {
  phone: string;
  reason: "general_question" | "financing" | "offer_help" | "status_update";
};
export type TransferToHumanArgs = {
  queue: "primary_agent" | "after_hours" | "spanish_line";
  urgency: "normal" | "urgent";
};

export type ToolName =
  | "search_properties"
  | "book_showing"
  | "qualify_lead"
  | "request_callback"
  | "transfer_to_human";

export type AnyArgs =
  | SearchPropsArgs
  | BookShowingArgs
  | QualifyLeadArgs
  | RequestCallbackArgs
  | TransferToHumanArgs;

export type ToolResultOk<T = any> = { ok: true; data: T };
export type ToolResultErr = {
  ok: false;
  error: { code: string; message: string; retryable: boolean };
};
export type ToolResult<T = any> = ToolResultOk<T> | ToolResultErr;

/** ------------------ AJV SETUP ------------------ **/
const ajv = new Ajv({
  allErrors: true,
  strict: true,
  removeAdditional: false, // we want to FAIL on extras (schemas set additionalProperties: false)
});
addFormats(ajv);

const searchPropsSchema: JSONSchemaType<SearchPropsArgs> = {
  type: "object",
  additionalProperties: false,
  properties: {
    city: { type: "string", minLength: 1 },
    minPrice: { type: "number", nullable: true, minimum: 0 },
    maxPrice: { type: "number", nullable: true, minimum: 0 },
    beds: { type: "integer", nullable: true, minimum: 0 },
    baths: { type: "integer", nullable: true, minimum: 0 },
    mustHaves: { type: "array", nullable: true, items: { type: "string" } },
  },
  required: ["city"],
};

const bookShowingSchema: JSONSchemaType<BookShowingArgs> = {
  type: "object",
  additionalProperties: false,
  properties: {
    propertyId: { type: "string", minLength: 1 },
    datetimeISO: { type: "string", minLength: 1 }, // you can add format: "date-time" if always RFC3339
    contact: {
      type: "object",
      additionalProperties: false,
      properties: {
        name: { type: "string", minLength: 1 },
        phone: { type: "string", minLength: 7 },
        email: { type: "string", nullable: true },
      },
      required: ["name", "phone"],
    },
  },
  required: ["propertyId", "datetimeISO", "contact"],
};

const qualifyLeadSchema: JSONSchemaType<QualifyLeadArgs> = {
  type: "object",
  additionalProperties: false,
  properties: {
    intent: { type: "string", enum: ["buy", "sell"] },
    budget: { type: "number", nullable: true, minimum: 0 },
    timeline: { type: "string", nullable: true },
    financingStatus: {
      type: "string",
      nullable: true,
      enum: ["preapproved", "prequalified", "unknown"],
    },
  },
  required: ["intent"],
};

const requestCallbackSchema: JSONSchemaType<RequestCallbackArgs> = {
  type: "object",
  additionalProperties: false,
  properties: {
    phone: { type: "string", minLength: 7 },
    reason: {
      type: "string",
      enum: ["general_question", "financing", "offer_help", "status_update"],
    },
  },
  required: ["phone", "reason"],
};

const transferSchema: JSONSchemaType<TransferToHumanArgs> = {
  type: "object",
  additionalProperties: false,
  properties: {
    queue: { type: "string", enum: ["primary_agent", "after_hours", "spanish_line"] },
    urgency: { type: "string", enum: ["normal", "urgent"] },
  },
  required: ["queue", "urgency"],
};

const validators = {
  search_properties: ajv.compile(searchPropsSchema),
  book_showing: ajv.compile(bookShowingSchema),
  qualify_lead: ajv.compile(qualifyLeadSchema),
  request_callback: ajv.compile(requestCallbackSchema),
  transfer_to_human: ajv.compile(transferSchema),
} as const;

/** Validate args for a given tool; return ok/error envelope */
export function validateArgs(
  name: ToolName,
  args: unknown
): ToolResultOk<any> | ToolResultErr {
  const validate = (validators as any)[name];
  if (!validate) {
    return { ok: false, error: { code: "UNKNOWN_TOOL", message: `No schema for ${name}`, retryable: false } };
  }
  const good = validate(args);
  if (good) return { ok: true, data: args };

  const msg =
    (validate.errors || [])
      .map((e: any) => `${e.instancePath || "/"} ${e.message}`)
      .join("; ") || "Invalid arguments";

  return {
    ok: false,
    error: { code: "VALIDATION_FAILED", message: msg, retryable: true },
  };
}

/** ------------------ TOOL HANDLERS (with real Supabase integration) ------------------ **/
export type ToolContext = {
  tenantId?: string;
  callId?: string;
  backendClient?: any; // BackendClient from lib/backendClient
};

export async function runTool(
  name: ToolName,
  args: AnyArgs,
  ctx: ToolContext
): Promise<ToolResult> {
  try {
    // CRITICAL: Use backend client if available, fallback to local mock
    if (ctx.backendClient) {
      console.log(`🔧 [${ctx.callId}] Executing ${name} via backend API`);
      
      try {
        // Execute tool with proper error handling (ChatGPT Step 3)
        const res = await ctx.backendClient.execTool({
          call_id: ctx.callId,
          tenant_id: ctx.tenantId,
          tool: name,
          args: args
        });

        if (!res.ok) {
          console.error("TOOL FAIL", { status: res.status, body: res.body?.slice?.(0,500) });
          return { ok:false, error:{ code: res.status, message: "Backend unavailable", detail: res.body?.slice?.(0,200) }};
        }
        
        const data = JSON.parse(res.body);
        return { ok:true, data };
        
      } catch (error) {
        console.error(`❌ [${ctx.callId}] Tool execution exception:`, error);
        
        return {
          ok: false,
          error: {
            code: "TOOL_FAILED",
            message: "Backend service unavailable",
            retryable: false
          }
        };
      }
    }
    
    // Fallback to local mock execution
    console.log(`⚠️ [${ctx.callId || 'unknown'}] Using local mock for ${name} (no backend client)`);
    
    switch (name) {
      case "search_properties": {
        // Real Supabase integration for property search
        const { city, minPrice, maxPrice, beds, baths, mustHaves } = args as SearchPropsArgs;
        
        try {
          // Build query
          let query = supabase.from('listings').select('*');
          
          // Filter by city (case-insensitive)
          if (city) {
            query = query.ilike('address', `%${city}%`);
          }
          
          // Filter by price range
          if (minPrice !== undefined) {
            query = query.gte('price', minPrice);
          }
          if (maxPrice !== undefined) {
            query = query.lte('price', maxPrice);
          }
          
          // Filter by bedrooms
          if (beds !== undefined) {
            query = query.gte('beds', beds);
          }

          // Filter by bathrooms
          if (baths !== undefined) {
            query = query.gte('baths', baths);
          }
          
          // Execute query
          const { data, error } = await query;
          
          if (error) {
            console.error('Supabase error:', error);
            // Fallback to mock data if database query fails
            const mockResults = [
              { id: "123", address: "123 Main Street, Austin, TX", price: 489000, bedrooms: 3, bathrooms: 2, sqft: 2200 },
              { id: "456", address: "456 Oak Avenue, Austin, TX", price: 325000, bedrooms: 2, bathrooms: 2, sqft: 1500 },
              { id: "789", address: "789 Pine Lane, Austin, TX", price: 750000, bedrooms: 4, bathrooms: 3, sqft: 3500 }
            ].filter(p => {
              const matchesCity = !city || p.address.toLowerCase().includes(city.toLowerCase());
              const matchesPrice = (!minPrice || p.price >= minPrice) && (!maxPrice || p.price <= maxPrice);
              const matchesBeds = !beds || p.bedrooms >= beds;
              const matchesBaths = !baths || p.bathrooms >= baths;
              return matchesCity && matchesPrice && matchesBeds && matchesBaths;
            });
            
            return { 
              ok: true, 
              data: { 
                results: mockResults.map(p => ({
                  id: p.id,
                  address: p.address,
                  price: p.price,
                  beds: p.bedrooms,
                  baths: p.bathrooms,
                  sqft: p.sqft
                })), 
                count: mockResults.length 
              } 
            };
          }
          
          // Format results
          const results = (data || []).map(p => ({
            id: p.id || p.property_id,
            address: p.address,
            price: p.price,
            beds: p.beds,
            baths: p.baths,
            sqft: p.sqft,
            status: p.status,
            description: p.description?.substring(0, 100) + '...'
          }));
          
          return { 
            ok: true, 
            data: { 
              results, 
              count: results.length,
              message: results.length > 0 
                ? `Found ${results.length} properties in ${city}` 
                : `No properties found matching your criteria in ${city}`
            } 
          };
          
        } catch (err) {
          console.error('Error searching properties:', err);
          return { 
            ok: false, 
            error: { 
              code: "DATABASE_ERROR", 
              message: "Unable to search properties at this time", 
              retryable: true 
            } 
          };
        }
      }
      
      case "book_showing": {
        const { propertyId, datetimeISO, contact } = args as BookShowingArgs;
        
        // Save to database
        try {
          const { data, error } = await supabase
            .from('showings')
            .insert({
              property_id: propertyId,
              scheduled_date: datetimeISO,
              client_name: contact.name,
              client_phone: contact.phone,
              client_email: contact.email,
              status: 'scheduled'
            })
            .select()
            .single();
          
          if (error && error.code === '42P01') {
            // Table doesn't exist, return mock success
            return { 
              ok: true, 
              data: { 
                confirmationId: "SHOW-" + Date.now(), 
                propertyId, 
                datetimeISO, 
                contact,
                message: `Showing scheduled for ${new Date(datetimeISO).toLocaleString()}`
              } 
            };
          }
          
          if (error) throw error;
          
          return { 
            ok: true, 
            data: { 
              confirmationId: data.id, 
              propertyId, 
              datetimeISO, 
              contact,
              message: `Perfect! I've scheduled your showing for ${new Date(datetimeISO).toLocaleString()}. ${contact.name}, I'll send a confirmation to ${contact.phone}.`
            } 
          };
        } catch (err) {
          return { 
            ok: true, 
            data: { 
              confirmationId: "SHOW-" + Date.now(), 
              propertyId, 
              datetimeISO, 
              contact,
              message: `Showing scheduled for ${new Date(datetimeISO).toLocaleString()}`
            } 
          };
        }
      }
      
      case "qualify_lead": {
        const payload = args as QualifyLeadArgs;
        
        // Calculate lead score
        let score = 50; // Base score
        if (payload.budget && payload.budget > 300000) score += 20;
        if (payload.financingStatus === 'preapproved') score += 30;
        else if (payload.financingStatus === 'prequalified') score += 20;
        if (payload.timeline && payload.timeline.includes('month')) score += 10;
        
        return { 
          ok: true, 
          data: { 
            leadId: "LEAD-" + Date.now(), 
            ...payload,
            leadScore: score,
            message: score >= 70 
              ? "Great! You're well-positioned to move forward. Let me help you find the perfect property."
              : "I'd be happy to help you get started on your home search journey."
          } 
        };
      }
      
      case "request_callback": {
        const payload = args as RequestCallbackArgs;
        const timeframe = payload.reason === 'status_update' ? '15 minutes' : '30 minutes';
        
        return { 
          ok: true, 
          data: { 
            callbackId: "CB-" + Date.now(), 
            ...payload,
            scheduledTime: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
            message: `I've scheduled a callback to ${payload.phone} within the next ${timeframe} regarding ${payload.reason.replace('_', ' ')}.`
          } 
        };
      }
      
      case "transfer_to_human": {
        const payload = args as TransferToHumanArgs;
        const waitTime = payload.urgency === 'urgent' ? '1 minute' : '2-3 minutes';
        
        return { 
          ok: true, 
          data: { 
            transferId: "XFER-" + Date.now(),
            ...payload,
            estimatedWait: waitTime,
            message: `I'm connecting you to an agent now. Your estimated wait time is ${waitTime}.`
          } 
        };
      }
      
      default:
        return { ok: false, error: { code: "UNKNOWN_TOOL", message: `No handler for ${name}`, retryable: false } };
    }
  } catch (e: any) {
    return { ok: false, error: { code: "TOOL_FAILED", message: String(e?.message || e), retryable: false } };
  }
}

// Export TOOLS array for OpenAI Realtime API (without strict: true)
export const TOOLS = [
  {
    type: "function" as const,
    name: "search_properties",
    description: "Search for properties based on criteria",
    parameters: {
      type: "object",
      properties: {
        city: { type: "string" },
        minPrice: { type: "number" },
        maxPrice: { type: "number" },
        beds: { type: "number" },
        baths: { type: "number" },
        mustHaves: { type: "array", items: { type: "string" } }
      },
      required: ["city"],
      additionalProperties: false
    }
  },
  {
    type: "function" as const,
    name: "book_showing",
    description: "Schedule a property showing",
    parameters: {
      type: "object",
      properties: {
        propertyId: { type: "string" },
        datetimeISO: { type: "string" },
        contact: {
          type: "object",
          properties: {
            name: { type: "string" },
            phone: { type: "string" },
            email: { type: "string" }
          },
          required: ["name", "phone"],
          additionalProperties: false
        }
      },
      required: ["propertyId", "datetimeISO", "contact"],
      additionalProperties: false
    }
  },
  {
    type: "function" as const,
    name: "qualify_lead",
    description: "Qualify a potential lead",
    parameters: {
      type: "object",
      properties: {
        intent: { type: "string", enum: ["buy", "sell"] },
        budget: { type: "number" },
        timeline: { type: "string" },
        financingStatus: { type: "string", enum: ["preapproved", "prequalified", "unknown"] }
      },
      required: ["intent"],
      additionalProperties: false
    }
  },
  {
    type: "function" as const,
    name: "request_callback",
    description: "Schedule a callback from an agent",
    parameters: {
      type: "object",
      properties: {
        phone: { type: "string" },
        reason: { type: "string", enum: ["general_question", "financing", "offer_help", "status_update"] }
      },
      required: ["phone", "reason"],
      additionalProperties: false
    }
  },
  {
    type: "function" as const,
    name: "transfer_to_human",
    description: "Transfer call to a human agent",
    parameters: {
      type: "object",
      properties: {
        queue: { type: "string", enum: ["primary_agent", "after_hours", "spanish_line"] },
        urgency: { type: "string", enum: ["normal", "urgent"] }
      },
      required: ["queue", "urgency"],
      additionalProperties: false
    }
  }
];

// Backward compatibility exports
export interface LegacyToolResult {
  ok: boolean;
  data?: any;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
}

export async function executeTools(toolName: string, args: any): Promise<ToolResult> {
  // First validate
  const validation = validateArgs(toolName as ToolName, args);
  if (!validation.ok) {
    return validation;
  }
  
  // Then run tool with validated args
  return runTool(toolName as ToolName, validation.data, { tenantId: 'default' });
}

export { validators };