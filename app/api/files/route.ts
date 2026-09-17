import {checkOrigin, endpoint, requireIdentity, jsonBody} from '@/server/auth';
import {AppError} from '@/server/db';
import {storeFile} from '@/server/storage';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  return endpoint(async () => {
    checkOrigin(request);
    const identity = await requireIdentity();
    const size = Number(request.headers.get('content-length'));
    if (!Number.isFinite(size) || size <= 0 || size > 11 * 1024 * 1024) {
      throw new AppError(413, 'Upload must have a known size below 11 MB.');
    }

    const contentType = request.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const body = await jsonBody(request).catch(() => ({}));
      if (!body || !body.dataBase64 || !body.name) {
        throw new AppError(400, 'Select a file.');
      }
      const buffer = Buffer.from(body.dataBase64, 'base64');
      const file = new File([buffer], body.name, {type: body.contentType || 'application/octet-stream'});
      return storeFile(identity, file);
    }

    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      throw new AppError(400, 'Select a file.');
    }
    return storeFile(identity, file);
  });
}

export async function GET() {
  return endpoint(async () => {
    await requireIdentity();
    const isVercel = !!process.env.VERCEL;
    const isConfigured = !!process.env.PRIVATE_STORAGE_ROOT && !isVercel;
    return {
      provider: isVercel ? 'Vercel Ephemeral (External Adapter Required)' : 'Private Filesystem',
      configured: isConfigured,
      status: isConfigured ? 'Ready' : isVercel ? 'Adapter Required' : 'Not Configured',
      uploadsAvailable: isConfigured,
      maxFileSizeMb: 5,
      allowedTypes: ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'],
    };
  });
}

