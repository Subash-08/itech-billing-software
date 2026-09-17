import {MongoClient} from 'mongodb';
import {createHash} from 'node:crypto';

process.loadEnvFile('.env.local');

const client = await new MongoClient(process.env.MONGODB_URI).connect();
const db = client.db('itech_dev');

const tenantId = 'TENANT-EVIDENCE-JOB';

const assetsToDelete = [
  `itech/${tenantId}/photo_lid_scratch`,
  `itech/${tenantId}/photo_keyboard_liquid`,
  `itech/${tenantId}/photo_serial_tag`,
];

for (const publicId of assetsToDelete) {
  try {
    const timestamp = Math.floor(Date.now() / 1000);
    const signString = `public_id=${publicId}&timestamp=${timestamp}&type=authenticated${process.env.CLOUDINARY_API_SECRET}`;
    const signature = createHash('sha1').update(signString).digest('hex');
    await fetch(`https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/image/destroy`, {
      method: 'POST',
      body: new URLSearchParams({
        public_id: publicId,
        timestamp: String(timestamp),
        type: 'authenticated',
        api_key: process.env.CLOUDINARY_API_KEY,
        signature,
      }),
    });
  } catch {}
}

// Capture exact fixture user IDs BEFORE removing users. Never delete accounts
// with a broad userId-exists predicate: that removes every company's login.
const fixtureUsers = await db.collection('authUsers').find({tenantId}, {projection: {_id: 1}}).toArray();
const fixtureIds = fixtureUsers.flatMap(user => [user._id, user._id.toString()]);
if (fixtureIds.length) {
  await db.collection('authAccounts').deleteMany({userId: {$in: fixtureIds}});
  await db.collection('authSessions').deleteMany({userId: {$in: fixtureIds}});
}
await db.collection('tenants').deleteOne({_id: tenantId});
await db.collection('authUsers').deleteMany({tenantId});
await db.collection('companySettings').deleteOne({tenantId});
await db.collection('customers').deleteMany({tenantId});
await db.collection('serviceJobs').deleteMany({tenantId});
await db.collection('files').deleteMany({tenantId});

await client.close();
console.log('Evidence fixture cleanup complete.');
