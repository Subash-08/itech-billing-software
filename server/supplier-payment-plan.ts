import 'server-only';
import {Db, ClientSession} from 'mongodb';
import {AppError} from './db';
import type {SupplierBillTarget} from '../lib/supplier-payment-plan';

export async function getSupplierPaymentBills(db: Db, tenantId: string, supplierId: string, session?: ClientSession): Promise<SupplierBillTarget[]> {
  // Sequential reads when sharing a transaction session. Never truncate a payment plan.
  const purchases = await db.collection<any>('purchases').find({tenantId, supplierId,
    billStatus: {$in: ['Posted', 'Credited', 'FullyCredited']}, duePaise: {$gt: 0}},
    {session, projection: {_id: 1, purchaseNumber: 1, supplierInvoiceNumber: 1, supplierInvoiceDate: 1, orderDate: 1,
      dueDate: 1, promisedPaymentDate: 1, duePaise: 1, 'lines.lineId': 1, 'lines.remainingDuePaise': 1}}).limit(501).toArray();
  const opening = await db.collection<any>('openingPayables').find({tenantId, supplierId, remainingAmountPaise: {$gt: 0}},
    {session, projection: {_id: 1, reference: 1, date: 1, dueDate: 1, remainingAmountPaise: 1}}).limit(501).toArray();
  if (purchases.length + opening.length > 500) throw new AppError(400, 'More than 500 open bills. Settle individual bills before using bulk payment.');
  return [...purchases.map(p => ({id: String(p._id), type: 'Purchase' as const, number: p.supplierInvoiceNumber || p.purchaseNumber,
    date: p.supplierInvoiceDate || p.orderDate, dueDate: p.promisedPaymentDate || p.dueDate || '', duePaise: p.duePaise,
    lines: (p.lines || []).map((l: any) => ({lineId: l.lineId, duePaise: l.remainingDuePaise || 0}))})),
    ...opening.map(p => ({id: String(p._id), type: 'OpeningPayable' as const, number: p.reference || 'Opening balance',
      date: p.date || '', dueDate: p.dueDate || '', duePaise: p.remainingAmountPaise, lines: []}))];
}
