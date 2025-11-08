# 🐳 Docker-Only Deployment to Render

## Why Docker-Only?
- Bypasses GitHub integration issues
- Direct control over what gets deployed
- Faster iteration and testing
- No build errors from Render's environment

## Prerequisites
1. Docker Desktop installed and running
2. Render account with registry access

---

## Step 1: Build Docker Image Locally

```bash
# Build the minimal working image
docker build -f Dockerfile.minimal -t decrown-worker-transportation:latest .

# Test it locally first
docker run -p 3000:3000 decrown-worker-transportation:latest

# Visit http://localhost:3000/health to verify
```

---

## Step 2: Get Render Registry Credentials

1. Go to https://dashboard.render.com
2. Click your profile → Account Settings
3. Go to "Registry Credentials" section
4. Copy your registry URL and credentials

**Your Render Registry URL format:**
```
registry.render.com/[your-username]/decrown-worker-transportation
```

---

## Step 3: Login to Render Registry

```bash
# Login to Render's Docker registry
docker login registry.render.com

# Enter your Render credentials when prompted
Username: [your-render-email]
Password: [your-render-api-key]
```

---

## Step 4: Tag and Push Image

```bash
# Tag your image for Render registry
docker tag decrown-worker-transportation:latest registry.render.com/[your-username]/decrown-worker-transportation:latest

# Push to Render
docker push registry.render.com/[your-username]/decrown-worker-transportation:latest
```

---

## Step 5: Create Web Service on Render

1. Go to https://dashboard.render.com
2. Click "New +" → "Web Service"
3. Select "Deploy an existing image from a registry"
4. Enter your image URL:
   ```
   registry.render.com/[your-username]/decrown-worker-transportation:latest
   ```
5. Configure:
   - **Name**: decrown-worker-transportation
   - **Region**: Oregon (US West)
   - **Instance Type**: Free
   - **Port**: 3000
   - **Health Check Path**: /health

6. Add Environment Variables:
   - `NODE_ENV` = `production`
   - `PORT` = `3000`

7. Click "Create Web Service"

---

## Step 6: Update and Redeploy

Whenever you make changes:

```bash
# 1. Rebuild image
docker build -f Dockerfile.minimal -t decrown-worker-transportation:latest .

# 2. Tag for Render
docker tag decrown-worker-transportation:latest registry.render.com/[your-username]/decrown-worker-transportation:latest

# 3. Push to Render
docker push registry.render.com/[your-username]/decrown-worker-transportation:latest

# 4. Go to Render dashboard and click "Manual Deploy"
```

---

## Quick Deploy Script

Save this as `deploy-docker.sh`:

```bash
#!/bin/bash

echo "🐳 Building Docker image..."
docker build -f Dockerfile.minimal -t decrown-worker-transportation:latest .

echo "🏷️  Tagging for Render..."
docker tag decrown-worker-transportation:latest registry.render.com/[your-username]/decrown-worker-transportation:latest

echo "📤 Pushing to Render registry..."
docker push registry.render.com/[your-username]/decrown-worker-transportation:latest

echo "✅ Image pushed! Go to Render dashboard and click 'Manual Deploy'"
```

Make it executable:
```bash
chmod +x deploy-docker.sh
```

---

## Advantages of This Approach

✅ **No GitHub issues** - Direct Docker deployment  
✅ **Test locally first** - Verify before pushing  
✅ **Faster deploys** - No build time on Render  
✅ **Full control** - You build exactly what gets deployed  
✅ **Easy rollback** - Keep tagged versions  

---

## Your Live URL

Once deployed:
- **Render URL**: https://decrown-worker-transportation.onrender.com
- **Custom Domain**: www.gowithdecrown.com (configure in Render dashboard)

---

## Troubleshooting

**Can't login to registry?**
- Get API key from Render dashboard → Account Settings → API Keys
- Use email as username, API key as password

**Image won't push?**
- Check Docker Desktop is running
- Verify you're logged in: `docker info | grep Username`
- Check image size isn't too large: `docker images`

**Service won't start?**
- Check logs in Render dashboard
- Verify health check endpoint works locally
- Ensure port 3000 is exposed in Dockerfile
