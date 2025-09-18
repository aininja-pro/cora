import { Link, useLocation } from 'react-router-dom'
import { Home, Building, Phone, LogOut, Menu, X } from 'lucide-react'
import { useState } from 'react'
import logo from '../assets/logo.svg'

function Layout({ children, onLogout }) {
  const location = useLocation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  
  const navigation = [
    { name: 'Dashboard', href: '/dashboard', icon: Home },
    { name: 'Properties', href: '/properties', icon: Building },
    { name: 'Calls', href: '/calls', icon: Phone },
  ]

  return (
    <div className="min-h-screen bg-cream">
      {/* Mobile Header */}
      <div className="lg:hidden bg-white shadow-sm">
        <div className="flex items-center justify-between px-4 py-3">
          <img src={logo} alt="CORA" className="h-10" />
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="text-navy"
          >
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
        
        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="border-t border-gray-200">
            {navigation.map((item) => {
              const Icon = item.icon
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center px-4 py-3 text-sm font-medium ${
                    location.pathname === item.href
                      ? 'bg-coral text-white'
                      : 'text-navy hover:bg-gray-50'
                  }`}
                >
                  <Icon className="mr-3 h-5 w-5" />
                  {item.name}
                </Link>
              )
            })}
            <button
              onClick={onLogout}
              className="flex items-center w-full px-4 py-3 text-sm font-medium text-red-600 hover:bg-gray-50"
            >
              <LogOut className="mr-3 h-5 w-5" />
              Logout
            </button>
          </div>
        )}
      </div>

      {/* Desktop Sidebar */}
      <div className="hidden lg:flex">
        <div className="w-64 bg-white shadow-lg min-h-screen">
          <div className="p-6">
            <img src={logo} alt="CORA" className="h-12 mb-8" />
            <nav className="space-y-2">
              {navigation.map((item) => {
                const Icon = item.icon
                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    className={`flex items-center px-4 py-3 text-sm font-medium rounded-lg ${
                      location.pathname === item.href
                        ? 'bg-coral text-white'
                        : 'text-navy hover:bg-gray-50'
                    }`}
                  >
                    <Icon className="mr-3 h-5 w-5" />
                    {item.name}
                  </Link>
                )
              })}
            </nav>
            <div className="absolute bottom-6 left-6 right-6">
              <button
                onClick={onLogout}
                className="flex items-center w-full px-4 py-3 text-sm font-medium text-red-600 hover:bg-gray-50 rounded-lg"
              >
                <LogOut className="mr-3 h-5 w-5" />
                Logout
              </button>
            </div>
          </div>
        </div>
        
        {/* Desktop Content */}
        <div className="flex-1">
          {children}
        </div>
      </div>

      {/* Mobile Content */}
      <div className="lg:hidden">
        {children}
      </div>
    </div>
  )
}

export default Layout