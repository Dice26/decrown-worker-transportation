import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, MapPin, Navigation, Clock, DollarSign, ArrowRight, Search, AlertCircle } from 'lucide-react'
import useGoogleMaps from '../hooks/useGoogleMaps'

const BookRide = () => {
    const navigate = useNavigate()
    const mapRef = useRef(null)
    const { loaded: mapsLoaded, error: mapsError } = useGoogleMaps()
    const [map, setMap] = useState(null)
    const [pickupMarker, setPickupMarker] = useState(null)
    const [destinationMarker, setDestinationMarker] = useState(null)
    const [currentLocation, setCurrentLocation] = useState(null)
    const [pickupLocation, setPickupLocation] = useState(null)
    const [pickupAddress, setPickupAddress] = useState('')
    const [destination, setDestination] = useState('')
    const [destinationCoords, setDestinationCoords] = useState(null)
    const [rideDetails, setRideDetails] = useState(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [searchResults, setSearchResults] = useState([])

    // Initialize map when Google Maps is loaded
    useEffect(() => {
        if (mapsLoaded && window.google && mapRef.current && !map) {
            initializeMap()
        }
    }, [mapsLoaded, map])

    // Get current location on mount
    useEffect(() => {
        getCurrentLocation()
    }, [])

    const getCurrentLocation = () => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const location = {
                        lat: position.coords.latitude,
                        lng: position.coords.longitude
                    }
                    setCurrentLocation(location)
                    setPickupLocation(location)
                    reverseGeocode(location, 'pickup')
                },
                (error) => {
                    console.error('Error getting location:', error)
                    // Default to a sample location
                    const defaultLocation = { lat: 40.7128, lng: -74.0060 }
                    setCurrentLocation(defaultLocation)
                    setPickupLocation(defaultLocation)
                    setPickupAddress('New York, NY, USA')
                }
            )
        }
    }

    const initializeMap = () => {
        const mapInstance = new window.google.maps.Map(mapRef.current, {
            center: currentLocation || { lat: 40.7128, lng: -74.0060 },
            zoom: 15,
            disableDefaultUI: true,
            zoomControl: true,
            styles: [
                {
                    featureType: 'poi',
                    elementType: 'labels',
                    stylers: [{ visibility: 'off' }]
                }
            ]
        })

        setMap(mapInstance)

        // Add click listener to map
        mapInstance.addListener('click', (event) => {
            const location = {
                lat: event.latLng.lat(),
                lng: event.latLng.lng()
            }
            setPickupLocation(location)
            updatePickupMarker(mapInstance, location)
            reverseGeocode(location, 'pickup')
        })

        // Add initial marker if we have current location
        if (currentLocation) {
            updatePickupMarker(mapInstance, currentLocation)
        }
    }

    const updatePickupMarker = (mapInstance, location) => {
        // Remove existing marker
        if (pickupMarker) {
            pickupMarker.setMap(null)
        }

        // Add new marker
        const marker = new window.google.maps.Marker({
            position: location,
            map: mapInstance,
            title: 'Pickup Location',
            icon: {
                path: window.google.maps.SymbolPath.CIRCLE,
                scale: 10,
                fillColor: '#FF6600',
                fillOpacity: 1,
                strokeColor: '#FFFFFF',
                strokeWeight: 3
            },
            draggable: true
        })

        marker.addListener('dragend', (event) => {
            const location = {
                lat: event.latLng.lat(),
                lng: event.latLng.lng()
            }
            setPickupLocation(location)
            reverseGeocode(location, 'pickup')
        })

        setPickupMarker(marker)
        mapInstance.panTo(location)
    }

    const updateDestinationMarker = (mapInstance, location) => {
        // Remove existing marker
        if (destinationMarker) {
            destinationMarker.setMap(null)
        }

        // Add new marker
        const marker = new window.google.maps.Marker({
            position: location,
            map: mapInstance,
            title: 'Destination',
            icon: {
                path: window.google.maps.SymbolPath.CIRCLE,
                scale: 10,
                fillColor: '#1E3A8A',
                fillOpacity: 1,
                strokeColor: '#FFFFFF',
                strokeWeight: 3
            }
        })

        setDestinationMarker(marker)

        // Fit bounds to show both markers
        if (pickupLocation) {
            const bounds = new window.google.maps.LatLngBounds()
            bounds.extend(pickupLocation)
            bounds.extend(location)
            mapInstance.fitBounds(bounds)
        }
    }

    const reverseGeocode = async (location, type) => {
        if (!window.google) return

        const geocoder = new window.google.maps.Geocoder()
        try {
            const response = await geocoder.geocode({ location })
            if (response.results[0]) {
                const address = response.results[0].formatted_address
                if (type === 'pickup') {
                    setPickupAddress(address)
                }
            }
        } catch (error) {
            console.error('Reverse geocoding failed:', error)
        }
    }

    const handleDestinationSearch = async (value) => {
        setDestination(value)

        if (value.length > 2 && window.google) {
            const service = new window.google.maps.places.AutocompleteService()
            try {
                const response = await service.getPlacePredictions({
                    input: value,
                    location: pickupLocation,
                    radius: 50000
                })
                setSearchResults(response.predictions || [])
            } catch (error) {
                console.error('Autocomplete failed:', error)
                setSearchResults([])
            }
        } else {
            setSearchResults([])
        }
    }

    const selectDestination = async (placeId, description) => {
        setDestination(description)
        setSearchResults([])

        if (!window.google) return

        const geocoder = new window.google.maps.Geocoder()
        try {
            const response = await geocoder.geocode({ placeId })
            if (response.results[0]) {
                const location = response.results[0].geometry.location
                const coords = {
                    lat: location.lat(),
                    lng: location.lng(),
                    address: description
                }
                setDestinationCoords(coords)

                if (map) {
                    updateDestinationMarker(map, coords)
                }

                calculateRideDetails(pickupLocation, coords)
            }
        } catch (error) {
            console.error('Geocoding failed:', error)
        }
    }

    const calculateRideDetails = async (pickup, destination) => {
        if (!pickup || !destination || !window.google) return

        const service = new window.google.maps.DistanceMatrixService()
        try {
            const response = await service.getDistanceMatrix({
                origins: [pickup],
                destinations: [destination],
                travelMode: window.google.maps.TravelMode.DRIVING,
                unitSystem: window.google.maps.UnitSystem.METRIC
            })

            const result = response.rows[0].elements[0]
            if (result.status === 'OK') {
                const distance = result.distance.text
                const duration = result.duration.text
                const estimatedFare = calculateFare(result.distance.value)

                setRideDetails({
                    distance,
                    duration,
                    estimatedFare
                })
            }
        } catch (error) {
            console.error('Distance calculation failed:', error)
        }
    }

    const calculateFare = (distanceInMeters) => {
        const baseFare = 5.00
        const perKmRate = 2.50
        const distanceInKm = distanceInMeters / 1000
        return (baseFare + (distanceInKm * perKmRate)).toFixed(2)
    }

    const handleUseCurrentLocation = () => {
        if (currentLocation) {
            setPickupLocation(currentLocation)
            if (map) {
                updatePickupMarker(map, currentLocation)
            }
            reverseGeocode(currentLocation, 'pickup')
        } else {
            getCurrentLocation()
        }
    }

    const handleBookRide = async () => {
        if (!pickupLocation || !destinationCoords) {
            setError('Please select both pickup and destination locations')
            return
        }

        setLoading(true)
        try {
            // Simulate API call
            await new Promise(resolve => setTimeout(resolve, 2000))

            // Store ride details
            const rideData = {
                pickup: { ...pickupLocation, address: pickupAddress },
                destination: destinationCoords,
                ...rideDetails,
                bookedAt: new Date().toISOString()
            }

            localStorage.setItem('pendingRide', JSON.stringify(rideData))

            // Navigate back to worker app
            navigate('/worker', {
                state: {
                    message: 'Ride booked successfully! Looking for nearby drivers...',
                    rideData
                }
            })
        } catch (error) {
            setError('Failed to book ride. Please try again.')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col">
            {/* Header */}
            <div className="bg-deep-blue p-4 flex items-center shadow-lg">
                <button onClick={() => navigate(-1)} className="p-2 text-white">
                    <ArrowLeft className="w-6 h-6" />
                </button>
                <h1 className="flex-1 text-center text-xl font-bold text-white pr-10">
                    Book a Ride
                </h1>
            </div>

            {/* Map Container */}
            <div className="relative flex-1">
                {/* Loading State */}
                {!mapsLoaded && !mapsError && (
                    <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
                        <div className="text-center">
                            <div className="w-12 h-12 border-4 border-orange border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                            <p className="text-gray-600">Loading map...</p>
                        </div>
                    </div>
                )}

                {/* Error State */}
                {mapsError && (
                    <div className="absolute inset-0 flex items-center justify-center bg-gray-100 p-6">
                        <div className="text-center max-w-md">
                            <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
                            <h3 className="text-lg font-bold text-gray-900 mb-2">Map Loading Failed</h3>
                            <p className="text-gray-600 mb-4">{mapsError}</p>
                            <p className="text-sm text-gray-500">
                                Please check your internet connection or contact support.
                            </p>
                        </div>
                    </div>
                )}

                <div ref={mapRef} className="w-full h-full" />

                {/* Current Location Button */}
                <button
                    onClick={handleUseCurrentLocation}
                    className="absolute bottom-4 right-4 bg-white p-3 rounded-full shadow-lg hover:bg-gray-50"
                >
                    <Navigation className="w-6 h-6 text-deep-blue" />
                </button>
            </div>

            {/* Location Inputs Panel */}
            <div className="bg-white rounded-t-3xl shadow-2xl p-6 space-y-4">
                {/* Pickup Location */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Pickup Location
                    </label>
                    <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-xl border border-gray-200">
                        <MapPin className="w-5 h-5 text-orange" />
                        <input
                            type="text"
                            value={pickupAddress}
                            readOnly
                            placeholder="Tap on map to select pickup"
                            className="flex-1 bg-transparent outline-none text-gray-900"
                        />
                    </div>
                    <button
                        onClick={handleUseCurrentLocation}
                        className="mt-2 text-sm text-orange font-medium flex items-center gap-1"
                    >
                        <Navigation className="w-4 h-4" />
                        Use current location
                    </button>
                </div>

                {/* Destination */}
                <div className="relative">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Destination
                    </label>
                    <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-xl border border-gray-200">
                        <Search className="w-5 h-5 text-deep-blue" />
                        <input
                            type="text"
                            value={destination}
                            onChange={(e) => handleDestinationSearch(e.target.value)}
                            placeholder="Where to?"
                            className="flex-1 bg-transparent outline-none text-gray-900"
                        />
                    </div>

                    {/* Search Results */}
                    {searchResults.length > 0 && (
                        <div className="absolute z-10 w-full mt-2 bg-white rounded-xl shadow-lg border border-gray-200 max-h-60 overflow-y-auto">
                            {searchResults.map((result) => (
                                <button
                                    key={result.place_id}
                                    onClick={() => selectDestination(result.place_id, result.description)}
                                    className="w-full p-4 text-left hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
                                >
                                    <div className="flex items-start gap-3">
                                        <MapPin className="w-4 h-4 text-gray-400 mt-1" />
                                        <div>
                                            <p className="text-gray-900 font-medium">
                                                {result.structured_formatting.main_text}
                                            </p>
                                            <p className="text-sm text-gray-500">
                                                {result.structured_formatting.secondary_text}
                                            </p>
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Ride Details */}
                {rideDetails && (
                    <div className="bg-blue-50 rounded-xl p-4 space-y-3">
                        <h3 className="font-semibold text-gray-900">Ride Details</h3>
                        <div className="grid grid-cols-3 gap-4">
                            <div className="text-center">
                                <div className="flex items-center justify-center gap-1 text-gray-600 mb-1">
                                    <Clock className="w-4 h-4" />
                                </div>
                                <p className="text-sm font-medium text-gray-900">{rideDetails.duration}</p>
                                <p className="text-xs text-gray-500">Duration</p>
                            </div>
                            <div className="text-center">
                                <div className="flex items-center justify-center gap-1 text-gray-600 mb-1">
                                    <MapPin className="w-4 h-4" />
                                </div>
                                <p className="text-sm font-medium text-gray-900">{rideDetails.distance}</p>
                                <p className="text-xs text-gray-500">Distance</p>
                            </div>
                            <div className="text-center">
                                <div className="flex items-center justify-center gap-1 text-gray-600 mb-1">
                                    <DollarSign className="w-4 h-4" />
                                </div>
                                <p className="text-sm font-medium text-gray-900">${rideDetails.estimatedFare}</p>
                                <p className="text-xs text-gray-500">Fare</p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Error Message */}
                {error && (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                        <p className="text-red-700 text-sm">{error}</p>
                    </div>
                )}

                {/* Book Button */}
                <button
                    onClick={handleBookRide}
                    disabled={loading || !pickupLocation || !destinationCoords}
                    className="w-full bg-orange hover:bg-orange-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold py-4 rounded-xl flex items-center justify-center gap-2 transition-colors"
                >
                    {loading ? (
                        <>
                            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            <span>Booking...</span>
                        </>
                    ) : (
                        <>
                            <span>Book Ride</span>
                            <ArrowRight className="w-5 h-5" />
                        </>
                    )}
                </button>
            </div>
        </div>
    )
}

export default BookRide
