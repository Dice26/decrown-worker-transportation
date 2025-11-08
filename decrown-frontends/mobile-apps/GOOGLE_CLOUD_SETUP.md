# Google Cloud Console Setup - Step by Step

## 📋 Prerequisites
- Google Account
- Credit card (for billing, but you get $200 free credit)

## 🎯 Complete Setup Guide

### Part 1: Create Google Cloud Project

#### Step 1: Access Google Cloud Console
1. Go to https://console.cloud.google.com/
2. Sign in with your Google account
3. Accept terms of service if prompted

#### Step 2: Create New Project
1. Click the project dropdown at the top (says "Select a project")
2. Click "NEW PROJECT" button
3. Enter project details:
   - **Project name**: `DeCrown Mobile App`
   - **Organization**: Leave as default
   - **Location**: Leave as default
4. Click "CREATE"
5. Wait for project creation (takes ~30 seconds)
6. Select your new project from the dropdown

### Part 2: Enable Billing (Required)

#### Step 3: Set Up Billing
1. Click the hamburger menu (☰) > "Billing"
2. Click "LINK A BILLING ACCOUNT" or "CREATE BILLING ACCOUNT"
3. Follow the prompts to add payment method
4. **Note**: You get $200 free credit for 90 days
5. Set up budget alerts (recommended):
   - Go to "Budgets & alerts"
   - Create budget: $50/month
   - Set alert at 50%, 90%, 100%

### Part 3: Enable Required APIs

#### Step 4: Enable Maps JavaScript API
1. Click hamburger menu (☰) > "APIs & Services" > "Library"
2. Search for "Maps JavaScript API"
3. Click on it
4. Click "ENABLE" button
5. Wait for confirmation

#### Step 5: Enable Places API
1. Click "Library" in the left sidebar
2. Search for "Places API"
3. Click on it
4. Click "ENABLE" button

#### Step 6: Enable Geocoding API
1. Click "Library" in the left sidebar
2. Search for "Geocoding API"
3. Click on it
4. Click "ENABLE" button

#### Step 7: Enable Distance Matrix API
1. Click "Library" in the left sidebar
2. Search for "Distance Matrix API"
3. Click on it
4. Click "ENABLE" button

**✅ Checkpoint**: You should now have 4 APIs enabled

### Part 4: Create API Key

#### Step 8: Generate API Key
1. Click hamburger menu (☰) > "APIs & Services" > "Credentials"
2. Click "+ CREATE CREDENTIALS" at the top
3. Select "API key"
4. Your API key will be created and displayed
5. **IMPORTANT**: Copy this key immediately
6. Click "RESTRICT KEY" (recommended)

#### Step 9: Restrict API Key (Security)

**For Development:**
1. In the "API key" edit screen:
2. Under "Application restrictions":
   - Select "None" (for now)
3. Under "API restrictions":
   - Select "Restrict key"
   - Check these 4 APIs:
     - ✅ Maps JavaScript API
     - ✅ Places API
     - ✅ Geocoding API
     - ✅ Distance Matrix API
4. Click "SAVE"

**For Production:**
1. Under "Application restrictions":
   - Select "HTTP referrers (web sites)"
   - Click "ADD AN ITEM"
   - Add your domains:
     - `https://yourdomain.com/*`
     - `https://*.yourdomain.com/*`
2. Under "API restrictions":
   - Keep the 4 APIs selected
3. Click "SAVE"

### Part 5: Configure Your App

#### Step 10: Add API Key to App
1. Open terminal in your project:
   ```bash
   cd decrown-frontends/mobile-apps
   ```

2. Run the setup script:
   ```bash
   npm run setup:maps
   ```

3. Paste your API key when prompted

**OR** manually edit `.env`:
```env
VITE_GOOGLE_MAPS_API_KEY=AIzaSyBFw0Qbyq9zTrrj-RKjp2IN68W_VWuELA8
```

#### Step 11: Test the Configuration
1. Start the dev server:
   ```bash
   npm run dev
   ```

2. Open http://localhost:5173

3. Navigate to "Book a Ride"

4. Check if map loads correctly

5. Open browser console (F12) - should see no errors

## 🔍 Verification Checklist

After setup, verify everything works:

### API Status Check
1. Go to Google Cloud Console
2. Navigate to "APIs & Services" > "Dashboard"
3. Verify all 4 APIs show as "Enabled"
4. Check "Metrics" tab for API usage

### App Functionality Check
- [ ] Map loads without errors
- [ ] Current location detection works
- [ ] Can tap/drag map markers
- [ ] Address search shows suggestions
- [ ] Distance calculation works
- [ ] No console errors

