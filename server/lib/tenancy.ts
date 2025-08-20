export type Tenant = {
  toNumber: string;
  agentDisplayName: string;         // e.g., "Ray Richards"
  brandName: string;                // "CORA"
  greetingTemplate: string;         // uses ${agentDisplayName}, ${brandName}
  locale?: string;                  // "en-US"
  voice?: string;                   // "verse"
};

export function getTenantByToNumber(to: string): Tenant {
  // TODO: replace with Supabase lookup
  return {
    toNumber: to,
    agentDisplayName: "Ray Richards",
    brandName: process.env.AGENT_NAME || "CORA",
    greetingTemplate:
      "You've reached the phone of ${agentDisplayName}. I'm ${brandName}, his AI assistant. How can I help you today?",
    locale: "en-US",
    voice: "verse",
  };
}

export function renderGreeting(t: Tenant): string {
  return t.greetingTemplate
    .replace("${agentDisplayName}", t.agentDisplayName)
    .replace("${brandName}", t.brandName);
}