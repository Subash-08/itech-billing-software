import {endpoint, requireIdentity} from '@/server/auth';
import {getFile, rfc5987Encode} from '@/server/storage';

export const runtime = 'nodejs';

export async function GET(_request: Request, context: {params: Promise<{id: string}>}) {
  try {
    const identity = await requireIdentity();
    const {id} = await context.params;
    const {record, bytes} = await getFile(identity, id);
    return new Response(new Uint8Array(bytes), {
      headers: {
        'Content-Type': record.type,
        'Content-Disposition': `attachment; filename*=UTF-8''${rfc5987Encode(record.name)}`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (e) {
    return endpoint(async () => {
      throw e;
    });
  }
}
