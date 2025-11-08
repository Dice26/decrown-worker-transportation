# 🚀 Deploy to Render with Docker - Quick Reference

## ⚡ One Command Deploy

```powershell
.\deploy-docker.ps1
```

**That's it!** The script handles everything.

---

## 📋 What You'll Need

1. **Docker Desktop** - Running
2. **Render Account** - Free tier works
3. **Render API Key** - Get from: https://dashboard.render.com/u/settings#api-keys

---

## 🎯 The Process

### 1. Run Script
```powershell
.\deploy-docker.ps1
```

### 2. Enter Credentials When Prompted
- **Username**: Your Render email
- **Password**: Your Render API key

### 3. Create Service on Render
After push completes:
- Go to: https://dashboard.render.com
- Click: **New +** → **Web Service**
- Select: **Deploy an existing image from a registry**
- Paste the image URL shown by the script
- Set Port: **3000**
- Set Health Check: **/health**
- Click: **Create Web Service**

---

## ✅ Success Indicators

**Script Output:**
```
✅ Build successful!
✅ Health check passed!
✅ Image pushed!
```

**Render Dashboard:**
```
✅ Service created
✅ Deploying...
✅ Live
```

---

## 🌐 Your Live URL

```
https://decrown-worker-transportation.onrender.com
```

Test it:
```
https://decrown-worker-transportation.onrender.com/health
```

---

## 🔄 Update Later

```powershell
# Make your changes, then:
.\deploy-docker.ps1

# In Render dashboard:
# Click "Manual Deploy"
```

---

## 🆘 Quick Fixes

**Docker not running?**
→ Start Docker Desktop

**Login fails?**
→ Use Render email + API key (not password)

**Build fails?**
→ Run from project root directory

**Push fails?**
→ Check internet connection

---

## 📞 Get Help

- **Full Guide**: See `DOCKER_ONLY_DEPLOY.md`
- **Detailed Docs**: See `DOCKER_DEPLOY.md`
- **Setup Status**: See `DOCKER_PUSH_SETUP_COMPLETE.md`

---

## 🎉 Ready?

```powershell
.\deploy-docker.ps1
```

**Go live in 5 minutes!** 🚀
