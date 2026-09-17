import 'server-only';
import {Db, ClientSession} from 'mongodb';
import {AppError} from './db';
import {Identity} from './security';
import {uid} from '../lib/domain';
import {recordAudit} from './audit';
import {lockBusinessDay} from './business-day';
import {
  col,
  assertPhase3MigrationComplete,
  assertOperationalPostingAllowed,
  executeIdempotentTransaction,
} from './purchase-service';
import {signedAccountMovementPaise} from './account-initialization';
import {todayInKolkata} from './purchase-schema';
import {
  SaveProfitEntriesInput,
  SaveProfitEntriesSchema,
  SaveReconciliationDraftInput,
  SaveReconciliationDraftSchema,
  CloseBusinessDayInput,
  CloseBusinessDaySchema,
  ScheduleHolidayInput,
  ScheduleHolidaySchema,
} from './closing-schema';

export interface DailyClosingDocument {
  _id: string;
  tenantId: string;
  date: string;
  status: 'Closed' | 'Holiday';
  note?: string;
  snapshot: {
    cashClosingPaise: number;
    bankClosingPaise: number;
    combinedClosingPaise: number;
    salesTotalPaise: number;
    invoiceCount: number;
    cashReceiptsPaise: number;
    bankReceiptsPaise: number;
    operatingExpensesPaise: number;
    otherReceiptsPaise: number;
    tradingProfitPaise: number;
    netShopProfitPaise: number;
  };
  closedAt: Date;
  closedBy: string;
}

export function isProfitUnlocked(identity: Identity): boolean {
  return Boolean(identity.profitUntil && new Date(identity.profitUntil) > new Date());
}

export const getOpeningBalanceForDate = getStartingBalancesForDate;

export async function getStartingBalancesForDate(
  db: Db,
  tenantId: string,
  date: string,
  session?: ClientSession
): Promise<{cashPaise: number; bankPaise: number}> {
  // Look for the most recent closed day strictly before `date`
  const lastClosing = await col<DailyClosingDocument>(db, 'dailyClosings')
    .find({tenantId, date: {$lt: date}}, session ? {session} : {})
    .sort({date: -1})
    .limit(1)
    .toArray();

  if (lastClosing.length > 0) {
    // If there were intervening movements between lastClosing and date, sum them
    const interveningMovements = await col(db, 'accountMovements')
      .find(
        {tenantId, date: {$gt: lastClosing[0].date, $lt: date}},
        session ? {session} : {}
      )
      .toArray();

    let cashDelta = 0;
    let bankDelta = 0;
    for (const m of interveningMovements) {
      const val = signedAccountMovementPaise(m);
      if (m.account === 'Cash') cashDelta += val;
      else if (m.account === 'Bank' || m.account === 'Bank account') bankDelta += val;
    }

    return {
      cashPaise: lastClosing[0].snapshot.cashClosingPaise + cashDelta,
      bankPaise: lastClosing[0].snapshot.bankClosingPaise + bankDelta,
    };
  }

  // If no prior closing, read from openingSetups
  const opening = await col(db, 'openingSetups').findOne({tenantId}, session ? {session} : {});
  const baseCash = opening?.openingCashPaise || 0;
  const baseBank = opening?.openingBankPaise || 0;
  const cutoff = opening?.cutoffDate || '2000-01-01';

  const priorMovements = await col(db, 'accountMovements')
    .find(
      {tenantId, date: {$gt: cutoff, $lt: date}},
      session ? {session} : {}
    )
    .toArray();

  let cashDelta = 0;
  let bankDelta = 0;
  for (const m of priorMovements) {
    const val = signedAccountMovementPaise(m);
    if (m.account === 'Cash') cashDelta += val;
    else if (m.account === 'Bank' || m.account === 'Bank account') bankDelta += val;
  }

  return {
    cashPaise: baseCash + cashDelta,
    bankPaise: baseBank + bankDelta,
  };
}

