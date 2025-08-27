import type { BackendClient } from "./backendClient";

export type CallCtx = {
  callId: string;
  backendClient: BackendClient | null;
  backlog: Array<{ role: "user" | "assistant"; text: string; ts: string }>;
};

export function makeCallCtx(callId: string): CallCtx {
  return { callId, backendClient: null, backlog: [] };
}