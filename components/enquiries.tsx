'use client';
import {useState, useEffect, useCallback} from 'react';
import Link from 'next/link';
import {Plus, Pencil, ArrowUpRight, ChevronLeft, ChevronRight} from 'lucide-react';
import {Enquiry, TODAY, uid, money} from '@/lib/domain';
import {useStore, PaginationResult} from './store';
import {PageHead, Card, SearchBox, Btn, Modal, Field, Badge, Empty} from './ui';

const cats = ['New laptop', 'Used laptop', 'PC build', 'Accessories', 'Other'];

export default function Enquiries() {
  const {state, setState, notify, isLive, fetchEnquiriesPage, saveEnquiryApi} = useStore();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('All');
  const [cat, setCat] = useState('All');
  const [form, setForm] = useState<(Enquiry & {version?: number}) | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [liveData, setLiveData] = useState<PaginationResult<Enquiry> | null>(null);

  const loadLiveEnquiries = useCallback(async () => {
    if (!isLive) return;
    setLoading(true);
    try {
      const res = await fetchEnquiriesPage({
        page,
        limit: 20,
        status: status === 'All' ? undefined : status,
        category: cat === 'All' ? undefined : cat,
        search: q || undefined,
      });
      setLiveData(res);
    } catch (err: any) {
      notify(err.message || 'Failed to load enquiries.');
    } finally {
      setLoading(false);
    }
  }, [isLive, page, status, cat, q, fetchEnquiriesPage, notify]);

  useEffect(() => {
    if (isLive) {
      loadLiveEnquiries();
    }
  }, [isLive, loadLiveEnquiries]);

  // Demo fallback
  const demoList = state.enquiries.filter(
    (e) =>
      (e.requirement + (state.customers.find((c) => c.id === e.customerId)?.name || '')).toLowerCase().includes(q.toLowerCase()) &&
      (status === 'All' || e.status === status) &&
      (cat === 'All' || e.category === cat)
  );

  const records = isLive ? (liveData?.records || []) : demoList;
  const total = isLive ? (liveData?.total || 0) : demoList.length;
  const totalPages = isLive ? (liveData?.totalPages || 1) : 1;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;

    if (isLive) {
      setSaving(true);
      try {
        const isEdit = liveData?.records.some((rec) => rec.id === form.id);
        const payload = {
          customerId: form.customerId,
          category: form.category,
          requirement: form.requirement,
          budgetPaise: Math.round((form.budget || 0) * 100),
          followUpDate: form.followUp,
          notes: form.notes || '',
          status: form.status,
        };

        const res = await saveEnquiryApi(payload, isEdit ? form.id : undefined, form.version);
        if (!res.success) {
          notify(res.error || 'Failed to save enquiry.');
          return;
        }

        notify(isEdit ? 'Enquiry updated.' : 'Enquiry created.');
        setForm(null);
        loadLiveEnquiries();
      } catch (err: any) {
        notify(err.message || 'Failed to save enquiry.');
      } finally {
        setSaving(false);
      }
    } else {
      setState((s) => ({
        ...s,
        enquiries: s.enquiries.some((e) => e.id === form.id)
          ? s.enquiries.map((e) => (e.id === form.id ? form : e))
          : [form, ...s.enquiries],
      }));
      notify('Enquiry saved.');
      setForm(null);
    }
  }

  function getCustomerName(customerId: string) {
    return state.customers.find((c) => c.id === customerId)?.name || 'Unknown Customer';
  }

  return (
    <>
      <PageHead
        title="Enquiries"
        description="Keep a simple note of what customers need and when to follow up."
        actions={
          <Btn
            onClick={() =>
              setForm({
                id: uid('ENQ'),
                customerId: '',
                date: TODAY,
                category: 'New laptop',
                requirement: '',
                budget: 0,
                status: 'Open',
                followUp: TODAY,
                notes: '',
              })
            }
          >
            <Plus size={16} />
            New enquiry
          </Btn>
        }
      />
      <Card>
        <div className="toolbar">
          <SearchBox
            value={q}
            onChange={(val) => {
              setQ(val);
              setPage(1);
            }}
            placeholder="Search customer or requirement…"
          />
          <select
            aria-label="Enquiry category"
            value={cat}
            onChange={(e) => {
              setCat(e.target.value);
              setPage(1);
            }}
          >
            <option>All</option>
            {cats.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <select
            aria-label="Enquiry status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option>All</option>
            {['Open', 'Contacted', 'Quoted', 'Won', 'Closed'].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Requirement</th>
                <th>Budget</th>
                <th>Follow-up</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {records.map((e) => (
                <tr key={e.id}>
                  <td>
                    <Link className="record-link" href={'/customers/' + e.customerId}>
                      {getCustomerName(e.customerId)}
                    </Link>
                    <small>{e.id}</small>
                  </td>
                  <td className="wrap-cell">
                    {e.requirement}
                    <small>{e.category}</small>
                  </td>
                  <td>{money(e.budget)}</td>
                  <td>
                    {e.followUp}
                    <small>
                      {e.followUp <= TODAY && !['Won', 'Closed'].includes(e.status)
                        ? 'Follow up today'
                        : ''}
                    </small>
                  </td>
                  <td>
                    <Badge>{e.status}</Badge>
                  </td>
                  <td>
                    <div className="action-cell">
                      <button
                        className="icon-btn"
                        aria-label={'Edit ' + e.id}
                        onClick={() => setForm({...e})}
                      >
                        <Pencil size={16} />
                      </button>
                      {!['Won', 'Closed'].includes(e.status) && (
                        <Link className="text-link" href={`/quotations/new?enquiry=${e.id}`}>
                          Quote <ArrowUpRight size={14} />
                        </Link>
                      )}
                      <Link className="text-link" href={`/communication?customer=${e.customerId}`}>
                        Message
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {loading && <div style={{padding: '16px', textAlign: 'center'}} className="muted">Loading enquiries…</div>}
        {!loading && !records.length && <Empty title="No enquiries found" text="Try adjusting your search or filters, or create a new enquiry." />}

        <div className="table-footer" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
          <span>
            {total} {total === 1 ? 'enquiry' : 'enquiries'}
            {isLive ? ' · Live backend records' : ' · Demo state'}
          </span>
          {isLive && totalPages > 1 && (
            <div style={{display: 'flex', gap: '8px', alignItems: 'center'}}>
              <button
                className="btn secondary"
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft size={16} /> Previous
              </button>
              <span>
                Page {page} of {totalPages}
              </span>
              <button
                className="btn secondary"
                disabled={page >= totalPages || loading}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>
      </Card>

      {form && (
        <Modal
          title={
            (isLive ? liveData?.records : state.enquiries)?.some((e) => e.id === form.id)
              ? 'Update enquiry'
              : 'New enquiry'
          }
          onClose={() => setForm(null)}
        >
          <form onSubmit={handleSave}>
            <div className="form-body form-grid">
              <Field label="Customer">
                <select
                  required
                  value={form.customerId}
                  onChange={(e) => setForm({...form, customerId: e.target.value})}
                >
                  <option value="">Select customer</option>
                  {state.customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.phone ? `(${c.phone})` : ''}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Category">
                <select
                  value={form.category}
                  onChange={(e) => setForm({...form, category: e.target.value})}
                >
                  {cats.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </Field>
              <div className="full">
                <Field label="What are they looking for?">
                  <textarea
                    required
                    value={form.requirement}
                    onChange={(e) => setForm({...form, requirement: e.target.value})}
                  />
                </Field>
              </div>
              <Field label="Budget (₹)">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.budget}
                  onChange={(e) => setForm({...form, budget: +e.target.value})}
                />
              </Field>
              <Field label="Follow-up date">
                <input
                  type="date"
                  required
                  value={form.followUp}
                  onChange={(e) => setForm({...form, followUp: e.target.value})}
                />
              </Field>
              <Field label="Status">
                <select
                  value={form.status}
                  onChange={(e) => setForm({...form, status: e.target.value})}
                  disabled={form.status === 'Won'}
                >
                  {form.status === 'Won' ? (
                    <option value="Won">Won (Completed via sales invoice)</option>
                  ) : (
                    ['Open', 'Contacted', 'Quoted', 'Closed'].map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))
                  )}
                </select>
                {form.status === 'Won' && (
                  <small className="muted" style={{display: 'block', marginTop: '4px'}}>
                    Won enquiries are linked to issued invoices and cannot be reopened.
                  </small>
                )}
              </Field>
              <div className="full">
                <Field label="Notes">
                  <textarea
                    value={form.notes}
                    onChange={(e) => setForm({...form, notes: e.target.value})}
                  />
                </Field>
              </div>
            </div>
            <div className="form-actions">
              <Btn secondary onClick={() => setForm(null)}>
                Cancel
              </Btn>
              <Btn type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Save enquiry'}
              </Btn>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
