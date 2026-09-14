import {endpoint, requireIdentity, checkOrigin} from '@/server/auth';
import {importDemoMasterData} from '@/server/master-service';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  return endpoint(async () => {
    checkOrigin(request);
    const identity = await requireIdentity();
    return importDemoMasterData(identity);
  });
}
