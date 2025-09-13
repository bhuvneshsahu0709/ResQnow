# SOS Web App - Deployment Guide

## Overview
This SOS web app is now a **Progressive Web App (PWA)** with offline functionality, installable on mobile devices, and supports storing audio recordings in MongoDB using GridFS. The app can be installed on home screens and works offline for emergency situations.

## Key Features
- ✅ **Progressive Web App (PWA)** - Installable on mobile devices
- ✅ **Offline functionality** - Works without internet connection
- ✅ **4-attempt SOS system** - Automatic follow-up messages
- ✅ **"All Safe" stop button** - Cancel SOS sequence anytime
- ✅ **Audio recordings** stored in MongoDB GridFS
- ✅ **Audio files served** via API endpoints (no ngrok required)
- ✅ **Fallback to local storage** if MongoDB is unavailable
- ✅ **Automatic WebM to MP3 conversion**
- ✅ **Deployable to any cloud platform**

## Environment Variables

Create a `.env` file in the backend directory with the following variables:

```env
# MongoDB Configuration (Required)
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/sos_app
MONGO_DB_NAME=sos_app

# Twilio Configuration (Optional - for SMS and calls)
TWILIO_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_PHONE=your_twilio_phone_number

# Public Base URL (Required for deployment)
PUBLIC_BASE_URL=https://your-deployed-backend-url.com
```

For the frontend, create a `.env` file in the frontend directory:

```env
VITE_API_URL=https://your-deployed-backend-url.com
```

## Deployment Steps

### 1. Backend Deployment

1. **Install dependencies:**
   ```bash
   cd backend
   npm install
   ```

2. **Set up MongoDB:**
   - Use MongoDB Atlas (recommended) or your own MongoDB instance
   - Get your connection string and add it to `MONGO_URI`

3. **Deploy to your preferred platform:**
   - **Heroku:** Use the Heroku CLI or GitHub integration
   - **Railway:** Connect your GitHub repository
   - **Render:** Deploy from GitHub
   - **Vercel:** Use the Vercel CLI or dashboard

4. **Set environment variables** in your deployment platform

### 2. Frontend Deployment (PWA)

1. **Install dependencies:**
   ```bash
   cd frontend
   npm install
   ```

2. **Build the PWA:**
   ```bash
   npm run build
   ```

3. **Verify PWA files are included:**
   - `dist/manifest.json` - PWA manifest
   - `dist/sw.js` - Service worker
   - `dist/icons/` - PWA icons (all sizes)
   - `dist/index.html` - Updated with PWA meta tags

4. **Deploy to:**
   - **Vercel:** Connect GitHub repository (recommended for PWA)
   - **Netlify:** Drag and drop the dist folder
   - **GitHub Pages:** Use GitHub Actions
   - **Firebase Hosting:** Excellent PWA support

### 3. Update URLs

After deployment, update the environment variables with your actual deployed URLs:

- `PUBLIC_BASE_URL`: Your backend URL (e.g., `https://your-app.herokuapp.com`)
- `VITE_API_URL`: Your backend URL (same as above)

## How Audio Storage Works

1. **Recording:** User records audio in the browser (WebM format)
2. **Upload:** Audio is uploaded to the backend via multipart form data
3. **Conversion:** WebM is converted to MP3 using FFmpeg
4. **Storage:** MP3 is stored in MongoDB using GridFS
5. **Serving:** Audio is served via `/api/audio/:filename` endpoint
6. **Sharing:** Recording URL is included in SMS/call messages

## API Endpoints

- `POST /api/sos` - Send SOS with audio recording
- `GET /api/audio/:filename` - Serve audio file from MongoDB
- `POST /api/add-contact` - Add emergency contact
- `GET /api/contacts` - Get all contacts
- `GET /api/health` - Health check

## Benefits of MongoDB Storage

- ✅ **No ngrok dependency:** Audio files are accessible via direct URLs
- ✅ **Scalable:** MongoDB handles large files efficiently
- ✅ **Reliable:** No local file system dependencies
- ✅ **Cloud-ready:** Works on any deployment platform
- ✅ **Backup:** Audio files are backed up with your database

## PWA Features

### Installation
- **Mobile devices:** Look for "Add to Home Screen" prompt
- **Desktop:** Browser install button or menu option
- **Chrome/Edge:** Install button appears in address bar

### Offline Functionality
- **App works offline** - cached for emergency use
- **Contact management** - view saved contacts offline
- **UI remains functional** - can navigate and see status
- **SOS attempts** - will queue when offline, send when online

### Service Worker Features
- **Caching strategy** - Static files cached for offline use
- **API fallbacks** - Graceful handling when backend is unavailable
- **Background sync** - Ready for future enhancements
- **Push notifications** - Framework for emergency alerts

## Testing

### Local Testing
1. Start the backend: `cd backend && npm start`
2. Start the frontend: `cd frontend && npm run dev`
3. Add a test contact
4. Record and send an SOS
5. Check the console for the recording URL
6. Test the audio URL directly in your browser

### PWA Testing
1. **Install the app** on your device
2. **Test offline functionality** - disconnect internet and use app
3. **Verify install prompt** appears in supported browsers
4. **Check service worker** registration in browser dev tools
5. **Test on mobile** - install from home screen

## Troubleshooting

- **Audio not playing:** Check if `PUBLIC_BASE_URL` is set correctly
- **MongoDB connection issues:** Verify your `MONGO_URI` and network access
- **File upload errors:** Check file size limits and GridFS configuration
- **CORS issues:** Ensure your frontend URL is allowed in CORS settings

