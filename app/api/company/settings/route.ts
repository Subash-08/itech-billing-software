import {endpoint, requireIdentity, checkOrigin, jsonBody} from '@/server/auth';
import {getCompanySettings, updateCompanySettings} from '@/server/master-service';
import {CompanySettingsSchema} from '@/server/master-schema';

export const runtime = 'nodejs';

export async function GET() {
  return endpoint(async () => {
    const identity = await requireIdentity();
    return getCompanySettings(identity);
  });
}

export async function PUT(request: Request) {
  return endpoint(async () => {
    checkOrigin(request);
    const identity = await requireIdentity();
    const body = CompanySettingsSchema.parse(await jsonBody(request));
    return updateCompanySettings(identity, body);
  });
}
