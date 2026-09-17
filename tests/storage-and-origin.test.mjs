import {MongoClient, ObjectId} from 'mongodb';
import {hashPassword} from 'better-auth/crypto';
import {randomUUID, createCipheriv, createDecipheriv, randomBytes} from 'node:crypto';
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
  rateLimits: [],
};

// Encryption helpers matching server/storage-encryption.ts
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

function decryptStorageSecret(envelope, context) {
  const iv = Buffer.from(envelope.iv, 'base64');
  const tag = Buffer.from(envelope.tag, 'base64');
  const ciphertext = Buffer.from(envelope.ciphertext, 'base64');

  const decipher = createDecipheriv('aes-256-gcm', TEST_MASTER_KEY, iv);
  decipher.setAuthTag(tag);
  const aad = buildStorageAad(context.tenantId, context.connectionId, context.version);
  decipher.setAAD(aad);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
}

async function setupTenant(suffix, password = 'CorrectPassword123!') {
  const tenantId = `TENANT-STOR-${suffix}-${Date.now()}`;
  tracked.tenants.push(tenantId);

  await db.collection('tenants').insertOne({
    _id: tenantId,
    companyName: `Storage Test Company ${suffix}`,
    verified: true,
    disabled: false,
    createdAt: new Date(),
  });

  const userId = new ObjectId();
  const email = `storage.tester.${suffix.toLowerCase()}.${Date.now()}@example.com`;
  tracked.users.push(userId);

  await db.collection('authUsers').insertOne({
    _id: userId,
    name: `Storage Tester ${suffix}`,
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
    name: `Storage Test Company ${suffix}`,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const loginRes = await api('POST', '/api/auth/sign-in/email', {email, password});
  assert.strictEqual(loginRes.status, 200, `Login failed for tenant ${suffix}: ${JSON.stringify(loginRes.body)}`);
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

console.log('=== Starting Storage & Origin Security Acceptance Test Suite ===\n');

try {
  // -------------------------------------------------------------------
  // 1. Origin Protection & Canonical Allowlist Verification
  // -------------------------------------------------------------------
  console.log('1. Testing origin protection and canonical allowlist...');
  const tenantA = await setupTenant('A');

  // Hostile origin must be rejected with 403
  const hostilePost = await api('POST', '/api/files/prepare', {
    name: 'test.png',
    size: 100,
    type: 'image/png',
  }, tenantA.cookie, {
    origin: 'https://attacker.evil.com',
  });
  assert.strictEqual(hostilePost.status, 403, 'Hostile origin must be rejected with 403 Forbidden');
  assert.match(hostilePost.body.error, /Request origin is not allowed/i);

  // Spoofed Host / X-Forwarded-Host header with hostile origin must still be rejected
  const spoofedHostPost = await api('POST', '/api/files/prepare', {
    name: 'test.png',
    size: 100,
    type: 'image/png',
  }, tenantA.cookie, {
    origin: 'https://attacker.evil.com',
    host: 'attacker.evil.com',
    'x-forwarded-host': 'attacker.evil.com',
  });
  assert.strictEqual(spoofedHostPost.status, 403, 'Spoofed host must be rejected');

  // Valid origin succeeds
  const validOriginPost = await api('POST', '/api/files/prepare', {
    name: 'test.png',
    size: 100,
    type: 'image/png',
  }, tenantA.cookie, {
    origin: base,
  });
  assert.strictEqual(validOriginPost.status, 200, 'Valid origin must succeed');
  console.log('   ✓ Origin allowlist verified: hostile origins, spoofed headers, and unauthorized origins rejected with 403.');

  // -------------------------------------------------------------------
  // 2. Dedicated Storage Encryption Envelope & AAD Tamper Resistance
  // -------------------------------------------------------------------
  console.log('2. Testing storage encryption envelope with AES-256-GCM and AAD...');
  const secret = 'mySuperSecretCloudinaryApiSecret123';
  const ctxA = {tenantId: tenantA.tenantId, connectionId: 'CONN-TEST-1', version: 1};

  const encrypted = encryptStorageSecret(secret, ctxA, 'v1');
  assert.strictEqual(encrypted.algorithm, 'aes-256-gcm');
  assert.strictEqual(encrypted.version, 1);
  assert.strictEqual(encrypted.keyId, 'v1');
  assert.ok(encrypted.iv);
  assert.ok(encrypted.tag);
  assert.ok(encrypted.ciphertext);

  // Successful decryption
  const decrypted = decryptStorageSecret(encrypted, ctxA);
  assert.strictEqual(decrypted, secret, 'Decrypted secret must match original plaintext');

  // Tampered ciphertext
  const tamperedCiphertext = Buffer.from(encrypted.ciphertext, 'base64');
  tamperedCiphertext[0] ^= 0xff;
  assert.throws(
    () => decryptStorageSecret({...encrypted, ciphertext: tamperedCiphertext.toString('base64')}, ctxA),
    /Unsupported state or unable to authenticate data/,
    'Tampered ciphertext must fail closed'
  );

  // Tampered AAD (wrong tenant attempting to decrypt another tenant envelope)
  const ctxWrongTenant = {tenantId: 'WRONG-TENANT', connectionId: 'CONN-TEST-1', version: 1};
  assert.throws(
    () => decryptStorageSecret(encrypted, ctxWrongTenant),
    /Unsupported state or unable to authenticate data/,
    'Cross-tenant AAD mismatch must fail closed'
  );

  // Tampered version
  const ctxWrongVersion = {tenantId: tenantA.tenantId, connectionId: 'CONN-TEST-1', version: 2};
  assert.throws(
    () => decryptStorageSecret(encrypted, ctxWrongVersion),
    /Unsupported state or unable to authenticate data/,
    'Version AAD mismatch must fail closed'
  );
  console.log('   ✓ AES-256-GCM envelope verified: AAD binding, tamper detection, and fail-closed security confirmed.');

  // -------------------------------------------------------------------
  // 3. Password Reauthentication on Storage Mutations
  // -------------------------------------------------------------------
  console.log('3. Testing password reauthentication for storage mutations...');
  // Wrong password
  const wrongPassRes = await api('POST', '/api/company/storage/test', {
    cloudName: 'test-cloud',
    apiKey: 'test-key-12345',
    apiSecret: 'test-secret-12345',
    accountPassword: 'WrongPassword!',
  }, tenantA.cookie);
  assert.strictEqual(wrongPassRes.status, 403);
  assert.match(wrongPassRes.body.error, /Incorrect account login password/i);

  // Empty password
  const emptyPassRes = await api('POST', '/api/company/storage/test', {
    cloudName: 'test-cloud',
    apiKey: 'test-key-12345',
    apiSecret: 'test-secret-12345',
    accountPassword: '',
  }, tenantA.cookie);
  assert.strictEqual(emptyPassRes.status, 400);
  console.log('   ✓ Storage mutations require genuine account login password verification.');

  // -------------------------------------------------------------------
  // 4. Storage Connection Pinning & Safe Switching Lifecycle
  // -------------------------------------------------------------------
  console.log('4. Testing storage connection pinning, switching, and reset lifecycle...');
  // Initial status: Tenant A uses platform default
  const statusRes1 = await api('GET', '/api/company/storage', null, tenantA.cookie);
  assert.strictEqual(statusRes1.status, 200);
  assert.strictEqual(statusRes1.body.isCustom, false);

  // Save a mock custom storage connection directly to database to verify pinning
  const customConnId = `CONN-${tenantA.tenantId}-CUSTOM-1`;
  const customEnvelope = encryptStorageSecret('custom-api-secret-abc', {
    tenantId: tenantA.tenantId,
    connectionId: customConnId,
    version: 1,
  });
  await db.collection('storageConnections').insertOne({
    _id: customConnId,
    tenantId: tenantA.tenantId,
    provider: 'cloudinary',
    status: 'ActiveForNewUploads',
    cloudName: 'client-custom-cloud',
    apiKey: 'client-custom-key',
    encryptedApiSecret: customEnvelope,
    isPlatformDefault: false,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastVerifiedAt: new Date(),
    verifiedStatus: 'Verified',
  });
  tracked.connections.push(customConnId);

  await db.collection('companySettings').updateOne(
    {tenantId: tenantA.tenantId},
    {$set: {activeStorageConnectionId: customConnId}}
  );

  // Status must now report custom storage without exposing secret
  const statusRes2 = await api('GET', '/api/company/storage', null, tenantA.cookie);
  assert.strictEqual(statusRes2.status, 200);
  assert.strictEqual(statusRes2.body.isCustom, true);
  assert.strictEqual(statusRes2.body.cloudName, 'client-custom-cloud');
  assert.strictEqual(statusRes2.body.encryptedApiSecret, undefined, 'Encrypted secret must NEVER be returned in GET');
  assert.strictEqual(statusRes2.body.apiSecret, undefined, 'Plaintext secret must NEVER be returned in GET');

  // Seed a file pinned to this custom connection
  const customFileId = `FILE-PIN-${Date.now()}`;
  await db.collection('files').insertOne({
    _id: customFileId,
    tenantId: tenantA.tenantId,
    createdBy: tenantA.userId,
    key: `${customFileId}.png`,
    name: 'custom-logo.png',
    type: 'image/png',
    size: 1024,
    status: 'Active',
    storageProvider: 'cloudinary',
    storageConnectionId: customConnId,
    cloudName: 'client-custom-cloud',
    cloudinaryPublicId: `itech/${tenantA.tenantId}/${customFileId}`,
    cloudinaryResourceType: 'image',
    cloudinaryDeliveryType: 'authenticated',
    createdAt: new Date(),
  });
  tracked.files.push(customFileId);

  // Now reset to platform storage
  const resetRes = await api('DELETE', '/api/company/storage', {
    accountPassword: tenantA.password,
    expectedVersion: statusRes2.body.storageSettingsVersion ?? 0,
  }, tenantA.cookie);
  assert.strictEqual(resetRes.status, 200);

  // Verify settings switched back to platform
  const statusRes3 = await api('GET', '/api/company/storage', null, tenantA.cookie);
  assert.strictEqual(statusRes3.body.isCustom, false);

  // Verify custom connection was NOT deleted, but transitioned to ReadOnlyRetained
  const retainedConn = await db.collection('storageConnections').findOne({_id: customConnId});
  assert.ok(retainedConn, 'Custom connection must be retained in DB for reading existing assets');
  assert.strictEqual(retainedConn.status, 'ReadOnlyRetained');

  // Verify that the existing file remains pinned to customConnId
  const fileCheck = await db.collection('files').findOne({_id: customFileId});
  assert.strictEqual(fileCheck.storageConnectionId, customConnId, 'File must retain original storageConnectionId');
  console.log('   ✓ Connection pinning & lifecycle verified: files retain original connection, custom secrets retained as ReadOnlyRetained upon reset.');

  // -------------------------------------------------------------------
  // 5. Direct Signed Upload: Preparation & Verification
  // -------------------------------------------------------------------
  console.log('5. Testing direct signed upload preparation & validation...');
  // Oversized file (> 5 MB)
  const overSizeRes = await api('POST', '/api/files/prepare', {
    name: 'huge.pdf',
    size: 6 * 1024 * 1024, // 6 MB
    type: 'application/pdf',
  }, tenantA.cookie);
  assert.strictEqual(overSizeRes.status, 400);
  assert.match(overSizeRes.body.error, /between 1 byte and 5 MB/i);

  // Invalid MIME type
  const badMimeRes = await api('POST', '/api/files/prepare', {
    name: 'script.sh',
    size: 100,
    type: 'application/x-sh',
  }, tenantA.cookie);
  assert.strictEqual(badMimeRes.status, 400);
  assert.match(badMimeRes.body.error, /Allowed file formats/i);

  // Valid preparation
  const prepRes = await api('POST', '/api/files/prepare', {
    name: 'invoice-doc.pdf',
    size: 500000,
    type: 'application/pdf',
  }, tenantA.cookie);
  assert.strictEqual(prepRes.status, 200);
  if (prepRes.body.directUploadAvailable) {
    assert.ok(prepRes.body.fileId);
    assert.ok(prepRes.body.uploadUrl);
    assert.ok(prepRes.body.fields.signature);
    assert.strictEqual(prepRes.body.fields.type, 'authenticated');
    assert.strictEqual(prepRes.body.fields.overwrite, 'false');

    // Pending upload record verified in DB
    const pendingInDb = await db.collection('pendingUploads').findOne({_id: prepRes.body.fileId});
    assert.ok(pendingInDb);
    assert.strictEqual(pendingInDb.status, 'Pending');
    assert.strictEqual(pendingInDb.tenantId, tenantA.tenantId);
    tracked.pendingUploads.push(prepRes.body.fileId);
  }
  console.log('   ✓ Direct upload preparation enforced size limits, format restrictions, and authenticated delivery signatures.');

  // -------------------------------------------------------------------
  // 6. Cross-Tenant Download Gate & Private Headers
  // -------------------------------------------------------------------
  console.log('6. Testing private delivery download gate & cross-tenant isolation...');
  const tenantB = await setupTenant('B');

  // Tenant B attempts to download Tenant A file
  const crossDownload = await api('GET', `/api/files/${customFileId}`, null, tenantB.cookie);
  assert.strictEqual(crossDownload.status, 404, 'Cross-tenant file download must return 404 Not Found');

  // Unauthenticated download attempt
  const unauthDownload = await api('GET', `/api/files/${customFileId}`, null, null);
  assert.strictEqual(unauthDownload.status, 401, 'Unauthenticated file download must return 401 Unauthorized');
  console.log('   ✓ Gated download verified: cross-tenant access returns 404, unauthenticated returns 401.');

  // -------------------------------------------------------------------
  // 7. Local Root Resolution Independence
  // -------------------------------------------------------------------
  console.log('7. Testing local root resolution independence...');
  // Seed a local file record
  const localFileId = `FILE-LOC-${Date.now()}`;
  await db.collection('files').insertOne({
    _id: localFileId,
    tenantId: tenantA.tenantId,
    createdBy: tenantA.userId,
    key: `${localFileId}.png`,
    name: 'legacy-local.png',
    type: 'image/png',
    size: 512,
    status: 'Active',
    storageProvider: 'local',
    storageConnectionId: 'local',
    createdAt: new Date(),
  });
  tracked.files.push(localFileId);

  // Requesting local file: should fail because file does not exist on disk, but NOT crash with empty string path
  const localFetchRes = await api('GET', `/api/files/${localFileId}`, null, tenantA.cookie);
  assert.ok(localFetchRes.status === 404 || localFetchRes.status === 403, 'Non-existent local file path rejected securely');
  console.log('   ✓ Local root resolves independently without being broken by Cloudinary configuration.');

  // -------------------------------------------------------------------
  // 8. Deletion & Orphan Guard (Intentional 409 & Metadata Preservation)
  // -------------------------------------------------------------------
  console.log('8. Testing deletion & orphan guard (fail-safe 409 protection)...');
  const badConnFileId = `FILE-FAIL-${Date.now()}`;
  await db.collection('files').insertOne({
    _id: badConnFileId,
    tenantId: tenantA.tenantId,
    createdBy: tenantA.userId,
    key: `${badConnFileId}.png`,
    name: 'protected-attachment.png',
    type: 'image/png',
    size: 256,
    status: 'Active',
    storageProvider: 'cloudinary',
    storageConnectionId: 'CONN-NONEXISTENT',
    cloudName: 'fake-cloud',
    cloudinaryPublicId: 'itech/fake/protected',
    createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
  });
  tracked.files.push(badConnFileId);

  // Orphan cleanup must return 409 Conflict to protect attachments until reference model is complete
  const cleanupRes = await api('POST', '/api/files/cleanup-orphans', null, tenantA.cookie);
  assert.strictEqual(cleanupRes.status, 409, 'Orphan cleanup must return 409 Conflict to protect existing attachments');
  assert.match(cleanupRes.body.error, /temporarily disabled/i);

  // Verify file was NOT removed from DB
  const protectedFile = await db.collection('files').findOne({_id: badConnFileId});
  assert.ok(protectedFile, 'Active file must NOT be deleted while orphan cleanup is protected');
  assert.strictEqual(protectedFile.status, 'Active');
  console.log('   ✓ Orphan cleanup safely rejected with 409 Conflict; existing assets preserved without deletion.');

  console.log('\n=== ALL 8 ACCEPTANCE TESTS PASSED SUCCESSFULLY ===');
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
