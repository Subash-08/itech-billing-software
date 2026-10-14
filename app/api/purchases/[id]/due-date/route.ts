import {endpoint, requireIdentity, checkOrigin, jsonBody} from '@/server/auth';
import {database, AppError} from '@/server/db';
import {col, executeIdempotentTransaction} from '@/server/purchase-service';
import {recordAudit} from '@/server/audit';
import {CalendarDateSchema, todayInKolkata} from '@/server/purchase-schema';
import {z} from 'zod';
const schema = z.object({promisedPaymentDate: CalendarDateSchema, notes: z.string().trim().min(1, 'Enter a reason for changing the deadline.').max(500),
  expectedVersion: z.number().int().optional(), idempotencyKey: z.string().min(1).max(128).optional()}).strict();
export const runtime = 'nodejs';
export async function PATCH(request: Request, context: {params: Promise<{id: string}>}) {
  return endpoint(async () => {
    checkOrigin(request);
    const identity = await requireIdentity();
    const db = await database();
    const {id} = await context.params;
    const input = schema.parse(await jsonBody(request));
    if (input.promisedPaymentDate < todayInKolkata()) throw new AppError(400, 'Choose today or a future payment deadline.');
    return executeIdempotentTransaction(db, identity, input.idempotencyKey || `deadline:${id}:${input.expectedVersion}:${input.promisedPaymentDate}`, 'SupplierDeadline', id, input, async session => {
      const purchase = await col(db, 'purchases').findOne({_id: id, tenantId: identity.tenantId}, {session});
      if (!purchase) throw new AppError(404, 'Purchase not found.');
      if (!['Posted', 'Credited', 'FullyCredited'].includes(purchase.billStatus) || purchase.duePaise <= 0) throw new AppError(400, 'Only unpaid recorded bills need a payment deadline.');
      if (input.expectedVersion !== undefined && (purchase.version || 0) !== input.expectedVersion) throw new AppError(409, 'Bill changed. Reload before extending its deadline.');
      const result = await col(db, 'purchases').updateOne({_id: id, tenantId: identity.tenantId,
        ...(purchase.version == null ? {version: {$exists: false}} : {version: purchase.version}), duePaise: {$gt: 0}},
        {$set: {promisedPaymentDate: input.promisedPaymentDate, promisedDateNotes: input.notes, updatedAt: new Date(), updatedBy: identity.userId}, $inc: {version: 1}}, {session});
      if (result.matchedCount !== 1) throw new AppError(409, 'Bill changed. Reload before extending its deadline.');
      await recordAudit(db, {identity, action: 'Update', entityType: 'purchase', entityId: id,
        detail: `Payment deadline ${purchase.promisedPaymentDate || purchase.dueDate || 'unset'} → ${input.promisedPaymentDate}. ${input.notes}`}, session);
      return {success: true, purchaseId: id, promisedPaymentDate: input.promisedPaymentDate};
    });
  });
}
