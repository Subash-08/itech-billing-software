import 'server-only';
import path from 'node:path';
import {mkdir, realpath, writeFile, readFile, unlink} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {AppError, database} from './db';
import {Identity, tenantFilter} from './security';

export type StoredFile = {
  _id: string;
  tenantId: string;
  createdBy: string;
  key: string;
  name: string;
  type: string;
  size: number;
  status?: 'Active' | 'Orphaned' | 'Deleted';
  storageError?: string;
  createdAt: Date;
  deletedAt?: Date;
};

const idPattern = /^[a-zA-Z0-9_-]{1,128}$/;

export function rfc5987Encode(str: string): string {
  return encodeURIComponent(str)
    .replace(/['()]/g, escape)
    .replace(/\*/g, '%2A');
}

async function root() {
  if (process.env.VERCEL) throw new AppError(503, 'Local storage requires the VPS runtime. Configure an external storage provider for Vercel.');
  const configured = process.env.PRIVATE_STORAGE_ROOT;
  if (!configured || !path.isAbsolute(configured)) throw new AppError(503, 'Configure an absolute PRIVATE_STORAGE_ROOT outside the application directory.');
  const resolved = path.resolve(configured), app = path.resolve(process.cwd());
  if (resolved === app || resolved.startsWith(app + path.sep)) throw new AppError(503, 'Private files must be outside the application and public directories.');
  await mkdir(resolved, {recursive: true, mode: 0o700});
  return realpath(resolved);
}

async function tenantDirectory(tenantId: string) {
  if (!idPattern.test(tenantId)) throw new AppError(403, 'Invalid tenant.');
  const base = await root(), dir = path.join(base, tenantId);
  await mkdir(dir, {recursive: true, mode: 0o700});
  const canonical = await realpath(dir);
  if (!canonical.startsWith(base + path.sep)) throw new AppError(403, 'Invalid storage location.');
  return canonical;
}

function identify(bytes: Uint8Array): { type: string; ext: string } {
  if (bytes.length >= 5 && Buffer.from(bytes.subarray(0, 5)).toString() === '%PDF-') {
    return {type: 'application/pdf', ext: '.pdf'};
  }
  if (bytes.length >= 8 && Buffer.from(bytes.subarray(0, 8)).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return {type: 'image/png', ext: '.png'};
  }
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) {
    return {type: 'image/jpeg', ext: '.jpg'};
  }
  if (
    bytes.length >= 12 &&
    Buffer.from(bytes.subarray(0, 4)).toString() === 'RIFF' &&
    Buffer.from(bytes.subarray(8, 12)).toString() === 'WEBP'
  ) {
    return {type: 'image/webp', ext: '.webp'};
  }
  throw new AppError(400, 'Unsupported file type or size exceeded');
}

export async function storeFile(identity: Identity, file: File) {
  // Validate file size post-parse (max 5 MB)
  if (file.size < 1 || file.size > 5 * 1024 * 1024) {
    throw new AppError(400, 'Unsupported file type or size exceeded');
  }

  // Validate filename extension if present
  const ext = path.extname(file.name).toLowerCase();
  const allowedExts = ['.pdf', '.png', '.jpg', '.jpeg', '.webp'];
  if (ext && !allowedExts.includes(ext)) {
    throw new AppError(400, 'Unsupported file type or size exceeded');
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const format = identify(bytes);

  // Validate declared MIME matches magic bytes
  if (file.type) {
    const declared = file.type.toLowerCase();
    const isJpegMatch = (format.type === 'image/jpeg' && (declared === 'image/jpeg' || declared === 'image/jpg'));
    if (declared !== format.type && !isJpegMatch) {
      throw new AppError(400, 'Unsupported file type or size exceeded');
    }
  }

  const dir = await tenantDirectory(identity.tenantId);
  const id = randomUUID();
  const key = id + format.ext;
  const target = path.join(dir, key);

  await writeFile(target, bytes, {flag: 'wx', mode: 0o600});

  const record: StoredFile = {
    _id: id,
    tenantId: identity.tenantId,
    createdBy: identity.userId,
    key,
    name: file.name.replace(/[\r\n\x00-\x1f]/g, '').slice(0, 180) || key,
    type: format.type,
    size: bytes.length,
    status: 'Active',
    createdAt: new Date(),
  };

  try {
    await (await database()).collection<StoredFile>('files').insertOne(record);
  } catch (e) {
    await unlink(target).catch(() => {});
    throw e;
  }

  return {
    _id: record._id,
    id: record._id,
    name: record.name,
    type: record.type,
    size: record.size,
    url: '/api/files/' + record._id,
  };
}

export async function getFile(identity: Identity, id: string) {
  if (!idPattern.test(id)) throw new AppError(404, 'File not found.');
  const record = await (await database()).collection<StoredFile>('files').findOne(tenantFilter(identity, {_id: id}));
  if (!record || record.status !== 'Active' || !new RegExp('^' + id + '\\.(pdf|png|jpg|webp)$').test(record.key)) {
    throw new AppError(404, 'File not found.');
  }
  const dir = await tenantDirectory(identity.tenantId);
  const file = await realpath(path.join(dir, record.key));
  if (!file.startsWith(dir + path.sep)) throw new AppError(403, 'Invalid file location.');
  return {record, bytes: await readFile(file)};
}

export async function cleanupOrphanFiles(identity: Identity) {
  const db = await database();
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // Tenant-scoped query: find files older than 72 hours that are not marked Deleted
  const candidateFiles = await db.collection<StoredFile>('files').find({
    tenantId: identity.tenantId,
    createdAt: {$lt: cutoff},
    status: {$ne: 'Deleted'},
  }).toArray();

  if (candidateFiles.length === 0) {
    return {markedOrphaned: 0, deletedFromStorage: 0, errors: []};
  }

  // Check referenced files across all relevant collections for this tenant
  const [
    usedPurchases,
    usedWarranties,
    usedClaims,
    usedTenants,
    usedCompanySettings,
    usedServiceJobs,
    usedInvoices,
    usedTemplates,
    usedTemplateRevisions,
  ] = await Promise.all([
    db.collection('purchases').find(
      {tenantId: identity.tenantId, attachmentFileId: {$exists: true, $ne: ''}},
      {projection: {attachmentFileId: 1}}
    ).toArray(),
    db.collection('warranties').find(
      {tenantId: identity.tenantId, $or: [
        {attachmentIds: {$exists: true, $ne: []}},
        {photos: {$exists: true, $ne: []}},
      ]},
      {projection: {attachmentIds: 1, photos: 1}}
    ).toArray(),
    db.collection('warrantyClaims').find(
      {tenantId: identity.tenantId, attachmentIds: {$exists: true, $ne: []}},
      {projection: {attachmentIds: 1}}
    ).toArray(),
    db.collection<any>('tenants').find(
      {_id: identity.tenantId, logoFileId: {$exists: true, $ne: ''}},
      {projection: {logoFileId: 1}}
    ).toArray(),
    db.collection('companySettings').find(
      {tenantId: identity.tenantId, logoFileId: {$exists: true, $ne: ''}},
      {projection: {logoFileId: 1}}
    ).toArray(),
    db.collection('serviceJobs').find(
      {tenantId: identity.tenantId, $or: [
        {'device.photos': {$exists: true, $ne: []}},
        {photos: {$exists: true, $ne: []}},
      ]},
      {projection: {'device.photos': 1, photos: 1}}
    ).toArray(),
    db.collection('invoices').find(
      {tenantId: identity.tenantId, $or: [
        {'sellerSnapshot.logoFileId': {$exists: true, $ne: ''}},
        {'issuedSnapshot.seller.logoFileId': {$exists: true, $ne: ''}},
        {attachmentFileId: {$exists: true, $ne: ''}},
      ]},
      {projection: {'sellerSnapshot.logoFileId': 1, 'issuedSnapshot.seller.logoFileId': 1, attachmentFileId: 1}}
    ).toArray(),
    db.collection('invoiceTemplates').find(
      {tenantId: identity.tenantId, logoFileId: {$exists: true, $ne: ''}},
      {projection: {logoFileId: 1}}
    ).toArray(),
    db.collection('templateRevisions').find(
      {tenantId: identity.tenantId, 'snapshot.logoFileId': {$exists: true, $ne: ''}},
      {projection: {'snapshot.logoFileId': 1}}
    ).toArray(),
  ]);

  const usedIds = new Set<string>();
  const addId = (id: unknown) => {
    if (typeof id === 'string' && id.trim()) usedIds.add(id.trim());
  };
  const addList = (list: unknown) => {
    if (Array.isArray(list)) list.forEach(addId);
  };

  usedPurchases.forEach((p: any) => addId(p.attachmentFileId));
  usedWarranties.forEach((w: any) => {
    addList(w.attachmentIds);
    addList(w.photos);
  });
  usedClaims.forEach((c: any) => addList(c.attachmentIds));
  usedTenants.forEach((t: any) => addId(t.logoFileId));
  usedCompanySettings.forEach((cs: any) => addId(cs.logoFileId));
  usedServiceJobs.forEach((s: any) => {
    addList(s.device?.photos);
    addList(s.photos);
  });
  usedInvoices.forEach((inv: any) => {
    addId(inv.sellerSnapshot?.logoFileId);
    addId(inv.issuedSnapshot?.seller?.logoFileId);
    addId(inv.attachmentFileId);
  });
  usedTemplates.forEach((t: any) => addId(t.logoFileId));
  usedTemplateRevisions.forEach((r: any) => addId(r.snapshot?.logoFileId));

  let markedOrphaned = 0;
  let deletedFromStorage = 0;
  const errors: Array<{ id: string; error: string }> = [];

  for (const file of candidateFiles) {
    if (usedIds.has(file._id)) continue;

    // Step 1: Mark as Orphaned in DB
    await db.collection<StoredFile>('files').updateOne(
      {_id: file._id, tenantId: identity.tenantId},
      {$set: {status: 'Orphaned'}}
    );
    markedOrphaned++;

    // Step 2: Delete underlying storage object
    try {
      const dir = await tenantDirectory(identity.tenantId);
      const filePath = path.join(dir, file.key);
      await unlink(filePath).catch(() => {});

      await db.collection<StoredFile>('files').deleteOne(
        {_id: file._id, tenantId: identity.tenantId}
      );
      deletedFromStorage++;

      await db.collection('auditHistory').insertOne({
        tenantId: identity.tenantId,
        entityType: 'File',
        entityId: file._id,
        action: 'DeleteOrphan',
        timestamp: new Date(),
        userId: identity.userId,
        details: {name: file.name, key: file.key},
      });
    } catch (err: any) {
      const msg = err?.message || 'Storage deletion failed';
      errors.push({id: file._id, error: msg});
      await db.collection<StoredFile>('files').updateOne(
        {_id: file._id, tenantId: identity.tenantId},
        {$set: {storageError: msg}}
      );
    }
  }

  return {deletedCount: deletedFromStorage, markedOrphaned, deletedFromStorage, errors};
}
