import {endpoint, requireIdentity} from '@/server/auth';
import {database} from '@/server/db';
import {col, canReverseReceipt} from '@/server/purchase-service';
import {PurchaseReceiptDocument} from '@/server/purchase-schema';

export const runtime = 'nodejs';

export async function GET(request: Request, context: {params: Promise<{id: string}>}) {
  return endpoint(async () => {
    const identity = await requireIdentity();
    const {id} = await context.params;
    const db = await database();
    const url = new URL(request.url);

    const page = parseInt(url.searchParams.get('page') || '1', 10);
    const limit = parseInt(url.searchParams.get('limit') || '50', 10);
    const skip = (page - 1) * limit;

    const filter = {tenantId: identity.tenantId, purchaseId: id};
    const [receipts, total] = await Promise.all([
      col<PurchaseReceiptDocument>(db, 'purchaseReceipts')
        .find(filter)
        .sort({receiptDate: -1, createdAt: -1})
        .skip(skip)
        .limit(limit)
        .toArray(),
      col(db, 'purchaseReceipts').countDocuments(filter),
    ]);

    const enriched = await Promise.all(
      receipts.map(async r => {
        const check = await canReverseReceipt(db, identity.tenantId, r);
        return {
          ...r,
          canReverse: check.canReverse,
          reverseBlockReason: check.reverseBlockReason,
        };
      })
    );

    return {
      records: enriched,
      receipts: enriched,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  });
}
