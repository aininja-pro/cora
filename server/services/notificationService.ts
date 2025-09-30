import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const supabaseUrl = process.env.SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

// Textbelt API configuration
const TEXTBELT_API_KEY = process.env.TEXTBELT_API_KEY || 'textbelt'
const TEXTBELT_URL = 'https://textbelt.com/text'

interface Stakeholder {
  id?: string
  transaction_id: string
  role: string
  name: string
  phone?: string
  email?: string
  notification_prefs?: any
}

interface NotificationRequest {
  transaction_id: string
  property_address?: string
  event_type: string
  details: string
  severity: 'urgent' | 'normal' | 'fyi'
  notify_roles?: string[]
  specific_message?: string
}

class NotificationService {
  // Create a new transaction
  async createTransaction(propertyAddress: string, agentId: string) {
    // Generate a UUID for the transaction
    const transactionId = crypto.randomUUID()

    const { data, error } = await supabase
      .from('transactions')
      .insert({
        id: transactionId,
        property_address: propertyAddress,
        agent_id: agentId,
        status: 'active',
        created_at: new Date().toISOString()
      })
      .select()
      .single()

    if (error) throw error
    return data
  }

  // Add stakeholder to transaction
  async addStakeholder(stakeholder: Stakeholder) {
    // Check if stakeholder already exists for this role
    const { data: existing } = await supabase
      .from('transaction_stakeholders')
      .select('*')
      .eq('transaction_id', stakeholder.transaction_id)
      .eq('role', stakeholder.role)
      .single()

    if (existing) {
      // Update existing stakeholder
      const { data, error } = await supabase
        .from('transaction_stakeholders')
        .update({
          name: stakeholder.name,
          phone: stakeholder.phone,
          email: stakeholder.email,
          notification_prefs: stakeholder.notification_prefs
        })
        .eq('id', existing.id)
        .select()
        .single()

      if (error) throw error
      return data
    } else {
      // Insert new stakeholder with generated ID
      const stakeholderId = crypto.randomUUID()
      const { data, error } = await supabase
        .from('transaction_stakeholders')
        .insert({
          id: stakeholderId,
          ...stakeholder,
          created_at: new Date().toISOString()
        })
        .select()
        .single()

      if (error) throw error
      return data
    }
  }

  // Find transaction by property address
  async findTransactionByAddress(address: string) {
    // Try exact match first
    let { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('property_address', address)
      .single()

    // If no exact match, try partial match
    if (!data) {
      const result = await supabase
        .from('transactions')
        .select('*')
        .ilike('property_address', `%${address}%`)
        .limit(1)

      data = result.data?.[0] || null
    }

    return data
  }

  // Get stakeholders for a transaction
  async getStakeholders(transactionId: string, roles?: string[]) {
    let query = supabase
      .from('transaction_stakeholders')
      .select('*')
      .eq('transaction_id', transactionId)

    if (roles && roles.length > 0) {
      query = query.in('role', roles)
    }

    const { data, error } = await query

    if (error) throw error
    return data || []
  }

  // Send notification to stakeholders
  async notifyStakeholders(request: NotificationRequest) {
    console.log('NotificationService: Processing notification request:', request)

    // Find transaction if not provided
    let transactionId = request.transaction_id
    if (!transactionId && request.property_address) {
      const transaction = await this.findTransactionByAddress(request.property_address)
      if (transaction) {
        transactionId = transaction.id
      } else {
        throw new Error(`No transaction found for address: ${request.property_address}`)
      }
    }

    // Get stakeholders to notify
    const stakeholders = await this.getStakeholders(transactionId, request.notify_roles)

    console.log(`Found ${stakeholders.length} stakeholders to notify`)

    const notifications = []

    for (const stakeholder of stakeholders) {
      const message = this.formatMessage(stakeholder, request)

      // Send based on preference (SMS for now)
      if (stakeholder.phone) {
        const result = await this.sendSMS(stakeholder.phone, message)
        notifications.push({
          recipient: stakeholder.name,
          role: stakeholder.role,
          method: 'sms',
          status: result.success ? 'sent' : 'failed',
          message
        })
      }

      // Log notification
      await this.logNotification(transactionId, request.event_type, stakeholder, message)
    }

    return notifications
  }

  // Format message based on role and event
  formatMessage(stakeholder: any, request: NotificationRequest): string {
    if (request.specific_message) {
      return request.specific_message
    }

    const templates: any = {
      buyer: {
        inspection_issue: `Hi ${stakeholder.name}, regarding the property at ${request.property_address || 'your property'}: ${request.details}. Your agent will contact you shortly with next steps.`,
        general_update: `Hi ${stakeholder.name}, update on ${request.property_address || 'your property'}: ${request.details}`,
        closing_update: `Hi ${stakeholder.name}, closing update: ${request.details}. Please contact your agent if you have questions.`
      },
      seller: {
        inspection_issue: `Hello ${stakeholder.name}, the buyer's inspection at ${request.property_address || 'your property'} found: ${request.details}. Your agent will discuss next steps.`,
        general_update: `Hello ${stakeholder.name}, update on ${request.property_address || 'your property'}: ${request.details}`,
        offer_update: `Hello ${stakeholder.name}, offer update: ${request.details}`
      },
      title_company: {
        general_update: `Transaction update for ${request.property_address || 'property'}: ${request.details}. Agent: Ray Richards`,
        document_update: `Document update for ${request.property_address || 'property'}: ${request.details}`
      },
      inspector: {
        scheduling_update: `Inspection scheduling for ${request.property_address || 'property'}: ${request.details}`,
        general_update: `Update for ${request.property_address || 'property'}: ${request.details}`
      },
      lender: {
        inspection_issue: `Property inspection at ${request.property_address || 'subject property'} identified: ${request.details}. This may affect loan proceedings.`,
        appraisal_update: `Appraisal update for ${request.property_address || 'property'}: ${request.details}`,
        general_update: `Loan-related update for ${request.property_address || 'property'}: ${request.details}`
      }
    }

    const roleTemplates = templates[stakeholder.role] || templates.buyer
    const template = roleTemplates[request.event_type] || roleTemplates.general_update

    return template
  }

  // Send SMS via Textbelt
  async sendSMS(to: string, message: string) {
    try {
      // Format phone number (Textbelt accepts various formats)
      const formattedPhone = this.formatPhoneNumber(to)

      console.log(`Sending SMS to ${formattedPhone}: ${message}`)

      // Send via Textbelt API
      const response = await fetch(TEXTBELT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          phone: formattedPhone,
          message: message,
          key: TEXTBELT_API_KEY
        })
      })

