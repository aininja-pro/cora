import { Phone, MessageSquare, Calendar, TrendingUp } from 'lucide-react'
import logo from '../assets/logo.svg'

function Landing({ onLogin }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-cream to-cream-dark">
      {/* Hero Section */}
      <div className="px-6 py-12">
        <div className="text-center">
          <img src={logo} alt="CORA" className="h-20 mx-auto mb-8" />
          <h1 className="text-4xl font-bold text-navy mb-4">
            AI Voice Assistant for Real Estate
          </h1>
          <p className="text-lg text-gray-600 mb-8 max-w-md mx-auto">
            Never miss a lead. Cora answers every call, qualifies buyers, and schedules showings 24/7.
          </p>
          <button
            onClick={onLogin}
            className="bg-coral hover:bg-coral-dark text-white font-bold py-4 px-8 rounded-full text-lg shadow-lg transform transition hover:scale-105"
          >
            Start Demo
          </button>
        </div>
      </div>

      {/* Features Grid */}
      <div className="px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          <div className="bg-white rounded-2xl p-6 shadow-md">
            <Phone className="h-10 w-10 text-coral mb-4" />
            <h3 className="text-xl font-semibold text-navy mb-2">24/7 Call Answering</h3>
            <p className="text-gray-600">
              Never miss a lead. Cora answers every call with professional, personalized responses.
            </p>
          </div>
          
          <div className="bg-white rounded-2xl p-6 shadow-md">
            <MessageSquare className="h-10 w-10 text-coral mb-4" />
            <h3 className="text-xl font-semibold text-navy mb-2">Intelligent Conversations</h3>
            <p className="text-gray-600">
              Powered by GPT-4, Cora provides detailed property information and answers questions naturally.
            </p>
          </div>
          
          <div className="bg-white rounded-2xl p-6 shadow-md">
            <Calendar className="h-10 w-10 text-coral mb-4" />
            <h3 className="text-xl font-semibold text-navy mb-2">Automated Scheduling</h3>
            <p className="text-gray-600">
              Cora schedules showings, sends confirmations, and syncs with your calendar automatically.
            </p>
          </div>
          
          <div className="bg-white rounded-2xl p-6 shadow-md">
            <TrendingUp className="h-10 w-10 text-coral mb-4" />
            <h3 className="text-xl font-semibold text-navy mb-2">Lead Intelligence</h3>
            <p className="text-gray-600">
              Get insights on lead quality, buyer intent, and conversation analytics to close more deals.
            </p>
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div className="px-6 py-12 text-center">
        <div className="bg-navy rounded-2xl p-8 max-w-2xl mx-auto">
          <h2 className="text-2xl font-bold text-white mb-4">
            Ready to transform your real estate business?
          </h2>
          <p className="text-gray-300 mb-6">
            Join agents who are closing more deals with AI-powered assistance.
          </p>
          <button
            onClick={onLogin}
            className="bg-coral hover:bg-coral-dark text-white font-bold py-3 px-6 rounded-full shadow-lg transform transition hover:scale-105"
          >
            Try CORA Now
          </button>
        </div>
      </div>
    </div>
  )
}

export default Landing