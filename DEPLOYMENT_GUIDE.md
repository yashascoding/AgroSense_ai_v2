# AgroSense AI v2 - Complete Free Deployment Guide

## 🚀 Quick Deployment Checklist

### **STEP 1: VERCEL (Frontend)**

- [ ] Go to https://vercel.com
- [ ] Sign up with GitHub
- [ ] Click "New Project"
- [ ] Import: `yashascoding/AgroSense_ai_v2`
- [ ] **Root Directory:** (leave blank)
- [ ] **Build Command:** `npm run build` (auto)
- [ ] **Output Directory:** `dist` (auto)
- [ ] **Environment Variable:** 
  - Key: `VITE_API_BASE`
  - Value: `https://[railway-url].railway.app` (fill after Railway deploy)
- [ ] Click "Deploy"
- [ ] Wait for build ✅
- [ ] Your Vercel URL: https://agrosense-xxxx.vercel.app

---

### **STEP 2: RAILWAY (Backend)**

**BEFORE DEPLOYING:**

1. Get API Keys:
   - [ ] **Gemini API Key:** https://aistudio.google.com/apikey  AIzaSyCET_JtjCgjqzU3pPfteQrX8oxSiAs75Pg
   - [ ] **Hugging Face Token:** https://huggingface.co/settings/tokens


   - [ ] **Cloudinary (Optional):** https://cloudinary.com/console

   

2. Make sure `Procfile` exists in repo root (already created ✅)

3. Push to GitHub:
   ```bash
   cd /home/yashas-bhagwat/Downloads/test/AgroSense_ai_v2
   git add .
   git commit -m "Add Procfile and deployment config"
   git push origin main
   ```

**DEPLOY:**

- [ ] Go to https://railway.app
- [ ] Sign up with GitHub
- [ ] Click "New Project" → "Deploy from GitHub repo"
- [ ] Select `yashascoding/AgroSense_ai_v2`
- [ ] Click "Deploy Now"
- [ ] Go to "Variables" tab and add:
  ```
  FLASK_ENV = production
  GEMINI_API_KEY = (your Gemini key)
  HF_API_KEY = (your Hugging Face token)
  CLOUDINARY_CLOUD_NAME = (your cloud name)
  CLOUDINARY_API_KEY = (your API key)
  CLOUDINARY_API_SECRET = (your API secret)
  ```
- [ ] Click "Save"
- [ ] Wait for build ✅
- [ ] Copy your Railway URL: https://agrosense-production-xxxx.railway.app

---

### **STEP 3: Connect Frontend & Backend**

1. Go back to **Vercel Dashboard** → Your Project → **Settings** → **Environment Variables**
2. Update `VITE_API_BASE`:
   - Key: `VITE_API_BASE`
   - Value: `https://[your-railway-url].railway.app` (paste Railway URL from Step 2)
3. **Redeploy** on Vercel:
   - Push any change to `main` branch (even just whitespace), OR
   - Go to "Deployments" → Click latest → "Redeploy"

---

### **STEP 4: Verify Everything Works**

- [ ] Open https://agrosense-xxxx.vercel.app in browser
- [ ] Go to "Detect" page
- [ ] Upload a crop image
- [ ] Check that API calls work (no CORS errors in Console)
- [ ] Weather insights load from Open-Meteo
- [ ] Predictions are processed by backend

---

## 📊 Database Options (FREE)

### **Option A: SQLite (Simplest)**
- Already built-in ✅
- Works immediately on Railway
- **Con:** Data resets on Railway redeploy (ephemeral filesystem)
- **Use case:** Testing, small projects, single user

### **Option B: PostgreSQL via Neon.tech (Better)**
- [ ] Go to https://neon.tech
- [ ] Sign up free
- [ ] Create project
- [ ] Copy connection string: `postgresql://user:pass@host/dbname`
- [ ] Add to Railway Variables as: `DATABASE_URL`
- [ ] Restart Railway deployment

---

## 🔑 Free API Keys Needed

| Service | Link | Free Tier | What it's for |
|---------|------|-----------|---------------|
| **Gemini** | https://aistudio.google.com/apikey | 1M tokens/month | Disease detection, chat |
| **Hugging Face** | https://huggingface.co/settings/tokens | Unlimited | Backup image classification |
| **Cloudinary** | https://cloudinary.com | 25 GB/month | Optional image uploads |
| **Open-Meteo** | https://open-meteo.com | Unlimited | Weather data (no key needed) |
| **Nominatim** | https://nominatim.org | Free | Location reverse geocoding (no key needed) |

---

## ⚠️ Important Notes

### **SQLite Persistence Issue**
- Railway has an **ephemeral filesystem** - files don't persist between restarts
- Solution: Either use PostgreSQL (Neon) or accept data loss on restarts
- For production: **Use Neon PostgreSQL** (free tier)

### **CORS Settings**
- ✅ Flask already has CORS enabled (`flask-cors`)
- Railway will auto-assign a URL
- Just make sure `VITE_API_BASE` matches in Vercel env

### **Environment Variables Priority**
Railway reads from:
1. Railway dashboard "Variables" tab ✅
2. `.env` file in backend folder
3. System environment

Vercel reads from:
1. Vercel dashboard "Environment Variables" ✅
2. `.env.local` file (for local dev only)

---

## 🐛 Troubleshooting

### **"Cannot reach API" in browser console**
- Check `VITE_API_BASE` in Vercel settings
- Make sure it points to your Railway URL (with https://)
- Redeploy Vercel after changing env vars

### **Railway shows "Build failed"**
- Check Railway "Build Logs"
- Make sure `Procfile` exists
- Make sure `requirements.txt` has all Python dependencies

### **API says "GEMINI_API_KEY not configured"**
- Go to Railway → Variables
- Make sure `GEMINI_API_KEY` is set
- Restart deployment in Railway dashboard

### **Images not uploading**
- Check if Cloudinary env vars are set on Railway
- If not using Cloudinary, upload still works but stores locally (won't persist)

---

## 📝 Next Steps After Deployment

1. Test the application thoroughly
2. Add a real database (PostgreSQL via Neon)
3. Set up custom domain (Vercel allows this)
4. Monitor logs:
   - **Vercel:** Deployments → Logs
   - **Railway:** Project → Logs

---

## 💡 Cost Breakdown (All FREE)

| Service | Free Tier | Usage |
|---------|-----------|-------|
| **Vercel** | 100GB bandwidth/month | Frontend hosting |
| **Railway** | $5/month credits (covers small app) | Backend/API |
| **Neon (PostgreSQL)** | 3 free projects, 3GB storage | Database |
| **Gemini API** | 1M tokens/month | Disease detection |
| **Hugging Face** | Unlimited | Image classification |

**Total Cost:** $0 if under Railway credits, or minimal $$$ if you go over

---

## 🎯 Summary

```
Your Frontend (React)
    ↓ Builds on Vercel
    ↓ https://agrosense-xxxx.vercel.app
    
Your Backend (Flask)
    ↓ Deployed on Railway
    ↓ https://agrosense-xxxx.railway.app
    
Your Database
    ↓ SQLite (easy but temp) or PostgreSQL Neon (persistent)
    ↓ Connected via DATABASE_URL env var

External APIs (All Free)
    ↓ Gemini, Hugging Face, Open-Meteo, Nominatim
```
