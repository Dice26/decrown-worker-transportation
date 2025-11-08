# 🚀 Manual Deployment Guide - Userfront & Adminfront

## Why Manual Deployment?

The API script encountered a 400 error, which typically means:
- Services with these names might already exist
- Or the API format needs adjustment

**Manual deployment via Render Dashboard is the most reliable method!**

## 📋 Step-by-Step: Deploy Userfront

### 1. Go to Render Dashboard
Visit: https://dashboard.render.com

### 2. Create New Web Service
- Click the blue **"New +"** button (top right)
- Select **"Web Service"**

### 3. Choose Deployment Method
- Select **"Deploy an existing image from a registry"**
- Click **"Next"**

### 4. Configure Userfront
Fill in these details:

**Image URL:**
```
dice26/decrown-userfront:latest
```

**Service Name:**
```
decrown-userfront
```

**Region:**
```
Oregon (US West)
```

**Instance Type:**
```
Free
```

### 5. Add Environment Variables
Click **"Add Environment Variable"** and add these:

| Key | Value |
|-----|-------|
| `NODE_ENV` | `production` |
| `PORT` | `10000` |
| `API_URL` | `https://decrown-worker-transportation.onrender.com` |

### 6. Advanced Settings (Optional)
- **Health Check Path**: `/`
- **Auto-Deploy**: Yes (enabled)

### 7. Create Service
- Click **"Create Web Service"** (blue button at bottom)
- Wait 2-3 minutes for deployment

### 8. Verify
Once deployed, visit: https://decrown-userfront.onrender.com

---

## 📋 Step-by-Step: Deploy Adminfront

### 1. Create Another Web Service
- Click **"New +"** → **"Web Service"** again

### 2. Choose Deployment Method
- Select **"Deploy an existing image from a registry"**
- Click **"Next"**

### 3. Configure Adminfront
Fill in these details:

**Image URL:**
```
dice26/decrown-adminfront:latest
```

**Service Name:**
```
decrown-adminfront
```

**Region:**
```
Oregon (US West)
```

**Instance Type:**
```
Free
```

### 4. Add Environment Variables
Click **"Add Environment Variable"** and add these:

| Key | Value |
|-----|-------|
| `NODE_ENV` | `production` |
| `PORT` | `10000` |
| `API_URL` | `https://decrown-worker-transportation.onrender.com` |

### 5. Advanced Settings (Optional)
- **Health Check Path**: `/`
- **Auto-Deploy**: Yes (enabled)

### 6. Create Service
- Click **"Create Web Service"**
- Wait 2-3 minutes for deployment

### 7. Verify
Once deployed, visit: https://decrown-adminfront.onrender.com

---

## ✅ Verification Checklist

After both services are deployed:

### Check All Four URLs
- [ ] https://decrown-frontend.onrender.com (should show public website)
- [ ] https://decrown-worker-transportation.onrender.com (should return JSON)
- [ ] https://decrown-userfront.onrender.com (should show worker interface)
- [ ] https://decrown-adminfront.onrender.com (should show admin dashboard)

### Test Functionality
- [ ] Frontend can test API endpoints
- [ ] Userfront loads without errors
- [ ] Adminfront loads without errors
- [ ] No CORS errors in browser console

---

## 🎯 Quick Reference

### Docker Images
```
Frontend:   dice26/decrown-frontend:latest
Backend:    dice26/decrown-backend:latest
Userfront:  dice26/decrown-userfront:latest
Adminfront: dice26/decrown-adminfront:latest
```

### Environment Variables (for both Userfront & Adminfront)
```
NODE_ENV=production
PORT=10000
API_URL=https://decrown-worker-transportation.onrender.com
```

### Service Names
```
decrown-frontend (already deployed)
decrown-worker-transportation (already deployed)
decrown-userfront (to deploy)
decrown-adminfront (to deploy)
```

---

## 🔍 Troubleshooting

### If Service Name Already Exists
- Try a different name like `decrown-userfront-v2`
- Or delete the existing service first

### If Deployment Fails
- Check the logs in Render dashboard
- Verify the Docker image URL is correct
- Ensure environment variables are set

### If Page Shows 404
- Wait a few more minutes (first deploy can take 3-5 minutes)
- Check if service is still deploying in dashboard
- Try a hard refresh (Ctrl+Shift+R)

---

## 📊 Expected Result

Once both services are deployed, you'll have:

```
┌─────────────────────────────────────────────┐
│         DeCrown Complete System              │
├─────────────────────────────────────────────┤
│                                              │
│  1. Frontend  ✅ LIVE                        │
│     Public website & API testing            │
│                                              │
│  2. Backend   ✅ LIVE                        │
│     API with 31 endpoints                   │
│                                              │
│  3. Userfront ✅ DEPLOYED                    │
│     Worker interface                         │
│                                              │
│  4. Adminfront ✅ DEPLOYED                   │
│     Dispatcher/Owner interface              │
│                                              │
└─────────────────────────────────────────────┘
```

All four components working together! 🎉

---

## ⏱️ Time Estimate

- **Per Service**: 5 minutes to configure + 3 minutes to deploy
- **Total Time**: ~15-20 minutes for both services

---

## 💡 Tips

1. **Keep Dashboard Open**: Monitor deployment progress in real-time
2. **Check Logs**: If something fails, logs show exactly what went wrong
3. **Be Patient**: First deployment can take 3-5 minutes
4. **Hard Refresh**: Use Ctrl+Shift+R to clear browser cache

---

## 🎊 You're Almost There!

Just follow the steps above to manually deploy Userfront and Adminfront.

It's straightforward and takes about 15 minutes total! 🚀
