import {endpoint, requireIdentity, checkOrigin, jsonBody} from '@/server/auth';
import {correctFinalizedOpeningCutoff} from '@/server/master-service';
import {CorrectOpeningCutoffSchema} from '@/server/master-schema';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  return endpoint(async () => {
    checkOrigin(request);
    const identity = await requireIdentity();
    const input = CorrectOpeningCutoffSchema.parse(await jsonBody(request));
    return correctFinalizedOpeningCutoff(identity, input);
  });
}
