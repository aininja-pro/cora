import React, { useState } from 'react'
import { ArrowRight, Play, CheckCircle, Phone, MessageSquare, Calendar, Sparkles } from 'lucide-react'

function OnboardingFlow({ onComplete }) {
  const [currentStep, setCurrentStep] = useState(0)
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    communicationPreference: 'call',
    calendarConnected: false
  })

  const steps = [
    {
      id: 'welcome',
      title: 'Welcome to CORA',
      subtitle: 'Get routine tasks off your plate in under 5 minutes',
      description: 'Agents like you save ~23 hours/week after setup.',
      component: 'WelcomeStep'
    },
    {
      id: 'profile',
      title: 'Quick Setup',
      subtitle: 'Tell us about yourself',
      description: 'Just the basics to get you started.',
      component: 'ProfileStep'
    },
    {
      id: 'success',
      title: 'Ready to Go!',
      subtitle: 'Test CORA and see the magic',
      description: 'Try these features to see CORA in action.',
      component: 'SuccessStep'
    }
  ]

  const nextStep = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1)
    }
  }

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1)
    }
  }

  const handleFormChange = React.useCallback((field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }, [])

  const handleImportContacts = () => {
    // For demo purposes, show success message
    showSuccessMessage('Contacts imported successfully!', 'Your first 5 contacts have been added to CORA')
  }

  const handlePasteListing = () => {
    // For demo purposes, show success message
    showSuccessMessage('Listing URL processed!', 'Property details extracted and added to your listings')
  }

  const handleTestSMS = async () => {
    try {
      // Send test SMS using the API
      const response = await fetch('/api/notifications/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: 'demo-tenant',
          to: formData.phone,
          message: 'CORA is ready! This is your test SMS. Reply STOP to opt out.'
        })
      })
      
      if (response.ok) {
        showSuccessMessage('Test SMS sent!', `Check your phone at ${formData.phone}`)
      } else {
        showSuccessMessage('SMS demo ready!', 'Test SMS would be sent in production')
      }
    } catch (error) {
      showSuccessMessage('SMS demo ready!', 'Test SMS would be sent in production')
    }
  }

  const handleVoiceDemo = () => {
    showSuccessMessage('Voice demo ready!', 'Try saying "Schedule showing" or "Search properties" when you enter the dashboard')
  }

  const showSuccessMessage = (title, message) => {
    // Create a temporary success overlay
    const overlay = document.createElement('div')
    overlay.className = 'fixed top-4 left-4 right-4 bg-green-500 text-white p-4 rounded-lg shadow-lg z-50 animate-fade-in'
    overlay.innerHTML = `
      <h4 class="font-bold">${title}</h4>
      <p class="text-sm">${message}</p>
    `
    
    document.body.appendChild(overlay)
    
    setTimeout(() => {
      overlay.remove()
    }, 3000)
  }

  const WelcomeStep = () => (
    <div className="text-center space-y-6">
      {/* Hero Visual */}
      <div className="relative mx-auto w-32 h-32 bg-gradient-to-br from-coral to-coral-dark rounded-full flex items-center justify-center mb-8">
        <Sparkles className="h-16 w-16 text-white" />
        <div className="absolute inset-0 bg-coral/20 rounded-full animate-ping"></div>
      </div>

      {/* Title */}
      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-navy">Welcome to CORA</h1>
        <p className="text-lg text-gray-700">Get routine tasks off your plate in under 5 minutes</p>
        <p className="text-coral font-semibold">Agents like you save ~23 hours/week after setup.</p>
      </div>

      {/* Action Buttons */}
      <div className="space-y-3 pt-4">
        <button
          onClick={nextStep}
          className="w-full py-4 bg-coral text-white text-lg font-semibold rounded-xl hover:bg-coral-dark transition-colors flex items-center justify-center gap-2"
        >
          Get Started
          <ArrowRight className="h-5 w-5" />
        </button>
        
        <button className="w-full py-3 border-2 border-gray-300 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition-colors flex items-center justify-center gap-2">
          <Play className="h-4 w-4" />
          Watch 30-sec demo
        </button>
      </div>

      {/* Value Props */}
      <div className="grid grid-cols-3 gap-4 pt-6 text-center">
        <div className="space-y-2">
          <Phone className="h-8 w-8 text-coral mx-auto" />
          <p className="text-sm font-medium text-navy">24/7 Calls</p>
        </div>
        <div className="space-y-2">
          <MessageSquare className="h-8 w-8 text-coral mx-auto" />
          <p className="text-sm font-medium text-navy">Smart SMS</p>
        </div>
        <div className="space-y-2">
          <Calendar className="h-8 w-8 text-coral mx-auto" />
          <p className="text-sm font-medium text-navy">Auto Booking</p>
        </div>
      </div>
    </div>
  )

  const ProfileStep = () => {
    // Use local refs to prevent re-rendering issues
    const nameRef = React.useRef(null)
    const phoneRef = React.useRef(null)
    const emailRef = React.useRef(null)

    const handleInputChange = (field) => (e) => {
      const value = e.target.value
      setFormData(prev => ({ ...prev, [field]: value }))
    }

    return (
      <div className="space-y-6">
        <div className="text-center space-y-2">
          <h2 className="text-xl font-bold text-navy">Quick Setup</h2>
          <p className="text-gray-600">Tell us about yourself - just the basics to get you started.</p>
        </div>

        <div className="space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Your Name</label>
            <input
              ref={nameRef}
              type="text"
              defaultValue={formData.name}
              onBlur={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="Enter your name"
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-coral focus:border-transparent"
            />
          </div>

          {/* Phone */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Phone Number</label>
            <input
              ref={phoneRef}
              type="tel"
              defaultValue={formData.phone}
              onBlur={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
              placeholder="(555) 123-4567"
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-coral focus:border-transparent"
            />
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
            <input
              ref={emailRef}
              type="email"
              defaultValue={formData.email}
              onBlur={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
              placeholder="your@email.com"
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-coral focus:border-transparent"
            />
          </div>

        {/* Communication Preference */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Preferred Contact Method</label>
          <div className="grid grid-cols-3 gap-2">
            {['call', 'text', 'email'].map(method => (
              <button
                key={method}
                onClick={() => handleFormChange('communicationPreference', method)}
                className={`py-2 px-3 text-sm font-medium rounded-lg transition-colors ${
                  formData.communicationPreference === method
                    ? 'bg-coral text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {method.charAt(0).toUpperCase() + method.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Calendar Connect */}
        <div className="p-4 bg-blue-50 rounded-xl">
          <div className="flex items-start gap-3">
            <Calendar className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="font-medium text-blue-900">Connect Calendar</h4>
              <p className="text-sm text-blue-700 mb-3">Prevent double-bookings and schedule intelligently</p>
              <button
                onClick={() => handleFormChange('calendarConnected', true)}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                  formData.calendarConnected
                    ? 'bg-green-100 text-green-700'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                {formData.calendarConnected ? (
                  <>
                    <CheckCircle className="inline h-4 w-4 mr-1" />
                    Connected
                  </>
                ) : (
                  'Connect Google/Outlook'
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex gap-3 pt-4">
        <button
          onClick={prevStep}
          className="flex-1 py-3 border-2 border-gray-300 text-gray-700 font-medium rounded-xl hover:bg-gray-50"
        >
          Back
        </button>
        <button
          onClick={nextStep}
          disabled={!formData.name || !formData.phone}
          className="flex-1 py-3 bg-coral text-white font-medium rounded-xl hover:bg-coral-dark disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Continue
        </button>
      </div>
    </div>
    )
  }

  const SuccessStep = () => (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <CheckCircle className="h-16 w-16 text-green-500 mx-auto" />
        <h2 className="text-xl font-bold text-navy">Ready to Go!</h2>
        <p className="text-gray-600">Test CORA and see the magic in action.</p>
      </div>

      {/* First Success Actions */}
      <div className="space-y-4">
        <div className="p-4 bg-coral/5 border border-coral/20 rounded-xl">
          <h4 className="font-semibold text-navy mb-2">1. Import Your Contacts</h4>
          <p className="text-sm text-gray-600 mb-3">Add your first 5 contacts or paste a listing URL</p>
          <div className="flex gap-2">
            <button 
              onClick={handleImportContacts}
              className="px-4 py-2 bg-coral text-white text-sm font-medium rounded-lg hover:bg-coral-dark"
            >
              Import Contacts
            </button>
            <button 
              onClick={handlePasteListing}
              className="px-4 py-2 border border-coral text-coral text-sm font-medium rounded-lg hover:bg-coral/5"
            >
              Paste Listing URL
            </button>
          </div>
        </div>

        <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
          <h4 className="font-semibold text-navy mb-2">2. Test SMS</h4>
          <p className="text-sm text-gray-600 mb-3">Send a test message to yourself to verify setup</p>
          <button 
            onClick={handleTestSMS}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
          >
            Send Test SMS to {formData.phone}
          </button>
        </div>

        <div className="p-4 bg-purple-50 border border-purple-200 rounded-xl">
          <h4 className="font-semibold text-navy mb-2">3. Try Voice Commands</h4>
          <p className="text-sm text-gray-600 mb-3">Test the voice assistant with a quick demo</p>
          <button 
            onClick={handleVoiceDemo}
            className="px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700"
          >
            Try Voice Demo
          </button>
        </div>
      </div>

      {/* Next Steps */}
      <div className="p-4 bg-gray-50 rounded-xl">
        <h4 className="font-medium text-navy mb-2">Next: Set this up for your business in under 2 minutes</h4>
        <p className="text-sm text-gray-600">Connect your MLS, add team members, and customize your settings.</p>
      </div>

      {/* Complete Onboarding */}
      <button
        onClick={onComplete}
        className="w-full py-4 bg-gradient-to-r from-coral to-coral-dark text-white text-lg font-semibold rounded-xl hover:opacity-90 transition-opacity"
      >
        Enter Dashboard
      </button>
    </div>
  )

  const renderStep = () => {
    switch (steps[currentStep].component) {
      case 'WelcomeStep':
        return <WelcomeStep />
      case 'ProfileStep':
        return <ProfileStep />
      case 'SuccessStep':
        return <SuccessStep />
      default:
        return <WelcomeStep />
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-cream to-cream-dark flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6">
        {/* Progress Indicator */}
        <div className="flex items-center justify-center mb-8">
          {steps.map((_, index) => (
            <div key={index} className="flex items-center">
              <div className={`w-3 h-3 rounded-full transition-colors ${
                index <= currentStep ? 'bg-coral' : 'bg-gray-300'
              }`} />
              {index < steps.length - 1 && (
                <div className={`w-8 h-0.5 mx-2 transition-colors ${
                  index < currentStep ? 'bg-coral' : 'bg-gray-300'
                }`} />
              )}
            </div>
          ))}
        </div>

        {/* Step Content */}
        {renderStep()}
      </div>
    </div>
  )
}

export default OnboardingFlow