import {endpoint, requireIdentity, checkOrigin, jsonBody} from '@/server/auth';
import {database, AppError} from '@/server/db';
import {getQuotation, convertQuotationToDraft, updateQuotation, cancelQuotation} from '@/server/sales-service';
import {ConvertQuotationSchema, UpdateQuotationSchema, CancelQuotationSchema} from '@/server/sales-schema';

export const runtime = 'nodejs';

export async function GET(_request: Request, context: {params: Promise<{id: string}>}) {
  return endpoint(async () => {
    const identity = await requireIdentity();
    const {id} = await context.params;
    const db = await database();
    return getQuotation(db, identity, id);
  });
}

export async function POST(request: Request, context: {params: Promise<{id: string}>}) {
  return endpoint(async () => {
    checkOrigin(request);
    const identity = await requireIdentity();
    const {id} = await context.params;
    const db = await database();
    const body = ConvertQuotationSchema.parse(await jsonBody(request));
    if (body.quotationId !== id) {
      throw new AppError(400, 'quotationId in body must match the URL parameter.');
    }
    return convertQuotationToDraft(db, identity, body);
  });
}

export async function PUT(request: Request, context: {params: Promise<{id: string}>}) {
  return endpoint(async () => {
    checkOrigin(request);
    const identity = await requireIdentity();
    const {id} = await context.params;
    const db = await database();
    const body = UpdateQuotationSchema.parse(await jsonBody(request));
    return updateQuotation(db, identity, id, body);
  });
}

export async function DELETE(request: Request, context: {params: Promise<{id: string}>}) {
  return endpoint(async () => {
    checkOrigin(request);
    const identity = await requireIdentity();
    const {id} = await context.params;
    const db = await database();
    const body = CancelQuotationSchema.parse(await jsonBody(request));
    return cancelQuotation(db, identity, id, body);
  });
}
