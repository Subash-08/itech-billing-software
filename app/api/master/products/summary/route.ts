import {endpoint, requireIdentity} from '@/server/auth';
import {database} from '@/server/db';

export const runtime = 'nodejs';

export async function GET() {
  return endpoint(async () => {
    const {tenantId} = await requireIdentity();
    const db = await database();
    const [products, stockRows] = await Promise.all([
      db.collection<any>('products').find(
        {tenantId, status: 'Active'},
        {projection: {_id: 1, low: 1}}
      ).toArray(),
      db.collection<any>('stockLots').aggregate([
        {$match: {tenantId}},
        {$group: {
          _id: '$productId',
          onHand: {$sum: {$ifNull: ['$quantityRemaining', 0]}},
          available: {$sum: {$ifNull: ['$quantitySellable', 0]}},
          defective: {$sum: {$ifNull: ['$quantityDefective', 0]}},
        }},
      ]).toArray(),
    ]);

    const stock = new Map(stockRows.map((row) => [String(row._id), row]));
    let unitsOnHand = 0;
    let availableToSell = 0;
    let defectiveUnits = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;
    for (const product of products) {
      const row = stock.get(String(product._id));
      const onHand = row?.onHand || 0;
      const available = row?.available || 0;
      unitsOnHand += onHand;
      availableToSell += available;
      defectiveUnits += row?.defective || 0;
      if (available <= (product.low ?? 0)) lowStockCount += 1;
      if (available === 0) outOfStockCount += 1;
    }

    return {
      productCount: products.length,
      unitsOnHand,
      availableToSell,
      lowStockCount,
      outOfStockCount,
      defectiveUnits,
    };
  });
}
