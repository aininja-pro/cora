// ai/realtimeHandlers.ts
import { validateArgs, runTool, ToolName, ToolContext, ToolResult } from "./tools";
import { triggerShowingConfirm } from "./triggers";

/**
 * Minimal Realtime tool-call coordinator.
 * Wire `handleRealtimeEvent` to your Realtime WS `.onmessage` and pass a `send` fn that
 * does: ws.send(JSON.stringify(payload))
 */

type RealtimeEvent =
  | { type: "response.function_call_arguments.delta"; call_id: string; name?: ToolName; delta: string }
  | { type: "response.function_call_arguments.done"; call_id: string; name: ToolName; arguments: string }
  | { type: string; [k: string]: any }; // allow other events to pass through

type SendFn = (payload: any) => void;

type Accum = { name?: ToolName; chunks: string[] };
const calls = new Map<string, Accum>(); // call_id -> accumulating arg chunks

export async function handleRealtimeEvent(
  ev: RealtimeEvent,
  send: SendFn,
  ctx: ToolContext,
  session?: any // CallSession from mediaBridge
) {
  if (ev.type === "response.function_call_arguments.delta") {
    const a = calls.get(ev.call_id) ?? { name: undefined, chunks: [] };
    if (ev.name) a.name = ev.name;
    a.chunks.push(ev.delta || "");
    calls.set(ev.call_id, a);
    return; // wait for .done
  }

  if (ev.type === "response.function_call_arguments.done") {
    // 1) finalize args
    const a = calls.get(ev.call_id) ?? { name: ev.name, chunks: [] };
    if (!a.name) a.name = ev.name;
    const raw = a.chunks.join("") || ev.arguments || "{}";
    calls.delete(ev.call_id);

    // 2) parse JSON safely
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const payload = {
        ok: false,
        error: { code: "INVALID_JSON", message: "Could not parse tool arguments JSON.", retryable: true },
      } as ToolResult;
      return sendFunctionResult(send, ev.call_id, payload);
    }

    // 3) validate args with Ajv
    const v = validateArgs(a.name as ToolName, parsed);
    if (!v.ok) {
      return sendFunctionResult(send, ev.call_id, v);
    }

    // 4) run tool
    const result = await runTool(a.name as ToolName, v.data, ctx);

    // 4.5) trigger SMS notifications for successful tool executions
    if (result.ok && a.name === 'book_showing' && session) {
      console.log(`📱 Triggering showing confirmation SMS after successful booking`);
      await triggerShowingConfirm(session, result.data);
    }

    // 5) send function_call_output back + ask model to continue
    return sendFunctionResult(send, ev.call_id, result);
  }

  // ignore other events
}

/** Helper: send tool output + resume the model */
function sendFunctionResult(send: SendFn, call_id: string, payload: ToolResult) {
  // Feed the result back into the conversation
  send({
    type: "conversation.item.create",
    item: {
      type: "function_call_output",
      call_id,
      output: JSON.stringify(payload),
    },
  });

  // Nudge the model to continue (speak/decide next step)
  send({ type: "response.create" });
}