import { Router } from 'express';
import crypto from 'crypto';
import { getTenantByToNumber } from '../lib/tenancy';

const router = Router();

/**
 * Validate Twilio webhook signature
 */
function validateTwilioSignature(signature: string, url: string, params: any): boolean {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) {
    console.warn('⚠️ TWILIO_AUTH_TOKEN not set - skipping signature validation');
    return true; // Allow for development
  }
  
  try {
    const data = Object.keys(params)
      .sort()
      .reduce((acc, key) => acc + key + params[key], url);
    
    const expectedSignature = crypto
      .createHmac('sha1', authToken)
      .update(data)
      .digest('base64');
    
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'base64'),
      Buffer.from(expectedSignature, 'base64')
    );
  } catch (error) {
    console.error('❌ Signature validation error:', error);
    return false;
  }
}

/**
 * POST /twilio/voice
 * Twilio voice webhook - returns TwiML with Stream connection
 */
router.post('/voice', (req, res) => {
  try {
    // Temporarily disable signature validation for testing
    console.log('⚠️ Signature validation disabled for debugging');
    
    // Extract call information
    const { CallSid, From, To, FromCity, FromState } = req.body;
    
    // Load tenant configuration
    const tenant = getTenantByToNumber(To);
    
    console.log(`📞 Incoming call to ${tenant.agentDisplayName}:`);
    console.log(`   Call SID: ${CallSid}`);
    console.log(`   From: ${From} (${FromCity}, ${FromState})`);
    console.log(`   To: ${To}`);
    
    // Return TwiML with WebSocket stream to ngrok (with parameters)
    const ngrokUrl = "02d298a09714.ngrok-free.app";
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="wss://${ngrokUrl}/media-stream">
      <Parameter name="callSid" value="${CallSid}"/>
      <Parameter name="from" value="${From}"/>
      <Parameter name="to" value="${To}"/>
    </Stream>
  </Connect>
</Response>`;

    res.type('text/xml');
    res.send(twiml);
    
  } catch (error) {
    console.error('❌ Twilio webhook error:', error);
    
    // Fallback TwiML - connect to human
    const fallbackTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">I'm sorry, there seems to be a technical issue. Let me connect you to someone who can help.</Say>
  <Dial timeout="30">
    <Number>+1234567890</Number>
  </Dial>
</Response>`;
    
    res.type('text/xml');
    res.send(fallbackTwiml);
  }
});

/**
 * Fallback TwiML endpoint for system failures
 */
router.all('/fallback', (req, res) => {
  console.log('🚨 Fallback endpoint triggered');
  
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">I apologize, but I'm experiencing technical difficulties. Let me transfer you to a human representative.</Say>
  <Dial timeout="30">
    <Number>+1234567890</Number>
  </Dial>
</Response>`;

  res.type('text/xml');
  res.send(twiml);
});

export default router;