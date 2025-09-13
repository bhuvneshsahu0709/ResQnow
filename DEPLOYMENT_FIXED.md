# Fixed Vercel Deployment Guide

## Option 1: Combined Deployment (Recommended)

### 1. Deploy as Single Project
1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click "New Project"
3. Import your GitHub repository
4. **Root Directory**: Leave empty (use root)
5. **Framework Preset**: Other
6. **Build Command**: Leave empty
7. **Output Directory**: Leave empty
8. **Install Command**: Leave empty

### 2. Environment Variables
Add these in Vercel Dashboard → Settings → Environment Variables:

```
MONGO_URI=mongodb+srv://bhuvnesh:bhuvnesh@cluster0.nm7zbfj.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0
TWILIO_SID=your_twilio_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_PHONE=your_twilio_phone_number
PUBLIC_BASE_URL=https://your-app-name.vercel.app
```

### 3. Deploy
Click "Deploy" and wait for completion.

---

## Option 2: Separate Deployments (If Combined Fails)

### Backend Deployment
1. Create new Vercel project
2. **Root Directory**: `backend`
3. **Framework**: Other
4. Environment Variables: Same as above (except PUBLIC_BASE_URL)

### Frontend Deployment
1. Create another Vercel project
2. **Root Directory**: `frontend`
3. **Framework**: Vite
4. Environment Variables:
   ```
   VITE_API_URL=https://your-backend-url.vercel.app
   ```

---

## Troubleshooting

### If MongoDB Connection Fails:
1. **Quick Fix**: Remove `MONGO_URI` from environment variables (uses in-memory storage)
2. **Permanent Fix**: 
   - Go to MongoDB Atlas → Network Access
   - Add IP Address: `0.0.0.0/0` (Allow access from anywhere)
   - Wait 2-3 minutes

### If Build Fails:
1. Check that all dependencies are in package.json
2. Ensure Node.js version is 18+ in Vercel settings
3. Check build logs in Vercel dashboard

### If API Calls Fail:
1. Check that routes are properly configured in vercel.json
2. Ensure CORS is enabled in backend
3. Check network tab in browser for actual error messages
