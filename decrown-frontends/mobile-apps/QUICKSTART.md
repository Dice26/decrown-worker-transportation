# DeCrown Mobile App - Quick Start Guide

## 🚀 Get Started in 5 Minutes

### Step 1: Install Dependencies
```bash
cd decrown-frontends/mobile-apps
npm install
```

### Step 2: Configure Google Maps API

#### Option A: Interactive Setup (Recommended)
```bash
npm run setup:maps
```
Follow the prompts to enter your Google Maps API key.

#### Option B: Manual Setup
1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and add your Google Maps API key:
   ```env
   VITE_GOOGLE_MAPS_API_KEY=your_actual_api_key_here
   ```

### Step 3: Get Your Google Maps API Key

1. **Go to Google Cloud Console**
   - Visit: https://console.cloud.google.com/

2. **Create/Select Project**
   - Create a new project or select an existing one
   - Name it something like "DeCrown Mobile"

3. **Enable Required APIs**
   Navigate to "APIs & Services" > "Library" and enable:
   - ✅ Maps JavaScript API
   - ✅ Places API
   - ✅ Geocoding API
   - ✅ Distance Matrix API

4. **Create API Key**
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "API Key"
   - Copy your new API key

5. **Secure Your API Key (Important!)**
   - Click on your API key to edit it
   - Under "Application restrictions":
     - Development: Select "None"
     - Production: Select "HTTP referrers" and add your domain
   - Under "API restrictions":
     - Select "Restrict key"
     - Choose only the 4 APIs listed above

### Step 4: Run the App
```bash
npm run dev
```

The app will open at `http://localhost:5173`

## 📱 Testing the App

### Test Registration Flow
1. Navigate to `/register`
2. Complete the welcome screen
3. Fill in personal information
4. Upload KYC documents (use any image files)
5. Complete face verification (allow camera access)
6. View approval status

### Test Ride Booking
1. Navigate to `/worker`
2. Click "Book New Ride"
3. Allow location access when prompted
4. Tap on the map to select pickup location
5. Search for a destination
6. Review ride details (distance, time, fare)
7. Click "Book Ride"

## 🔧 Troubleshooting

### Map Not Loading
**Problem**: Blank map or "Map Loading Failed" error

**Solutions**:
- Check that your API key is correctly set in `.env`
- Verify all required APIs are enabled in Google Cloud Console
- Check browser console for specific error messages
- Ensure you have internet connection
- Try clearing browser cache

### Camera Not Working
**Problem**: Face verification camera doesn't start

**Solutions**:
- Allow camera permissions in your browser
- Use HTTPS in production (required for camera access)
- Check if another app is using the camera
- Try a different browser

### Location Not Detected
**Problem**: "Use Current Location" doesn't work

**Solutions**:
- Allow location permissions in your browser
- Check if location services are enabled on your device
- Try manually selecting a location on the map
- Use HTTPS in production (required for geolocation)

### API Key Errors
**Problem**: "Google Maps API error: ApiNotActivatedMapError"

**Solutions**:
- Ensure all 4 required APIs are enabled
- Wait a few minutes after enabling APIs (can take time to propagate)
- Check API key restrictions aren't blocking requests
- Verify billing is enabled on your Google Cloud project

## 🎯 Key Features to Test

### Registration
- ✅ Form validation (try invalid emails, weak passwords)
- ✅ Document upload (front and back images)
- ✅ Camera capture for face verification
- ✅ Progress tracking across steps
- ✅ Data persistence (refresh page during registration)

### Ride Booking
- ✅ Current location detection
- ✅ Map interaction (tap, drag, zoom)
- ✅ Address search with autocomplete
- ✅ Real-time fare calculation
- ✅ Distance and duration display
- ✅ Booking confirmation

### Worker Dashboard
- ✅ Next ride display
- ✅ Driver information
- ✅ Live tracking toggle
- ✅ Upcoming rides list
- ✅ Navigation between screens

## 📊 Development Tips

### Hot Reload
Vite provides instant hot module replacement. Changes to React components will update immediately without full page reload.

### Browser DevTools
- Open DevTools (F12)
- Check Console for errors
- Use Network tab to monitor API calls
- Use Application tab to view localStorage

### Testing Different Locations
To test with different locations, modify the default coordinates in `BookRide.jsx`:
```javascript
const defaultLocation = { lat: YOUR_LAT, lng: YOUR_LNG }
```

### Mock Data
The app currently uses mock data for:
- Driver information
- Upcoming rides
- Ride history

Replace with real API calls when backend is ready.

## 🔐 Environment Variables

Available environment variables in `.env`:

```env
# Required for maps functionality
VITE_GOOGLE_MAPS_API_KEY=your_key_here

# Backend API endpoint (when ready)
VITE_API_BASE_URL=http://localhost:3000/api

# WebSocket for real-time features (when ready)
VITE_WS_URL=ws://localhost:3000
```

## 📦 Build for Production

### Create Production Build
```bash
npm run build
```

Output will be in `dist/` directory.

### Preview Production Build
```bash
npm run preview
```

### Deploy to Render
1. Build Docker image:
   ```bash
   docker build -t dice26/decrown-mobile:latest .
   ```

2. Push to Docker Hub:
   ```bash
   docker push dice26/decrown-mobile:latest
   ```

3. Deploy on Render:
   - Create new Web Service
   - Connect to Docker Hub
   - Set environment variables
   - Deploy

## 🆘 Need Help?

### Documentation
- [Full Setup Guide](./MAPS_SETUP.md)
- [Implementation Status](./IMPLEMENTATION_STATUS.md)
- [Google Maps Docs](https://developers.google.com/maps/documentation)

### Common Issues
- **API Key Issues**: See MAPS_SETUP.md
- **Build Errors**: Check Node.js version (requires 16+)
- **Runtime Errors**: Check browser console

### Support
- Check browser console for detailed error messages
- Review Google Cloud Console for API usage and errors
- Ensure all dependencies are installed (`npm install`)

## ✅ Success Checklist

Before considering setup complete, verify:
- [ ] App runs without errors (`npm run dev`)
- [ ] Map loads and displays correctly
- [ ] Current location detection works
- [ ] Address search returns results
- [ ] Ride booking calculates fare
- [ ] Registration flow completes
- [ ] Camera access works (face verification)
- [ ] No console errors

## 🎉 You're Ready!

Once all checks pass, you're ready to:
- Develop new features
- Integrate with backend APIs
- Test with real users
- Deploy to production

Happy coding! 🚀
