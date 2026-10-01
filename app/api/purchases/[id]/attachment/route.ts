import {z} from 'zod';
import {checkOrigin, endpoint, jsonBody, requireIdentity} from '@/server/auth';
import {database} from '@/server/db';
import {attachSupplierBillFile} from '@/server/purchase-service';

export const runtime = 'nodejs';

const AttachSupplierBillSchema = z.object({
  attachmentFileId: z.string().trim().min(1),
  expectedVersion: z.number().int().min(1).optional(),
  idempotencyKey: z.string().trim().min(1).max(128),
});

export async function POST(request: Request, context: {params: Promise<{id: string}>}) {
  return endpoint(async () => {
    checkOrigin(request);
    const identity = await requireIdentity();
    const {id} = await context.params;
    const input = AttachSupplierBillSchema.parse(await jsonBody(request));
    return attachSupplierBillFile(await database(), identity, id, input);
  });
}
