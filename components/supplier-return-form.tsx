'use client';

import {useEffect, useRef, useState} from 'react';
import Link from 'next/link';
import {money, uid} from '@/lib/domain';
import {useStore} from './store';
import {Btn, Field, Modal} from './ui';

async function read(url: string, signal: AbortSignal) {
  const res = await fetch(url, {signal, cache: 'no-store'});
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Could not load supplier stock.');
  return data;
}

// Never silently truncate a stock/serial selector.
async function readPages(url: string, signal: AbortSignal) {
  const records: any[] = [];
  for (let page = 1; page <= 20; page++) {
    const data = await read(`${url}&limit=100&page=${page}`, signal);
    records.push(...(data.records || []));
    if (page >= (data.totalPages || 1)) return records;
  }
  throw new Error('More than 2,000 records match. A narrower stock selector is required; no partial stock list was used.');
}

export default function SupplierReturnForm({initialPurchaseId, onClose}: {initialPurchaseId: string; onClose: () => void}) {
  const {recordSupplierReturnApi} = useStore();
  const [purchaseId, setPurchaseId] = useState(initialPurchaseId);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [bills, setBills] = useState<any[]>([]);
  const [purchase, setPurchase] = useState<any>(null);
  const [lineId, setLineId] = useState('');
  const [lots, setLots] = useState<any[]>([]);
  const [lotId, setLotId] = useState('');
  const [condition, setCondition] = useState('Sellable');
  const [units, setUnits] = useState<any[]>([]);
  const [serials, setSerials] = useState<string[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<any>(null);
  const [reload, setReload] = useState(0);
  const attempt = useRef<{fingerprint: string; key: string} | null>(null);
  const submitting = useRef(false);
  const line = purchase?.lines?.find((l: any) => l.lineId === lineId);
  const lot = lots.find(l => l._id === lotId);
  const available = lot ? (condition === 'Sellable' ? lot.quantitySellable : lot.quantityDefective) || 0 : 0;
  const tracked = !!line?.productSnapshot?.isSerialTracked;

  useEffect(() => {
    const controller = new AbortController();
    read(`/api/purchases?search=${encodeURIComponent(search)}&page=${page}&limit=25`, controller.signal)
      .then(data => { setBills(data.records || []); setPages(data.totalPages || 1); })
      .catch(e => { if (e.name !== 'AbortError') setError(e.message); });
    return () => controller.abort();
  }, [search, page]);

  useEffect(() => {
    const controller = new AbortController();
    setPurchase(null); setLineId(''); setLots([]); setLotId(''); setSerials([]); setError('');
    if (!purchaseId) return () => controller.abort();
    setLoading(true);
    read(`/api/purchases/${encodeURIComponent(purchaseId)}`, controller.signal)
      .then(data => setPurchase(data.purchase))
      .catch(e => { if (e.name !== 'AbortError') setError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [purchaseId, reload]);

  useEffect(() => {
    const controller = new AbortController();
    setLots([]); setLotId(''); setSerials([]); setUnits([]);
    if (!line?.productId) return () => controller.abort();
    readPages(`/api/inventory/lots?productId=${encodeURIComponent(line.productId)}`, controller.signal)
      .then(data => {
        const matched = data.filter(l => l.purchaseId === purchaseId && l.purchaseLineId === lineId);
        setLots(matched);
        if (matched.length === 1) setLotId(matched[0]._id);
      })
      .catch(e => { if (e.name !== 'AbortError') setError(e.message); });
    return () => controller.abort();
  }, [purchaseId, lineId, line?.productId]);

  useEffect(() => {
    const controller = new AbortController();
    setUnits([]); setSerials([]);
    if (!tracked || !lotId) return () => controller.abort();
    readPages(`/api/inventory/serials?lotId=${encodeURIComponent(lotId)}&status=${condition === 'Defective' ? 'Defective' : 'InStock'}`, controller.signal)
      .then(setUnits).catch(e => { if (e.name !== 'AbortError') setError(e.message); });
    return () => controller.abort();
  }, [lotId, condition, tracked]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting.current) return;
    if (!line || !lot || !Number.isInteger(quantity) || quantity < 1 || quantity > available || !reason.trim()) {
      setError('Select the purchase line, available receipt stock, whole quantity and return reason.'); return;
    }
    if (tracked && serials.length !== quantity) { setError(`Select exactly ${quantity} available serial numbers.`); return; }
    const payload = {purchaseId, purchaseLineId: lineId, lotId, quantity, serials: tracked ? serials : [],
      condition, disposition: 'ReturnedToSupplier', reason: reason.trim()};
    const fingerprint = JSON.stringify(payload);
    if (attempt.current?.fingerprint !== fingerprint) attempt.current = {fingerprint, key: uid('SRET')};
    submitting.current = true; setBusy(true); setError('');
    try {
      const result = await recordSupplierReturnApi({...payload, idempotencyKey: attempt.current.key});
      if (!result.success) throw new Error(result.error || 'Return failed.');
      setDone(result.returnDoc);
    } catch (e: any) { setError(e.message || 'Could not record return. Retry unchanged inputs if the connection failed.'); }
    finally { submitting.current = false; setBusy(false); }
  }

  return <Modal title="Return stock to supplier" wide onClose={() => { if (!busy) onClose(); }}>
    {done ? <div className="stack body-pad">
      <h3>Stock returned · awaiting supplier credit</h3>
      <p>{done.returnNumber || done._id}: {quantity} unit(s) returned. Estimated credit: {money((done.totalReturnCreditPaise || 0) / 100)}.</p>
      <p>The return removes stock. Supplier dues change only after accepting the supplier credit note. No cash or account money moves at this step.</p>
      <Link className="btn" href={`/suppliers/${purchase.supplierId}`}>Open supplier · accept credit note</Link>
      <Btn secondary onClick={onClose}>Close</Btn>
    </div> : <form onSubmit={submit} className="stack body-pad">
      {error && <div role="alert" className="notice">{error} <Btn secondary onClick={() => { setError(''); setReload(n => n + 1); }}>Reload stock and bill</Btn></div>}
      <fieldset disabled={busy} style={{border: 0, padding: 0, margin: 0}} className="stack">
        <Field label="Find supplier bill"><input value={search} onChange={e => {setSearch(e.target.value); setPage(1);}} placeholder="Bill number or supplier" /></Field>
        <Field label="Original supplier bill *"><select required value={purchaseId} onChange={e => setPurchaseId(e.target.value)}>
          <option value="">Select bill</option>
          {purchaseId && !bills.some(b => b._id === purchaseId) && <option value={purchaseId}>{purchase?.purchaseNumber || purchaseId}</option>}
          {bills.filter(b => ['Posted', 'Credited', 'FullyCredited'].includes(b.billStatus)).map(b => <option key={b._id} value={b._id}>{b.purchaseNumber} · {b.supplierSnapshot?.name || 'Supplier'}</option>)}
        </select></Field>
        <div className="actions"><Btn secondary disabled={page <= 1} onClick={() => setPage(n => n - 1)}>Previous</Btn><span>Page {page} of {pages}</span><Btn secondary disabled={page >= pages} onClick={() => setPage(n => n + 1)}>Next</Btn></div>
        {loading && <p>Loading bill…</p>}
        {purchase && <p>Bill {money(purchase.totalPaise / 100)} · Paid / advance applied {money((purchase.allocatedPaidPaise || 0) / 100)} · Credit applied {money((purchase.creditedLiabilityPaise || 0) / 100)} · Due {money((purchase.duePaise || 0) / 100)}</p>}
        <Field label="Product line *"><select required value={lineId} onChange={e => {setLineId(e.target.value); setQuantity(1);}}>
          <option value="">Select product line</option>
          {(purchase?.lines || []).filter((l: any) => l.lineType === 'Product').map((l: any, i: number) => <option key={l.lineId} value={l.lineId}>{i + 1}. {l.productSnapshot?.name} · {l.quantityReceived} received · {l.quantityReturned} returned</option>)}
        </select></Field>
        {line && <p>This line: paid / advance applied {money((line.allocatedPaidPaise || 0) / 100)} · credit applied {money((line.creditedLiabilityPaise || 0) / 100)} · due {money((line.remainingDuePaise || 0) / 100)}. Payment applies to an amount, not specific units.</p>}
        {lots.length > 0 && <div className="table-wrap"><table><thead><tr><th>Receipt date / lot</th><th>Available</th><th>On hold</th><th>Defective</th><th>Sold / issued</th><th>Returned to supplier</th></tr></thead><tbody>{lots.map(l => <tr key={l._id}><td>{l.receivedDate} · {l._id}</td><td>{l.quantitySellable}</td><td>{l.quantityReserved}</td><td>{l.quantityDefective}</td><td>{l.quantitySold}</td><td>{l.quantityReturned}</td></tr>)}</tbody></table></div>}
        <Field label="Receipt stock *"><select required value={lotId} onChange={e => setLotId(e.target.value)}><option value="">Select receipt lot</option>{lots.map(l => <option key={l._id} value={l._id}>{l.receivedDate} · {l._id} · {l.quantitySellable} available / {l.quantityDefective} defective</option>)}</select></Field>
        <Field label="Stock condition"><select value={condition} onChange={e => setCondition(e.target.value)}><option value="Sellable">Available stock</option><option value="Defective">Defective stock</option></select></Field>
        <Field label={`Quantity to return * (${available} available in selected condition)`}><input type="number" required min={1} max={available} step={1} value={quantity} onChange={e => {setQuantity(Number(e.target.value)); setSerials([]);}} /></Field>
        {tracked && <Field label={`Serial numbers (${serials.length} / ${quantity})`}><div className="serial-list">{units.map(u => {const serial = u.serialNormalized || u.serial; return <label key={u._id}><input type="checkbox" checked={serials.includes(serial)} disabled={!serials.includes(serial) && serials.length >= quantity} onChange={e => setSerials(old => e.target.checked ? [...old, serial] : old.filter(s => s !== serial))} />{serial}</label>;})}{!units.length && <p>No eligible serial numbers in this condition.</p>}</div></Field>}
        <p>Sold and reserved units cannot be returned directly. First record a genuine customer return or release the stock hold. For stock from multiple receipts, record each receipt lot separately.</p>
        <p>Return credit is calculated by the server from the original line, discounts and tax. Accept the supplier credit note separately; do not enter a duplicate expense or payment.</p>
        <Field label="Reason *"><input required maxLength={500} value={reason} onChange={e => setReason(e.target.value)} /></Field>
        <div className="actions"><Btn secondary onClick={onClose}>Cancel</Btn><Btn type="submit" disabled={busy || loading || !lot || available < 1}>{busy ? 'Recording…' : 'Confirm stock return'}</Btn></div>
      </fieldset>
    </form>}
  </Modal>;
}
