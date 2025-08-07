import { useState, useEffect } from 'react'
import { MapPin, Bed, Bath, Square, DollarSign, Phone } from 'lucide-react'

function Properties() {
  const [properties, setProperties] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // For demo, use static data - in production, fetch from API
    setTimeout(() => {
      setProperties([
        {
          id: '1',
          address: '123 Main Street, Austin, TX 78701',
          price: 489000,
          beds: 3,
          baths: 2.5,
          sqft: 2200,
          type: 'house',
          status: 'active',
          description: 'Beautiful 3-bedroom home in downtown Austin. Features include a modern kitchen with granite countertops, hardwood floors throughout, and a spacious fenced backyard with a custom patio.',
          image: 'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=400&h=300&fit=crop'
        },
        {
          id: '2',
          address: '456 Oak Avenue, Austin, TX 78702',
          price: 325000,
          beds: 2,
          baths: 2,
          sqft: 1500,
          type: 'condo',
          status: 'active',
          description: 'Modern condo with city views. Open floor plan, stainless steel appliances, in-unit washer/dryer.',
          image: 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=400&h=300&fit=crop'
        },
        {
          id: '3',
          address: '789 Pine Lane, Austin, TX 78703',
          price: 750000,
          beds: 4,
          baths: 3,
          sqft: 3200,
          type: 'house',
          status: 'active',
          description: 'Luxury home in prestigious neighborhood. Gourmet kitchen, home office, media room, and three-car garage.',
          image: 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=400&h=300&fit=crop'
        }
      ])
      setLoading(false)
    }, 1000)
  }, [])

  const formatPrice = (price) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(price)
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800'
      case 'pending':
        return 'bg-yellow-100 text-yellow-800'
      case 'sold':
        return 'bg-gray-100 text-gray-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-coral mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading properties...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-navy mb-2">Property Listings</h1>
        <p className="text-gray-600">Manage your active property listings</p>
      </div>

      {/* Property Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {properties.map((property) => (
          <div key={property.id} className="bg-white rounded-xl shadow-sm overflow-hidden hover:shadow-lg transition">
            {/* Property Image */}
            <div className="relative h-48">
              <img 
                src={property.image} 
                alt={property.address}
                className="w-full h-full object-cover"
              />
              <span className={`absolute top-4 right-4 px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(property.status)}`}>
                {property.status.charAt(0).toUpperCase() + property.status.slice(1)}
              </span>
            </div>

            {/* Property Details */}
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-2xl font-bold text-coral">
                  {formatPrice(property.price)}
                </h3>
              </div>

              <div className="flex items-center text-gray-600 mb-3">
                <MapPin className="h-4 w-4 mr-2" />
                <span className="text-sm">{property.address}</span>
              </div>

              <div className="flex items-center gap-4 mb-4">
                <div className="flex items-center">
                  <Bed className="h-4 w-4 mr-1 text-gray-400" />
                  <span className="text-sm text-gray-600">{property.beds} beds</span>
                </div>
                <div className="flex items-center">
                  <Bath className="h-4 w-4 mr-1 text-gray-400" />
                  <span className="text-sm text-gray-600">{property.baths} baths</span>
                </div>
                <div className="flex items-center">
                  <Square className="h-4 w-4 mr-1 text-gray-400" />
                  <span className="text-sm text-gray-600">{property.sqft.toLocaleString()} sqft</span>
                </div>
              </div>

              <p className="text-sm text-gray-600 mb-4 line-clamp-2">
                {property.description}
              </p>

              <div className="flex gap-2">
                <button className="flex-1 bg-coral text-white py-2 px-4 rounded-lg hover:bg-coral-dark transition text-sm font-medium">
                  View Details
                </button>
                <button className="bg-gray-100 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-200 transition">
                  <Phone className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Add Property Button */}
      <div className="mt-8 text-center">
        <button className="bg-navy text-white py-3 px-6 rounded-lg hover:bg-navy-dark transition font-medium">
          + Add New Property
        </button>
      </div>
    </div>
  )
}

export default Properties