# Deploy Backend API - Quick Guide

## ✅ Backend Image Ready
- **Image**: dice26/decrown-backend:latest
- **Digest**: sha256:cd638703f0f2f7bf89c8e8e2ee1042acb09e5f742d9749a8242528b0f667d26f
- **Status**: Pushed to Docker Hub

## 🚀 Deploy to Render (Choose One Method)

### Method 1: Blueprint Deployment (Easiest - Recommended)

This will deploy EVERYTHING from render.yaml (backend, database, Redis):

1. Go to https://dashboard.render.com
2. Click **"New +"** → **"Blueprint"**
3. Connect your GitHub repository
4. Select the repository containing `render.yaml`
5. Click **"Apply"**
6. Render will create:
   - ✅ Backend API service (decrown-worker-transportation)
   - ✅ PostgreSQL database (decrown-postgres)
   - ✅ Redis cache (decrown-redis)

### Method 2: Manual Web Service (Backend Only)

If you just want the backend API without database/Redis:

1. Go to https://dashboard.render.com
2. Click **"New +"** → **"Web Service"**
3. Select **"Deploy an existing image from a registry"**
4. Configure:
   ```
   Image URL: dice26/decrown-backend:latest
   Name: decrown-worker-transportation
   Region: Oregon
   Plan: Free
   ```
5. Add Environment Variables:
   ```
   NODE_ENV=production
   PORT=10000
   ```
6. Click **"Create Web Service"**

### Method 3: Update Existing Service

If the service already exists but isn't working:

1. Go to https://dashboard.render.com
2. Find the `decrown-worker-transportation` service
3. Go to **Settings** → **Image**
4. Update to: `dice26/decrown-backend:latest`
5. Click **"Manual Deploy"** → **"Clear build cache & deploy"**

## 🧪 Test After Deployment

Wait 2-3 minutes for deployment, then test:

```bash
# Test root endpoint
curl https://decrown-worker-transportation.onrender.com/

# Test health check
curl https://decrown-worker-transportation.onrender.com/health

# Test API status
curl https://decrown-worker-transportation.onrender.com/api/v1/status
```

Expected response:
```json
{
  "message": "DeCrown Worker Transportation API",
  "version": "1.0.0",
  "status": "Production Ready",
  "endpoints": {
    "health": "/health",
    "status": "/api/v1/status",
    "users": "/api/v1/users",
    "transport": "/api/v1/transport",
    "payment": "/api/v1/payment",
    "location": "/api/v1/location"
  }
}
```

## 🔍 Troubleshooting

### Service Returns 404
- Service might be sleeping (free tier)
- Wait 30-60 seconds and try again
- Check Render logs for errors

### Service Won't Start
- Check Render logs: Dashboard → Service → Logs
- Verify environment variables are set
- Check health check endpoint is `/health`

### CORS Errors
Add to environment variables:
```
CORS_ORIGIN=https://decrown-frontend.onrender.com,https://www.gowithdecrown.com
```

## ✅ Success Checklist

Once backend is deployed:
- [ ] Backend responds at root URL
- [ ] Health check returns 200 OK
- [ ] Frontend can connect to backend
- [ ] No CORS errors in browser console
- [ ] All API endpoints return data

## 📊 Current Deployment Status

### Frontend
- ✅ **LIVE**: https://decrown-frontend.onrender.com
- ✅ Image: dice26/decrown-frontend:latest
- ✅ Status: Working (no 404 errors)

### Backend
- ⏳ **PENDING**: https://decrown-worker-transportation.onrender.com
- ✅ Image: dice26/decrown-backend:latest (ready)
- ❌ Status: Not deployed or not responding

## 🎯 Next Steps

1. Deploy backend using one of the methods above
2. Wait for deployment to complete (2-3 minutes)
3. Test backend endpoints
4. Verify frontend can connect
5. Celebrate! 🎉

## 📞 Need Help?

- Check Render Dashboard: https://dashboard.render.com
- View Render Status: https://status.render.com
- Check service logs in Render dashboard
