import {endpoint, requireIdentity, checkOrigin, jsonBody} from '@/server/auth';
import {database, AppError} from '@/server/db';
import {reopenQuotation} from '@/server/sales-service';
import {ReopenQuotationSchema} from '@/server/sales-schema';

export const runtime = 'nodejs';

export async function POST(request: Request, context: {params: Promise<{id: string}>}) {
  return endpoint(async () => {
    checkOrigin(request);
    const identity = await requireIdentity();
    const {id} = await context.params;
    const db = await database();
    const body = ReopenQuotationSchema.parse(await jsonBody(request));
    return reopenQuotation(db, identity, id, body);
  });
}
