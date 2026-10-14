import {z} from 'zod';
import {endpoint, requireIdentity, checkOrigin, jsonBody} from '@/server/auth';
import {database, AppError} from '@/server/db';
import {executeIdempotentTransaction, allocateSupplierAdvance, recordSupplierPayment, col} from '@/server/purchase-service';
import {getSupplierPaymentBills} from '@/server/supplier-payment-plan';
import {planSupplierSettlement} from '@/lib/supplier-payment-plan';
import {PaymentComponentInputSchema, todayInKolkata} from '@/server/purchase-schema';
import {lockBusinessDay} from '@/server/business-day';
export const runtime = 'nodejs';
const schema = z.object({
  components: z.array(PaymentComponentInputSchema).max(2),
  selectedBillIds: z.array(z.string().min(1)).min(1).max(500).optional(),
  useAvailableBalance: z.boolean(), allowExcess: z.boolean(), notes: z.string().trim().max(500),
  expectedPlan: z.string().max(100000), idempotencyKey: z.string().min(1).max(128),
}).strict();
export async function POST(request: Request, context: {params: Promise<{id: string}>}) {
  return endpoint(async () => {
    checkOrigin(request);
    const identity = await requireIdentity();
    const {id} = await context.params;
    const input = schema.parse(await jsonBody(request));
    const db = await database();
    return executeIdempotentTransaction(db, identity, input.idempotencyKey, 'SupplierBillSettlement', id, input, async session => {
      await lockBusinessDay(db, session, identity.tenantId);
      const bills = await getSupplierPaymentBills(db, identity.tenantId, id, session);
      const advances = input.useAvailableBalance ? await col(db, 'supplierAdvances').find({tenantId: identity.tenantId,
        supplierId: id, remainingAmountPaise: {$gt: 0}}, {session}).sort({createdAt: 1, _id: 1}).limit(501).toArray() : [];
      if (advances.length > 500) throw new AppError(400, 'Apply existing balances in smaller batches first.');
      const cashPaise = input.components.reduce((s, c) => s + c.amountPaise, 0);
      const plan = planSupplierSettlement(bills, cashPaise, advances.reduce((s, a) => s + a.remainingAmountPaise, 0), input.selectedBillIds);
      if (JSON.stringify(plan) !== input.expectedPlan) throw new AppError(409, 'Balances changed. Refresh and review the payment preview.');
      if (!cashPaise && !plan.creditUsedPaise) throw new AppError(400, 'Enter a payment or apply available supplier balance.');
      if (plan.excessPaise && !input.allowExcess) throw new AppError(400, 'Confirm keeping the extra payment for future bills.');
      if (plan.credit.length + plan.payment.length > 100) throw new AppError(400, 'Select fewer bills; up to 100 bill lines can be settled at once.');
      const date = todayInKolkata();
      const pending = plan.credit.map(a => ({...a}));
      for (const advance of advances) {
        let remaining = advance.remainingAmountPaise;
        const allocations = [];
        for (const target of pending) {
          const amountPaise = Math.min(remaining, target.amountPaise);
          if (amountPaise > 0) allocations.push({...target, amountPaise});
          remaining -= amountPaise;
          target.amountPaise -= amountPaise;
        }
        if (allocations.length) await allocateSupplierAdvance(db, identity, advance._id, {allocations, effectiveDate: date, idempotencyKey: input.idempotencyKey});
      }
      const payment = cashPaise ? await recordSupplierPayment(db, identity, {
        supplierId: id, date, components: input.components, allocations: plan.payment, recordExcessAsAdvance: input.allowExcess,
        notes: input.notes, idempotencyKey: input.idempotencyKey,
      }) : null;
      return {success: true, payment, creditUsedPaise: plan.creditUsedPaise, excessPaise: plan.excessPaise};
    });
  });
}
