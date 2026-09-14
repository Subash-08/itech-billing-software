import {endpoint, requireIdentity, checkOrigin, jsonBody} from '@/server/auth';
import {database, AppError} from '@/server/db';
import {
  updatePurchaseDraft,
  col,
  canReverseReceipt,
  canReverseAllocation,
  canReverseCreditNote,
  canReverseSupplierReturn,
} from '@/server/purchase-service';
import {UpdatePurchaseDraftSchema, PurchaseDocument} from '@/server/purchase-schema';

export const runtime = 'nodejs';

export async function GET(_request: Request, context: {params: Promise<{id: string}>}) {
  return endpoint(async () => {
    const identity = await requireIdentity();
    const {id} = await context.params;
    const db = await database();

    const purchase = await col<PurchaseDocument>(db, 'purchases').findOne({_id: id, tenantId: identity.tenantId});
    if (!purchase) throw new AppError(404, 'Purchase record not found.');

    const [rawReceipts, rawAllocations, rawCreditNotes, rawReturns] = await Promise.all([
      col(db, 'purchaseReceipts').find({tenantId: identity.tenantId, purchaseId: id}).sort({receiptDate: -1}).limit(50).toArray(),
      col(db, 'supplierAllocations').find({tenantId: identity.tenantId, targetId: id}).sort({effectiveDate: -1}).limit(50).toArray(),
      col(db, 'supplierCreditNotes').find({tenantId: identity.tenantId, purchaseId: id}).sort({date: -1}).limit(50).toArray(),
      col(db, 'supplierReturns').find({tenantId: identity.tenantId, purchaseId: id}).sort({date: -1}).limit(50).toArray(),
    ]);

    const [receipts, allocations, creditNotes, returns] = await Promise.all([
      Promise.all(rawReceipts.map(async (r: any) => {
        const c = await canReverseReceipt(db, identity.tenantId, r);
        return {...r, canReverse: c.canReverse, reverseBlockReason: c.reverseBlockReason};
      })),
      Promise.all(rawAllocations.map(async (a: any) => {
        const c = await canReverseAllocation(db, identity.tenantId, a);
        return {...a, canReverse: c.canReverse, reverseBlockReason: c.reverseBlockReason};
      })),
      Promise.all(rawCreditNotes.map(async (cn: any) => {
        const c = await canReverseCreditNote(db, identity.tenantId, cn);
        return {...cn, canReverse: c.canReverse, reverseBlockReason: c.reverseBlockReason};
      })),
      Promise.all(rawReturns.map(async (ret: any) => {
        const c = await canReverseSupplierReturn(db, identity.tenantId, ret);
        return {...ret, canReverse: c.canReverse, reverseBlockReason: c.reverseBlockReason};
      })),
    ]);

    return {
      purchase,
      receipts,
      allocations,
      creditNotes,
      returns,
    };
  });
}

export async function PUT(request: Request, context: {params: Promise<{id: string}>}) {
  return endpoint(async () => {
    checkOrigin(request);
    const identity = await requireIdentity();
    const {id} = await context.params;
    const db = await database();
    const body = UpdatePurchaseDraftSchema.parse(await jsonBody(request));

    return updatePurchaseDraft(db, identity, id, body);
  });
}
