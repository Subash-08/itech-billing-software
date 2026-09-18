import {endpoint, requireIdentity, checkOrigin, jsonBody} from '@/server/auth';
import {database} from '@/server/db';
import {ShareQuotationSchema} from '@/server/sales-schema';
import {shareQuotation} from '@/server/sales-service';

export const runtime = 'nodejs';

export async function POST(request: Request, context: {params: Promise<{id: string}>}) {
  return endpoint(async () => {
    checkOrigin(request);
    const identity = await requireIdentity();
    const {id} = await context.params;
    const input = ShareQuotationSchema.parse(await jsonBody(request));
    return shareQuotation(await database(), identity, id, input);
  });
}
