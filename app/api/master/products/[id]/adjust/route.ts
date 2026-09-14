import {endpoint, requireIdentity, checkOrigin, jsonBody} from '@/server/auth';
import {adjustProductStock} from '@/server/master-service';
import {StockAdjustmentInputSchema} from '@/server/master-schema';

export const runtime = 'nodejs';

export async function POST(request: Request, context: {params: Promise<{id: string}>}) {
  return endpoint(async () => {
    checkOrigin(request);
    const identity = await requireIdentity();
    const {id} = await context.params;
    const body = StockAdjustmentInputSchema.parse(await jsonBody(request));
    return adjustProductStock(identity, id, body);
  });
}
