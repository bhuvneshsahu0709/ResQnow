const mongoose = require('mongoose');

// Test MongoDB connection
const mongoUri = 'mongodb+srv://bhuvnesh:bhuvnesh@cluster0.nm7zbfj.mongodb.net/sos_app?retryWrites=true&w=majority&appName=Cluster0';

console.log('Testing MongoDB connection...');
console.log('URI:', mongoUri.replace(/\/\/.*@/, '//***:***@')); // Hide credentials

mongoose.connect(mongoUri, { 
  dbName: 'sos_app'
}).then(() => {
  console.log('✅ Connected to MongoDB successfully!');
  process.exit(0);
}).catch((error) => {
  console.error('❌ MongoDB connection failed:', error.message);
  process.exit(1);
});

