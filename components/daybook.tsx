'use client';
import {useState, useEffect, useCallback, useRef} from 'react';
import Link from 'next/link';
import {useSearchParams} from 'next/navigation';
import {useStore} from './store';
import {TODAY, money, roundedTotal, uid} from '@/lib/domain';
import {START_DATE, nextDate, isLocked, dayFacts, closeDay, assertOpen} from '@/lib/closing';
import {PageHead, Card, Btn, Field, Badge, Modal} from './ui';

export default function Daybook() {
  const {state, run, role, notify, isLive} = useStore();
  const params = useSearchParams();
  const date = params.get('date') || '';

  const [page, setPage] = useState(0);
  const [draftProfits, setDraftProfits] = useState<Record<string, string>>({});
  const [cashActual, setCashActual] = useState<string>('');
  const [bankActual, setBankActual] = useState<string>('');
  const [note, setNote] = useState('');
  const [holiday, setHoliday] = useState(false);
  const [schedule, setSchedule] = useState(false);
  const [holidayDate, setHolidayDate] = useState('2026-09-20');
  const [holidayReason, setHolidayReason] = useState('Weekly holiday');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const closeIdemKeyRef = useRef<Record<string, string>>({});

  const [liveDashboard, setLiveDashboard] = useState<any | null>(null);
  const [liveList, setLiveList] = useState<any | null>(null);
  const [liveHolidays, setLiveHolidays] = useState<any[]>([]);
  const [missedSummary, setMissedSummary] = useState<any | null>(null);
  const [missedDaysLoading, setMissedDaysLoading] = useState(false);
  const [missedDaysError, setMissedDaysError] = useState<string | null>(null);
  const [bulkCursor, setBulkCursor] = useState<string | null>(null);
  const [showMissedModal, setShowMissedModal] = useState(false);
  const [bulkReason, setBulkReason] = useState('Shop holiday / inactive period');
  const [bulkConfirmed, setBulkConfirmed] = useState(false);
  const bulkIdemKeyRef = useRef<{key: string; batchFingerprint: string} | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState('');

  const fetchDashboard = useCallback(async () => {
    if (!isLive || !date) return;
    setIsLoading(true);
    setLoadError('');
    try {
      const res = await fetch(`/api/closings/${date}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not load closing data for date.');
      setLiveDashboard(data);

      // Pre-fill draft counts if present
      if (data.draft) {
        if (data.draft.cashCountPaise !== undefined) {
          setCashActual((data.draft.cashCountPaise / 100).toFixed(2));
        }
        if (data.draft.bankCountPaise !== undefined) {
          setBankActual((data.draft.bankCountPaise / 100).toFixed(2));
        }
        if (data.draft.note) setNote(data.draft.note);
        if (data.draft.holiday) setHoliday(data.draft.holiday);
      } else if (data.isClosed && data.closing) {
        setCashActual((data.closing.snapshot.cashClosingPaise / 100).toFixed(2));
        setBankActual((data.closing.snapshot.bankClosingPaise / 100).toFixed(2));
        setNote(data.closing.note || '');
        setHoliday(data.closing.status === 'Holiday');
      }
    } catch (err: any) {
      setLoadError(err.message || 'Error loading closing dashboard.');
    } finally {
      setIsLoading(false);
    }
  }, [date, isLive]);

  const fetchList = useCallback(async () => {
    if (!isLive || date) return;
    setIsLoading(true);
    setLoadError('');
    try {
      const res = await fetch(`/api/closings?page=${page + 1}&limit=14`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not load closing list.');
      setLiveList(data);
    } catch (err: any) {
      setLoadError(err.message || 'Error loading closings list.');
    } finally {
      setIsLoading(false);
    }
  }, [page, date, isLive]);

  const fetchHolidays = useCallback(async () => {
    if (!isLive) return;
    try {
      const res = await fetch('/api/holidays');
      const data = await res.json();
      if (res.ok && Array.isArray(data)) {
        setLiveHolidays(data);
      }
    } catch {
      // ignore
    }
  }, [isLive]);

  const fetchMissedDays = useCallback(async (cursor?: string) => {
    if (!isLive) return;
    setMissedDaysLoading(true);
    setMissedDaysError(null);
    try {
      const url = cursor ? `/api/closings/missed-days?fromCursor=${cursor}` : '/api/closings/missed-days';
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to check unclosed business days.');
      }
      setMissedSummary(data);
    } catch (err: any) {
      setMissedDaysError(err.message || 'Error checking missed business days.');
    } finally {
      setMissedDaysLoading(false);
    }
  }, [isLive]);

  useEffect(() => {
    if (date) {
      fetchDashboard();
    } else {
      fetchList();
      fetchHolidays();
    }
    fetchMissedDays();
  }, [date, fetchDashboard, fetchList, fetchHolidays, fetchMissedDays]);

  // Fallback calculations for demo/offline
  const days: string[] = [];
  for (let d = TODAY; d >= START_DATE; d = nextDate(d, -1)) days.push(d);
  const f = dayFacts(state, date || TODAY);
  const lockedOffline = isLocked(state, date);
  const closingOffline = state.closings.find(c => c.date === date);

  // Live state definitions
  const isClosed = isLive ? liveDashboard?.isClosed : lockedOffline;
  const isHoliday = isLive ? liveDashboard?.status === 'Holiday' : holiday;

  const handleSaveProfits = async () => {
    if (!isLive) {
      // Offline store fallback
      run(s => {
        assertOpen(s, date);
        const bills = s.bills.map(b =>
          b.date === date && Object.hasOwn(draftProfits, b.id)
            ? {...b, profit: draftProfits[b.id] === '' ? null : Number(draftProfits[b.id])}
            : b
        );
        return {
          ...s,
          bills,
          audit: [{id: uid('LOG'), action: 'Daily profit saved', detail: date + ' · ' + role}, ...s.audit],
        };
      }, 'Profit entries saved.');
      setDraftProfits({});
      return;
    }

    setIsSubmitting(true);
    try {
      const adjustmentIds = new Set((liveDashboard?.adjustments || []).map((a: any) => a._id));
      const entries: Array<{id: string; type: 'Invoice' | 'Return'; profitPaise: number}> = [];
      for (const [id, val] of Object.entries(draftProfits)) {
        if (val === '') continue;
        const num = parseFloat(val);
        if (isNaN(num)) throw new Error(`Invalid profit amount "${val}".`);
        entries.push({
          id,
          type: adjustmentIds.has(id) ? 'Return' : 'Invoice',
          profitPaise: Math.round(num * 100),
        });
      }

      if (entries.length === 0) {
        notify('No profit changes to save.');
        return;
      }

      const res = await fetch(`/api/closings/${date}/profit`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({entries}),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save profit entries.');

      notify('Profit entries saved successfully.');
      setDraftProfits({});
      fetchDashboard();
    } catch (err: any) {
      notify(err.message || 'Error saving profit entries.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!isLive) {
      notify('Drafts are saved in live mode.');
      return;
    }
    try {
      const cashPaise = cashActual !== '' ? Math.round(parseFloat(cashActual) * 100) : undefined;
      const bankPaise = bankActual !== '' ? Math.round(parseFloat(bankActual) * 100) : undefined;

      const res = await fetch(`/api/closings/${date}/draft`, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          cashCountPaise: cashPaise,
          bankCountPaise: bankPaise,
          note,
          holiday,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save draft.');
      }

      notify('Reconciliation draft saved. Your entered counts are preserved.');
    } catch (err: any) {
      notify(err.message || 'Error saving draft.');
    }
  };

  const handleCloseDay = async () => {
    if (!isLive) {
      // Offline fallback
      if (Object.keys(draftProfits).length) {
        notify('Save your profit changes first.');
        return;
      }
      run(
        s =>
          closeDay(
            s,
            date,
            {Cash: Number(cashActual || 0), 'Bank account': Number(bankActual || 0)},
            note,
            holiday
          ),
        'Day closed. Balances carry forward and this day is now read-only.'
      );
      return;
    }

    if (Object.keys(draftProfits).length > 0) {
      notify('You have unsaved profit changes. Click "Save profit entries" first.');
      return;
    }

    const cashNum = parseFloat(cashActual);
    const bankNum = parseFloat(bankActual);
    if (!holiday && (isNaN(cashNum) || isNaN(bankNum))) {
      notify('Please enter both Cash and Bank counts to close the day.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (!closeIdemKeyRef.current[date]) {
        closeIdemKeyRef.current[date] = `close-${date}-${Date.now()}-${uid('IDEM')}`;
      }
      const idempotencyKey = closeIdemKeyRef.current[date];
      const payload = {
        cashCountPaise: Math.round(cashNum * 100),
        bankCountPaise: Math.round(bankNum * 100),
        note,
        holiday,
        reviewVersion: liveDashboard?.gateVersion,
        idempotencyKey,
      };

      const res = await fetch(`/api/closings/${date}`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Daily closing failed.');

      delete closeIdemKeyRef.current[date];
      notify(
        holiday
          ? `Day ${date} closed as holiday. Balances carried forward.`
          : `Day ${date} closed successfully. Reconciled snapshot saved.`
      );
      fetchDashboard();
      fetchMissedDays();
    } catch (err: any) {
      notify(err.message || 'Failed to close day.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBulkClose = async () => {
    if (!isLive || !missedSummary?.batch) return;
    const targetFromDate = missedSummary.batch.eligibleFromDate || missedSummary.batch.fromDate;
    const targetToDate = missedSummary.batch.eligibleToDate || missedSummary.batch.toDate;

    if (!targetToDate) {
      notify(missedSummary.batch.blockReason || 'No inactive days are eligible for holiday closure in this range.');
      return;
    }

    if (!bulkConfirmed) {
      notify(`You must confirm that no real-world business transactions occurred between ${targetFromDate} and ${targetToDate}.`);
      return;
    }

    setIsSubmitting(true);
    try {
      // Preserve stable idempotency key across retries; only generate new operation when payload/review changes
      const batchFingerprint = `${targetFromDate}_${targetToDate}_${bulkReason}_${missedSummary.reviewVersion}`;
      if (!bulkIdemKeyRef.current || bulkIdemKeyRef.current.batchFingerprint !== batchFingerprint) {
        bulkIdemKeyRef.current = {
          key: `bulk-holiday-${targetFromDate}-${targetToDate}-${Date.now()}-${uid('IDEM')}`,
          batchFingerprint,
        };
      }
      const idemKey = bulkIdemKeyRef.current.key;

      const payload = {
        fromDate: targetFromDate,
        toDate: targetToDate,
        reason: bulkReason,
        confirmedNoRealWorldActivity: true,
        reviewVersion: missedSummary.reviewVersion,
        idempotencyKey: idemKey,
      };

      const res = await fetch('/api/closings/bulk-holiday', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409) {
          // Stale review or concurrent update conflict: refresh review and prompt user to confirm afresh
          setBulkConfirmed(false);
          await fetchMissedDays(bulkCursor || undefined);
          throw new Error(`Review version conflict (409): ${data.error || 'Transactions occurred during review'}. Refreshed review data; please verify and confirm again.`);
        }
        throw new Error(data.error || 'Bulk holiday closure failed.');
      }

      // Successful closure: clear idempotency ref so next operation starts clean
      bulkIdemKeyRef.current = null;
      notify(`Successfully closed ${data.closedDaysCount} day(s) (${data.fromDate} to ${data.toDate}) as holiday.`);
      setShowMissedModal(false);
      setBulkConfirmed(false);
      setBulkCursor(null);
      await fetchMissedDays();
      if (date) fetchDashboard();
      else fetchList();
    } catch (err: any) {
      notify(err.message || 'Failed to bulk-close holidays.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleScheduleHoliday = async () => {
    if (!isLive) {
      notify('Holiday scheduling requires live mode.');
      return;
    }
    try {
      const res = await fetch('/api/holidays', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({date: holidayDate, reason: holidayReason}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to schedule holiday.');
      notify('Holiday scheduled successfully.');
      fetchHolidays();
    } catch (err: any) {
      notify(err.message || 'Error scheduling holiday.');
    }
  };

  const handleRemoveHoliday = async (hDate: string) => {
    if (!isLive) return;
    try {
      const res = await fetch(`/api/holidays/${hDate}`, {method: 'DELETE'});
      if (!res.ok) throw new Error('Failed to remove holiday.');
      notify('Holiday removed.');
      fetchHolidays();
    } catch (err: any) {
      notify(err.message || 'Error removing holiday.');
    }
  };

  return (
    <>
      <PageHead
        title={date ? 'Daily Closing · ' + date : 'Daily Closing'}
        description="Review sales, enter profit and reconcile cash and the bank account before closing."
        actions={
          <>
            {date ? (
              <Link className="btn secondary" href="/profit">
                All days
              </Link>
            ) : (
              <Btn secondary onClick={() => setSchedule(true)}>
                Shop holidays
              </Btn>
            )}
            <Link className="btn secondary" href="/register">
              Cash & bank register
            </Link>
          </>
        }
      />

      {loadError && (
        <div className="notice" style={{background: '#fef2f2', borderColor: '#fca5a5', color: '#b91c1c'}}>
          {loadError}
        </div>
      )}

      {missedDaysError && (
        <div
          className="notice"
          style={{
            background: '#fef2f2',
            borderColor: '#fca5a5',
            color: '#b91c1c',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1rem',
          }}
        >
          <span>{missedDaysError}</span>
          <Btn
            secondary
            onClick={() => fetchMissedDays(bulkCursor || undefined)}
            disabled={missedDaysLoading}
            style={{fontSize: '0.8rem', padding: '0.2rem 0.5rem'}}
          >
            {missedDaysLoading ? 'Retrying…' : 'Retry'}
          </Btn>
        </div>
      )}

      {missedSummary && missedSummary.unclosedCount > 0 && !missedDaysError && (
        <div
          className="notice"
          style={{
            background: missedSummary.batch?.canBulkCloseHoliday ? '#f0fdf4' : '#fffbeb',
            borderColor: missedSummary.batch?.canBulkCloseHoliday ? '#86efac' : '#fde68a',
            color: missedSummary.batch?.canBulkCloseHoliday ? '#166534' : '#92400e',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
            padding: '1rem 1.25rem',
            borderRadius: '6px',
            marginBottom: '1rem',
          }}
        >
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem'}}>
            <div>
              <strong style={{fontSize: '1rem'}}>
                Action Required: {missedSummary.unclosedCount} Unclosed Past Day(s) Detected
              </strong>
              <div style={{fontSize: '0.875rem', marginTop: '0.25rem'}}>
                Earliest unclosed date: <strong>{missedSummary.nextEligibleDate}</strong>
                {missedSummary.closedThrough ? ` · Closed through: ${missedSummary.closedThrough}` : ` · Opening setup cutoff: ${missedSummary.cutoffDate}`}
                {` · Current open day: ${missedSummary.today}`}
              </div>
              <div style={{fontSize: '0.85rem', marginTop: '0.25rem'}}>
                {missedSummary.batch?.canBulkCloseHoliday
                  ? missedSummary.batch.hasActiveDaysInBatch
                    ? `Inactive stretch detected: Days ${missedSummary.batch.eligibleFromDate} to ${missedSummary.batch.eligibleToDate} (${missedSummary.batch.eligibleDaysCount} days) can be bulk-closed as holidays before reviewing active day ${missedSummary.batch.firstActiveDay?.date}.`
                    : 'All dates in the current batch have no recorded transactions and can be closed together as holidays.'
                  : `Active business transactions detected (${missedSummary.batch?.blockReason || 'reconciliation needed'}).`}
              </div>
            </div>
            <div style={{display: 'flex', gap: '0.5rem', flexWrap: 'wrap'}}>
              <Btn
                onClick={() => setShowMissedModal(true)}
                disabled={missedDaysLoading}
                style={{
                  fontSize: '0.875rem',
                  padding: '0.4rem 0.8rem',
                  background: missedSummary.batch?.canBulkCloseHoliday ? '#16a34a' : '#d97706',
                  color: '#fff',
                }}
              >
                Resolve Missed Closings
              </Btn>
              <Link
                className="btn secondary"
                href={`/profit?date=${missedSummary.nextEligibleDate}`}
                style={{fontSize: '0.875rem', padding: '0.4rem 0.8rem'}}
              >
                Go to Oldest Day ({missedSummary.nextEligibleDate})
              </Link>
            </div>
          </div>
        </div>
      )}

      {!date ? (
        <>
          <div className="notice">
            Close days in chronological order. Closed balances carry to the following day and financial entries become
            read-only. Corrections belong to the current open day.
          </div>

          <Card title="Business Day Audit & Closings">
            {isLoading ? (
              <div className="body-pad" style={{textAlign: 'center', color: '#64748b'}}>
                Loading closing history…
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Sales</th>
                      <th>Cash Closing</th>
                      <th>Bank Closing</th>
                      <th>Expenses</th>
                      <th>Entered Profit</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {isLive && liveList?.days
                      ? liveList.days.map((d: any) => (
                          <tr key={d.date}>
                            <td>
                              <strong>{d.date}</strong>
                            </td>
                            <td>{money(d.salesPaise / 100)}</td>
                            <td>{money(d.cashPaise / 100)}</td>
                            <td>{money(d.bankPaise / 100)}</td>
                            <td>{money(d.expensesPaise / 100)}</td>
                            <td>
                              {d.tradingProfitPaise !== null && d.tradingProfitPaise !== undefined ? (
                                <>
                                  <span style={{color: '#16a34a', fontWeight: 600}}>
                                    {money(d.tradingProfitPaise / 100)}
                                  </span>
                                  {d.pendingProfitCount > 0 && (
                                    <small style={{display: 'block', color: '#d97706'}}>
                                      {d.pendingProfitCount} pending
                                    </small>
                                  )}
                                </>
                              ) : (
                                <small style={{color: '#94a3b8'}}>Locked (Owner only)</small>
                              )}
                            </td>
                            <td>
                              <Badge>{d.status}</Badge>
                            </td>
                            <td>
                              <Link className="text-link" href={'/profit?date=' + d.date}>
                                {d.isClosed ? 'View report' : 'Review & close'}
                              </Link>
                            </td>
                          </tr>
                        ))
                      : days.slice(page * 7, page * 7 + 7).map(d => {
                          const v = dayFacts(state, d);
                          const c = state.closings.find(x => x.date === d);
                          return (
                            <tr key={d}>
                              <td>{d}</td>
                              <td>{money(v.sales)}</td>
                              <td>{money(v.accounts.Cash.closing)}</td>
                              <td>
                                {money(
                                  Object.entries(v.accounts)
                                    .filter(([a]) => a !== 'Cash')
                                    .reduce((n, [, a]) => n + a.closing, 0)
                                )}
                              </td>
                              <td>{money(v.expenses)}</td>
                              <td>{role === 'Owner' ? money(v.profit) : 'Locked'}</td>
                              <td>
                                <Badge>{c?.status || 'Open'}</Badge>
                              </td>
                              <td>
                                <Link className="text-link" href={'/profit?date=' + d}>
                                  {c ? 'View report' : 'Review & close'}
                                </Link>
                              </td>
                            </tr>
                          );
                        })}
                  </tbody>
                </table>
              </div>
            )}
            <div className="form-actions">
              <Btn secondary disabled={!page} onClick={() => setPage(page - 1)}>
                Previous
              </Btn>
              <span>Page {page + 1}</span>
              <Btn
                secondary
                disabled={
                  isLive
                    ? liveList?.pagination
                      ? page + 1 >= liveList.pagination.totalPages
                      : true
                    : (page + 1) * 7 >= days.length
                }
                onClick={() => setPage(page + 1)}
              >
                Next
              </Btn>
            </div>
          </Card>
        </>
      ) : (
        <div className="stack">
          <div className="notice">
            {isClosed
              ? `Closed · Read-only snapshot. Reconciled closing balances carried forward to next day.`
              : `Open Day · Reconcile cash & bank balances, review profit, then finalize daily closing.`}
            {isLive && liveDashboard?.pendingProfitCount !== undefined && !isClosed && (
              <strong> {liveDashboard.pendingProfitCount} profit entries pending.</strong>
            )}
          </div>

          <div className="grid-3">
            <Card title="Sales Invoiced">
              <div className="body-pad">
                <h2>
                  {money(
                    isLive
                      ? (liveDashboard?.summary?.salesTotalPaise || 0) / 100
                      : f.sales
                  )}
                </h2>
                <p>
                  {isLive
                    ? `${liveDashboard?.invoices?.length || 0} invoices issued today`
                    : `Invoices issued today`}
                </p>
              </div>
            </Card>
            <Card title="Money Received Today">
              <div className="body-pad">
                <h2>
                  {money(
                    isLive
                      ? (liveDashboard?.summary?.totalMoneyInPaise || 0) / 100
                      : f.cashReceipts + f.bankReceipts
                  )}
                </h2>
                <p>
                  Cash:{' '}
                  {money(
                    isLive
                      ? (liveDashboard?.summary?.cashReceiptsPaise || 0) / 100
                      : f.cashReceipts
                  )}{' '}
                  · Bank:{' '}
                  {money(
                    isLive
                      ? (liveDashboard?.summary?.bankReceiptsPaise || 0) / 100
                      : f.bankReceipts
                  )}
                </p>
              </div>
            </Card>
            <Card title="Trading Profit & Expenses">
              <div className="body-pad">
                <h2>
                  {isLive ? (
                    liveDashboard?.summary?.tradingProfitPaise !== null &&
                    liveDashboard?.summary?.tradingProfitPaise !== undefined ? (
                      <span style={{color: '#16a34a'}}>
                        {money(liveDashboard.summary.tradingProfitPaise / 100)}
                      </span>
                    ) : (
                      <span style={{color: '#94a3b8', fontSize: '1.25rem'}}>Locked</span>
                    )
                  ) : role === 'Owner' ? (
                    money(f.profit)
                  ) : (
                    money(f.expenses)
                  )}
                </h2>
                <p>
                  Operating Expenses:{' '}
                  {money(
                    isLive
                      ? (liveDashboard?.summary?.operatingExpensesPaise || 0) / 100
                      : f.expenses
                  )}{' '}
                  · Net Shop Profit:{' '}
                  {isLive &&
                  liveDashboard?.summary?.netShopProfitPaise !== null &&
                  liveDashboard?.summary?.netShopProfitPaise !== undefined
                    ? money(liveDashboard.summary.netShopProfitPaise / 100)
                    : '—'}
                </p>
              </div>
            </Card>
          </div>

          <Card title="Sales, Service and Line Profit">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Invoice / Customer</th>
                    <th>Invoice Amount</th>
                    <th>Outstanding Due</th>
                    <th>Payment Status</th>
                    <th>Manual Profit (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  {isLive && liveDashboard?.invoices
                    ? liveDashboard.invoices.map((inv: any) => (
                        <tr key={inv._id}>
                          <td>
                            <Link className="record-link" href={'/sales/' + inv._id}>
                              {inv.invoiceNumber}
                            </Link>
                            <small>{inv.customerName}</small>
                          </td>
                          <td>{money(inv.totalPaise / 100)}</td>
                          <td>{money(inv.duePaise / 100)}</td>
                          <td>
                            <Badge>{inv.paymentStatus}</Badge>
                            <small>Paid {money(inv.allocatedPaidPaise / 100)}</small>
                          </td>
                          <td>
                            {isClosed ? (
                              <span>
                                {inv.manualProfitPaise !== null && inv.manualProfitPaise !== undefined
                                  ? money(inv.manualProfitPaise / 100)
                                  : 'Locked'}
                              </span>
                            ) : (
                              <input
                                aria-label={'Profit ' + inv._id}
                                type="number"
                                step="0.01"
                                placeholder="Pending"
                                value={
                                  draftProfits[inv._id] !== undefined
                                    ? draftProfits[inv._id]
                                    : inv.manualProfitPaise !== null && inv.manualProfitPaise !== undefined
                                    ? (inv.manualProfitPaise / 100).toFixed(2)
                                    : ''
                                }
                                onChange={e =>
                                  setDraftProfits({
                                    ...draftProfits,
                                    [inv._id]: e.target.value,
                                  })
                                }
                              />
                            )}
                          </td>
                        </tr>
                      ))
                      .concat(
                        (liveDashboard?.adjustments || []).map((adj: any) => (
                          <tr key={adj._id} style={{background: '#fffbeb'}}>
                            <td>
                              <strong>{adj.triggerType === 'CustomerReturn' ? 'Customer Return Adjustment' : adj.triggerType}</strong>
                              <small>{adj.reason || adj.originalDocumentNumber}</small>
                            </td>
                            <td>—</td>
                            <td>—</td>
                            <td>
                              <Badge>{adj.isPending ? 'Pending Review' : 'Adjusted'}</Badge>
                            </td>
                            <td>
                              {isClosed ? (
                                <span>
                                  {adj.signedAdjustmentPaise !== null && adj.signedAdjustmentPaise !== undefined
                                    ? money(adj.signedAdjustmentPaise / 100)
                                    : 'Locked'}
                                </span>
                              ) : (
                                <input
                                  aria-label={'Adjustment ' + adj._id}
                                  type="number"
                                  step="0.01"
                                  placeholder="Pending (±₹)"
                                  value={
                                    draftProfits[adj._id] !== undefined
                                      ? draftProfits[adj._id]
                                      : adj.signedAdjustmentPaise !== null && adj.signedAdjustmentPaise !== undefined
                                      ? (adj.signedAdjustmentPaise / 100).toFixed(2)
                                      : ''
                                  }
                                  onChange={e =>
                                    setDraftProfits({
                                      ...draftProfits,
                                      [adj._id]: e.target.value,
                                    })
                                  }
                                />
                              )}
                            </td>
                          </tr>
                        ))
                      )
                    : f.entries.map(b => (
                        <tr key={b.id}>
                          <td>
                            <Link className="record-link" href={'/sales/' + b.id}>
                              {b.id}
                            </Link>
                          </td>
                          <td>{money(roundedTotal(b))}</td>
                          <td>—</td>
                          <td>
                            <Badge>Paid</Badge>
                          </td>
                          <td>
                            <input
                              type="number"
                              step="0.01"
                              placeholder="Pending"
                              value={draftProfits[b.id] ?? b.profit ?? ''}
                              onChange={e =>
                                setDraftProfits({...draftProfits, [b.id]: e.target.value})
                              }
                            />
                          </td>
                        </tr>
                      ))}
                </tbody>
              </table>
            </div>

            {!isClosed && (
              <div className="form-actions">
                <Btn onClick={handleSaveProfits} disabled={isSubmitting}>
                  Save profit entries
                </Btn>
              </div>
            )}
          </Card>

          <Card title="Reconcile Cash and Bank Accounts">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Account</th>
                    <th>Opening</th>
                    <th>Net Movement</th>
                    <th>Expected Closing</th>
                    <th>Physical / Verified Count</th>
                    <th>Difference</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Cash Row */}
                  <tr>
                    <td>
                      <strong>Cash in Shop</strong>
                    </td>
                    <td>
                      {money(
                        isLive
                          ? (liveDashboard?.accounts?.cash?.openingPaise || 0) / 100
                          : f.accounts.Cash.opening
                      )}
                    </td>
                    <td>
                      {money(
                        isLive
                          ? (liveDashboard?.accounts?.cash?.netDeltaPaise || 0) / 100
                          : f.accounts.Cash.closing - f.accounts.Cash.opening
                      )}
                    </td>
                    <td>
                      {money(
                        isLive
                          ? (liveDashboard?.accounts?.cash?.expectedClosingPaise || 0) / 100
                          : f.accounts.Cash.closing
                      )}
                    </td>
                    <td>
                      <input
                        aria-label="Actual Cash"
                        type="number"
                        min="0"
                        step="0.01"
                        disabled={isClosed}
                        value={cashActual}
                        onChange={e => setCashActual(e.target.value)}
                        placeholder="0.00"
                      />
                    </td>
                    <td
                      style={{
                        fontWeight: 600,
                        color:
                          cashActual !== '' &&
                          isLive &&
                          Math.abs(
                            Math.round(parseFloat(cashActual || '0') * 100) -
                              (liveDashboard?.accounts?.cash?.expectedClosingPaise || 0)
                          ) === 0
                            ? '#16a34a'
                            : '#dc2626',
                      }}
                    >
                      {cashActual === ''
                        ? 'Enter count'
                        : isLive && liveDashboard?.accounts?.cash
                        ? money(
                            parseFloat(cashActual || '0') -
                              liveDashboard.accounts.cash.expectedClosingPaise / 100
                          )
                        : '0.00'}
                    </td>
                  </tr>

                  {/* Bank Row */}
                  <tr>
                    <td>
                      <strong>GPay / Bank Account</strong>
                    </td>
                    <td>
                      {money(
                        isLive
                          ? (liveDashboard?.accounts?.bank?.openingPaise || 0) / 100
                          : Object.entries(f.accounts)
                              .filter(([a]) => a !== 'Cash')
                              .reduce((n, [, a]) => n + a.opening, 0)
                      )}
                    </td>
                    <td>
                      {money(
                        isLive
                          ? (liveDashboard?.accounts?.bank?.netDeltaPaise || 0) / 100
                          : Object.entries(f.accounts)
                              .filter(([a]) => a !== 'Cash')
                              .reduce((n, [, a]) => n + (a.closing - a.opening), 0)
                      )}
                    </td>
                    <td>
                      {money(
                        isLive
                          ? (liveDashboard?.accounts?.bank?.expectedClosingPaise || 0) / 100
                          : Object.entries(f.accounts)
                              .filter(([a]) => a !== 'Cash')
                              .reduce((n, [, a]) => n + a.closing, 0)
                      )}
                    </td>
                    <td>
                      <input
                        aria-label="Actual Bank"
                        type="number"
                        min="0"
                        step="0.01"
                        disabled={isClosed}
                        value={bankActual}
                        onChange={e => setBankActual(e.target.value)}
                        placeholder="0.00"
                      />
                    </td>
                    <td
                      style={{
                        fontWeight: 600,
                        color:
                          bankActual !== '' &&
                          isLive &&
                          Math.abs(
                            Math.round(parseFloat(bankActual || '0') * 100) -
                              (liveDashboard?.accounts?.bank?.expectedClosingPaise || 0)
                          ) === 0
                            ? '#16a34a'
                            : '#dc2626',
                      }}
                    >
                      {bankActual === ''
                        ? 'Enter balance'
                        : isLive && liveDashboard?.accounts?.bank
                        ? money(
                            parseFloat(bankActual || '0') -
                              liveDashboard.accounts.bank.expectedClosingPaise / 100
                          )
                        : '0.00'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="form-body">
              <p>
                Count physical cash drawer bills. Verify your Bank / GPay account statement balance. Transfers preserve
                combined funds without affecting profit.
              </p>

              {!isClosed && (
                <>
                  <Field label="Closing / Reconciliation Note">
                    <textarea
                      rows={2}
                      value={note}
                      onChange={e => setNote(e.target.value)}
                      placeholder="Optional remarks regarding discrepancies or notes…"
                    />
                  </Field>

                  <label className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={holiday}
                      onChange={e => setHoliday(e.target.checked)}
                    />
                    Close as shop holiday (zero business activity allowed)
                  </label>

                  <div className="form-actions" style={{display: 'flex', gap: '1rem'}}>
                    <Btn secondary onClick={handleSaveDraft} disabled={isSubmitting}>
                      Save Draft Counts
                    </Btn>
                    <Btn onClick={handleCloseDay} disabled={isSubmitting}>
                      {isSubmitting ? 'Verifying & Closing…' : 'Reconcile & Close Day'}
                    </Btn>
                  </div>
                </>
              )}

              {isClosed && (
                <p>
                  <strong>Closing Note:</strong> {liveDashboard?.closing?.note || 'All accounts reconciled.'}
                </p>
              )}
            </div>
          </Card>
        </div>
      )}

      {schedule && (
        <Modal title="Shop Holidays Schedule" onClose={() => setSchedule(false)}>
          <div className="form-body stack">
            <p>
              Schedule non-working dates. Scheduled holidays cannot contain business activity. If the shop opens,
              remove the holiday schedule before posting.
            </p>

            <div className="stack" style={{gap: '0.5rem'}}>
              {liveHolidays.map(h => (
                <div
                  className="summary-row"
                  key={h.date}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '0.5rem',
                    background: '#f8fafc',
                    borderRadius: '4px',
                  }}
                >
                  <span>
                    <strong>{h.date}</strong> · {h.reason}
                  </span>
                  <Btn
                    secondary
                    onClick={() => handleRemoveHoliday(h.date)}
                    style={{padding: '0.2rem 0.5rem', fontSize: '0.75rem'}}
                  >
                    Remove
                  </Btn>
                </div>
              ))}
              {!liveHolidays.length && <p style={{color: '#64748b'}}>No scheduled holidays.</p>}
            </div>

            <hr />

            <Field label="Holiday Date">
              <input
                type="date"
                min={START_DATE}
                value={holidayDate}
                onChange={e => setHolidayDate(e.target.value)}
              />
            </Field>
            <Field label="Holiday Reason">
              <input
                value={holidayReason}
                onChange={e => setHolidayReason(e.target.value)}
                placeholder="Weekly holiday, festival, etc."
              />
            </Field>
            <Btn onClick={handleScheduleHoliday}>Add Scheduled Holiday</Btn>
          </div>
        </Modal>
      )}

      {showMissedModal && missedSummary && (
        <Modal title="Missed-Day Recovery & Historical Closure" onClose={() => setShowMissedModal(false)}>
          <div className="form-body stack" style={{gap: '1.25rem'}}>
            <div style={{background: '#f8fafc', padding: '0.75rem 1rem', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '0.875rem'}}>
              <div><strong>Status:</strong> {missedSummary.unclosedCount} unclosed business day(s) between <strong>{missedSummary.nextEligibleDate}</strong> and yesterday.</div>
              <div style={{marginTop: '0.25rem', color: '#64748b'}}>
                Business days must be closed in strict chronological order. Choose an appropriate resolution path below.
              </div>
            </div>

            {/* Pagination Range Navigation Controls */}
            {missedSummary.unclosedCount > 31 && (
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f1f5f9', padding: '0.5rem 0.75rem', borderRadius: '4px', fontSize: '0.85rem'}}>
                <span>
                  Viewing: <strong>{missedSummary.batch.fromDate}</strong> to <strong>{missedSummary.batch.toDate}</strong> ({missedSummary.batch.daysCount} of {missedSummary.unclosedCount} unclosed days)
                </span>
                <div style={{display: 'flex', gap: '0.5rem'}}>
                  <Btn
                    secondary
                    disabled={!bulkCursor || missedDaysLoading}
                    onClick={() => {
                      setBulkCursor(null);
                      fetchMissedDays();
                    }}
                    style={{fontSize: '0.75rem', padding: '0.2rem 0.5rem'}}
                  >
                    Earliest Range
                  </Btn>
                  <Btn
                    secondary
                    disabled={!missedSummary.pagination?.hasMore || missedDaysLoading}
                    onClick={() => {
                      const next = missedSummary.pagination.nextCursor;
                      setBulkCursor(next);
                      fetchMissedDays(next);
                    }}
                    style={{fontSize: '0.75rem', padding: '0.2rem 0.5rem'}}
                  >
                    Next 31 Days →
                  </Btn>
                </div>
              </div>
            )}

            {bulkCursor && (
              <div style={{background: '#eff6ff', border: '1px solid #bfdbfe', padding: '0.5rem 0.75rem', borderRadius: '4px', fontSize: '0.85rem', color: '#1e40af'}}>
                Browsing future unclosed days ({missedSummary.batch.fromDate} to {missedSummary.batch.toDate}). Closures must start from the earliest boundary (<strong>{missedSummary.nextEligibleDate}</strong>). Click "Earliest Range" above to close inactive days.
              </div>
            )}

            {/* Path 1: Bulk Holiday Closure (Supports Inactive Prefix) */}
            <div style={{border: '1px solid #cbd5e1', borderRadius: '8px', padding: '1rem', background: missedSummary.batch?.canBulkCloseHoliday ? '#f8fafc' : '#f1f5f9'}}>
              <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
                <h3 style={{margin: 0, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
                  <span>Path 1: Inactive Period / Bulk Holiday Closure</span>
                  {missedSummary.batch?.canBulkCloseHoliday ? (
                    <span className="badge green">
                      Eligible ({missedSummary.batch.eligibleDaysCount} day{missedSummary.batch.eligibleDaysCount === 1 ? '' : 's'})
                    </span>
                  ) : (
                    <span className="badge amber">Blocked by Activity</span>
                  )}
                </h3>
              </div>

              <p style={{fontSize: '0.875rem', color: '#475569', marginTop: '0.5rem'}}>
                If the shop was fully closed with zero business transactions, close this period (up to 31 days per batch) as holidays. Starting balances (Cash ₹{(missedSummary.startingBalances?.cashPaise / 100).toFixed(2)}, Bank ₹{(missedSummary.startingBalances?.bankPaise / 100).toFixed(2)}) carry forward unchanged without recording artificial sales or ledger entries.
              </p>

              {missedSummary.batch?.canBulkCloseHoliday ? (
                <div className="stack" style={{gap: '0.75rem', marginTop: '0.75rem'}}>
                  {missedSummary.batch.hasActiveDaysInBatch && (
                    <div style={{background: '#ecfdf5', border: '1px solid #a7f3d0', padding: '0.5rem 0.75rem', borderRadius: '4px', fontSize: '0.85rem', color: '#065f46'}}>
                      <strong>Contiguous inactive stretch detected:</strong> Days <strong>{missedSummary.batch.eligibleFromDate}</strong> to <strong>{missedSummary.batch.eligibleToDate}</strong> ({missedSummary.batch.eligibleDaysCount} days) have zero recorded transactions and can be closed as holidays. Day <strong>{missedSummary.batch.firstActiveDay?.date}</strong> contains active transactions ({missedSummary.batch.firstActiveDay?.activitySummary}) and will be ready for sequential reconciliation after closing the inactive stretch.
                    </div>
                  )}

                  <Field label="Holiday Reason / Inactive Note">
                    <input
                      value={bulkReason}
                      onChange={e => setBulkReason(e.target.value)}
                      placeholder="e.g. Shop holiday / inactive period"
                    />
                  </Field>

                  <label className="checkbox-row" style={{alignItems: 'flex-start', background: '#eff6ff', padding: '0.75rem', borderRadius: '6px', border: '1px solid #bfdbfe'}}>
                    <input
                      type="checkbox"
                      checked={bulkConfirmed}
                      onChange={e => setBulkConfirmed(e.target.checked)}
                      style={{marginTop: '0.2rem'}}
                    />
                    <span style={{fontSize: '0.85rem', color: '#1e3a8a'}}>
                      I confirm that the shop was completely inactive from <strong>{missedSummary.batch.eligibleFromDate}</strong> to <strong>{missedSummary.batch.eligibleToDate}</strong>. No real-world business transactions occurred on these dates—including sales, customer UPI/bank collections, cash movements, supplier bills/payments, stock receipts/returns, or service intake/repair/delivery.
                    </span>
                  </label>

                  {missedSummary.pagination?.hasMore && (
                    <div style={{fontSize: '0.8rem', color: '#64748b'}}>
                      Batch 1 of {Math.ceil(missedSummary.unclosedCount / 31)}. After closing this batch, resume to close the remaining {missedSummary.pagination.totalDaysRemaining} day(s).
                    </div>
                  )}

                  <Btn
                    onClick={handleBulkClose}
                    disabled={isSubmitting || !bulkConfirmed || Boolean(bulkCursor)}
                    style={{alignSelf: 'flex-start'}}
                  >
                    {isSubmitting
                      ? 'Closing Batch…'
                      : `Bulk Close ${missedSummary.batch.eligibleDaysCount} Inactive Day(s) as Holiday`}
                  </Btn>
                </div>
              ) : (
                <div style={{background: '#fef2f2', border: '1px solid #fca5a5', padding: '0.75rem', borderRadius: '6px', marginTop: '0.5rem', fontSize: '0.85rem', color: '#991b1b'}}>
                  <strong>Cannot bulk close as holiday:</strong> {missedSummary.batch?.blockReason}
                  <div style={{marginTop: '0.25rem'}}>
                    Please use Path 2 below to reconcile and close active business days individually.
                  </div>
                </div>
              )}
            </div>

            {/* Path 2: Sequential Day-by-Day Reconciliation */}
            <div style={{border: '1px solid #cbd5e1', borderRadius: '8px', padding: '1rem', background: '#fff'}}>
              <h3 style={{margin: 0, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
                <span>Path 2: Sequential Day-by-Day Reconciliation</span>
                <span className="badge green">Standard</span>
              </h3>
              <p style={{fontSize: '0.875rem', color: '#475569', marginTop: '0.5rem'}}>
                If real-world business transactions occurred (such as sales, customer receipts, or service jobs), reconcile each day sequentially starting from the oldest unclosed day.
              </p>
              <div style={{marginTop: '0.75rem'}}>
                <Link
                  className="btn primary"
                  href={`/profit?date=${missedSummary.nextEligibleDate}`}
                  onClick={() => setShowMissedModal(false)}
                >
                  Open {missedSummary.nextEligibleDate} for Reconciliation & Closing
                </Link>
              </div>
            </div>

            {/* Path 3: Historical Activity Catch-Up */}
            <div style={{border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1rem', background: '#f8fafc'}}>
              <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
                <h3 style={{margin: 0, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#64748b'}}>
                  <span>Path 3: Historical Unrecorded Transaction Catch-Up</span>
                </h3>
                <span className="badge red">Planned / Unavailable</span>
              </div>
              <p style={{fontSize: '0.85rem', color: '#64748b', marginTop: '0.5rem'}}>
                Controlled historical catch-up and cash discrepancy adjustment workflows remain unavailable in this version. All operational postings (sales invoices, customer collections, purchases, stock movements, service updates) strictly require the current open business day in Asia/Kolkata ({missedSummary.today}). Current-day entries cannot automatically reconstruct past unrecorded activity.
              </p>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
