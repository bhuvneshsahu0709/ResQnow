require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const mongoose = require('mongoose');
const twilio = require('twilio');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const path = require('path');
const fs = require('fs');

// Set ffmpeg path
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const app = express();
app.use(cors());
app.use(bodyParser.json());

// MongoDB connection with proper database name
const dbName = process.env.MONGO_DB_NAME || 'sos_app';
const mongoUri = process.env.MONGO_URI || 'mongodb+srv://bhuvnesh:bhuvi@cluster0.nm7zbfj.mongodb.net/sos_app';

console.log('=== MongoDB Connection Debug ===');
console.log('MONGO_URI set:', !!process.env.MONGO_URI);
console.log('MONGO_DB_NAME:', process.env.MONGO_DB_NAME);
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('VERCEL_URL:', process.env.VERCEL_URL);
console.log('================================');

if (mongoUri) {
  mongoose.connect(mongoUri, { 
    dbName: dbName,
    serverSelectionTimeoutMS: 30000, // 30 seconds timeout for Vercel
    connectTimeoutMS: 30000,
    socketTimeoutMS: 30000,
    maxPoolSize: 10,
    retryWrites: true,
    w: 'majority'
  }).then(() => {
    console.log(`✅ Connected to MongoDB database: ${dbName}`);
    useInMemory = false;
  }).catch((error) => {
    console.warn('MongoDB connection failed, using in-memory storage:', error.message);
    console.warn('Error details:', error);
    console.warn('MongoDB URI used:', mongoUri.replace(/\/\/.*@/, '//***:***@')); // Hide credentials in logs
    useInMemory = true;
  });
} else {
  console.warn('MONGO_URI not set, using in-memory storage');
  useInMemory = true;
}

const ContactSchema = new mongoose.Schema({
  name: String,
  phone: String
});
const Contact = mongoose.model('Contact', ContactSchema);

// In-memory fallback storage
let inMemoryContacts = [];
let useInMemory = false;

// Check if we should use in-memory storage
mongoose.connection.on('error', () => {
  useInMemory = true;
  console.log('Using in-memory storage due to MongoDB connection issues');
});

let client = null;
const hasValidTwilio =
  typeof process.env.TWILIO_SID === 'string' &&
  process.env.TWILIO_SID.startsWith('AC') &&
  typeof process.env.TWILIO_AUTH_TOKEN === 'string' &&
  process.env.TWILIO_AUTH_TOKEN.length > 0 &&
  typeof process.env.TWILIO_PHONE === 'string' &&
  process.env.TWILIO_PHONE.length > 0;

if (hasValidTwilio) {
  client = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);
  console.log('Twilio enabled.');
} else {
  console.warn('Twilio disabled: missing or invalid credentials. SMS/calls will be skipped.');
}
// Configure multer to use memory storage for Vercel compatibility
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});


