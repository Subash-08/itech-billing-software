'use client';
import AccountHistory from './account-history';
import {useState, useEffect} from 'react';
import Link from 'next/link';
import {Plus, ArrowUpRight, Pencil, Phone, Mail, FileText, ArrowLeft, Archive} from 'lucide-react';
import {useStore} from './store';
import {Customer, Supplier, uid, money, roundedTotal, balance, dateLabel} from '@/lib/domain';
import {PageHead, Card, SearchBox, Btn, Modal, Field, Empty, Badge} from './ui';
import {mapCustomerFromApi, mapSupplierFromApi} from '@/lib/mappers';

export function PersonForm({
  supplier = false,
  existing,
  onClose,
}: {
  supplier?: boolean;
  existing?: Customer | Supplier;
  onClose: () => void;
}) {
  const {
    state,
    isLive,
    saveCustomerApi,
    archiveCustomerApi,
    restoreCustomerApi,
    saveSupplierApi,
    archiveSupplierApi,
    restoreSupplierApi,
  } = useStore();

  const [form, setForm] = useState({
    name: existing?.name || '',
    phone: existing?.phone || '',
    email: existing?.email || '',
    address: existing?.address || '',
    gst: existing?.gst || '',
    type: (existing as Customer)?.type || 'Individual',
    notes: (existing as Customer)?.notes || '',
    terms: (existing as Supplier)?.terms || 30,
  });

  const [details, setDetails] = useState<Record<string, string>>(
    (existing as Customer)?.details || {
      state: 'Tamil Nadu',
      city: 'Salem',
      country: 'India',
      paymentTerms: '0',
      language: 'Tamil',
    }
  );

  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k: string, v: string | number) => {
    setForm((f) => ({...f, [k]: v}));
    if (k === 'phone') {
      const raw = String(v).replace(/\D/g, '');
      const last10 = raw.slice(-10);
      const collection = supplier ? state.suppliers : state.customers;
      if (last10 && collection.some((c) => (c.phone || '').replace(/\D/g, '').slice(-10) === last10 && c.id !== existing?.id)) {
        setWarning('Notice: This phone number is already shared with another contact.');
      } else {
        setWarning('');
      }
    }
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');

    try {
      if (supplier) {
        const res = await saveSupplierApi({...form}, existing?.id);
        if (res.warning) setWarning(res.warning);
        if (res.success) onClose();
      } else {
        const res = await saveCustomerApi({...form, details}, existing?.id);
        if (res.warning) setWarning(res.warning);
        if (res.success) onClose();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save.');
    } finally {
      setBusy(false);
    }
  }

  async function handleArchive() {
    if (!existing?.id) return;
    setBusy(true);
    try {
      const ok = supplier
        ? await archiveSupplierApi(existing.id)
        : await archiveCustomerApi(existing.id);
      if (ok) onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`${existing ? 'Edit' : 'Add'} ${supplier ? 'supplier' : 'customer'}`} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="form-body">
          <div className="form-grid">
            <Field label={supplier ? 'Supplier name' : 'Customer name'}>
              <input required value={form.name} onChange={(e) => set('name', e.target.value)} />
            </Field>
            <Field label="Phone number">
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => set('phone', e.target.value)}
                placeholder="Optional or contact number"
              />
            </Field>
            <Field label="Email (optional)">
              <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
            </Field>
            {supplier ? (
              <Field label="Credit period in days">
                <input
                  type="number"
                  min="0"
                  required
                  value={form.terms}
                  onChange={(e) => set('terms', +e.target.value)}
                />
              </Field>
            ) : (
              <Field label="Customer type">
                <select value={form.type} onChange={(e) => set('type', e.target.value)}>
                  <option>Individual</option>
                  <option>Business</option>
                </select>
              </Field>
            )}
            <Field label="GSTIN (optional)">
              <input
                maxLength={15}
                pattern="[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]"
                value={form.gst}
                onChange={(e) => set('gst', e.target.value.toUpperCase())}
              />
            </Field>
            <Field label="Address">
              <textarea value={form.address} onChange={(e) => set('address', e.target.value)} />
            </Field>
            {!supplier && (
              <div className="full">
                <Field label="Notes">
                  <textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} />
                </Field>
              </div>
            )}
          </div>

          <details className="optional-fields spaced">
            <summary>More contact, billing and delivery details</summary>
            <div className="form-grid spaced">
              {Object.entries({
                contactPerson: 'Contact person',
                alternatePhone: 'Alternate phone',
                city: 'City',
                state: 'State / territory',
                postalCode: 'PIN code',
                country: 'Country',
                shippingAddress: 'Delivery address (blank = billing address)',
                paymentTerms: 'Default payment period (days)',
                creditLimit: 'Credit limit (₹, blank = no limit)',
                language: 'Preferred language',
                reference: 'Customer reference / referral',
              }).map(([key, label]) => (
                <Field key={key} label={label}>
                  <input
                    type={['paymentTerms', 'creditLimit'].includes(key) ? 'number' : 'text'}
                    min="0"
                    value={details[key] || ''}
                    onChange={(e) => setDetails({...details, [key]: e.target.value})}
                  />
                </Field>
              ))}
            </div>
          </details>

          {warning && (
            <p className="notice" style={{marginTop: 12, backgroundColor: '#fef3c7', color: '#92400e'}}>
              {warning}
            </p>
          )}
          {error && <p className="error">{error}</p>}
        </div>

        <div className="form-actions">
          {existing && isLive && (existing as any).status === 'Archived' ? (
            <Btn
              secondary
              onClick={async () => {
                setBusy(true);
                try {
                  const ok = supplier
                    ? await restoreSupplierApi(existing.id)
                    : await restoreCustomerApi(existing.id);
                  if (ok) onClose();
                } finally {
                  setBusy(false);
                }
              }}
              disabled={busy}
            >
              Restore to active
            </Btn>
          ) : existing ? (
            <Btn secondary danger onClick={handleArchive} disabled={busy}>
              <Archive size={15} /> Archive
            </Btn>
          ) : null}
          <Btn secondary onClick={onClose} disabled={busy}>
            Cancel
          </Btn>
          <Btn type="submit" disabled={busy}>
            {busy ? 'Saving…' : `Save ${supplier ? 'supplier' : 'customer'}`}
          </Btn>
        </div>
      </form>
    </Modal>
  );
}