export async function getClosingDashboard(db: Db, identity: Identity, date: string) {
  const tenantId = identity.tenantId;
  await assertPhase3MigrationComplete(db, tenantId);

  const profitUnlocked = isProfitUnlocked(identity);

  // Check if already closed
  const existingClosing = await col<DailyClosingDocument>(db, 'dailyClosings').findOne({
    tenantId,
    date,
  });

  const gate = await col(db, 'businessDayGates').findOne({_id: `DAY-${tenantId}`});
  const gateVersion = gate?.version || 0;

  if (existingClosing) {
    return {
      date,
      isClosed: true,
      status: existingClosing.status,
      closing: {
        ...existingClosing,
        snapshot: {
          ...existingClosing.snapshot,
          tradingProfitPaise: profitUnlocked ? existingClosing.snapshot.tradingProfitPaise : null,
          netShopProfitPaise: profitUnlocked ? existingClosing.snapshot.netShopProfitPaise : null,
        },
      },
      profitUnlocked,
      gateVersion,
    };
  }

  // Open day: compile live facts
  const [
    invoices,
    adjustments,
    movements,
    draft,
    holidayRecord,
    startingBalances,
  ] = await Promise.all([
    col(db, 'invoices')
      .find({tenantId, invoiceDate: date, status: 'Issued'})
      .toArray(),
    col(db, 'manualProfitAdjustments')
      .find({tenantId, date})
      .toArray(),
    col(db, 'accountMovements')
      .find({tenantId, date})
      .toArray(),
    col(db, 'dailyClosingDrafts').findOne({tenantId, date}),
    col(db, 'businessHolidays').findOne({tenantId, date}),
    getStartingBalancesForDate(db, tenantId, date),
  ]);

  // Aggregate invoices
  let salesTotalPaise = 0;
  let rawTradingProfitPaise = 0;
  let pendingProfitCount = 0;

  const invoiceEntries = invoices.map(inv => {
    salesTotalPaise += inv.totalPaise || 0;
    const profit = inv.manualProfitPaise;
    if (profit === undefined || profit === null) {
      pendingProfitCount++;
    } else {
      rawTradingProfitPaise += profit;
    }

    return {
      _id: inv._id,
      invoiceNumber: inv.invoiceNumber,
      invoiceDate: inv.invoiceDate,
      customerId: inv.customerId,
      customerName: inv.customerSnapshot?.name || 'Customer',
      totalPaise: inv.totalPaise,
      allocatedPaidPaise: inv.allocatedPaidPaise || 0,
      duePaise: inv.duePaise || 0,
      paymentStatus: inv.paymentStatus || (inv.duePaise === 0 ? 'Paid' : 'Unpaid'),
      manualProfitPaise: profitUnlocked ? (profit ?? null) : null,
      isProfitPending: profit === undefined || profit === null,
    };
  });

  // Aggregate adjustments
  const adjustmentEntries = adjustments.map(adj => {
    const isPending = adj.signedAdjustmentPaise === undefined || adj.signedAdjustmentPaise === null;
    if (isPending) {
      pendingProfitCount++;
    } else {
      rawTradingProfitPaise += adj.signedAdjustmentPaise || 0;
    }
    return {
      _id: adj._id,
      date: adj.date,
      originalDocumentNumber: adj.originalDocumentNumber,
      triggerType: adj.triggerType,
      triggerReference: adj.triggerReference,
      signedAdjustmentPaise: profitUnlocked ? (adj.signedAdjustmentPaise ?? null) : null,
      isPending,
      reason: adj.reason,
    };
  });

  // Aggregate movements
  let cashInPaise = 0;
  let cashOutPaise = 0;
  let bankInPaise = 0;
  let bankOutPaise = 0;
  let operatingExpensesPaise = 0;
  let otherReceiptsPaise = 0;

  for (const m of movements) {
    const val = signedAccountMovementPaise(m);
    const isCash = m.account === 'Cash';

    if (val > 0) {
      if (isCash) cashInPaise += val;
      else bankInPaise += val;

      if (m.category === 'OtherReceipt') {
        otherReceiptsPaise += val;
      } else if (m.category === 'ExpenseReversal') {
        operatingExpensesPaise -= val;
      }
    } else if (val < 0) {
      const absVal = Math.abs(val);
      if (isCash) cashOutPaise += absVal;
      else bankOutPaise += absVal;

      if (m.category === 'Expense') {
        operatingExpensesPaise += absVal;
      }
    }
  }

  operatingExpensesPaise = Math.max(0, operatingExpensesPaise);

  const expectedClosingCashPaise = startingBalances.cashPaise + (cashInPaise - cashOutPaise);
  const expectedClosingBankPaise = startingBalances.bankPaise + (bankInPaise - bankOutPaise);

  const netShopProfitPaise = rawTradingProfitPaise - operatingExpensesPaise;

  return {
    date,
    isClosed: false,
    status: holidayRecord ? 'ScheduledHoliday' : 'Open',
    holidayReason: holidayRecord?.reason,
    profitUnlocked,
    gateVersion,
    pendingProfitCount,
    draft: draft
      ? {
          cashCountPaise: draft.cashCountPaise,
          bankCountPaise: draft.bankCountPaise,
          note: draft.note || '',
          holiday: Boolean(draft.holiday),
        }
      : null,
    invoices: invoiceEntries,
    adjustments: adjustmentEntries,
    summary: {
      salesTotalPaise,
      cashReceiptsPaise: cashInPaise,
      bankReceiptsPaise: bankInPaise,
      totalMoneyInPaise: cashInPaise + bankInPaise,
      operatingExpensesPaise,
      otherReceiptsPaise,
      tradingProfitPaise: profitUnlocked ? rawTradingProfitPaise : null,
      netShopProfitPaise: profitUnlocked ? netShopProfitPaise : null,
    },
    accounts: {
      cash: {
        openingPaise: startingBalances.cashPaise,
        inPaise: cashInPaise,
        outPaise: cashOutPaise,
        netDeltaPaise: cashInPaise - cashOutPaise,
        expectedClosingPaise: expectedClosingCashPaise,
      },
      bank: {
        openingPaise: startingBalances.bankPaise,
        inPaise: bankInPaise,
        outPaise: bankOutPaise,
        netDeltaPaise: bankInPaise - bankOutPaise,
        expectedClosingPaise: expectedClosingBankPaise,
      },
      combined: {
        openingPaise: startingBalances.cashPaise + startingBalances.bankPaise,
        expectedClosingPaise: expectedClosingCashPaise + expectedClosingBankPaise,
      },
    },
  };
}

