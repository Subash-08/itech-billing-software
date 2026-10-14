'use client';
import {useEffect, useRef, useState} from 'react';
import Link from 'next/link';
import {planSupplierSettlement, SupplierBillTarget} from '@/lib/supplier-payment-plan';
import {money} from '@/lib/domain';
import {useStore} from './store';
import {Modal, Field, Btn} from './ui';

export default function SupplierBillPayment({supplierId, defaultPurchaseId, onClose}: {supplierId: string; defaultPurchaseId?: string; onClose: () => void}) {
  const {notify, refreshMasterData} = useStore();
  const [data, setData] = useState<{bills: SupplierBillTarget[]; availablePaise: number; balances: any[]} | null>(null);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);
  const [amount, setAmount] = useState('');
  const [cashPart, setCashPart] = useState('');
  const [account, setAccount] = useState('Bank');
  const [selectedOnly, setSelectedOnly] = useState(!!defaultPurchaseId);
  const [selected, setSelected] = useState<string[]>(defaultPurchaseId ? [defaultPurchaseId] : []);
  const [useBalance, setUseBalance] = useState(true);
  const [excess, setExcess] = useState(false);
  const [notes, setNotes] = useState('');
  const attempt = useRef<{fingerprint: string; key: string} | null>(null);
  const submitting = useRef(false);
  useEffect(() => {
    let active = true;
    setData(null); setError('');
    fetch(`/api/suppliers/${encodeURIComponent(supplierId)}/payment-plan`, {cache: 'no-store'})
      .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Could not load bills.'); return d; })
      .then(d => { if (active) setData(d); })
      .catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [supplierId, reload]);
  const amountPaise = Math.round(Number(amount || 0) * 100);
  let plan: ReturnType<typeof planSupplierSettlement> | null = null;
  let planError = '';
  try { if (data) plan = planSupplierSettlement(data.bills, amountPaise, useBalance ? data.availablePaise : 0, selectedOnly ? selected : undefined); }
  catch (e) { planError = e instanceof Error ? e.message : 'Check the payment amount.'; }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!data || !plan || submitting.current) return;
    if (selectedOnly && !selected.length) return setError('Select at least one bill.');
    if (plan.credit.length + plan.payment.length > 100) return setError('Select fewer bills; up to 100 bill lines can be settled at once.');
    const cash = account === 'Cash' ? amountPaise : account === 'Split' ? Math.round(Number(cashPart || 0) * 100) : 0;
    const bank = amountPaise - cash;
    if (cash < 0 || bank < 0) return setError('The cash part must be between zero and the payment amount.');
    for (const [kind, value] of [['Cash', cash], ['Bank', bank]] as const) {
      if (value > (data.balances.find(b => b.account === kind)?.balancePaise || 0)) return setError(`Not enough money in ${kind}.`);
    }
    const payload = {components: [
      ...(cash ? [{account: 'Cash', method: 'Cash', amountPaise: cash, reference: notes}] : []),
      ...(bank ? [{account: 'Bank', method: 'BankTransfer', amountPaise: bank, reference: notes}] : [])],
      ...(selectedOnly ? {selectedBillIds: selected} : {}), useAvailableBalance: useBalance, allowExcess: excess, notes,
      expectedPlan: JSON.stringify(plan)};
    const fingerprint = JSON.stringify(payload);
    if (attempt.current?.fingerprint !== fingerprint) attempt.current = {fingerprint, key: crypto.randomUUID()};
    submitting.current = true; setBusy(true); setError('');
    try {
      const r = await fetch(`/api/suppliers/${encodeURIComponent(supplierId)}/settlements`, {method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({...payload, idempotencyKey: attempt.current.key})});
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Could not record payment.');
      notify('Supplier bills updated.');
      window.dispatchEvent(new Event('itech:attention-refresh'));
      onClose();
      void refreshMasterData();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not record payment.'); }
    finally { submitting.current = false; setBusy(false); }
  }
  return <Modal title="Pay supplier" onClose={() => { if (!busy) onClose(); }} wide>
    <form onSubmit={submit}>
      <fieldset disabled={busy} className="form-body stack" style={{border: 0, minWidth: 0}}>
        {(error || planError) && <div role="alert" className="notice error">{error || planError} <Btn secondary disabled={busy} onClick={() => setReload(n => n + 1)}>Refresh bills</Btn></div>}
        {!data ? <p aria-live="polite">Loading unpaid bills…</p> : <>
          <div className="form-grid">
            <Field label="Amount you are paying now (₹)"><input type="number" min="0" step="0.01" value={amount} placeholder="0.00" onChange={e => setAmount(e.target.value)} /></Field>
            <Field label="Pay from"><select value={account} onChange={e => setAccount(e.target.value)}><option value="Bank">Bank / UPI</option><option value="Cash">Cash</option><option value="Split">Cash and bank</option></select></Field>
            {account === 'Split' && <Field label="Cash part (₹)" hint="The remaining amount comes from bank."><input type="number" min="0" step="0.01" value={cashPart} onChange={e => setCashPart(e.target.value)} /></Field>}
          </div>
          {data.availablePaise > 0 && <label className="check-row"><input type="checkbox" checked={useBalance} onChange={e => setUseBalance(e.target.checked)} />Use available supplier balance: {money(data.availablePaise / 100)} (advance or return credit)</label>}
          <label className="check-row"><input type="checkbox" checked={selectedOnly} onChange={e => setSelectedOnly(e.target.checked)} />Choose specific bills</label>
          <p className="muted">Oldest bill date first. A payment settles bill amounts, not individual physical products.</p>
          <div className="table-wrap" style={{maxHeight: 320, overflow: 'auto'}}><table><thead><tr><th>Bill</th><th>Deadline</th><th>Due</th><th>Apply now</th><th>Remaining</th></tr></thead><tbody>
            {[...data.bills].sort((a,b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)).map(b => {
              const applied = [...(plan?.credit || []), ...(plan?.payment || [])].filter(a => a.targetId === b.id).reduce((s,a) => s+a.amountPaise, 0);
              return <tr key={b.id}><td>{selectedOnly && <input aria-label={`Select ${b.number}`} type="checkbox" checked={selected.includes(b.id)} onChange={e => setSelected(s => e.target.checked ? [...s,b.id] : s.filter(id => id !== b.id))} />} {b.number}<small>{b.date}</small></td><td>{b.dueDate || '—'}</td><td>{money(b.duePaise/100)}</td><td>{money(applied/100)}</td><td>{money((b.duePaise-applied)/100)}</td></tr>;
            })}
          </tbody></table></div>
          {!data.bills.length && <p>No unpaid bills. Any payment will be kept for future bills.</p>}
          {!!plan?.excessPaise && <label className="check-row"><input type="checkbox" checked={excess} onChange={e => setExcess(e.target.checked)} />Keep the extra {money(plan.excessPaise/100)} for future bills</label>}
          <Field label="Reference / note"><input maxLength={100} value={notes} onChange={e => setNotes(e.target.value)} placeholder="UPI / bank reference or note" /></Field>
          <p>Available balance used: <b>{money((plan?.creditUsedPaise || 0)/100)}</b> · Money paid now: <b>{money((amountPaise || 0)/100)}</b></p>
          <Link href={`/suppliers/${supplierId}?tab=Advances%20%26%20credits`} onClick={onClose}>View available balance or record a supplier refund</Link>
        </>}
      </fieldset>
      <div className="form-actions"><Btn secondary disabled={busy} onClick={onClose}>Cancel</Btn><Btn type="submit" disabled={busy || !plan || !!planError || (!amountPaise && !plan.creditUsedPaise) || (!!plan.excessPaise && !excess)}>{busy ? 'Saving…' : 'Confirm payment'}</Btn></div>
    </form>
  </Modal>;
}
