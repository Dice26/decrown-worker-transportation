# 🚀 DeCrown Worker Transportation - Render.com Deployment Guide
## Domain: www.gowithdecrown.com

## ✅ **DEPLOY TO RENDER.COM - COMPLETE GUIDE**

Render.com provides free hosting with automatic SSL, making it perfect for going fully live quickly!

---

## 📋 **Prerequisites**

1. ✅ GitHub account
2. ✅ Render.com account (free tier available)
3. ✅ Your project code ready
4. ✅ Domain name (www.gowithdecrown.com)

---

## 🚀 **STEP-BY-STEP DEPLOYMENT**

### **Step 1: Prepare Your Project for Render**

#### **A. Create render.yaml Configuration**

This file is already created in your project root. It defines all services.

#### **B. Create Dockerfile for Render**

Already created as `Dockerfile.simple` - Render will use this.

#### **C. Ensure package.json has correct scripts**

Your package.json already has:
```json
{
  "scripts": {
    "start": "node dist/src/index.js",
    "build": "npm ci --only=production"
  }
}
```

---

### **Step 2: Push to GitHub**

#### **Initialize Git Repository**

```bash
# Initialize git (if not already done)
git init

# Add all files
git add .

# Commit
git commit -m "Initial commit - DeCrown Worker Transportation System"

# Create repository on GitHub
# Go to https://github.com/new
# Repository name: decrown-worker-transportation
# Make it Private or Public

# Add remote
git remote add origin https://github.com/YOUR_USERNAME/decrown-worker-transportation.git

# Push to GitHub
git branch -M main
git push -u origin main
```

#### **Quick PowerShell Commands**

```powershell
# Initialize and push to GitHub
git init
git add .
git commit -m "Deploy DeCrown Worker Transportation to Render"

# You'll need to create the repo on GitHub first, then:
git remote add origin https://github.com/YOUR_USERNAME/decrown-worker-transportation.git
git branch -M main
git push -u origin main
```

---

### **Step 3: Deploy to Render**

#### **A. Sign Up / Login to Render**

1. Go to https://render.com
2. Sign up with GitHub (recommended)
3. Authorize Render to access your repositories

#### **B. Create New Web Service**

1. Click **"New +"** button
2. Select **"Web Service"**
3. Connect your GitHub repository: `decrown-worker-transportation`
4. Configure the service:

**Basic Settings:**
```
Name: decrown-worker-transportation
Region: Oregon (US West) or closest to your users
Branch: main
Root Directory: (leave blank)
Runtime: Docker
```

**Build Settings:**
```
Build Command: (leave blank - Docker handles this)
Start Command: (leave blank - Docker handles this)
```

**Instance Type:**
```
Free (or Starter $7/month for better performance)
```

#### **C. Add Environment Variables**

Click **"Advanced"** and add these environment variables:

```env
NODE_ENV=production
PORT=3000
APP_URL=https://decrown-worker-transportation.onrender.com
API_URL=https://decrown-worker-transportation.onrender.com/api
WEB_APP_URL=https://decrown-worker-transportation.onrender.com

# Database (Render will provide these)
DATABASE_URL=<will be auto-filled by Render PostgreSQL>

# Redis (Render will provide these)
REDIS_URL=<will be auto-filled by Render Redis>

# JWT Secret (generate a secure random string)
JWT_SECRET=your-super-secure-jwt-secret-min-32-chars-long
JWT_EXPIRATION=15m
REFRESH_TOKEN_EXPIRATION=7d

# Encryption
ENCRYPTION_KEY=your-32-character-encryption-key

# Feature Flags
FEATURE_LOCATION_TRACKING=true
FEATURE_REAL_TIME_UPDATES=true
FEATURE_PAYMENT_PROCESSING=true
FEATURE_AUDIT_LOGGING=true

# CORS
CORS_ORIGIN=https://decrown-worker-transportation.onrender.com,https://www.gowithdecrown.com
```

#### **D. Create PostgreSQL Database**

