import { useState, useEffect } from 'react'
import { Phone, Building, Users, TrendingUp, ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'

function Dashboard() {
  const [agent, setAgent] = useState(null)
  const [stats, setStats] = useState({
    activeListings: 3,
    callsToday: 7,
    newLeads: 4,
    scheduledShowings: 2
  })

  useEffect(() => {
    // Get agent info from localStorage
    const agentData = localStorage.getItem('agent')
    if (agentData) {
      setAgent(JSON.parse(agentData))
    }
  }, [])

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Welcome Section */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-navy mb-2">
          Welcome back, {agent?.name || 'Agent'}!
        </h1>
        <p className="text-gray-600">
          Here's what's happening with your properties today.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <Building className="h-8 w-8 text-coral" />
            <span className="text-2xl font-bold text-navy">{stats.activeListings}</span>
          </div>
          <h3 className="text-sm font-medium text-gray-600">Active Listings</h3>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <Phone className="h-8 w-8 text-coral" />
            <span className="text-2xl font-bold text-navy">{stats.callsToday}</span>
          </div>
          <h3 className="text-sm font-medium text-gray-600">Calls Today</h3>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <Users className="h-8 w-8 text-coral" />
            <span className="text-2xl font-bold text-navy">{stats.newLeads}</span>
          </div>
          <h3 className="text-sm font-medium text-gray-600">New Leads</h3>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <TrendingUp className="h-8 w-8 text-coral" />
            <span className="text-2xl font-bold text-navy">{stats.scheduledShowings}</span>
          </div>
          <h3 className="text-sm font-medium text-gray-600">Showings Today</h3>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-xl p-6 shadow-sm mb-8">
        <h2 className="text-xl font-bold text-navy mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link
            to="/properties"
            className="flex items-center justify-between p-4 bg-cream rounded-lg hover:bg-cream-dark transition"
          >
            <span className="font-medium text-navy">View Properties</span>
            <ArrowRight className="h-5 w-5 text-coral" />
          </Link>
          
          <Link
            to="/calls"
            className="flex items-center justify-between p-4 bg-cream rounded-lg hover:bg-cream-dark transition"
          >
            <span className="font-medium text-navy">Recent Calls</span>
            <ArrowRight className="h-5 w-5 text-coral" />
          </Link>
          
          <button
            className="flex items-center justify-between p-4 bg-coral text-white rounded-lg hover:bg-coral-dark transition"
          >
            <span className="font-medium">Add Property</span>
            <ArrowRight className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white rounded-xl p-6 shadow-sm">
        <h2 className="text-xl font-bold text-navy mb-4">Recent Activity</h2>
        <div className="space-y-4">
          <div className="flex items-start">
            <div className="bg-coral/10 rounded-full p-2 mr-4">
              <Phone className="h-4 w-4 text-coral" />
            </div>
            <div>
              <p className="text-sm font-medium text-navy">
                New inquiry about 123 Main Street
              </p>
              <p className="text-xs text-gray-500">2 minutes ago</p>
            </div>
          </div>
          
          <div className="flex items-start">
            <div className="bg-coral/10 rounded-full p-2 mr-4">
              <Users className="h-4 w-4 text-coral" />
            </div>
            <div>
              <p className="text-sm font-medium text-navy">
                Showing scheduled for Oak Avenue property
              </p>
              <p className="text-xs text-gray-500">1 hour ago</p>
            </div>
          </div>
          
          <div className="flex items-start">
            <div className="bg-coral/10 rounded-full p-2 mr-4">
              <Building className="h-4 w-4 text-coral" />
            </div>
            <div>
              <p className="text-sm font-medium text-navy">
                Price updated for Pine Lane listing
              </p>
              <p className="text-xs text-gray-500">3 hours ago</p>
            </div>
          </div>
        </div>
      </div>

      {/* CORA Status */}
      <div className="mt-8 bg-gradient-to-r from-navy to-navy-dark rounded-xl p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xl font-bold mb-2">CORA is Active</h3>
            <p className="text-gray-300">
              Your AI assistant is answering calls 24/7
            </p>
            <p className="text-sm text-gray-400 mt-2">
              Phone: +1 (316) 867-0416
            </p>
          </div>
          <div className="bg-green-500 h-4 w-4 rounded-full animate-pulse"></div>
        </div>
      </div>
    </div>
  )
}

export default Dashboard