export default function People({supplier = false, id}: {supplier?: boolean; id?: string}) {
  const {state, isLive, fetchCustomersPage, fetchSuppliersPage} = useStore();
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState(false);
  const [type, setType] = useState('All');
  const [page, setPage] = useState(1);
  const [serverData, setServerData] = useState<{records: any[]; total: number; totalPages: number} | null>(null);
  const [detailRecord, setDetailRecord] = useState<Customer | Supplier | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    setPage(1);
  }, [q, type, supplier]);

  useEffect(() => {
    if (isLive && !id) {
      const fetchFn = supplier ? fetchSuppliersPage : fetchCustomersPage;
      fetchFn({page, limit: 10, q: q.trim() || undefined, ...(supplier || type === 'All' ? {} : {type})}).then((res) => {
        setServerData(res);
      }).catch(() => {});
    }
  }, [isLive, supplier, page, q, type, id, fetchCustomersPage, fetchSuppliersPage]);

  useEffect(() => {
    if (!isLive || !id || id === 'new') return;
    setDetailLoading(true);
    fetch(`/api/master/${supplier ? 'suppliers' : 'customers'}/${encodeURIComponent(id)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error('Record not found');
        const data = await res.json();
        setDetailRecord(supplier ? mapSupplierFromApi(data) : mapCustomerFromApi(data));
      })
      .catch(() => setDetailRecord(null))
      .finally(() => setDetailLoading(false));
  }, [isLive, id, supplier]);

  const collection = isLive && serverData ? serverData.records : (supplier ? state.suppliers : state.customers);
  const person = detailRecord || (supplier ? state.suppliers : state.customers).find((p) => p.id === id || (p as any)._id === id) || (serverData?.records || []).find((p) => p.id === id || (p as any)._id === id);
  const path = supplier ? '/suppliers' : '/customers';

  if (id && isLive && detailLoading) return <Empty title="Loading record…" />;
  if (id && !person) {
    return (
      <Empty
        title="Record not found"
        text={isLive ? 'This record may have been archived or belongs to another company.' : 'Demo records reset when the page is refreshed.'}
        action={<Link href={path}>Back to list</Link>}
      />
    );
  }

  const bills = person
    ? supplier
      ? state.purchases.filter((b) => b.supplierId === id)
      : state.bills.filter((b) => b.customerId === id && b.kind !== 'Quotation')
    : [];

  return (
    <>
      {id && (
        <Link className="back-link" href={path}>
          <ArrowLeft size={14} />
          All {supplier ? 'suppliers' : 'customers'}
        </Link>
      )}

      <PageHead
        title={person?.name || (supplier ? 'Suppliers' : 'Customers')}
        description={
          person
            ? `${person.id} · ${supplier ? 'Supplier account' : 'Customer profile and complete visit history'}`
            : supplier
            ? 'Your purchase partners, credit terms and outstanding bills.'
            : 'Every customer, every visit, one shared history.'
        }
        actions={
          <Btn onClick={() => setEdit(true)}>
            {person ? <Pencil size={16} /> : <Plus size={16} />}
            {person ? 'Edit details' : `Add ${supplier ? 'supplier' : 'customer'}`}
          </Btn>
        }
      />

      {person ? (
        <>
          <AccountHistory id={person.id} supplier={supplier} />
          <div className="detail-grid spaced">
            <div className="stack">
              <Card
                title={supplier ? 'Purchase history' : 'Invoices and purchases'}
                actions={
                  <Link
                    className="text-link"
                    href={supplier ? '/purchases/new' : `/sales/new?customer=${id}`}
                  >
                    Create {supplier ? 'purchase' : 'invoice'} <Plus size={14} />
                  </Link>
                }
              >
                {bills.length ? (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Document</th>
                          <th>Date</th>
                          <th>Total</th>
                          <th>Due</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {bills.map((b) => (
                          <tr key={b.id}>
                            <td>
                              <Link className="record-link" href={`${supplier ? '/purchases' : '/sales'}/${b.id}`}>
                                {b.id}
                              </Link>
                            </td>
                            <td>{dateLabel(b.date)}</td>
                            <td>{money(roundedTotal(b))}</td>
                            <td>{money(balance(state, b))}</td>
                            <td>
                              <Link href={`${supplier ? '/purchases' : '/sales'}/${b.id}`}>
                                <ArrowUpRight size={16} />
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <Empty title="No bills yet" text="New bills will appear here once billing is activated in Phase 3/4." />
                )}
              </Card>

              {!supplier && (
                <>
                  <Card title="Service history">
                    <div className="timeline">
                      {state.jobs
                        .filter((j) => j.customerId === id)
                        .map((j) => (
                          <div key={j.id}>
                            <small>{dateLabel(j.date)}</small>
                            <strong>
                              <Link href={'/services/' + j.id}>
                                {j.device} · {j.id}
                              </Link>
                            </strong>
                            <p>{j.problem}</p>
                            <Badge>{j.status}</Badge>
                          </div>
                        ))}
                      {!state.jobs.some((j) => j.customerId === id) && <p>No service visits yet.</p>}
                    </div>
                  </Card>
                  <Card title="Enquiries and quotations">
                    <div className="timeline">
                      {state.enquiries
                        .filter((e) => e.customerId === id)
                        .map((e) => (
                          <div key={e.id}>
                            <small>{dateLabel(e.date)}</small>
                            <strong>
                              <Link href="/enquiries">{e.requirement}</Link>
                            </strong>
                            <p>
                              {e.category} · {money(e.budget)}
                            </p>
                            <Badge>{e.status}</Badge>
                          </div>
                        ))}
                      {state.bills
                        .filter((b) => b.customerId === id && b.kind === 'Quotation')
                        .map((b) => (
                          <div key={b.id}>
                            <Link className="record-link" href={'/quotations/' + b.id}>
                              {b.id}
                            </Link>
                            <p>
                              {money(roundedTotal(b))} · {b.status}
                            </p>
                          </div>
                        ))}
                    </div>
                  </Card>
                </>
              )}
            </div>

            <div className="stack">
              <Card title="Contact details">
                <dl className="detail-list">
                  <div>
                    <dt>Phone</dt>
                    <dd>{person.phone || '—'}</dd>
                  </div>
                  <div>
                    <dt>Email</dt>
                    <dd>{person.email || '—'}</dd>
                  </div>
                  <div>
                    <dt>Address</dt>
                    <dd>{person.address || '—'}</dd>
                  </div>
                  <div>
                    <dt>GSTIN</dt>
                    <dd>{person.gst || 'Not provided'}</dd>
                  </div>
                  {supplier && (
                    <div>
                      <dt>Credit terms</dt>
                      <dd>{(person as Supplier).terms} days</dd>
                    </div>
                  )}
                </dl>
                <div className="body-pad">
                  <Link className="btn secondary" href={`/communication?customer=${id}`}>
                    Preview WhatsApp message
                  </Link>
                </div>
              </Card>

              <Card title={supplier ? 'Amount payable' : 'Amount to collect'}>
                <div className="body-pad">
                  <h1>{money(bills.reduce((a, b) => a + balance(state, b), 0))}</h1>
                  <p className="spaced">Linked bills and opening balances determine this balance.</p>
                  <Link className="text-link spaced" href="/dues">
                    View outstanding bills <ArrowUpRight size={14} />
                  </Link>
                </div>
              </Card>

              {!supplier && (
                <Card title="Customer notes">
                  <p className="body-pad">{(person as Customer).notes || 'No notes added.'}</p>
                </Card>
              )}
            </div>
          </div>
        </>
      ) : (
        <Card>
          <div className="toolbar">
            <SearchBox
              value={q}
              onChange={setQ}
              placeholder={`Search ${supplier ? 'supplier' : 'customer'} name or phone…`}
            />
            {!supplier && (
              <select aria-label="Customer type filter" value={type} onChange={(e) => setType(e.target.value)}>
                <option>All</option>
                <option>Individual</option>
                <option>Business</option>
              </select>
            )}
            <span className="muted">
              {collection.length} {supplier ? 'suppliers' : 'customers'}
            </span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{supplier ? 'Supplier' : 'Customer'}</th>
                  <th>Contact</th>
                  <th>{supplier ? 'Credit period' : 'Type'}</th>
                  <th>Outstanding</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {collection
                  .filter(
                    (p) =>
                      (p.name + p.phone).toLowerCase().includes(q.toLowerCase()) &&
                      (supplier || type === 'All' || (p as Customer).type === type)
                  )
                  .map((p) => {
                    const docs = supplier
                      ? state.purchases.filter((b) => b.supplierId === p.id)
                      : state.bills.filter((b) => b.customerId === p.id && b.kind !== 'Quotation');
                    return (
                      <tr key={p.id}>
                        <td>
                          <Link className="customer-cell" href={path + '/' + p.id}>
                            <div className="avatar">
                              {p.name
                                .split(' ')
                                .map((s: string) => s[0])
                                .slice(0, 2)
                                .join('')}
                            </div>
                            <div>
                              <strong>{p.name}</strong>
                              <small>{p.id}</small>
                            </div>
                          </Link>
                        </td>
                        <td>
                          {p.phone}
                          <small>{p.email}</small>
                        </td>
                        <td>{supplier ? `${(p as Supplier).terms} days` : (p as Customer).type}</td>
                        <td className="amount">{money(docs.reduce((a, b) => a + balance(state, b), 0))}</td>
                        <td>
                          <Link className="text-link" href={path + '/' + p.id}>
                            View profile <ArrowUpRight size={15} />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
          <div className="table-footer">
            <span>
              {isLive && serverData
                ? `Showing ${collection.length} of ${serverData.total} records`
                : `${collection.length} matching records`}
            </span>
            {isLive && serverData && serverData.totalPages > 1 && (
              <div style={{display: 'flex', gap: 8, alignItems: 'center'}}>
                <span className="muted" style={{marginRight: 8}}>
                  Page {page} of {serverData.totalPages}
                </span>
                <Btn secondary disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                  Previous
                </Btn>
                <Btn secondary disabled={page >= serverData.totalPages} onClick={() => setPage((p) => p + 1)}>
                  Next
                </Btn>
              </div>
            )}
          </div>
        </Card>
      )}

      {edit && <PersonForm supplier={supplier} existing={person} onClose={() => setEdit(false)} />}
    </>
  );
}
