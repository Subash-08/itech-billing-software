// Metadata-only migration. Dry-run by default; no account, file or asset deletion.
import {MongoClient} from 'mongodb';
process.loadEnvFile('.env.local');
const client = new MongoClient(process.env.MONGODB_URI, {serverSelectionTimeoutMS: 10000});
try {
  await client.connect();
  const db = client.db(process.env.MONGODB_DB || 'itech_dev');
  const collection = db.collection('pendingUploads');
  const indexes = await collection.listIndexes().toArray().catch(e => {
    if (e.code === 26) return [];
    throw e;
  });
  const targets = indexes.filter(i => i.expireAfterSeconds !== undefined &&
    Object.keys(i.key).length === 1 && i.key.expiresAt === 1);
  console.log(JSON.stringify({database: db.databaseName, mode: process.argv.includes('--apply') ? 'apply' : 'dry-run', indexes: targets.map(i => i.name)}));
  if (process.argv.includes('--apply')) {
    for (const index of targets) await collection.dropIndex(index.name);
    await collection.createIndex({tenantId: 1, expiresAt: 1});
    console.log('Upload tracking retained. No documents or remote assets deleted.');
  }
} finally { await client.close(); }
