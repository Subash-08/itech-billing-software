'use client';

import {useState, useEffect, useRef} from 'react';
import {Modal, Field, Btn, Badge} from './ui';
import {money, TODAY, uid, Line} from '@/lib/domain';
import {useStore} from './store';
import {Plus, Trash2, Check, AlertTriangle} from 'lucide-react';

export function IssueInvoiceModal({
  isOpen,
  onClose,
  draft,
  onIssued,
}: {
  isOpen: boolean;
  onClose: () => void;
  draft: {id: string; version: number; totalPaise: number; customerId: string};
  onIssued?: (invoice: any) => void;
}) {
  const {issueInvoiceApi, notify} = useStore();
  const [busy, setBusy] = useState(false);
  const [applyAdvance, setApplyAdvance] = useState(0);
  const [recordExcess, setRecordExcess] = useState(true);
  const [creditLimitOverride, setCreditLimitOverride] = useState(false);
  const [creditLimitReason, setCreditLimitReason] = useState('');
  const [paymentRows, setPaymentRows] = useState<
    Array<{account: 'Cash' | 'Bank'; method: 'Cash' | 'UPI' | 'BankTransfer' | 'Card'; amount: string; reference: string}>
  >([{account: 'Cash', method: 'Cash', amount: '', reference: ''}]);

  if (!isOpen) return null;

  const totalPaise = draft.totalPaise || 0;
  const totalRupees = totalPaise / 100;
  const paymentTotal = paymentRows.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);
  const advanceTotal = applyAdvance || 0;
  const effectivePaid = paymentTotal + advanceTotal;
  const remainingDue = Math.max(0, totalRupees - effectivePaid);
  const excessAmount = Math.max(0, effectivePaid - totalRupees);

  const addRow = () => {
    setPaymentRows((rows) => [...rows, {account: 'Bank', method: 'UPI', amount: '', reference: ''}]);
  };

  const removeRow = (index: number) => {
    setPaymentRows((rows) => rows.filter((_, i) => i !== index));
  };

  const updateRow = (index: number, field: string, value: any) => {
    setPaymentRows((rows) =>
      rows.map((row, i) => {
        if (i !== index) return row;
        const updated = {...row, [field]: value};
        if (field === 'account') {
          if (value === 'Cash') updated.method = 'Cash';
          else if (row.method === 'Cash') updated.method = 'UPI';
        } else if (field === 'method') {
          if (value === 'Cash') updated.account = 'Cash';
          else updated.account = 'Bank';
        }
        return updated;
      })
    );
  };

  const handleIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    for (const r of paymentRows) {
      const amt = parseFloat(r.amount) || 0;
      if (amt < 0) {
        notify('Payment amounts must be positive.');
        return;
      }
      if (amt > 0) {
        if (r.account === 'Cash' && r.method !== 'Cash') {
          notify('Cash account requires Cash payment method.');
          return;
        }
        if (r.account === 'Bank' && r.method === 'Cash') {
          notify('Bank account cannot use Cash payment method.');
          return;
        }
      }
    }

    if (advanceTotal > totalRupees) {
      notify('Customer advance applied cannot exceed the invoice total.');
      return;
    }

    const components = paymentRows
      .filter((r) => (parseFloat(r.amount) || 0) > 0)
      .map((r) => ({
        account: r.account,
        method: r.method,
        amountPaise: Math.round((parseFloat(r.amount) || 0) * 100),
        reference: r.reference.trim(),
      }));

    setBusy(true);
    try {
      const res = await issueInvoiceApi(draft.id, {
        draftId: draft.id,
        expectedVersion: draft.version,
        paymentComponents: components,
        applyCustomerAdvancePaise: Math.round(advanceTotal * 100),
        recordExcessAsCustomerAdvance: recordExcess,
        creditLimitOverride,
        creditLimitOverrideReason: creditLimitReason.trim(),
        idempotencyKey: `inv-issue-${uid('IDEM')}`,
      });

      if (res.success) {
        notify('Invoice issued successfully.');
        onClose();
        onIssued?.(res.invoice);
      } else {
        if (res.error?.includes('credit limit') || res.error?.includes('Credit limit')) {
          setCreditLimitOverride(true);
          notify('Customer credit limit exceeded. Check the override box and specify a reason.');
        } else {
          notify(res.error || 'Failed to issue invoice.');
        }
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`Issue Sales Invoice · ${draft.id}`} onClose={onClose} wide>
      <form onSubmit={handleIssue}>
        <div className="form-body stack">
          <div
            className="notice"
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              backgroundColor: 'var(--card-bg, #f8f9fa)',
              padding: '1rem',
              borderRadius: '6px',
            }}
          >
            <div>
              <span style={{fontSize: '0.85rem', color: 'var(--muted, #666)'}}>Invoice Gross Total</span>
              <h2 style={{margin: '0.25rem 0 0 0', color: 'var(--primary, #1a73e8)'}}>{money(totalRupees)}</h2>
            </div>
            <div style={{textAlign: 'right'}}>
              <span style={{fontSize: '0.85rem', color: 'var(--muted, #666)'}}>Balance After Payment</span>
              <h3 style={{margin: '0.25rem 0 0 0', color: remainingDue > 0 ? 'var(--error, #e53935)' : 'var(--success, #2e7d32)'}}>
                {money(remainingDue)}
              </h3>
            </div>
          </div>

          <Field label="Apply existing customer advance (₹)" hint="Oldest available advance balances will be drawn first.">
            <input
              type="number"
              min="0"
              step="0.01"
              max={totalRupees}
              value={applyAdvance || ''}
              onChange={(e) => setApplyAdvance(Math.max(0, Math.min(totalRupees, parseFloat(e.target.value) || 0)))}
              placeholder="0.00"
            />
          </Field>

          <div>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem'}}>
              <strong>Payment received at issue</strong>
              <Btn secondary onClick={addRow} style={{padding: '0.25rem 0.5rem', fontSize: '0.85rem'}}>
                <Plus size={14} /> Add payment line
              </Btn>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Account</th>
                    <th>Method</th>
                    <th>Amount (₹)</th>
                    <th>Reference / Note</th>
                    <th style={{width: '40px'}} />
                  </tr>
                </thead>
                <tbody>
                  {paymentRows.map((row, idx) => (
                    <tr key={idx}>
                      <td>
                        <select
                          value={row.account}
                          onChange={(e) => updateRow(idx, 'account', e.target.value as 'Cash' | 'Bank')}
                        >
                          <option value="Cash">Cash (Cash drawer)</option>
                          <option value="Bank">Bank (Main account)</option>
                        </select>
                      </td>
                      <td>
                        <select
                          value={row.method}
                          onChange={(e) => updateRow(idx, 'method', e.target.value as any)}
                        >
                          {row.account === 'Cash' ? (
                            <option value="Cash">Cash</option>
                          ) : (
                            <>
                              <option value="UPI">UPI</option>
                              <option value="BankTransfer">Bank Transfer / IMPS / NEFT</option>
                              <option value="Card">Card</option>
                            </>
                          )}
                        </select>
                      </td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="0.00"
                          value={row.amount}
                          onChange={(e) => updateRow(idx, 'amount', e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          placeholder="Transaction ref / UPI ID"
                          value={row.reference}
                          onChange={(e) => updateRow(idx, 'reference', e.target.value)}
                        />
                      </td>
                      <td>
                        {paymentRows.length > 1 && (
                          <button
                            type="button"
                            className="icon-btn"
                            onClick={() => removeRow(idx)}
                            aria-label="Remove payment line"
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {excessAmount > 0 && (
            <div className="notice" style={{backgroundColor: '#e8f5e9', borderLeft: '4px solid #4caf50'}}>
              <p style={{margin: '0 0 0.5rem 0'}}>
                <strong>Excess payment: {money(excessAmount)}</strong>
              </p>
              <label style={{display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer'}}>
                <input
                  type="checkbox"
                  checked={recordExcess}
                  onChange={(e) => setRecordExcess(e.target.checked)}
                />
                Record excess amount as reusable customer advance
              </label>
            </div>
          )}

          {creditLimitOverride && (
            <div className="notice full" style={{backgroundColor: '#fff3e0', borderLeft: '4px solid #ff9800'}}>
              <p style={{margin: '0 0 0.5rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
                <AlertTriangle size={18} color="#e65100" />
                <strong>Customer Credit Limit Override</strong>
              </p>
              <p style={{fontSize: '0.85rem', margin: '0 0 0.5rem 0'}}>
                This customer’s outstanding dues will exceed their configured credit limit. Provide an explicit justification for the audit trail.
              </p>
              <Field label="Override Reason *">
                <input
                  required
                  placeholder="e.g. Approved by Store Manager for high-value regular customer"
                  value={creditLimitReason}
                  onChange={(e) => setCreditLimitReason(e.target.value)}
                />
              </Field>
            </div>
          )}
        </div>

        <div className="form-actions">
          <Btn secondary disabled={busy} onClick={onClose}>
            Cancel
          </Btn>
          <Btn type="submit" disabled={busy}>
            {busy ? 'Issuing…' : 'Confirm & Issue Invoice'}
          </Btn>
        </div>
      </form>
    </Modal>
  );
}

export function StockAllocationModal({
  isOpen,
  onClose,
  line,
  customerId,
  onSave,
}: {
  isOpen: boolean;
  onClose: () => void;
  line: Line;
  customerId: string;
  onSave: (allocations: any[], serials: string[]) => void;
}) {
  const {fetchInventoryLotsApi, fetchReservationsPage, fetchInventorySerialsApi, notify} = useStore();
  const api = useRef({fetchInventoryLotsApi, fetchReservationsPage, fetchInventorySerialsApi, notify});
  api.current = {fetchInventoryLotsApi, fetchReservationsPage, fetchInventorySerialsApi, notify};
  const [loadError, setLoadError] = useState('');
  const [reload, setReload] = useState(0);
  const [lots, setLots] = useState<any[]>([]);
  const [reservations, setReservations] = useState<any[]>([]);
  const [serialsInStock, setSerialsInStock] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [allocRows, setAllocRows] = useState<
    Array<{lotId: string; reservationId?: string; quantity: number; serials: string[]}>
  >(() => {
    if ((line as any).stockAllocations && (line as any).stockAllocations.length > 0) {
      return (line as any).stockAllocations.map((a: any) => ({
        lotId: a.lotId,
        reservationId: a.reservationId || undefined,
        quantity: a.quantity || 1,
        serials: a.serials || [],
      }));
    }
    return [];
  });

  const qtyRequired = line.qty || 1;

  useEffect(() => {
    if (!isOpen || !line.productId) return;
    let active = true;
    setLoading(true); setLoadError('');
    // Paginate rather than silently considering only the first inventory page.
    async function pages(fetcher: (query: any) => Promise<any>, query: any, alias: string) {
      const rows: any[] = [];
      for (let page = 1; page <= 20; page++) {
        const result = await fetcher({...query, page, limit: 100});
        rows.push(...(result.records ?? result[alias] ?? []));
        if (page >= (result.totalPages ?? 1)) return rows;
        if (!active) return [];
      }
      throw new Error('This product has more than 2,000 stock records. A paginated stock search is required; no partial selection was loaded.');
    }
    Promise.all([
      pages(api.current.fetchInventoryLotsApi, {productId: line.productId}, 'lots'),
      customerId ? pages(api.current.fetchReservationsPage, {customerId, productId: line.productId, status: 'Active'}, 'records') : Promise.resolve([]),
      pages(api.current.fetchInventorySerialsApi, {productId: line.productId, status: 'InStock'}, 'serials'),
    ]).then(([lotRows, holds, serialRows]) => {
      if (!active) return;
      setLots(lotRows.filter(l => l.quantitySellable > 0).sort((a, b) =>
        String(a.receivedDate ?? '').localeCompare(String(b.receivedDate ?? '')) || String(a._id ?? a.id).localeCompare(String(b._id ?? b.id))));
      setReservations(holds); setSerialsInStock(serialRows);
    }).catch(error => { if (active) setLoadError(error instanceof Error ? error.message : 'Unable to load stock.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [isOpen, line.productId, customerId, reload]);

  if (!isOpen) return null;

  const totalAllocated = allocRows.reduce((sum, r) => sum + (r.quantity || 0), 0);
  const isSerialTracked = !!((line as any).isSerialTracked || lots.some(l => l.product?.isSerialTracked) || serialsInStock.length || reservations.some(r => r.serials?.length));

  const addAllocationRow = () => {
    if (!lots.length && !reservations.length) {
      notify('No available lots or reservations found for this product.');
      return;
    }
    const defaultLot = lots[0]?._id || lots[0]?.id || '';
    const hold = !defaultLot ? reservations.find(r => (r.remainingQuantity ?? r.qty) > 0) : undefined;
    setAllocRows((rows) => [...rows, {lotId: defaultLot || hold?.lotId || '',
      reservationId: hold ? hold._id || hold.id : undefined, quantity: 1, serials: []}]);
  };

  const autoAllocate = () => {
    if (!lots.length) {
      notify('No available lots to allocate from.');
      return;
    }
    let remaining = qtyRequired;
    const newRows: Array<{lotId: string; reservationId?: string; quantity: number; serials: string[]}> = [];
    for (const lot of lots) {
      if (remaining <= 0) break;
      const availableSerials = serialsInStock.filter(s => s.lotId === (lot._id || lot.id));
      const take = Math.min(remaining, lot.quantitySellable ?? 0, isSerialTracked ? availableSerials.length : remaining);
      if (take <= 0) continue;
      const lotSerials = isSerialTracked
        ? serialsInStock.filter((s) => (s.lotId === lot._id || s.lotId === lot.id)).slice(0, take).map((s) => s.serial || s.serialOriginal)
        : [];
      newRows.push({
        lotId: lot._id || lot.id,
        quantity: take,
        serials: lotSerials,
      });
      remaining -= take;
    }
    setAllocRows(newRows);
    notify(`Auto-allocated ${qtyRequired - remaining} of ${qtyRequired} unit(s).`);
  };

  const handleSave = () => {
    if (loading || loadError) { notify(loadError || 'Wait for stock to load.'); return; }
    if (totalAllocated !== qtyRequired) {
      notify(`Allocated quantity (${totalAllocated}) must equal line quantity (${qtyRequired}).`);
      return;
    }
    const used = new Map<string, number>();
    for (const r of allocRows) {
      if (!Number.isInteger(r.quantity) || r.quantity <= 0) { notify('Enter a positive whole quantity.'); return; }
      const source = r.reservationId ? reservations.find(h => (h._id || h.id) === r.reservationId) : lots.find(l => (l._id || l.id) === r.lotId);
      const capacity = r.reservationId ? source?.remainingQuantity ?? source?.qty ?? 0 : source?.quantitySellable ?? 0;
      const sourceKey = r.reservationId ? `hold:${r.reservationId}` : `lot:${r.lotId}`;
      used.set(sourceKey, (used.get(sourceKey) ?? 0) + r.quantity);
      if (!source || used.get(sourceKey)! > capacity) { notify('Selected quantity exceeds available stock. Reload the picker.'); return; }

      if (!r.lotId) {
        notify('Each allocation line must specify a stock lot.');
        return;
      }
      if (isSerialTracked && r.serials.length !== r.quantity) {
        notify(`Selected serials count (${r.serials.length}) must match allocated quantity (${r.quantity}) on lot ${r.lotId}.`);
        return;
      }
    }
    const allSerials = allocRows.flatMap((r) => r.serials);
    const normalized = allSerials.map(s => s.replace(/[^a-zA-Z0-9]/g, '').toLowerCase());
    if (new Set(normalized).size !== normalized.length || normalized.some(s => !s)) {
      notify('Select each serial only once.'); return;
    }
    onSave(allocRows, allSerials);
    onClose();
  };

  return (
    <Modal title={`Select stock · ${line.name}`} onClose={onClose} wide>
      <div className="form-body stack">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: 'var(--card-bg, #f8f9fa)',
            padding: '0.75rem 1rem',
            borderRadius: '6px',
          }}
        >
          <div>
            <span>Line item quantity: <strong>{qtyRequired} unit(s)</strong></span>
            {isSerialTracked && <Badge>Serial Tracked</Badge>}
          </div>
          <div>
            <span>Allocated: </span>
            <strong style={{color: totalAllocated === qtyRequired ? 'var(--success, #2e7d32)' : 'var(--error, #e53935)'}}>
              {totalAllocated} / {qtyRequired}
            </strong>
          </div>
        </div>

        {loadError && <div role="alert" className="notice">{loadError} <Btn secondary onClick={() => setReload(n => n + 1)}>Retry stock loading</Btn></div>}
        {loading ? (
          <p>Loading available lots and reservations…</p>
        ) : (
          <>
            <div style={{display: 'flex', gap: '0.5rem', justifyContent: 'flex-end'}}>
              <Btn secondary onClick={autoAllocate}>
                Auto-allocate FIFO
              </Btn>
              <Btn secondary onClick={addAllocationRow}>
                <Plus size={14} /> Add allocation row
              </Btn>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Stock Lot / Reservation</th>
                    <th>Available</th>
                    <th>Allocate Qty</th>
                    {isSerialTracked && <th>Serials</th>}
                    <th style={{width: '40px'}} />
                  </tr>
                </thead>
                <tbody>
                  {allocRows.map((row, idx) => {
                    const lot = lots.find((l) => (l._id || l.id) === row.lotId);
                    return (
                      <tr key={idx}>
                        <td>
                          <select
                            value={row.reservationId ? `RES:${row.reservationId}` : row.lotId}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val.startsWith('RES:')) {
                                const resId = val.slice(4);
                                const resObj = reservations.find((r) => (r._id || r.id) === resId);
                                setAllocRows((rs) =>
                                  rs.map((r, i) =>
                                    i === idx
                                      ? {
                                          ...r,
                                          reservationId: resId,
                                          lotId: resObj?.lotId || r.lotId,
                                          quantity: Math.min(r.quantity, resObj?.remainingQuantity || r.quantity),
                                          serials: resObj?.serials || [],
                                        }
                                      : r
                                  )
                                );
                              } else {
                                setAllocRows((rs) =>
                                  rs.map((r, i) =>
                                    i === idx
                                      ? {...r, lotId: val, reservationId: undefined, serials: []}
                                      : r
                                  )
                                );
                              }
                            }}
                          >
                            <optgroup label="Available Stock Lots">
                              {lots.map((l) => (
                                <option key={l._id || l.id} value={l._id || l.id}>
                                  Lot {l.batchNumber || (l._id || l.id).slice(-6)} (Sellable: {l.quantitySellable})
                                </option>
                              ))}
                            </optgroup>
                            {reservations.length > 0 && (
                              <optgroup label="Active Customer Holds">
                                {reservations.map((res) => (
                                  <option key={res._id || res.id} value={`RES:${res._id || res.id}`}>
                                    Hold {res.reservationNumber || res.id} (Held: {res.remainingQuantity ?? res.qty})
                                  </option>
                                ))}
                              </optgroup>
                            )}
                          </select>
                        </td>
                        <td>{row.reservationId ? 'From hold' : lot ? lot.quantitySellable : '—'}</td>
                        <td>
                          <input
                            type="number"
                            min="1"
                            max={qtyRequired}
                            value={row.quantity}
                            onChange={(e) => {
                              const q = parseInt(e.target.value, 10) || 1;
                              setAllocRows((rs) =>
                                rs.map((r, i) => (i === idx ? {...r, quantity: q, serials: []} : r))
                              );
                            }}
                          />
                        </td>
                        {isSerialTracked && (
                          <td>
                            <div className="stack">
                              {(row.reservationId
                                ? (reservations.find(h => (h._id || h.id) === row.reservationId)?.serials ?? [])
                                : serialsInStock.filter(s => s.lotId === row.lotId).map(s => s.serialOriginal ?? s.serial ?? s.serialNormalized)
                              ).map((serial: string) => <label key={serial}>
                                <input type="checkbox" checked={row.serials.includes(serial)} onChange={event => {
                                  const checked = event.target.checked;
                                  setAllocRows(rows => rows.map((r, i) => i === idx ? {...r, serials: checked
                                    ? [...r.serials, serial] : r.serials.filter(s => s !== serial)} : r));
                                }} /> {serial}
                              </label>)}
                              <small>{row.serials.length} / {row.quantity} selected</small>
                            </div>
                          </td>
                        )}
                        <td>
                          <button
                            type="button"
                            className="icon-btn"
                            onClick={() => setAllocRows((rs) => rs.filter((_, i) => i !== idx))}
                          >
                            <Trash2 size={15} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {!allocRows.length && (
                    <tr>
                      <td colSpan={isSerialTracked ? 5 : 4} style={{textAlign: 'center', padding: '1rem', color: 'var(--muted, #666)'}}>
                        No stock lots allocated. Click &quot;Auto-allocate FIFO&quot; or &quot;Add allocation row&quot;.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <div className="form-actions">
        <Btn secondary onClick={onClose}>
          Cancel
        </Btn>
        <Btn disabled={loading || !!loadError || totalAllocated !== qtyRequired} onClick={handleSave}>
          Use selected stock
        </Btn>
      </div>
    </Modal>
  );
}

export function CustomerReceiptModal({
  isOpen,
  onClose,
  invoice,
  onSuccess,
}: {
  isOpen: boolean;
  onClose: () => void;
  invoice: {id: string; customerId: string; dueAmount: number};
  onSuccess?: () => void;
}) {
  const {recordCustomerReceiptApi, notify} = useStore();
  const [busy, setBusy] = useState(false);
  const [account, setAccount] = useState<'Cash' | 'Bank'>('Cash');
  const [method, setMethod] = useState<'Cash' | 'UPI' | 'BankTransfer' | 'Card'>('Cash');
  const [amount, setAmount] = useState<string>(() => String(invoice.dueAmount || ''));
  const [reference, setReference] = useState('');
  const [date, setDate] = useState(TODAY);

  if (!isOpen) return null;

  const handleRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmt = parseFloat(amount) || 0;
    if (numAmt <= 0) {
      notify('Enter a positive receipt amount.');
      return;
    }

    setBusy(true);
    try {
      const amountPaise = Math.round(numAmt * 100);
      const res = await recordCustomerReceiptApi({
        customerId: invoice.customerId,
        date,
        components: [{
          account,
          method,
          amountPaise,
          reference: reference.trim(),
        }],
        allocations: [{
          targetType: 'Invoice',
          targetId: invoice.id,
          amountPaise,
        }],
        recordExcessAsCustomerAdvance: true,
        notes: `Receipt applied to invoice ${invoice.id}`,
        idempotencyKey: `rcpt-${Date.now()}-${uid('IDEM')}`,
      });

      if (res.success) {
        notify('Customer payment receipt recorded.');
        onClose();
        onSuccess?.();
      } else {
        notify(res.error || 'Failed to record customer receipt.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`Record Customer Receipt · ${invoice.id}`} onClose={onClose}>
      <form onSubmit={handleRecord}>
        <div className="form-body form-grid">
          <Field label="Receipt Date *">
            <input required type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Amount (₹) *">
            <input
              required
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </Field>
          <Field label="Receiving Account">
            <select
              value={account}
              onChange={(e) => {
                const acc = e.target.value as 'Cash' | 'Bank';
                setAccount(acc);
                if (acc === 'Cash') setMethod('Cash');
                else if (method === 'Cash') setMethod('UPI');
              }}
            >
              <option value="Cash">Cash (Cash drawer)</option>
              <option value="Bank">Bank (Main account)</option>
            </select>
          </Field>
          <Field label="Payment Method">
            <select value={method} onChange={(e) => setMethod(e.target.value as any)}>
              {account === 'Cash' ? (
                <option value="Cash">Cash</option>
              ) : (
                <>
                  <option value="UPI">UPI</option>
                  <option value="BankTransfer">Bank Transfer / NEFT</option>
                  <option value="Card">Card</option>
                </>
              )}
            </select>
          </Field>
          <Field label="Payment Reference / Note">
            <input
              placeholder="e.g. UPI Ref / Cheque No"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </Field>
        </div>
        <div className="form-actions">
          <Btn secondary disabled={busy} onClick={onClose}>
            Cancel
          </Btn>
          <Btn type="submit" disabled={busy}>
            {busy ? 'Recording…' : 'Record Receipt'}
          </Btn>
        </div>
      </form>
    </Modal>
  );
}

export function QuotationCancelModal({
  isOpen,
  onClose,
  quotationId,
  version,
  onSuccess,
}: {
  isOpen: boolean;
  onClose: () => void;
  quotationId: string;
  version: number;
  onSuccess?: () => void;
}) {
  const {cancelQuotationApi, notify} = useStore();
  const [reason, setReason] = useState('Customer declined or expired');
  const [busy, setBusy] = useState(false);

  if (!isOpen) return null;

  return (
    <Modal title={`Cancel Quotation · ${quotationId}`} onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!reason.trim()) return notify('Reason is required.');
          setBusy(true);
          try {
            const res = await cancelQuotationApi(quotationId, version, reason.trim());
            if (res.success) {
              notify('Quotation cancelled.');
              onClose();
              onSuccess?.();
            } else {
              notify(res.error || 'Failed to cancel quotation.');
            }
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="form-body">
          <p>This quotation will be marked as cancelled. No stock or payments are affected.</p>
          <Field label="Reason for cancellation *">
            <input required autoFocus value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
        </div>
        <div className="form-actions">
          <Btn secondary disabled={busy} onClick={onClose}>
            Keep quotation
          </Btn>
          <Btn danger type="submit" disabled={busy}>
            {busy ? 'Cancelling…' : 'Confirm Cancel'}
          </Btn>
        </div>
      </form>
    </Modal>
  );
}

export function QuotationReopenModal({
  isOpen,
  onClose,
  quotationId,
  version,
  onSuccess,
}: {
  isOpen: boolean;
  onClose: () => void;
  quotationId: string;
  version: number;
  onSuccess?: () => void;
}) {
  const {reopenQuotationApi, notify} = useStore();
  const [validUntil, setValidUntil] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Kolkata'}).format(d);
  });
  const [busy, setBusy] = useState(false);

  if (!isOpen) return null;

  return (
    <Modal title={`Reopen Quotation · ${quotationId}`} onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!validUntil || validUntil < TODAY) return notify('Validity date must be today or later.');
          setBusy(true);
          try {
            const res = await reopenQuotationApi(quotationId, version, validUntil);
            if (res.success) {
              notify('Quotation reopened successfully.');
              onClose();
              onSuccess?.();
            } else {
              notify(res.error || 'Failed to reopen quotation.');
            }
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="form-body">
          <p>Reopening will restore the quotation to Draft status so it can be edited, shared, or converted.</p>
          <Field label="New Validity Date *">
            <input required type="date" min={TODAY} value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
          </Field>
        </div>
        <div className="form-actions">
          <Btn secondary disabled={busy} onClick={onClose}>
            Cancel
          </Btn>
          <Btn type="submit" disabled={busy}>
            {busy ? 'Reopening…' : 'Reopen Quotation'}
          </Btn>
        </div>
      </form>
    </Modal>
  );
}

export function InvoiceCancelModal({
  isOpen,
  onClose,
  invoiceId,
  version,
  onSuccess,
}: {
  isOpen: boolean;
  onClose: () => void;
  invoiceId: string;
  version: number;
  onSuccess?: () => void;
}) {
  const {cancelInvoiceDraftApi, notify} = useStore();
  const [reason, setReason] = useState('Draft discarded by user');
  const [busy, setBusy] = useState(false);

  if (!isOpen) return null;

  return (
    <Modal title={`Cancel Invoice Draft · ${invoiceId}`} onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!reason.trim()) return notify('Reason is required.');
          setBusy(true);
          try {
            const res = await cancelInvoiceDraftApi(invoiceId, version, reason.trim());
            if (res.success) {
              notify('Invoice draft cancelled.');
              onClose();
              onSuccess?.();
            } else {
              notify(res.error || 'Failed to cancel draft.');
            }
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="form-body">
          <p>Cancel this unissued invoice draft? It has no financial posting or stock deductions.</p>
          <Field label="Reason for cancellation *">
            <input required autoFocus value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
        </div>
        <div className="form-actions">
          <Btn secondary disabled={busy} onClick={onClose}>
            Keep draft
          </Btn>
          <Btn danger type="submit" disabled={busy}>
            {busy ? 'Cancelling…' : 'Cancel Draft'}
          </Btn>
        </div>
      </form>
    </Modal>
  );
}
