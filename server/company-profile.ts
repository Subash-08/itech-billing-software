import 'server-only';
import type {ClientSession, Db} from 'mongodb';
import {AppError} from './db';

export const REQUIRED_COMPANY_PROFILE_FIELDS = [
  'name',
  'phone',
  'address',
  'state',
  'stateCode',
  'postalCode',
] as const;

const labels: Record<(typeof REQUIRED_COMPANY_PROFILE_FIELDS)[number], string> = {
  name: 'shop name',
  phone: 'contact phone',
  address: 'shop address',
  state: 'state name',
  stateCode: 'GST state code',
  postalCode: 'postal code',
};

export function missingCompanyProfileFields(settings: any): string[] {
  if (!settings) return REQUIRED_COMPANY_PROFILE_FIELDS.map(field => labels[field]);
  return REQUIRED_COMPANY_PROFILE_FIELDS
    .filter(field => typeof settings[field] !== 'string' || !settings[field].trim())
    .map(field => labels[field]);
}

export async function assertCompanyProfileComplete(
  db: Db,
  tenantId: string,
  session?: ClientSession,
) {
  const settings = await db.collection<any>('companySettings').findOne(
    {tenantId},
    {session, projection: Object.fromEntries(REQUIRED_COMPANY_PROFILE_FIELDS.map(field => [field, 1]))},
  );
  const missing = missingCompanyProfileFields(settings);
  if (missing.length) {
    throw new AppError(
      409,
      `Complete Settings → Shop details before recording business activity. Missing: ${missing.join(', ')}.`,
    );
  }
  return settings;
}
