require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const mongoose = require('mongoose');
const twilio = require('twilio');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const path = require('path');
const fs = require('fs');

// Set ffmpeg path
ffmpeg.setFfmpegPath(ffmpegStatic);

const app = express();
app.use(cors());
app.use(bodyParser.json());

// MongoDB connection with proper database name
const dbName = process.env.MONGO_DB_NAME || 'sos_app';
const mongoUri = process.env.MONGO_URI;

if (mongoUri) {
  mongoose.connect(mongoUri, { 
    dbName: dbName
  }).then(() => {
    console.log(`Connected to MongoDB database: ${dbName}`);
    useInMemory = false;
  }).catch((error) => {
    console.warn('MongoDB connection failed, using in-memory storage:', error.message);
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
// Configure multer to save files to local storage (simpler approach)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'recording-' + uniqueSuffix + '.webm');
  }
});

const upload = multer({ storage: storage });


// Serve static files from uploads directory (fallback)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ ok: true });
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
        const inputPath = req.file.path;
        const outputPath = inputPath.replace('.webm', '.mp3');
        
        // Convert WebM to MP3
        await new Promise((resolve, reject) => {
          ffmpeg(inputPath)
            .toFormat('mp3')
            .on('end', () => {
              console.log('Audio conversion completed');
              resolve();
            })
            .on('error', (err) => {
              console.error('Audio conversion error:', err);
              reject(err);
            })
            .save(outputPath);
        });
        
        playableFilename = path.basename(outputPath);
        console.log('Audio converted to:', playableFilename);
        
        // Get public base URL for recording links
        const publicBase = process.env.PUBLIC_BASE_URL || process.env.VERCEL_URL;
        recordingUrl = publicBase && playableFilename ? `https://${publicBase.replace(/\/$/, '')}/api/uploads/${playableFilename}` : null;
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
        const inputPath = req.file.path;
        const outputPath = inputPath.replace('.webm', '.mp3');
        
        // Convert WebM to MP3
        await new Promise((resolve, reject) => {
          ffmpeg(inputPath)
            .toFormat('mp3')
            .on('end', () => {
              console.log('Delayed audio conversion completed');
              resolve();
            })
            .on('error', (err) => {
              console.error('Delayed audio conversion error:', err);
              reject(err);
            })
            .save(outputPath);
        });
        
        playableFilename = path.basename(outputPath);
        console.log('Delayed audio converted to:', playableFilename);
        
        // Get public base URL for recording links
        const publicBase = process.env.PUBLIC_BASE_URL || process.env.VERCEL_URL;
        recordingUrl = publicBase && playableFilename ? `https://${publicBase.replace(/\/$/, '')}/api/uploads/${playableFilename}` : null;
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

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));