// Serve audio files from MongoDB GridFS
app.get('/api/audio/:filename', async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: 'Database not connected' });
    }
    
    const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
      bucketName: 'recordings'
    });
    
    const filename = req.params.filename;
    const downloadStream = bucket.openDownloadStreamByName(filename);
    
    downloadStream.on('error', (error) => {
      console.error('Error downloading file:', error);
      res.status(404).json({ error: 'File not found' });
    });
    
    downloadStream.on('data', (chunk) => {
      res.write(chunk);
    });
    
    downloadStream.on('end', () => {
      res.end();
    });
    
    // Set appropriate headers
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    
  } catch (error) {
    console.error('Error serving audio file:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

// Debug endpoint to check MongoDB connection status
app.get('/api/debug', (req, res) => {
  const debugInfo = {
    timestamp: new Date().toISOString(),
    environment: {
      NODE_ENV: process.env.NODE_ENV,
      VERCEL_URL: process.env.VERCEL_URL,
      MONGO_URI_SET: !!process.env.MONGO_URI,
      MONGO_DB_NAME: process.env.MONGO_DB_NAME,
      PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL
    },
    mongodb: {
      connectionState: mongoose.connection.readyState,
      connectionStateText: getConnectionStateText(mongoose.connection.readyState),
      useInMemory: useInMemory,
      host: mongoose.connection.host,
      port: mongoose.connection.port,
      name: mongoose.connection.name
    },
    memoryContacts: {
      count: inMemoryContacts.length,
      contacts: inMemoryContacts
    }
  };
  
  res.json(debugInfo);
});

function getConnectionStateText(state) {
  const states = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting'
  };
  return states[state] || 'unknown';
}

// Test MongoDB connection endpoint
app.get('/api/test-mongodb', async (req, res) => {
  try {
    console.log('Testing MongoDB connection...');
    
    if (mongoose.connection.readyState === 1) {
      // Already connected, test with a simple query
      const testDoc = new Contact({ name: 'Test', phone: '+1234567890' });
      await testDoc.save();
      await Contact.deleteOne({ _id: testDoc._id });
      
      res.json({
        success: true,
        message: 'MongoDB connection is working!',
        connectionState: mongoose.connection.readyState,
        useInMemory: useInMemory
      });
    } else {
      // Try to connect
      const mongoUri = process.env.MONGO_URI || 'mongodb+srv://bhuvnesh:bhuvi@cluster0.nm7zbfj.mongodb.net/sos_app';
      
      await mongoose.connect(mongoUri, {
        dbName: 'sos_app',
        serverSelectionTimeoutMS: 10000,
        connectTimeoutMS: 10000
      });
      
      res.json({
        success: true,
        message: 'MongoDB connection established!',
        connectionState: mongoose.connection.readyState,
        useInMemory: false
      });
    }
  } catch (error) {
    console.error('MongoDB test failed:', error);
    res.json({
      success: false,
      message: 'MongoDB connection failed',
      error: error.message,
      errorCode: error.code,
      connectionState: mongoose.connection.readyState,
      useInMemory: useInMemory
    });
  }
});


// Add new contact
app.post('/api/add-contact', async (req, res) => {
  try {
    const { name, phone } = req.body;
    if (!name || !phone) return res.status(400).json({ success: false, message: 'Name and phone required' });

    console.log('Adding contact:', { name, phone, useInMemory, mongoReady: mongoose.connection.readyState });

    if (useInMemory || !mongoose.connection.readyState) {
      // Use in-memory storage
      const newContact = { _id: Date.now().toString(), name, phone };
      inMemoryContacts.push(newContact);
      console.log('Contact added to in-memory storage:', newContact);
      res.json({ success: true, message: 'Contact added successfully!' });
    } else {
      // Use MongoDB
      const newContact = new Contact({ name, phone });
      await newContact.save();
      console.log('Contact added to MongoDB:', newContact);
      res.json({ success: true, message: 'Contact added successfully!' });
    }
  } catch (err) {
    console.error('Database error, falling back to in-memory:', err.message);
    // Fallback to in-memory storage
    const newContact = { _id: Date.now().toString(), name: req.body.name, phone: req.body.phone };
    inMemoryContacts.push(newContact);
    res.json({ success: true, message: 'Contact added successfully!' });
  }
});

// Get all contacts
app.get('/api/contacts', async (req, res) => {
  try {
    if (useInMemory || !mongoose.connection.readyState) {
      // Use in-memory storage
      res.json({ success: true, contacts: inMemoryContacts });
    } else {
      // Use MongoDB
      const contacts = await Contact.find();
      res.json({ success: true, contacts });
    }
  } catch (err) {
    console.error('Database error, falling back to in-memory:', err.message);
    // Fallback to in-memory storage
    res.json({ success: true, contacts: inMemoryContacts });
  }
});

// Delete a contact
app.delete('/api/contacts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (useInMemory || !mongoose.connection.readyState) {
      // Use in-memory storage
      const contactIndex = inMemoryContacts.findIndex(c => c._id === id);
      if (contactIndex === -1) {
        return res.status(404).json({ success: false, message: 'Contact not found' });
      }
      inMemoryContacts.splice(contactIndex, 1);
      res.json({ success: true, message: 'Contact deleted successfully!' });
    } else {
      // Use MongoDB
      const result = await Contact.findByIdAndDelete(id);
      if (!result) {
        return res.status(404).json({ success: false, message: 'Contact not found' });
      }
      res.json({ success: true, message: 'Contact deleted successfully!' });
    }
  } catch (err) {
    console.error('Database error, falling back to in-memory:', err.message);
    // Fallback to in-memory storage
    const contactIndex = inMemoryContacts.findIndex(c => c._id === req.params.id);
    if (contactIndex === -1) {
      return res.status(404).json({ success: false, message: 'Contact not found' });
    }
    inMemoryContacts.splice(contactIndex, 1);
    res.json({ success: true, message: 'Contact deleted successfully!' });
  }
});