export async function saveProfitEntries(
  db: Db,
  identity: Identity,
  date: string,
  raw: unknown
) {
  const input = SaveProfitEntriesSchema.parse(raw);
  const tenantId = identity.tenantId;

  await assertPhase3MigrationComplete(db, tenantId);

  const existing = await col(db, 'dailyClosings').findOne({tenantId, date});
  if (existing) throw new AppError(400, 'This day is already closed and read-only.');

  for (const item of input.entries) {
    if (item.type === 'Invoice') {
      const res = await col(db, 'invoices').updateOne(
        {_id: item.id, tenantId, invoiceDate: date},
        {
          $set: {manualProfitPaise: item.profitPaise, updatedAt: new Date(), updatedBy: identity.userId},
          $inc: {version: 1},
        }
      );
      if (res.matchedCount === 0) {
        throw new AppError(404, `Invoice ${item.id} not found on date ${date}.`);
      }
    } else if (item.type === 'Return' || item.type === 'Adjustment') {
      const res = await col(db, 'manualProfitAdjustments').updateOne(
        {_id: item.id, tenantId, date},
        {
          $set: {
            signedAdjustmentPaise: item.profitPaise,
            status: 'Reviewed',
            updatedAt: new Date(),
            updatedBy: identity.userId,
          },
        }
      );
      if (res.matchedCount === 0) {
        throw new AppError(404, `Profit adjustment ${item.id} not found on date ${date}.`);
      }
    }
  }

  // Increment businessDayGate version to track modification
  await col(db, 'businessDayGates').updateOne(
    {_id: `DAY-${tenantId}`, tenantId},
    {$inc: {version: 1}, $setOnInsert: {closedThrough: null}},
    {upsert: true}
  );

  await recordAudit(db, {
    identity,
    action: 'Update',
    entityType: 'dailyClosing',
    entityId: date,
    detail: `Updated profit entries for ${date} (${input.entries.length} items)`,
  });

  return {success: true, updatedCount: input.entries.length};
}

