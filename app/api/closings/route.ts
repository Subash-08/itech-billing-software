import {endpoint, requireIdentity} from '@/server/auth';
import {database} from '@/server/db';
import {listClosings} from '@/server/closing-service';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  return endpoint(async () => {
    const identity = await requireIdentity();
    const db = await database();
    const url = new URL(request.url);

    const page = url.searchParams.get('page') ? Number(url.searchParams.get('page')) : 1;
    const limit = url.searchParams.get('limit') ? Number(url.searchParams.get('limit')) : 14;

    return listClosings(db, identity, {page, limit});
  });
}
