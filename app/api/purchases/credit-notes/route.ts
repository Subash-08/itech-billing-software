import {endpoint, requireIdentity, checkOrigin, jsonBody} from '@/server/auth';
import {database} from '@/server/db';
import {createStandaloneCreditNote, col} from '@/server/purchase-service';
import {CreateStandaloneCreditNoteSchema, SupplierTransactionListQuerySchema} from '@/server/purchase-schema';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  return endpoint(async () => {
    const identity = await requireIdentity();
    const db = await database();
    const url = new URL(request.url);

    const {supplierId, page, limit, dateFrom, dateTo} = SupplierTransactionListQuerySchema.parse(Object.fromEntries(url.searchParams.entries()));
    const skip = (page - 1) * limit;
    const filter: Record<string, any> = {tenantId: identity.tenantId};
    if (supplierId) filter.supplierId = supplierId;
    if (dateFrom || dateTo) {
      filter.date = {};
      if (dateFrom) filter.date.$gte = dateFrom;
      if (dateTo) filter.date.$lte = dateTo;
    }

    const [creditNotes, total] = await Promise.all([
      col(db, 'supplierCreditNotes').find(filter).sort({date: -1, createdAt: -1}).skip(skip).limit(limit).toArray(),
      col(db, 'supplierCreditNotes').countDocuments(filter),
    ]);

    return {creditNotes, records: creditNotes, total, page, limit, totalPages: Math.ceil(total / limit) || 1};
  });
}

export async function POST(request: Request) {
  return endpoint(async () => {
    checkOrigin(request);
    const identity = await requireIdentity();
    const db = await database();
    const body = CreateStandaloneCreditNoteSchema.parse(await jsonBody(request));

    return createStandaloneCreditNote(db, identity, body);
  });
}