### Security Check
- [ ] API key is restricted to required APIs only
- [ ] HTTP referrer restrictions set (production)
- [ ] Billing alerts configured
- [ ] API key not committed to git

## 💰 Cost Estimation

### Free Tier Limits (Monthly)
- **Maps JavaScript API**: $200 free credit
- **Places API**: 1,000 requests free
- **Geocoding API**: 40,000 requests free
- **Distance Matrix API**: 40,000 elements free

### Typical Usage (1000 users/month)
- Map loads: ~3,000 loads = ~$21
- Place searches: ~2,000 requests = ~$34
- Geocoding: ~1,000 requests = ~$5
- Distance Matrix: ~1,000 requests = ~$5
- **Total**: ~$65/month (covered by free credit)

### Cost Optimization Tips
1. **Cache results**: Store frequently used addresses
2. **Batch requests**: Combine multiple lookups
3. **Use autocomplete wisely**: Debounce search input
4. **Monitor usage**: Set up alerts in Cloud Console
5. **Consider alternatives**: Mapbox for high-volume apps

## 🚨 Common Issues & Solutions

### Issue 1: "This page can't load Google Maps correctly"
**Cause**: API key not configured or invalid

**Solution**:
1. Check `.env` file has correct key
2. Restart dev server after changing `.env`
3. Verify key in Google Cloud Console
4. Check browser console for specific error

### Issue 2: "ApiNotActivatedMapError"
**Cause**: Required API not enabled

**Solution**:
1. Go to Google Cloud Console
2. Enable all 4 required APIs
3. Wait 5 minutes for changes to propagate
4. Refresh your app

### Issue 3: "RefererNotAllowedMapError"
**Cause**: HTTP referrer restrictions blocking request

**Solution**:
1. Go to Credentials in Cloud Console
2. Edit your API key
3. Under "Application restrictions":
   - For dev: Select "None"
   - For prod: Add your domain correctly
4. Save and wait 5 minutes

### Issue 4: "OverQueryLimitError"
**Cause**: Exceeded free tier limits

**Solution**:
1. Check usage in Cloud Console
2. Enable billing if needed
3. Implement caching to reduce requests
4. Consider upgrading plan

### Issue 5: Billing Not Enabled
**Cause**: Some APIs require billing even with free tier

**Solution**:
1. Go to "Billing" in Cloud Console
2. Link a billing account
3. Add payment method
4. You still get $200 free credit

## 📊 Monitoring & Maintenance

### Daily Checks
- Monitor API usage in Cloud Console
- Check for error spikes
- Review billing alerts

### Weekly Checks
- Review API metrics
- Check for unusual patterns
- Update budget if needed

### Monthly Checks
- Review total costs
- Optimize high-usage endpoints
- Update API restrictions if needed

## 🔐 Security Best Practices

### DO:
✅ Restrict API key to specific APIs
✅ Use HTTP referrer restrictions in production
✅ Store API key in environment variables
✅ Add `.env` to `.gitignore`
✅ Rotate keys periodically
✅ Monitor for unauthorized usage
✅ Set up billing alerts

### DON'T:
❌ Commit API keys to git
❌ Share API keys publicly
❌ Use same key for dev and prod
❌ Leave keys unrestricted
❌ Ignore billing alerts
❌ Skip security updates

## 📞 Support Resources

### Google Cloud Support
- **Documentation**: https://cloud.google.com/maps-platform/docs
- **Support**: https://cloud.google.com/support
- **Community**: https://stackoverflow.com/questions/tagged/google-maps

### Billing Support
- **Pricing Calculator**: https://cloud.google.com/products/calculator
- **Billing Docs**: https://cloud.google.com/billing/docs
- **Support**: https://cloud.google.com/support-hub

### API-Specific Docs
- **Maps JavaScript**: https://developers.google.com/maps/documentation/javascript
- **Places API**: https://developers.google.com/maps/documentation/places/web-service
- **Geocoding**: https://developers.google.com/maps/documentation/geocoding
- **Distance Matrix**: https://developers.google.com/maps/documentation/distance-matrix

## ✅ Setup Complete!

Once you've completed all steps and verified functionality, you're ready to:
- Develop with confidence
- Deploy to production
- Scale your application

**Next Steps**:
1. Read [QUICKSTART.md](./QUICKSTART.md) for app usage
2. Review [MAPS_SETUP.md](./MAPS_SETUP.md) for technical details
3. Check [IMPLEMENTATION_STATUS.md](./IMPLEMENTATION_STATUS.md) for features

Happy mapping! 🗺️
