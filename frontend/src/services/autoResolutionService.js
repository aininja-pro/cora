// Auto-Resolution Service for CORA Dashboard
class AutoResolutionService {
  constructor() {
    this.processedCalls = new Set() // Track calls we've already processed
  }

  // Main auto-resolution function - called after AI summary is persisted
  async processCallForAutoResolution(call) {
    if (!call || !call.id || !call.ai_response) return

    // Prevent duplicate processing using idempotency key
    const idempotencyKey = `auto_${call.id}`
    if (this.processedCalls.has(idempotencyKey)) {
      console.log(`Call ${call.id} already processed for auto-resolution`)
      return
    }

    this.processedCalls.add(idempotencyKey)
    
    try {
      const autoActions = []

      // 1. Auto-send inspection recap when summary marks no critical issues
      if (this.shouldAutoSendInspectionRecap(call)) {
        const success = await this.sendInspectionRecap(call)
        if (success) {
          autoActions.push({
            type: 'inspection_recap',
            message: 'Inspection recap auto-sent to client',
            timestamp: new Date().toISOString()
          })
        }
      }

      // 2. Auto-send buyer call recap after call end (unless opted-out)
      if (this.shouldAutoSendBuyerRecap(call)) {
        const success = await this.sendBuyerRecap(call)
        if (success) {
          autoActions.push({
            type: 'buyer_recap',
            message: 'Call recap auto-sent to buyer',
            timestamp: new Date().toISOString()
          })
        }
      }

      // 3. Auto-remind unconfirmed showing at T-24h
      if (this.shouldAutoRemindShowing(call)) {
        const success = await this.sendShowingReminder(call)
        if (success) {
          autoActions.push({
            type: 'showing_reminder',
            message: 'Showing reminder auto-sent',
            timestamp: new Date().toISOString()
          })
        }
      }

      // 4. Auto-send FYI notifications
      if (this.shouldAutoSendFYI(call)) {
        const success = await this.sendFYINotification(call)
        if (success) {
          autoActions.push({
            type: 'fyi_notification',
            message: 'FYI notification auto-sent to agent',
            timestamp: new Date().toISOString()
          })
        }
      }

      // Update call record with auto-actions taken
      if (autoActions.length > 0) {
        await this.logAutoActions(call.id, autoActions)
        
        // Show user notifications for auto-actions
        this.showAutoActionNotifications(autoActions)
      }

    } catch (error) {
      console.error(`Error in auto-resolution for call ${call.id}:`, error)
      this.processedCalls.delete(idempotencyKey) // Allow retry on next call
    }
  }

  // Check if inspection recap should be auto-sent
  shouldAutoSendInspectionRecap(call) {
    if (!call.ai_response?.inspection_completed) return false
    if (call.ai_response?.critical_issues) return false // Never auto-send if critical issues
    if (call.recap_sent) return false // Already sent
    if (this.isContactOptedOut(call.phone_number)) return false
    
    return true
  }

  // Check if buyer recap should be auto-sent
  shouldAutoSendBuyerRecap(call) {
    if (call.status !== 'completed') return false
    if (!call.transcript || call.transcript.length < 100) return false // Too short to be meaningful
    if (call.recap_sent) return false
    if (this.isContactOptedOut(call.phone_number)) return false
    
    return true
  }

  // Check if showing reminder should be auto-sent (T-24h)
  shouldAutoRemindShowing(call) {
    if (!call.ai_response?.appointment_scheduled) return false
    if (call.ai_response?.appointment_confirmed) return false // Already confirmed
    if (!call.ai_response?.appointment_time) return false

    const appointmentTime = new Date(call.ai_response.appointment_time)
    const now = new Date()
    const hoursUntilAppointment = (appointmentTime - now) / (1000 * 60 * 60)
    
    // Send reminder at T-24h (within 1 hour window to avoid spam)
    return hoursUntilAppointment <= 24 && hoursUntilAppointment >= 23
  }

  // Check if FYI notification should be auto-sent
  shouldAutoSendFYI(call) {
    if (!call.ai_response?.fyi_events) return false
    if (call.fyi_sent) return false
    
    // Auto-send for appraisal scheduled, inspection scheduled, etc.
    const autoFyiEvents = ['appraisal_scheduled', 'inspection_scheduled', 'document_received']
    return autoFyiEvents.some(event => call.ai_response.fyi_events.includes(event))
  }

