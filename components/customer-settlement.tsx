'use client';
import {useState, useEffect} from 'react';
import {TODAY, uid, money} from '@/lib/domain';
import {useStore} from './store';
import {Modal, Btn, Field, Badge} from './ui';

export default function CustomerSettlement({
  customerId,
  onClose,
  onSuccess,
}: {
  customerId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const {state, notify, isLive, recordCustomerReceiptApi} = useStore();
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [account, setAccount] = useState<'Cash' | 'Bank'>('Cash');
  const [method, setMethod] = useState<'Cash' | 'UPI' | 'BankTransfer' | 'Card'>('Cash');
  const [splitPayment, setSplitPayment] = useState(false);
  const [cashPart, setCashPart] = useState('');
  const [bankPart, setBankPart] = useState('');
  const [date, setDate] = useState(TODAY);
  const [note, setNote] = useState('');
  const [excessAsAdvance, setExcessAsAdvance] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [receivables, setReceivables] = useState<any[]>([]);
  const [advances, setAdvances] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [idempotencyKey] = useState(() => `rcpt-set-${uid('IDEM')}`);

  const customer = state.customers.find(c => c.id === customerId || (c as any)._id === customerId);

  useEffect(() => {
    if (isLive && customerId) {
      setIsLoading(true);
      setLoadError('');
      fetch(`/api/sales/customers/${customerId}/receivables`)
        .then(async r => {
          const data = await r.json();
          if (!r.ok) throw new Error(data.error || 'Could not load customer receivables.');
          return data;
        })
        .then(data => {
          if (data && Array.isArray(data.receivables)) {
            setReceivables(data.receivables);
          }
          if (data && Array.isArray(data.advances)) {
            setAdvances(data.advances);
          }
        })
        .catch(err => {
          setReceivables([]);
          setLoadError(err instanceof Error ? err.message : 'Could not load customer receivables.');
        })
        .finally(() => {
          setIsLoading(false);
        });
    }
  }, [isLive, customerId]);

  const handleAccountChange = (acc: 'Cash' | 'Bank') => {
    setAccount(acc);
    if (acc === 'Cash') setMethod('Cash');
    else if (method === 'Cash') setMethod('UPI');
  };

  const handleSetFull = (key: string, duePaise: number) => {
    setAmounts(prev => ({
      ...prev,
      [key]: (duePaise / 100).toFixed(2),
    }));
  };

  const handleClear = (key: string) => {
    setAmounts(prev => {
      const next = {...prev};
      delete next[key];
      return next;
    });
  };

  // Compute total allocated from line inputs
  const totalAllocatedPaise = Object.values(amounts).reduce((sum, val) => {
    const n = parseFloat(val);
    return sum + (isNaN(n) || n <= 0 ? 0 : Math.round(n * 100));
  }, 0);

  // Compute payment components total
  const paymentTotalPaise = splitPayment
    ? Math.round((parseFloat(cashPart) || 0) * 100) + Math.round((parseFloat(bankPart) || 0) * 100)
    : totalAllocatedPaise;

  const excessPaise = paymentTotalPaise - totalAllocatedPaise;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (totalAllocatedPaise <= 0 && paymentTotalPaise <= 0) {
      notify('Enter receipt payment or allocate dues.');
      return;
    }

    if (splitPayment) {
      const c = Math.round((parseFloat(cashPart) || 0) * 100);
      const b = Math.round((parseFloat(bankPart) || 0) * 100);
      if (c + b <= 0) {
        notify('Enter positive split payment amounts.');
        return;
      }
      if (c + b < totalAllocatedPaise) {
        notify('Payment total is less than allocated line dues.');
        return;
      }
    }

    if (excessPaise > 0 && !excessAsAdvance) {
      notify('Confirm recording excess payment as customer advance.');
      return;
    }

    // Build components
    const components: Array<{
      account: 'Cash' | 'Bank';
      method: 'Cash' | 'UPI' | 'BankTransfer' | 'Card';
      amountPaise: number;
      reference?: string;
    }> = [];

    if (splitPayment) {
      const c = Math.round((parseFloat(cashPart) || 0) * 100);
      const b = Math.round((parseFloat(bankPart) || 0) * 100);
      if (c > 0) components.push({account: 'Cash', method: 'Cash', amountPaise: c, reference: note});
      if (b > 0) components.push({account: 'Bank', method: 'UPI', amountPaise: b, reference: note});
    } else {
      components.push({account, method, amountPaise: paymentTotalPaise, reference: note});
    }

    // Build allocations
    const allocations: Array<{
      targetType: 'Invoice' | 'OpeningReceivable';
      targetId: string;
      amountPaise: number;
    }> = [];

    for (const [key, val] of Object.entries(amounts)) {
      const n = parseFloat(val);
      if (!isNaN(n) && n > 0) {
        const item = receivables.find(r => r.id === key);
        if (item) {
          allocations.push({
            targetType: item.targetType,
            targetId: item.targetId,
            amountPaise: Math.round(n * 100),
          });
        }
      }
    }

    setIsSubmitting(true);
    try {
      const res = await recordCustomerReceiptApi({
        customerId,
        date,
        components,
        allocations,
        recordExcessAsCustomerAdvance: excessAsAdvance,
        notes: note || `Customer settlement (${customer?.name || 'Customer'})`,
        idempotencyKey,
      });

      if (!res.success) {
        throw new Error(res.error || 'Failed to record customer receipt.');
      }

      notify('Customer receipt recorded successfully.');
      onSuccess();
      onClose();
    } catch (err: any) {
      notify(err.message || 'Error recording customer receipt.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const totalAvailableAdvance = advances.reduce((s, a) => s + a.remainingAmountPaise, 0);

  return (
    <Modal title={`Customer Collection — ${customer?.name || 'Customer'}`} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="form-body stack">
          {loadError && (
            <div className="notice" style={{background: '#fef2f2', borderColor: '#fca5a5', color: '#b91c1c'}}>
              {loadError}
            </div>
          )}

          {totalAvailableAdvance > 0 && (
            <div className="notice" style={{background: '#eff6ff', borderColor: '#93c5fd', color: '#1e40af'}}>
              Customer has <strong>{money(totalAvailableAdvance / 100)}</strong> in available advance credit.
            </div>
          )}

          <div className="table-wrap">
            <table style={{fontSize: '0.875rem'}}>
              <thead>
                <tr>
                  <th>Type & Ref</th>
                  <th>Date</th>
                  <th>Due Date</th>
                  <th>Outstanding Due</th>
                  <th>Pay Amount (₹)</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={6} style={{textAlign: 'center', padding: '1rem', color: '#64748b'}}>
                      Loading customer receivables…
                    </td>
                  </tr>
                ) : receivables.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{textAlign: 'center', padding: '1rem', color: '#64748b'}}>
                      No outstanding invoices or opening dues for this customer.
                    </td>
                  </tr>
                ) : (
                  receivables.map(r => {
                    const dueAmt = r.remainingDuePaise / 100;
                    return (
                      <tr key={r.id}>
                        <td>
                          <strong>{r.reference}</strong>
                          <div>
                            <Badge>{r.targetType === 'OpeningReceivable' ? 'Opening Due' : 'Invoice'}</Badge>
                          </div>
                        </td>
                        <td>{r.date}</td>
                        <td>{r.dueDate || '—'}</td>
                        <td style={{color: '#dc2626', fontWeight: 600}}>{money(dueAmt)}</td>
                        <td style={{width: '140px'}}>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            max={dueAmt}
                            value={amounts[r.id] || ''}
                            onChange={e =>
                              setAmounts(prev => ({
                                ...prev,
                                [r.id]: e.target.value,
                              }))
                            }
                            placeholder="0.00"
                            style={{width: '100%', padding: '0.3rem'}}
                          />
                        </td>
                        <td>
                          <div style={{display: 'flex', gap: '0.25rem'}}>
                            <Btn
                              type="button"
                              secondary
                              onClick={() => handleSetFull(r.id, r.remainingDuePaise)}
                              style={{padding: '0.2rem 0.4rem', fontSize: '0.75rem'}}
                            >
                              Full
                            </Btn>
                            {amounts[r.id] && (
                              <Btn
                                type="button"
                                secondary
                                onClick={() => handleClear(r.id)}
                                style={{padding: '0.2rem 0.4rem', fontSize: '0.75rem'}}
                              >
                                Clear
                              </Btn>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div style={{display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderTop: '1px solid #e2e8f0'}}>
            <span>
              <strong>Total Allocated to Dues:</strong>
            </span>
            <span style={{fontWeight: 700, fontSize: '1rem', color: '#16a34a'}}>
              {money(totalAllocatedPaise / 100)}
            </span>
          </div>

          <div className="grid-2">
            <Field label="Receipt Date">
              <input required type="date" max={TODAY} value={date} onChange={e => setDate(e.target.value)} />
            </Field>
            <Field label="Split across Cash & Bank?">
              <div style={{marginTop: '0.5rem'}}>
                <label style={{display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer'}}>
                  <input
                    type="checkbox"
                    checked={splitPayment}
                    onChange={e => {
                      setSplitPayment(e.target.checked);
                      if (e.target.checked) {
                        setCashPart((totalAllocatedPaise / 200).toFixed(2));
                        setBankPart((totalAllocatedPaise / 200).toFixed(2));
                      }
                    }}
                  />
                  <span>Split payment</span>
                </label>
              </div>
            </Field>
          </div>

          {splitPayment ? (
            <div className="grid-2">
              <Field label="Cash in Shop (₹)">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={cashPart}
                  onChange={e => setCashPart(e.target.value)}
                  placeholder="0.00"
                />
              </Field>
              <Field label="GPay / Bank Account (₹)">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={bankPart}
                  onChange={e => setBankPart(e.target.value)}
                  placeholder="0.00"
                />
              </Field>
            </div>
          ) : (
            <div className="grid-2">
              <Field label="Deposit into Account">
                <select value={account} onChange={e => handleAccountChange(e.target.value as any)}>
                  <option value="Cash">Cash in shop</option>
                  <option value="Bank">GPay / Bank account</option>
                </select>
              </Field>
              <Field label="Payment Method">
                <select value={method} onChange={e => setMethod(e.target.value as any)}>
                  {account === 'Cash' ? (
                    <option value="Cash">Cash</option>
                  ) : (
                    <>
                      <option value="UPI">UPI / GPay</option>
                      <option value="BankTransfer">Bank Transfer (NEFT/IMPS)</option>
                      <option value="Card">Card</option>
                    </>
                  )}
                </select>
              </Field>
            </div>
          )}

          {excessPaise > 0 && (
            <div className="notice" style={{background: '#fef3c7', borderColor: '#fcd34d', color: '#92400e'}}>
              <label style={{display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer'}}>
                <input
                  type="checkbox"
                  checked={excessAsAdvance}
                  onChange={e => setExcessAsAdvance(e.target.checked)}
                />
                <span>
                  Record excess payment of <strong>{money(excessPaise / 100)}</strong> as customer advance credit.
                </span>
              </label>
            </div>
          )}

          <Field label="Notes / Reference Details">
            <textarea
              rows={2}
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Payment reference, cheque number, or notes…"
            />
          </Field>
        </div>

        <div className="form-actions">
          <Btn secondary onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Btn>
          <Btn type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Recording Receipt…' : `Collect ${money(paymentTotalPaise / 100)}`}
          </Btn>
        </div>
      </form>
    </Modal>
  );
}