export async function saveReconciliationDraft(
  db: Db,
  identity: Identity,
  date: string,
  raw: unknown
) {
  const input = SaveReconciliationDraftSchema.parse(raw);
  const tenantId = identity.tenantId;

  await col(db, 'dailyClosingDrafts').updateOne(
    {tenantId, date},
    {
      $set: {
        cashCountPaise: input.cashCountPaise,
        bankCountPaise: input.bankCountPaise,
        note: input.note || '',
        holiday: Boolean(input.holiday),
        updatedAt: new Date(),
        updatedBy: identity.userId,
      },
      $setOnInsert: {createdAt: new Date()},
    },
    {upsert: true}
  );

  return {success: true, date};
}

export async function closeBusinessDay(
  db: Db,
  identity: Identity,
  date: string,
  raw: unknown
) {
  const input = CloseBusinessDaySchema.parse(raw);
  const tenantId = identity.tenantId;

  await assertPhase3MigrationComplete(db, tenantId);

  const today = todayInKolkata();
  if (date > today) {
    throw new AppError(400, 'Cannot close a future business date.');
  }

  // Chronological Closure Check:
  // Find opening cutoff
  const opening = await col(db, 'openingSetups').findOne({tenantId, status: 'Finalized'});
  if (!opening?.cutoffDate) throw new AppError(409, 'Opening setup must be finalized before closing days.');

  // Check all intervening calendar dates between cutoff + 1 day and date - 1 day
  const [cutoffY, cutoffM, cutoffD] = opening.cutoffDate.split('-').map(Number);
  const [targetY, targetM, targetD] = date.split('-').map(Number);

  let cur = new Date(Date.UTC(cutoffY, cutoffM - 1, cutoffD + 1));
  const targetDateObj = new Date(Date.UTC(targetY, targetM - 1, targetD));

  while (cur < targetDateObj) {
    const dStr = cur.toISOString().slice(0, 10);
    const priorClosed = await col(db, 'dailyClosings').findOne({tenantId, date: dStr});
    if (!priorClosed) {
      throw new AppError(
        400,
        `Cannot close ${date}: prior business day ${dStr} must be closed first to preserve chronological audit.`
      );
    }
    cur.setUTCDate(cur.getUTCDate() + 1);
  }

  return executeIdempotentTransaction(
    db,
    identity,
    input.idempotencyKey,
    'closeBusinessDay',
    date,
    input,
    async (session: ClientSession) => {
      // Check if date is already closed (only reached if idempotency key wasn't already replayed)
      const existing = await col<DailyClosingDocument>(db, 'dailyClosings').findOne({tenantId, date}, {session});
      if (existing) {
        throw new AppError(400, `Business day ${date} is already closed.`);
      }

      // Lock the business day in transaction
      const gate = await lockBusinessDay(db, session, tenantId, {date, allowClosed: true});

      // Verify review version if supplied to catch concurrent posting races.
      // Since lockBusinessDay increments gate.version by 1 in this transaction,
      // the gate's new version must equal input.reviewVersion + 1.
      if (input.reviewVersion !== undefined && gate.version !== input.reviewVersion + 1) {
        throw new AppError(
          409,
          'Business transactions occurred while review was in progress. Refresh and review before closing.'
        );
      }

      // Check holiday condition
      if (input.holiday) {
        const [invoicesCount, movementsCount, purchasesCount] = await Promise.all([
          col(db, 'invoices').countDocuments({tenantId, invoiceDate: date}, {session}),
          col(db, 'accountMovements').countDocuments({tenantId, date}, {session}),
          col(db, 'purchases').countDocuments({tenantId, postingDate: date}, {session}),
        ]);

        if (invoicesCount > 0 || movementsCount > 0 || purchasesCount > 0) {
          throw new AppError(
            400,
            `Cannot close as a holiday: ${date} contains active business transactions.`
          );
        }

        const startBal = await getStartingBalancesForDate(db, tenantId, date, session);

        const closingDoc: DailyClosingDocument = {
          _id: uid('CLS'),
          tenantId,
          date,
          status: 'Holiday',
          note: input.note || 'Shop holiday',
          snapshot: {
            cashClosingPaise: startBal.cashPaise,
            bankClosingPaise: startBal.bankPaise,
            combinedClosingPaise: startBal.cashPaise + startBal.bankPaise,
            salesTotalPaise: 0,
            invoiceCount: 0,
            cashReceiptsPaise: 0,
            bankReceiptsPaise: 0,
            operatingExpensesPaise: 0,
            otherReceiptsPaise: 0,
            tradingProfitPaise: 0,
            netShopProfitPaise: 0,
          },
          closedAt: new Date(),
          closedBy: identity.userId,
        };

        await col(db, 'dailyClosings').insertOne(closingDoc, {session});
        await col(db, 'businessDayGates').updateOne(
          {_id: `DAY-${tenantId}`, tenantId},
          {$set: {closedThrough: date, updatedAt: new Date()}},
          {session}
        );
        await col(db, 'dailyClosingDrafts').deleteOne({tenantId, date}, {session});

        await recordAudit(
          db,
          {
            identity,
            action: 'Close',
            entityType: 'dailyClosing',
            entityId: date,
            detail: `Closed ${date} as holiday. Balances carried forward: Cash ₹${(startBal.cashPaise / 100).toFixed(2)}, Bank ₹${(startBal.bankPaise / 100).toFixed(2)}`,
          },
          session
        );

        return {success: true, date, status: 'Holiday'};
      }

      // Normal trading day closing:
      // 1. Check all invoices and adjustments have profit entered
      const pendingInvoices = await col(db, 'invoices')
        .find(
          {
            tenantId,
            invoiceDate: date,
            status: 'Issued',
            $or: [{manualProfitPaise: {$exists: false}}, {manualProfitPaise: null}],
          },
          {session}
        )
        .toArray();

      const pendingAdjustments = await col(db, 'manualProfitAdjustments')
        .find(
          {
            tenantId,
            date,
            $or: [{signedAdjustmentPaise: {$exists: false}}, {signedAdjustmentPaise: null}],
          },
          {session}
        )
        .toArray();

      if (pendingInvoices.length > 0 || pendingAdjustments.length > 0) {
        const totalPending = pendingInvoices.length + pendingAdjustments.length;
        throw new AppError(
          400,
          `Enter manual profit for ${totalPending} pending invoice/return adjustment(s) before closing.`
        );
      }

      // 2. Tally expected cash and bank balances
      const startBal = await getStartingBalancesForDate(db, tenantId, date, session);
      const movements = await col(db, 'accountMovements')
        .find({tenantId, date}, {session})
        .toArray();

      let cashInPaise = 0;
      let cashOutPaise = 0;
      let bankInPaise = 0;
      let bankOutPaise = 0;
      let operatingExpensesPaise = 0;
      let otherReceiptsPaise = 0;

      for (const m of movements) {
        const val = signedAccountMovementPaise(m);
        if (m.account === 'Cash') {
          if (val > 0) cashInPaise += val;
          else cashOutPaise += Math.abs(val);
        } else {
          if (val > 0) bankInPaise += val;
          else bankOutPaise += Math.abs(val);
        }

        if (m.category === 'Expense') operatingExpensesPaise += Math.abs(val);
        else if (m.category === 'ExpenseReversal') operatingExpensesPaise -= Math.abs(val);
        if (m.category === 'OtherReceipt' && val > 0) otherReceiptsPaise += val;
      }

      operatingExpensesPaise = Math.max(0, operatingExpensesPaise);

      const expectedCashPaise = startBal.cashPaise + (cashInPaise - cashOutPaise);
      const expectedBankPaise = startBal.bankPaise + (bankInPaise - bankOutPaise);

      if (input.cashCountPaise !== expectedCashPaise) {
        throw new AppError(
          400,
          `Physical cash count (₹${(input.cashCountPaise / 100).toFixed(2)}) does not match expected ledger closing (₹${(expectedCashPaise / 100).toFixed(2)}). Difference: ₹${((input.cashCountPaise - expectedCashPaise) / 100).toFixed(2)}.`
        );
      }

      if (input.bankCountPaise !== expectedBankPaise) {
        throw new AppError(
          400,
          `Bank count (₹${(input.bankCountPaise / 100).toFixed(2)}) does not match expected bank closing (₹${(expectedBankPaise / 100).toFixed(2)}). Difference: ₹${((input.bankCountPaise - expectedBankPaise) / 100).toFixed(2)}.`
        );
      }

      // 3. Calculate finalized profit
      const invoices = await col(db, 'invoices')
        .find({tenantId, invoiceDate: date, status: 'Issued'}, {session})
        .toArray();

      const adjustments = await col(db, 'manualProfitAdjustments')
        .find({tenantId, date}, {session})
        .toArray();

      let salesTotalPaise = 0;
      let tradingProfitPaise = 0;
      for (const inv of invoices) {
        salesTotalPaise += inv.totalPaise || 0;
        tradingProfitPaise += inv.manualProfitPaise || 0;
      }
      for (const adj of adjustments) {
        tradingProfitPaise += adj.signedAdjustmentPaise || 0;
      }

      const netShopProfitPaise = tradingProfitPaise - operatingExpensesPaise;

      const closingDoc: DailyClosingDocument = {
        _id: uid('CLS'),
        tenantId,
        date,
        status: 'Closed',
        note: input.note || '',
        snapshot: {
          cashClosingPaise: expectedCashPaise,
          bankClosingPaise: expectedBankPaise,
          combinedClosingPaise: expectedCashPaise + expectedBankPaise,
          salesTotalPaise,
          invoiceCount: invoices.length,
          cashReceiptsPaise: cashInPaise,
          bankReceiptsPaise: bankInPaise,
          operatingExpensesPaise,
          otherReceiptsPaise,
          tradingProfitPaise,
          netShopProfitPaise,
        },
        closedAt: new Date(),
        closedBy: identity.userId,
      };

      await col(db, 'dailyClosings').insertOne(closingDoc, {session});
      await col(db, 'businessDayGates').updateOne(
        {_id: `DAY-${tenantId}`, tenantId},
        {$set: {closedThrough: date, updatedAt: new Date()}},
        {session}
      );
      await col(db, 'dailyClosingDrafts').deleteOne({tenantId, date}, {session});

      await recordAudit(
        db,
        {
          identity,
          action: 'Close',
          entityType: 'dailyClosing',
          entityId: date,
          detail: `Daily closing completed for ${date}. All accounts reconciled. Cash: ₹${(expectedCashPaise / 100).toFixed(2)}, Bank: ₹${(expectedBankPaise / 100).toFixed(2)}`,
        },
        session
      );

      return {success: true, date, status: 'Closed'};
    }
  );
}

