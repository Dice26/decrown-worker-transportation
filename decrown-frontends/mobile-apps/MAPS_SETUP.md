# Google Maps Setup Guide

## Overview
The DeCrown mobile app uses Google Maps API for location services, geocoding, and route planning.

## Required APIs
Enable the following APIs in your Google Cloud Console:
1. **Maps JavaScript API** - For displaying interactive maps
2. **Places API** - For address autocomplete and place search
3. **Geocoding API** - For converting addresses to coordinates
4. **Distance Matrix API** - For calculating ride distances and durations

## Setup Steps

### 1. Get API Key
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Navigate to "APIs & Services" > "Credentials"
4. Click "Create Credentials" > "API Key"
5. Copy your API key

### 2. Enable Required APIs
1. Go to "APIs & Services" > "Library"
2. Search for and enable each of the required APIs listed above

### 3. Restrict API Key (Recommended)
1. In Credentials, click on your API key
2. Under "Application restrictions":
   - For development: Select "None"
   - For production: Select "HTTP referrers" and add your domain
3. Under "API restrictions":
   - Select "Restrict key"
   - Choose the 4 APIs listed above

### 4. Configure the App

#### Option 1: Update index.html directly
Replace `YOUR_GOOGLE_MAPS_API_KEY` in `index.html`:
```html
<script src="https://maps.googleapis.com/maps/api/js?key=YOUR_ACTUAL_KEY&libraries=places" async defer></script>
```

#### Option 2: Use environment variable (Recommended)
1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Add your API key to `.env`:
   ```
   VITE_GOOGLE_MAPS_API_KEY=your_actual_api_key_here
   ```

3. Update `index.html` to use the environment variable:
   ```html
   <script src="https://maps.googleapis.com/maps/api/js?key=%VITE_GOOGLE_MAPS_API_KEY%&libraries=places" async defer></script>
   ```

## Features Using Maps

### BookRide Component
- **Interactive Map**: Tap to select pickup location
- **Current Location**: Auto-detect user's current position
- **Draggable Marker**: Adjust pickup point by dragging
- **Address Autocomplete**: Search destinations with suggestions
- **Route Calculation**: Automatic distance, duration, and fare estimation
- **Reverse Geocoding**: Convert coordinates to readable addresses

### Map Customization
The map includes custom styling:
- Hidden POI labels for cleaner interface
- Custom markers for pickup (orange) and destination (blue)
- Auto-zoom to fit both locations
- Responsive to user interactions

## Testing Without API Key
For development without a real API key, the app will:
- Default to New York coordinates (40.7128, -74.0060)
- Show console errors but remain functional
- Allow manual address entry

## Cost Considerations
Google Maps APIs have free tier limits:
- **Maps JavaScript API**: $200 free credit/month
- **Places API**: First 1000 requests free
- **Geocoding API**: First 40,000 requests free
- **Distance Matrix API**: First 40,000 elements free

Monitor usage in Google Cloud Console to avoid unexpected charges.

## Troubleshooting

### Map not loading
- Check browser console for errors
- Verify API key is correct
- Ensure required APIs are enabled
- Check for CORS issues

### Autocomplete not working
- Verify Places API is enabled
- Check API key restrictions
- Ensure `libraries=places` is in script URL

### Location detection failing
- Check browser permissions for location access
- Ensure HTTPS in production (required for geolocation)
- Test with different browsers

## Alternative: Mapbox
If you prefer Mapbox over Google Maps:
1. Sign up at [mapbox.com](https://www.mapbox.com/)
2. Get your access token
3. Replace Google Maps implementation with Mapbox GL JS
4. Update BookRide.jsx to use Mapbox SDK

## Support
For issues with Google Maps API:
- [Google Maps Platform Documentation](https://developers.google.com/maps/documentation)
- [Stack Overflow - google-maps tag](https://stackoverflow.com/questions/tagged/google-maps)