1. From Render Dashboard, click **"New +"**
2. Select **"PostgreSQL"**
3. Configure:
   ```
   Name: decrown-postgres
   Database: decrown_transport_prod
   User: decrown_user
   Region: Same as your web service
   Plan: Free (or Starter for production)
   ```
4. Click **"Create Database"**
5. Copy the **Internal Database URL**
6. Go back to your Web Service
7. Add environment variable:
   ```
   DATABASE_URL=<paste the internal database URL>
   ```

#### **E. Create Redis Instance**

1. From Render Dashboard, click **"New +"**
2. Select **"Redis"**
3. Configure:
   ```
   Name: decrown-redis
   Region: Same as your web service
   Plan: Free (or Starter for production)
   ```
4. Click **"Create Redis"**
5. Copy the **Internal Redis URL**
6. Go back to your Web Service
7. Add environment variable:
   ```
   REDIS_URL=<paste the internal Redis URL>
   ```

---

### **Step 4: Deploy!**

1. Click **"Create Web Service"**
2. Render will automatically:
   - Clone your repository
   - Build the Docker image
   - Deploy the application
   - Assign a URL: `https://decrown-worker-transportation.onrender.com`
   - Provide free SSL certificate

**Deployment takes 5-10 minutes**

---

### **Step 5: Configure Custom Domain**

#### **A. Add Custom Domain in Render**

1. Go to your Web Service in Render
2. Click **"Settings"**
3. Scroll to **"Custom Domains"**
4. Click **"Add Custom Domain"**
5. Enter: `www.gowithdecrown.com`
6. Render will provide DNS records

#### **B. Update DNS Records**

Go to your domain registrar and add:

```dns
# CNAME Record
Type: CNAME
Name: www
Value: decrown-worker-transportation.onrender.com
TTL: 3600

# For root domain (optional)
Type: A
Name: @
Value: <IP provided by Render>
TTL: 3600
```

#### **C. Verify Domain**

1. Wait 5-10 minutes for DNS propagation
2. Render will automatically provision SSL certificate
3. Your site will be live at: `https://www.gowithdecrown.com`

---

### **Step 6: Run Database Migrations**

Once deployed, run migrations using Render Shell:

1. Go to your Web Service in Render
2. Click **"Shell"** tab
3. Run:
   ```bash
   npm run migrate
   ```

Or use Render's one-off jobs:
```bash
# From your local terminal
render run npm run migrate
```

---

## 🎯 **QUICK DEPLOYMENT COMMANDS**

### **Complete Deployment in 5 Commands**

```powershell
# 1. Initialize Git
git init
git add .
git commit -m "Deploy to Render"

# 2. Create GitHub repo and push
# (Do this on GitHub.com first)
git remote add origin https://github.com/YOUR_USERNAME/decrown-worker-transportation.git
git push -u origin main

# 3. Go to Render.com and click "New Web Service"
# 4. Connect your GitHub repo
# 5. Click "Create Web Service"

# Done! Your app will be live in 10 minutes at:
# https://decrown-worker-transportation.onrender.com
```

---

## 📊 **Render.yaml Configuration**

I'll create a `render.yaml` file that automates the entire deployment:

```yaml
services:
  # Web Service
  - type: web
    name: decrown-worker-transportation
    env: docker
    region: oregon
    plan: free
    branch: main
    healthCheckPath: /health
    envVars:
      - key: NODE_ENV
        value: production
      - key: PORT
        value: 3000
      - key: DATABASE_URL
        fromDatabase:
          name: decrown-postgres
          property: connectionString
      - key: REDIS_URL
        fromService:
          name: decrown-redis
          type: redis
          property: connectionString
      - key: APP_URL
        value: https://www.gowithdecrown.com
      - key: JWT_SECRET
        generateValue: true
      - key: ENCRYPTION_KEY
        generateValue: true

  # PostgreSQL Database
  - type: pserv
    name: decrown-postgres
    env: docker
    region: oregon
    plan: free
    ipAllowList: []

  # Redis Cache
  - type: redis
    name: decrown-redis
    region: oregon
    plan: free
    ipAllowList: []
```

