import {MongoClient, ObjectId} from 'mongodb';
import {hashPassword} from 'better-auth/crypto';
import {createHash} from 'node:crypto';

process.loadEnvFile('.env.local');

const client = await new MongoClient(process.env.MONGODB_URI).connect();
const db = client.db('itech_dev');

const tenantId = 'TENANT-EVIDENCE-JOB';
const email = 'evidence.tester@example.com';
const password = 'EvidenceTest123!';

// Clean up old evidence tenant if exists
await db.collection('tenants').deleteOne({_id: tenantId});
await db.collection('authUsers').deleteMany({tenantId});
await db.collection('companySettings').deleteOne({tenantId});
await db.collection('customers').deleteMany({tenantId});
await db.collection('serviceJobs').deleteMany({tenantId});
await db.collection('files').deleteMany({tenantId});

// Insert Tenant
await db.collection('tenants').insertOne({
  _id: tenantId,
  companyName: 'iTech Service Evidence Lab',
  verified: true,
  disabled: false,
  createdAt: new Date(),
});

// Insert User & Account
const userId = new ObjectId();
await db.collection('authUsers').insertOne({
  _id: userId,
  name: 'Evidence Technician',
  email,
  emailVerified: true,
  tenantId,
  verified: true,
  disabled: false,
  createdAt: new Date(),
  updatedAt: new Date(),
});

const hashedPassword = await hashPassword(password);
await db.collection('authAccounts').insertOne({
  _id: new ObjectId(),
  userId,
  accountId: userId.toString(),
  providerId: 'credential',
  password: hashedPassword,
  createdAt: new Date(),
  updatedAt: new Date(),
});

// Company Settings
await db.collection('companySettings').insertOne({
  _id: `sett-${tenantId}`,
  tenantId,
  name: 'iTech Service Evidence Lab',
  storageSettingsVersion: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
});

// Customer
const custId = 'CUST-EVID-001';
await db.collection('customers').insertOne({
  _id: custId,
  tenantId,
  name: 'Anand Sharma',
  phone: '9845012345',
  email: 'anand.sharma@example.com',
  createdAt: new Date(),
});

// Create 3 real PNG image assets in Cloudinary or local storage
// Red 1x1 PNG:
const RED_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEklEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
// Green 1x1 PNG:
const GREEN_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEklEQVR42mNk+M/wHwAEhQGAyPchOQAAAABJRU5ErkJggg==', 'base64');
// Blue 1x1 PNG:
const BLUE_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEklEQVR42mNkYPj/HwAE/QGA8j7N9QAAAABJRU5ErkJggg==', 'base64');

// Upload to Cloudinary authenticated delivery so they genuinely render via /api/files/{id}
async function uploadToCloudinary(bytes, filename, publicIdSuffix) {
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = `itech/${tenantId}`;
  const publicId = `${folder}/${publicIdSuffix}`;
  const type = 'authenticated';
  const overwrite = 'false';

  const signString = `folder=${folder}&overwrite=${overwrite}&public_id=${publicIdSuffix}&timestamp=${timestamp}&type=${type}${process.env.CLOUDINARY_API_SECRET}`;
  const signature = createHash('sha1').update(signString).digest('hex');

  const formData = new FormData();
  formData.append('folder', folder);
  formData.append('public_id', publicIdSuffix);
  formData.append('timestamp', String(timestamp));
  formData.append('type', type);
  formData.append('overwrite', overwrite);
  formData.append('api_key', process.env.CLOUDINARY_API_KEY);
  formData.append('signature', signature);
  formData.append('file', new Blob([bytes], {type: 'image/png'}), filename);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/auto/upload`, {
    method: 'POST',
    body: formData,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Cloudinary upload failed: ${json.error?.message}`);
  return json;
}

