import {endpoint, requireIdentity} from '@/server/auth';
import {database} from '@/server/db';
import {col, canReverseAllocation} from '@/server/purchase-service';
import {SupplierAllocationDocument} from '@/server/purchase-schema';

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

    const filter = {tenantId: identity.tenantId, targetId: id};
    const [allocations, total] = await Promise.all([
      col<SupplierAllocationDocument>(db, 'supplierAllocations')
        .find(filter)
        .sort({effectiveDate: -1, createdAt: -1})
        .skip(skip)
        .limit(limit)
        .toArray(),
      col(db, 'supplierAllocations').countDocuments(filter),
    ]);

    const enriched = await Promise.all(
      allocations.map(async a => {
        const check = await canReverseAllocation(db, identity.tenantId, a);
        return {
          ...a,
          canReverse: check.canReverse,
          reverseBlockReason: check.reverseBlockReason,
        };
      })
    );

    const paymentIds = [...new Set(allocations.filter(a => a.sourceType === 'Payment').map(a => a.sourceId))];
    const advanceIds = [...new Set(allocations.filter(a => a.sourceType === 'Advance').map(a => a.sourceId))];
    const [payments, advances] = await Promise.all([
      paymentIds.length ? col<any>(db, 'supplierPayments').find(
        {tenantId: identity.tenantId, _id: {$in: paymentIds}},
        {projection: {_id: 1, paymentNumber: 1, components: 1, totalAmountPaise: 1, isReversed: 1}}
      ).toArray() : [],
      advanceIds.length ? col<any>(db, 'supplierAdvances').find(
        {tenantId: identity.tenantId, _id: {$in: advanceIds}},
        {projection: {_id: 1, advanceNumber: 1, sourceType: 1}}
      ).toArray() : [],
    ]);
    const paymentById = new Map(payments.map(p => [p._id, p]));
    const advanceById = new Map(advances.map(a => [a._id, a]));
    const records = enriched.map(a => {
      const payment = a.sourceType === 'Payment' ? paymentById.get(a.sourceId) : undefined;
      const advance = a.sourceType === 'Advance' ? advanceById.get(a.sourceId) : undefined;
      const components = payment?.components || [];
      return {
        ...a,
        sourceLabel: payment?.paymentNumber || advance?.advanceNumber || (a.sourceType === 'CreditNote' ? 'Supplier credit' : a.sourceId),
        sourceAccount: components.map((c: any) => c.account).join(' + ') || (advance ? 'Supplier balance' : 'Supplier credit'),
        sourceMethod: components.map((c: any) => c.method).join(' + ') || (advance?.sourceType === 'CreditNoteExcess' ? 'Return credit' : advance ? 'Advance / available balance' : 'Credit'),
        sourceReference: components.map((c: any) => c.reference).filter(Boolean).join(', '),
      };
    });

    return {
      records,
      allocations: records,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  });
}
