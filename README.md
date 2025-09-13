# 🚨 Emergency SOS App

A full-stack emergency alert application with audio recording, location tracking, and SMS/voice call notifications.

## Features

- 🎵 **Audio Recording**: Record emergency messages
- 📍 **Location Tracking**: Automatic GPS location detection
- 📱 **SMS Alerts**: Send emergency messages with location and recording
- 📞 **Voice Calls**: Make emergency calls with recorded audio
- 🎨 **Beautiful UI**: Modern emergency-themed design
- 🗄️ **Contact Management**: Add and manage emergency contacts

## Tech Stack

- **Frontend**: React + Vite
- **Backend**: Node.js + Express
- **Database**: MongoDB
- **SMS/Voice**: Twilio
- **Audio Processing**: FFmpeg

## Quick Start

1. **Clone the repository**
2. **Install dependencies**: `npm run install-all`
3. **Set up environment variables** in `backend/.env`:
   ```
   TWILIO_SID=your_twilio_sid
   TWILIO_AUTH_TOKEN=your_auth_token
   TWILIO_PHONE=your_twilio_phone
   MONGO_URI=your_mongodb_uri
   PUBLIC_BASE_URL=your_public_url
   ```
4. **Start development**: `npm run dev`
5. **Open**: http://localhost:5173

## Deployment

### Railway (Recommended)
1. Push to GitHub
2. Connect to Railway
3. Add environment variables
4. Deploy automatically

### Render
1. Connect GitHub repo
2. Set build/start commands
3. Add environment variables
4. Deploy

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `TWILIO_SID` | Twilio Account SID | Yes |
| `TWILIO_AUTH_TOKEN` | Twilio Auth Token | Yes |
| `TWILIO_PHONE` | Twilio Phone Number | Yes |
| `MONGO_URI` | MongoDB Connection String | Yes |
| `PUBLIC_BASE_URL` | Public URL for recording access | Yes |

## License

MIT




