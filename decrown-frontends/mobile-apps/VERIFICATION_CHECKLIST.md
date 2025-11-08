# ✅ DeCrown Mobile App - Verification Checklist

Use this checklist to verify that everything is working correctly after setup.

## 📦 Installation Verification

### Step 1: Dependencies
```bash
cd decrown-frontends/mobile-apps
npm install
```

**Check:**
- [ ] No installation errors
- [ ] `node_modules/` folder created
- [ ] All packages installed successfully

### Step 2: Environment Configuration
```bash
npm run setup:maps
```

**Check:**
- [ ] Script runs without errors
- [ ] `.env` file created
- [ ] API key saved in `.env`
- [ ] `.env` is in `.gitignore`

### Step 3: Start Development Server
```bash
npm run dev
```

**Check:**
- [ ] Server starts on port 5173
- [ ] No compilation errors
- [ ] Browser opens automatically (or manually open http://localhost:5173)

## 🗺️ Google Maps Configuration

### Cloud Console Setup
Visit: https://console.cloud.google.com/

**Check:**
- [ ] Google Cloud project created
- [ ] Billing enabled (required for APIs)
- [ ] Maps JavaScript API enabled
- [ ] Places API enabled
- [ ] Geocoding API enabled
- [ ] Distance Matrix API enabled
- [ ] API key created
- [ ] API key restrictions configured

### API Key Verification
In Google Cloud Console > APIs & Services > Credentials:

**Check:**
- [ ] API key exists
- [ ] Key is restricted to 4 required APIs
- [ ] Application restrictions set (None for dev, HTTP referrers for prod)
- [ ] Key copied to `.env` file

## 🧪 Functionality Testing

### Test 1: Home Page
Navigate to: `http://localhost:5173`

**Check:**
- [ ] Page loads without errors
- [ ] DeCrown logo displays
- [ ] "I'm a Worker" button visible
- [ ] "I'm a Driver" button visible
- [ ] "Register as a Worker" link visible
- [ ] No console errors (F12)

### Test 2: Registration Flow
Navigate to: `http://localhost:5173/register`

**Check:**
- [ ] Welcome screen loads
- [ ] Can click "Get Started"
- [ ] Personal info form displays
- [ ] Form validation works (try invalid email)
- [ ] Password strength indicator works
- [ ] Can proceed to KYC upload
- [ ] Document type selection works
- [ ] File upload works (try uploading an image)
- [ ] Can proceed to face verification
- [ ] Camera permission prompt appears
- [ ] Camera preview works (if allowed)
- [ ] Can capture photo
- [ ] Can proceed to pending screen
- [ ] Pending screen shows progress
- [ ] Can navigate to approved screen
- [ ] Approved screen displays welcome message

### Test 3: Worker Dashboard
Navigate to: `http://localhost:5173/worker`

**Check:**
- [ ] Dashboard loads
- [ ] "Book New Ride" button visible
- [ ] Next ride card displays
- [ ] Driver information shows
- [ ] Upcoming rides list visible
- [ ] Bottom navigation works
- [ ] Can click "Book New Ride"

### Test 4: Ride Booking (Critical)
Navigate to: `http://localhost:5173/book-ride`

**Map Loading:**
- [ ] Map container displays
- [ ] Loading spinner shows initially
- [ ] Map loads successfully (no error message)
- [ ] Map is interactive (can zoom/pan)
- [ ] No console errors related to Google Maps

**Current Location:**
- [ ] Browser prompts for location permission
- [ ] Current location detected (if allowed)
- [ ] Orange pickup marker appears on map
- [ ] Address displays in pickup field
- [ ] "Use current location" button works

**Pickup Selection:**
- [ ] Can tap anywhere on map to select pickup
- [ ] Marker moves to tapped location
- [ ] Address updates in pickup field
- [ ] Can drag marker to adjust location
- [ ] Address updates when marker is dragged

**Destination Search:**
- [ ] Can type in destination field
- [ ] Autocomplete suggestions appear (after 3 characters)
- [ ] Suggestions are relevant to search
- [ ] Can click a suggestion
- [ ] Blue destination marker appears on map
- [ ] Map zooms to show both markers

**Ride Details:**
- [ ] Distance displays correctly
- [ ] Duration displays correctly
- [ ] Fare displays correctly (format: $XX.XX)
- [ ] Details update when locations change

**Booking:**
- [ ] "Book Ride" button is disabled initially
- [ ] Button enables after selecting both locations
- [ ] Clicking button shows loading state
- [ ] Successfully navigates to worker dashboard
- [ ] Success message displays

### Test 5: Error Handling

**Map Errors:**
- [ ] Invalid API key shows error message
- [ ] Network error shows appropriate message
- [ ] Error state is user-friendly

**Location Errors:**
- [ ] Denied location permission handled gracefully
- [ ] Falls back to default location (New York)
- [ ] User can still select location manually

**Search Errors:**
- [ ] Empty search handled
- [ ] No results handled
- [ ] Network errors handled

## 🔍 Browser Console Check

Open DevTools (F12) and check Console tab:

### Expected (OK):
- [ ] No red errors
- [ ] Google Maps API loads successfully
- [ ] Component renders without warnings

### Warnings (Can Ignore):
- [ ] React DevTools extension messages
- [ ] Development mode warnings
- [ ] Source map warnings

### Errors (Must Fix):
- [ ] ❌ "Google Maps API error"
- [ ] ❌ "Failed to load resource"
- [ ] ❌ "Uncaught TypeError"
- [ ] ❌ "Cannot read property"

## 📊 Network Tab Check

Open DevTools (F12) > Network tab:

**Check:**
- [ ] Google Maps API script loads (200 status)
- [ ] Places API requests succeed (200 status)
- [ ] Geocoding API requests succeed (200 status)
- [ ] Distance Matrix API requests succeed (200 status)
- [ ] No 403 (Forbidden) errors
- [ ] No 429 (Rate Limit) errors

## 🎨 Visual Check

### Layout:
- [ ] Header displays correctly
- [ ] Map fills available space
- [ ] Bottom panel displays correctly
- [ ] Buttons are properly styled
- [ ] Text is readable
- [ ] Icons display correctly

### Responsive:
- [ ] Works on mobile viewport (375px)
- [ ] Works on tablet viewport (768px)
- [ ] Works on desktop viewport (1024px+)
- [ ] Touch targets are large enough (44px+)

### Colors:
- [ ] Deep blue header (#1E3A8A)
- [ ] Orange buttons (#FF6600)
- [ ] Proper contrast ratios
- [ ] Consistent styling throughout

## 🔐 Security Check

### Environment Variables:
- [ ] `.env` file exists
- [ ] `.env` is in `.gitignore`
- [ ] API key not visible in source code
- [ ] API key not committed to git

### API Key Restrictions:
- [ ] Key restricted to 4 APIs only
- [ ] HTTP referrer restrictions set (production)
- [ ] Billing alerts configured
- [ ] Usage monitoring enabled

## 📱 Mobile Testing

### iOS Safari:
- [ ] App loads correctly
- [ ] Map displays properly
- [ ] Touch interactions work
- [ ] Camera access works
- [ ] Location access works

### Android Chrome:
- [ ] App loads correctly
- [ ] Map displays properly
- [ ] Touch interactions work
- [ ] Camera access works
- [ ] Location access works

## 🚀 Performance Check

### Load Times:
- [ ] Initial page load < 3 seconds
- [ ] Map loads < 2 seconds
- [ ] Search results < 500ms
- [ ] Route calculation < 1 second

### Interactions:
- [ ] Smooth scrolling
- [ ] No lag when typing
- [ ] Markers move smoothly
- [ ] Transitions are smooth

## 📝 Documentation Check

### Files Exist:
- [ ] README.md
- [ ] QUICKSTART.md
- [ ] GOOGLE_CLOUD_SETUP.md
- [ ] MAPS_SETUP.md
- [ ] API_CONFIGURATION_COMPLETE.md
- [ ] IMPLEMENTATION_STATUS.md
- [ ] .env.example

### Documentation Quality:
- [ ] Instructions are clear
- [ ] Examples are provided
- [ ] Troubleshooting section exists
- [ ] Links work correctly

## ✅ Final Verification

### All Systems Go:
- [ ] All installation checks passed
- [ ] All functionality tests passed
- [ ] No critical errors in console
- [ ] Network requests succeed
- [ ] Visual appearance correct
- [ ] Security measures in place
- [ ] Documentation complete

### Ready for:
- [ ] Development work
- [ ] Backend integration
- [ ] User testing
- [ ] Staging deployment
- [ ] Production deployment

## 🐛 Common Issues & Quick Fixes

### Issue: Map not loading
**Quick Fix:**
```bash
# Check .env file
cat .env

# Verify API key is set
echo $VITE_GOOGLE_MAPS_API_KEY

# Restart dev server
npm run dev
```

### Issue: "ApiNotActivatedMapError"
**Quick Fix:**
1. Go to Google Cloud Console
2. Enable all 4 required APIs
3. Wait 5 minutes
4. Refresh browser

### Issue: Search not working
**Quick Fix:**
1. Verify Places API is enabled
2. Check browser console for errors
3. Try clearing browser cache
4. Restart dev server

### Issue: Location not detected
**Quick Fix:**
1. Allow location permissions in browser
2. Use HTTPS (required in production)
3. Try "Use current location" button
4. Manually select location on map

## 📞 Getting Help

If you encounter issues not covered here:

1. **Check Documentation:**
   - Read QUICKSTART.md
   - Review GOOGLE_CLOUD_SETUP.md
   - Check MAPS_SETUP.md

2. **Check Console:**
   - Open browser DevTools (F12)
   - Look for specific error messages
   - Check Network tab for failed requests

3. **Check Google Cloud:**
   - Verify APIs are enabled
   - Check API usage/quotas
   - Review billing status

4. **Resources:**
   - Google Maps Docs: https://developers.google.com/maps
   - React Docs: https://react.dev
   - Stack Overflow: https://stackoverflow.com

## 🎉 Success!

If all checks pass, congratulations! Your DeCrown Mobile App is fully configured and ready for development.

**Next Steps:**
1. Start building new features
2. Integrate with backend APIs
3. Add real-time tracking
4. Implement payment processing
5. Deploy to production

---

**Checklist Version**: 1.0.0  
**Last Updated**: November 8, 2025  
**Status**: Ready for verification
