import React, { useState } from 'react'
import { MapPin, Phone, Clock, Star, Home, Calendar, History } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

const WorkerApp = () => {
    const navigate = useNavigate()
    const [isTracking, setIsTracking] = useState(false)

    const upcomingRide = {
        id: 1,
        pickupTime: '06:30 AM',
        pickupLocation: 'Worker Housing Complex A',
        destination: 'Construction Site - Downtown',
        driver: {
            name: 'John Smith',
            rating: 4.9,
            photo: 'https://i.pravatar.cc/150?img=12'
        },
        vehicle: {
            make: 'Ford',
            model: 'Transit',
            color: 'White',
            plate: 'ABC 1234'
        },
        eta: '5 min'
    }

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col">
            {/* Header */}
            <div className="bg-gradient-to-r from-deep-blue to-blue-900 p-6 text-white">
                <div className="flex items-center justify-between mb-4">
                    <button onClick={() => navigate('/')} className="p-2">
                        <Home className="w-6 h-6" />
                    </button>
                    <h1 className="text-xl font-bold">Worker Dashboard</h1>
                    <div className="w-10"></div>
                </div>
                <div>
                    <p className="text-white/80 text-sm">Good morning,</p>
                    <h2 className="text-2xl font-bold">Alex Thompson</h2>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 p-4 space-y-4 overflow-y-auto">
                {/* Next Ride Card */}
                <div className="bg-white rounded-2xl shadow-lg p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-bold text-gray-900">Your Next Ride</h3>
                        <span className="bg-green-100 text-green-700 text-xs font-semibold px-3 py-1 rounded-full">
                            Confirmed
                        </span>
                    </div>

                    <div className="space-y-4">
                        <div className="flex items-start gap-3">
                            <Clock className="w-5 h-5 text-orange mt-1" />
                            <div>
                                <p className="text-gray-600 text-sm">Pickup Time</p>
                                <p className="font-semibold text-lg">{upcomingRide.pickupTime}</p>
                            </div>
                        </div>

                        <div className="flex items-start gap-3">
                            <MapPin className="w-5 h-5 text-orange mt-1" />
                            <div>
                                <p className="text-gray-600 text-sm">Pickup Location</p>
                                <p className="font-semibold">{upcomingRide.pickupLocation}</p>
                            </div>
                        </div>

                        <div className="border-t pt-4">
                            <div className="flex items-center gap-4 mb-4">
                                <img
                                    src={upcomingRide.driver.photo}
                                    alt={upcomingRide.driver.name}
                                    className="w-12 h-12 rounded-full"
                                />
                                <div className="flex-1">
                                    <p className="font-semibold">{upcomingRide.driver.name}</p>
                                    <div className="flex items-center gap-1 text-sm text-gray-600">
                                        <Star className="w-4 h-4 text-gold fill-gold" />
                                        <span>{upcomingRide.driver.rating}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-gray-50 rounded-lg p-3">
                                <p className="text-gray-600 text-sm mb-1">Vehicle</p>
                                <p className="font-semibold">
                                    {upcomingRide.vehicle.color} {upcomingRide.vehicle.make} {upcomingRide.vehicle.model}
                                </p>
                                <p className="text-gray-600 text-sm">{upcomingRide.vehicle.plate}</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3 pt-4">
                            <button className="flex items-center justify-center gap-2 py-3 bg-gray-100 hover:bg-gray-200 text-gray-900 font-semibold rounded-xl transition-colors">
                                <Phone className="w-5 h-5" />
                                <span>Call Driver</span>
                            </button>
                            <button
                                onClick={() => setIsTracking(!isTracking)}
                                className="flex items-center justify-center gap-2 py-3 bg-orange hover:bg-orange-600 text-white font-semibold rounded-xl transition-colors"
                            >
                                <MapPin className="w-5 h-5" />
                                <span>Track</span>
                            </button>
                        </div>
                    </div>
                </div>

                {/* Tracking Card */}
                {isTracking && (
                    <div className="bg-white rounded-2xl shadow-lg p-6 animate-fade-in">
                        <h3 className="text-lg font-bold text-gray-900 mb-4">Live Tracking</h3>
                        <div className="bg-gray-100 rounded-xl p-8 mb-4">
                            <div className="text-center text-gray-500">
                                <MapPin className="w-12 h-12 mx-auto mb-2 opacity-50" />
                                <p>Driver location map</p>
                                <p className="text-sm mt-1">Real-time tracking</p>
                            </div>
                        </div>
                        <div className="flex items-center justify-between bg-orange/10 rounded-lg p-4">
                            <div>
                                <p className="text-gray-600 text-sm">Driver ETA</p>
                                <p className="text-2xl font-bold text-orange">{upcomingRide.eta}</p>
                            </div>
                            <div className="text-right">
                                <p className="text-gray-600 text-sm">Distance</p>
                                <p className="font-semibold">2.3 km away</p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Upcoming Rides */}
                <div className="bg-white rounded-2xl shadow-lg p-6">
                    <h3 className="text-lg font-bold text-gray-900 mb-4">Upcoming Rides</h3>
                    <div className="space-y-3">
                        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                            <div>
                                <p className="font-semibold">Tomorrow, 06:30 AM</p>
                                <p className="text-sm text-gray-600">To Construction Site</p>
                            </div>
                            <span className="text-orange font-semibold">→</span>
                        </div>
                        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                            <div>
                                <p className="font-semibold">Friday, 06:30 AM</p>
                                <p className="text-sm text-gray-600">To Construction Site</p>
                            </div>
                            <span className="text-orange font-semibold">→</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Bottom Navigation */}
            <div className="bg-white border-t border-gray-200 p-4 grid grid-cols-3 gap-2">
                <button className="flex flex-col items-center gap-1 py-2 text-orange">
                    <Home className="w-6 h-6" />
                    <span className="text-xs font-medium">Home</span>
                </button>
                <button className="flex flex-col items-center gap-1 py-2 text-gray-400">
                    <Calendar className="w-6 h-6" />
                    <span className="text-xs">Schedule</span>
                </button>
                <button className="flex flex-col items-center gap-1 py-2 text-gray-400">
                    <History className="w-6 h-6" />
                    <span className="text-xs">History</span>
                </button>
            </div>
        </div>
    )
}

export default WorkerApp
