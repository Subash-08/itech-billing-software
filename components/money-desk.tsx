'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  ArrowDownToLine,
  ArrowRightLeft,
  ArrowUpFromLine,
  CalendarCheck,
  Download,
  Repeat2,
  Truck,
  Undo2,
  UserRound,
} from 'lucide-react';
import { useStore } from './store';
import { TODAY, money, uid } from '@/lib/domain';
import SupplierSettlement from './supplier-settlement';
import CustomerSettlement from './customer-settlement';
import { Card, Btn, Modal, Field, SearchBox, Badge, Empty, csvDownload } from './ui';

interface MovementRow {
  _id: string;
  date: string;
  account: 'Cash' | 'Bank';
  toAccount?: 'Cash' | 'Bank';
  fromAccount?: 'Cash' | 'Bank';
  qty: number;
  amountPaise: number;
  direction: 'In' | 'Out';
  category: string;
  subCategory?: string;
  paymentMethod?: string;
  reason: string;
  reference?: string;
  partyName?: string;
  sourceType?: string;
  linkedMovementId?: string;
  isReversed?: boolean;
  reversalReason?: string;
  createdAt: string;
}

interface RegisterResponse {
  movements: MovementRow[];
  pagination: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
  };
  liveBalances: {
    cashPaise: number;
    bankPaise: number;
    combinedPaise: number;
  };
  historicalPosition?: {
    openingCashPaise: number;
    openingBankPaise: number;
    openingCombinedPaise: number;
    dayCashInPaise: number;
    dayCashOutPaise: number;
    dayBankInPaise: number;
    dayBankOutPaise: number;
    expectedClosingCashPaise: number;
    expectedClosingBankPaise: number;
    expectedClosingCombinedPaise: number;
  } | null;
  daySummary?: {
    date: string;
    status: string;
    sales: {
      totalPaise: number;
      invoiceCount: number;
      newGoodsPaise: number;
      usedGoodsPaise: number;
      servicePaise: number;
      cashReceivedPaise: number;
      bankReceivedPaise: number;
    };
    collections: { cashPaise: number; bankPaise: number; totalPaise: number };
    expenses: { cashPaise: number; bankPaise: number; totalPaise: number };
    supplierPayments: { cashPaise: number; bankPaise: number; totalPaise: number };
    customerRefunds: { cashPaise: number; bankPaise: number; totalPaise: number };
    profit: {
      unlocked: boolean;
      tradingProfitPaise: number | null;
      netProfitPaise: number | null;
      pendingCount: number;
    };
    invoices: Array<{
      _id: string;
      invoiceNumber: string;
      customerName: string;
      businessCategory: string;
      totalPaise: number;
      cashReceivedPaise: number;
      bankReceivedPaise: number;
      duePaise: number;
      paymentStatus: string;
      profitPaise: number | null;
      profitPending: boolean;
    }>;
  } | null;
  filterSummary: {
    totalInPaise: number;
    totalOutPaise: number;
    netPaise: number;
    count: number;
  };
}

function categoryLabel(value: string) {
  if (value === 'UsedGoods') return 'Used goods';
  if (value === 'Service') return 'Service';
  return 'New goods';
}