---

## 🔧 **Alternative: Deploy with Render CLI**

### **Install Render CLI**

```powershell
npm install -g @render/cli
```

### **Login to Render**

```bash
render login
```

### **Deploy**

```bash
render deploy
```

---

## 💡 **Render.com Benefits**

### **Why Render?**

✅ **Free Tier Available**
- Free PostgreSQL database (90 days, then $7/month)
- Free Redis instance (90 days, then $7/month)
- Free web service (with limitations)

✅ **Automatic Features**
- Free SSL certificates
- Automatic deployments from GitHub
- Zero-downtime deployments
- Built-in monitoring
- Automatic scaling

✅ **Easy Setup**
- No Docker knowledge required
- No server management
- No SSL configuration needed
- Automatic HTTPS

✅ **Production Ready**
- 99.9% uptime SLA
- DDoS protection
- Global CDN
- Automatic backups

---

## 🎯 **Cost Breakdown**

### **Free Tier (Perfect for Testing)**
- Web Service: Free (with sleep after 15 min inactivity)
- PostgreSQL: Free for 90 days
- Redis: Free for 90 days
- SSL: Free
- **Total: $0/month**

### **Starter Tier (Recommended for Production)**
- Web Service: $7/month (always on)
- PostgreSQL: $7/month (1GB storage)
- Redis: $10/month (256MB)
- SSL: Free
- **Total: $24/month**

### **Professional Tier (High Traffic)**
- Web Service: $25/month (2GB RAM)
- PostgreSQL: $20/month (10GB storage)
- Redis: $25/month (1GB)
- **Total: $70/month**

---

## 🚀 **FASTEST DEPLOYMENT PATH**

### **Option 1: Blueprint Deploy (Recommended)**

1. Create `render.yaml` in your project root (already done)
2. Push to GitHub
3. Go to Render Dashboard
4. Click **"New +"** → **"Blueprint"**
5. Connect your repository
6. Click **"Apply"**
7. **Done!** Everything deploys automatically

### **Option 2: Manual Deploy**

1. Push to GitHub
2. Create Web Service on Render
3. Create PostgreSQL on Render
4. Create Redis on Render
5. Connect services with environment variables
6. Deploy

---

## 📋 **Post-Deployment Checklist**

### **Verify Deployment**

```bash
# 1. Check health endpoint
curl https://decrown-worker-transportation.onrender.com/health

# 2. Check API
curl https://decrown-worker-transportation.onrender.com/api/v1/health

# 3. Check logs in Render Dashboard
# Go to Logs tab in your service

# 4. Run migrations
# Use Render Shell or CLI
```

### **Configure Monitoring**

1. Enable **Auto-Deploy** from GitHub
2. Set up **Health Check Alerts**
3. Configure **Slack/Email Notifications**
4. Review **Metrics Dashboard**

### **Security Checklist**

- [ ] Environment variables set correctly
- [ ] JWT secret is strong and unique
- [ ] Database password is secure
- [ ] CORS origins configured
- [ ] Rate limiting enabled
- [ ] SSL certificate active

---

## 🎉 **SUCCESS!**

Once deployed, your DeCrown Worker Transportation system will be live at:

**Primary URL**: `https://decrown-worker-transportation.onrender.com`  
**Custom Domain**: `https://www.gowithdecrown.com` (after DNS setup)

**Features Live:**
- ✅ Real-time worker location tracking
- ✅ Automated route optimization
- ✅ Payment processing
- ✅ Mobile API backend
- ✅ Comprehensive security
- ✅ Automatic SSL/HTTPS
- ✅ Global CDN
- ✅ 99.9% uptime

---

## 📞 **Need Help?**

### **Render Support**
- Documentation: https://render.com/docs
- Community: https://community.render.com
- Support: support@render.com

### **DeCrown Support**
- Email: support@gowithdecrown.com
- Website: www.gowithdecrown.com

---

**🚀 Ready to deploy? Let's push to GitHub and go live on Render!**