import {endpoint, requireIdentity} from '@/server/auth';
import {database} from '@/server/db';
import {getWarranty} from '@/server/warranties';

export const runtime = 'nodejs';
type Context = {params: Promise<{id: string}>};

export async function GET(_request: Request, context: Context) {
  return endpoint(async () => {
    const identity = await requireIdentity();
    const {id} = await context.params;
    return getWarranty(await database(), identity, id);
  });
}
