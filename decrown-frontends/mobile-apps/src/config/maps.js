// Google Maps Configuration
export const GOOGLE_MAPS_CONFIG = {
    apiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '',
    libraries: ['places', 'geometry'],
    version: 'weekly'
}

// Check if API key is configured
export const isGoogleMapsConfigured = () => {
    return GOOGLE_MAPS_CONFIG.apiKey && GOOGLE_MAPS_CONFIG.apiKey !== ''
}

// Get Maps API URL
export const getGoogleMapsUrl = () => {
    const { apiKey, libraries } = GOOGLE_MAPS_CONFIG
    return `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=${libraries.join(',')}`
}

export default GOOGLE_MAPS_CONFIG
