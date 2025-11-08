import React from 'react'
import { useNavigate } from 'react-router-dom'
import { Car, User } from 'lucide-react'

const RoleSelector = () => {
    const navigate = useNavigate()

    return (
        <div className="min-h-screen bg-gradient-to-br from-deep-blue to-blue-900 flex flex-col items-center justify-center p-6">
            <div className="text-center mb-12">
                <h1 className="text-5xl font-bold text-white mb-4">
                    👑 DeCrown 📍
                </h1>
                <p className="text-xl text-white/80">Worker Transportation</p>
            </div>

            <div className="w-full max-w-md space-y-4">
                <button
                    onClick={() => navigate('/driver')}
                    className="w-full bg-gold hover:bg-yellow-600 text-black font-semibold py-6 px-8 rounded-2xl shadow-2xl transition-all duration-200 transform hover:scale-105 flex items-center justify-center gap-4"
                >
                    <Car className="w-8 h-8" />
                    <span className="text-2xl">Driver App</span>
                </button>

                <button
                    onClick={() => navigate('/worker')}
                    className="w-full bg-orange hover:bg-orange-600 text-white font-semibold py-6 px-8 rounded-2xl shadow-2xl transition-all duration-200 transform hover:scale-105 flex items-center justify-center gap-4"
                >
                    <User className="w-8 h-8" />
                    <span className="text-2xl">Worker App</span>
                </button>
            </div>

            <p className="text-white/60 text-sm mt-12">
                Select your role to continue
            </p>
        </div>
    )
}

export default RoleSelector
