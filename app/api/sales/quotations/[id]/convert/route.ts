import {endpoint, requireIdentity, checkOrigin, jsonBody} from '@/server/auth';
import {database, AppError} from '@/server/db';
import {convertQuotationToDraft} from '@/server/sales-service';
import {ConvertQuotationSchema} from '@/server/sales-schema';

export const runtime = 'nodejs';

export async function POST(request: Request, context: {params: Promise<{id: string}>}) {
  return endpoint(async () => {
    checkOrigin(request);
    const identity = await requireIdentity();
    const {id} = await context.params;
    const db = await database();
    const body = ConvertQuotationSchema.parse(await jsonBody(request));
    if (body.quotationId !== id) {
      throw new AppError(400, 'quotationId in body must match the URL parameter.');
    }
    return convertQuotationToDraft(db, identity, body);
  });
}
