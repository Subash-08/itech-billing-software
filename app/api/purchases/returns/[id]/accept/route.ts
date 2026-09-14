import {endpoint, requireIdentity, checkOrigin, jsonBody} from '@/server/auth';
import {database} from '@/server/db';
import {acceptReturnCreditNote} from '@/server/purchase-service';
import {AcceptReturnCreditNoteSchema} from '@/server/purchase-schema';

export const runtime = 'nodejs';

export async function POST(request: Request, context: {params: Promise<{id: string}>}) {
  return endpoint(async () => {
    checkOrigin(request);
    const identity = await requireIdentity();
    const {id} = await context.params;
    const db = await database();
    const body = AcceptReturnCreditNoteSchema.parse(await jsonBody(request));

    return acceptReturnCreditNote(db, identity, id, body);
  });
}
