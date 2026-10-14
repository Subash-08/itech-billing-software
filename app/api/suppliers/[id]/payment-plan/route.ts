import {endpoint, requireIdentity} from '@/server/auth';
import {database} from '@/server/db';
import {getSupplierPaymentBills} from '@/server/supplier-payment-plan';
export const runtime = 'nodejs';
export async function GET(_request: Request, context: {params: Promise<{id: string}>}) {
  return endpoint(async () => {
    const identity = await requireIdentity();
    const {id} = await context.params;
    const db = await database();
    const [bills, balances, credits] = await Promise.all([
      getSupplierPaymentBills(db, identity.tenantId, id),
      db.collection('tenantAccountBalances').find({tenantId: identity.tenantId}, {projection: {account: 1, balancePaise: 1}}).toArray(),
      db.collection('supplierAdvances').aggregate([{$match: {tenantId: identity.tenantId, supplierId: id, remainingAmountPaise: {$gt: 0}}},
        {$group: {_id: null, amountPaise: {$sum: '$remainingAmountPaise'}}}]).toArray(),
    ]);
    return {bills, balances, availablePaise: credits[0]?.amountPaise || 0};
  });
}
