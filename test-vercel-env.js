// Test script to check environment variables in Vercel
console.log('=== Environment Variables Test ===');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('MONGO_URI:', process.env.MONGO_URI ? 'SET' : 'NOT SET');
console.log('MONGO_DB_NAME:', process.env.MONGO_DB_NAME);
console.log('PUBLIC_BASE_URL:', process.env.PUBLIC_BASE_URL);
console.log('VERCEL_URL:', process.env.VERCEL_URL);
console.log('================================');