export async function listClosings(
  db: Db,
  identity: Identity,
  options?: {page?: number; limit?: number}
) {
  const tenantId = identity.tenantId;
  await assertPhase3MigrationComplete(db, tenantId);

  const profitUnlocked = isProfitUnlocked(identity);

  const opening = await col(db, 'openingSetups').findOne({tenantId, status: 'Finalized'});
  const cutoff = opening?.cutoffDate || '2026-09-01';
  const today = todayInKolkata();

  // Generate date range from today backwards to cutoff + 1
  const days: string[] = [];
  let d = today;
  while (d > cutoff) {
    days.push(d);
    const [y, m, day] = d.split('-').map(Number);
    const prev = new Date(Date.UTC(y, m - 1, day - 1));
    d = prev.toISOString().slice(0, 10);
  }

  const page = options?.page || 1;
  const limit = options?.limit || 14;
  const skip = (page - 1) * limit;
  const pagedDays = days.slice(skip, skip + limit);

  // Fetch closings for these days
  const closings = await col<DailyClosingDocument>(db, 'dailyClosings')
    .find({tenantId, date: {$in: pagedDays}})
    .toArray();
  const closingMap = new Map<string, DailyClosingDocument>();
  for (const c of closings) closingMap.set(c.date, c);

  const holidays = await col(db, 'businessHolidays')
    .find({tenantId, date: {$in: pagedDays}})
    .toArray();
  const holidayMap = new Map<string, any>();
  for (const h of holidays) holidayMap.set(h.date, h);

  const results = await Promise.all(
    pagedDays.map(async date => {
      const c = closingMap.get(date);
      if (c) {
        return {
          date,
          status: c.status,
          salesPaise: c.snapshot.salesTotalPaise,
          cashPaise: c.snapshot.cashClosingPaise,
          bankPaise: c.snapshot.bankClosingPaise,
          expensesPaise: c.snapshot.operatingExpensesPaise,
          tradingProfitPaise: profitUnlocked ? c.snapshot.tradingProfitPaise : null,
          isClosed: true,
        };
      }

      // Open or unmapped day
      const dash = await getClosingDashboard(db, identity, date);
      if (dash.isClosed && dash.closing) {
        return {
          date,
          status: dash.status,
          salesPaise: dash.closing.snapshot.salesTotalPaise,
          cashPaise: dash.closing.snapshot.cashClosingPaise,
          bankPaise: dash.closing.snapshot.bankClosingPaise,
          expensesPaise: dash.closing.snapshot.operatingExpensesPaise,
          tradingProfitPaise: profitUnlocked ? dash.closing.snapshot.tradingProfitPaise : null,
          isClosed: true,
        };
      }

      return {
        date,
        status: holidayMap.has(date) ? 'ScheduledHoliday' : 'Open',
        salesPaise: dash.summary?.salesTotalPaise || 0,
        cashPaise: dash.accounts?.cash.expectedClosingPaise || 0,
        bankPaise: dash.accounts?.bank.expectedClosingPaise || 0,
        expensesPaise: dash.summary?.operatingExpensesPaise || 0,
        tradingProfitPaise: profitUnlocked ? (dash.summary?.tradingProfitPaise ?? null) : null,
        pendingProfitCount: dash.pendingProfitCount || 0,
        isClosed: false,
      };
    })
  );

  return {
    days: results,
    pagination: {
      page,
      limit,
      totalCount: days.length,
      totalPages: Math.ceil(days.length / limit),
    },
    profitUnlocked,
  };
}

