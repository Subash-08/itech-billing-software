import {endpoint, requireIdentity} from '@/server/auth';
import {database} from '@/server/db';
import {col} from '@/server/purchase-service';
import {SupplierHistoryQuerySchema} from '@/server/purchase-schema';

export const runtime = 'nodejs';

export async function GET(request: Request, context: {params: Promise<{id: string}>}) {
  return endpoint(async () => {
    const identity = await requireIdentity();
    const {id} = await context.params;
    const db = await database();
    const url = new URL(request.url);

    const {page, limit, dateFrom, dateTo} = SupplierHistoryQuerySchema.parse(Object.fromEntries(url.searchParams.entries()));
    const skip = (page - 1) * limit;
    const dateMatch: Record<string, any> = {};
    if (dateFrom) dateMatch.$gte = dateFrom;
    if (dateTo) dateMatch.$lte = dateTo;
    const pipeline: any[] = [
      {$match: {tenantId: identity.tenantId, supplierId: id, status: {$ne: 'Settled'}, remainingAmountPaise: {$gt: 0}}},
      {$project: {
        _id: 1, id: '$_id', payableType: {$literal: 'OpeningPayable'},
        reference: {$ifNull: ['$reference', 'Opening Balance']},
        date: {$ifNull: ['$date', '$cutoffDate']}, originalAmountPaise: 1,
        remainingDuePaise: '$remainingAmountPaise', createdAt: {$ifNull: ['$createdAt', new Date(0)]},
      }},
      {$unionWith: {coll: 'purchases', pipeline: [
        {$match: {tenantId: identity.tenantId, supplierId: id, billStatus: 'Posted', duePaise: {$gt: 0}}},
        {$unwind: '$lines'},
        {$match: {'lines.remainingDuePaise': {$gt: 0}}},
        {$project: {
          _id: {$concat: ['$_id', ':', '$lines.lineId']}, id: {$concat: ['$_id', ':', '$lines.lineId']},
          payableType: {$literal: 'PurchaseLine'}, purchaseId: '$_id', purchaseNumber: 1,
          supplierInvoiceNumber: 1, purchaseLineId: '$lines.lineId', lineType: '$lines.lineType',
          description: {$cond: [{$eq: ['$lines.lineType', 'Product']}, '$lines.productSnapshot.name', '$lines.description']},
          date: {$ifNull: ['$postingDate', '$orderDate']}, originalAmountPaise: '$lines.totalPaise',
          remainingDuePaise: '$lines.remainingDuePaise', createdAt: 1,
        }},
      ]}},
    ];
    if (Object.keys(dateMatch).length) pipeline.push({$match: {date: dateMatch}});
    pipeline.push(
      {$sort: {date: 1, createdAt: 1, _id: 1}},
      {$facet: {records: [{$skip: skip}, {$limit: limit}], count: [{$count: 'total'}]}},
    );
    const [result] = await col(db, 'openingPayables').aggregate(pipeline).toArray();
    const sliced = result?.records || [];
    const total = result?.count?.[0]?.total || 0;

    return {
      records: sliced,
      payables: sliced,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  });
}
