import React, { useState } from 'react'
import { MapPin, DollarSign, Clock, Phone, Navigation, Home } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

const DriverApp = () => {
    const navigate = useNavigate()
    const [hasRequest, setHasRequest] = useState(true)
    const [isActive, setIsActive] = useState(false)

    const mockRequest = {
        id: 1,
        pickup: 'Worker Housing Complex A',
        destination: 'Construction Site - Downtown',
        payment: 45.00,
        distance: '8.2 km',
        pickupETA: '5 min'
    }

    const handleAccept = () => {
        setHasRequest(false)
        setIsActive(true)
    }

    const handleDecline = () => {
        setHasRequest(false)
    }

    const handleComplete = () => {
        setIsActive(false)
        setHasRequest(true)
    }

    return (
        <div className="min-h-screen bg-gray-900 flex flex-col">
            {/* Header */}
            <div className="bg-black p-4 flex items-center justify-between">
                <button onClick={() => navigate('/')} className="p-2">
                    <Home className="w-6 h-6 text-white" />
                </button>
                <h1 className="text-xl font-bold text-gold">Driver Dashboard</h1>
                <div className="flex items-center gap-2 bg-gray-800 px-3 py-1 rounded-full">
                    <DollarSign className="w-4 h-4 text-gold" />
                    <span className="text-white font-semibold">$245</span>
                </div>
            </div>

            {/* Map Area */}
            <div className="flex-1 relative bg-gray-800">
                <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center text-gray-500">
                        <MapPin className="w-16 h-16 mx-auto mb-4 opacity-50" />
                        <p className="text-lg">Driver Map View</p>
                        <p className="text-sm mt-2">
                            {isActive ? 'Navigate to destination' : 'Waiting for requests...'}
                        </p>
                    </div>
                </div>

                {/* Current Location Button */}
                <button className="absolute bottom-6 right-6 bg-gold text-black p-4 rounded-full shadow-lg">
                    <Navigation className="w-6 h-6" />
                </button>
            </div>

            {/* Request Card */}
            {hasRequest && !isActive && (
                <div className="bg-white rounded-t-3xl shadow-2xl p-6 animate-slide-up">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-xl font-bold">New Transport Request</h3>
                        <span className="text-3xl font-bold text-gold">
                            ${mockRequest.payment}
                        </span>
                    </div>

                    <div className="space-y-3 mb-6">
                        <div className="flex items-start gap-3">
                            <MapPin className="w-5 h-5 text-gold mt-1" />
                            <div className="flex-1">
                                <p className="text-gray-600 text-sm">Pickup</p>
                                <p className="font-semibold">{mockRequest.pickup}</p>
                                <p className="text-sm text-gray-500">{mockRequest.pickupETA} away</p>
                            </div>
                        </div>
                        <div className="flex items-start gap-3">
                            <MapPin className="w-5 h-5 text-orange mt-1" />
                            <div className="flex-1">
                                <p className="text-gray-600 text-sm">Destination</p>
                                <p className="font-semibold">{mockRequest.destination}</p>
                                <p className="text-sm text-gray-500">{mockRequest.distance} trip</p>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <button
                            onClick={handleDecline}
                            className="py-4 bg-gray-200 hover:bg-gray-300 text-black font-semibold rounded-xl transition-colors"
                        >
                            Decline
                        </button>
                        <button
                            onClick={handleAccept}
                            className="py-4 bg-gold hover:bg-yellow-600 text-black font-semibold rounded-xl transition-colors"
                        >
                            Accept
                        </button>
                    </div>
                </div>
            )}

            {/* Active Trip Card */}
            {isActive && (
                <div className="bg-black p-6">
                    <div className="bg-gray-900 rounded-2xl p-4 mb-4">
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <p className="text-gray-400 text-sm">Current Trip</p>
                                <p className="text-white font-semibold text-lg">To Construction Site</p>
                            </div>
                            <div className="text-right">
                                <p className="text-gold font-bold text-2xl">$45.00</p>
                                <p className="text-gray-400 text-sm">8.2 km</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-3 mb-4">
                            <Clock className="w-5 h-5 text-gold" />
                            <div>
                                <p className="text-gray-400 text-sm">ETA</p>
                                <p className="text-white font-semibold">12 minutes</p>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <button className="flex items-center justify-center gap-2 py-4 bg-gray-800 hover:bg-gray-700 text-white rounded-xl transition-colors">
                            <Phone className="w-5 h-5" />
                            <span>Call</span>
                        </button>
                        <button
                            onClick={handleComplete}
                            className="py-4 bg-gold hover:bg-yellow-600 text-black font-semibold rounded-xl transition-colors"
                        >
                            Complete Trip
                        </button>
                    </div>
                </div>
            )}

            {/* Bottom Navigation */}
            <div className="bg-black border-t border-gray-800 p-4 grid grid-cols-3 gap-2">
                <button className="flex flex-col items-center gap-1 py-2 text-gold">
                    <Home className="w-6 h-6" />
                    <span className="text-xs">Home</span>
                </button>
                <button className="flex flex-col items-center gap-1 py-2 text-gray-400">
                    <DollarSign className="w-6 h-6" />
                    <span className="text-xs">Earnings</span>
                </button>
                <button className="flex flex-col items-center gap-1 py-2 text-gray-400">
                    <Clock className="w-6 h-6" />
                    <span className="text-xs">History</span>
                </button>
            </div>
        </div>
    )
}

export default DriverApp
