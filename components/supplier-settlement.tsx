'use client';
import {useState, useEffect} from 'react';
import {TODAY, uid, money, accountBalance} from '@/lib/domain';
import {purchaseLineBalances} from '@/lib/settlement';
import {addPayment} from '@/lib/operations';
import {useStore} from './store';
import {Modal, Btn, Field, Badge} from './ui';

export default function SupplierSettlement({
  supplierId,
  defaultPurchaseId,
  onClose,
}: {
  supplierId: string;
  defaultPurchaseId?: string;
  onClose: () => void;
}) {
  const {state, run, notify, isLive, recordSupplierPaymentApi} = useStore();
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [advanceAmount, setAdvanceAmount] = useState('');
  const [account, setAccount] = useState('Bank account');
  const [method, setMethod] = useState('BankTransfer');
  const [splitPayment, setSplitPayment] = useState(false);
  const [cashPart, setCashPart] = useState('');
  const [bankPart, setBankPart] = useState('');
  const [date] = useState(TODAY);
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverPayables, setServerPayables] = useState<any[] | null>(null);
  const [isLoadingPayables, setIsLoadingPayables] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [liveBalances, setLiveBalances] = useState<{cash: number; bank: number} | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(() => `settle-${uid('IDEM')}`);

  const supplier = state.suppliers.find(s => s.id === supplierId || (s as any)._id === supplierId);

  // Fetch live payables when in live mode
  useEffect(() => {
    if (isLive && supplierId) {
      setIsLoadingPayables(true);
      setLoadError('');
      fetch(`/api/suppliers/${supplierId}/payables`)
        .then(async r => {
          const data = await r.json();
          if (!r.ok) throw new Error(data.error || 'Could not load supplier payables.');
          return data;
        })
        .then(data => {
          if (data && Array.isArray(data.payables || data.records)) {
            setServerPayables(data.payables || data.records);
          }
        })
        .catch(err => { setServerPayables([]); setLoadError(err instanceof Error ? err.message : 'Could not load supplier payables.'); })
        .finally(() => {
          setIsLoadingPayables(false);
        });

      fetch('/api/purchases/reconciliation/accounts')
        .then(async r => {
          const data = await r.json();
          if (!r.ok) throw new Error(data.error || 'Could not load account balances.');
          setLiveBalances({cash: (data.cash?.projectedBalancePaise || 0) / 100, bank: (data.bank?.projectedBalancePaise || 0) / 100});
        })
        .catch(() => setLoadError(current => current || 'Could not load live account balances.'));
    }
  }, [isLive, supplierId]);

  // Compute eligible bills from store for fallback or demo mode
  const bills = state.purchases.filter(
    b =>
      (b.supplierId === supplierId || (b as any).supplierId === (supplier as any)?._id) &&
      (b.billStatus === 'Posted' || b.billStatus === 'Credited' || (!isLive && b.status !== 'Draft'))
  );

  let rows: Array<{
    key: string;
    targetType: 'PurchaseLine' | 'OpeningPayable';
    targetId: string;
    purchaseLineId?: string;
    billId: string;
    name: string;
    status: string;
    total: number;
    paid: number;
    returned: number;
    due: number;
    productId?: string;
  }> = [];

  if (serverPayables !== null) {
    rows = serverPayables.map((item: any) => {
      const isOpening = item.payableType === 'OpeningPayable';
      return {
        key: item.id || (isOpening ? item.id : `${item.purchaseId}::${item.purchaseLineId}`),
        targetType: isOpening ? 'OpeningPayable' : 'PurchaseLine',
        targetId: isOpening ? item.id : item.purchaseId,
        purchaseLineId: isOpening ? undefined : item.purchaseLineId,
        billId: isOpening
          ? item.reference || 'Opening balance'
          : item.purchaseNumber || item.supplierInvoiceNumber || item.purchaseId,
        name: isOpening ? item.reference || 'Opening Balance' : item.description || 'Product',
        status: isOpening ? 'Opening' : 'Posted',
        total: (item.originalAmountPaise || 0) / 100,
        paid: Math.max(0, ((item.originalAmountPaise || 0) - (item.remainingDuePaise || 0)) / 100),
        returned: 0,
        due: (item.remainingDuePaise || 0) / 100,
      };
    });
  } else {
    rows = bills.flatMap(b =>
      (isLive
        ? b.lines.map((line: any) => ({
            productId: line.productId || line.lineId,
            name: line.lineType === 'Charge' ? line.description || 'Charge' : line.name,
            qty: line.qty || 1,
            total: line.total || 0,
            paid: line.paid || 0,
            returned: line.credited || 0,
            due: line.due || 0,
            lineId: line.lineId,
            lineType: line.lineType || 'Product',
          }))
        : purchaseLineBalances(state, b)
      ).map(l => {
        const liveLine = (b.lines || []).find(
          (x: any) => (x.lineId && x.lineId === (l as any).lineId) || x.productId === l.productId
        );
        const lineId = (l as any).lineId || (liveLine as any)?.lineId;
        return {
          ...l,
          key: b.id + '::' + (lineId || l.productId),
          targetType: 'PurchaseLine' as const,
          targetId: b.id,
          purchaseLineId: lineId,
          billId: b.purchaseNumber || b.reference || b.id,
          status: b.billStatus || b.status,
          productId: l.productId,
        };
      })
    );
  }

  // Pre-fill defaultPurchaseId if specified and amounts is empty
  useEffect(() => {
    if (defaultPurchaseId && rows.length > 0 && Object.keys(amounts).length === 0) {
      const init: Record<string, string> = {};
      for (const r of rows) {
        if (r.targetId === defaultPurchaseId && r.due > 0) {
          init[r.key] = String(r.due);
        }
      }
      if (Object.keys(init).length > 0) {
        setAmounts(init);
      }
    }
  }, [defaultPurchaseId, rows]);

  const allocatedTotal = rows.reduce((sum, r) => sum + (Number(amounts[r.key]) || 0), 0);
  const advNum = Number(advanceAmount) || 0;
  const total = Math.round((allocatedTotal + advNum) * 100) / 100;

  const cashBal = liveBalances?.cash ?? accountBalance(state, 'Cash');
  const bankBal = liveBalances?.bank ?? accountBalance(state, 'Bank account');

  function handlePayAll() {
    const next: Record<string, string> = {};
    for (const r of rows) {
      if (r.due > 0) {
        next[r.key] = String(r.due);
      }
    }
    setAmounts(next);
  }

  function handleClearAll() {
    setAmounts({});
    setAdvanceAmount('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (total <= 0) return notify('Please enter a payment amount.');

    const cashToPay = splitPayment ? Number(cashPart) || 0 : account === 'Cash' ? total : 0;
    const bankToPay = splitPayment ? Number(bankPart) || 0 : account === 'Bank account' ? total : 0;
    if (Math.round((cashToPay + bankToPay) * 100) !== Math.round(total * 100)) return notify('Cash and bank payment parts must equal the total payment.');
    if (cashToPay > cashBal) return notify(`Cash payment cannot exceed the available balance of ${money(cashBal)}.`);
    if (bankToPay > bankBal) return notify(`Bank payment cannot exceed the available balance of ${money(bankBal)}.`);

    if (isLive) {
      setIsSubmitting(true);
      try {
        const allocations = rows
          .filter(r => Number(amounts[r.key]) > 0)
          .map(r => ({
            targetType: r.targetType,
            targetId: r.targetId,
            purchaseLineId: r.targetType === 'OpeningPayable' ? undefined : r.purchaseLineId,
            amountPaise: Math.round(Number(amounts[r.key]) * 100),
          }));

        const res = await recordSupplierPaymentApi({
          supplierId,
          date,
          components: [
            ...(cashToPay > 0 ? [{account: 'Cash', method: 'Cash', amountPaise: Math.round(cashToPay * 100), reference: note || undefined}] : []),
            ...(bankToPay > 0 ? [{account: 'Bank', method, amountPaise: Math.round(bankToPay * 100), reference: note || undefined}] : []),
          ],
          allocations,
          recordExcessAsAdvance: advNum > 0 || allocations.length === 0,
          notes: note,
          idempotencyKey,
        });

        if (res && res.success) {
          setIdempotencyKey(`settle-${uid('IDEM')}`);
          onClose();
        }
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    const ok = run(s => {
      let next = s;
      const billsToPay = bills.length > 0 ? bills : state.purchases.filter(b => b.supplierId === supplierId);
      for (const b of billsToPay) {
        const billAllocations = rows
          .filter(r => (r.targetId === b.id || r.billId === b.id) && Number(amounts[r.key]) > 0)
          .map(r => ({productId: r.productId || '', amount: Number(amounts[r.key])}))
          .filter(x => x.productId);
        if (!billAllocations.length) continue;
        next = addPayment(next, {
          id: uid('PAY'),
          date,
          direction: 'Out',
          account,
          amount: billAllocations.reduce((a, l) => a + l.amount, 0),
          purpose: 'Supplier payment',
          reference: b.id,
          party: supplierId,
          note,
          allocations: billAllocations,
        });
      }

      if (advNum > 0 || Object.values(amounts).every(v => !Number(v))) {
        const payAmt = advNum > 0 ? advNum : total;
        if (payAmt > 0) {
          next = addPayment(next, {
            id: uid('PAY'),
            date,
            direction: 'Out',
            account,
            amount: payAmt,
            purpose: 'Supplier advance',
            reference: uid('ADV'),
            party: supplierId,
            note: note || 'Advance payment to supplier',
          });
        }
      }
      return next;
    }, 'Supplier payment recorded.');

    if (ok) onClose();
  }

  const supplierTitle = supplier?.name ? `Pay supplier · ${supplier.name}` : 'Pay supplier · select purchased items';

  return (
    <Modal title={supplierTitle} onClose={onClose} wide>
      <form onSubmit={handleSubmit}>
        <div className="form-body">
          <div className="notice">
            Pay selected products across bills or disburse an on-account advance. All amounts are checked before money moves.
          </div>
          {loadError && <div className="notice error">{loadError} Refresh the dialog before recording a live payment.</div>}

          {rows.length > 0 ? (
            <>
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px'}}>
                <span style={{fontSize: '0.85rem', color: 'var(--muted)'}}>
                  {rows.length} payable {rows.length === 1 ? 'item' : 'items'} found
                  {isLoadingPayables ? ' (updating...)' : ''}
                </span>
                <div style={{display: 'flex', gap: '8px'}}>
                  <button type="button" className="link-button" onClick={handlePayAll}>
                    Pay all dues
                  </button>
                  <button type="button" className="link-button" onClick={handleClearAll}>
                    Clear
                  </button>
                </div>
              </div>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Bill / product</th>
                      <th>Purchased</th>
                      <th>Paid</th>
                      <th>Credits</th>
                      <th>Remaining</th>
                      <th>Pay now</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(r => (
                      <tr key={r.key}>
                        <td>
                          {r.name}
                          <small>
                            {r.billId} · {r.status}
                          </small>
                        </td>
                        <td>{money(r.total)}</td>
                        <td>{money(r.paid)}</td>
                        <td>{money(r.returned)}</td>
                        <td>{money(r.due)}</td>
                        <td>
                          {r.due > 0 ? (
                            <div className="actions">
                              <input
                                className="table-input"
                                aria-label={'Pay ' + r.name + ' ' + r.billId}
                                type="number"
                                min="0"
                                max={r.due}
                                step="0.01"
                                value={amounts[r.key] || ''}
                                onChange={e => setAmounts(a => ({...a, [r.key]: e.target.value}))}
                              />
                              <button
                                className="link-button"
                                type="button"
                                onClick={() => setAmounts(a => ({...a, [r.key]: String(r.due)}))}
                              >
                                Full
                              </button>
                            </div>
                          ) : (
                            <Badge>Paid</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{marginTop: '12px'}}>
                <Field label="Additional advance / excess payment (optional)" hint="Any unallocated amount will be credited to supplier's advance ledger">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={advanceAmount}
                    onChange={e => setAdvanceAmount(e.target.value)}
                  />
                </Field>
              </div>
            </>
          ) : (
            <div style={{padding: '24px 16px', background: 'var(--surface-sunken)', borderRadius: '8px', border: '1px solid var(--border)', textAlign: 'center'}}>
              <div style={{fontWeight: 600, fontSize: '1rem', marginBottom: '6px', color: 'var(--text)'}}>
                No outstanding bills or dues for this supplier
              </div>
              <p style={{fontSize: '0.875rem', color: 'var(--muted)', margin: '0 0 16px 0'}}>
                You can disburse an advance payment or on-account balance to this supplier below.
              </p>
              <div style={{maxWidth: '320px', margin: '0 auto', textAlign: 'left'}}>
                <Field label="Payment amount (Advance / On-account) *">
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    placeholder="Enter amount (e.g. 5000.00)"
                    value={advanceAmount}
                    onChange={e => setAdvanceAmount(e.target.value)}
                    required
                    autoFocus
                  />
                </Field>
              </div>
            </div>
          )}

          <div className="form-grid spaced" style={{marginTop: '16px'}}>
            <Field label="Pay from">
              <select value={account} onChange={e => { setAccount(e.target.value); if (e.target.value === 'Cash') setMethod('Cash'); else if (method === 'Cash') setMethod('BankTransfer'); }}>
                <option value="Bank account">Bank account ({money(bankBal)})</option>
                <option value="Cash">Cash ({money(cashBal)})</option>
              </select>
            </Field>
            <Field label="Payment breakdown">
              <label className="check-row"><input type="checkbox" checked={splitPayment} onChange={e => { setSplitPayment(e.target.checked); if (e.target.checked) { setCashPart(''); setBankPart(String(total)); } }} /> Split between cash and bank</label>
            </Field>
            {splitPayment && <>
              <Field label={`Cash part (available ${money(cashBal)})`}><input type="number" min="0" max={cashBal} step="0.01" value={cashPart} onChange={e => setCashPart(e.target.value)} /></Field>
              <Field label={`Bank part (available ${money(bankBal)})`}><input type="number" min="0" max={bankBal} step="0.01" value={bankPart} onChange={e => setBankPart(e.target.value)} /></Field>
            </>}
            <Field label="Payment method">
              <select value={method} disabled={account === 'Cash'} onChange={e => setMethod(e.target.value)}>
                {account === 'Cash' ? <option value="Cash">Cash</option> : <>
                  <option value="BankTransfer">Bank transfer / GPay / UPI</option>
                  <option value="UPI">UPI</option>
                  <option value="Cheque">Cheque</option>
                </>}
              </select>
            </Field>
            <Field label="Payment date">
              <input required type="date" value={date} readOnly />
              <small>Supplier payments are posted to today’s open business day.</small>
            </Field>
            <div className="full">
              <Field label="Payment reference / note">
                <input
                  placeholder="e.g. Cheque / UTR / GPay reference or notes"
                  value={note}
                  onChange={e => setNote(e.target.value)}
                />
              </Field>
            </div>
          </div>
        </div>
        <div className="form-actions">
          <strong style={{marginRight: 'auto', fontSize: '1.05rem'}}>Total payment {money(total)}</strong>
          <Btn secondary onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Btn>
          <Btn type="submit" disabled={isSubmitting || total <= 0 || !!loadError || (isLive && isLoadingPayables)}>
            {isSubmitting ? 'Recording...' : 'Confirm supplier payment'}
          </Btn>
        </div>
      </form>
    </Modal>
  );
}
