import {endpoint, requireIdentity} from '@/server/auth';
import {database} from '@/server/db';
import {todayInKolkata} from '@/server/purchase-schema';

export const runtime = 'nodejs';

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export async function GET() {
  return endpoint(async () => {
    const {tenantId} = await requireIdentity();
    const db = await database();
    const today = todayInKolkata();
    const nextWeek = addDays(today, 7);

    const [purchaseRows, openingRows, activeSuppliers] = await Promise.all([
      db.collection<any>('purchases').aggregate([
        {$match: {tenantId, billStatus: {$in: ['Posted', 'Credited', 'FullyCredited']}, duePaise: {$gt: 0}}},
        {$set: {effectiveDueDate: {$cond: [
          {$and: [{$ne: [{$ifNull: ['$promisedPaymentDate', '']}, '']}, {$gte: ['$promisedPaymentDate', '1900-01-01']}]},
          '$promisedPaymentDate',
          '$dueDate',
        ]}}},
        {$group: {
          _id: '$supplierId',
          duePaise: {$sum: '$duePaise'},
          overduePaise: {$sum: {$cond: [{$and: [{$gte: ['$effectiveDueDate', '1900-01-01']}, {$lt: ['$effectiveDueDate', today]}]}, '$duePaise', 0]}},
          overdueCount: {$sum: {$cond: [{$and: [{$gte: ['$effectiveDueDate', '1900-01-01']}, {$lt: ['$effectiveDueDate', today]}]}, 1, 0]}},
          dueSoonPaise: {$sum: {$cond: [{$and: [{$gte: ['$effectiveDueDate', today]}, {$lte: ['$effectiveDueDate', nextWeek]}]}, '$duePaise', 0]}},
          dueSoonCount: {$sum: {$cond: [{$and: [{$gte: ['$effectiveDueDate', today]}, {$lte: ['$effectiveDueDate', nextWeek]}]}, 1, 0]}},
        }},
      ]).toArray(),
      db.collection<any>('openingPayables').aggregate([
        {$match: {tenantId, remainingAmountPaise: {$gt: 0}}},
        {$group: {_id: '$supplierId', duePaise: {$sum: '$remainingAmountPaise'}}},
      ]).toArray(),
      db.collection('suppliers').countDocuments({tenantId, status: 'Active'}),
    ]);

    const suppliersWithBalance = new Set<string>();
    let totalDuePaise = 0;
    let overduePaise = 0;
    let overdueCount = 0;
    let dueSoonPaise = 0;
    let dueSoonCount = 0;
    for (const row of purchaseRows) {
      suppliersWithBalance.add(String(row._id));
      totalDuePaise += row.duePaise || 0;
      overduePaise += row.overduePaise || 0;
      overdueCount += row.overdueCount || 0;
      dueSoonPaise += row.dueSoonPaise || 0;
      dueSoonCount += row.dueSoonCount || 0;
    }
    for (const row of openingRows) {
      suppliersWithBalance.add(String(row._id));
      totalDuePaise += row.duePaise || 0;
    }

    return {
      activeSuppliers,
      suppliersWithBalance: suppliersWithBalance.size,
      totalDuePaise,
      overduePaise,
      overdueCount,
      dueSoonPaise,
      dueSoonCount,
      dueSoonThrough: nextWeek,
    };
  });
}