export async function getHolidays(db: Db, identity: Identity) {
  const tenantId = identity.tenantId;
  return col(db, 'businessHolidays').find({tenantId}).sort({date: 1}).toArray();
}

export async function scheduleHoliday(
  db: Db,
  identity: Identity,
  raw: unknown
) {
  const input = ScheduleHolidaySchema.parse(raw);
  const tenantId = identity.tenantId;

  const closed = await col(db, 'dailyClosings').findOne({tenantId, date: input.date});
  if (closed) throw new AppError(400, 'Cannot schedule holiday on an already closed date.');

  const [invoicesCount, movementsCount] = await Promise.all([
    col(db, 'invoices').countDocuments({tenantId, invoiceDate: input.date}),
    col(db, 'accountMovements').countDocuments({tenantId, date: input.date}),
  ]);

  if (invoicesCount > 0 || movementsCount > 0) {
    throw new AppError(400, 'Cannot schedule holiday on a date with existing business transactions.');
  }

  await col(db, 'businessHolidays').updateOne(
    {tenantId, date: input.date},
    {$set: {reason: input.reason, updatedAt: new Date(), updatedBy: identity.userId}, $setOnInsert: {createdAt: new Date()}},
    {upsert: true}
  );

  return {success: true, date: input.date, reason: input.reason};
}

export async function removeHoliday(
  db: Db,
  identity: Identity,
  date: string
) {
  const tenantId = identity.tenantId;
  const closed = await col(db, 'dailyClosings').findOne({tenantId, date});
  if (closed) throw new AppError(400, 'Cannot remove holiday for an already closed date.');

  await col(db, 'businessHolidays').deleteOne({tenantId, date});
  return {success: true, date};
}
