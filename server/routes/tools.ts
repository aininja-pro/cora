import { Router } from 'express';
import { validateArgs, runTool, ToolName, ToolContext } from '../ai/tools';
import { verifyToolJWT } from '../lib/auth';

const router = Router();

/**
 * POST /api/tools/execute
 * Secure tool execution endpoint for WebRTC clients
 */
router.post('/execute', async (req, res) => {
  try {
    // Verify JWT token
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    
    if (!token) {
      return res.status(401).json({
        ok: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authorization token required',
          retryable: false
        }
      });
    }

    let decoded;
    try {
      decoded = verifyToolJWT(token);
    } catch (error) {
      return res.status(401).json({
        ok: false,
        error: {
          code: 'INVALID_TOKEN',
          message: 'Invalid or expired token',
          retryable: false
        }
      });
    }

    const { call_id, name, args } = req.body || {};
    
    if (!call_id || !name) {
      return res.status(400).json({
        ok: false,
        error: {
          code: 'BAD_REQUEST',
          message: 'call_id and name are required',
          retryable: false
        }
      });
    }

    // Validate arguments with Ajv
    const validation = validateArgs(name as ToolName, args || {});
    if (!validation.ok) {
      return res.json(validation);
    }

    // Create tool context
    const context: ToolContext = {
      tenantId: decoded.tenantId
    };

    // Execute the tool
    const result = await runTool(name as ToolName, validation.data, context);
    
    console.log(`🔧 Executed tool ${name} for tenant ${decoded.tenantId}`);
    
    return res.json(result);

  } catch (error) {
    console.error('❌ Error executing tool:', error);
    return res.status(500).json({
      ok: false,
      error: {
        code: 'SERVER_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
        retryable: false
      }
    });
  }
});

export default router;