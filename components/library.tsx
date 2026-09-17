'use client';
import {useState, useEffect, useCallback} from 'react';
import Link from 'next/link';
import {Upload, FileText, ArrowUpRight, Eye} from 'lucide-react';
import {TODAY, uid, Attachment, Bill} from '@/lib/domain';
import {uploadFile} from '@/lib/upload';
import {useStore} from './store';
import {PageHead, Card, Btn, Field, Modal, SearchBox, Empty, Badge} from './ui';

export default function Library() {
  const {state, setState, notify, isLive, fetchInvoicesPage} = useStore();
  const [q, setQ] = useState('');
  const [customer, setCustomer] = useState('All');
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Attachment | null>(null);
  const [customerId, setCustomerId] = useState('');
  const [date, setDate] = useState(TODAY);
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState('');
  const [uploading, setUploading] = useState(false);
  const [liveDocs, setLiveDocs] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(false);

  const loadLiveDocs = useCallback(async () => {
    if (!isLive) return;
    setLoading(true);
    try {
      const res = await fetchInvoicesPage({
        limit: 100,
        customerId: customer === 'All' ? undefined : customer,
        search: q || undefined,
      });
      setLiveDocs(res?.records || []);
    } catch (err: any) {
      notify(err.message || 'Failed to load documents.');
    } finally {
      setLoading(false);
    }
  }, [isLive, customer, q, fetchInvoicesPage, notify]);

  useEffect(() => {
    if (isLive) {
      loadLiveDocs();
    }
  }, [isLive, loadLiveDocs]);

  const demoDocs = state.bills.filter(
    (b) =>
      (b.id + (state.customers.find((c) => c.id === b.customerId)?.name || '')).toLowerCase().includes(q.toLowerCase()) &&
      (customer === 'All' || b.customerId === customer)
  );

  const docs = isLive ? liveDocs : demoDocs;

  const attachments = state.attachments.filter(
    (a) =>
      (a.name + (state.customers.find((c) => c.id === a.customerId)?.name || '')).toLowerCase().includes(q.toLowerCase()) &&
      (customer === 'All' || a.customerId === customer)
  );

  async function handleAttach(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      notify('Select a PDF file.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      notify('File exceeds maximum size of 5 MB.');
      return;
    }

    if (isLive) {
      setUploading(true);
      try {
        const data = await uploadFile(file);
        const fileId = data._id || data.id;
        const fileUrl = `/api/files/${fileId}`;

        setState((s) => ({
          ...s,
          attachments: [
            {
              id: fileId,
              customerId,
              name: file.name,
              date,
              url: fileUrl,
              note,
            },
            ...s.attachments,
          ],
        }));

        notify('Historical document safely archived to company files.');
        setOpen(false);
        setFile(null);
        setNote('');
      } catch (err: any) {
        notify(err.message || 'Upload failed.');
      } finally {
        setUploading(false);
      }
    } else {
      setState((s) => ({
        ...s,
        attachments: [
          {
            id: uid('DOC'),
            customerId,
            name: file.name,
            date,
            url: URL.createObjectURL(file),
            note,
          },
          ...s.attachments,
        ],
      }));
      notify('Historical document attached. No transaction was created.');
      setOpen(false);
      setFile(null);
      setNote('');
    }
  }

  function getCustomerName(cId: string) {
    return state.customers.find((c) => c.id === cId)?.name || 'Unknown Customer';
  }

  return (
    <>
      <PageHead
        title="Document library"
        description="Find issued documents and attach historical customer invoices without recording another sale."
        actions={
          <Btn onClick={() => setOpen(true)}>
            <Upload size={16} />
            Attach historical bill
          </Btn>
        }
      />
      <Card>
        <div className="toolbar">
          <SearchBox
            value={q}
            onChange={setQ}
            placeholder="Search document or customer…"
          />
          <select
            aria-label="Document customer"
            value={customer}
            onChange={(e) => setCustomer(e.target.value)}
          >
            <option value="All">All customers</option>
            {state.customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <Link className="text-link" href="/reports">
            Batch invoice exports <ArrowUpRight size={14} />
          </Link>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Document</th>
                <th>Customer</th>
                <th>Date</th>
                <th>Type</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {docs.map((b) => (
                <tr key={b.id}>
                  <td>
                    <div className="customer-cell">
                      <FileText size={19} />
                      <strong>{b.id}</strong>
                    </div>
                  </td>
                  <td>{getCustomerName(b.customerId)}</td>
                  <td>{b.date}</td>
                  <td>
                    <Badge>
                      {b.kind === 'Quotation'
                        ? 'Quotation'
                        : b.kind === 'Service'
                        ? 'Service invoice'
                        : 'Sales invoice'}
                    </Badge>
                  </td>
                  <td>
                    <Link
                      className="text-link"
                      href={`${b.kind === 'Quotation' ? '/quotations' : '/sales'}/${b.id}`}
                    >
                      Open / print PDF <ArrowUpRight size={15} />
                    </Link>
                  </td>
                </tr>
              ))}
              {attachments.map((a) => (
                <tr key={a.id}>
                  <td>
                    {a.name}
                    <small>{a.note}</small>
                  </td>
                  <td>{getCustomerName(a.customerId)}</td>
                  <td>{a.date}</td>
                  <td>
                    <Badge>Historical attachment</Badge>
                  </td>
                  <td>
                    <button
                      className="link-button"
                      onClick={() => setSelected(a)}
                    >
                      Preview PDF
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {loading && <div style={{padding: '16px', textAlign: 'center'}} className="muted">Loading documents…</div>}
        {!loading && !docs.length && !attachments.length && <Empty />}
      </Card>

      <div className="notice spaced">
        {isLive
          ? 'Authoritative repository for issued sales and service invoices. Historical attachments are securely archived under your company storage.'
          : 'Attaching a PDF does not affect sales, stock, cash, dues or profit. Attachments are local previews and reset when this demo is refreshed.'}
      </div>

      {open && (
        <Modal title="Attach a historical invoice" onClose={() => setOpen(false)}>
          <form onSubmit={handleAttach}>
            <div className="form-body stack">
              <Field label="Customer">
                <select
                  required
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                >
                  <option value="">Select customer</option>
                  {state.customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Original invoice date">
                <input
                  required
                  type="date"
                  max={TODAY}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </Field>
              <Field label="Invoice PDF (Max 5 MB)">
                <input
                  required
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                />
              </Field>
              <Field label="Notes">
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Previous Tally bill, warranty reference…"
                />
              </Field>
            </div>
            <div className="form-actions">
              <Btn secondary onClick={() => setOpen(false)} disabled={uploading}>
                Cancel
              </Btn>
              <Btn type="submit" disabled={uploading}>
                {uploading ? 'Archiving…' : 'Attach document'}
              </Btn>
            </div>
          </form>
        </Modal>
      )}

      {selected && (
        <Modal title={selected.name} wide onClose={() => setSelected(null)}>
          <iframe
            className="attachment-preview"
            title={selected.name}
            src={selected.url}
          />
          <div className="form-actions">
            <a
              className="btn secondary"
              href={selected.url}
              download={selected.name}
            >
              Download original
            </a>
            <Btn onClick={() => setSelected(null)}>Close</Btn>
          </div>
        </Modal>
      )}
    </>
  );
}
