'use client';
import {useState, useEffect, useCallback} from 'react';
import Link from 'next/link';
import {useRouter, useSearchParams} from 'next/navigation';
import {Plus, Pencil, ArrowLeft, ArrowUpRight, FileText, RotateCcw} from 'lucide-react';
import {Job, TODAY, uid, money, dateLabel, available, balance} from '@/lib/domain';
import {consumePart} from '@/lib/operations';
import {useStore} from './store';
import {PageHead, Card, Btn, Field, Modal, SearchBox, Badge, Empty} from './ui';
import {PaymentDialog} from './payments';

export const jobStatuses = [
  'Received',
  'Diagnosing',
  'EstimatePending',
  'EstimateApproved',
  'WorkInProgress',
  'WaitingForParts',
  'ReadyForDelivery',
  'Delivered',
  'Unrepaired',
  'Cancelled',
];

export function normalizeStatus(s?: string) {
  if (!s) return '';
  const lower = s.toLowerCase().replace(/[\s_-]/g, '');
  if (lower === 'readyforcollection' || lower === 'readyfordelivery') return 'ReadyForDelivery';
  if (lower === 'diagnosis' || lower === 'diagnosing') return 'Diagnosing';
  if (lower === 'awaitingapproval' || lower === 'estimatepending') return 'EstimatePending';
  if (lower === 'estimateapproved' || lower === 'approved') return 'EstimateApproved';
  if (lower === 'estimaterejected' || lower === 'rejected') return 'EstimateRejected';
  if (lower === 'workinprogress' || lower === 'inprogress') return 'WorkInProgress';
  if (lower === 'waitingforparts') return 'WaitingForParts';
  if (lower === 'delivered' || lower === 'completed') return 'Delivered';
  if (lower === 'unrepaired') return 'Unrepaired';
  if (lower === 'cancelled') return 'Cancelled';
  if (lower === 'received') return 'Received';
  return s;
}

