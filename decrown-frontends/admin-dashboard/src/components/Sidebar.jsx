import React from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Home, History, User, LogOut } from 'lucide-react'

const Sidebar = () => {
    const navigate = useNavigate()
    const location = useLocation()

    const menuItems = [
        { icon: Home, label: 'Book Transport', path: '/app' },
        { icon: History, label: 'History', path: '/app/history' },
        { icon: User, label: 'Profile', path: '/app/profile' },
    ]

    const isActive = (path) => location.pathname === path

    const handleLogout = () => {
        localStorage.removeItem('decrown_country')
        localStorage.removeItem('decrown_language')
        window.location.reload()
    }

    return (
        <div className="w-64 bg-black text-white flex flex-col">
            {/* Logo */}
            <div className="p-6 border-b border-gray-800">
                <h1 className="text-3xl font-bold">
                    👑 De<span className="text-gold">Crown</span> 📍
                </h1>
            </div>

            {/* Menu Items */}
            <nav className="flex-1 p-4">
                <div className="space-y-2">
                    {menuItems.map((item) => {
                        const Icon = item.icon
                        return (
                            <button
                                key={item.path}
                                onClick={() => navigate(item.path)}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 ${isActive(item.path)
                                        ? 'bg-gold text-black font-medium'
                                        : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                                    }`}
                            >
                                <Icon className="w-5 h-5" />
                                <span>{item.label}</span>
                            </button>
                        )
                    })}
                </div>
            </nav>

            {/* Logout */}
            <div className="p-4 border-t border-gray-800">
                <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-gray-300 hover:bg-gray-800 hover:text-white transition-all duration-200"
                >
                    <LogOut className="w-5 h-5" />
                    <span>Logout</span>
                </button>
            </div>
        </div>
    )
}

export default Sidebar