console.log('Uploading 3 evidence photos to Cloudinary...');
const p1Res = await uploadToCloudinary(RED_PNG, 'lid-scratch.png', 'photo_lid_scratch');
const p2Res = await uploadToCloudinary(GREEN_PNG, 'keyboard-liquid.png', 'photo_keyboard_liquid');
const p3Res = await uploadToCloudinary(BLUE_PNG, 'serial-tag.png', 'photo_serial_tag');

const now = new Date();
const file1Id = 'FILE-EVID-LID';
const file2Id = 'FILE-EVID-KEY';
const file3Id = 'FILE-EVID-TAG';

await db.collection('files').insertMany([
  {
    _id: file1Id,
    tenantId,
    createdBy: userId.toString(),
    key: `${file1Id}.png`,
    name: 'lid-scratch.png',
    type: 'image/png',
    size: RED_PNG.length,
    status: 'Active',
    storageProvider: 'cloudinary',
    storageConnectionId: 'platform-v1',
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    cloudinaryPublicId: p1Res.public_id,
    cloudinaryResourceType: 'image',
    cloudinaryDeliveryType: 'authenticated',
    checksum: createHash('sha256').update(RED_PNG).digest('hex'),
    createdAt: now,
    updatedAt: now,
  },
  {
    _id: file2Id,
    tenantId,
    createdBy: userId.toString(),
    key: `${file2Id}.png`,
    name: 'keyboard-liquid.png',
    type: 'image/png',
    size: GREEN_PNG.length,
    status: 'Active',
    storageProvider: 'cloudinary',
    storageConnectionId: 'platform-v1',
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    cloudinaryPublicId: p2Res.public_id,
    cloudinaryResourceType: 'image',
    cloudinaryDeliveryType: 'authenticated',
    checksum: createHash('sha256').update(GREEN_PNG).digest('hex'),
    createdAt: now,
    updatedAt: now,
  },
  {
    _id: file3Id,
    tenantId,
    createdBy: userId.toString(),
    key: `${file3Id}.png`,
    name: 'serial-tag.png',
    type: 'image/png',
    size: BLUE_PNG.length,
    status: 'Active',
    storageProvider: 'cloudinary',
    storageConnectionId: 'platform-v1',
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    cloudinaryPublicId: p3Res.public_id,
    cloudinaryResourceType: 'image',
    cloudinaryDeliveryType: 'authenticated',
    checksum: createHash('sha256').update(BLUE_PNG).digest('hex'),
    createdAt: now,
    updatedAt: now,
  },
]);

// Service Job
const jobId = 'JOB-EVIDENCE-001';
await db.collection('serviceJobs').insertOne({
  _id: jobId,
  jobNumber: jobId,
  tenantId,
  customerId: custId,
  customerSnapshot: {
    name: 'Anand Sharma',
    phone: '9845012345',
  },
  device: {
    type: 'Laptop',
    brand: 'Lenovo',
    model: 'ThinkPad T14 Gen 3',
    serialNumber: 'PF3XYZ99',
    accessories: '65W USB-C Charger, Wireless Mouse',
    conditionNotes: 'Intake inspection: Scratches on outer lid, sticky spacebar key.',
    photos: [file1Id, file2Id, file3Id],
  },
  reportedProblem: 'Key chatter on spacebar, display flickers when moved past 90 degrees.',
  diagnosticNotes: 'Hinge display EDP cable seated properly, cleaned liquid residue under spacebar membrane.',
  status: 'Diagnosing',
  estimate: {
    estimatedCostPaise: 245000,
    status: 'Pending',
    revisionHistory: [],
  },
  partsConsumed: [],
  version: 1,
  createdAt: now,
  updatedAt: now,
});

await client.close();

console.log('Seeding complete:');
console.log(`- Tenant: ${tenantId}`);
console.log(`- Email: ${email}`);
console.log(`- Password: ${password}`);
console.log(`- Service Job ID: ${jobId}`);
console.log(`- Photos attached: ${file1Id}, ${file2Id}, ${file3Id}`);
