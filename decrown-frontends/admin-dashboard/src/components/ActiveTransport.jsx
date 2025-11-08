import React from 'react'
import { MapPin, Phone, Share2, X, Star } from 'lucide-react'
import { currentTransport } from '../data/mock'

const ActiveTransport = ({ onComplete }) => {
    return (
        <div className="h-full flex flex-col bg-gray-900">
            {/* Map with route */}
            <div className="flex-1 relative bg-gray-800">
                <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center text-gray-500">
                        <MapPin className="w-16 h-16 mx-auto mb-4 opacity-50" />
                        <p className="text-lg">Live Tracking Map</p>
                        <p className="text-sm mt-2">(Real-time location tracking)</p>
                    </div>
                </div>
            </div>

            {/* Transport Info Panel */}
            <div className="bg-black p-6">
                <div className="flex items-center gap-4 mb-6">
                    <img
                        src={currentTransport.driver.photo}
                        alt={currentTransport.driver.name}
                        className="w-16 h-16 rounded-full"
                    />
                    <div className="flex-1">
                        <h3 className="text-white font-semibold text-lg">
                            {currentTransport.driver.name}
                        </h3>
                        <div className="flex items-center gap-2 text-gray-400">
                            <Star className="w-4 h-4 text-gold fill-gold" />
                            <span>{currentTransport.driver.rating}</span>
                        </div>
                    </div>
                    <button className="p-3 bg-gray-800 hover:bg-gray-700 rounded-full transition-colors">
                        <Phone className="w-5 h-5 text-white" />
                    </button>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="bg-gray-900 p-4 rounded-lg">
                        <p className="text-gray-400 text-sm mb-1">Vehicle</p>
                        <p className="text-white font-semibold">
                            {currentTransport.vehicle.make} {currentTransport.vehicle.model}
                        </p>
                        <p className="text-gray-400 text-sm">{currentTransport.vehicle.plate}</p>
                    </div>
                    <div className="bg-gray-900 p-4 rounded-lg">
                        <p className="text-gray-400 text-sm mb-1">ETA</p>
                        <p className="text-white font-semibold text-xl">{currentTransport.eta}</p>
                        <p className="text-gray-400 text-sm">{currentTransport.distance}</p>
                    </div>
                </div>

                <div className="bg-gray-900 p-4 rounded-lg mb-6">
                    <div className="flex items-start gap-3 mb-3">
                        <MapPin className="w-5 h-5 text-gold mt-1" />
                        <div>
                            <p className="text-gray-400 text-sm">Pickup</p>
                            <p className="text-white">{currentTransport.pickup}</p>
                        </div>
                    </div>
                    <div className="flex items-start gap-3">
                        <MapPin className="w-5 h-5 text-orange mt-1" />
                        <div>
                            <p className="text-gray-400 text-sm">Destination</p>
                            <p className="text-white">{currentTransport.destination}</p>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                    <button className="flex items-center justify-center gap-2 px-4 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-colors">
                        <Share2 className="w-4 h-4" />
                        <span>Share</span>
                    </button>
                    <button
                        onClick={onComplete}
                        className="col-span-2 px-4 py-3 bg-gold hover:bg-yellow-600 text-black font-semibold rounded-lg transition-colors"
                    >
                        Complete Transport
                    </button>
                </div>
            </div>
        </div>
    )
}

export default ActiveTransport
