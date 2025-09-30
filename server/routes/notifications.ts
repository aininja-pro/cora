import express from 'express'
import { notificationService } from '../services/notificationService'

const router = express.Router()

// Create a new transaction
router.post('/api/transactions', async (req, res) => {
  try {
    const { property_address, agent_id } = req.body

    if (!property_address || !agent_id) {
      return res.status(400).json({
        success: false,
        error: 'Property address and agent ID are required'
      })
    }

    const transaction = await notificationService.createTransaction(property_address, agent_id)

    res.json({
      success: true,
      transaction
    })
  } catch (error: any) {
    console.error('Error creating transaction:', error)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

// Add stakeholder to transaction
router.post('/api/stakeholders', async (req, res) => {
  try {
    const { property_address, role, name, phone, email } = req.body

    if (!property_address || !role || !name) {
      return res.status(400).json({
        success: false,
        error: 'Property address, role, and name are required'
      })
    }

    // First find the transaction
    const transaction = await notificationService.findTransactionByAddress(property_address)

    if (!transaction) {
      return res.status(404).json({
        success: false,
        error: `No transaction found for property: ${property_address}`
      })
    }

    // Add the stakeholder
    const stakeholder = await notificationService.addStakeholder({
      transaction_id: transaction.id,
      role,
      name,
      phone,
      email,
      notification_prefs: { methods: ['sms'] }
    })

    res.json({
      success: true,
      stakeholder
    })
  } catch (error: any) {
    console.error('Error adding stakeholder:', error)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

// Send notification to stakeholders
router.post('/api/notifications/send', async (req, res) => {
  try {
    const {
      property_address,
      notify_roles,
      details,
      event_type = 'general_update',
      severity = 'normal'
    } = req.body

    if (!property_address || !notify_roles || !details) {
      return res.status(400).json({
        success: false,
        error: 'Property address, roles to notify, and message details are required'
      })
    }

    // Send the notifications
    const notifications = await notificationService.notifyStakeholders({
      transaction_id: '', // Will be found by address
      property_address,
      event_type,
      details,
      severity,
      notify_roles
    })

    res.json({
      success: true,
      notifications
    })
  } catch (error: any) {
    console.error('Error sending notifications:', error)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

// Get all transactions for an agent
router.get('/api/transactions/:agent_id', async (req, res) => {
  try {
    const { agent_id } = req.params

    // Query transactions from Supabase
    const { createClient } = require('@supabase/supabase-js')
    const supabaseUrl = process.env.SUPABASE_URL!
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY!
    const supabase = createClient(supabaseUrl, supabaseKey)

    const { data: transactions, error } = await supabase
      .from('transactions')
      .select(`
        *,
        transaction_stakeholders (*)
      `)
      .eq('agent_id', agent_id)
      .order('created_at', { ascending: false })

    if (error) throw error

    res.json({
      success: true,
      transactions: transactions || []
    })
  } catch (error: any) {
    console.error('Error fetching transactions:', error)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

// Get stakeholders for a transaction
router.get('/api/transactions/:transaction_id/stakeholders', async (req, res) => {
  try {
    const { transaction_id } = req.params

    const stakeholders = await notificationService.getStakeholders(transaction_id)

    res.json({
      success: true,
      stakeholders
    })
  } catch (error: any) {
    console.error('Error fetching stakeholders:', error)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

export default router