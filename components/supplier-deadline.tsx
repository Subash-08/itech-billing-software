'use client';
import {useRef, useState} from 'react';
import {Btn, Modal, Field} from './ui';
export default function SupplierDeadline({purchaseId, onSaved}: {purchaseId: string; onSaved: () => void}) {
  const [open, setOpen] = useState(false), [bill, setBill] = useState<any>(null), [date, setDate] = useState(''), [reason, setReason] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const attempt = useRef<{payload: string; key: string} | null>(null);
  async function load() {
    setOpen(true); setBusy(true); setError(''); setBill(null);
    try { const r = await fetch(`/api/purchases/${encodeURIComponent(purchaseId)}`, {cache: 'no-store'}); const d = await r.json(); if (!r.ok) throw new Error(d.error); setBill(d.purchase); setDate(d.purchase.promisedPaymentDate || d.purchase.dueDate || ''); }
    catch(e) { setError(e instanceof Error ? e.message : 'Could not load bill.'); } finally {setBusy(false);}
  }
  return <><Btn secondary onClick={() => { setReason(''); void load(); }}>Extend deadline</Btn>{open && <Modal title="Change payment deadline" onClose={() => {if (!busy) setOpen(false);}}>
    <form onSubmit={async e => {e.preventDefault(); if (!bill || busy) return; setBusy(true); setError('');
      const body = {promisedPaymentDate: date, notes: reason, expectedVersion: bill.version || 0}; const payload = JSON.stringify(body);
      if (attempt.current?.payload !== payload) attempt.current = {payload, key: crypto.randomUUID()};
      try {const r = await fetch(`/api/purchases/${encodeURIComponent(purchaseId)}/due-date`, {method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({...body,idempotencyKey:attempt.current.key})}); const d=await r.json(); if(!r.ok) throw new Error(d.error || 'Could not change deadline.'); setOpen(false); onSaved(); window.dispatchEvent(new Event('itech:attention-refresh'));}
      catch(e){setError(e instanceof Error ? e.message : 'Please retry.');} finally{setBusy(false);}
    }}><div className="form-body stack">{error && <p role="alert" className="notice error">{error} <button type="button" onClick={load}>Reload bill</button></p>}
      <p>Record a new date agreed with the supplier. The original bill date and amount stay in its history.</p>
      <Field label="New payment deadline"><input required type="date" value={date} onChange={e=>setDate(e.target.value)} /></Field>
      <Field label="Reason"><input required maxLength={500} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Agreed with supplier" /></Field></div>
      <div className="form-actions"><Btn secondary disabled={busy} onClick={()=>setOpen(false)}>Cancel</Btn><Btn type="submit" disabled={busy || !bill}>{busy?'Saving…':'Save deadline'}</Btn></div>
    </form></Modal>}</>;
}
