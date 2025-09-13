require('dotenv').config();
const mongoose = require('mongoose');

async function main() {
  const mongoUri = process.env.MONGO_URI;
  const mongoDbName = process.env.MONGO_DB_NAME || 'sos_app';
  if (!mongoUri || !/^mongodb(\+srv)?:\/\//.test(mongoUri)) {
    console.log('No valid MONGO_URI set. Nothing to clear.');
    process.exit(0);
  }
  await mongoose.connect(mongoUri, { dbName: mongoDbName });
  const Contact = mongoose.model('Contact', new mongoose.Schema({ name: String, phone: String }));
  const result = await Contact.deleteMany({});
  console.log(`Deleted ${result.deletedCount} contact(s) from database ${mongoDbName}.`);
  await mongoose.disconnect();
}

main().catch(err => {
  console.error('Failed to clear contacts:', err.message);
  process.exit(1);
});





