'use client';

import {useState, useEffect, useRef} from 'react';
import Link from 'next/link';
import {Download, Printer, Plus, AlertCircle, ArrowUpRight} from 'lucide-react';
import {useStore} from './store';
import {money, roundedTotal, credits, dateLabel, TODAY} from '@/lib/domain';
import {purchaseLineBalances} from '@/lib/settlement';
import SupplierSettlement from './supplier-settlement';
import {Card, Btn, Badge, Field, Modal, csvDownload} from './ui';
import {mapPurchaseFromApi} from '@/lib/mappers';

export default function AccountHistory({id, supplier = false}: {id: string; supplier?: boolean}) {
  const {
    state,
    isLive,
    notify,
    fetchSupplierStatementApi,
    fetchSupplierPayablesApi,
    fetchSupplierAdvancesApi,
    allocateSupplierAdvanceApi,
    recordSupplierRefundApi,
    issueSupplierCreditNoteApi,
    acceptReturnCreditNoteApi,
    reverseSupplierPaymentApi,
    reverseSupplierReturnApi,
    fetchCustomerStatementApi,
  } = useStore();

  const [tab, setTab] = useState(supplier ? 'Overview' : 'Overview');
  const [pay, setPay] = useState(false);

  // Supplier Statement Tab State
  const [statementData, setStatementData] = useState<any>(null);
  const [statementLoading, setStatementLoading] = useState(false);
  const [statementDateFrom, setStatementDateFrom] = useState('');
  const [statementDateTo, setStatementDateTo] = useState('');
  const [statementPage, setStatementPage] = useState(1);

  // Advances Tab State
  const [advancesData, setAdvancesData] = useState<any[]>([]);
  const [advancesLoading, setAdvancesLoading] = useState(false);
  const [allocateModal, setAllocateModal] = useState<{open: boolean; advance: any | null}>({open: false, advance: null});
  const [allocateTargetBill, setAllocateTargetBill] = useState('');
  const [allocateAmount, setAllocateAmount] = useState('');
  const [allocateBusy, setAllocateBusy] = useState(false);

  // Payables Tab State
  const [payablesData, setPayablesData] = useState<any>(null);
  const [payablesLoading, setPayablesLoading] = useState(false);
  const [livePurchases, setLivePurchases] = useState<any[]>([]);
  const [livePayments, setLivePayments] = useState<any[]>([]);
  const [liveReturns, setLiveReturns] = useState<any[]>([]);
  const [liveCredits, setLiveCredits] = useState<any[]>([]);

  // Purchases pagination
  const [purchasesPage, setPurchasesPage] = useState(1);
  const [purchasesTotalPages, setPurchasesTotalPages] = useState(1);
  const [purchasesTotal, setPurchasesTotal] = useState(0);

  // Payments pagination
  const [paymentsPage, setPaymentsPage] = useState(1);
  const [paymentsTotalPages, setPaymentsTotalPages] = useState(1);
  const [paymentsTotal, setPaymentsTotal] = useState(0);

  // Returns pagination
  const [returnsPage, setReturnsPage] = useState(1);
  const [returnsTotalPages, setReturnsTotalPages] = useState(1);
  const [returnsTotal, setReturnsTotal] = useState(0);

  // Refund Modal State
  const [refundModal, setRefundModal] = useState<{open: boolean; advance: any | null}>({open: false, advance: null});
  const [refundAccount, setRefundAccount] = useState<'Cash' | 'Bank'>('Bank');
  const [refundAmount, setRefundAmount] = useState('');
  const [refundRef, setRefundRef] = useState('');
  const [refundDate, setRefundDate] = useState(TODAY);
  const [refundBusy, setRefundBusy] = useState(false);

  // Standalone Credit Note Modal State
  const [creditNoteModal, setCreditNoteModal] = useState(false);
  const [cnReason, setCnReason] = useState('RateDifference');
  const [cnDescription, setCnDescription] = useState('');
  const [cnNumber, setCnNumber] = useState('');
  const [cnAmount, setCnAmount] = useState('');
  const [cnGstRate, setCnGstRate] = useState('18');
  const [cnDate, setCnDate] = useState(TODAY);
  const [cnAllocate, setCnAllocate] = useState(false);
  const [cnBusy, setCnBusy] = useState(false);

  // Accept Return Credit Note Modal State
  const [acceptCnModal, setAcceptCnModal] = useState<{open: boolean; returnDoc: any | null}>({open: false, returnDoc: null});
  const [acceptCnNumber, setAcceptCnNumber] = useState('');
  const [acceptCnAmount, setAcceptCnAmount] = useState('');
  const [acceptCnDate, setAcceptCnDate] = useState(TODAY);
  const [acceptCnAllocate, setAcceptCnAllocate] = useState(true);
  const [acceptCnBusy, setAcceptCnBusy] = useState(false);
  const acceptAttempt = useRef<{fingerprint: string; key: string} | null>(null);
  const acceptSubmitting = useRef(false);
  const returnCreditPaise = (r: any) => r?.totalReturnCreditPaise ?? r?.estimatedCreditPaise ??
    (r?.totalReturnCredit != null ? Math.round(r.totalReturnCredit * 100) : null);
  const currentBusinessDate = () => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());

  // Reversal Modal State
  const [reversalModal, setReversalModal] = useState<{open: boolean; type: 'payment' | 'return'; id: string; title: string}>({open: false, type: 'payment', id: '', title: ''});
  const [reversalReason, setReversalReason] = useState('');
  const [reversalBusy, setReversalBusy] = useState(false);

  const bills = state.bills.filter((b) => b.customerId === id && b.kind !== 'Quotation');
  const purchases = state.purchases.filter((p) => p.supplierId === id);
  const refs = new Set([...bills, ...purchases].map((b) => b.id));

  // Load statement
  useEffect(() => {
    if (isLive && tab === 'Statement') {
      setStatementLoading(true);
      if (supplier) {
        fetchSupplierStatementApi(id, {
          dateFrom: statementDateFrom || undefined,
          dateTo: statementDateTo || undefined,
          page: statementPage,
          limit: 25,
        })
          .then((res: any) => {
            setStatementData(res);
          })
          .catch(() => {})
          .finally(() => setStatementLoading(false));
      } else {
        fetchCustomerStatementApi(id, {
          fromDate: statementDateFrom || undefined,
          toDate: statementDateTo || undefined,
          page: statementPage,
          limit: 25,
        })
          .then((res: any) => {
            setStatementData(res);
          })
          .catch(() => {})
          .finally(() => setStatementLoading(false));
      }
    }
  }, [supplier, isLive, id, tab, statementDateFrom, statementDateTo, statementPage, fetchSupplierStatementApi, fetchCustomerStatementApi]);

  // Load advances
  const loadAdvances = () => {
    if (supplier && isLive && tab === 'Advances & credits') {
      setAdvancesLoading(true);
      fetchSupplierAdvancesApi(id)
        .then((res: any) => {
          setAdvancesData(res.advances || res.records || []);
        })
        .catch(() => {})
        .finally(() => setAdvancesLoading(false));
    }
  };

  useEffect(() => {
    loadAdvances();
  }, [supplier, isLive, id, tab, fetchSupplierAdvancesApi]);

  // Load payables
  useEffect(() => {
    if (supplier && isLive && (tab === 'Payables' || tab === 'Advances & credits')) {
      setPayablesLoading(true);
      fetchSupplierPayablesApi(id)
        .then((res: any) => {
          setPayablesData(res);
        })
        .catch(() => {})
        .finally(() => setPayablesLoading(false));
    }
  }, [supplier, isLive, id, tab, fetchSupplierPayablesApi]);

  const loadPurchases = async () => {
    if (!supplier || !isLive) return;
    try {
      const response = await fetch(`/api/purchases?supplierId=${encodeURIComponent(id)}&page=${purchasesPage}&limit=25`);
      if (response.ok) {
        const data = await response.json();
        setLivePurchases((data.records || []).map(mapPurchaseFromApi));
        setPurchasesTotalPages(data.totalPages || 1);
        setPurchasesTotal(data.total || 0);
      }
    } catch {
      notify('Could not load the selected supplier history.');
    }
  };

  const loadPayments = async () => {
    if (!supplier || !isLive) return;
    try {
      const response = await fetch(`/api/purchases/payments?supplierId=${encodeURIComponent(id)}&page=${paymentsPage}&limit=25`);
      if (response.ok) {
        const data = await response.json();
        setLivePayments(data.records || []);
        setPaymentsTotalPages(data.totalPages || 1);
        setPaymentsTotal(data.total || 0);
      }
    } catch {
      notify('Could not load supplier payments.');
    }
  };

  const loadReturns = async () => {
    if (!supplier || !isLive) return;
    try {
      const response = await fetch(`/api/purchases/returns?supplierId=${encodeURIComponent(id)}&page=${returnsPage}&limit=25`);
      if (response.ok) {
        const data = await response.json();
        setLiveReturns(data.records || []);
        setReturnsTotalPages(data.totalPages || 1);
        setReturnsTotal(data.total || 0);
      }
    } catch {
      notify('Could not load supplier returns.');
    }
  };

  const loadCredits = async () => {
    if (!supplier || !isLive) return;
    try {
      const response = await fetch(`/api/purchases/credit-notes?supplierId=${encodeURIComponent(id)}&limit=50`);
      if (response.ok) {
        const data = await response.json();
        setLiveCredits(data.records || []);
      }
    } catch {}
  };

  useEffect(() => {
    if (tab === 'Purchases' || tab === 'Overview') void loadPurchases();
  }, [supplier, isLive, id, tab, purchasesPage]);

  useEffect(() => {
    if (tab === 'Payments') void loadPayments();
  }, [supplier, isLive, id, tab, paymentsPage]);

  useEffect(() => {
    if (tab === 'Returns') void loadReturns();
  }, [supplier, isLive, id, tab, returnsPage]);

  useEffect(() => {
    if (tab === 'Advances & credits') void loadCredits();
  }, [supplier, isLive, id, tab]);

  const events = [
    ...bills.map((b) => ({
      id: b.id,
      date: b.date,
      title: b.kind === 'Service' ? 'Service invoice' : 'Product invoice',
      detail: b.id + ' · ' + money(roundedTotal(b)),
      href: '/sales/' + b.id,
    })),
    ...purchases.map((p) => ({
      id: p.id,
      date: p.date,
      title: p.status === 'Received' ? 'Stock received' : 'Purchase order',
      detail: p.id + ' · ' + money(roundedTotal(p)),
      href: '/purchases/' + p.id,
    })),
    ...state.payments
      .filter((p) => p.party === id || refs.has(p.reference))
      .map((p) => ({
        id: p.id,
        date: p.date,
        title: p.purpose,
        detail: money(p.amount) + ' · ' + p.account + ' · ' + p.note,
        href: (supplier ? '/purchases/' : '/sales/') + p.reference,
      })),
    ...(!supplier
      ? state.enquiries
          .filter((e) => e.customerId === id)
          .map((e) => ({
            id: e.id,
            date: e.date,
            title: 'Enquiry · ' + e.status,
            detail: e.requirement,
            href: '/enquiries',
          }))
      : []),
    ...(!supplier
      ? state.jobs
          .filter((j) => j.customerId === id)
          .map((j) => ({
            id: j.id,
            date: j.date,
            title: 'Service visit · ' + j.status,
            detail: j.device + ' · ' + j.problem,
            href: '/services/' + j.id,
          }))
      : []),
    ...state.returns
      .filter((r) => refs.has(r.reference))
      .map((r) => ({
        id: r.id,
        date: r.date,
        title: 'Return / credit',
        detail: money(r.amount) + ' · ' + r.reason,
        href: '/returns',
      })),
    ...(!supplier
      ? state.bills
          .filter((b) => b.customerId === id && b.kind === 'Quotation')
          .map((b) => ({
            id: b.id,
            date: b.date,
            title: 'Quotation · ' + b.status,
            detail: b.id + ' · ' + money(roundedTotal(b)),
            href: '/quotations/' + b.id,
          }))
      : []),
    ...(!supplier
      ? state.attachments
          .filter((a) => a.customerId === id)
          .map((a) => ({
            id: a.id,
            date: a.date,
            title: 'Document added',
            detail: a.name,
            href: '/documents',
          }))
      : []),
  ].sort((a, b) => b.date.localeCompare(a.date));

  const supplierTabs = ['Overview', 'Purchases', 'Payables', 'Payments', 'Advances & credits', 'Returns', 'Statement', 'Activity timeline'];
  const customerTabs = ['Overview', 'Statement', 'Activity timeline'];
  const availableTabs = supplier ? supplierTabs : customerTabs;

  async function handleAllocateAdvance(e: React.FormEvent) {
    e.preventDefault();
    if (!allocateTargetBill) return notify('Please select a purchase bill to settle.');
    const amt = parseFloat(allocateAmount);
    if (!amt || amt <= 0) return notify('Please enter a positive allocation amount.');

    setAllocateBusy(true);
    try {
      const target = (payablesData?.records || payablesData?.payables || []).find((item: any) => item.id === allocateTargetBill || item._id === allocateTargetBill);
      if (!target) return notify('Reload payables and select a payable line.');
      const res = await allocateSupplierAdvanceApi({
        allocations: [{
          targetType: target.payableType,
          targetId: target.payableType === 'OpeningPayable' ? target.id : target.purchaseId,
          purchaseLineId: target.payableType === 'PurchaseLine' ? target.purchaseLineId : undefined,
          amountPaise: Math.round(amt * 100),
        }],
        effectiveDate: TODAY,
        idempotencyKey: `advance-allocation-${allocateModal.advance._id || allocateModal.advance.id}-${target.id}-${Math.round(amt * 100)}`,
      });
      if (res.success) {
        notify('Advance allocated to purchase bill.');
        setAllocateModal({open: false, advance: null});
        setAllocateAmount('');
        setAllocateTargetBill('');
        loadAdvances();
      } else {
        notify(res.error || 'Failed to allocate advance.');
      }
    } finally {
      setAllocateBusy(false);
    }
  }

  async function handleRecordRefund(e: React.FormEvent) {
    e.preventDefault();
    if (!refundModal.advance) return;
    const amt = parseFloat(refundAmount);
    if (!amt || amt <= 0) return notify('Please enter a valid refund amount.');
    setRefundBusy(true);
    try {
      const res = await recordSupplierRefundApi({
        advanceId: refundModal.advance._id || refundModal.advance.id,
        amountPaise: Math.round(amt * 100),
        account: refundAccount,
        date: refundDate || TODAY,
        reference: refundRef.trim(),
        idempotencyKey: `rfd-${refundModal.advance._id || refundModal.advance.id}-${Date.now()}`,
      });
      if (res.success) {
        notify('Supplier refund recorded into Cash/Bank.');
        setRefundModal({open: false, advance: null});
        setRefundAmount('');
        setRefundRef('');
        loadAdvances();
      } else {
        notify(res.error || 'Failed to record refund.');
      }
    } finally {
      setRefundBusy(false);
    }
  }

  async function handleCreateCreditNote(e: React.FormEvent) {
    e.preventDefault();
    const amt = parseFloat(cnAmount);
    const maximum = returnCreditPaise(acceptCnModal.returnDoc);
    if (!Number.isFinite(amt) || amt <= 0 || maximum == null || Math.round(amt * 100) > maximum)
      return notify('Confirm a positive supplier-agreed reduction no greater than the return value. This is not a payment.');
    acceptSubmitting.current = true;
    const gstRate = parseFloat(cnGstRate) || 0;
    const basisPoints = Math.round(gstRate * 100);
    const taxableBasePaise = Math.round(amt * 100);
    setCnBusy(true);
    try {
      const res = await issueSupplierCreditNoteApi({
        supplierId: id,
        supplierCreditNoteNumber: cnNumber.trim() || undefined,
        reason: cnReason,
        date: cnDate || TODAY,
        taxMode: 'Intra-state',
        lines: [{
          description: cnDescription.trim() || 'Supplier Credit Note',
          taxableBasePaise,
          taxBasisPoints: basisPoints,
        }],
        allocateToBillDue: cnAllocate,
        idempotencyKey: `scn-${id}-${Date.now()}`,
      });
      if (res.success) {
        notify('Credit note created successfully.');
        setCreditNoteModal(false);
        setCnAmount('');
        setCnDescription('');
        setCnNumber('');
        loadAdvances();
        loadCredits();
      } else {
        notify(res.error || 'Failed to issue credit note.');
      }
    } finally {
      setCnBusy(false);
    }
  }

  async function handleAcceptReturnCreditNote(e: React.FormEvent) {
    e.preventDefault();
    if (!acceptCnModal.returnDoc || acceptSubmitting.current) return;
    const amt = parseFloat(acceptCnAmount);
    const maximum = returnCreditPaise(acceptCnModal.returnDoc);
    if (!Number.isFinite(amt) || amt <= 0 || maximum == null || Math.round(amt * 100) > maximum)
      return notify('Confirm a positive supplier-agreed reduction no greater than the return value. This is not a payment.');
    acceptSubmitting.current = true;
    setAcceptCnBusy(true);
    try {
      const returnId = acceptCnModal.returnDoc._id || acceptCnModal.returnDoc.id;
      const payload = {
        supplierCreditNoteNumber: acceptCnNumber.trim() || undefined,
        date: acceptCnDate || TODAY,
        acceptedCreditPaise: Math.round(amt * 100),
        allocateToBillDue: acceptCnAllocate,
      };
      const fingerprint = JSON.stringify({returnId, ...payload});
      if (acceptAttempt.current?.fingerprint !== fingerprint)
        acceptAttempt.current = {fingerprint, key: crypto.randomUUID()};
      const res = await acceptReturnCreditNoteApi(returnId, {...payload, idempotencyKey: acceptAttempt.current.key});
      if (res.success) {
        notify('Supplier credit confirmed. No cash or bank payment was made.');
        setAcceptCnModal({open: false, returnDoc: null});
        setAcceptCnNumber('');
        setAcceptCnAmount('');
        loadReturns();
        loadCredits();
        void loadPurchases();
        loadAdvances();
      } else {
        notify(res.error || 'Failed to accept return credit note.');
      }
    } finally {
      acceptSubmitting.current = false;
      setAcceptCnBusy(false);
    }
  }

  async function handleExecuteReversal(e: React.FormEvent) {
    e.preventDefault();
    if (!reversalReason.trim()) return notify('Reversal reason is required.');
    setReversalBusy(true);
    try {
      let res: any;
      if (reversalModal.type === 'payment') {
        res = await reverseSupplierPaymentApi(reversalModal.id, reversalReason.trim());
      } else if (reversalModal.type === 'return') {
        res = await reverseSupplierReturnApi(reversalModal.id, reversalReason.trim());
      }
      if (res?.success) {
        notify('Reversal executed successfully.');
        const type = reversalModal.type;
        setReversalModal({open: false, type: 'payment', id: '', title: ''});
        setReversalReason('');
        if (type === 'payment') loadPayments();
        if (type === 'return') loadReturns();
      } else {
        notify(res?.error || 'Failed to reverse.');
      }
    } finally {
      setReversalBusy(false);
    }
  }

  return (
    <div className="stack spaced">
      <div className="tabs">
        {availableTabs.map((t) => (
          <button key={t} type="button" className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'Activity timeline' && (
        <Card title="Activity timeline">
          <div className="timeline">
            {events.map((e) => (
              <div key={e.id}>
                <small>{e.date}</small>
                <strong>
                  <Link href={e.href}>{e.title}</Link>
                </strong>
                <p>{e.detail}</p>
              </div>
            ))}
            {!events.length && <p>No activity yet.</p>}
          </div>
        </Card>
      )}

      {tab === 'Overview' && (
        supplier ? (
          <Card
            title="Purchased products and payment allocation"
            actions={<Btn onClick={() => setPay(true)}>Pay selected products</Btn>}
          >
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Bill / product</th>
                    <th>Purchased</th>
                    <th>Paid</th>
                    <th>Return credits</th>
                    <th>Due</th>
                  </tr>
                </thead>
                <tbody>
                  {(isLive ? livePurchases : purchases).flatMap((b) =>
                    purchaseLineBalances(state, b).map((l) => (
                      <tr key={b.id + l.productId}>
                        <td>
                          {l.name}
                          <small>
                            <Link href={'/purchases/' + b.id}>{b.id}</Link> · {b.status}
                          </small>
                        </td>
                        <td>{money(l.total)}</td>
                        <td>{money(l.paid)}</td>
                        <td>{money(l.returned)}</td>
                        <td>{l.due ? money(l.due) : <Badge>Paid</Badge>}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        ) : (
          <div className="grid-3">
            {['New goods', 'Used goods', 'Service'].map((category) => (
              <Card
                key={category}
                title={
                  category === 'Service'
                    ? 'Service spending'
                    : category === 'Used goods'
                    ? 'Used product spending'
                    : 'New product spending'
                }
              >
                <div className="body-pad">
                  <h2>
                    {money(
                      bills
                        .filter((b) => b.category === category)
                        .reduce((n, b) => n + roundedTotal(b) - credits(state, b.id), 0)
                    )}
                  </h2>
                  <p>Net invoice value after return credits</p>
                  <small>{bills.filter((b) => b.category === category).length} invoices</small>
                </div>
              </Card>
            ))}
          </div>
        )
      )}

      {supplier && tab === 'Purchases' && (
        <Card title="Purchase history">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Purchase</th>
                  <th>Date</th>
                  <th>Bill</th>
                  <th>Receipt</th>
                  <th>Payment</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {(isLive ? livePurchases : purchases).map((p: any) => (
                  <tr key={p._id || p.id}>
                    <td><Link href={`/purchases/${p._id || p.id}`}>{p.purchaseNumber || p.id}</Link></td>
                    <td>{dateLabel(p.orderDate || p.date)}</td>
                    <td><Badge>{p.billStatus || p.status}</Badge></td>
                    <td><Badge>{p.receiptStatus || '—'}</Badge></td>
                    <td><Badge>{p.paymentStatus || '—'}</Badge></td>
                    <td>{money((p.totalPaise ?? Math.round(roundedTotal(p) * 100)) / 100)}</td>
                  </tr>
                ))}
                {!(isLive ? livePurchases : purchases).length && (
                  <tr><td colSpan={6} className="muted body-pad">No purchases found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {isLive && purchasesTotalPages > 1 && (
            <div className="table-footer" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
              <span>Page {purchasesPage} of {purchasesTotalPages} ({purchasesTotal} purchases)</span>
              <div style={{display: 'flex', gap: '0.5rem'}}>
                <Btn secondary disabled={purchasesPage <= 1} onClick={() => setPurchasesPage((p) => Math.max(1, p - 1))}>Previous</Btn>
                <Btn secondary disabled={purchasesPage >= purchasesTotalPages} onClick={() => setPurchasesPage((p) => p + 1)}>Next</Btn>
              </div>
            </div>
          )}
        </Card>
      )}

      {supplier && tab === 'Payments' && (
        <Card title="Supplier payments" actions={<Btn onClick={() => setPay(true)}>Record payment</Btn>}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Payment</th>
                  <th>Date</th>
                  <th>Method</th>
                  <th>Amount</th>
                  <th>Reversal</th>
                </tr>
              </thead>
              <tbody>
                {livePayments.map((p: any) => (
                  <tr key={p._id || p.id}>
                    <td>{p.paymentNumber || p._id}</td>
                    <td>{dateLabel(p.date)}</td>
                    <td>{(p.components || []).map((c: any) => c.method).join(', ')}</td>
                    <td>{money((p.totalAmountPaise || 0) / 100)}</td>
                    <td>
                      {p.isReversed ? (
                        <Badge>Reversed</Badge>
                      ) : p.canReverse ? (
                        <Btn
                          danger
                          style={{padding: '0.2rem 0.5rem', fontSize: '0.78rem'}}
                          onClick={() => {
                            setReversalModal({
                              open: true,
                              type: 'payment',
                              id: p._id || p.id,
                              title: `Reverse Payment ${p.paymentNumber || p._id}`,
                            });
                            setReversalReason('');
                          }}
                        >
                          Reverse
                        </Btn>
                      ) : (
                        <small className="muted">{p.reverseBlockReason || '—'}</small>
                      )}
                    </td>
                  </tr>
                ))}
                {!livePayments.length && <tr><td colSpan={5} className="muted body-pad">No supplier payments found.</td></tr>}
              </tbody>
            </table>
          </div>
          {isLive && paymentsTotalPages > 1 && (
            <div className="table-footer" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
              <span>Page {paymentsPage} of {paymentsTotalPages} ({paymentsTotal} payments)</span>
              <div style={{display: 'flex', gap: '0.5rem'}}>
                <Btn secondary disabled={paymentsPage <= 1} onClick={() => setPaymentsPage((p) => Math.max(1, p - 1))}>Previous</Btn>
                <Btn secondary disabled={paymentsPage >= paymentsTotalPages} onClick={() => setPaymentsPage((p) => p + 1)}>Next</Btn>
              </div>
            </div>
          )}
        </Card>
      )}

      {supplier && tab === 'Returns' && (
        <Card title="Supplier returns and credit status">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Return</th>
                  <th>Date</th>
                  <th>Purchase</th>
                  <th>Condition</th>
                  <th>Quantity</th>
                  <th>Credit status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {liveReturns.map((r: any) => (
                  <tr key={r._id || r.id}>
                    <td>{r.returnNumber || r._id}</td>
                    <td>{dateLabel(r.date)}</td>
                    <td><Link href={`/purchases/${r.purchaseId}`}>{r.purchaseNumber || r.purchaseId}</Link></td>
                    <td>{r.condition}</td>
                    <td>{r.quantity}</td>
                    <td><Badge>{r.creditStatus || (r.creditNoteId ? 'Accepted' : 'Awaiting credit')}</Badge></td>
                    <td>
                      <div style={{display: 'flex', gap: '0.35rem', flexWrap: 'wrap'}}>
                        {r.creditStatus !== 'Accepted' && !r.creditNoteId && !r.isReversed && (
                          <Btn
                            secondary
                            style={{padding: '0.2rem 0.5rem', fontSize: '0.78rem'}}
                            onClick={() => {
                              setAcceptCnModal({open: true, returnDoc: r});
                              setAcceptCnAmount(returnCreditPaise(r) == null ? '' : (returnCreditPaise(r) / 100).toFixed(2));
                              setAcceptCnAllocate(true);
                              setAcceptCnDate(currentBusinessDate());
                              acceptAttempt.current = null;
                              setAcceptCnNumber('');
                            }}
                          >
                            Confirm supplier credit
                          </Btn>
                        )}
                        {r.canReverse && !r.isReversed && (
                          <Btn
                            danger
                            style={{padding: '0.2rem 0.5rem', fontSize: '0.78rem'}}
                            onClick={() => {
                              setReversalModal({
                                open: true,
                                type: 'return',
                                id: r._id || r.id,
                                title: `Reverse Return ${r.returnNumber || r._id}`,
                              });
                              setReversalReason('');
                            }}
                          >
                            Reverse
                          </Btn>
                        )}
                        {r.isReversed && <Badge>Reversed</Badge>}
                      </div>
                    </td>
                  </tr>
                ))}
                {!liveReturns.length && <tr><td colSpan={7} className="muted body-pad">No supplier returns found.</td></tr>}
              </tbody>
            </table>
          </div>
          {isLive && returnsTotalPages > 1 && (
            <div className="table-footer" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
              <span>Page {returnsPage} of {returnsTotalPages} ({returnsTotal} returns)</span>
              <div style={{display: 'flex', gap: '0.5rem'}}>
                <Btn secondary disabled={returnsPage <= 1} onClick={() => setReturnsPage((p) => Math.max(1, p - 1))}>Previous</Btn>
                <Btn secondary disabled={returnsPage >= returnsTotalPages} onClick={() => setReturnsPage((p) => p + 1)}>Next</Btn>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Phase 3.5: Supplier Statement Tab */}
  {tab === 'Statement' && (
        <Card
          title={supplier ? 'Supplier ledger statement' : 'Customer account statement'}
          actions={
            <div style={{display: 'flex', gap: '0.5rem'}}>
              {(['csv', 'xlsx', 'pdf'] as const).map(format => (
                <Btn key={format} secondary onClick={() => {
                  const query = new URLSearchParams({format});
                  if (statementDateFrom) query.set(supplier ? 'dateFrom' : 'fromDate', statementDateFrom);
                  if (statementDateTo) query.set(supplier ? 'dateTo' : 'toDate', statementDateTo);
                  window.location.href = supplier
                    ? `/api/suppliers/${id}/statement/export?${query.toString()}`
                    : `/api/sales/customers/${id}/statement/export?${query.toString()}`;
                }}><Download size={14} /> {format.toUpperCase()}</Btn>
              ))}
            </div>
          }
        >
          <div className="toolbar" style={{gap: '1rem', flexWrap: 'wrap'}}>
            <Field label="Date from">
              <input
                type="date"
                value={statementDateFrom}
                onChange={(e) => {
                  setStatementDateFrom(e.target.value);
                  setStatementPage(1);
                }}
              />
            </Field>
            <Field label="Date to">
              <input
                type="date"
                max={TODAY}
                value={statementDateTo}
                onChange={(e) => {
                  setStatementDateTo(e.target.value);
                  setStatementPage(1);
                }}
              />
            </Field>
            {(statementDateFrom || statementDateTo) && (
              <button
                type="button"
                className="link-button"
                onClick={() => {
                  setStatementDateFrom('');
                  setStatementDateTo('');
                  setStatementPage(1);
                }}
              >
                Reset dates
              </button>
            )}
          </div>

          {/* Brought Forward Balance Callout */}
          <div
            style={{
              padding: '0.75rem 1rem',
              backgroundColor: 'var(--surface-sunken, #f5f5f5)',
              borderBottom: '1px solid var(--border-color, #e0e0e0)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span>
              <strong>Balance brought forward (prior to period/page):</strong>
            </span>
            <strong style={{fontSize: '1.1rem'}}>
              {money(
                (statementData?.pageOpeningBalancePaise ??
                  statementData?.balanceBeforePage ??
                  statementData?.balanceBeforePagePaise ??
                  0) / 100
              )}
            </strong>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Reference</th>
                  <th>Description</th>
                  <th>{supplier ? 'Payable / Bill (+)' : 'Debit / Invoice (+)'}</th>
                  <th>{supplier ? 'Payment / Credit (-)' : 'Credit / Receipt (-)'}</th>
                  <th>Running Balance</th>
                </tr>
              </thead>
              <tbody>
                {(statementData?.entries || []).map((e: any, idx: number) => {
                  const debitAmt = e.debitPaise !== undefined ? e.debitPaise : (e.amountPaise > 0 ? e.amountPaise : 0);
                  const creditAmt = e.creditPaise !== undefined ? e.creditPaise : (e.amountPaise < 0 ? Math.abs(e.amountPaise) : 0);
                  const isDebit = debitAmt > 0;
                  const isCredit = creditAmt > 0;
                  return (
                    <tr key={idx}>
                      <td>{dateLabel(e.date)}</td>
                      <td><Badge>{e.type}</Badge></td>
                      <td>
                        {e.reference?.startsWith('PUR') ? (
                          <Link href={'/purchases/' + e.reference}>{e.reference}</Link>
                        ) : e.reference?.startsWith('INV') ? (
                          <Link href={'/sales/' + (e.invoiceId || e.reference)}>{e.reference}</Link>
                        ) : (
                          e.reference
                        )}
                      </td>
                      <td>{e.description || '—'}</td>
                      <td className={isDebit ? 'positive' : ''}>
                        {isDebit ? money(debitAmt / 100) : '—'}
                      </td>
                      <td className={isCredit ? 'error' : ''}>
                        {isCredit ? money(creditAmt / 100) : '—'}
                      </td>
                      <td>
                        <strong>{money((e.runningBalancePaise ?? e.balanceAfterPaise ?? 0) / 100)}</strong>
                      </td>
                    </tr>
                  );
                })}
                {!(statementData?.entries || []).length && (
                  <tr>
                    <td colSpan={7} className="muted body-pad">
                      {statementLoading ? 'Loading statement...' : 'No ledger activity in this period.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {statementData && statementData.totalPages > 1 && (
            <div className="table-footer" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
              <span>Page {statementData.page} of {statementData.totalPages} ({statementData.total} entries)</span>
              <div style={{display: 'flex', gap: '0.5rem'}}>
                <Btn
                  secondary
                  disabled={statementData.page <= 1}
                  onClick={() => setStatementPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Btn>
                <Btn
                  secondary
                  disabled={statementData.page >= statementData.totalPages}
                  onClick={() => setStatementPage((p) => p + 1)}
                >
                  Next
                </Btn>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Phase 3.5: Advances Tab */}
      {tab === 'Advances & credits' && (
        <Card
          title="Supplier advances and prepayments"
          actions={<Btn onClick={() => setCreditNoteModal(true)}>Record credit note</Btn>}
        >
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Advance ID</th>
                  <th>Date</th>
                  <th>Total Advance</th>
                  <th>Consumed</th>
                  <th>Available</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {advancesData.map((adv: any) => {
                  const availablePaise = adv.remainingAmountPaise ?? Math.max(0, (adv.originalAmountPaise || 0) - (adv.allocatedPaise || 0) - (adv.refundedPaise || 0));
                  return (
                    <tr key={adv._id || adv.id || adv.advanceNumber}>
                      <td><strong>{adv.advanceNumber || adv._id || adv.id}</strong></td>
                      <td>{dateLabel(adv.date)}</td>
                      <td>{money((adv.originalAmountPaise || 0) / 100)}</td>
                      <td>{money(((adv.allocatedPaise || 0) + (adv.refundedPaise || 0)) / 100)}</td>
                      <td>
                        <strong className={availablePaise > 0 ? 'positive' : ''}>
                          {money(availablePaise / 100)}
                        </strong>
                      </td>
                      <td>
                        <Badge>{adv.status || (availablePaise <= 0 ? 'Consumed' : (adv.allocatedPaise || adv.refundedPaise) ? 'PartlyConsumed' : 'Open')}</Badge>
                      </td>
                      <td>
                        {availablePaise > 0 && (
                          <div style={{display: 'flex', gap: '0.4rem', flexWrap: 'wrap'}}>
                            <Btn
                              secondary
                              onClick={() => {
                                setAllocateModal({open: true, advance: adv});
                                setAllocateAmount((availablePaise / 100).toFixed(2));
                                setAllocateTargetBill('');
                              }}
                            >
                              Allocate to bill
                            </Btn>
                            <Btn
                              secondary
                              onClick={() => {
                                setRefundModal({open: true, advance: adv});
                                setRefundAmount((availablePaise / 100).toFixed(2));
                                setRefundRef('');
                              }}
                            >
                              Refund into Cash/Bank
                            </Btn>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {!advancesData.length && (
                  <tr>
                    <td colSpan={7} className="muted body-pad">
                      {advancesLoading ? 'Loading advances...' : 'No advance payments recorded for this supplier.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {!!liveCredits.length && (
            <div className="table-wrap" style={{marginTop: '1.5rem', borderTop: '1px solid var(--border-color, #e0e0e0)'}}>
              <div className="body-pad" style={{paddingBottom: '0.25rem'}}>
                <strong>Supplier credit notes</strong>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>Credit note</th>
                    <th>Date</th>
                    <th>Reason</th>
                    <th>Amount</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {liveCredits.map((cn: any) => (
                    <tr key={cn._id || cn.id}>
                      <td><strong>{cn.creditNoteNumber || cn.supplierCreditNoteNumber || cn._id}</strong></td>
                      <td>{dateLabel(cn.date)}</td>
                      <td>{cn.reason || 'Standalone'}</td>
                      <td>{money((cn.amountPaise || 0) / 100)}</td>
                      <td><Badge>{cn.isReversed ? 'Reversed' : 'Active'}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* Phase 3.5: Unpaid Payables Tab */}
      {tab === 'Payables' && (
        <Card
          title="Outstanding posted bills"
          actions={<Btn onClick={() => setPay(true)}>Pay bills</Btn>}
        >
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Purchase ID</th>
                  <th>Supplier Inv Ref</th>
                  <th>Bill Date</th>
                  <th>Due Date</th>
                  <th>Total Amount</th>
                  <th>Unpaid Balance</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {(payablesData?.records || payablesData?.payables || []).map((bill: any) => (
                  <tr key={bill._id || bill.id}>
                    <td>
                      {bill.purchaseId ? <Link href={'/purchases/' + bill.purchaseId}>{bill.purchaseNumber || bill.purchaseId}</Link> : 'Opening balance'}
                    </td>
                    <td>{bill.supplierInvoiceNumber || bill.reference || '—'}<small>{bill.description || ''}</small></td>
                    <td>{dateLabel(bill.date)}</td>
                    <td>—</td>
                    <td>{money((bill.originalAmountPaise || 0) / 100)}</td>
                    <td>
                      <strong style={{color: 'var(--error, #e53935)'}}>
                        {money((bill.remainingDuePaise || 0) / 100)}
                      </strong>
                    </td>
                    <td>
                      {bill.purchaseId ? <Link className="btn secondary" href={'/purchases/' + bill.purchaseId}>View bill</Link> : <Badge>Opening</Badge>}
                    </td>
                  </tr>
                ))}
                {!(payablesData?.payables || []).length && (
                  <tr>
                    <td colSpan={7} className="muted body-pad">
                      {payablesLoading ? 'Loading payables...' : 'All posted bills for this supplier are fully settled!'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Allocate Advance Modal */}
      {allocateModal.open && allocateModal.advance && (
        <Modal
          title={`Allocate Advance ${allocateModal.advance.advanceNumber || allocateModal.advance.id}`}
          onClose={() => setAllocateModal({open: false, advance: null})}
        >
          <form onSubmit={handleAllocateAdvance}>
            <div className="form-body stack">
              <p className="notice">
                Consume available advance balance to pay an outstanding posted supplier bill.
              </p>
              <Field label="Target purchase bill *">
                <select
                  required
                  value={allocateTargetBill}
                  onChange={(e) => setAllocateTargetBill(e.target.value)}
                >
                  <option value="">Select an unpaid purchase bill</option>
                  {(payablesData?.records || payablesData?.payables || [])
                    .filter((p: any) => p.remainingDuePaise > 0)
                    .map((p: any) => (
                      <option key={p.id} value={p.id}>
                        {p.purchaseNumber || 'Opening balance'} · {p.description || p.reference || ''} · Due: {money(p.remainingDuePaise / 100)}
                      </option>
                    ))}
                </select>
              </Field>
              <Field
                label="Allocation amount *"
                hint={`Max advance available: ${money(
                  (allocateModal.advance.remainingAmountPaise || 0) / 100
                )}`}
              >
                <input
                  required
                  type="number"
                  min="0.01"
                  step="0.01"
                  max={
                    (allocateModal.advance.remainingAmountPaise || 0) / 100
                  }
                  value={allocateAmount}
                  onChange={(e) => setAllocateAmount(e.target.value)}
                />
              </Field>
            </div>
            <div className="form-actions">
              <Btn secondary onClick={() => setAllocateModal({open: false, advance: null})}>
                Cancel
              </Btn>
              <Btn type="submit" disabled={allocateBusy}>
                {allocateBusy ? 'Allocating…' : 'Confirm allocation'}
              </Btn>
            </div>
          </form>
        </Modal>
      )}

      {/* Supplier Refund Modal */}
      {refundModal.open && refundModal.advance && (
        <Modal
          title={`Supplier Refund — Advance ${refundModal.advance.advanceNumber || refundModal.advance.id}`}
          onClose={() => setRefundModal({open: false, advance: null})}
        >
          <form onSubmit={handleRecordRefund}>
            <div className="form-body stack">
              <p className="notice">
                Record refund of advance money received back from supplier into Cash or Bank.
              </p>
              <Field label="Deposit into account *">
                <select
                  required
                  value={refundAccount}
                  onChange={(e) => setRefundAccount(e.target.value as 'Cash' | 'Bank')}
                >
                  <option value="Bank">Bank Account</option>
                  <option value="Cash">Cash Desk</option>
                </select>
              </Field>
              <Field
                label="Refund amount *"
                hint={`Max advance available: ${money(
                  (refundModal.advance.remainingAmountPaise || 0) / 100
                )}`}
              >
                <input
                  required
                  type="number"
                  min="0.01"
                  step="0.01"
                  max={(refundModal.advance.remainingAmountPaise || 0) / 100}
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(e.target.value)}
                />
              </Field>
              <Field label="Refund date *">
                <input
                  required
                  type="date"
                  value={refundDate}
                  onChange={(e) => setRefundDate(e.target.value)}
                />
              </Field>
              <Field label="Bank reference / notes">
                <input
                  placeholder="e.g. UTR / IMPS ref or cheque number"
                  value={refundRef}
                  onChange={(e) => setRefundRef(e.target.value)}
                />
              </Field>
            </div>
            <div className="form-actions">
              <Btn secondary onClick={() => setRefundModal({open: false, advance: null})}>
                Cancel
              </Btn>
              <Btn type="submit" disabled={refundBusy}>
                {refundBusy ? 'Recording…' : 'Confirm refund into Cash/Bank'}
              </Btn>
            </div>
          </form>
        </Modal>
      )}

      {/* Standalone Credit Note Modal */}
      {creditNoteModal && (
        <Modal
          title="Record Supplier Credit Note"
          onClose={() => setCreditNoteModal(false)}
        >
          <form onSubmit={handleCreateCreditNote}>
            <div className="form-body stack">
              <p className="notice">
                Issue a financial credit note from the supplier (rate difference, discount, rebate, settlement).
              </p>
              <Field label="Reason *">
                <select
                  required
                  value={cnReason}
                  onChange={(e) => setCnReason(e.target.value)}
                >
                  <option value="RateDifference">Rate difference</option>
                  <option value="DiscountPostInvoice">Post-invoice discount</option>
                  <option value="DefectiveGoodsSettlement">Defective goods settlement</option>
                  <option value="Rebate">Volume rebate</option>
                  <option value="Other">Other reason</option>
                </select>
              </Field>
              <Field label="Supplier credit note number (optional)">
                <input
                  placeholder="e.g. SCN-2026-001"
                  value={cnNumber}
                  onChange={(e) => setCnNumber(e.target.value)}
                />
              </Field>
              <Field label="Description *">
                <input
                  required
                  placeholder="e.g. Rate difference credit on motherboard"
                  value={cnDescription}
                  onChange={(e) => setCnDescription(e.target.value)}
                />
              </Field>
              <Field label="Credit amount (₹) *">
                <input
                  required
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={cnAmount}
                  onChange={(e) => setCnAmount(e.target.value)}
                />
              </Field>
              <Field label="GST Rate (%)">
                <select
                  value={cnGstRate}
                  onChange={(e) => setCnGstRate(e.target.value)}
                >
                  <option value="0">0%</option>
                  <option value="5">5%</option>
                  <option value="12">12%</option>
                  <option value="18">18%</option>
                  <option value="28">28%</option>
                </select>
              </Field>
              <Field label="Credit date *">
                <input
                  required
                  type="date"
                  value={cnDate}
                  onChange={(e) => setCnDate(e.target.value)}
                />
              </Field>
              <label style={{display: 'flex', gap: '0.5rem', alignItems: 'center', cursor: 'pointer', marginTop: '0.25rem'}}>
                <input
                  type="checkbox"
                  checked={cnAllocate}
                  onChange={(e) => setCnAllocate(e.target.checked)}
                />
                <span>Automatically allocate toward oldest unpaid bill</span>
              </label>
            </div>
            <div className="form-actions">
              <Btn secondary onClick={() => setCreditNoteModal(false)}>
                Cancel
              </Btn>
              <Btn type="submit" disabled={cnBusy}>
                {cnBusy ? 'Recording…' : 'Issue credit note'}
              </Btn>
            </div>
          </form>
        </Modal>
      )}

      {/* Accept Return Credit Note Modal */}
      {acceptCnModal.open && acceptCnModal.returnDoc && (
        <Modal
          title={`Confirm supplier credit · ${acceptCnModal.returnDoc.returnNumber || acceptCnModal.returnDoc._id}`}
          onClose={() => { if (!acceptCnBusy) setAcceptCnModal({open: false, returnDoc: null}); }}
        >
          <form onSubmit={handleAcceptReturnCreditNote}>
            <div className="form-body stack">
              <p className="notice">
                No payment is made here. Confirm how much the supplier agrees to deduct for the returned goods. The suggested amount comes from the original purchase, including its discount and tax. If credit exceeds the amount still owed on this line, the excess becomes supplier credit; it is not a cash refund.
              </p>
              <Field label="Supplier credit note number (optional)">
                <input
                  placeholder="e.g. SCN-RETURN-042"
                  value={acceptCnNumber}
                  onChange={(e) => setAcceptCnNumber(e.target.value)}
                />
              </Field>
              <Field label="Supplier-agreed bill reduction (₹) *" hint="Keep the suggested return value unless the supplier agrees a smaller amount. Do not enter money paid.">
                <input
                  required
                  type="number"
                  min="0.01"
                  step="0.01"
                  max={returnCreditPaise(acceptCnModal.returnDoc) == null ? undefined : returnCreditPaise(acceptCnModal.returnDoc) / 100}
                  disabled={acceptCnBusy}
                  value={acceptCnAmount}
                  onChange={(e) => setAcceptCnAmount(e.target.value)}
                />
              </Field>
              <Field label="Credit note date *">
                <input
                  required
                  type="date"
                  value={acceptCnDate}
                  onChange={(e) => setAcceptCnDate(e.target.value)}
                />
              </Field>
              <label style={{display: 'flex', gap: '0.5rem', alignItems: 'center', cursor: 'pointer', marginTop: '0.25rem'}}>
                <input
                  type="checkbox"
                  checked={acceptCnAllocate}
                  onChange={(e) => setAcceptCnAllocate(e.target.checked)}
                />
                <span>Reduce the original purchase-line due (recommended). Uncheck only to keep all of this amount as supplier credit for later use.</span>
              </label>
            </div>
            <div className="form-actions">
              <Btn secondary onClick={() => setAcceptCnModal({open: false, returnDoc: null})}>
                Cancel
              </Btn>
              <Btn type="submit" disabled={acceptCnBusy}>
                {acceptCnBusy ? 'Confirming…' : 'Confirm credit — no payment'}
              </Btn>
            </div>
          </form>
        </Modal>
      )}

      {/* Supplier Reversal Modal */}
      {reversalModal.open && (
        <Modal
          title={reversalModal.title}
          onClose={() => setReversalModal((m) => ({...m, open: false}))}
        >
          <form onSubmit={handleExecuteReversal}>
            <div className="form-body stack">
              <p className="notice">
                Reversing this record undoes stock and accounting changes and writes an audit event. A reason is required.
              </p>
              <Field label="Reversal reason *">
                <input
                  required
                  autoFocus
                  placeholder="e.g. Incorrect bank account selected, duplicated entry"
                  value={reversalReason}
                  onChange={(e) => setReversalReason(e.target.value)}
                />
              </Field>
            </div>
            <div className="form-actions">
              <Btn secondary onClick={() => setReversalModal((m) => ({...m, open: false}))}>
                Cancel
              </Btn>
              <Btn danger type="submit" disabled={reversalBusy}>
                {reversalBusy ? 'Reversing…' : 'Confirm reversal'}
              </Btn>
            </div>
          </form>
        </Modal>
      )}

      {pay && <SupplierSettlement supplierId={id} onClose={() => setPay(false)} />}
    </div>
  );
}
