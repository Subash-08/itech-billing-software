'use client';

import {useState, useEffect} from 'react';
import Link from 'next/link';
import {useSearchParams} from 'next/navigation';
import {Plus, RotateCcw} from 'lucide-react';
import {ReturnRecord, TODAY, uid, money, roundedTotal, balance, paid, credits} from '@/lib/domain';
import {processReturn, addPayment} from '@/lib/operations';
import {useStore} from './store';
import {PageHead, Card, Btn, Modal, Field, Badge, Empty, SearchBox, csvDownload} from './ui';

export default function Returns() {
  const {
    state,
    run,
    notify,
    isLive,
    recordSupplierReturnApi,
    reverseSupplierReturnApi,
    recordCustomerReturnApi,
    fetchInvoiceDetailApi,
  } = useStore();
  const params = useSearchParams();
  const ref = params.get('reference') || '';

  const [form, setForm] = useState<any>(
    ref ? fresh(ref.startsWith('PUR') ? 'Supplier' : 'Customer', ref) : null
  );
  const [refund, setRefund] = useState(0);
  const [account, setAccount] = useState('Cash');
  const [q, setQ] = useState('');
  const [type, setType] = useState('All');
  const [settle, setSettle] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Live invoice details for Customer returns
  const [liveInvoiceDetail, setLiveInvoiceDetail] = useState<any>(null);
  const [liveLoading, setLiveLoading] = useState(false);

  // Reversal Modal State
  const [reversalModal, setReversalModal] = useState<{open: boolean; id: string; ref: string}>({
    open: false,
    id: '',
    ref: '',
  });
  const [reversalReason, setReversalReason] = useState('');
  const [reversalBusy, setReversalBusy] = useState(false);

  function fresh(returnType: 'Customer' | 'Supplier', reference = '') {
    return {
      id: uid(returnType === 'Customer' ? 'CN' : 'SRET'),
      type: returnType,
      reference,
      date: TODAY,
      invoiceLineId: '',
      productId: '',
      qty: 1,
      serials: [] as string[],
      amount: 0,
      reason: '',
      disposition: returnType === 'Supplier' ? 'Return to supplier' : 'RestockSellable',
      settlement: 'CustomerCredit' as 'CustomerCredit' | 'RefundNow',
      refundAccount: 'Cash' as 'Cash' | 'Bank',
      refundMethod: 'Cash' as 'Cash' | 'UPI' | 'BankTransfer',
      refundReference: '',
      status: 'Completed',
      idempotencyKey: uid('IDEM'),
    };
  }

  // Load detailed invoice when reference changes in live Customer return
  useEffect(() => {
    if (form && form.type === 'Customer' && form.reference && isLive) {
      setLiveLoading(true);
      fetchInvoiceDetailApi(form.reference)
        .then((data: any) => {
          if (data && data.invoice) {
            setLiveInvoiceDetail(data.invoice);
          }
        })
        .catch((err: any) => {
          notify(err?.message || 'Failed to load invoice lines.');
        })
        .finally(() => setLiveLoading(false));
    } else {
      setLiveInvoiceDetail(null);
    }
  }, [form?.reference, form?.type, isLive]);

  const original = form
    ? form.type === 'Customer'
      ? state.bills.find((b) => b.id === form.reference)
      : state.purchases.find((b) => b.id === form.reference)
    : undefined;

  const line = original?.lines.find((l) => l.productId === form?.productId);
  const list = state.returns.filter(
    (r) =>
      (r.id + r.reference + r.reason).toLowerCase().includes(q.toLowerCase()) &&
      (type === 'All' || r.type === type)
  );

  // Computed customer return lines from authoritative source
  const customerLines = (
    liveInvoiceDetail?.lines ||
    (original as any)?.lines ||
    []
  ).map((l: any) => {
    const lineId = l.lineId || l.clientLineKey || l._id || l.id || l.productId;
    const name = l.description || l.productSnapshot?.name || l.name || 'Item';
    const lineType = l.lineType || (l.productId ? 'Product' : 'Service');
    const totalQty = l.quantity ?? l.qty ?? 1;
    const returnedQty = l.returnedQuantity ?? 0;
    const returnable = Math.max(0, totalQty - returnedQty);
    const isTracked = !!(l.productSnapshot?.isSerialTracked || (l.serials && l.serials.length > 0));
    const rawSerials = l.stockAllocations
      ? l.stockAllocations.flatMap((a: any) => a.serials)
      : l.serials || [];
    const lineTotalPaise = l.totalPaise ?? (roundedTotal({lines: [{...l, qty: 1}], inclusive: !!original?.inclusive}) * 100);
    const unitRate = totalQty > 0 ? lineTotalPaise / 100 / totalQty : lineTotalPaise / 100;

    return {
      lineId,
      productId: l.productId,
      name,
      lineType,
      totalQty,
      returnedQty,
      returnable,
      isTracked,
      serials: rawSerials,
      unitRate,
    };
  });

  const selectedCustomerLine = customerLines.find((l: any) => l.lineId === form?.invoiceLineId);
  const unpaidDue = liveInvoiceDetail
    ? (liveInvoiceDetail.duePaise ?? 0) / 100
    : original
    ? balance(state, original)
    : 0;
  const returnTotalAmount = form?.amount || 0;
  const creditToDue = Math.min(returnTotalAmount, unpaidDue);
  const eligibleSurplusPaise = Math.max(0, Math.round((returnTotalAmount - creditToDue) * 100));
  const eligibleSurplus = eligibleSurplusPaise / 100;
  const maxRefundAllowed = eligibleSurplus;

  function selectCustomerLine(lineId: string) {
    const found = customerLines.find((l: any) => l.lineId === lineId);
    if (!found || !form) return;
    const qty = 1;
    const amount = Math.round(found.unitRate * qty * 100) / 100;
    setForm({
      ...form,
      invoiceLineId: lineId,
      productId: found.productId,
      qty,
      amount,
      disposition: found.lineType !== 'Product' ? 'NoStock' : 'RestockSellable',
      serials: [],
    });
    setRefund(0);
  }

  function updateCustomerQty(qty: number) {
    if (!selectedCustomerLine || !form) return;
    const validQty = Math.min(selectedCustomerLine.returnable, Math.max(1, qty));
    const amount = Math.round(selectedCustomerLine.unitRate * validQty * 100) / 100;
    setForm({
      ...form,
      qty: validQty,
      amount,
      serials: form.serials.slice(0, validQty),
    });
    setRefund(0);
  }

  function updateSupplierLine(productId: string, qty: number) {
    if (!form || !original) return;
    const l = original.lines.find((l) => l.productId === productId);
    setForm({
      ...form,
      productId,
      qty,
      serials: [],
      amount: l ? roundedTotal({lines: [{...l, qty}], inclusive: original.inclusive}) : 0,
    });
    setRefund(0);
  }

  async function handleExecuteReturn(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;

    if (form.type === 'Customer') {
      if (isLive) {
        if (!form.reference || !form.invoiceLineId || form.qty <= 0) {
          notify('Select an invoice, line, and valid return quantity.');
          return;
        }
        if (selectedCustomerLine?.isTracked && form.serials.length !== form.qty) {
          notify(`Select exactly ${form.qty} serial number(s) for this return.`);
          return;
        }
        setBusy(true);
        try {
          const isProduct = selectedCustomerLine?.lineType === 'Product';
          const stockDisposition = !isProduct
            ? 'NoStock'
            : (form.disposition === 'Quarantine' || form.disposition === 'Defective')
              ? 'Quarantine'
              : 'RestockSellable';

          const settlementMode = (eligibleSurplus > 0 && form.settlement === 'RefundNow') ? 'RefundNow' : 'CustomerCredit';

          const refundComponents = settlementMode === 'RefundNow'
            ? [
                {
                  account: form.refundAccount as 'Cash' | 'Bank',
                  method: form.refundAccount === 'Cash' ? 'Cash' : (form.refundMethod as 'UPI' | 'BankTransfer'),
                  amountPaise: eligibleSurplusPaise,
                  reference: form.refundReference?.trim() || '',
                },
              ]
            : [];

          const payload = {
            invoiceId: form.reference,
            invoiceLineId: form.invoiceLineId,
            quantity: form.qty,
            serials: form.serials || [],
            date: form.date || TODAY,
            reason: form.reason.trim(),
            stockDisposition,
            settlement: settlementMode,
            refundComponents,
            idempotencyKey: form.idempotencyKey,
          };

          const res = await recordCustomerReturnApi(payload);
          if (res.success) {
            notify('Customer return recorded successfully.');
            setForm(null);
            setRefund(0);
          } else {
            notify(res.error || 'Failed to record customer return.');
          }
        } finally {
          setBusy(false);
        }
        return;
      }

      if (
        run(
          (s) => processReturn(s, form, refund, account),
          'Return recorded. Stock and balances updated. Profit is flagged for review.'
        )
      ) {
        setForm(null);
        setRefund(0);
      }
      return;
    }

    if (isLive) {
      setBusy(true);
      try {
        const res = await recordSupplierReturnApi({
          purchaseId: form.reference,
          date: form.date,
          reason: form.reason,
          stockCondition: form.disposition === 'Return to supplier' ? 'sellable' : 'defective',
          lines: [
            {
              productId: form.productId,
              quantity: form.qty,
              serials: form.serials.length ? form.serials : undefined,
            },
          ],
          idempotencyKey: form.idempotencyKey,
        });
        if (res.success) {
          notify('Supplier return recorded successfully.');
          setForm(null);
          setRefund(0);
        } else {
          notify(res.error || 'Failed to record supplier return.');
        }
      } finally {
        setBusy(false);
      }
      return;
    }

    if (
      run(
        (s) => processReturn(s, form, refund, account),
        'Return recorded. Stock and balances updated. Profit is flagged for review.'
      )
    ) {
      setForm(null);
      setRefund(0);
    }
  }

  async function handleExecuteReversal(e: React.FormEvent) {
    e.preventDefault();
    if (!reversalReason.trim()) return notify('Reason for reversal is required.');
    setReversalBusy(true);
    try {
      const res = await reverseSupplierReturnApi(reversalModal.id, reversalReason.trim());
      if (res.success) {
        notify('Supplier return reversed.');
        setReversalModal({open: false, id: '', ref: ''});
        setReversalReason('');
      } else {
        notify(res.error || 'Failed to reverse supplier return.');
      }
    } finally {
      setReversalBusy(false);
    }
  }

  return (
    <>
      <PageHead
        title="Returns & refunds"
        description="Manage customer returns and supplier returns with live stock restoration and settlement."
        actions={
          <>
            <Btn onClick={() => setForm(fresh('Supplier'))}>
              <Plus size={16} /> Supplier return
            </Btn>
            <Btn secondary onClick={() => setForm(fresh('Customer'))}>
              <RotateCcw size={16} /> Customer return
            </Btn>
          </>
        }
      />

      <Card>
        <div className="toolbar">
          <SearchBox value={q} onChange={setQ} placeholder="Search return or original document…" />
          <select aria-label="Return type" value={type} onChange={(e) => setType(e.target.value)}>
            <option>All</option>
            <option>Supplier</option>
            <option>Customer</option>
          </select>
        </div>

        {list.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Adjustment</th>
                  <th>Original bill</th>
                  <th>Product / quantity</th>
                  <th>Reason</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.map((r: any) => (
                  <tr key={r.id || r._id}>
                    <td>
                      {r.id || r._id}
                      <small>
                        {r.type} · {r.date}
                      </small>
                    </td>
                    <td>
                      <Link
                        className="record-link"
                        href={`${r.type === 'Customer' ? '/sales' : '/purchases'}/${r.reference || r.invoiceId || r.purchaseId}`}
                      >
                        {r.reference || r.invoiceNumber || r.invoiceId || r.purchaseId}
                      </Link>
                    </td>
                    <td>
                      {state.products.find((p) => p.id === r.productId)?.name || r.productName || r.productId}
                      <small>
                        {r.qty || r.quantity} unit(s) · {r.disposition || (r.stockCondition === 'sellable' ? 'Restock' : 'Defective')}
                      </small>
                    </td>
                    <td className="wrap-cell">{r.reason}</td>
                    <td>{money(r.amount ?? (r.creditedAmountPaise ? r.creditedAmountPaise / 100 : 0))}</td>
                    <td>
                      <Badge>{r.isReversed ? 'Reversed' : r.status}</Badge>
                    </td>
                    <td>
                      <div className="actions">
                        {r.type === 'Supplier' && !r.isReversed && (
                          <button
                            type="button"
                            className="link-button"
                            onClick={() =>
                              setReversalModal({
                                open: true,
                                id: r.id || r._id,
                                ref: r.reference,
                              })
                            }
                          >
                            <RotateCcw size={13} style={{verticalAlign: 'middle', marginRight: '2px'}} /> Reverse return
                          </button>
                        )}
                        {r.status === 'Refund pending' && (
                          <button className="link-button" type="button" onClick={() => setSettle(r.reference)}>
                            Settle refund
                          </button>
                        )}
                        <button
                          className="link-button"
                          type="button"
                          onClick={() =>
                            csvDownload((r.id || r._id) + '.csv', [
                              ['Adjustment', 'Original bill', 'Date', 'Type', 'Product', 'Quantity', 'Amount', 'Reason'],
                              [r.id || r._id, r.reference, r.date, r.type, r.productId, r.qty, r.amount, r.reason],
                            ])
                          }
                        >
                          Export note
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="No returns recorded"
            text="Start with an original invoice or purchase. Select the item, quantity and disposition."
            action={
              <div style={{display: 'flex', gap: '8px'}}>
                <Btn secondary onClick={() => setForm(fresh('Customer'))}>Record customer return</Btn>
                <Btn secondary onClick={() => setForm(fresh('Supplier'))}>Record supplier return</Btn>
              </div>
            }
          />
        )}
      </Card>

      {/* Return Creation Modal */}
      {form && (
        <Modal
          title={
            form.type === 'Customer'
              ? 'Customer return and credit adjustment'
              : 'Return stock to supplier'
          }
          onClose={() => setForm(null)}
          wide
        >
          <form onSubmit={handleExecuteReturn}>
            <div className="form-body stack">
              <div className="form-grid">
                <Field label="Original document *">
                  <select
                    required
                    value={form.reference}
                    onChange={(e) => {
                      setForm({
                        ...form,
                        reference: e.target.value,
                        invoiceLineId: '',
                        productId: '',
                        amount: 0,
                        serials: [],
                      });
                      setRefund(0);
                    }}
                  >
                    <option value="">Select original bill</option>
                    {(form.type === 'Customer'
                      ? state.bills.filter((b) => b.kind === 'Sale' && b.status === 'Issued')
                      : state.purchases.filter(
                          (p) =>
                            p.status === 'Received' ||
                            p.receiptStatus === 'Received' ||
                            p.receiptStatus === 'PartlyReceived'
                        )
                    ).map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.id} · {money(roundedTotal(b))}
                      </option>
                    ))}
                  </select>
                </Field>

                {form.type === 'Customer' ? (
                  <Field label="Invoice Line *">
                    <select
                      required
                      disabled={liveLoading || !customerLines.length}
                      value={form.invoiceLineId}
                      onChange={(e) => selectCustomerLine(e.target.value)}
                    >
                      <option value="">{liveLoading ? 'Loading lines…' : 'Select invoice line'}</option>
                      {customerLines.map((l: any) => (
                        <option
                          key={l.lineId}
                          value={l.lineId}
                          disabled={l.returnable <= 0}
                        >
                          {l.name} · Line {l.lineId} ({l.returnable} of {l.totalQty} returnable)
                        </option>
                      ))}
                    </select>
                  </Field>
                ) : (
                  <Field label="Product *">
                    <select
                      required
                      value={form.productId}
                      onChange={(e) => updateSupplierLine(e.target.value, 1)}
                    >
                      <option value="">Select item</option>
                      {original?.lines
                        .filter((l) => l.productId)
                        .map((l) => (
                          <option key={l.productId} value={l.productId}>
                            {l.name} · {l.qty} purchased
                          </option>
                        ))}
                    </select>
                  </Field>
                )}

                <Field label="Quantity to return *">
                  <input
                    type="number"
                    min="1"
                    max={form.type === 'Customer' ? (selectedCustomerLine?.returnable || 1) : 999}
                    required
                    value={form.qty}
                    onChange={(e) => {
                      const val = +e.target.value;
                      if (form.type === 'Customer') {
                        updateCustomerQty(val);
                      } else {
                        updateSupplierLine(form.productId, val);
                      }
                    }}
                  />
                </Field>

                <Field label="Adjustment amount (INR) *">
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    required
                    readOnly={form.type === 'Customer'}
                    value={form.amount}
                    onChange={(e) => setForm({...form, amount: +e.target.value})}
                  />
                </Field>

                <Field label="Stock condition / disposition">
                  {form.type === 'Customer' ? (
                    selectedCustomerLine?.lineType !== 'Product' ? (
                      <input
                        readOnly
                        value="No stock adjustment (Service / charge line)"
                      />
                    ) : (
                      <select
                        value={form.disposition}
                        onChange={(e) => setForm({...form, disposition: e.target.value})}
                      >
                        <option value="RestockSellable">Restock (Sellable stock)</option>
                        <option value="Quarantine">Defective return (Quarantine)</option>
                      </select>
                    )
                  ) : (
                    <select
                      value={form.disposition}
                      onChange={(e) => setForm({...form, disposition: e.target.value})}
                    >
                      <option value="Return to supplier">Return to supplier</option>
                      <option value="Defective return">Defective return</option>
                    </select>
                  )}
                </Field>

                <Field label="Reason *">
                  <input
                    required
                    value={form.reason}
                    onChange={(e) => setForm({...form, reason: e.target.value})}
                    placeholder="Defective item, wrong model, customer cancelled…"
                  />
                </Field>
              </div>

              {/* Serial selection if serialized */}
              {form.type === 'Customer' && selectedCustomerLine?.isTracked && (
                <Field label={`Select serial number(s) (${form.serials.length} of ${form.qty} selected) *`}>
                  <div className="serial-list">
                    {selectedCustomerLine.serials.map((n: string) => (
                      <label key={n}>
                        <input
                          type="checkbox"
                          checked={form.serials.includes(n)}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              serials: e.target.checked
                                ? [...form.serials, n]
                                : form.serials.filter((x: string) => x !== n),
                            })
                          }
                        />
                        {n}
                      </label>
                    ))}
                  </div>
                </Field>
              )}

              {form.type === 'Supplier' && line && line.serials && line.serials.length > 0 && (
                <Field label="Original serial numbers">
                  <div className="serial-list">
                    {line.serials.map((n) => (
                      <label key={n}>
                        <input
                          type="checkbox"
                          checked={form.serials.includes(n)}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              serials: e.target.checked
                                ? [...form.serials, n]
                                : form.serials.filter((x: string) => x !== n),
                            })
                          }
                        />
                        {n}
                      </label>
                    ))}
                  </div>
                </Field>
              )}

              {/* Settlement Equation Notice */}
              {form.type === 'Customer' && form.reference && (
                <div className="notice" style={{lineHeight: 1.6}}>
                  <strong>Settlement policy (Due-first):</strong>
                  <br />
                  • Total return credit: <strong>{money(returnTotalAmount)}</strong>
                  <br />
                  • Applied to offset unpaid invoice due: <strong>{money(creditToDue)}</strong> (Original unpaid due: {money(unpaidDue)})
                  <br />
                  {eligibleSurplus > 0 ? (
                    <span>
                      • Eligible surplus paid by customer: <strong style={{color: 'var(--success, #16a34a)'}}>{money(eligibleSurplus)}</strong>
                    </span>
                  ) : (
                    <span>
                      • Entire return credit offsets unpaid due. Remaining invoice due after return: <strong>{money(Math.max(0, unpaidDue - returnTotalAmount))}</strong>
                    </span>
                  )}
                </div>
              )}

              {/* Settlement Option for Surplus Paid Amount */}
              {form.type === 'Customer' && (
                eligibleSurplus > 0 ? (
                  <div className="stack-sm">
                    <Field label="Surplus Settlement Option *">
                      <select
                        value={form.settlement}
                        onChange={(e) => setForm({...form, settlement: e.target.value as any})}
                      >
                        <option value="CustomerCredit">Customer credit (Hold {money(eligibleSurplus)} as advance credit note)</option>
                        <option value="RefundNow">Refund now (Disburse {money(eligibleSurplus)} immediately)</option>
                      </select>
                    </Field>

                    {form.settlement === 'RefundNow' && (
                      <div className="form-grid">
                        <Field label="Refund Account *">
                          <select
                            value={form.refundAccount}
                            onChange={(e) => {
                              const acc = e.target.value as 'Cash' | 'Bank';
                              setForm({
                                ...form,
                                refundAccount: acc,
                                refundMethod: acc === 'Cash' ? 'Cash' : 'BankTransfer',
                              });
                            }}
                          >
                            <option value="Cash">Cash in hand</option>
                            <option value="Bank">Bank account</option>
                          </select>
                        </Field>

                        {form.refundAccount === 'Bank' && (
                          <Field label="Payment Method *">
                            <select
                              value={form.refundMethod}
                              onChange={(e) => setForm({...form, refundMethod: e.target.value as any})}
                            >
                              <option value="BankTransfer">Bank transfer / NEFT / IMPS</option>
                              <option value="UPI">UPI</option>
                            </select>
                          </Field>
                        )}

                        <Field label="Payment Reference / UTR">
                          <input
                            placeholder="Optional transaction reference"
                            value={form.refundReference}
                            onChange={(e) => setForm({...form, refundReference: e.target.value})}
                          />
                        </Field>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-secondary" style={{fontSize: '13px'}}>
                    Settlement: Automatic CustomerCredit offset against invoice due balance. No cash payout.
                  </div>
                )
              )}

              {form.type === 'Supplier' && original && (
                <div className="notice">
                  Adjusting against {original.id}. Unpaid balance: {money(balance(state, original))}.
                </div>
              )}
            </div>

            <div className="form-actions">
              <Btn secondary onClick={() => setForm(null)}>
                Cancel
              </Btn>
              <Btn type="submit" disabled={busy}>
                {busy ? 'Processing…' : form.type === 'Customer' ? 'Confirm customer return' : 'Confirm supplier return'}
              </Btn>
            </div>
          </form>
        </Modal>
      )}

      {/* Reversal Confirmation Modal */}
      {reversalModal.open && (
        <Modal
          title={`Reverse Supplier Return · ${reversalModal.id}`}
          onClose={() => setReversalModal({open: false, id: '', ref: ''})}
        >
          <form onSubmit={handleExecuteReversal}>
            <div className="form-body">
              <p>
                Reversing this supplier return will restore the inventory stock back to its prior condition and
                reinstate any cancelled payables.
              </p>
              <Field label="Reason for reversal *">
                <input
                  required
                  autoFocus
                  placeholder="e.g. Return cancelled by supplier, erroneous return entry..."
                  value={reversalReason}
                  onChange={(e) => setReversalReason(e.target.value)}
                />
              </Field>
            </div>
            <div className="form-actions">
              <Btn secondary onClick={() => setReversalModal({open: false, id: '', ref: ''})}>
                Cancel
              </Btn>
              <Btn danger type="submit" disabled={reversalBusy}>
                {reversalBusy ? 'Reversing…' : 'Confirm return reversal'}
              </Btn>
            </div>
          </form>
        </Modal>
      )}

      {settle && (
        <Modal title="Settle pending refund" onClose={() => setSettle(null)}>
          <div className="form-body stack">
            <p>This settles the remaining refundable amount against {settle}.</p>
            <Field label="Account">
              <select value={account} onChange={(e) => setAccount(e.target.value)}>
                <option>Cash</option>
                <option>Bank account</option>
              </select>
            </Field>
          </div>
          <div className="form-actions">
            <Btn secondary onClick={() => setSettle(null)}>
              Cancel
            </Btn>
            <Btn
              onClick={() => {
                const r = state.returns.find((r) => r.reference === settle)!;
                const b =
                  r.type === 'Customer'
                    ? state.bills.find((b) => b.id === settle)!
                    : state.purchases.find((b) => b.id === settle)!;
                const amount = Math.max(
                  0,
                  paid(state, settle) - (roundedTotal(b) - credits(state, settle))
                );
                if (!amount) {
                  setSettle(null);
                  return;
                }
                if (
                  run((s) => {
                    const next = addPayment(s, {
                      id: uid('PAY'),
                      date: TODAY,
                      direction: r.type === 'Customer' ? 'Out' : 'In',
                      account,
                      amount,
                      purpose: r.type === 'Customer' ? 'Customer refund' : 'Supplier refund',
                      reference: settle,
                      party: r.type === 'Customer' ? 'Customer' : 'Supplier',
                      note: 'Remaining refund settlement',
                    });
                    next.returns = next.returns.map((r) =>
                      r.reference === settle ? {...r, status: 'Completed'} : r
                    );
                    return next;
                  }, 'Refund settled.')
                ) {
                  setSettle(null);
                }
              }}
            >
              Settle refund
            </Btn>
          </div>
        </Modal>
      )}
    </>
  );
}
