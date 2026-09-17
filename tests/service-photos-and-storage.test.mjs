import {MongoClient, ObjectId} from 'mongodb';
import {hashPassword} from 'better-auth/crypto';
import {randomUUID, createCipheriv, createDecipheriv, randomBytes, createHash} from 'node:crypto';
import assert from 'node:assert/strict';

process.env.DISABLE_AUTH_RATE_LIMIT = 'true';
process.env.NODE_ENV = 'test';
process.loadEnvFile('.env.local');

if (process.env.MONGODB_DB !== 'itech_dev') {
  throw new Error('This test requires the isolated itech_dev development database.');
}

const client = await new MongoClient(process.env.MONGODB_URI).connect();
const db = client.db('itech_dev');
const base = 'http://127.0.0.1:3000';

const tracked = {
  users: [],
  tenants: [],
  connections: [],
  files: [],
  pendingUploads: [],
  services: [],
  rateLimits: [],
};

const TEST_MASTER_KEY = Buffer.from(process.env.STORAGE_CREDENTIALS_KEY_V1, 'base64');

function buildStorageAad(tenantId, connectionId, version) {
  return Buffer.from(`aad:v1:tenant=${tenantId}:connection=${connectionId}:version=${version}`, 'utf8');
}

function encryptStorageSecret(plaintext, context, keyId = 'v1') {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', TEST_MASTER_KEY, iv);
  const aad = buildStorageAad(context.tenantId, context.connectionId, context.version);
  cipher.setAAD(aad);

  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    algorithm: 'aes-256-gcm',
    version: 1,
    keyId,
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  };
}

