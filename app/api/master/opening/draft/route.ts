import {endpoint, requireIdentity, checkOrigin, jsonBody} from '@/server/auth';
import {saveOpeningDraft, getOpeningSetup} from '@/server/master-service';
import {OpeningDraftSchema} from '@/server/master-schema';

export const runtime = 'nodejs';

export async function GET() {
  return endpoint(async () => {
    const identity = await requireIdentity();
    return getOpeningSetup(identity);
  });
}

export async function PUT(request: Request) {
  return endpoint(async () => {
    checkOrigin(request);
    const identity = await requireIdentity();
    const body = OpeningDraftSchema.parse(await jsonBody(request));
    return saveOpeningDraft(identity, body);
  });
}

export const POST = PUT;


