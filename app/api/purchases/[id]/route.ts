import {endpoint, requireIdentity, checkOrigin, jsonBody} from '@/server/auth';
import {database, AppError} from '@/server/db';
import {
  updatePurchaseDraft,
  col,
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

    // Histories are loaded by their paginated tab endpoints. Loading them here as
    // well caused duplicate reads and an N+1 reversal-eligibility query for every
    // row before the purchase page could render.
    const [receiptCount, allocationCount, creditNoteCount, returnCount] = await Promise.all([
      col(db, 'purchaseReceipts').countDocuments({tenantId: identity.tenantId, purchaseId: id}),
      col(db, 'supplierAllocations').countDocuments({tenantId: identity.tenantId, targetId: id}),
      col(db, 'supplierCreditNotes').countDocuments({tenantId: identity.tenantId, purchaseId: id}),
      col(db, 'supplierReturns').countDocuments({tenantId: identity.tenantId, purchaseId: id}),
    ]);

    return {
      purchase,
      historyCounts: {receiptCount, allocationCount, creditNoteCount, returnCount},
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