// SOS endpoint
app.post('/api/sos', upload.single('audio'), async (req, res) => {
  try {
    const { lat, lng, messageType = 'immediate' } = req.body;
    
    // Get contacts from appropriate storage
    let contacts;
    if (useInMemory || !mongoose.connection.readyState) {
      contacts = inMemoryContacts;
    } else {
      try {
        contacts = await Contact.find();
      } catch (err) {
        console.error('Database error in SOS, using in-memory contacts:', err.message);
        contacts = inMemoryContacts;
      }
    }

    // Process audio recording if provided
    let playableFilename = null;
    let recordingUrl = null;
    
    if (req.file) {
      try {
        // Generate unique filename
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const filename = `recording-${uniqueSuffix}.mp3`;
        
        // Convert WebM to MP3 from memory buffer
        const outputBuffer = await new Promise((resolve, reject) => {
          const chunks = [];
          ffmpeg()
            .input(req.file.buffer)
            .toFormat('mp3')
            .on('data', (chunk) => chunks.push(chunk))
            .on('end', () => {
              console.log('Audio conversion completed');
              resolve(Buffer.concat(chunks));
            })
            .on('error', (err) => {
              console.error('Audio conversion error:', err);
              reject(err);
            })
            .run();
        });
        
        // Store in MongoDB GridFS
        if (mongoose.connection.readyState === 1) {
          const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
            bucketName: 'recordings'
          });
          
          const uploadStream = bucket.openUploadStream(filename, {
            metadata: {
              originalName: req.file.originalname,
              mimetype: req.file.mimetype,
              uploadedAt: new Date()
            }
          });
          
          uploadStream.end(outputBuffer);
          
          playableFilename = filename;
          console.log('Audio stored in MongoDB:', playableFilename);
          
          // Get public base URL for recording links
          const publicBase = process.env.PUBLIC_BASE_URL || process.env.VERCEL_URL;
          recordingUrl = publicBase && playableFilename ? `${publicBase.replace(/\/$/, '')}/api/audio/${playableFilename}` : null;
        } else {
          console.warn('MongoDB not connected, audio not stored');
        }
      } catch (err) {
        console.error('Audio processing error:', err);
      }
    }

    // Prepare SMS messages
    const fullBody = `🚨 EMERGENCY SOS! ATTENTION NEEDED NOW 🚨\nLocation: https://www.google.com/maps?q=${lat},${lng}${recordingUrl ? `\nRecording: ${recordingUrl}` : ''}`;
    const plainBody = `SOS ALERT EMERGENCY!!\nLocation: https://www.google.com/maps?q=${lat},${lng}\nRecording: ${recordingUrl || 'Not available'}`;

    // Send SMS and make calls
    const smsResults = [];
    const callResults = [];

    if (client && contacts.length > 0) {
      const fromNumber = process.env.TWILIO_PHONE;
      
      // Send SMS to all contacts
      await Promise.all(contacts.map(async contact => {
        try {
          const isIndia = typeof contact.phone === 'string' && contact.phone.startsWith('+91');
          
          if (isIndia) {
            // For India: send plain message (better delivery)
            const resp = await client.messages.create({
              body: plainBody,
              from: fromNumber,
              to: contact.phone
            });
            smsResults.push({ to: contact.phone, sid: resp.sid, status: 'queued', type: 'plain' });
          } else {
            // Non-India: send full message
            const resp = await client.messages.create({
              body: fullBody,
              from: fromNumber,
              to: contact.phone
            });
            smsResults.push({ to: contact.phone, sid: resp.sid, status: 'queued', type: 'full' });
          }
        } catch (err) {
          smsResults.push({ to: contact.phone, error: err.message, code: err.code });
        }
      }));

      // Make calls to all contacts
      await Promise.all(contacts.map(async contact => {
        try {
          // Create TwiML for call
          let twimlUrl;
          if (recordingUrl) {
            // Use recorded audio if available
            twimlUrl = `http://twimlets.com/message?Message%5B0%5D=Emergency%20SOS%20alert.%20Please%20listen%20to%20the%20recording%20and%20check%20the%20location.%20Recording%20URL%3A%20${encodeURIComponent(recordingUrl)}`;
          } else {
            // Use text-to-speech
            twimlUrl = `http://twimlets.com/message?Message%5B0%5D=Emergency%20SOS%20alert.%20Location%3A%20${lat}%20comma%20${lng}.%20Please%20respond%20immediately.`;
          }

          const call = await client.calls.create({
            url: twimlUrl,
            to: contact.phone,
            from: fromNumber
          });
          
          callResults.push({ to: contact.phone, sid: call.sid, status: 'in-progress' });
        } catch (err) {
          callResults.push({ to: contact.phone, error: err.message, code: err.code });
        }
      }));
    }

    res.json({ 
      success: true, 
      message: 'SOS sent successfully!',
      smsResults,
      callResults,
      recordingUrl
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Something went wrong!' });
  }
});

