'use client';

import {useState, useEffect} from 'react';
import {useStore} from './store';
import {uid, TODAY} from '@/lib/domain';
import {Modal, Field, Btn} from './ui';

export default function WarrantyAdd({onClose}: {onClose: () => void}) {
  const {state, setState, notify, isLive, fetchInvoiceDetailApi, createWarrantyCoverageApi} = useStore();
  const [invoiceId, setInvoiceId] = useState('');
  const [invoiceLineId, setInvoiceLineId] = useState('');
  const [serial, setSerial] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [months, setMonths] = useState(12);
  const [provider, setProvider] = useState<'Manufacturer' | 'Shop'>('Manufacturer');
  const [startDate, setStartDate] = useState(TODAY);
  const [notes, setNotes] = useState('');
  const [attachmentIds, setAttachmentIds] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);

  // Authoritative live invoice lines
  const [liveInvoice, setLiveInvoice] = useState<any>(null);
  const [loadingInvoice, setLoadingInvoice] = useState(false);

  const demoBill = state.bills.find((b) => b.id === invoiceId);

  useEffect(() => {
    if (isLive && invoiceId) {
      setLoadingInvoice(true);
      fetchInvoiceDetailApi(invoiceId)
        .then((data: any) => {
          if (data && data.invoice) {
            setLiveInvoice(data.invoice);
            if (data.invoice.invoiceDate) setStartDate(data.invoice.invoiceDate);
          }
        })
        .catch((err: any) => {
          notify(err?.message || 'Failed to load invoice details.');
        })
        .finally(() => setLoadingInvoice(false));
    } else {
      setLiveInvoice(null);
      if (demoBill?.date) setStartDate(demoBill.date);
    }
  }, [invoiceId, isLive, demoBill?.date]);

  const lines = (liveInvoice?.lines || demoBill?.lines || []).map((l: any) => {
    const lineId = l.lineId || l._id || l.id || l.productId;
    const name = l.description || l.productSnapshot?.name || l.name || 'Product';
    const isTracked = !!(l.productSnapshot?.isSerialTracked || (l.serials && l.serials.length > 0));
    const totalQty = l.quantity ?? l.qty ?? 1;
    const returnedQty = l.returnedQuantity ?? 0;
    const returnable = Math.max(0, totalQty - returnedQty);
    const serials = l.stockAllocations
      ? l.stockAllocations.flatMap((a: any) => a.serials)
      : l.serials || [];
    return {
      lineId,
      productId: l.productId,
      name,
      isTracked,
      totalQty,
      returnable,
      serials,
    };
  });

  const selectedLine = lines.find((l: any) => l.lineId === invoiceLineId);

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    if (files.some((f) => f.size > 5 * 1024 * 1024)) {
      notify('Each photo must be under 5 MB.');
      return;
    }
    if (attachmentIds.length + files.length > 6) {
      notify('Maximum 6 photos allowed per warranty.');
      return;
    }
    setUploading(true);
    try {
      for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch('/api/files', {
          method: 'POST',
          body: formData,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Upload failed');
        setAttachmentIds((prev) => [...prev, data.id]);
      }
      notify('Photos uploaded.');
    } catch (err: any) {
      notify(err?.message || 'Error uploading file.');
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!invoiceId || !invoiceLineId) {
      notify('Select the invoice and invoice line.');
      return;
    }

    if (selectedLine?.isTracked && !serial.trim()) {
      notify('Serial number is required for tracked goods.');
      return;
    }

    if (isLive) {
      setBusy(true);
      try {
        const res = await createWarrantyCoverageApi({
          invoiceId,
          invoiceLineId,
          serialNumber: selectedLine?.isTracked ? serial.trim() : undefined,
          quantity: selectedLine?.isTracked ? 1 : quantity,
          warrantyMonths: months,
          coverageProvider: provider,
          startDate,
          notes: notes.trim(),
          attachmentIds,
          idempotencyKey: uid('WCOV'),
        });
        if (res.success) {
          notify('Warranty coverage created successfully.');
          onClose();
        } else {
          notify(res.error || 'Failed to create warranty coverage.');
        }
      } finally {
        setBusy(false);
      }
      return;
    }

    // Demo Mode
    if (state.warranties.some((w) => w.invoiceId === invoiceId && w.serial === serial)) {
      notify('This unit already has coverage. Open its warranty record to edit it.');
      return;
    }

    const end = new Date(startDate + 'T12:00:00');
    end.setMonth(end.getMonth() + months);
    setState((s) => ({
      ...s,
      warranties: [
        {
          id: uid('WAR'),
          invoiceId,
          customerId: demoBill?.customerId || 'CUST-DEMO',
          productId: selectedLine?.productId || 'PROD-DEMO',
          serial: serial || '',
          start: startDate,
          end: end.toISOString().slice(0, 10),
          coverage: provider,
          status: 'Active',
          notes: notes || 'Coverage added after sale.',
          photos: [],
        },
        ...s.warranties,
      ],
    }));
    notify('Coverage linked to the original invoice.');
    onClose();
  }

  return (
    <Modal title="Add warranty coverage" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="form-body stack">
          <Field label="Original sales invoice *">
            <select
              required
              value={invoiceId}
              onChange={(e) => {
                setInvoiceId(e.target.value);
                setInvoiceLineId('');
                setSerial('');
              }}
            >
              <option value="">Choose invoice</option>
              {state.bills
                .filter((b) => b.kind === 'Sale' && b.status === 'Issued')
                .map((b) => (
                  <option value={b.id} key={b.id}>
                    {b.id} · {state.customers.find((c) => c.id === b.customerId)?.name || b.customerSnapshot?.name || 'Customer'}
                  </option>
                ))}
            </select>
          </Field>

          <Field label="Invoice Line *">
            <select
              required
              disabled={loadingInvoice || !lines.length}
              value={invoiceLineId}
              onChange={(e) => {
                setInvoiceLineId(e.target.value);
                setSerial('');
              }}
            >
              <option value="">{loadingInvoice ? 'Loading lines…' : 'Choose invoice line'}</option>
              {lines.map((l: any) => (
                <option key={l.lineId} value={l.lineId}>
                  {l.name} (Line: {l.lineId}) · {l.returnable} active
                </option>
              ))}
            </select>
          </Field>

          {selectedLine?.isTracked ? (
            <Field label="Serial / unit *">
              <select required value={serial} onChange={(e) => setSerial(e.target.value)}>
                <option value="">Choose unit serial</option>
                {selectedLine.serials.map((s: string) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
          ) : (
            <Field label="Quantity covered *">
              <input
                type="number"
                min="1"
                max={selectedLine?.returnable || 1}
                required
                value={quantity}
                onChange={(e) => setQuantity(+e.target.value)}
              />
            </Field>
          )}

          <div className="form-grid">
            <Field label="Coverage start date *">
              <input
                type="date"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </Field>
            <Field label="Duration from start (months) *">
              <input
                required
                type="number"
                min="1"
                max="120"
                value={months}
                onChange={(e) => setMonths(+e.target.value)}
              />
            </Field>
          </div>

          <Field label="Coverage provider">
            <select value={provider} onChange={(e) => setProvider(e.target.value as any)}>
              <option value="Manufacturer">Manufacturer</option>
              <option value="Shop">Shop</option>
            </select>
          </Field>

          <Field label="Notes / post-sale reason">
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Extended warranty purchased, manufacturer promotion…"
            />
          </Field>

          <Field label="Warranty documentation photos (optional)">
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,application/pdf"
              multiple
              disabled={uploading}
              onChange={handleFileUpload}
            />
            {uploading && <small>Uploading attachments…</small>}
            {attachmentIds.length > 0 && (
              <small>{attachmentIds.length} attachment(s) uploaded successfully.</small>
            )}
          </Field>
        </div>

        <div className="form-actions">
          <Btn secondary onClick={onClose}>
            Cancel
          </Btn>
          <Btn type="submit" disabled={busy || uploading}>
            {busy ? 'Saving…' : 'Add coverage'}
          </Btn>
        </div>
      </form>
    </Modal>
  );
}
