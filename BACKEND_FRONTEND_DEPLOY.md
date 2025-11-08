# 🚀 Deploy Backend + Frontend to Render

## Current Status

✅ **Backend API**: Already live on Render!
- Docker Image: `dice26/decrown:latest`
- Endpoints working: `/health`, `/api/v1/*`

## 🎯 Deployment Strategy

### Option 1: Separate Services (Recommended)

Deploy backend and frontend as separate Render services:

**Backend (API)** ✅ Already Done
- Type: Web Service
- Image: `dice26/decrown:latest`
- URL: `https://decrown-worker-transportation.onrender.com`

**Frontend (Web App)** - To Deploy
- Type: Static Site or Web Service
- Framework: React/Vue/HTML
- URL: `https://decrown-app.onrender.com`

---

## 📦 Step 1: Create Frontend

Do you have a frontend already, or should I create one?

### If You Have Frontend:
Tell me where it is (folder name) and I'll help deploy it.

### If You Need Frontend:
I can create a simple React dashboard that connects to your API.

---

## 🚀 Step 2: Deploy Frontend to Render

### Method A: Static Site (HTML/React Build)

1. Build your frontend:
```bash
npm run build
```

2. On Render Dashboard:
   - Click: **New +** → **Static Site**
   - Connect your GitHub repo
   - Build Command: `npm run build`
   - Publish Directory: `build` or `dist`

### Method B: Docker Image (Like Backend)

1. Create `Dockerfile.frontend`:
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
RUN npm install -g serve
EXPOSE 3000
CMD ["serve", "-s", "build", "-l", "3000"]
```

2. Build and push:
```bash
docker build -f Dockerfile.frontend -t dice26/decrown-frontend:latest .
docker push dice26/decrown-frontend:latest
```

3. Deploy on Render with image: `dice26/decrown-frontend:latest`

---

## 🔗 Step 3: Connect Frontend to Backend

In your frontend environment variables on Render:

```
REACT_APP_API_URL=https://decrown-worker-transportation.onrender.com
```

Or for Vue:
```
VUE_APP_API_URL=https://decrown-worker-transportation.onrender.com
```

---

## 🌐 Step 4: Custom Domains (Optional)

### Backend API:
- Render URL: `decrown-worker-transportation.onrender.com`
- Custom: `api.gowithdecrown.com`

### Frontend:
- Render URL: `decrown-app.onrender.com`
- Custom: `www.gowithdecrown.com`

Configure in Render Dashboard → Settings → Custom Domain

---

## ✅ Final Architecture

```
┌─────────────────────────────────────┐
│  www.gowithdecrown.com              │
│  (Frontend - Static Site/Docker)    │
│  - User Interface                   │
│  - Dashboard                        │
└──────────────┬──────────────────────┘
               │
               │ API Calls
               ▼
┌─────────────────────────────────────┐
│  api.gowithdecrown.com              │
│  (Backend - Docker) ✅ LIVE         │
│  - REST API                         │
│  - Business Logic                   │
│  - Database                         │
└─────────────────────────────────────┘
```

---

## 🎯 Next Steps

**Tell me:**
1. Do you have a frontend already? Where is it?
2. What framework? (React, Vue, HTML, etc.)
3. Should I create a simple frontend for you?

Then I'll help you deploy it to Render!
