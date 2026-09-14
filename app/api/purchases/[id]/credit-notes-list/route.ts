import {endpoint, requireIdentity} from '@/server/auth';
import {database} from '@/server/db';
import {col, canReverseCreditNote} from '@/server/purchase-service';
import {SupplierCreditNoteDocument} from '@/server/purchase-schema';

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
    const [creditNotes, total] = await Promise.all([
      col<SupplierCreditNoteDocument>(db, 'supplierCreditNotes')
        .find(filter)
        .sort({date: -1, createdAt: -1})
        .skip(skip)
        .limit(limit)
        .toArray(),
      col(db, 'supplierCreditNotes').countDocuments(filter),
    ]);

    const enriched = await Promise.all(
      creditNotes.map(async cn => {
        const check = await canReverseCreditNote(db, identity.tenantId, cn);
        return {
          ...cn,
          canReverse: check.canReverse,
          reverseBlockReason: check.reverseBlockReason,
        };
      })
    );

    return {
      records: enriched,
      creditNotes: enriched,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  });
}
