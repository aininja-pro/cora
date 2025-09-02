// Sample Data Service for Demo/Onboarding
class SampleDataService {
  constructor() {
    this.sampleCalls = [
      {
        id: 'sample-1',
        phone_number: '+1 (555) 123-4567',
        caller_name: 'Sarah Johnson',
        status: 'completed',
        duration: 245,
        created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
        transcript: 'Hi, I was wondering if the 3-bedroom house on Oak Avenue is still available? I\'d love to schedule a showing for this weekend if possible.',
        ai_response: {
          lead_qualified: true,
          lead_quality: 'High',
          callback_requested: true,
          appointment_scheduled: false,
          property_address: '456 Oak Avenue',
          bedrooms: 3,
          price_range: '$450-500K',
          qualification_reason: 'Pre-approved buyer, specific property interest'
        }
      },
      {
        id: 'sample-2',
        phone_number: '+1 (555) 987-6543',
        caller_name: 'Mike Davis',
        status: 'completed',
        duration: 180,
        created_at: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(), // 4 hours ago
        transcript: 'I\'m looking for a 2-bedroom condo downtown, budget around 300K. Can you send me some listings?',
        ai_response: {
          lead_qualified: true,
          lead_quality: 'Medium',
          send_listings_requested: true,
          bedrooms: 2,
          price_range: '$250-350K',
          location_preference: 'Downtown',
          property_type: 'Condo'
        }
      },
      {
        id: 'sample-3',
        phone_number: '+1 (555) 456-7890',
        caller_name: 'Emily Chen',
        status: 'completed',
        duration: 320,
        created_at: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(), // 6 hours ago
        transcript: 'We just moved to the area and need to find a family home. We have two kids, so we need at least 3 bedrooms and a good school district.',
        ai_response: {
          lead_qualified: true,
          lead_quality: 'High',
          appointment_scheduled: true,
          appointment_time: 'Tomorrow 2:00 PM',
          bedrooms: 3,
          requirements: ['good school district', 'family-friendly'],
          family_size: 4
        }
      },
      {
        id: 'sample-4',
        phone_number: '+1 (555) 234-5678',
        caller_name: 'John Smith',
        status: 'no_answer',
        created_at: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(), // 1 hour ago
        voicemail_left: true,
        ai_response: {
          callback_requested: true
        }
      },
      {
        id: 'sample-5',
        phone_number: '+1 (555) 345-6789',
        caller_name: 'Lisa Rodriguez',
        status: 'completed',
        duration: 95,
        created_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(), // 30 minutes ago
        transcript: 'I saw your listing for the Pine Street property. Is it still available? What\'s the price?',
        ai_response: {
          property_inquiry: true,
          property_address: '123 Pine Street',
          lead_quality: 'Medium'
        }
      }
    ]

    this.sampleProperties = [
      {
        id: 'prop-1',
        address: '456 Oak Avenue',
        bedrooms: 3,
        bathrooms: 2,
        price: 475000,
        status: 'active',
        property_type: 'Single Family'
      },
      {
        id: 'prop-2',
        address: '123 Pine Street', 
        bedrooms: 2,
        bathrooms: 1,
        price: 295000,
        status: 'active',
        property_type: 'Condo'
      },
      {
        id: 'prop-3',
        address: '789 Maple Drive',
        bedrooms: 4,
        bathrooms: 3,
        price: 625000,
        status: 'active', 
        property_type: 'Single Family'
      }
    ]
  }

  // Check if sample data should be shown (no real data exists)
  shouldShowSampleData(realDataCount = 0) {
    return realDataCount === 0
  }

  // Get sample calls for different time ranges
  getSampleCalls(timeRange = 'today') {
    const now = new Date()
    let startDate

    switch (timeRange) {
      case 'today':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        break
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        break
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
        break
      default:
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    }

    return this.sampleCalls.filter(call => 
      new Date(call.created_at) >= startDate
    )
  }

