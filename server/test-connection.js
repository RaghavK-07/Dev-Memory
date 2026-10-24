const { MongoClient } = require('mongodb');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const uri = process.env.MONGODB_URI;
const dbName = process.env.DB_NAME || 'devmemory_db';

console.log('Testing connection to MongoDB Atlas...');
console.log('URI Target:', uri ? uri.replace(/:([^:@]+)@/, ':****@') : 'UNDEFINED');

if (!uri) {
  console.error('ERROR: MONGODB_URI is not defined in .env');
  process.exit(1);
}

const client = new MongoClient(uri, {
  serverSelectionTimeoutMS: 8000,
  connectTimeoutMS: 8000
});

async function run() {
  try {
    await client.connect();
    console.log('Successfully connected to MongoDB Atlas cluster!');

    const db = client.db(dbName);
    const pingRes = await db.command({ ping: 1 });
    console.log('Ping response:', pingRes);

    const collections = await db.listCollections().toArray();
    console.log(`Available collections in "${dbName}":`, collections.map(c => c.name));

    console.log('\nAtlas Connection verified successfully!');
  } catch (err) {
    console.error('Failed to connect to MongoDB Atlas:');
    console.error(err.message);
    if (err.message.includes('bad auth') || err.message.includes('Authentication failed')) {
      console.error('-> Please verify your username and password in .env');
    } else if (err.message.includes('whitelist') || err.message.includes('IP address') || err.message.includes('Server selection timed out')) {
      console.error('-> If timing out, please ensure your IP address is whitelisted in Atlas Network Access (or set to 0.0.0.0/0 for anywhere access).');
    }
    process.exit(1);
  } finally {
    await client.close();
  }
}

run();