// Delayed SOS endpoint (for 2-minute follow-up)
app.post('/api/sos-delayed', upload.single('audio'), async (req, res) => {
  try {
    const { lat, lng, originalRecordingUrl } = req.body;
    
    // Get contacts from appropriate storage
    let contacts;
    if (useInMemory || !mongoose.connection.readyState) {
      contacts = inMemoryContacts;
    } else {
      try {
        contacts = await Contact.find();
      } catch (err) {
        console.error('Database error in delayed SOS, using in-memory contacts:', err.message);
        contacts = inMemoryContacts;
      }
    }

    // Process audio recording if provided
    let playableFilename = null;
    let recordingUrl = null;
    
    if (req.file) {
      try {
        // Generate unique filename
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const filename = `recording-${uniqueSuffix}.mp3`;
        
        // Convert WebM to MP3 from memory buffer
        const outputBuffer = await new Promise((resolve, reject) => {
          const chunks = [];
          ffmpeg()
            .input(req.file.buffer)
            .toFormat('mp3')
            .on('data', (chunk) => chunks.push(chunk))
            .on('end', () => {
              console.log('Delayed audio conversion completed');
              resolve(Buffer.concat(chunks));
            })
            .on('error', (err) => {
              console.error('Delayed audio conversion error:', err);
              reject(err);
            })
            .run();
        });
        
        // Store in MongoDB GridFS
        if (mongoose.connection.readyState === 1) {
          const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
            bucketName: 'recordings'
          });
          
          const uploadStream = bucket.openUploadStream(filename, {
            metadata: {
              originalName: req.file.originalname,
              mimetype: req.file.mimetype,
              uploadedAt: new Date()
            }
          });
          
          uploadStream.end(outputBuffer);
          
          playableFilename = filename;
          console.log('Delayed audio stored in MongoDB:', playableFilename);
          
          // Get public base URL for recording links
          const publicBase = process.env.PUBLIC_BASE_URL || process.env.VERCEL_URL;
          recordingUrl = publicBase && playableFilename ? `${publicBase.replace(/\/$/, '')}/api/audio/${playableFilename}` : null;
        } else {
          console.warn('MongoDB not connected, delayed audio not stored');
        }
      } catch (err) {
        console.error('Delayed audio processing error:', err);
      }
    }

    // Prepare delayed SMS messages
    const delayedBody = `🚨 FOLLOW-UP EMERGENCY SOS! 🚨\nThis is a 5-minute follow-up message.\nLocation: https://www.google.com/maps?q=${lat},${lng}${recordingUrl ? `\nNew Recording: ${recordingUrl}` : ''}${originalRecordingUrl ? `\nOriginal Recording: ${originalRecordingUrl}` : ''}\n\nIf you haven't responded yet, please check on this person immediately!`;
    const delayedPlainBody = `FOLLOW-UP SOS ALERT! 5-minute check-in.\nLocation: https://www.google.com/maps?q=${lat},${lng}\nRecording: ${recordingUrl || 'Not available'}\nPlease respond if you haven't already!`;

    // Send delayed SMS and make calls
    const smsResults = [];
    const callResults = [];

    if (client && contacts.length > 0) {
      const fromNumber = process.env.TWILIO_PHONE;
      
      // Send delayed SMS to all contacts
      await Promise.all(contacts.map(async contact => {
        try {
          const isIndia = typeof contact.phone === 'string' && contact.phone.startsWith('+91');
          
          if (isIndia) {
            // For India: send plain message (better delivery)
            const resp = await client.messages.create({
              body: delayedPlainBody,
              from: fromNumber,
              to: contact.phone
            });
            smsResults.push({ to: contact.phone, sid: resp.sid, status: 'queued', type: 'delayed-plain' });
          } else {
            // Non-India: send full message
            const resp = await client.messages.create({
              body: delayedBody,
              from: fromNumber,
              to: contact.phone
            });
            smsResults.push({ to: contact.phone, sid: resp.sid, status: 'queued', type: 'delayed-full' });
          }
        } catch (err) {
          smsResults.push({ to: contact.phone, error: err.message, code: err.code });
        }
      }));

      // Make delayed calls to all contacts
      await Promise.all(contacts.map(async contact => {
        try {
          // Create TwiML for delayed call
          let twimlUrl;
          if (recordingUrl) {
            // Use new recorded audio if available
            twimlUrl = `http://twimlets.com/message?Message%5B0%5D=This%20is%20a%20follow-up%20emergency%20SOS%20alert%20after%205%20minutes.%20Please%20listen%20to%20the%20recording%20and%20check%20the%20location.%20Recording%20URL%3A%20${encodeURIComponent(recordingUrl)}`;
          } else {
            // Use text-to-speech for delayed message
            twimlUrl = `http://twimlets.com/message?Message%5B0%5D=Follow-up%20emergency%20SOS%20alert%20after%205%20minutes.%20Location%3A%20${lat}%20comma%20${lng}.%20Please%20respond%20immediately%20if%20you%20haven%27t%20already.`;
          }

          const call = await client.calls.create({
            url: twimlUrl,
            to: contact.phone,
            from: fromNumber
          });
          
          callResults.push({ to: contact.phone, sid: call.sid, status: 'in-progress', type: 'delayed' });
        } catch (err) {
          callResults.push({ to: contact.phone, error: err.message, code: err.code });
        }
      }));
    }

    res.json({ 
      success: true, 
      message: 'Delayed SOS sent successfully!',
      smsResults,
      callResults,
      recordingUrl
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Something went wrong with delayed SOS!' });
  }
});

// For Vercel deployment, export the app instead of listening
if (process.env.NODE_ENV === 'production') {
  module.exports = app;
} else {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}