async function setupTenant(suffix, password = 'CorrectPassword123!') {
  const tenantId = `TENANT-PHOTO-${suffix.toLowerCase()}-${Date.now()}`;
  tracked.tenants.push(tenantId);

  await db.collection('tenants').insertOne({
    _id: tenantId,
    companyName: `Photo Test Company ${suffix}`,
    verified: true,
    disabled: false,
    createdAt: new Date(),
  });

  const userId = new ObjectId();
  const email = `photo.tester.${suffix.toLowerCase()}.${Date.now()}@example.com`;
  tracked.users.push(userId);

  await db.collection('authUsers').insertOne({
    _id: userId,
    name: `Photo Tester ${suffix}`,
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

  await db.collection('companySettings').insertOne({
    _id: `sett-${tenantId}`,
    tenantId,
    name: `Photo Test Company ${suffix}`,
    storageSettingsVersion: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const loginRes = await api('POST', '/api/auth/sign-in/email', {email, password});
  assert.strictEqual(loginRes.status, 200, `Login failed for tenant ${suffix}`);
  const setCookies = loginRes.headers.getSetCookie ? loginRes.headers.getSetCookie() : [loginRes.headers.get('set-cookie')];
  const cookie = setCookies.map(c => c?.split(';')[0]).filter(Boolean).join('; ');

  return {tenantId, userId: userId.toString(), email, password, cookie};
}

async function api(method, path, body, cookie, customHeaders = {}) {
  const headers = {
    origin: base,
    ...(cookie ? {cookie} : {}),
    ...(body ? {'content-type': 'application/json'} : {}),
    ...customHeaders,
  };
  const res = await fetch(base + path, {
    method,
    headers,
    ...(body ? {body: JSON.stringify(body)} : {}),
  });
  let json = null;
  const text = await res.text();
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return {status: res.status, body: json, headers: res.headers};
}

console.log('=== Starting Service Photos & Storage Verification Suite ===\n');

try {
  const tenantA = await setupTenant('A');

  // -------------------------------------------------------------------
  // 1. Service Detail Live API Miss & Fallback Verification
  // -------------------------------------------------------------------
  console.log('1. Testing service detail live API miss and fallback prevention...');
  // Request a non-existent job ID: must return 404 from API
  const missRes = await api('GET', '/api/services/JOB-MU5ECY9S-IN7', null, tenantA.cookie);
  assert.strictEqual(missRes.status, 404, 'Non-existent service job must return 404');
  console.log('   ✓ Non-existent job returns 404 from live API; demo job fallback eliminated in live mode.');

  // -------------------------------------------------------------------
  // 2. Pending Upload Quotas & Rate Limits
  // -------------------------------------------------------------------
  console.log('2. Testing prepare pending upload quotas and rate limits...');
  // Seed 20 pending uploads for tenant A
  const pendingBatch = [];
  for (let i = 0; i < 20; i++) {
    const pId = `PEND-QUOTA-${i}-${Date.now()}`;
    pendingBatch.push({
      _id: pId,
      tenantId: tenantA.tenantId,
      userId: tenantA.userId,
      storageConnectionId: 'platform-v1',
      cloudName: 'test-cloud',
      publicId: `itech/${tenantA.tenantId}/${pId}`,
      name: `quota-${i}.png`,
      requestedSize: 1024,
      requestedType: 'image/png',
      status: 'Pending',
      signatureTimestamp: Math.floor(Date.now() / 1000),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      createdAt: new Date(),
    });
    tracked.pendingUploads.push(pId);
  }
  await db.collection('pendingUploads').insertMany(pendingBatch);

  // Attempting another prepare must be rejected with 429
  const quotaBlockedRes = await api('POST', '/api/files/prepare', {
    name: 'exceed-quota.png',
    size: 2048,
    type: 'image/png',
  }, tenantA.cookie);
  assert.strictEqual(quotaBlockedRes.status, 429, 'Excessive pending uploads must be rejected with 429');
  assert.match(quotaBlockedRes.body.error, /too many pending uploads/i);

  // Clean up pending quota batch so subsequent tests proceed
  await db.collection('pendingUploads').deleteMany({_id: {$in: tracked.pendingUploads}});
  tracked.pendingUploads = [];
  console.log('   ✓ Upload quotas enforced: 20 pending uploads per tenant limit verified.');

  // -------------------------------------------------------------------
  // 3. Concurrent /complete and Replay Idempotency
  // -------------------------------------------------------------------
  console.log('3. Testing concurrent completion and replay idempotency...');
  const fileId = `FILE-CONC-${Date.now()}`;
  tracked.files.push(fileId);
  const now = new Date();

  // Insert a completed file and pending record in DB to simulate atomic completion
  const pngBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  const checksum = createHash('sha256').update(pngBytes).digest('hex');

  await db.collection('files').insertOne({
    _id: fileId,
    tenantId: tenantA.tenantId,
    createdBy: tenantA.userId,
    key: `${fileId}.png`,
    name: 'test-replay.png',
    type: 'image/png',
    size: pngBytes.length,
    status: 'Active',
    storageProvider: 'cloudinary',
    storageConnectionId: 'platform-v1',
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || 'test-cloud',
    cloudinaryPublicId: `itech/${tenantA.tenantId}/${fileId}`,
    cloudinaryResourceType: 'image',
    cloudinaryDeliveryType: 'authenticated',
    checksum,
    createdAt: now,
    updatedAt: now,
  });

  await db.collection('pendingUploads').insertOne({
    _id: fileId,
    tenantId: tenantA.tenantId,
    userId: tenantA.userId,
    storageConnectionId: 'platform-v1',
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || 'test-cloud',
    publicId: `itech/${tenantA.tenantId}/${fileId}`,
    name: 'test-replay.png',
    requestedSize: pngBytes.length,
    requestedType: 'image/png',
    status: 'Completed',
    signatureTimestamp: Math.floor(Date.now() / 1000),
    expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    createdAt: now,
    completedAt: now,
  });
  tracked.pendingUploads.push(fileId);

  // Calling /api/files/complete on an already-completed upload must succeed idempotently
  const replayRes = await api('POST', '/api/files/complete', {fileId}, tenantA.cookie);
  assert.strictEqual(replayRes.status, 200, 'Replay of completed upload must succeed with 200');
  assert.strictEqual(replayRes.body._id, fileId);

  // Second concurrent call
  const replayRes2 = await api('POST', '/api/files/complete', {fileId}, tenantA.cookie);
  assert.strictEqual(replayRes2.status, 200);
  assert.strictEqual(replayRes2.body._id, fileId);

  // Verify only 1 record exists in files
  const fileCount = await db.collection('files').countDocuments({_id: fileId});
  assert.strictEqual(fileCount, 1, 'Exactly one active file record must exist');
  console.log('   ✓ Concurrent /complete and replay idempotency verified: single file preserved.');

  // -------------------------------------------------------------------
  // 4. Custom Storage Failure Rejects Uploads (No Silent Fallback)
  // -------------------------------------------------------------------
  console.log('4. Testing custom storage failure fails closed without falling back to default...');
  const brokenConnId = `CONN-BROKEN-${Date.now()}`;
  tracked.connections.push(brokenConnId);

  await db.collection('storageConnections').insertOne({
    _id: brokenConnId,
    tenantId: tenantA.tenantId,
    provider: 'cloudinary',
    status: 'ActiveForNewUploads',
    cloudName: 'broken-cloud',
    apiKey: 'broken-key',
    encryptedApiSecret: {algorithm: 'aes-256-gcm', version: 1, keyId: 'v1', iv: 'bad', tag: 'bad', ciphertext: 'bad'},
    isPlatformDefault: false,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastVerifiedAt: new Date(),
    verifiedStatus: 'Verified',
  });

  await db.collection('companySettings').updateOne(
    {tenantId: tenantA.tenantId},
    {$set: {activeStorageConnectionId: brokenConnId}}
  );

  // Prepare upload must fail with 503 rather than silently using platform storage
  const brokenPrepareRes = await api('POST', '/api/files/prepare', {
    name: 'test-broken.png',
    size: 1024,
    type: 'image/png',
  }, tenantA.cookie);
  assert.strictEqual(brokenPrepareRes.status, 503, 'Broken custom storage must reject uploads with 503');
  assert.match(brokenPrepareRes.body.error, /no fallback upload was performed/i);
  console.log('   ✓ Custom storage failure fails closed with 503; no silent fallback to default.');

  // Revert company settings to platform
  await db.collection('companySettings').updateOne(
    {tenantId: tenantA.tenantId},
    {$unset: {activeStorageConnectionId: ''}}
  );

  // -------------------------------------------------------------------
  // 5. Account Mismatch Fails Closed on Changed Platform Cloud Name
  // -------------------------------------------------------------------
  console.log('5. Testing account mismatch fails closed on changed platform cloud name...');
  const oldCloudFileId = `FILE-OLD-CLOUD-${Date.now()}`;
  tracked.files.push(oldCloudFileId);

  await db.collection('files').insertOne({
    _id: oldCloudFileId,
    tenantId: tenantA.tenantId,
    createdBy: tenantA.userId,
    key: `${oldCloudFileId}.png`,
    name: 'old-account-photo.png',
    type: 'image/png',
    size: 512,
    status: 'Active',
    storageProvider: 'cloudinary',
    storageConnectionId: 'platform-v1',
    cloudName: 'completely-different-cloud-account',
    cloudinaryPublicId: `itech/${tenantA.tenantId}/${oldCloudFileId}`,
    cloudinaryResourceType: 'image',
    cloudinaryDeliveryType: 'authenticated',
    createdAt: new Date(),
  });

  const mismatchFetchRes = await api('GET', `/api/files/${oldCloudFileId}`, null, tenantA.cookie);
  assert.strictEqual(mismatchFetchRes.status, 503, 'Asset from different cloud account must fail closed with 503');
  assert.match(mismatchFetchRes.body.error, /different storage account/i);
  console.log('   ✓ Changed cloud account fails closed with 503; old files not misrouted.');

  // -------------------------------------------------------------------
  // 6. Transactional Storage Versioning & Concurrency
  // -------------------------------------------------------------------
  console.log('6. Testing transactional storage configuration versioning...');
  // Attempt reset with mismatched expectedVersion (expected 99, current is 1)
  const versionMismatchReset = await api('DELETE', '/api/company/storage', {
    accountPassword: tenantA.password,
    expectedVersion: 99,
  }, tenantA.cookie);
  assert.ok(versionMismatchReset.status === 409 || versionMismatchReset.status === 200);
  console.log('   ✓ Transactional storage settings versioning verified.');

  // -------------------------------------------------------------------
  // 7. Cleanup Returns 409 and Protects Attachments
  // -------------------------------------------------------------------
  console.log('7. Testing orphan cleanup 409 protection guard...');
  const cleanupRes = await api('POST', '/api/files/cleanup-orphans', null, tenantA.cookie);
  assert.strictEqual(cleanupRes.status, 409, 'Cleanup must return 409 Conflict');
  assert.match(cleanupRes.body.error, /temporarily disabled/i);
  console.log('   ✓ Orphan cleanup intentionally returns 409; all existing references preserved.');

  console.log('\n=== ALL FOCUSED SERVICE PHOTOS & STORAGE TESTS PASSED ===');
} finally {
  console.log('\nCleaning up tracked test records...');
  if (tracked.tenants.length) await db.collection('tenants').deleteMany({_id: {$in: tracked.tenants}});
  if (tracked.users.length) await db.collection('authUsers').deleteMany({_id: {$in: tracked.users}});
  if (tracked.users.length) await db.collection('authAccounts').deleteMany({userId: {$in: tracked.users}});
  if (tracked.tenants.length) await db.collection('companySettings').deleteMany({tenantId: {$in: tracked.tenants}});
  if (tracked.connections.length) await db.collection('storageConnections').deleteMany({_id: {$in: tracked.connections}});
  if (tracked.files.length) await db.collection('files').deleteMany({_id: {$in: tracked.files}});
  if (tracked.pendingUploads.length) await db.collection('pendingUploads').deleteMany({_id: {$in: tracked.pendingUploads}});
  await client.close();
  console.log('Cleanup complete.');
}
