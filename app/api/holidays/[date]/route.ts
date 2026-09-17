import {endpoint, requireIdentity, checkOrigin} from '@/server/auth';
import {database} from '@/server/db';
import {removeHoliday} from '@/server/closing-service';

export const runtime = 'nodejs';

export async function DELETE(
  request: Request,
  props: {params: Promise<{date: string}>}
) {
  return endpoint(async () => {
    checkOrigin(request);
    const identity = await requireIdentity();
    const db = await database();
    const {date} = await props.params;

    return removeHoliday(db, identity, date);
  });
}
