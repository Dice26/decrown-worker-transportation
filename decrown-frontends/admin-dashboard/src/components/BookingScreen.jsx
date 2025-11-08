import React, { useState } from 'react'
import { MapPin, Navigation, Clock, Home, Briefcase } from 'lucide-react'
import { vehicleTypes, savedPlaces } from '../data/mock'

const BookingScreen = ({ onBook }) => {
    const [pickup, setPickup] = useState('')
    const [destination, setDestination] = useState('')
    const [selectedVehicle, setSelectedVehicle] = useState(null)
    const [showVehicles, setShowVehicles] = useState(false)

    const handleLocationInput = () => {
        setTimeout(() => {
            if (pickup.trim() && destination.trim()) {
                setShowVehicles(true)
            }
        }, 100)
    }

    const handleBookTransport = () => {
        if (!selectedVehicle) {
            alert('Please select a vehicle type')
            return
        }
        onBook()
    }

    const handleSavedPlace = (place) => {
        setDestination(place.address)
        handleLocationInput()
    }

    return (
        <div className="h-full flex">
            {/* Map Area - Mocked */}
            <div className="flex-1 relative bg-gray-800">
                <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center text-gray-500">
                        <MapPin className="w-16 h-16 mx-auto mb-4 opacity-50" />
                        <p className="text-lg">Map View</p>
                        <p className="text-sm mt-2">(Map integration placeholder)</p>
                    </div>
                </div>

                {/* Current Location Button */}
                <button className="absolute bottom-6 right-6 bg-white text-black p-4 rounded-full shadow-lg hover:bg-gray-100 transition-all duration-200">
                    <Navigation className="w-6 h-6" />
                </button>
            </div>

            {/* Booking Panel */}
            <div className="w-[480px] bg-gray-900 p-6 overflow-y-auto">
                <h2 className="text-2xl font-bold text-white mb-6">Book Transport</h2>

                {/* Location Inputs */}
                <div className="space-y-4 mb-6">
                    <div className="relative">
                        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gold" />
                        <input
                            type="text"
                            placeholder="Pickup location"
                            value={pickup}
                            onChange={(e) => {
                                setPickup(e.target.value)
                                handleLocationInput()
                            }}
                            className="w-full pl-12 pr-4 py-3 bg-gray-800 border border-gray-700 text-white placeholder:text-gray-500 rounded-lg focus:outline-none focus:border-gold"
                        />
                    </div>
                    <div className="relative">
                        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-orange" />
                        <input
                            type="text"
                            placeholder="Destination"
                            value={destination}
                            onChange={(e) => {
                                setDestination(e.target.value)
                                handleLocationInput()
                            }}
                            className="w-full pl-12 pr-4 py-3 bg-gray-800 border border-gray-700 text-white placeholder:text-gray-500 rounded-lg focus:outline-none focus:border-orange"
                        />
                    </div>
                </div>

                {/* Saved Places */}
                <div className="mb-6">
                    <h3 className="text-sm font-medium text-gray-400 mb-3">Saved Places</h3>
                    <div className="space-y-2">
                        {savedPlaces.slice(0, 2).map((place) => {
                            const Icon = place.icon === 'Home' ? Home : Briefcase
                            return (
                                <button
                                    key={place.id}
                                    onClick={() => handleSavedPlace(place)}
                                    className="w-full flex items-center gap-3 p-3 bg-gray-800 hover:bg-gray-750 rounded-lg transition-colors duration-200 text-left"
                                >
                                    <div className="w-10 h-10 bg-gray-700 rounded-full flex items-center justify-center">
                                        <Icon className="w-5 h-5 text-gold" />
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-white font-medium text-sm">{place.label}</p>
                                        <p className="text-gray-400 text-xs truncate">{place.address}</p>
                                    </div>
                                </button>
                            )
                        })}
                    </div>
                </div>

                {/* Vehicle Selection */}
                {showVehicles && (
                    <div className="space-y-4 animate-fade-in">
                        <h3 className="text-lg font-semibold text-white">Choose a vehicle</h3>
                        <div className="space-y-3">
                            {vehicleTypes.map((vehicle) => (
                                <div
                                    key={vehicle.id}
                                    onClick={() => setSelectedVehicle(vehicle)}
                                    className={`p-4 cursor-pointer rounded-lg transition-all duration-200 ${selectedVehicle?.id === vehicle.id
                                            ? 'bg-gold border-2 border-gold text-black'
                                            : 'bg-gray-800 border-2 border-gray-700 text-white hover:bg-gray-750'
                                        }`}
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-4">
                                            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${selectedVehicle?.id === vehicle.id ? 'bg-black/10' : 'bg-gray-700'
                                                }`}>
                                                <span className="text-2xl">🚗</span>
                                            </div>
                                            <div>
                                                <p className="font-semibold">{vehicle.name}</p>
                                                <p className={`text-sm ${selectedVehicle?.id === vehicle.id ? 'text-black/70' : 'text-gray-400'
                                                    }`}>
                                                    {vehicle.description} • {vehicle.capacity} seats
                                                </p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="font-bold text-lg">${vehicle.price}</p>
                                            <p className={`text-sm flex items-center gap-1 ${selectedVehicle?.id === vehicle.id ? 'text-black/70' : 'text-gray-400'
                                                }`}>
                                                <Clock className="w-3 h-3" />
                                                {vehicle.eta}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <button
                            onClick={handleBookTransport}
                            disabled={!selectedVehicle}
                            className="w-full h-12 bg-gold hover:bg-yellow-600 text-black font-semibold text-lg rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                        >
                            Book Transport
                        </button>
                    </div>
                )}
            </div>
        </div>
    )
}

export default BookingScreen
