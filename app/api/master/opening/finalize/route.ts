import {endpoint, requireIdentity, checkOrigin, jsonBody} from '@/server/auth';
import {finalizeOpeningSetup} from '@/server/master-service';
import {FinalizeOpeningOptionsSchema} from '@/server/master-schema';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  return endpoint(async () => {
    checkOrigin(request);
    const identity = await requireIdentity();
    let body = {};
    try {
      body = await jsonBody(request);
    } catch {
      // Empty or absent body is acceptable
    }
    const options = FinalizeOpeningOptionsSchema.parse(body || {});
    return finalizeOpeningSetup(identity, options);
  });
}
