import { useEffect, useState } from 'react'
import { GOOGLE_MAPS_CONFIG } from '../config/maps'

let isLoading = false
let isLoaded = false

export const useGoogleMaps = () => {
    const [loaded, setLoaded] = useState(isLoaded)
    const [error, setError] = useState(null)

    useEffect(() => {
        // If already loaded, return
        if (isLoaded) {
            setLoaded(true)
            return
        }

        // If currently loading, wait for it
        if (isLoading) {
            const checkLoaded = setInterval(() => {
                if (isLoaded) {
                    setLoaded(true)
                    clearInterval(checkLoaded)
                }
            }, 100)
            return () => clearInterval(checkLoaded)
        }

        // Check if API key is configured
        if (!GOOGLE_MAPS_CONFIG.apiKey) {
            setError('Google Maps API key is not configured')
            return
        }

        // Start loading
        isLoading = true

        const script = document.createElement('script')
        script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_CONFIG.apiKey}&libraries=${GOOGLE_MAPS_CONFIG.libraries.join(',')}`
        script.async = true
        script.defer = true

        script.onload = () => {
            isLoaded = true
            isLoading = false
            setLoaded(true)
        }

        script.onerror = () => {
            isLoading = false
            setError('Failed to load Google Maps')
        }

        document.head.appendChild(script)

        return () => {
            // Cleanup if needed
        }
    }, [])

    return { loaded, error }
}

export default useGoogleMaps
