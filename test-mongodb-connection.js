const mongoose = require('mongoose');

// Test MongoDB connection
const testConnection = async () => {
  try {
    const mongoUri = 'mongodb+srv://bhuvnesh:bhuvnesh@cluster0.nm7zbfj.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
    
    console.log('Testing MongoDB connection...');
    console.log('URI:', mongoUri);
    
    await mongoose.connect(mongoUri, { 
      dbName: 'sos_app',
      serverSelectionTimeoutMS: 10000, // 10 seconds timeout
      connectTimeoutMS: 10000
    });
    
    console.log('✅ MongoDB connection successful!');
    console.log('Database:', mongoose.connection.db.databaseName);
    console.log('Ready state:', mongoose.connection.readyState);
    
    // Test a simple operation
    const testSchema = new mongoose.Schema({ test: String });
    const TestModel = mongoose.model('Test', testSchema);
    
    const testDoc = new TestModel({ test: 'connection test' });
    await testDoc.save();
    console.log('✅ Test document saved successfully!');
    
    // Clean up
    await TestModel.deleteOne({ _id: testDoc._id });
    console.log('✅ Test document cleaned up!');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ MongoDB connection failed:');
    console.error('Error:', error.message);
    console.error('Code:', error.code);
    console.error('Name:', error.name);
    
    if (error.message.includes('IP')) {
      console.log('\n🔧 SOLUTION: Add your IP address to MongoDB Atlas Network Access');
      console.log('1. Go to https://cloud.mongodb.com/');
      console.log('2. Select your project');
      console.log('3. Go to Network Access');
      console.log('4. Click "Add IP Address"');
      console.log('5. Choose "Allow access from anywhere" (0.0.0.0/0)');
      console.log('6. Click "Confirm"');
    }
    
    process.exit(1);
  }
};

testConnection();