      const result: any = await response.json()

      if (result.success) {
        console.log('SMS sent successfully via Textbelt:', result.textId)
        return { success: true, messageId: result.textId, quotaRemaining: result.quotaRemaining }
      } else {
        console.error('Textbelt error:', result.error)
        return { success: false, error: result.error }
      }
    } catch (error: any) {
      console.error('Failed to send SMS:', error)
      return { success: false, error: error.message }
    }
  }

  // Format phone number to E.164
  formatPhoneNumber(phone: string): string {
    // Remove all non-digits
    const digits = phone.replace(/\D/g, '')

    // Add +1 if not present (assuming US numbers)
    if (digits.length === 10) {
      return `+1${digits}`
    } else if (digits.length === 11 && digits.startsWith('1')) {
      return `+${digits}`
    }

    return phone // Return as-is if format is unclear
  }

  // Log notification to database
  async logNotification(transactionId: string, eventType: string, recipient: any, message: string) {
    const logId = crypto.randomUUID()
    await supabase
      .from('notification_log')
      .insert({
        id: logId,
        transaction_id: transactionId,
        trigger_event: eventType,
        recipients: {
          name: recipient.name,
          role: recipient.role,
          phone: recipient.phone
        },
        message,
        sent_at: new Date().toISOString()
      })
  }

  // Parse voice input to extract notification intent
  async parseNotificationIntent(voiceInput: string): Promise<NotificationRequest | null> {
    const input = voiceInput.toLowerCase()

    // Look for keywords that indicate notification intent
    const notifyKeywords = ['tell', 'notify', 'inform', 'let know', 'send', 'message']
    const hasNotifyIntent = notifyKeywords.some(keyword => input.includes(keyword))

    if (!hasNotifyIntent) {
      return null
    }

    // Extract roles mentioned
    const roleMap: { [key: string]: string } = {
      'buyer': 'buyer',
      'seller': 'seller',
      'client': 'buyer', // Assume client means buyer
      'inspector': 'inspector',
      'title company': 'title_company',
      'title': 'title_company',
      'lender': 'lender',
      'bank': 'lender',
      'everyone': 'all'
    }

    const notifyRoles: string[] = []
    for (const [keyword, role] of Object.entries(roleMap)) {
      if (input.includes(keyword)) {
        notifyRoles.push(role)
      }
    }

    // Extract event type from context
    let eventType = 'general_update'
    if (input.includes('inspection') && (input.includes('found') || input.includes('issue'))) {
      eventType = 'inspection_issue'
    } else if (input.includes('closing')) {
      eventType = 'closing_update'
    } else if (input.includes('offer')) {
      eventType = 'offer_update'
    } else if (input.includes('appraisal')) {
      eventType = 'appraisal_update'
    }

    // Extract property address if mentioned
    const addressMatch = input.match(/(\d+\s+[\w\s]+(?:street|st|avenue|ave|road|rd|drive|dr|lane|ln|court|ct))/i)
    const propertyAddress = addressMatch ? addressMatch[1] : undefined

    // Extract the actual message/details
    let details = voiceInput
    const tellMatch = voiceInput.match(/(?:tell|notify|inform).*?(?:the|that|about)\s+(.+)/i)
    if (tellMatch) {
      details = tellMatch[1]
    }

    // Determine severity
    let severity: 'urgent' | 'normal' | 'fyi' = 'normal'
    if (input.includes('urgent') || input.includes('asap') || input.includes('immediately')) {
      severity = 'urgent'
    } else if (input.includes('fyi') || input.includes('heads up')) {
      severity = 'fyi'
    }

    return {
      transaction_id: '', // Will be filled by finding transaction
      property_address: propertyAddress,
      event_type: eventType,
      details: details,
      severity: severity,
      notify_roles: notifyRoles.length > 0 ? notifyRoles : ['buyer'] // Default to buyer if no role specified
    }
  }
}

export const notificationService = new NotificationService()