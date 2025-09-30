import { useState, useEffect } from 'react'
import { Building, Users, Phone, Mail, MessageSquare, Plus, ChevronDown, ChevronUp } from 'lucide-react'

function TransactionsView({ agentId = 'Ray Richards' }) {
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedTransactions, setExpandedTransactions] = useState({})
  const [showAddModal, setShowAddModal] = useState(false)
  const [newTransaction, setNewTransaction] = useState({ address: '' })
  const [selectedTransaction, setSelectedTransaction] = useState(null)
  const [newStakeholder, setNewStakeholder] = useState({ name: '', role: 'buyer', phone: '', email: '' })

  useEffect(() => {
    loadTransactions()
  }, [])

  const getApiUrl = (path) => {
    const host = window.location.hostname === 'localhost'
      ? 'http://localhost:3000'
      : window.location.hostname.startsWith('192.168') || window.location.hostname.startsWith('10.')
      ? `http://${window.location.hostname}:3000`
      : 'https://cora-server.onrender.com'
    return `${host}${path}`
  }

  const loadTransactions = async () => {
    setLoading(true)
    try {
      const response = await fetch(getApiUrl(`/api/transactions/${agentId}`))
      const data = await response.json()

      if (data.success) {
        setTransactions(data.transactions || [])
      }
    } catch (error) {
      console.error('Failed to load transactions:', error)
    } finally {
      setLoading(false)
    }
  }

  const createTransaction = async () => {
    try {
      const response = await fetch(getApiUrl('/api/transactions'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          property_address: newTransaction.address,
          agent_id: agentId
        })
      })

      const result = await response.json()
      if (result.success) {
        setShowAddModal(false)
        setNewTransaction({ address: '' })
        loadTransactions()
      }
    } catch (error) {
      console.error('Failed to create transaction:', error)
    }
  }

  const addStakeholder = async () => {
    if (!selectedTransaction) return

    try {
      const response = await fetch(getApiUrl('/api/stakeholders'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          property_address: selectedTransaction.property_address,
          ...newStakeholder
        })
      })

      const result = await response.json()
      if (result.success) {
        setNewStakeholder({ name: '', role: 'buyer', phone: '', email: '' })
        setSelectedTransaction(null)
        loadTransactions()
      }
    } catch (error) {
      console.error('Failed to add stakeholder:', error)
    }
  }

  const sendNotification = async (transaction, stakeholderRole, message) => {
    try {
      const response = await fetch(getApiUrl('/api/notifications/send'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          property_address: transaction.property_address,
          notify_roles: [stakeholderRole],
          details: message,
          event_type: 'general_update',
          severity: 'normal'
        })
      })

      const result = await response.json()
      if (result.success) {
        alert(`Notification sent to ${stakeholderRole}`)
      }
    } catch (error) {
      console.error('Failed to send notification:', error)
    }
  }

  const toggleTransaction = (transactionId) => {
    setExpandedTransactions(prev => ({
      ...prev,
      [transactionId]: !prev[transactionId]
    }))
  }

  const roleColors = {
    buyer: 'bg-blue-100 text-blue-800',
    seller: 'bg-green-100 text-green-800',
    buyer_agent: 'bg-purple-100 text-purple-800',
    seller_agent: 'bg-orange-100 text-orange-800',
    inspector: 'bg-yellow-100 text-yellow-800',
    title_company: 'bg-pink-100 text-pink-800',
    lender: 'bg-indigo-100 text-indigo-800',
    appraiser: 'bg-gray-100 text-gray-800'
  }

  const roleLabels = {
    buyer: 'Buyer',
    seller: 'Seller',
    buyer_agent: 'Buyer Agent',
    seller_agent: 'Seller Agent',
    inspector: 'Inspector',
    title_company: 'Title Company',
    lender: 'Lender',
    appraiser: 'Appraiser'
  }

  if (loading) {
    return (
      <div className="bg-white rounded-xl p-6 shadow-sm">
        <div className="flex items-center justify-center py-12">
          <div className="text-gray-500">Loading transactions...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl p-4 md:p-6 shadow-sm">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Building className="h-5 w-5 text-coral" />
          <h2 className="text-lg font-bold text-navy">Property Transactions</h2>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2 bg-coral hover:bg-coral-dark text-white rounded-lg flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          New Transaction
        </button>
      </div>

      {transactions.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <Building className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-600 mb-4">No transactions yet</p>
          <p className="text-sm text-gray-500 mb-4">
            Start by creating a transaction or use voice commands:
          </p>
          <div className="text-left max-w-md mx-auto space-y-2">
            <p className="text-sm bg-white p-2 rounded border border-gray-200">
              🎤 "Create a transaction for 123 Main Street"
            </p>
            <p className="text-sm bg-white p-2 rounded border border-gray-200">
              🎤 "Add John Smith as the buyer, phone 555-1234"
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {transactions.map(transaction => (
            <div key={transaction.id} className="border rounded-lg overflow-hidden">
              <div
                className="p-4 bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors"
                onClick={() => toggleTransaction(transaction.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Building className="h-5 w-5 text-gray-600" />
                    <div>
                      <h3 className="font-semibold text-navy">
                        {transaction.property_address}
                      </h3>
                      <p className="text-sm text-gray-600">
                        {transaction.transaction_stakeholders?.length || 0} stakeholders
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      transaction.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                    }`}>
                      {transaction.status}
                    </span>
                    {expandedTransactions[transaction.id] ? (
                      <ChevronUp className="h-5 w-5 text-gray-500" />
                    ) : (
                      <ChevronDown className="h-5 w-5 text-gray-500" />
                    )}
                  </div>
                </div>
              </div>

              {expandedTransactions[transaction.id] && (
                <div className="p-4 bg-white border-t">
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-semibold text-sm text-gray-700">Stakeholders</h4>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelectedTransaction(transaction)
                        }}
                        className="text-sm px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded"
                      >
                        <Plus className="h-3 w-3 inline mr-1" />
                        Add
                      </button>
                    </div>

                    {transaction.transaction_stakeholders?.length > 0 ? (
                      <div className="space-y-2">
                        {transaction.transaction_stakeholders.map(stakeholder => (
                          <div key={stakeholder.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                            <div className="flex items-center gap-3">
                              <Users className="h-4 w-4 text-gray-500" />
                              <div>
                                <p className="font-medium text-sm">{stakeholder.name}</p>
                                <div className="flex items-center gap-2 mt-1">
                                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${roleColors[stakeholder.role]}`}>
                                    {roleLabels[stakeholder.role]}
                                  </span>
                                  {stakeholder.phone && (
                                    <span className="text-xs text-gray-500 flex items-center gap-1">
                                      <Phone className="h-3 w-3" />
                                      {stakeholder.phone}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                const message = prompt(`Send message to ${stakeholder.name}:`)
                                if (message) {
                                  sendNotification(transaction, stakeholder.role, message)
                                }
                              }}
                              className="p-2 hover:bg-gray-200 rounded transition-colors"
                              title="Send notification"
                            >
                              <MessageSquare className="h-4 w-4 text-gray-600" />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500">No stakeholders added yet</p>
                    )}
                  </div>

                  <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                    <p className="text-xs text-blue-800 font-medium mb-1">Quick Actions:</p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => {
                          const message = prompt('Notify all stakeholders:')
                          if (message) {
                            sendNotification(transaction, 'all', message)
                          }
                        }}
                        className="text-xs px-2 py-1 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded"
                      >
                        Notify All
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add Transaction Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowAddModal(false)} />
          <div className="relative bg-white rounded-lg shadow-xl p-6 max-w-md w-full">
            <h3 className="text-lg font-bold text-navy mb-4">New Transaction</h3>
            <input
              type="text"
              placeholder="Property Address (e.g., 123 Main Street)"
              value={newTransaction.address}
              onChange={(e) => setNewTransaction({ address: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-coral"
            />
            <div className="flex gap-2 mt-4">
              <button
                onClick={createTransaction}
                className="flex-1 px-4 py-2 bg-coral hover:bg-coral-dark text-white rounded-lg"
              >
                Create
              </button>
              <button
                onClick={() => setShowAddModal(false)}
                className="flex-1 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Stakeholder Modal */}
      {selectedTransaction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setSelectedTransaction(null)} />
          <div className="relative bg-white rounded-lg shadow-xl p-6 max-w-md w-full">
            <h3 className="text-lg font-bold text-navy mb-2">Add Stakeholder</h3>
            <p className="text-sm text-gray-600 mb-4">{selectedTransaction.property_address}</p>

            <div className="space-y-3">
              <input
                type="text"
                placeholder="Name"
                value={newStakeholder.name}
                onChange={(e) => setNewStakeholder({ ...newStakeholder, name: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-coral"
              />

              <select
                value={newStakeholder.role}
                onChange={(e) => setNewStakeholder({ ...newStakeholder, role: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-coral"
              >
                <option value="buyer">Buyer</option>
                <option value="seller">Seller</option>
                <option value="buyer_agent">Buyer Agent</option>
                <option value="seller_agent">Seller Agent</option>
                <option value="inspector">Inspector</option>
                <option value="title_company">Title Company</option>
                <option value="lender">Lender</option>
                <option value="appraiser">Appraiser</option>
              </select>

              <input
                type="tel"
                placeholder="Phone (optional)"
                value={newStakeholder.phone}
                onChange={(e) => setNewStakeholder({ ...newStakeholder, phone: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-coral"
              />

              <input
                type="email"
                placeholder="Email (optional)"
                value={newStakeholder.email}
                onChange={(e) => setNewStakeholder({ ...newStakeholder, email: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-coral"
              />
            </div>

            <div className="flex gap-2 mt-4">
              <button
                onClick={addStakeholder}
                className="flex-1 px-4 py-2 bg-coral hover:bg-coral-dark text-white rounded-lg"
              >
                Add
              </button>
              <button
                onClick={() => setSelectedTransaction(null)}
                className="flex-1 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default TransactionsView