import {MongoClient} from 'mongodb';
import {finalizeOpeningSetup, saveOpeningDraft} from './server/master-service.ts';
import fs from 'node:fs';

if (fs.existsSync('.env.local')) process.loadEnvFile('.env.local');

const client = await new MongoClient(process.env.MONGODB_URI).connect();
try {
  const db = client.db(process.env.MONGODB_DB || 'itech_dev');
  // Find a tenant or create a dummy test identity
  const tenant = await db.collection('tenants').findOne({companyName: {$regex: 'Alpha Computer Solutions'}});
  console.log('Found tenant:', tenant?._id);
  if (!tenant) {
    console.log('No Alpha tenant found');
    process.exit(0);
  }
  const identity = {
    userId: 'test-user',
    tenantId: tenant._id,
    sessionId: 'test-session',
  };
  const draft = await db.collection('openingSetups').findOne({tenantId: tenant._id});
  console.log('Current draft in DB:', draft);

  try {
    const res = await finalizeOpeningSetup(identity, {expectedDraftVersion: draft?.draftVersion});
    console.log('finalizeOpeningSetup SUCCESS:', res);
  } catch (err) {
    console.error('finalizeOpeningSetup FAILED:', err);
  }
} finally {
  await client.close();
}
