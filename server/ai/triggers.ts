/**
 * SMS Notification Triggers
 * Handles automated SMS sending after key voice events
 */
import { CallSession } from '../ws/mediaBridge';

interface SMSPayload {
  [key: string]: any;
}

interface SMSRequest {
  template: string;
  to: string;
  payload: SMSPayload;
  idempotency_key?: string;
}

/**
 * Send SMS notification after call summary is generated
 */
export async function triggerAgentSummary(
  session: any, // CallSession type from mediaBridge
  summary: string,
  outcome: string,
  nextActions: string[]
): Promise<void> {
  if (!session.backendClient || !session.dbCallId) {
    console.log(`⚠️ Cannot send agent summary SMS: missing backend client or call ID`);
    return;
  }

  try {
    // Get agent contact info from session or use tenant default
    const agentPhone = session.tenant?.agent_phone || session.tenant?.default_notification_number;
    if (!agentPhone) {
      console.log(`⚠️ No agent phone number found for call ${session.dbCallId}`);
      return;
    }

    // Truncate summary to fit SMS (280 chars max)
    const truncatedSummary = summary.length > 280 
      ? summary.substring(0, 277) + "..." 
      : summary;

    const smsRequest: SMSRequest = {
      template: "agent_summary",
      to: agentPhone,
      payload: {
        call_id: session.dbCallId,
        summary: truncatedSummary,
        actions_link: `/calls/${session.dbCallId}`,
        caller_number: session.callerNumber,
        outcome: outcome
      },
      idempotency_key: `call_${session.dbCallId}_summary_1`
    };

    console.log(`📱 Triggering agent summary SMS for call ${session.dbCallId}...`);
    
    const result = await session.backendClient.sendSMS(smsRequest);
    
    if (result.ok) {
      console.log(`✅ Agent summary SMS sent successfully: ${result.notification_id}`);
    } else {
      console.error(`❌ Agent summary SMS failed: ${result.error}`);
    }

  } catch (error) {
    console.error(`❌ Error sending agent summary SMS:`, error);
  }
}

/**
 * Send SMS notifications after successful showing booking
 */
export async function triggerShowingConfirm(
  session: any,
  toolResult: any
): Promise<void> {
  if (!session.backendClient || !session.dbCallId) {
    console.log(`⚠️ Cannot send showing SMS: missing backend client or call ID`);
    return;
  }

  try {
    const { propertyAddress, datetimeDisplay, contact, appointmentId } = toolResult;
    
    if (!contact?.phone) {
      console.log(`⚠️ No customer phone number for showing confirmation`);
      return;
    }

    // 1. Send confirmation to buyer
    const buyerSMS: SMSRequest = {
      template: "showing_confirm",
      to: contact.phone,
      payload: {
        call_id: session.dbCallId,
        name: contact.name || "there",
        address: propertyAddress,
        when: datetimeDisplay,
        confirm_link: `/appointments/${appointmentId}/confirm`
      },
      idempotency_key: `call_${session.dbCallId}_book_${appointmentId}_buyer`
    };

    console.log(`📱 Sending showing confirmation to buyer: ${contact.phone.substring(0, 8)}...`);
    
    const buyerResult = await session.backendClient.sendSMS(buyerSMS);
    
    if (buyerResult.ok) {
      console.log(`✅ Buyer confirmation SMS sent: ${buyerResult.notification_id}`);
    } else {
      console.error(`❌ Buyer confirmation SMS failed: ${buyerResult.error}`);
    }

    // 2. Send lead notification to agent
    const agentPhone = session.tenant?.agent_phone || session.tenant?.default_notification_number;
    
    if (agentPhone) {
      const agentSMS: SMSRequest = {
        template: "lead_captured",
        to: agentPhone,
        payload: {
          call_id: session.dbCallId,
          name: contact.name || "Unknown",
          phone: contact.phone,
          budget: toolResult.budget || "Not specified",
          city: extractCity(propertyAddress) || "Unknown",
          link: `/calls/${session.dbCallId}`,
          property_address: propertyAddress
        },
        idempotency_key: `call_${session.dbCallId}_book_${appointmentId}_agent`
      };

      console.log(`📱 Sending lead notification to agent...`);
      
      const agentResult = await session.backendClient.sendSMS(agentSMS);
      
      if (agentResult.ok) {
        console.log(`✅ Agent lead SMS sent: ${agentResult.notification_id}`);
      } else {
        console.error(`❌ Agent lead SMS failed: ${agentResult.error}`);
      }
    } else {
      console.log(`⚠️ No agent phone number found for lead notification`);
    }

  } catch (error) {
    console.error(`❌ Error sending showing confirmation SMS:`, error);
  }
}

/**
 * Extract city from property address for SMS template
 */
function extractCity(address: string): string | null {
  if (!address) return null;
  
  // Simple extraction: get text after last comma and before zip code
  const parts = address.split(',');
  if (parts.length < 2) return null;
  
  const cityPart = parts[parts.length - 2]?.trim();
  // Remove state and zip if present
  return cityPart?.split(' ')[0] || null;
}

/**
 * Generate unique idempotency key for SMS
 */
export function generateIdempotencyKey(
  callId: string, 
  eventType: 'summary' | 'booking' | 'callback',
  suffix?: string
): string {
  const timestamp = Math.floor(Date.now() / 1000); // Unix timestamp for uniqueness
  return `call_${callId}_${eventType}_${suffix || timestamp}`;
}