  // Send inspection recap
  async sendInspectionRecap(call) {
    try {
      const response = await fetch('/api/notifications/sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: call.tenant_id || 'default',
          to: call.phone_number,
          template: 'inspection_recap',
          payload: {
            client_name: call.caller_name || 'Client',
            property_address: call.ai_response?.property_address || 'Property',
            issues_found: call.ai_response?.minor_issues || 'Minor maintenance items noted',
            next_steps: 'Review full report and discuss any questions'
          },
          idempotency_key: `inspection_recap_${call.id}`
        })
      })

      if (response.ok) {
        await this.markRecapSent(call.id, 'inspection_recap')
        return true
      }
    } catch (error) {
      console.error('Error sending inspection recap:', error)
    }
    return false
  }

  // Send buyer call recap
  async sendBuyerRecap(call) {
    try {
      // Generate summary from AI response or transcript
      const summary = this.generateCallSummary(call)
      
      const response = await fetch('/api/notifications/sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: call.tenant_id || 'default',
          to: call.phone_number,
          template: 'buyer_recap',
          payload: {
            client_name: call.caller_name || 'Client',
            call_summary: summary,
            next_steps: call.ai_response?.next_steps || 'We\'ll follow up with additional information',
            agent_contact: 'Reply to this message or call us anytime'
          },
          idempotency_key: `buyer_recap_${call.id}`
        })
      })

      if (response.ok) {
        await this.markRecapSent(call.id, 'buyer_recap')
        return true
      }
    } catch (error) {
      console.error('Error sending buyer recap:', error)
    }
    return false
  }

  // Send showing reminder
  async sendShowingReminder(call) {
    try {
      const response = await fetch('/api/notifications/sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: call.tenant_id || 'default',
          to: call.phone_number,
          template: 'showing_reminder',
          payload: {
            client_name: call.caller_name || 'Client',
            property_address: call.ai_response?.property_address || 'Property',
            showing_time: call.ai_response?.appointment_time || 'TBD',
            confirmation_needed: 'Please confirm or reschedule by replying to this message'
          },
          idempotency_key: `showing_reminder_${call.id}`
        })
      })

      return response.ok
    } catch (error) {
      console.error('Error sending showing reminder:', error)
    }
    return false
  }

  // Send FYI notification to agent
  async sendFYINotification(call) {
    try {
      // This would typically go to the agent, not the client
      const agentPhone = call.agent_phone || '+1234567890' // Get from tenant settings
      
      const response = await fetch('/api/notifications/sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: call.tenant_id || 'default',
          to: agentPhone,
          template: 'fyi_notification',
          payload: {
            event_type: call.ai_response?.fyi_events?.[0] || 'Update',
            client_name: call.caller_name || 'Client',
            details: call.ai_response?.fyi_details || 'See call transcript for details'
          },
          idempotency_key: `fyi_${call.id}`
        })
      })

      if (response.ok) {
        await this.markFYISent(call.id)
        return true
      }
    } catch (error) {
      console.error('Error sending FYI notification:', error)
    }
    return false
  }

  // Helper functions
  isContactOptedOut(phoneNumber) {
    // TODO: Check opted-out contacts database
    return false
  }

  generateCallSummary(call) {
    if (call.ai_response?.summary) {
      return call.ai_response.summary
    }
    
    // Fallback: truncate transcript
    if (call.transcript) {
      return call.transcript.length > 160 
        ? call.transcript.substring(0, 157) + '...'
        : call.transcript
    }
    
    return 'We discussed your real estate needs and next steps.'
  }

  async markRecapSent(callId, recapType) {
    try {
      await fetch(`/api/calls/${callId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          [`${recapType}_sent`]: true,
          recap_sent: true,
          updated_at: new Date().toISOString()
        })
      })
    } catch (error) {
      console.error('Error marking recap as sent:', error)
    }
  }

  async markFYISent(callId) {
    try {
      await fetch(`/api/calls/${callId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fyi_sent: true,
          updated_at: new Date().toISOString()
        })
      })
    } catch (error) {
      console.error('Error marking FYI as sent:', error)
    }
  }

  async logAutoActions(callId, actions) {
    try {
      await fetch(`/api/calls/${callId}/auto-actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actions })
      })
    } catch (error) {
      console.error('Error logging auto actions:', error)
    }
  }

  showAutoActionNotifications(actions) {
    actions.forEach(action => {
      const notification = document.createElement('div')
      notification.className = 'fixed top-4 right-4 bg-green-500 text-white p-4 rounded-lg shadow-lg z-50 animate-slide-in'
      notification.innerHTML = `
        <div class="flex items-center gap-2">
          <span class="font-medium">Auto-sent</span>
          <button class="text-sm underline hover:no-underline">Undo</button>
        </div>
        <p class="text-sm">${action.message}</p>
      `
      
      document.body.appendChild(notification)
      
      // Auto-remove after 10 seconds
      setTimeout(() => {
        notification.remove()
      }, 10000)
    })
  }

  // Process batch of calls (called periodically)
  async processPendingCalls() {
    try {
      // Get calls with AI responses that haven't been processed for auto-resolution
      const response = await fetch('/api/calls/pending-auto-resolution')
      const data = await response.json()
      
      if (data.success && data.calls) {
        for (const call of data.calls) {
          await this.processCallForAutoResolution(call)
        }
      }
    } catch (error) {
      console.error('Error processing pending calls:', error)
    }
  }
}

export default new AutoResolutionService()