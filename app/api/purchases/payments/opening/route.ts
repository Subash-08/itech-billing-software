import {endpoint, requireIdentity, checkOrigin, jsonBody} from '@/server/auth';
import {database} from '@/server/db';
import {recordSupplierPayment} from '@/server/purchase-service';
import {RecordSupplierPaymentSchema} from '@/server/purchase-schema';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  return endpoint(async () => {
    checkOrigin(request);
    const identity = await requireIdentity();
    const db = await database();
    const body = RecordSupplierPaymentSchema.parse(await jsonBody(request));

    return recordSupplierPayment(db, identity, body);
  });
}