  // Get sample KPI stats
  getSampleStats(timeRange = 'today') {
    const calls = this.getSampleCalls(timeRange)
    const answered = calls.filter(c => ['answered', 'completed'].includes(c.status)).length
    const missed = calls.filter(c => ['no_answer', 'busy', 'failed'].includes(c.status)).length
    const needsFollowUp = calls.filter(c => c.ai_response?.callback_requested && !c.agent_contacted).length
    const bookedShowings = calls.filter(c => c.ai_response?.appointment_scheduled).length

    return {
      totalCalls: calls.length,
      answeredRate: answered + missed > 0 ? Math.round((answered / (answered + missed)) * 100) : 0,
      bookedShowings,
      needsFollowUp
    }
  }

  // Get sample urgent items
  getSampleUrgentItems() {
    return [
      {
        id: 'urgent-sample-1',
        priority: 'urgent',
        title: 'Callback requested 45 minutes ago',
        context: 'Sarah Johnson - High quality lead interested in Oak Avenue property',
        time: '45m',
        actions: ['Call Now', 'Send SMS'],
        callId: 'sample-1'
      }
    ]
  }

  // Get sample queue items
  getSampleQueueItems() {
    return [
      {
        id: 'queue-sample-1',
        type: 'confirm_showing',
        title: 'Confirm showing at 789 Maple Drive',
        contact: 'Emily Chen',
        phone: '+1 (555) 456-7890',
        time: 'Tomorrow 2:00 PM',
        status: 'open',
        callId: 'sample-3'
      },
      {
        id: 'queue-sample-2',
        type: 'send_listings',
        title: 'Send listings to Mike Davis',
        contact: 'Mike Davis',
        phone: '+1 (555) 987-6543',
        context: '2BR Condo, $250-350K, Downtown',
        status: 'open',
        callId: 'sample-2'
      }
    ]
  }

  // Get sample live feed items
  getSampleLiveFeedItems() {
    const feedItems = []
    
    for (const call of this.sampleCalls) {
      if (call.status === 'completed') {
        feedItems.push({
          id: `feed-${call.id}`,
          type: 'call_ended',
          timestamp: new Date(call.created_at),
          caller: call.caller_name,
          phone: call.phone_number,
          transcript: call.transcript?.substring(0, 140) + '...',
          duration: call.duration ? `${Math.floor(call.duration / 60)}:${(call.duration % 60).toString().padStart(2, '0')}` : '',
          status: call.ai_response?.lead_qualified ? 'qualified' : 'completed'
        })
      }

      if (call.ai_response?.appointment_scheduled) {
        feedItems.push({
          id: `apt-${call.id}`,
          type: 'appointment_booked',
          timestamp: new Date(call.created_at),
          property: call.ai_response.property_address || 'Property',
          client: call.caller_name,
          appointment_time: call.ai_response.appointment_time || 'TBD',
          status: 'confirmed'
        })
      }

      if (call.ai_response?.lead_qualified) {
        feedItems.push({
          id: `lead-${call.id}`,
          type: 'lead_qualified', 
          timestamp: new Date(call.created_at),
          caller: call.caller_name,
          score: call.ai_response.lead_quality || 'Medium',
          criteria: call.ai_response.qualification_reason || 'Met qualification criteria',
          status: 'qualified'
        })
      }

      if (call.status === 'no_answer') {
        feedItems.push({
          id: `missed-${call.id}`,
          type: 'missed_call',
          timestamp: new Date(call.created_at),
          caller: call.caller_name || 'Unknown',
          phone: call.phone_number,
          voicemail: call.voicemail_left || false,
          status: call.voicemail_left ? 'needs_followup' : 'missed'
        })
      }
    }

    return feedItems.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
  }

  // Hide sample data (user has real data now)
  hideSampleData() {
    localStorage.setItem('cora_hide_sample_data', 'true')
  }

  // Check if sample data should be hidden
  isSampleDataHidden() {
    return localStorage.getItem('cora_hide_sample_data') === 'true'
  }

  // Toggle sample data visibility
  toggleSampleData() {
    const isHidden = this.isSampleDataHidden()
    if (isHidden) {
      localStorage.removeItem('cora_hide_sample_data')
    } else {
      this.hideSampleData()
    }
    return !isHidden
  }
}

export default new SampleDataService()