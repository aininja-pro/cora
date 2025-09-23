import { AlertTriangle, Clock, Calendar, CheckCircle, MoreHorizontal, Edit2, Trash2, ArrowDown, X, Check } from 'lucide-react'
import { useState } from 'react'

function UrgentSection({ items = [], loading, onMoveToQueue, onDelete, onUpdate }) {
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [menuOpenId, setMenuOpenId] = useState(null)

  // Priority badges configuration
  const getPriorityConfig = (priority) => {
    switch (priority) {
      case 'urgent':
        return {
          bg: 'bg-red-50',
          border: 'border-[#E03131]',
          text: 'text-[#E03131]',
          badge: 'bg-[#E03131] text-white',
          label: 'URGENT'
        }
      case 'scheduling_conflict':
        return {
          bg: 'bg-amber-50',
          border: 'border-[#F08C00]',
          text: 'text-[#F08C00]',
          badge: 'bg-[#F08C00] text-white',
          label: 'SCHEDULING CONFLICT'
        }
      case 'routine':
      default:
        return {
          bg: 'bg-blue-50',
          border: 'border-[#1971C2]',
          text: 'text-[#1971C2]',
          badge: 'bg-[#1971C2] text-white',
          label: 'ROUTINE'
        }
    }
  }

  const handleEdit = (item) => {
    setEditingId(item.id)
    setEditForm({
      title: item.title,
      description: item.description || '',
      contact: item.contact || '',
      phone: item.phone || '',
      context: item.context || '',
      time: item.time || ''
    })
    setMenuOpenId(null)
  }

  const handleSaveEdit = (itemId) => {
    if (onUpdate) {
      onUpdate(itemId, editForm)
    }
    setEditingId(null)
    setEditForm({})
  }

  const handleCancelEdit = () => {
    setEditingId(null)
    setEditForm({})
  }

  const handleDelete = (itemId) => {
    if (onDelete) {
      onDelete(itemId)
    }
    setMenuOpenId(null)
  }

  const handleMoveToQueue = (item) => {
    if (onMoveToQueue) {
      onMoveToQueue(item)
    }
    setMenuOpenId(null)
  }

  const toggleMenu = (itemId) => {
    setMenuOpenId(menuOpenId === itemId ? null : itemId)
  }

  const sampleItems = [
    {
      id: '1',
      priority: 'urgent',
      title: 'Contract deadline due in 4 hours',
      context: '123 Main Street - Buyer response needed',
      time: '4h',
      actions: ['Review Contract', 'Call Buyer']
    },
    {
      id: '2',
      priority: 'scheduling_conflict',
      title: 'Double-booked showing needs resolution',
      context: 'Your showing at 456 Oak Ave overlaps with 789 Pine St.',
      time: '2h',
      actions: ['Move Showing', 'See All Options']
    }
  ]

  const displayItems = items || []

  if (loading) {
    return (
      <div className="bg-white rounded-xl p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <div className="h-5 w-5 bg-gray-200 rounded animate-pulse"></div>
          <div className="h-6 w-32 bg-gray-200 rounded animate-pulse"></div>
        </div>
        <div className="space-y-4">
          {[1, 2].map(i => (
            <div key={i} className="p-4 border rounded-lg">
              <div className="flex justify-between items-start mb-2">
                <div className="h-4 w-24 bg-gray-200 rounded animate-pulse"></div>
                <div className="h-4 w-8 bg-gray-200 rounded animate-pulse"></div>
              </div>
              <div className="h-4 w-full bg-gray-200 rounded animate-pulse mb-2"></div>
              <div className="h-4 w-3/4 bg-gray-200 rounded animate-pulse"></div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (displayItems.length === 0) {
    return (
      <div className="bg-white rounded-xl p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <CheckCircle className="h-5 w-5 text-green-500" />
          <h2 className="text-lg font-bold text-navy">All Caught Up!</h2>
        </div>
        <p className="text-gray-600">No urgent items need attention right now.</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-[#E03131]" />
          <h2 className="text-lg font-bold text-navy">Urgent</h2>
          <span className="bg-[#E03131] text-white text-xs px-2 py-1 rounded-full font-medium">
            {displayItems.filter(item => item.priority === 'urgent').length}
          </span>
        </div>

        {/* Batch Actions Bar - when ≥2 routine items */}
        {displayItems.filter(item => item.priority === 'routine').length >= 2 && (
          <div className="flex gap-2">
            <button className="px-3 py-1 bg-[#1971C2] text-white text-xs font-medium rounded hover:opacity-90">
              Approve All Non-Critical
            </button>
            <button className="px-3 py-1 bg-gray-100 text-gray-700 text-xs font-medium rounded hover:bg-gray-200">
              Review Later (30m)
            </button>
          </div>
        )}
      </div>

      <div className="space-y-4">
        {displayItems.map((item) => {
          const priorityConfig = getPriorityConfig(item.priority)
          const isEditing = editingId === item.id

          return (
            <div
              key={item.id}
              className={`p-4 rounded-lg border-l-4 ${priorityConfig.bg} ${priorityConfig.border}`}
            >
              {/* Header */}
              <div className="flex justify-between items-start mb-2">
                <span className={`text-xs font-bold px-2 py-1 rounded ${priorityConfig.badge}`}>
                  {priorityConfig.label}
                </span>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-gray-400" />
                  <span className="text-sm text-gray-500">{item.time}</span>
                  <div className="relative">
                    <button
                      onClick={() => toggleMenu(item.id)}
                      className="p-1 hover:bg-gray-100 rounded"
                    >
                      <MoreHorizontal className="h-4 w-4 text-gray-400" />
                    </button>

                    {/* Dropdown Menu */}
                    {menuOpenId === item.id && (
                      <div className="absolute right-0 top-8 bg-white border border-gray-200 rounded-lg shadow-lg z-10 py-1 w-40">
                        <button
                          onClick={() => handleEdit(item)}
                          className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2 text-sm"
                        >
                          <Edit2 className="h-4 w-4" />
                          Edit
                        </button>
                        <button
                          onClick={() => handleMoveToQueue(item)}
                          className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2 text-sm"
                        >
                          <ArrowDown className="h-4 w-4" />
                          Move to Queue
                        </button>
                        <button
                          onClick={() => handleDelete(item.id)}
                          className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2 text-sm text-red-600"
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Title & Context - Editable */}
              {isEditing ? (
                <div className="space-y-2 mb-4">
                  <input
                    type="text"
                    value={editForm.title}
                    onChange={(e) => setEditForm({...editForm, title: e.target.value})}
                    className="w-full font-bold px-2 py-1 border border-gray-300 rounded"
                    placeholder="Title"
                  />
                  <textarea
                    value={editForm.description}
                    onChange={(e) => setEditForm({...editForm, description: e.target.value})}
                    className="w-full text-sm px-2 py-1 border border-gray-300 rounded h-16 resize-none"
                    placeholder="Description"
                  />
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={editForm.contact}
                      onChange={(e) => setEditForm({...editForm, contact: e.target.value})}
                      className="flex-1 text-sm px-2 py-1 border border-gray-300 rounded"
                      placeholder="Contact name"
                    />
                    <input
                      type="text"
                      value={editForm.phone}
                      onChange={(e) => setEditForm({...editForm, phone: e.target.value})}
                      className="flex-1 text-sm px-2 py-1 border border-gray-300 rounded"
                      placeholder="Phone number"
                    />
                  </div>
                  <input
                    type="text"
                    value={editForm.context}
                    onChange={(e) => setEditForm({...editForm, context: e.target.value})}
                    className="w-full text-sm px-2 py-1 border border-gray-300 rounded"
                    placeholder="Context or location"
                  />
                  <input
                    type="text"
                    value={editForm.time}
                    onChange={(e) => setEditForm({...editForm, time: e.target.value})}
                    className="w-full text-sm px-2 py-1 border border-gray-300 rounded"
                    placeholder="Time or deadline"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleSaveEdit(item.id)}
                      className="px-3 py-1 bg-green-500 text-white text-sm rounded hover:bg-green-600 flex items-center gap-1"
                    >
                      <Check className="h-4 w-4" />
                      Save
                    </button>
                    <button
                      onClick={handleCancelEdit}
                      className="px-3 py-1 bg-gray-200 text-gray-700 text-sm rounded hover:bg-gray-300 flex items-center gap-1"
                    >
                      <X className="h-4 w-4" />
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <h3 className={`font-bold mb-2 ${priorityConfig.text}`}>
                    {item.title}
                  </h3>

                  {/* Show description if available */}
                  {item.description && (
                    <p className="text-sm text-gray-700 mb-2">
                      {item.description}
                    </p>
                  )}

                  {/* Contact and Phone on same line */}
                  {(item.contact || item.phone) && (
                    <div className="text-sm text-gray-600 mb-2">
                      {item.contact && <span className="font-medium">{item.contact}</span>}
                      {item.contact && item.phone && <span> • </span>}
                      {item.phone && <span className="text-blue-600">{item.phone}</span>}
                    </div>
                  )}

                  {/* Context or Location */}
                  {item.context && (
                    <p className="text-sm text-gray-600 mb-2">
                      {item.context}
                    </p>
                  )}

                  {/* Time if specified */}
                  {item.time && (
                    <p className="text-sm text-coral font-medium">
                      {item.time}
                    </p>
                  )}
                </>
              )}

              {/* Actions */}
              {!isEditing && item.actions && item.actions.length > 0 && (
                <div className="flex gap-2">
                  {item.actions.map((action, idx) => (
                    <button
                      key={idx}
                      className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                        idx === 0
                          ? `${priorityConfig.badge} hover:opacity-90`
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {action}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Batch Actions for Routine Items */}
      {displayItems.filter(item => item.priority === 'routine').length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-200 flex gap-2">
          <button className="px-4 py-2 bg-[#1971C2] text-white text-sm font-medium rounded-lg hover:opacity-90">
            Approve All Non-Critical
          </button>
          <button className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200">
            Review Later (30m)
          </button>
        </div>
      )}
    </div>
  )
}

export default UrgentSection