export function JobForm({
  existing,
  onClose,
  onSuccess,
}: {
  existing?: any;
  onClose: () => void;
  onSuccess?: () => void;
}) {
  const {state, notify, isLive} = useStore();
  const router = useRouter();

  const [customerId, setCustomerId] = useState(existing?.customerId || '');
  const [deviceType, setDeviceType] = useState(existing?.device?.type || 'Laptop');
  const [brand, setBrand] = useState(existing?.device?.brand || '');
  const [model, setModel] = useState(
    existing?.device?.model || (typeof existing?.device === 'string' ? existing.device : '')
  );
  const [serial, setSerial] = useState(existing?.device?.serialNumber || existing?.serial || '');
  const [problem, setProblem] = useState(existing?.reportedProblem || existing?.problem || '');
  const [condition, setCondition] = useState(existing?.device?.conditionNotes || existing?.condition || '');
  const [accessories, setAccessories] = useState(
    existing?.device?.accessories ||
      (Array.isArray(existing?.accessories) ? existing.accessories.join('\n') : existing?.accessories || '')
  );
  const [estimate, setEstimate] = useState(
    existing?.estimate?.estimatedCostPaise !== undefined
      ? (existing.estimate.estimatedCostPaise / 100).toString()
      : existing?.estimate !== undefined
      ? existing.estimate.toString()
      : '0'
  );
  const [status, setStatus] = useState(existing?.status || 'Received');
  const [notes, setNotes] = useState(existing?.diagnosticNotes || existing?.work || '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerId) {
      notify('Select a customer.');
      return;
    }
    if (!existing && (!brand.trim() || !model.trim())) {
      notify('Enter device brand and model.');
      return;
    }
    if (!problem.trim()) {
      notify('Describe the reported problem.');
      return;
    }

    if (!isLive) {
      if (existing) {
        state.jobs = state.jobs.map(x =>
          x.id === (existing._id || existing.id)
            ? {
                ...x,
                status,
                problem,
                reportedProblem: problem,
                work: notes,
                diagnosticNotes: notes,
                estimate: parseFloat(estimate || '0'),
              }
            : x
        );
        notify('Service job updated.');
      } else {
        const newJobId = `JOB-${Math.floor(100 + Math.random() * 900)}`;
        const newJob: any = {
          id: newJobId,
          customerId,
          date: TODAY,
          device: `${brand} ${model}`.trim(),
          serial: serial.trim(),
          problem: problem.trim(),
          reportedProblem: problem.trim(),
          accessories: accessories.split('\n').map((a: string) => a.trim()).filter(Boolean),
          condition: condition.trim(),
          estimate: parseFloat(estimate || '0'),
          final: 0,
          status: 'Received',
          outcome: 'Pending',
          work: '',
          delivery: '',
          parts: [],
          photos: [],
        };
        state.jobs = [newJob, ...state.jobs];
        notify('Service job intake saved.');
      }
      if (onSuccess) onSuccess();
      onClose();
      return;
    }

    setIsSubmitting(true);
    try {
      if (existing) {
        // Update existing job
        const res = await fetch(`/api/services/${existing._id || existing.id}`, {
          method: 'PATCH',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            status,
            diagnosticNotes: notes,
            notes,
            expectedVersion: existing.version ?? 1,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to update job.');
        notify('Service job updated successfully.');
      } else {
        // Create new job
        const idempotencyKey = `job-${Date.now()}-${uid('IDEM')}`;
        const res = await fetch('/api/services', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            customerId,
            device: {
              type: deviceType,
              brand: brand.trim(),
              model: model.trim(),
              serialNumber: serial.trim(),
              accessories: accessories.trim(),
              conditionNotes: condition.trim(),
              photos: [],
            },
            reportedProblem: problem.trim(),
            initialEstimatePaise: Math.round(parseFloat(estimate || '0') * 100),
            idempotencyKey,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to create job.');
        notify('Service job created successfully.');
        if (onSuccess) onSuccess();
        onClose();
        router.push(`/services/${data._id}`);
        return;
      }

      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) {
      notify(err.message || 'Error saving service job.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal title={existing ? 'Update Service Job' : 'New Service Intake'} onClose={onClose} wide>
      <form onSubmit={handleSubmit}>
        <div className="form-body">
          <div className="form-grid">
            <Field label="Customer *">
              <select
                required
                disabled={Boolean(existing)}
                value={customerId}
                onChange={e => setCustomerId(e.target.value)}
              >
                <option value="">Select customer</option>
                {state.customers.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.phone ? `· ${c.phone}` : ''}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Device Category">
              <select value={deviceType} onChange={e => setDeviceType(e.target.value)}>
                <option value="Laptop">Laptop</option>
                <option value="Desktop">Desktop / Tower</option>
                <option value="Printer">Printer</option>
                <option value="Monitor">Monitor</option>
                <option value="UPS">UPS / Inverter</option>
                <option value="Component">Internal Component</option>
                <option value="Other">Other Device</option>
              </select>
            </Field>

            <Field label="Brand *">
              <input
                required
                value={brand}
                onChange={e => setBrand(e.target.value)}
                placeholder="e.g. Dell, HP, Lenovo"
              />
            </Field>

            <Field label="Model *">
              <input
                required
                value={model}
                onChange={e => setModel(e.target.value)}
                placeholder="e.g. Latitude 3420, Inspiron 15"
              />
            </Field>

            <Field label="Device Serial / Service Tag">
              <input
                value={serial}
                onChange={e => setSerial(e.target.value)}
                placeholder="Printed serial or tag"
              />
            </Field>

            <Field label="Initial Estimate (₹)">
              <input
                type="number"
                min="0"
                step="0.01"
                disabled={Boolean(existing)}
                value={estimate}
                onChange={e => setEstimate(e.target.value)}
              />
            </Field>

            <div className="full">
              <Field label="Reported Problem *">
                <textarea
                  required
                  rows={2}
                  value={problem}
                  onChange={e => setProblem(e.target.value)}
                  placeholder="e.g. No display, liquid spill, slow booting, fan noise…"
                />
              </Field>
            </div>

            <div className="full">
              <Field label="Physical Condition at Intake">
                <textarea
                  rows={2}
                  value={condition}
                  onChange={e => setCondition(e.target.value)}
                  placeholder="Scratches on lid, dent on hinge, missing rubber feet…"
                />
              </Field>
            </div>

            <div className="full">
              <Field label="Accessories Received">
                <textarea
                  rows={2}
                  value={accessories}
                  onChange={e => setAccessories(e.target.value)}
                  placeholder="Power adapter (65W original), laptop bag, power cord, etc."
                />
              </Field>
            </div>

            {existing && (
              <>
                <Field label="Work Status">
                  <select value={status} onChange={e => setStatus(e.target.value)}>
                    {jobStatuses.map(s => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </Field>

                <div className="full">
                  <Field label="Technician Diagnostic & Work Notes">
                    <textarea
                      rows={3}
                      value={notes}
                      onChange={e => setNotes(e.target.value)}
                      placeholder="Details of inspection, parts tested, repair completed…"
                    />
                  </Field>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="form-actions">
          <Btn secondary onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Btn>
          <Btn type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : existing ? 'Update Service Job' : 'Create Service Job'}
          </Btn>
        </div>
      </form>
    </Modal>
  );
}

export function IssuePartModal({
  job,
  onClose,
  onSuccess,
}: {
  job: any;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const {notify, isLive} = useStore();
  const [products, setProducts] = useState<any[]>([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [rate, setRate] = useState('');
  const [serials, setSerials] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isLive) {
      fetch('/api/master/products?limit=100')
        .then(r => r.json())
        .then(d => {
          if (Array.isArray(d?.records || d?.products || d)) {
            setProducts(d.records || d.products || d);
          }
        })
        .catch(() => {});
    }
  }, [isLive]);

  const handleProductSelect = (pId: string) => {
    setSelectedProductId(pId);
    const prod = products.find(p => p._id === pId || p.id === pId);
    setSelectedProduct(prod || null);
    if (prod) {
      setRate((prod.retailPricePaise ? prod.retailPricePaise / 100 : prod.price || 0).toString());
    }
  };

  const handleIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProductId || !selectedProduct) {
      notify('Select a stocked product.');
      return;
    }

    const lotId = selectedProduct.lotId || selectedProduct.defaultLotId || selectedProduct._id;
    const rateNum = parseFloat(rate);
    if (isNaN(rateNum) || rateNum < 0) {
      notify('Enter a valid billing rate.');
      return;
    }

    const serialList = serials
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean);

    if (selectedProduct.isSerialTracked && serialList.length !== quantity) {
      notify(`Enter exactly ${quantity} serial number(s), one per line.`);
      return;
    }

    if (!isLive) {
      const partObj = {
        partId: `PRT-${Date.now()}`,
        productId: selectedProductId,
        productName: selectedProduct.name,
        quantity: Number(quantity),
        billingRatePaise: Math.round(rateNum * 100),
        serials: serialList,
        invoiced: false,
        reversed: false,
      };
      if (!job.parts) job.parts = [];
      job.parts.push(partObj);
      notify('Part issued to service job (preview).');
      onSuccess();
      onClose();
      return;
    }

    setIsSubmitting(true);
    try {
      const idempotencyKey = `issue-${job._id}-${Date.now()}-${uid('IDEM')}`;
      const res = await fetch(`/api/services/${job._id || job.id}/parts`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          productId: selectedProductId,
          lotId,
          quantity: Number(quantity),
          serials: serialList,
          billingRatePaise: Math.round(rateNum * 100),
          taxBasisPoints: selectedProduct.taxBasisPoints || 1800,
          expectedVersion: job.version ?? 1,
          idempotencyKey,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to issue part.');

      notify('Part issued to service job. Inventory updated.');
      onSuccess();
      onClose();
    } catch (err: any) {
      notify(err.message || 'Error issuing part.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal title="Issue Stocked Part to Service Job" onClose={onClose}>
      <form onSubmit={handleIssue}>
        <div className="form-body stack">
          <p>
            Issuing a part deducts it from sellable stock and transfers it into the job's consumed bucket. Serial
            numbers are marked as consumed in service.
          </p>

          <Field label="Stocked Part">
            <select
              required
              value={selectedProductId}
              onChange={e => handleProductSelect(e.target.value)}
            >
              <option value="">Select a product</option>
              {products.map(p => (
                <option key={p._id || p.id} value={p._id || p.id}>
                  {p.name} {p.brand ? `(${p.brand})` : ''} · ₹{p.retailPricePaise ? p.retailPricePaise / 100 : p.price}
                </option>
              ))}
            </select>
          </Field>

          <div className="grid-2">
            <Field label="Quantity">
              <input
                required
                type="number"
                min="1"
                max="100"
                value={quantity}
                onChange={e => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
              />
            </Field>

            <Field label="Customer Billing Rate (₹)">
              <input
                required
                type="number"
                min="0"
                step="0.01"
                value={rate}
                onChange={e => setRate(e.target.value)}
              />
            </Field>
          </div>

          {selectedProduct?.isSerialTracked && (
            <Field label="Serial Numbers (one per line)">
              <textarea
                required
                rows={3}
                value={serials}
                onChange={e => setSerials(e.target.value)}
                placeholder="Scan or type serial numbers…"
              />
            </Field>
          )}
        </div>

        <div className="form-actions">
          <Btn secondary onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Btn>
          <Btn type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Issuing…' : 'Issue Part'}
          </Btn>
        </div>
      </form>
    </Modal>
  );
}

export function ReversePartModal({
  job,
  part,
  onClose,
  onSuccess,
}: {
  job: any;
  part: any;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const {notify, isLive} = useStore();
  const [condition, setCondition] = useState<'Sellable' | 'Defective'>('Sellable');
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleReverse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      notify('State reason for reversing this part.');
      return;
    }

    if (!isLive) {
      part.reversed = true;
      part.conditionAtReversal = condition;
      part.reversalReason = reason;
      notify('Part reversed (preview).');
      onSuccess();
      onClose();
      return;
    }

    setIsSubmitting(true);
    try {
      const idempotencyKey = `rev-prt-${part.partId}-${Date.now()}`;
      const res = await fetch(
        `/api/services/${job._id || job.id}/parts/${part.partId}/reverse`,
        {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            condition,
            reason: reason.trim(),
            expectedVersion: job.version ?? 1,
            idempotencyKey,
          }),
        }
      );

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to reverse part.');

      notify(
        `Part reversed successfully. Returned to ${condition.toLowerCase()} inventory.`
      );
      onSuccess();
      onClose();
    } catch (err: any) {
      notify(err.message || 'Error reversing part.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal title="Reverse Consumed Part" onClose={onClose}>
      <form onSubmit={handleReverse}>
        <div className="form-body stack">
          <p>
            Reversing <strong>{part.productName}</strong> ({part.quantity} unit) removes it from this service job and
            restores it to inventory.
          </p>

          <Field label="Return Condition">
            <select
              value={condition}
              onChange={e => setCondition(e.target.value as 'Sellable' | 'Defective')}
            >
              <option value="Sellable">Sellable Stock (Unused / working part)</option>
              <option value="Defective">Defective Quarantine (Faulty / damaged part)</option>
            </select>
          </Field>

          <Field label="Reversal Reason">
            <textarea
              required
              rows={2}
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="e.g. Wrong part specified, customer declined repair, defective replacement…"
            />
          </Field>
        </div>

        <div className="form-actions">
          <Btn secondary onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Btn>
          <Btn type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Reversing…' : 'Confirm Reversal'}
          </Btn>
        </div>
      </form>
    </Modal>
  );
}

export default function Services({id}: {id?: string}) {
  const {state, run, isLive} = useStore();
  const router = useRouter();
  const searchParams = useSearchParams();

  const isDetailView = Boolean(id && id !== 'new');

  const [q, setQ] = useState(() => searchParams?.get('search') || searchParams?.get('q') || '');
  const [status, setStatus] = useState(() => searchParams?.get('status') || 'Active jobs');
  const [edit, setEdit] = useState(id === 'new');
  const [partModal, setPartModal] = useState(false);
  const [reversingPart, setReversingPart] = useState<any | null>(null);
  const [payment, setPayment] = useState(false);

  // Live state
  const [liveJob, setLiveJob] = useState<any | null>(null);
  const [liveList, setLiveList] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchJob = useCallback(async (jobId: string) => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/services/${encodeURIComponent(jobId)}`);
      if (res.ok) {
        const data = await res.json();
        setLiveJob(data);
      } else {
        setLiveJob(null);
      }
    } catch {
      setLiveJob(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchList = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (status !== 'All jobs' && status !== 'Active jobs') {
        params.set('status', status);
      } else if (status === 'Active jobs') {
        params.set('status', 'Active jobs');
      }
      if (q.trim()) params.set('search', q.trim());
      params.set('limit', '100');

      const res = await fetch(`/api/services?${params.toString()}`);
      const data = await res.json();
      if (res.ok && Array.isArray(data.jobs)) {
        setLiveList(data.jobs);
      }
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  }, [status, q]);

  useEffect(() => {
    if (isDetailView) {
      fetchJob(id!);
    } else {
      setLiveJob(null);
      fetchList();
    }
  }, [isDetailView, id, fetchJob, fetchList]);

  // Only resolve j when in detail view
  const j = isDetailView
    ? liveJob || (id ? state.jobs.find(x => x.id === id || (x as any)._id === id) : null)
    : null;
  const customer = j?.customerSnapshot || (j ? state.customers.find(c => c.id === j.customerId) : null);
  const invoice = j ? state.bills.find(b => b.jobId === (j._id || j.id) && b.kind === 'Service') : null;

  // Filter list for table view
  const rawList = isLive ? liveList : state.jobs;
  const displayList = rawList.filter(item => {
    const s = normalizeStatus(item.status);
    if (status === 'Active jobs') {
      if (s === 'Delivered' || s === 'Cancelled') return false;
    } else if (status !== 'All jobs') {
      if (s !== normalizeStatus(status) && item.status !== status) return false;
    }

    if (q.trim()) {
      const term = q.toLowerCase().trim();
      const num = (item.jobNumber || item.id || '').toLowerCase();
      const dev = `${item.device?.brand || ''} ${item.device?.model || item.device || ''} ${item.device?.serialNumber || item.serial || ''}`.toLowerCase();
      const cust = (item.customerSnapshot?.name || state.customers.find(c => c.id === item.customerId)?.name || '').toLowerCase();
      const prob = (item.reportedProblem || item.problem || '').toLowerCase();
      if (!num.includes(term) && !dev.includes(term) && !cust.includes(term) && !prob.includes(term)) {
        return false;
      }
    }
    return true;
  });

  if (isDetailView && !j && !isLoading) {
    return (
      <>
        <Link className="back-link" href="/services">
          <ArrowLeft size={14} /> All service jobs
        </Link>
        <Empty
          title="Service job not found"
          text={`No service job found with ID "${id}".`}
          action={
            <Link className="btn secondary" href="/services">
              Back to all service jobs
            </Link>
          }
        />
      </>
    );
  }

  if (isDetailView && !j && isLoading) {
    return (
      <div style={{padding: '3rem', textAlign: 'center', opacity: 0.7}}>
        Loading service job details…
      </div>
    );
  }

  return (
    <>
      {isDetailView && j && (
        <Link className="back-link" href="/services">
          <ArrowLeft size={14} /> All service jobs
        </Link>
      )}

      <PageHead
        title={
          isDetailView && j
            ? `${j.jobNumber || j.id} · ${j.device?.brand ? `${j.device.brand} ` : ''}${j.device?.model || j.device || ''}`
            : 'Service Jobs'
        }
        description={
          isDetailView && j
            ? `${customer?.name || 'Customer'} · Received ${j.date || j.createdAt?.slice(0, 10) || TODAY}`
            : 'From intake to delivery. Manage diagnostic estimates, parts consumption and warranty history.'
        }
        actions={
          isDetailView && j ? (
            <>
              <Link
                className="btn secondary"
                href={`/communication?customer=${j.customerId}&job=${j._id || j.id}`}
              >
                Preview WhatsApp
              </Link>
              <Btn onClick={() => setEdit(true)}>
                <Pencil size={16} /> Update Job
              </Btn>
            </>
          ) : (
            <Link href="/services/new" className="btn">
              <Plus size={16} /> New Service Intake
            </Link>
          )
        }
      />

      {isDetailView && j ? (
        <>
          <div className="service-progress">
            {jobStatuses.map((s, i) => {
              const currentNormalized = normalizeStatus(j.status);
              const currentIndex = jobStatuses.indexOf(currentNormalized);
              const isDone = currentIndex >= 0 && currentIndex >= i;
              return (
                <div key={s} className={isDone ? 'done' : ''}>
                  <span>{i + 1}</span>
                  <small>{s}</small>
                </div>
              );
            })}
          </div>

          <div className="detail-grid">
            <div className="stack">
              <Card title="Device & Intake Record">
                <dl className="detail-list">
                  <div>
                    <dt>Device</dt>
                    <dd>
                      {j.device?.brand} {j.device?.model || j.device}
                    </dd>
                  </div>
                  <div>
                    <dt>Category</dt>
                    <dd>{j.device?.type || 'Laptop'}</dd>
                  </div>
                  <div>
                    <dt>Serial / Tag</dt>
                    <dd>{j.device?.serialNumber || j.serial || 'Not recorded'}</dd>
                  </div>
                  <div>
                    <dt>Customer</dt>
                    <dd>{customer?.name}</dd>
                  </div>
                  <div>
                    <dt>Phone</dt>
                    <dd>{customer?.phone || 'Not recorded'}</dd>
                  </div>
                  <div>
                    <dt>Reported Problem</dt>
                    <dd>{j.reportedProblem || j.problem}</dd>
                  </div>
                  <div>
                    <dt>Intake Condition</dt>
                    <dd>{j.device?.conditionNotes || j.condition || 'Normal wear'}</dd>
                  </div>
                  <div>
                    <dt>Accessories</dt>
                    <dd>
                      {j.device?.accessories ||
                        (Array.isArray(j.accessories) ? j.accessories.join(', ') : 'None')}
                    </dd>
                  </div>
                  <div>
                    <dt>Custody Status</dt>
                    <dd>{j.status === 'Delivered' ? 'Handed over' : 'In shop custody'}</dd>
                  </div>
                </dl>
              </Card>

              <Card title="Diagnostic & Repair Outcome">
                <div className="body-pad">
                  <Badge>{j.status}</Badge>
                  <p className="spaced" style={{marginTop: '0.75rem'}}>
                    {j.diagnosticNotes || j.work || 'No diagnostic notes added yet.'}
                  </p>
                </div>
              </Card>

              <Card
                title="Parts Consumed"
                sub="Stocked parts reduce inventory and link warranty upon invoice issue."
                actions={
                  <Btn
                    secondary
                    disabled={j.status === 'Delivered' || j.status === 'Cancelled'}
                    onClick={() => setPartModal(true)}
                  >
                    <Plus size={15} /> Issue Part
                  </Btn>
                }
              >
                {j.parts && j.parts.length ? (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Part Name</th>
                          <th>Qty</th>
                          <th>Billing Rate</th>
                          <th>Status</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {j.parts.map((p: any) => (
                          <tr
                            key={p.partId}
                            style={p.reversed ? {opacity: 0.5, textDecoration: 'line-through'} : undefined}
                          >
                            <td>
                              <strong>{p.productName}</strong>
                              {p.serials && p.serials.length > 0 && (
                                <div>
                                  <small>S/N: {p.serials.join(', ')}</small>
                                </div>
                              )}
                            </td>
                            <td>{p.quantity || p.qty}</td>
                            <td>
                              {money(
                                p.billingRatePaise !== undefined
                                  ? p.billingRatePaise / 100
                                  : p.unitCostPaise !== undefined
                                  ? p.unitCostPaise / 100
                                  : 0
                              )}
                            </td>
                            <td>
                              {p.reversed ? (
                                <Badge>Reversed ({p.conditionAtReversal || 'Returned'})</Badge>
                              ) : p.invoiced ? (
                                <Badge>Billed on Invoice</Badge>
                              ) : (
                                <Badge>Issued to Job</Badge>
                              )}
                            </td>
                            <td>
                              {!p.reversed && !p.invoiced && (
                                <Btn
                                  secondary
                                  onClick={() => setReversingPart(p)}
                                  style={{padding: '0.2rem 0.5rem', fontSize: '0.75rem'}}
                                >
                                  <RotateCcw size={12} style={{marginRight: '0.25rem'}} /> Reverse
                                </Btn>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <Empty
                    title="No stocked parts used"
                    text="Labour-only repairs can be completed without consuming parts."
                  />
                )}
              </Card>
            </div>

            <div className="stack">
              <Card title="Estimate & Invoicing">
                <dl className="detail-list">
                  <div>
                    <dt>Estimated Cost</dt>
                    <dd>
                      {money(
                        j.estimate?.estimatedCostPaise !== undefined
                          ? j.estimate.estimatedCostPaise / 100
                          : j.estimate || 0
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Estimate Status</dt>
                    <dd>
                      <Badge>{j.estimate?.status || 'Pending'}</Badge>
                    </dd>
                  </div>
                  <div>
                    <dt>Invoice</dt>
                    <dd>
                      {invoice ? (
                        <Link className="record-link" href={'/sales/' + invoice.id}>
                          {invoice.id}
                        </Link>
                      ) : (
                        'Not created'
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Payment</dt>
                    <dd>
                      <Badge>
                        {invoice
                          ? balance(state, invoice) === 0
                            ? 'Paid'
                            : 'Unpaid'
                          : 'Not billed'}
                      </Badge>
                    </dd>
                  </div>
                </dl>
                <div className="body-pad stack">
                  {invoice ? (
                    <>
                      {balance(state, invoice) > 0 && (
                        <Btn onClick={() => setPayment(true)}>Receive payment</Btn>
                      )}
                      <Link className="btn secondary" href={'/sales/' + invoice.id}>
                        View service invoice
                      </Link>
                    </>
                  ) : (
                    <Link
                      className="btn"
                      href={`/sales/new?job=${j._id || j.id}&customer=${j.customerId}`}
                    >
                      <FileText size={15} /> Create Service Invoice
                    </Link>
                  )}
                  <Link
                    className="btn secondary"
                    href={`/quotations/new?job=${j._id || j.id}&customer=${j.customerId}`}
                  >
                    Create Service Estimate
                  </Link>
                </div>
              </Card>

              <Card title="Customer Profile">
                <div className="body-pad">
                  <p>View repair history, purchases and outstanding dues.</p>
                  <Link className="text-link spaced" href={'/customers/' + j.customerId}>
                    Open customer profile <ArrowUpRight size={14} />
                  </Link>
                </div>
              </Card>
            </div>
          </div>
        </>
      ) : (
        <Card>
          <div className="toolbar">
            <SearchBox
              value={q}
              onChange={setQ}
              placeholder="Search job number, device or customer…"
            />
            <select
              aria-label="Service job filter"
              value={status}
              onChange={e => setStatus(e.target.value)}
            >
              <option value="Active jobs">Active jobs</option>
              <option value="All jobs">All jobs</option>
              {jobStatuses.map(s => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Job / Device</th>
                  <th>Customer</th>
                  <th>Reported Problem</th>
                  <th>Estimate</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {displayList.map((jobItem: any) => (
                  <tr key={jobItem._id || jobItem.id}>
                    <td>
                      <Link
                        className="record-link"
                        href={'/services/' + (jobItem._id || jobItem.id)}
                      >
                        {jobItem.jobNumber || jobItem.id}
                      </Link>
                      <small>
                        {jobItem.device?.brand ? `${jobItem.device.brand} ` : ''}
                        {jobItem.device?.model || jobItem.device || 'Device'}
                      </small>
                    </td>
                    <td>
                      {jobItem.customerSnapshot?.name ||
                        state.customers.find(c => c.id === jobItem.customerId)?.name ||
                        'Customer'}
                      <small>{jobItem.date || jobItem.createdAt?.slice(0, 10) || TODAY}</small>
                    </td>
                    <td className="wrap-cell">
                      {jobItem.reportedProblem || jobItem.problem}
                    </td>
                    <td>
                      {money(
                        jobItem.estimate?.estimatedCostPaise !== undefined
                          ? jobItem.estimate.estimatedCostPaise / 100
                          : jobItem.estimate || 0
                      )}
                    </td>
                    <td>
                      <Badge>{jobItem.status}</Badge>
                    </td>
                    <td>
                      <Link
                        className="text-link"
                        href={'/services/' + (jobItem._id || jobItem.id)}
                      >
                        Open <ArrowUpRight size={15} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {isLoading && !displayList.length && (
            <div style={{padding: '2rem', textAlign: 'center', opacity: 0.7}}>
              Loading service jobs…
            </div>
          )}
          {!displayList.length && !isLoading && <Empty title="No service jobs found" />}
          <div className="table-footer">{displayList.length} service jobs</div>
        </Card>
      )}

      {edit && (
        <JobForm
          existing={isDetailView ? j : undefined}
          onClose={() => {
            setEdit(false);
            if (id === 'new') router.push('/services');
          }}
          onSuccess={() => {
            if (isDetailView && id) fetchJob(id);
            else fetchList();
          }}
        />
      )}

      {partModal && j && (
        <IssuePartModal
          job={j}
          onClose={() => setPartModal(false)}
          onSuccess={() => fetchJob(j._id || j.id)}
        />
      )}

      {reversingPart && j && (
        <ReversePartModal
          job={j}
          part={reversingPart}
          onClose={() => setReversingPart(null)}
          onSuccess={() => fetchJob(j._id || j.id)}
        />
      )}

      {payment && invoice && <PaymentDialog record={invoice} onClose={() => setPayment(false)} />}
    </>
  );
}
