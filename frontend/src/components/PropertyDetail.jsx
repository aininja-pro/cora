import { useState, useEffect } from 'react'
import { X, ChevronLeft, ChevronRight, User, Building2, Mic, Plus, Phone, Mail, Briefcase, AlertCircle } from 'lucide-react'
import { createClient } from '@supabase/supabase-js'
import PropertyVoiceAssistant from './PropertyVoiceAssistant'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

function PropertyDetail({ property, onClose }) {
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0)
  const [contacts, setContacts] = useState([])
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [showVoiceAssistant, setShowVoiceAssistant] = useState(false)

  useEffect(() => {
    fetchPropertyData()
  }, [property.id])

  const fetchPropertyData = async () => {
    try {
      setLoading(true)

      // Fetch contacts
      const { data: contactsData } = await supabase
        .from('property_contacts')
        .select('*')
        .eq('property_id', property.id)
        .order('created_at', { ascending: false })

      // Fetch tasks
      const { data: tasksData } = await supabase
        .from('tasks')
        .select('*')
        .eq('property_id', property.id)
        .order('created_at', { ascending: false })

      setContacts(contactsData || [])
      setTasks(tasksData || [])
    } catch (error) {
      console.error('Error fetching property data:', error)
    } finally {
      setLoading(false)
    }
  }

  const photos = property.photos && property.photos.length > 0
    ? property.photos
    : ['https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=800&h=600&fit=crop']

  const nextPhoto = () => {
    setCurrentPhotoIndex((prev) => (prev + 1) % photos.length)
  }

  const prevPhoto = () => {
    setCurrentPhotoIndex((prev) => (prev - 1 + photos.length) % photos.length)
  }

  const formatPrice = (price) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(price)
  }

  const getContactIcon = (type) => {
    switch (type) {
      case 'buyer': return <User className="h-4 w-4" />
      case 'title_company': return <Building2 className="h-4 w-4" />
      case 'inspector': return <AlertCircle className="h-4 w-4" />
      case 'lender': return <Briefcase className="h-4 w-4" />
      default: return <User className="h-4 w-4" />
    }
  }

  const getContactTypeLabel = (type) => {
    return type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())
  }

  const getContactColor = (type) => {
    switch (type) {
      case 'buyer': return 'bg-blue-100 text-blue-700'
      case 'title_company': return 'bg-purple-100 text-purple-700'
      case 'inspector': return 'bg-orange-100 text-orange-700'
      case 'lender': return 'bg-green-100 text-green-700'
      default: return 'bg-gray-100 text-gray-700'
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-6xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 p-4 flex justify-between items-center z-10">
          <h2 className="text-2xl font-bold text-navy">Property Details</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="p-6">
          {/* Photo Carousel */}
          <div className="relative mb-6 rounded-xl overflow-hidden bg-gray-100">
            <img
              src={photos[currentPhotoIndex]}
              alt={`Property ${currentPhotoIndex + 1}`}
              className="w-full h-96 object-cover"
            />

            {photos.length > 1 && (
              <>
                <button
                  onClick={prevPhoto}
                  className="absolute left-4 top-1/2 -translate-y-1/2 bg-white bg-opacity-80 hover:bg-opacity-100 p-2 rounded-full shadow-lg transition"
                >
                  <ChevronLeft className="h-6 w-6" />
                </button>
                <button
                  onClick={nextPhoto}
                  className="absolute right-4 top-1/2 -translate-y-1/2 bg-white bg-opacity-80 hover:bg-opacity-100 p-2 rounded-full shadow-lg transition"
                >
                  <ChevronRight className="h-6 w-6" />
                </button>
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black bg-opacity-50 text-white px-3 py-1 rounded-full text-sm">
                  {currentPhotoIndex + 1} / {photos.length}
                </div>
              </>
            )}
          </div>

          {/* Property Info */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <div>
              <h3 className="text-3xl font-bold text-coral mb-2">{formatPrice(property.price)}</h3>
              <p className="text-gray-600 mb-4">{property.address}</p>
              <div className="flex gap-6 mb-4">
                <span className="text-sm text-gray-600">{property.beds} beds</span>
                <span className="text-sm text-gray-600">{property.baths} baths</span>
                <span className="text-sm text-gray-600">{property.sqft?.toLocaleString()} sqft</span>
              </div>
              <p className="text-gray-700">{property.description}</p>
            </div>

            {/* Voice Assistant */}
            <div>
              {showVoiceAssistant ? (
                <PropertyVoiceAssistant
                  propertyId={property.id}
                  propertyAddress={property.address}
                  onContactAdded={fetchPropertyData}
                  onTaskAdded={fetchPropertyData}
                />
              ) : (
                <div className="bg-blue-50 rounded-xl p-6 border border-blue-200">
                  <div className="flex items-center gap-2 mb-3">
                    <Mic className="h-5 w-5 text-blue-600" />
                    <h4 className="text-lg font-bold text-navy">Voice Commands</h4>
                  </div>
                  <p className="text-sm text-gray-600 mb-4">
                    Add contacts, tasks, and notes to this property using your voice.
                  </p>
                  <button
                    onClick={() => setShowVoiceAssistant(true)}
                    className="w-full bg-coral text-white py-3 px-6 rounded-lg hover:bg-coral-dark transition font-medium flex items-center justify-center gap-2"
                  >
                    <Mic className="h-5 w-5" />
                    Open Voice Assistant
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* People Section */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-navy">People</h3>
              <button className="text-sm text-coral hover:underline flex items-center gap-1">
                <Plus className="h-4 w-4" />
                Add Contact
              </button>
            </div>

            {loading ? (
              <div className="text-center py-8 text-gray-500">Loading contacts...</div>
            ) : contacts.length === 0 ? (
              <div className="text-center py-8 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                <User className="h-12 w-12 text-gray-400 mx-auto mb-2" />
                <p className="text-gray-600">No contacts yet</p>
                <p className="text-sm text-gray-500">Use voice commands to add buyers, inspectors, and more</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {contacts.map((contact) => (
                  <div key={contact.id} className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className={`p-2 rounded-full ${getContactColor(contact.contact_type)}`}>
                          {getContactIcon(contact.contact_type)}
                        </span>
                        <div>
                          <p className="font-bold text-navy">{contact.name}</p>
                          <p className="text-xs text-gray-500">{getContactTypeLabel(contact.contact_type)}</p>
                        </div>
                      </div>
                      {contact.status && (
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">
                          {contact.status}
                        </span>
                      )}
                    </div>
                    {contact.phone && (
                      <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
                        <Phone className="h-3 w-3" />
                        <a href={`tel:${contact.phone}`} className="hover:text-coral">{contact.phone}</a>
                      </div>
                    )}
                    {contact.email && (
                      <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
                        <Mail className="h-3 w-3" />
                        <a href={`mailto:${contact.email}`} className="hover:text-coral">{contact.email}</a>
                      </div>
                    )}
                    {contact.company && (
                      <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
                        <Building2 className="h-3 w-3" />
                        <span>{contact.company}</span>
                      </div>
                    )}
                    {contact.notes && (
                      <p className="text-sm text-gray-600 mt-2 italic">"{contact.notes}"</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Tasks Section */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-navy">Tasks & Notes</h3>
              <button className="text-sm text-coral hover:underline flex items-center gap-1">
                <Plus className="h-4 w-4" />
                Add Task
              </button>
            </div>

            {loading ? (
              <div className="text-center py-8 text-gray-500">Loading tasks...</div>
            ) : tasks.length === 0 ? (
              <div className="text-center py-8 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-2" />
                <p className="text-gray-600">No tasks yet</p>
                <p className="text-sm text-gray-500">Use voice commands to add tasks for this property</p>
              </div>
            ) : (
              <div className="space-y-3">
                {tasks.map((task) => (
                  <div key={task.id} className="bg-white border border-gray-200 rounded-lg p-4">
                    <p className="font-medium text-navy">{task.title || task.transcript}</p>
                    {task.description && <p className="text-sm text-gray-600 mt-1">{task.description}</p>}
                    <div className="flex items-center gap-2 mt-2">
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        task.status === 'completed' ? 'bg-green-100 text-green-700' :
                        task.status === 'in_progress' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {task.status || 'pending'}
                      </span>
                      <span className="text-xs text-gray-500">
                        {new Date(task.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default PropertyDetail
