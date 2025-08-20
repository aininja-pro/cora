import { Router } from 'express';
import { getTenantByToNumber, renderGreeting } from '../lib/tenancy';
import { SYSTEM_PROMPT } from '../ai/systemPrompt';
import { createEphemeralSession } from '../ai/realtime';
import { signToolJWT } from '../lib/auth';

const router = Router();

/**
 * GET /session
 * Creates ephemeral OpenAI Realtime session for WebRTC demo
 */
router.get('/', async (req, res) => {
  try {
    // For web demo, use default tenant (could be customized with query params)
    const toNumber = req.query.to as string || "+1234567890"; // Default for demo
    const tenant = getTenantByToNumber(toNumber);
    const greeting = renderGreeting(tenant);
    
    // Build system prompt with dynamic greeting
    const instructions = SYSTEM_PROMPT(tenant.brandName, tenant.agentDisplayName) + `
Start with this exact greeting, then wait for the caller:
"${greeting}"
`;
    
    // Create ephemeral session with OpenAI
    const session = await createEphemeralSession(instructions, tenant.voice);
    
    // Create short-lived tool token (5 minutes)
    const toolToken = signToolJWT({
      tenantId: tenant.agentDisplayName,
      exp: Date.now() + 5 * 60 * 1000
    });
    
    console.log(`🎯 Created session for ${tenant.agentDisplayName} (${tenant.brandName})`);
    console.log(`📝 Greeting: "${greeting}"`);
    
    res.json({
      success: true,
      session: session,
      toolToken: toolToken,
      tenant: {
        agentName: tenant.agentDisplayName,
        brandName: tenant.brandName
      }
    });
    
  } catch (error) {
    console.error('❌ Failed to create session:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;