export function MoneyEntryModal({
  kind,
  onClose,
  onSuccess,
}: {
  kind: 'in' | 'out' | 'transfer';
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { state, notify, isLive } = useStore();
  const [purpose, setPurpose] = useState(
    kind === 'in' ? 'Customer collection' : kind === 'out' ? 'Shop expense' : 'Cash to account'
  );
  const [account, setAccount] = useState<'Cash' | 'Bank'>('Cash');
  const [method, setMethod] = useState<'Cash' | 'UPI' | 'BankTransfer' | 'Card' | 'Cheque'>('Cash');
  const [subCategory, setSubCategory] = useState<string>('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(TODAY);
  const [note, setNote] = useState('');
  const [payerPayee, setPayerPayee] = useState('');
  const [supplier, setSupplier] = useState('');
  const [customer, setCustomer] = useState('');
  const [settleSupplier, setSettleSupplier] = useState(false);
  const [settleCustomer, setSettleCustomer] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Retain stable idempotency key across retries
  const [idempotencyKey] = useState(() => `money-${kind}-${uid('IDEM')}`);

  // When account changes, default appropriate method
  const handleAccountChange = (acc: 'Cash' | 'Bank') => {
    setAccount(acc);
    if (acc === 'Cash') setMethod('Cash');
    else if (method === 'Cash') setMethod('UPI');
  };

  const isSupplier = purpose === 'Supplier payment';
  const isCustomer = purpose === 'Customer collection';

  if (settleSupplier) {
    return (
      <SupplierSettlement
        supplierId={supplier}
        onClose={() => {
          setSettleSupplier(false);
          onSuccess();
          onClose();
        }}
      />
    );
  }

  if (settleCustomer) {
    return (
      <CustomerSettlement
        customerId={customer}
        onClose={() => {
          setSettleCustomer(false);
          onSuccess();
          onClose();
        }}
        onSuccess={() => {
          onSuccess();
        }}
      />
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isSupplier) {
      if (!supplier) {
        notify('Choose a supplier.');
        return;
      }
      setSettleSupplier(true);
      return;
    }

    if (isCustomer) {
      if (!customer) {
        notify('Choose a customer.');
        return;
      }
      setSettleCustomer(true);
      return;
    }

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      notify('Enter a valid positive amount.');
      return;
    }
    const amountPaise = Math.round(numAmount * 100);

    if (!isLive) {
      notify('Cannot post movements in offline preview mode.');
      return;
    }

    setIsSubmitting(true);
    try {
      let payload: any;
      if (kind === 'in') {
        const category = purpose === 'Owner contribution' ? 'OwnerContribution' : 'OtherReceipt';
        payload = {
          action: 'in',
          date,
          account,
          method,
          amountPaise,
          category,
          subCategory: category === 'OtherReceipt' && subCategory ? subCategory : undefined,
          reason: note || purpose,
          reference: note,
          payerName: payerPayee,
          idempotencyKey,
        };
      } else if (kind === 'out') {
        const category = purpose === 'Owner withdrawal' ? 'OwnerWithdrawal' : 'Expense';
        payload = {
          action: 'out',
          date,
          account,
          method,
          amountPaise,
          category,
          subCategory: category === 'Expense' && subCategory ? subCategory : undefined,
          reason: note || purpose,
          reference: note,
          payeeName: payerPayee,
          idempotencyKey,
        };
      } else {
        const fromAccount = purpose === 'Cash to account' ? 'Cash' : 'Bank';
        const toAccount = purpose === 'Cash to account' ? 'Bank' : 'Cash';
        payload = {
          action: 'transfer',
          date,
          fromAccount,
          toAccount,
          amountPaise,
          reason: note || `Transfer: ${fromAccount} to ${toAccount}`,
          reference: note,
          idempotencyKey,
        };
      }

      const res = await fetch('/api/money', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to record transaction.');
      }

      notify(
        kind === 'transfer'
          ? 'Transfer completed successfully. Balances updated.'
          : `${kind === 'in' ? 'Receipt' : 'Payment'} recorded successfully.`
      );
      onSuccess();
      onClose();
    } catch (err: any) {
      notify(err.message || 'Error processing transaction.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      title={kind === 'in' ? 'Record Money In' : kind === 'out' ? 'Record Money Out' : 'Transfer Cash ↔ Account'}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit}>
        <div className="form-body stack">
          <Field label={kind === 'transfer' ? 'Transfer direction' : 'Transaction Purpose'}>
            <select
              value={purpose}
              onChange={e => {
                setPurpose(e.target.value);
                setSubCategory('');
              }}
            >
              {kind === 'in' ? (
                <>
                  <option value="Customer collection">Customer collection (Sales / Service dues & advances)</option>
                  <option value="Other receipt">Other receipt / Miscellaneous income</option>
                  <option value="Owner contribution">Owner contribution (Capital)</option>
                </>
              ) : kind === 'out' ? (
                <>
                  <option value="Shop expense">Shop operating expense</option>
                  <option value="Supplier payment">Supplier bill settlement</option>
                  <option value="Owner withdrawal">Owner withdrawal (Drawings)</option>
                </>
              ) : (
                <>
                  <option value="Cash to account">Cash in shop → GPay / Bank account</option>
                  <option value="Account to cash">GPay / Bank account → Cash in shop</option>
                </>
              )}
            </select>
          </Field>

          {isCustomer ? (
            <>
              <Field label="Customer">
                <select required value={customer} onChange={e => setCustomer(e.target.value)}>
                  <option value="">Choose customer</option>
                  {state.customers.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.phone ? `(${c.phone})` : ''}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="notice">
                Customer collection settles opening dues and issued sales/service invoices directly via the customer ledger,
                supporting partial or full allocation, split cash/bank receipt, and advances.
              </div>
            </>
          ) : isSupplier ? (
            <>
              <Field label="Supplier">
                <select required value={supplier} onChange={e => setSupplier(e.target.value)}>
                  <option value="">Choose supplier</option>
                  {state.suppliers.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="notice">
                Next, review purchased bills, select lines to pay, and choose Cash or Bank. This settles
                supplier dues directly without double-counting as a shop expense.
              </div>
            </>
          ) : (
            <>
              {purpose === 'Shop expense' && (
                <Field label="Expense Category">
                  <select value={subCategory} onChange={e => setSubCategory(e.target.value)}>
                    <option value="">General Expense</option>
                    <option value="Rent">Rent</option>
                    <option value="Electricity">Electricity</option>
                    <option value="InternetAndPhone">Internet & Phone</option>
                    <option value="TeaAndRefreshments">Tea & Refreshments</option>
                    <option value="ShopMaintenance">Shop Maintenance</option>
                    <option value="StationeryAndPrinting">Stationery & Printing</option>
                    <option value="PackagingAndDelivery">Packaging & Delivery</option>
                    <option value="StaffWelfare">Staff Welfare</option>
                    <option value="MarketingAndPromotion">Marketing & Promotion</option>
                    <option value="SoftwareAndSubscriptions">Software & Subscriptions</option>
                    <option value="BankCharges">Bank Charges</option>
                    <option value="MiscellaneousExpense">Miscellaneous</option>
                  </select>
                </Field>
              )}

              {purpose === 'Other receipt' && (
                <Field label="Receipt Category">
                  <select value={subCategory} onChange={e => setSubCategory(e.target.value)}>
                    <option value="">General Income</option>
                    <option value="ScrapSale">Scrap Sale</option>
                    <option value="OldAssetSale">Old Asset Sale</option>
                    <option value="CashbackAndReward">Cashback & Reward</option>
                    <option value="InterestReceived">Interest Received</option>
                    <option value="CommissionIncome">Commission Income</option>
                    <option value="RentalIncome">Rental Income</option>
                    <option value="InsuranceClaim">Insurance Claim</option>
                    <option value="MiscellaneousIncome">Miscellaneous</option>
                  </select>
                </Field>
              )}

              {kind !== 'transfer' && (
                <>
                  <div className="grid-2">
                    <Field label={kind === 'in' ? 'Deposit into' : 'Disburse from'}>
                      <select value={account} onChange={e => handleAccountChange(e.target.value as any)}>
                        <option value="Cash">Cash</option>
                        <option value="Bank">Bank / GPay</option>
                      </select>
                    </Field>
                    <Field label="Payment Method">
                      <select value={method} onChange={e => setMethod(e.target.value as any)}>
                        {account === 'Cash' ? (
                          <option value="Cash">Cash</option>
                        ) : (
                          <>
                            <option value="UPI">UPI / GPay</option>
                            <option value="BankTransfer">Bank Transfer (NEFT/IMPS)</option>
                            <option value="Card">Card</option>
                            <option value="Cheque">Cheque</option>
                          </>
                        )}
                      </select>
                    </Field>
                  </div>

                  <Field label={kind === 'in' ? 'Received from (optional)' : 'Paid to (optional)'}>
                    <input
                      value={payerPayee}
                      onChange={e => setPayerPayee(e.target.value)}
                      placeholder={kind === 'in' ? 'Name of payer or source' : 'Vendor, landlord, or person'}
                    />
                  </Field>
                </>
              )}

              <div className="grid-2">
                <Field label="Amount (₹)">
                  <input
                    required
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    placeholder="0.00"
                  />
                </Field>
                <Field label="Transaction Date">
                  <input
                    required
                    type="date"
                    max={TODAY}
                    value={date}
                    onChange={e => setDate(e.target.value)}
                  />
                </Field>
              </div>

              <Field label="Details / Payment Reference">
                <textarea
                  required
                  rows={2}
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder={
                    kind === 'transfer'
                      ? 'Bank deposit slip, ATM withdrawal, or reference…'
                      : 'Reason, voucher number, or reference details…'
                  }
                />
              </Field>

              {kind === 'transfer' && (
                <div className="notice">
                  A transfer moves money between Cash in shop and your Bank account. It does not create any sale,
                  expense, or profit impact.
                </div>
              )}
            </>
          )}
        </div>

        <div className="form-actions">
          <Btn secondary onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Btn>
          <Btn type="submit" disabled={isSubmitting}>
            {isSubmitting
              ? 'Processing…'
              : isCustomer
                ? 'Select Customer Dues →'
                : isSupplier
                  ? 'Select Bills to Pay →'
                  : kind === 'transfer'
                    ? 'Transfer Funds'
                    : 'Record Transaction'}
          </Btn>
        </div>
      </form>
    </Modal>
  );
}

export function ReversalModal({
  movement,
  onClose,
  onSuccess,
}: {
  movement: MovementRow;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { notify } = useStore();
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Retain stable idempotency key across retries
  const [idempotencyKey] = useState(() => `rev-mov-${movement._id}-${uid('IDEM')}`);

  const handleReverse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim() || reason.trim().length < 3) {
      notify('Provide a reason of at least 3 characters.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/money/${movement._id}/reverse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim(), idempotencyKey }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to reverse movement.');
      }

      notify('Movement reversed successfully. Balances updated.');
      onSuccess();
      onClose();
    } catch (err: any) {
      notify(err.message || 'Error reversing movement.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal title="Reverse Account Movement" onClose={onClose}>
      <form onSubmit={handleReverse}>
        <div className="form-body stack">
          <p>
            Are you sure you want to reverse this {movement.category} movement of{' '}
            <strong>₹{(movement.amountPaise / 100).toFixed(2)}</strong> from{' '}
            <strong>{movement.account}</strong>?
          </p>
          <div className="notice">
            Reversals post an equal opposite transaction on the current open business day, preserving audit
            history and checking against overdraft.
          </div>
          <Field label="Reversal Reason">
            <textarea
              required
              rows={2}
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="State reason for reversal (e.g. Entry mistake, check bounced)…"
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

export default function MoneyDesk() {
  const { state, isLive, notify } = useStore();
  const [date, setDate] = useState(TODAY);
  const [account, setAccount] = useState('All');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [kind, setKind] = useState<'in' | 'out' | 'transfer' | null>(null);
  const [reversingMovement, setReversingMovement] = useState<MovementRow | null>(null);

  const [registerData, setRegisterData] = useState<RegisterResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [loadError, setLoadError] = useState('');

  // Stale request guard
  const reqSeq = useRef(0);

  const fetchRegister = useCallback(async () => {
    if (!isLive) return;
    const currentSeq = ++reqSeq.current;
    setIsLoading(true);
    setLoadError('');
    try {
      const params = new URLSearchParams();
      if (date) params.set('date', date);
      if (account !== 'All') params.set('account', account);
      if (q.trim()) params.set('search', q.trim());
      params.set('page', String(page));
      params.set('limit', '50');

      const res = await fetch(`/api/money?${params.toString()}`);
      const data = await res.json();
      if (currentSeq !== reqSeq.current) return; // Stale response ignored

      if (!res.ok) throw new Error(data.error || 'Failed to fetch account register.');
      setRegisterData(data);
    } catch (err: any) {
      if (currentSeq === reqSeq.current) {
        setLoadError(err.message || 'Could not load live register.');
      }
    } finally {
      if (currentSeq === reqSeq.current) {
        setIsLoading(false);
      }
    }
  }, [date, account, q, page, isLive]);

  useEffect(() => {
    fetchRegister();
  }, [fetchRegister]);

  // Fallback list for demo/offline preview mode
  const offlineList = (state.payments || []).filter(p => {
    if (p.date !== date) return false;
    if (account !== 'All' && p.account !== account && p.toAccount !== account) return false;
    if (!q) return true;
    const haystack = [
      (p as any).purpose,
      (p as any).reference,
      (p as any).note,
      (p as any).notes,
      (p as any).party,
      (p as any).paymentNumber,
      (p as any).supplierId,
    ]
      .filter(Boolean)
      .map(String)
      .join(' ')
      .toLowerCase();
    return haystack.includes(q.toLowerCase());
  });

  const liveList = registerData?.movements || [];
  const displayMovements = isLive ? liveList : offlineList;

  const hist = registerData?.historicalPosition;
  const day = registerData?.daySummary;
  const isHistoricalDate = date !== TODAY;

  async function exportRegister() {
    setIsExporting(true);
    try {
      if (!isLive) {
        csvDownload(
          `cash-account-${date}.csv`,
          [
            ['Cashbook activity', date],
            ['Date', 'Purpose', 'Account', 'Direction', 'Amount', 'Reference', 'Details'],
            ...offlineList.map(p => [p.date, p.purpose, p.account, p.direction, p.amount, p.reference, p.note]),
          ]
        );
        return;
      }

      if (!registerData || !day || !hist) throw new Error('Cashbook data is still loading. Please try again.');

      const params = new URLSearchParams({date, page: '1', limit: '5000'});
      if (account !== 'All') params.set('account', account);
      if (q.trim()) params.set('search', q.trim());
      const response = await fetch(`/api/money?${params.toString()}`, {cache: 'no-store'});
      const fullRegister: RegisterResponse = await response.json();
      if (!response.ok) throw new Error((fullRegister as any).error || 'Could not prepare the Cashbook export.');

      const rows: (string | number)[][] = [
        ['Cashbook summary', date],
        ['Section', 'Cash / Opening', 'GPay / Bank', 'Total / Closing'],
        ['Overall sales', (day.sales.cashReceivedPaise / 100).toFixed(2), (day.sales.bankReceivedPaise / 100).toFixed(2), (day.sales.totalPaise / 100).toFixed(2)],
        ['Expenses', (day.expenses.cashPaise / 100).toFixed(2), (day.expenses.bankPaise / 100).toFixed(2), (day.expenses.totalPaise / 100).toFixed(2)],
        ['Grand total', (hist.expectedClosingCashPaise / 100).toFixed(2), (hist.expectedClosingBankPaise / 100).toFixed(2), (hist.expectedClosingCombinedPaise / 100).toFixed(2)],
        ['Profit', day.profit.unlocked ? ((day.profit.tradingProfitPaise || 0) / 100).toFixed(2) : 'Hidden', (day.expenses.totalPaise / 100).toFixed(2), day.profit.unlocked ? ((day.profit.netProfitPaise || 0) / 100).toFixed(2) : 'Hidden'],
        [],
        ['Sales details'],
        ['Invoices', day.sales.invoiceCount],
        ['New goods', (day.sales.newGoodsPaise / 100).toFixed(2)],
        ['Used goods', (day.sales.usedGoodsPaise / 100).toFixed(2)],
        ['Service', (day.sales.servicePaise / 100).toFixed(2)],
        [],
        ['Money flow', 'Cash', 'GPay / Bank', 'Total'],
        ['Customer collections', (day.collections.cashPaise / 100).toFixed(2), (day.collections.bankPaise / 100).toFixed(2), (day.collections.totalPaise / 100).toFixed(2)],
        ['Supplier payments', (day.supplierPayments.cashPaise / 100).toFixed(2), (day.supplierPayments.bankPaise / 100).toFixed(2), (day.supplierPayments.totalPaise / 100).toFixed(2)],
        ['Customer refunds', (day.customerRefunds.cashPaise / 100).toFixed(2), (day.customerRefunds.bankPaise / 100).toFixed(2), (day.customerRefunds.totalPaise / 100).toFixed(2)],
        ['Net account movement', ((hist.dayCashInPaise - hist.dayCashOutPaise) / 100).toFixed(2), ((hist.dayBankInPaise - hist.dayBankOutPaise) / 100).toFixed(2), ((hist.dayCashInPaise + hist.dayBankInPaise - hist.dayCashOutPaise - hist.dayBankOutPaise) / 100).toFixed(2)],
        [],
        ['Account position', 'Cash', 'GPay / Bank', 'Total'],
        ['Opening funds', (hist.openingCashPaise / 100).toFixed(2), (hist.openingBankPaise / 100).toFixed(2), (hist.openingCombinedPaise / 100).toFixed(2)],
        ['Closing funds', (hist.expectedClosingCashPaise / 100).toFixed(2), (hist.expectedClosingBankPaise / 100).toFixed(2), (hist.expectedClosingCombinedPaise / 100).toFixed(2)],
        [],
        ['Sales invoices'],
        ['Invoice', 'Customer', 'Category', 'Invoice amount', 'Cash received', 'GPay / Bank', 'Outstanding', 'Payment status'],
        ...day.invoices.map(invoice => [invoice.invoiceNumber, invoice.customerName, categoryLabel(invoice.businessCategory), (invoice.totalPaise / 100).toFixed(2), (invoice.cashReceivedPaise / 100).toFixed(2), (invoice.bankReceivedPaise / 100).toFixed(2), (invoice.duePaise / 100).toFixed(2), invoice.paymentStatus]),
        [],
        ['Cashbook activity'],
        ['Date', 'Activity', 'Category', 'Account', 'Direction', 'Amount', 'Payment method', 'Reference', 'Party'],
        ...fullRegister.movements.map(m => [m.date, m.reason || m.category, m.category, m.account, m.direction, (m.amountPaise / 100).toFixed(2), m.paymentMethod || '', m.reference || '', m.partyName || '']),
      ];

      csvDownload(`cashbook-${date}.csv`, rows);
      notify(`Exported the ${date} Cashbook summary, invoices and ${fullRegister.movements.length} matching movement(s).`);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Cashbook export failed.');
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className="cashbook-page">
      <section className="cashbook-command-section" aria-label="Cashbook controls">
        <header className="cashbook-hero">
          <div className="cashbook-hero-copy">
            <div>
              <h1>Cashbook</h1>
              <p>See every cash and Bank/GPay movement in one place. Sales receipts, expenses, transfers and settlements update here automatically.</p>
            </div>
          </div>
          <div className="cashbook-hero-actions" aria-label="Cashbook actions">
            <Btn onClick={() => setKind('in')}><ArrowDownToLine size={15} />Receive money</Btn>
            <Btn secondary onClick={() => setKind('out')}><ArrowUpFromLine size={15} />Record payment</Btn>
            <Btn secondary onClick={() => setKind('transfer')}><ArrowRightLeft size={15} />Move cash &amp; bank</Btn>
          </div>
        </header>

        <div className="toolbar cashbook-date-toolbar">
          <Field label="Date">
            <input
              type="date"
              max={TODAY}
              value={date}
              onChange={e => {
                setDate(e.target.value || TODAY);
                setPage(1);
              }}
            />
          </Field>
          <Link className="btn secondary" href={'/profit?date=' + date}>
            <CalendarCheck size={15} />Daily closing
          </Link>
          <Btn
            secondary
            disabled={isExporting || isLoading}
            onClick={exportRegister}
          >
            <Download size={15} />{isExporting ? 'Exporting…' : 'Export'}
          </Btn>
          <div className="cashbook-quick-date">
            <span>Quick date</span>
            <Btn
              secondary={date !== TODAY}
              className={date === TODAY ? 'is-current' : ''}
              onClick={() => {
                setDate(TODAY);
                setPage(1);
              }}
            >
              Today
            </Btn>
          </div>
        </div>
      </section>

      <section className="cashbook-section" aria-labelledby="daily-overview-title">
        <div className="cashbook-section-head">
          <div>
            <span>Selected date</span>
            <h2 id="daily-overview-title">Daily overview</h2>
          </div>
          <div className="cashbook-section-meta">
            <strong>{date}</strong>
            {day && <Badge>{day.status === 'Holiday' ? 'Shop holiday' : day.status}</Badge>}
          </div>
        </div>

        <div className="cashbook-summary-grid">
          <article className="cashbook-summary-card">
            <h3>Overall sales</h3>
            <dl>
              <div><dt>Cash received</dt><dd>{day ? money(day.sales.cashReceivedPaise / 100) : '—'}</dd></div>
              <div><dt>GPay / Bank received</dt><dd>{day ? money(day.sales.bankReceivedPaise / 100) : '—'}</dd></div>
              <div className="summary-total"><dt>Sales billed</dt><dd>{day ? money(day.sales.totalPaise / 100) : isLoading ? 'Loading…' : '—'}</dd></div>
            </dl>
          </article>

          <article className="cashbook-summary-card">
            <h3>Expenses</h3>
            <dl>
              <div><dt>Cash</dt><dd>{day ? money(day.expenses.cashPaise / 100) : '—'}</dd></div>
              <div><dt>GPay / Bank</dt><dd>{day ? money(day.expenses.bankPaise / 100) : '—'}</dd></div>
              <div className="summary-total"><dt>Total expenses</dt><dd>{day ? money(day.expenses.totalPaise / 100) : isLoading ? 'Loading…' : '—'}</dd></div>
            </dl>
          </article>

          <article className="cashbook-summary-card">
            <h3>Grand total</h3>
            <dl>
              <div><dt>Cash in drawer</dt><dd>{hist ? money(hist.expectedClosingCashPaise / 100) : '—'}</dd></div>
              <div><dt>GPay / Bank</dt><dd>{hist ? money(hist.expectedClosingBankPaise / 100) : '—'}</dd></div>
              <div className="summary-total"><dt>Total funds</dt><dd>{hist ? money(hist.expectedClosingCombinedPaise / 100) : isLoading ? 'Loading…' : '—'}</dd></div>
            </dl>
          </article>

          <article className="cashbook-summary-card">
            <h3>Profit</h3>
            <dl>
              <div><dt>Trading profit</dt><dd>{day?.profit.unlocked ? money((day.profit.tradingProfitPaise || 0) / 100) : day ? 'Hidden' : '—'}</dd></div>
              <div><dt>Shop expenses</dt><dd>{day ? money(day.expenses.totalPaise / 100) : '—'}</dd></div>
              <div className="summary-total"><dt>Net profit</dt><dd>{day?.profit.unlocked ? money((day.profit.netProfitPaise || 0) / 100) : day ? 'Hidden' : isLoading ? 'Loading…' : '—'}</dd></div>
            </dl>
          </article>
        </div>

        <div className="cashbook-summary-note">
          <span>Invoices {day?.sales.invoiceCount ?? '—'}</span>
          <span>New {day ? money(day.sales.newGoodsPaise / 100) : '—'}</span>
          <span>Used {day ? money(day.sales.usedGoodsPaise / 100) : '—'}</span>
          <span>Service {day ? money(day.sales.servicePaise / 100) : '—'}</span>
        </div>

        <div className="cashbook-flow-grid">
          <div>
            <span><i className="cashbook-flow-icon"><UserRound size={14} /></i>Customer collections</span>
            <strong>{day ? money(day.collections.totalPaise / 100) : '—'}</strong>
            <small>Cash {day ? money(day.collections.cashPaise / 100) : '—'} · Bank/GPay {day ? money(day.collections.bankPaise / 100) : '—'}</small>
          </div>
          <div>
            <span><i className="cashbook-flow-icon"><Truck size={14} /></i>Supplier payments</span>
            <strong>{day ? money(day.supplierPayments.totalPaise / 100) : '—'}</strong>
            <small>Cash {day ? money(day.supplierPayments.cashPaise / 100) : '—'} · Bank/GPay {day ? money(day.supplierPayments.bankPaise / 100) : '—'}</small>
          </div>
          <div>
            <span><i className="cashbook-flow-icon"><Undo2 size={14} /></i>Customer refunds</span>
            <strong>{day ? money(day.customerRefunds.totalPaise / 100) : '—'}</strong>
            <small>Cash {day ? money(day.customerRefunds.cashPaise / 100) : '—'} · Bank/GPay {day ? money(day.customerRefunds.bankPaise / 100) : '—'}</small>
          </div>
          <div>
            <span><i className="cashbook-flow-icon"><Repeat2 size={14} /></i>Net account movement</span>
            <strong>{hist ? money((hist.dayCashInPaise + hist.dayBankInPaise - hist.dayCashOutPaise - hist.dayBankOutPaise) / 100) : '—'}</strong>
            <small>All receipts, payments, transfers and reversals</small>
          </div>
        </div>
      </section>

      {isLive && hist && (
        <section className="cashbook-section cashbook-position" aria-labelledby="account-position-title">
          {/* <div className="cashbook-section-head">
            <div>
              <span>{isHistoricalDate ? 'Selected date' : 'Today'}</span>
              <h2 id="account-position-title">Account position for {date}</h2>
            </div>
            <small>{isHistoricalDate ? 'Balances reconstructed from movements on this date.' : 'Balances after all movements recorded today.'}</small>
          </div> */}
          <div className="cashbook-position-grid">
            <article>
              <span>Opening funds</span>
              <strong>{money(hist.openingCombinedPaise / 100)}</strong>
              <small>Cash {money(hist.openingCashPaise / 100)} · Bank/GPay {money(hist.openingBankPaise / 100)}</small>
            </article>
            <article>
              <span>Money moved today</span>
              <strong className={(hist.dayCashInPaise + hist.dayBankInPaise - hist.dayCashOutPaise - hist.dayBankOutPaise) >= 0 ? 'positive' : 'negative'}>
                {(hist.dayCashInPaise + hist.dayBankInPaise - hist.dayCashOutPaise - hist.dayBankOutPaise) >= 0 ? '+' : ''}
                {money((hist.dayCashInPaise + hist.dayBankInPaise - hist.dayCashOutPaise - hist.dayBankOutPaise) / 100)}
              </strong>
              <small>In {money((hist.dayCashInPaise + hist.dayBankInPaise) / 100)} · Out {money((hist.dayCashOutPaise + hist.dayBankOutPaise) / 100)}</small>
            </article>
            <article>
              <span>Closing funds</span>
              <strong>{money(hist.expectedClosingCombinedPaise / 100)}</strong>
              <small>Cash {money(hist.expectedClosingCashPaise / 100)} · Bank/GPay {money(hist.expectedClosingBankPaise / 100)}</small>
            </article>
          </div>
        </section>
      )}

      <section className="cashbook-section" aria-labelledby="sales-breakdown-title">
        <div className="cashbook-section-head">
          <div>
            <span>Invoice entries</span>
            <h2 id="sales-breakdown-title">Sales recorded on this date</h2>
          </div>
          <small>Outstanding shows the invoice’s current balance.</small>
        </div>
        <Card title="Sales breakdown">
          {day?.invoices.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Invoice / Customer</th>
                    <th>Category</th>
                    <th>Invoice amount</th>
                    <th>Cash received</th>
                    <th>Bank / GPay</th>
                    <th>Outstanding</th>
                    <th>Profit</th>
                  </tr>
                </thead>
                <tbody>
                  {day.invoices.map(invoice => (
                    <tr key={invoice._id}>
                      <td>
                        <Link className="record-link" href={'/sales/' + invoice._id}>{invoice.invoiceNumber}</Link>
                        <small>{invoice.customerName}</small>
                      </td>
                      <td><Badge>{categoryLabel(invoice.businessCategory)}</Badge></td>
                      <td className="amount">{money(invoice.totalPaise / 100)}</td>
                      <td className="positive">{money(invoice.cashReceivedPaise / 100)}</td>
                      <td className="positive">{money(invoice.bankReceivedPaise / 100)}</td>
                      <td>
                        <strong>{money(invoice.duePaise / 100)}</strong>
                        <small>{invoice.paymentStatus}</small>
                      </td>
                      <td>
                        {day.profit.unlocked
                          ? invoice.profitPending
                            ? <Badge>Review needed</Badge>
                            : money((invoice.profitPaise || 0) / 100)
                          : <span className="muted">Hidden</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty
              title="No sales invoices on this date"
              text="Choose another date or create the first sales invoice for this day."
              action={<Link className="btn secondary" href="/sales/new">+ Create sales invoice</Link>}
            />
          )}
        </Card>
      </section>

      {isLive && registerData && (
        <div className="cashbook-filter-summary">
          <span>
            <strong>Filter Match:</strong> {registerData.filterSummary.count} entries
          </span>
          <span style={{ color: '#16a34a' }}>
            <strong>Inflow:</strong> {money(registerData.filterSummary.totalInPaise / 100)}
          </span>
          <span style={{ color: '#dc2626' }}>
            <strong>Outflow:</strong> {money(registerData.filterSummary.totalOutPaise / 100)}
          </span>
          <span>
            <strong>Net:</strong>{' '}
            <span style={{ color: registerData.filterSummary.netPaise >= 0 ? '#16a34a' : '#dc2626', fontWeight: 600 }}>
              {registerData.filterSummary.netPaise >= 0 ? '+' : ''}
              {money(registerData.filterSummary.netPaise / 100)}
            </span>
          </span>
        </div>
      )}

      <div className="notice">
        Payments received for sales and service invoices appear here automatically.
        Customer and supplier settlements update dues and account balances together.
      </div>

      {loadError && (
        <div className="notice" style={{ background: '#fef2f2', borderColor: '#fca5a5', color: '#b91c1c' }}>
          {loadError}
        </div>
      )}

      <Card title="Cashbook activity">
        <div className="toolbar">
          <SearchBox
            value={q}
            onChange={v => {
              setQ(v);
              setPage(1);
            }}
            placeholder="Search activity, person or reference…"
          />
          <select
            aria-label="Account filter"
            value={account}
            onChange={e => {
              setAccount(e.target.value);
              setPage(1);
            }}
          >
            <option value="All">All accounts</option>
            <option value="Cash">Cash</option>
            <option value="Bank">Bank / GPay</option>
          </select>
        </div>

        {isLoading ? (
          <div className="body-pad" style={{ textAlign: 'center', color: '#64748b' }}>
            Loading ledger entries…
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Activity</th>
                  <th>Account</th>
                  <th>How paid</th>
                  <th>Money In</th>
                  <th>Money Out</th>
                  <th>Reference</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {isLive
                  ? liveList.map(m => {
                    const isTransfer = m.category === 'Transfer';
                    const isManual =
                      m.sourceType === 'ManualMoneyEntry' ||
                      m.sourceType === 'ManualTransfer' ||
                      (!m.sourceType &&
                        ['Expense', 'OtherReceipt', 'OwnerContribution', 'OwnerWithdrawal', 'Transfer'].includes(
                          m.category
                        ));
                    const isReversal = Boolean(m.isReversed) || m.category.endsWith('Reversal') || (m.sourceType && m.sourceType.endsWith('Reversal'));
                    const canReverse = !m.isReversed && !isReversal && isManual;

                    return (
                      <tr key={m._id} style={m.isReversed ? { opacity: 0.5, textDecoration: 'line-through' } : undefined}>
                        <td>
                          <strong>{m.reason || m.category}</strong>
                          {m.subCategory && (
                            <div>
                              <small style={{ color: '#64748b' }}>{m.subCategory}</small>
                            </div>
                          )}
                          {m.partyName && (
                            <div>
                              <small style={{ color: '#475569' }}>{m.partyName}</small>
                            </div>
                          )}
                          {m.isReversed && <Badge>Reversed</Badge>}
                          {isReversal && !m.isReversed && <Badge>Reversal</Badge>}
                        </td>
                        <td>
                          {m.account}
                          {isTransfer && m.toAccount && <small> → {m.toAccount}</small>}
                        </td>
                        <td>
                          {m.paymentMethod ? <Badge>{m.paymentMethod}</Badge> : <small style={{ color: '#94a3b8' }}>—</small>}
                        </td>
                        <td className="positive" style={{ fontWeight: 600 }}>
                          {m.direction === 'In' ? money(m.amountPaise / 100) : '—'}
                        </td>
                        <td style={{ color: '#dc2626', fontWeight: 600 }}>
                          {m.direction === 'Out' ? money(m.amountPaise / 100) : '—'}
                        </td>
                        <td>
                          {m.reference ? <code>{m.reference}</code> : '—'}
                        </td>
                        <td>
                          {canReverse ? (
                            <Btn
                              secondary
                              onClick={() => setReversingMovement(m)}
                              style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}
                            >
                              Reverse
                            </Btn>
                          ) : m.isReversed ? (
                            <small style={{ color: '#94a3b8' }}>Reversed</small>
                          ) : isReversal ? (
                            <small style={{ color: '#94a3b8' }}>Reversal</small>
                          ) : (
                            <small style={{ color: '#64748b' }} title="Operational records use their own settlement reversal workflow">
                              {m.sourceType || 'Ledger'}
                            </small>
                          )}
                        </td>
                      </tr>
                    );
                  })
                  : offlineList.map(p => (
                    <tr key={p.id}>
                      <td>
                        {p.purpose}
                        <small>
                          {state.customers.find(c => c.id === p.party)?.name ||
                            state.suppliers.find(s => s.id === p.party)?.name ||
                            p.party}
                        </small>
                      </td>
                      <td>
                        {p.account}
                        {p.toAccount && <small>→ {p.toAccount}</small>}
                      </td>
                      <td>
                        <Badge>{p.account === 'Cash' ? 'Cash' : 'Bank'}</Badge>
                      </td>
                      <td className="positive">{p.direction === 'In' ? money(p.amount) : '—'}</td>
                      <td>
                        {p.direction === 'Out'
                          ? money(p.amount)
                          : p.direction === 'Transfer'
                            ? money(p.amount) + ' transfer'
                            : '—'}
                      </td>
                      <td>
                        {state.bills.some(b => b.id === p.reference) ? (
                          <Link className="text-link" href={'/sales/' + p.reference}>
                            {p.reference}
                          </Link>
                        ) : state.purchases.some(b => b.id === p.reference) ? (
                          <Link className="text-link" href={'/purchases/' + p.reference}>
                            {p.reference}
                          </Link>
                        ) : (
                          p.reference
                        )}
                      </td>
                      <td>—</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}

        {!displayMovements.length && !isLoading && <Empty title="No movements on this date" />}

        {/* Real Pagination Controls */}
        {isLive && registerData && registerData.pagination.totalCount > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', borderTop: '1px solid #e2e8f0', fontSize: '0.875rem' }}>
            <span style={{ color: '#64748b' }}>
              Showing {(registerData.pagination.page - 1) * registerData.pagination.limit + 1} to{' '}
              {Math.min(
                registerData.pagination.page * registerData.pagination.limit,
                registerData.pagination.totalCount
              )}{' '}
              of <strong>{registerData.pagination.totalCount}</strong> matching movements
            </span>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <Btn
                secondary
                disabled={page <= 1 || isLoading}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                style={{ padding: '0.3rem 0.75rem' }}
              >
                Previous
              </Btn>
              <span style={{ padding: '0 0.5rem', color: '#475569' }}>
                Page {registerData.pagination.page} of {registerData.pagination.totalPages}
              </span>
              <Btn
                secondary
                disabled={page >= registerData.pagination.totalPages || isLoading}
                onClick={() => setPage(p => Math.min(registerData.pagination.totalPages, p + 1))}
                style={{ padding: '0.3rem 0.75rem' }}
              >
                Next
              </Btn>
            </div>
          </div>
        )}
      </Card>

      {kind && (
        <MoneyEntryModal
          kind={kind}
          onClose={() => setKind(null)}
          onSuccess={() => fetchRegister()}
        />
      )}

      {reversingMovement && (
        <ReversalModal
          movement={reversingMovement}
          onClose={() => setReversingMovement(null)}
          onSuccess={() => fetchRegister()}
        />
      )}
    </div>
  );
}
