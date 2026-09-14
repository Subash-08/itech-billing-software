'use client';

import WarrantyAdd from './warranty-add';
import {useState, useEffect, useCallback} from 'react';
import Link from 'next/link';
import {ArrowUpRight} from 'lucide-react';
import {Warranty, TODAY, dateLabel, uid} from '@/lib/domain';
import {useStore} from './store';
import {PageHead, Card, SearchBox, Btn, Modal, Field, Badge, Empty} from './ui';

export default function WarrantyPage() {
  const {
    state,
    setState,
    notify,
    isLive,
    fetchWarrantiesPage,
    fetchWarrantyDetailApi,
    claimWarrantyApi,
  } = useStore();

  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('All');
  const [form, setForm] = useState<any | null>(null);
  const [add, setAdd] = useState(false);

  // Live warranties data
  const [liveWarranties, setLiveWarranties] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [claimAction, setClaimAction] = useState<'Repaired' | 'Replaced' | 'Rejected'>('Repaired');
  const [claimReason, setClaimReason] = useState('');
  const [claimNotes, setClaimNotes] = useState('');
  const [replacementSerial, setReplacementSerial] = useState('');
  const [claimAttachmentIds, setClaimAttachmentIds] = useState<string[]>([]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [claimBusy, setClaimBusy] = useState(false);
  const [claimIdempotencyKey, setClaimIdempotencyKey] = useState('');
  const [conflictError, setConflictError] = useState<string | null>(null);
  const [reloadingWarranty, setReloadingWarranty] = useState(false);

  const loadLiveWarranties = useCallback(async () => {
    if (!isLive) return;
    setLoading(true);
    try {
      const res = await fetchWarrantiesPage({
        search: q || undefined,
        status: filter !== 'All' ? filter : undefined,
        limit: 50,
      });
      if (res && res.items) {
        setLiveWarranties(res.items);
      }
    } catch (err: any) {
      notify(err?.message || 'Failed to load warranties.');
    } finally {
      setLoading(false);
    }
  }, [isLive, q, filter, fetchWarrantiesPage, notify]);

  useEffect(() => {
    if (isLive) {
      loadLiveWarranties();
    }
  }, [isLive, loadLiveWarranties]);

  // Demo fallback list
  const demoList = state.warranties.filter(
    (w) =>
      ((w.serial || '') +
        (state.customers.find((c) => c.id === w.customerId)?.name || '') +
        (state.products.find((p) => p.id === w.productId)?.name || '')
      )
        .toLowerCase()
        .includes(q.toLowerCase()) &&
      (filter === 'All' || w.status === filter)
  );

  const list = isLive ? liveWarranties : demoList;

  function openClaimModal(item: any) {
    setForm(item);
    setClaimAction('Repaired');
    setClaimReason('');
    setClaimNotes('');
    setReplacementSerial('');
    setClaimAttachmentIds([]);
    setClaimIdempotencyKey(uid('WCL'));
    setConflictError(null);
  }

  async function handleReloadWarranty() {
    if (!form) return;
    setReloadingWarranty(true);
    try {
      const res = await fetchWarrantyDetailApi(form._id || form.id);
      if (res && res.warranty) {
        setForm(res.warranty);
        setConflictError(null);
        notify('Loaded latest warranty details. Please review and explicitly resubmit.');
      }
    } catch (err: any) {
      notify(err?.message || 'Failed to reload warranty record.');
    } finally {
      setReloadingWarranty(false);
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    if (files.some((f) => f.size > 5 * 1024 * 1024)) {
      notify('Use photos under 5 MB each.');
      return;
    }
    if (claimAttachmentIds.length + files.length > 6) {
      notify('Maximum 6 photos allowed.');
      return;
    }
    setUploadingPhotos(true);
    try {
      for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch('/api/files', {method: 'POST', body: formData});
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Upload failed');
        setClaimAttachmentIds((prev) => [...prev, data.id]);
      }
      notify('Photo uploaded.');
    } catch (err: any) {
      notify(err?.message || 'Error uploading photo.');
    } finally {
      setUploadingPhotos(false);
    }
  }

  async function handleSaveClaim(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;

    if (!claimReason.trim()) {
      notify('Claim reason is required.');
      return;
    }

    if (claimAction === 'Replaced' && !replacementSerial.trim()) {
      notify('Replacement serial is required for replacement action.');
      return;
    }

    if (isLive) {
      setClaimBusy(true);
      try {
        const res = await claimWarrantyApi(form._id || form.id, {
          reason: claimReason.trim(),
          action: claimAction,
          replacementSerial: claimAction === 'Replaced' ? replacementSerial.trim() : undefined,
          notes: claimNotes.trim() || undefined,
          attachmentIds: claimAttachmentIds.length ? claimAttachmentIds : undefined,
          expectedVersion: form.version ?? 1,
          idempotencyKey: claimIdempotencyKey || uid('WCL'),
        });
        if (res.success) {
          notify(`Warranty claim recorded as ${claimAction}.`);
          setForm(null);
          setConflictError(null);
          loadLiveWarranties();
        } else if (res.status === 409 || (res.error && res.error.toLowerCase().includes('version mismatch'))) {
          setConflictError(res.error || 'Warranty record was updated concurrently. Reload the latest state before submitting.');
        } else {
          notify(res.error || 'Failed to submit warranty claim.');
        }
      } finally {
        setClaimBusy(false);
      }
      return;
    }

    // Demo Mode
    setState((s) => ({
      ...s,
      warranties: s.warranties.map((w) =>
        w.id === form.id
          ? {
              ...w,
              status: claimAction === 'Rejected' ? w.status : 'Claim opened',
              notes: `${claimReason}. ${claimNotes}`.trim(),
              serial: claimAction === 'Replaced' ? replacementSerial : w.serial,
            }
          : w
      ),
    }));
    notify('Warranty record updated.');
    setForm(null);
  }

  return (
    <>
      <PageHead
        title="Warranty tracking"
        description="Find warranty coverage by customer, product or serial number."
        actions={<Btn onClick={() => setAdd(true)}>Add coverage</Btn>}
      />

      <div className="notice">
        Warranty records are created when you issue a sales invoice. You can log service claims or add post-sale coverage here.
      </div>

      <Card>
        <div className="toolbar">
          <SearchBox value={q} onChange={setQ} placeholder="Search serial, product or customer…" />
          <select
            aria-label="Warranty filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option>All</option>
            <option>Active</option>
            <option>Expired</option>
            <option>Returned</option>
            <option>Claimed</option>
          </select>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Product / serial</th>
                <th>Customer</th>
                <th>Coverage</th>
                <th>Warranty period</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.map((w: any) => {
                const id = w._id || w.id;
                const prodName =
                  w.productSnapshot?.name ||
                  state.products.find((p) => p.id === w.productId)?.name ||
                  'Item';
                const serialNum = w.serialNumber || w.serial || 'Non-serialized';
                const custName =
                  w.customerSnapshot?.name ||
                  state.customers.find((c) => c.id === w.customerId)?.name ||
                  'Customer';
                const invId = w.invoiceNumber || w.invoiceId;
                const isExpired = w.endDate ? w.endDate < TODAY : w.end < TODAY;
                const displayStatus = isExpired ? 'Expired' : w.status;

                return (
                  <tr key={id}>
                    <td>
                      {prodName}
                      <small>{serialNum}</small>
                    </td>
                    <td>{custName}</td>
                    <td>
                      {w.coverage || 'Manufacturer'}
                      <small>
                        <Link className="record-link" href={'/sales/' + w.invoiceId}>
                          {invId}
                        </Link>
                      </small>
                    </td>
                    <td>
                      {dateLabel(w.startDate || w.start)}
                      <small>Until {dateLabel(w.endDate || w.end)}</small>
                    </td>
                    <td>
                      <Badge>{displayStatus}</Badge>
                    </td>
                    <td>
                      <button
                        className="text-link link-button"
                        onClick={() => openClaimModal(w)}
                      >
                        Log claim / view <ArrowUpRight size={15} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!list.length && (
          <Empty
            title={loading ? 'Loading warranties…' : 'No warranties found'}
            text={loading ? 'Fetching records from server…' : 'No warranty coverage records match the current filter.'}
          />
        )}
      </Card>

      {add && <WarrantyAdd onClose={() => { setAdd(false); if (isLive) loadLiveWarranties(); }} />}

      {form && (
        <Modal title="Warranty details and claim" onClose={() => setForm(null)}>
          <form onSubmit={handleSaveClaim}>
            <div className="form-body stack">
              <div className="notice">
                {form.productSnapshot?.name || 'Product'} · {form.serialNumber || form.serial || 'Unit'}
                <br />
                Invoice: {form.invoiceNumber || form.invoiceId} · Coverage until {dateLabel(form.endDate || form.end)}
              </div>

              {conflictError && (
                <div
                  className="alert-conflict"
                  style={{
                    padding: '12px',
                    borderRadius: '6px',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    color: '#dc2626',
                    fontSize: '13px',
                  }}
                >
                  <strong style={{display: 'block', marginBottom: '4px'}}>
                    Version Conflict (409):
                  </strong>
                  <div>{conflictError}</div>
                  <div style={{marginTop: '8px', display: 'flex', gap: '8px'}}>
                    <Btn
                      secondary
                      type="button"
                      onClick={handleReloadWarranty}
                      disabled={reloadingWarranty}
                    >
                      {reloadingWarranty ? 'Reloading…' : 'Reload latest warranty record'}
                    </Btn>
                    <Btn secondary type="button" onClick={() => setConflictError(null)}>
                      Dismiss
                    </Btn>
                  </div>
                </div>
              )}

              <div className="form-grid">
                <Field label="Claim action *">
                  <select
                    value={claimAction}
                    onChange={(e) => setClaimAction(e.target.value as any)}
                  >
                    <option value="Repaired">Repaired (Unit serviced and returned)</option>
                    <option value="Replaced">Replaced (Swap defective unit for sellable unit)</option>
                    <option value="Rejected">Rejected (Out of scope or user damage)</option>
                  </select>
                </Field>

                {claimAction === 'Replaced' && (
                  <Field label="Replacement serial number *">
                    <input
                      required
                      placeholder="Enter in-stock serial number"
                      value={replacementSerial}
                      onChange={(e) => setReplacementSerial(e.target.value)}
                    />
                  </Field>
                )}
              </div>

              <Field label="Reason for claim / fault description *">
                <input
                  required
                  placeholder="e.g. Screen flickering, power supply failure, keyboard defect…"
                  value={claimReason}
                  onChange={(e) => setClaimReason(e.target.value)}
                />
              </Field>

              <Field label="Technician notes and diagnosis">
                <textarea
                  value={claimNotes}
                  onChange={(e) => setClaimNotes(e.target.value)}
                  placeholder="Diagnostic steps taken, manufacturer RMA reference, parts replaced…"
                  rows={3}
                />
              </Field>

              <Field label="Product / defect photos (optional)">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,application/pdf"
                  multiple
                  disabled={uploadingPhotos}
                  onChange={handleFileUpload}
                />
                {uploadingPhotos && <small>Uploading photo…</small>}
              </Field>

              {/* Display existing attachments */}
              {form.attachmentIds && form.attachmentIds.length > 0 && (
                <div>
                  <small>Attached documentation ({form.attachmentIds.length}):</small>
                  <div className="photo-grid" style={{marginTop: '4px'}}>
                    {form.attachmentIds.map((fileId: string) => (
                      <div key={fileId}>
                        <a href={`/api/files/${fileId}`} target="_blank" rel="noreferrer" className="text-link">
                          Attachment {fileId.slice(-6)}
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {claimAttachmentIds.length > 0 && (
                <small>{claimAttachmentIds.length} new photo(s) attached to this claim.</small>
              )}

              <Link
                className="text-link"
                href={'/sales/' + (form.invoiceId || form._id)}
                onClick={() => setForm(null)}
              >
                Open original invoice <ArrowUpRight size={14} />
              </Link>
            </div>

            <div className="form-actions">
              <Btn secondary onClick={() => setForm(null)}>
                Cancel
              </Btn>
              <Btn type="submit" disabled={claimBusy || uploadingPhotos}>
                {claimBusy ? 'Submitting…' : 'Submit warranty claim'}
              </Btn>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
