'use client';

import {useState, useEffect, useCallback, useRef} from 'react';
import Link from 'next/link';
import {Plus, ArrowUpRight, RotateCcw, Clock, CheckCircle, AlertTriangle, ShieldCheck} from 'lucide-react';
import {Reservation, TODAY} from '@/lib/domain';
import {useStore} from './store';
import {PageHead, Card, SearchBox, Btn, Modal, Field, Badge, Empty} from './ui';

export default function Reservations() {
  const {
    state,
    notify,
    isLive,
    fetchReservationsPage,
    createReservationApi,
    releaseReservationApi,
    expireReservationsApi,
    fetchInventoryLotsApi,
    fetchInventorySerialsApi,
  } = useStore();

  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [pageData, setPageData] = useState<{records: Reservation[]; total: number; page: number; totalPages: number} | null>(null);
  const [loading, setLoading] = useState(false);
  const [expiring, setExpiring] = useState(false);

  // New reservation form state
  const [formOpen, setFormOpen] = useState(false);
  const [customerId, setCustomerId] = useState('');
  const [productId, setProductId] = useState('');
  const [lotId, setLotId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [selectedSerials, setSelectedSerials] = useState<string[]>([]);
  const [expiresAt, setExpiresAt] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Kolkata'}).format(d);
  });
  const [notes, setNotes] = useState('');
  const [lots, setLots] = useState<any[]>([]);
  const [availableSerials, setAvailableSerials] = useState<string[]>([]);
  const [serialsLoading, setSerialsLoading] = useState(false);
  const [serialsError, setSerialsError] = useState('');
  const [lotsLoading, setLotsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const createAttempt = useRef<{fingerprint: string; key: string} | null>(null);

  // Release modal state
  const [releaseTarget, setReleaseTarget] = useState<Reservation | null>(null);
  const [releaseReason, setReleaseReason] = useState('Customer cancelled hold request');
  const [releasing, setReleasing] = useState(false);

  // Load holds page
  const loadHolds = useCallback(async () => {
    if (!isLive) return;
    setLoading(true);
    try {
      const res = await fetchReservationsPage({
        page,
        limit,
        search: q.trim() || undefined,
        status: statusFilter === 'All' ? undefined : statusFilter,
      });
      setPageData(res);
    } catch {
      notify('Failed to load reservations.');
    } finally {
      setLoading(false);
    }
  }, [isLive, page, limit, q, statusFilter, fetchReservationsPage, notify]);

  useEffect(() => {
    loadHolds();
  }, [loadHolds]);

  // When selected product changes in form, load its lots
  useEffect(() => {
    if (!productId || !formOpen) {
      setLots([]);
      setLotId('');
      setAvailableSerials([]);
      setSelectedSerials([]);
      return;
    }
    let active = true;
    setLotsLoading(true);
    fetchInventoryLotsApi({productId})
      .then((data: any) => {
        if (!active) return;
        const availableLots = (data?.lots || []).filter((l: any) => (l.quantitySellable || 0) > 0);
        setLots(availableLots);
        if (availableLots.length > 0) {
          setLotId(availableLots[0]._id || availableLots[0].id);
        } else {
          setLotId('');
        }
      })
      .catch(() => notify('Failed to load stock lots for product.'))
      .finally(() => { if (active) setLotsLoading(false); });
    return () => { active = false; };
  }, [productId, formOpen, fetchInventoryLotsApi, notify]);

  // When lot changes and product is serial-tracked, load serials
  useEffect(() => {
    const p = state.products.find((x) => x.id === productId);
    if (!p?.isSerialTracked || !lotId || !formOpen) {
      setAvailableSerials([]);
      setSelectedSerials([]);
      setSerialsError('');
      setSerialsLoading(false);
      return;
    }
    let active = true;
    setSerialsLoading(true);
    setSerialsError('');
    (async () => {
      const records: any[] = [];
      for (let pageNumber = 1; pageNumber <= 20; pageNumber++) {
        const data = await fetchInventorySerialsApi({productId, lotId, status: 'InStock', page: pageNumber, limit: 100});
        records.push(...(data?.serials || data?.records || []));
        if (pageNumber >= (data?.totalPages || 1)) break;
        if (pageNumber === 20) throw new Error('More than 2,000 serial units match. Narrower server-side selection is required.');
      }
      if (!active) return;
      const serials = records
        .filter((serial: any) => serial.lotId === lotId && serial.status === 'InStock')
        .map((serial: any) => serial.serialOriginal ?? serial.serial ?? serial.serialNormalized)
        .filter((serial: unknown): serial is string => typeof serial === 'string' && serial.trim().length > 0)
        .map((serial: string) => serial.trim());
      setAvailableSerials(Array.from(new Set(serials)));
    })()
      .catch((error) => {
        if (!active) return;
        setAvailableSerials([]);
        setSerialsError(error instanceof Error ? error.message : 'Failed to load serial units.');
      })
      .finally(() => { if (active) setSerialsLoading(false); });
    return () => { active = false; };
  }, [productId, lotId, formOpen, state.products, fetchInventorySerialsApi]);

  const selectedProduct = state.products.find((p) => p.id === productId);
  const selectedLot = lots.find((l) => (l._id || l.id) === lotId);

  // Submit new reservation
  async function handleCreateHold(e: React.FormEvent) {
    e.preventDefault();
    if (!customerId) return notify('Please select a customer.');
    if (!productId) return notify('Please select a product.');
    if (!lotId) return notify('Please select a stock lot with sellable units.');
    if (quantity <= 0) return notify('Quantity must be greater than zero.');
    if (selectedProduct?.isSerialTracked && selectedSerials.length !== quantity) {
      return notify(`Please select exactly ${quantity} serial unit(s).`);
    }

    const cleanSerials = selectedSerials
      .filter((serial): serial is string => typeof serial === 'string' && serial.trim().length > 0)
      .map((serial) => serial.trim());
    if (selectedProduct?.isSerialTracked && cleanSerials.length !== quantity) {
      return notify('Serial data is incomplete. Reload the selected stock lot and choose the serial numbers again.');
    }

    const payload = {
      customerId,
      productId,
      lotId,
      quantity,
      serials: cleanSerials,
      reservedAt: TODAY,
      expiresAt,
      notes: notes.trim(),
    };
    const fingerprint = JSON.stringify(payload);
    if (createAttempt.current?.fingerprint !== fingerprint) {
      createAttempt.current = {fingerprint, key: `hold-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`};
    }

    setSubmitting(true);
    try {
      const res = await createReservationApi({
        ...payload,
        idempotencyKey: createAttempt.current.key,
      });
      if (res.success) {
        notify('Stock reservation confirmed successfully.');
        setFormOpen(false);
        setCustomerId('');
        setProductId('');
        setLotId('');
        setQuantity(1);
        setSelectedSerials([]);
        setNotes('');
        createAttempt.current = null;
        loadHolds();
      } else {
        notify(res.error || 'Failed to create reservation.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  // Submit release
  async function handleReleaseHold(e: React.FormEvent) {
    e.preventDefault();
    if (!releaseTarget) return;
    setReleasing(true);
    try {
      const res = await releaseReservationApi(
        releaseTarget.id,
        (releaseTarget as any).version || 1,
        releaseReason.trim() || 'Released by user'
      );
      if (res.success) {
        notify('Stock hold released. Units returned to sellable inventory.');
        setReleaseTarget(null);
        setReleaseReason('Customer cancelled hold request');
        loadHolds();
      } else {
        notify(res.error || 'Failed to release hold.');
      }
    } finally {
      setReleasing(false);
    }
  }

  // Run scheduled expiry check
  async function handleExpireNow() {
    setExpiring(true);
    try {
      const res = await expireReservationsApi();
      if (res.success) {
        notify(`Processed expired holds: ${res.processed ?? 0} hold(s) expired and restored to sellable inventory.`);
        loadHolds();
      } else {
        notify(res.error || 'Expiry processing failed.');
      }
    } finally {
      setExpiring(false);
    }
  }

  const records = isLive ? (pageData?.records || []) : state.reservations;
  const total = isLive ? (pageData?.total || 0) : records.length;
  const totalPages = pageData ? pageData.totalPages : 1;

  return (
    <>
      <PageHead
        title="Stock holds & reservations"
        description="Reserve specific lots and serials for customers with guaranteed expiry protection. Held units are deducted from sellable inventory without moving cash or ledger accounts."
        actions={
          <div style={{display: 'flex', gap: '8px', alignItems: 'center'}}>
            <span title="Runs internal Kolkata date cutoff worker to release past-due holds">
              <Btn
                secondary
                onClick={handleExpireNow}
                disabled={expiring}
              >
                <Clock size={16} />
                {expiring ? 'Checking expiry…' : 'Process expired holds'}
              </Btn>
            </span>
            <Btn onClick={() => setFormOpen(true)}>
              <Plus size={16} />
              New stock hold
            </Btn>
          </div>
        }
      />

      <Card>
        <div className="toolbar" style={{display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '16px'}}>
          <div style={{flex: 1, minWidth: '220px'}}>
            <SearchBox value={q} onChange={(val) => { setQ(val); setPage(1); }} placeholder="Search hold #, customer or product…" />
          </div>
          <select
            aria-label="Reservation status"
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            style={{padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border)'}}
          >
            <option value="All">All statuses</option>
            <option value="Active">Active holds</option>
            <option value="Fulfilled">Fulfilled in sale</option>
            <option value="Released">Released</option>
            <option value="Expired">Expired</option>
          </select>
        </div>

        {loading ? (
          <div style={{padding: '32px', textAlign: 'center', color: 'var(--text-muted)'}}>
            Loading stock reservations…
          </div>
        ) : !records.length ? (
          <Empty
            title="No reservations found"
            text={q ? 'No holds match your search criteria.' : 'Create a hold when a customer requests to reserve specific items before purchase.'}
            action={
              <Btn onClick={() => setFormOpen(true)}>
                <Plus size={16} /> Create stock hold
              </Btn>
            }
          />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Hold #</th>
                  <th>Customer</th>
                  <th>Product & Lineage</th>
                  <th>Quantity</th>
                  <th>Expiry Date</th>
                  <th>Status</th>
                  <th style={{textAlign: 'right'}}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r: any) => {
                  const cust = state.customers.find((c) => c.id === r.customerId);
                  const prod = state.products.find((p) => p.id === r.productId);
                  const isExpired = r.status === 'Active' && r.expires < TODAY;
                  const isActive = r.status === 'Active' && !isExpired;

                  return (
                    <tr key={r.id}>
                      <td>
                        <strong>{r.reservationNumber || r.id}</strong>
                        {r.notes && <div style={{fontSize: '12px', color: 'var(--text-muted)'}}>{r.notes}</div>}
                      </td>
                      <td>
                        <div><strong>{cust?.name || r.customerId}</strong></div>
                        {cust?.phone && <small style={{color: 'var(--text-muted)'}}>{cust.phone}</small>}
                      </td>
                      <td>
                        <div><strong>{prod?.name || r.productId}</strong></div>
                        {r.lotId && <small style={{color: 'var(--text-muted)'}}>Lot: {r.lotId} · </small>}
                        {r.serials && r.serials.length > 0 && (
                          <small style={{color: 'var(--primary)'}}>
                            SN: {r.serials.join(', ')}
                          </small>
                        )}
                      </td>
                      <td>
                        <div>
                          <strong>{r.remainingQuantity ?? r.qty}</strong> / {r.qty} held
                        </div>
                        {r.consumedQuantity > 0 && (
                          <small style={{color: '#10b981'}}>{r.consumedQuantity} sold · </small>
                        )}
                        {r.releasedQuantity > 0 && (
                          <small style={{color: '#6b7280'}}>{r.releasedQuantity} released</small>
                        )}
                      </td>
                      <td>
                        <div>{r.expires || r.expiresAt}</div>
                        {isExpired && <small style={{color: '#ef4444'}}>Past cutoff</small>}
                      </td>
                      <td>
                        <Badge>
                          {isExpired ? 'Expired' : r.status}
                        </Badge>
                      </td>
                      <td style={{textAlign: 'right'}}>
                        <div style={{display: 'inline-flex', gap: '8px', alignItems: 'center'}}>
                          {isActive && (
                            <>
                              <Link
                                className="btn secondary small"
                                href={`/sales/new?customer=${r.customerId}&reservation=${r.id}`}
                                title="Convert hold to sales invoice"
                              >
                                Create sale <ArrowUpRight size={14} />
                              </Link>
                              <button
                                className="btn danger small"
                                onClick={() => {
                                  setReleaseTarget(r);
                                  setReleaseReason('Customer cancelled hold request');
                                }}
                              >
                                Release
                              </button>
                            </>
                          )}
                          {isExpired && (
                            <button
                              className="btn secondary small"
                              onClick={handleExpireNow}
                              title="Restore stock to sellable"
                            >
                              Expire hold
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', paddingTop: '12px', borderTop: '1px solid var(--border)'}}>
            <small style={{color: 'var(--text-muted)'}}>
              Showing {records.length} of {total} total holds
            </small>
            <div style={{display: 'flex', gap: '8px'}}>
              <Btn
                secondary
                className="small"
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Btn>
              <span style={{alignSelf: 'center', fontSize: '13px'}}>Page {page} of {totalPages}</span>
              <Btn
                secondary
                className="small"
                disabled={page >= totalPages || loading}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </Btn>
            </div>
          </div>
        )}
      </Card>

      {/* New Reservation Modal */}
      {formOpen && (
        <Modal title="Create stock hold / reservation" onClose={() => !submitting && setFormOpen(false)}>
          <form onSubmit={handleCreateHold}>
            <div className="form-body stack" style={{display: 'flex', flexDirection: 'column', gap: '16px'}}>
              <Field label="Customer">
                <select
                  required
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                  style={{width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border)'}}
                >
                  <option value="">Select customer…</option>
                  {state.customers.filter((c) => c.status !== 'Archived').map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.phone ? `(${c.phone})` : ''}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Product">
                <select
                  required
                  value={productId}
                  onChange={(e) => {
                    setProductId(e.target.value);
                    setQuantity(1);
                    setSelectedSerials([]);
                  }}
                  style={{width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border)'}}
                >
                  <option value="">Select product…</option>
                  {state.products.filter((p) => p.status !== 'Archived').map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} {p.isSerialTracked ? '· Serial-tracked' : ''}
                    </option>
                  ))}
                </select>
              </Field>

              {lotsLoading ? (
                <small style={{color: 'var(--text-muted)'}}>Loading product stock lots…</small>
              ) : productId && !lots.length ? (
                <div style={{padding: '12px', background: 'rgba(239,68,68,0.1)', color: '#ef4444', borderRadius: '6px', fontSize: '13px'}}>
                  <AlertTriangle size={16} style={{verticalAlign: 'middle', marginRight: '6px'}} />
                  No stock lots with available sellable units found for this product.
                </div>
              ) : lots.length > 0 && (
                <Field label="Stock Lot">
                  <select
                    required
                    value={lotId}
                    onChange={(e) => {
                      setLotId(e.target.value);
                      setSelectedSerials([]);
                    }}
                    style={{width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border)'}}
                  >
                    {lots.map((l: any) => (
                      <option key={l._id || l.id} value={l._id || l.id}>
                        {l.lotNumber || l.id} · {l.quantitySellable} sellable units available (Cost: ₹{((l.costPaise || 0) / 100).toFixed(2)})
                      </option>
                    ))}
                  </select>
                </Field>
              )}

              <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px'}}>
                <Field label="Quantity to hold">
                  <input
                    required
                    type="number"
                    min="1"
                    max={selectedLot ? selectedLot.quantitySellable : 100000}
                    value={quantity}
                    onChange={(e) => {
                      const qVal = Math.max(1, parseInt(e.target.value, 10) || 1);
                      setQuantity(qVal);
                    }}
                    style={{width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border)'}}
                  />
                  {selectedLot && (
                    <small style={{color: 'var(--text-muted)'}}>
                      Max available: {selectedLot.quantitySellable}
                    </small>
                  )}
                </Field>

                <Field label="Hold expires on (Kolkata)">
                  <input
                    required
                    type="date"
                    min={TODAY}
                    value={expiresAt}
                    onChange={(e) => setExpiresAt(e.target.value)}
                    style={{width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border)'}}
                  />
                  <small style={{color: 'var(--text-muted)'}}>Units released automatically if not invoiced</small>
                </Field>
              </div>

              {selectedProduct?.isSerialTracked && lotId && (
                <Field label={`Select ${quantity} serial unit(s)`}>
                  {serialsLoading ? (
                    <small>Loading serial units from the selected receipt lot…</small>
                  ) : serialsError ? (
                    <div className="notice" role="alert">{serialsError}</div>
                  ) : !availableSerials.length ? (
                    <small style={{color: '#ef4444'}}>No InStock serial units in this lot.</small>
                  ) : (
                    <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '8px', maxHeight: '180px', overflowY: 'auto', padding: '8px', border: '1px solid var(--border)', borderRadius: '6px'}}>
                      {availableSerials.map((sn) => {
                        const checked = selectedSerials.includes(sn);
                        return (
                          <label key={sn} style={{display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer'}}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  if (selectedSerials.length >= quantity) {
                                    notify(`Already selected required ${quantity} serial(s).`);
                                    return;
                                  }
                                  setSelectedSerials([...selectedSerials, sn]);
                                } else {
                                  setSelectedSerials(selectedSerials.filter((x) => x !== sn));
                                }
                              }}
                            />
                            {sn}
                          </label>
                        );
                      })}
                    </div>
                  )}
                </Field>
              )}

              <Field label="Notes / Reference">
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Customer promised pickup on Friday afternoon"
                  style={{width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border)'}}
                />
              </Field>
            </div>

            <div className="form-actions" style={{display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '20px'}}>
              <Btn secondary onClick={() => setFormOpen(false)} disabled={submitting}>
                Cancel
              </Btn>
              <Btn type="submit" disabled={submitting || serialsLoading || !!serialsError || !!(productId && !lots.length)}>
                {submitting ? 'Reserving stock…' : 'Confirm reservation'}
              </Btn>
            </div>
          </form>
        </Modal>
      )}

      {/* Release Confirmation Modal */}
      {releaseTarget && (
        <Modal title="Release stock hold?" onClose={() => !releasing && setReleaseTarget(null)}>
          <form onSubmit={handleReleaseHold}>
            <div className="form-body stack" style={{display: 'flex', flexDirection: 'column', gap: '12px'}}>
              <p style={{margin: 0, fontSize: '14px'}}>
                Are you sure you want to release hold <strong>{(releaseTarget as any).reservationNumber || releaseTarget.id}</strong>?
              </p>
              <p style={{margin: 0, fontSize: '13px', color: 'var(--text-muted)'}}>
                {(releaseTarget as any).remainingQuantity ?? releaseTarget.qty} unit(s) will be restored to sellable inventory immediately. No money will move.
              </p>
              <Field label="Reason for release">
                <input
                  required
                  type="text"
                  value={releaseReason}
                  onChange={(e) => setReleaseReason(e.target.value)}
                  style={{width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border)'}}
                />
              </Field>
            </div>
            <div className="form-actions" style={{display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '20px'}}>
              <Btn secondary onClick={() => setReleaseTarget(null)} disabled={releasing}>
                Keep reservation
              </Btn>
              <Btn type="submit" disabled={releasing}>
                {releasing ? 'Releasing…' : 'Release stock now'}
              </Btn>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
