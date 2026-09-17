'use client';
import {useState, useEffect, useCallback, useRef} from 'react';
import Link from 'next/link';
import {useStore} from './store';
import {TODAY, money, accountBalance, uid} from '@/lib/domain';
import SupplierSettlement from './supplier-settlement';
import CustomerSettlement from './customer-settlement';
import {PageHead, Card, Btn, Modal, Field, SearchBox, Badge, Empty, csvDownload} from './ui';

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
  filterSummary: {
    totalInPaise: number;
    totalOutPaise: number;
    netPaise: number;
    count: number;
  };
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
  const {state, notify, isLive} = useStore();
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
        headers: {'Content-Type': 'application/json'},
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
                        <option value="Cash">Cash in shop</option>
                        <option value="Bank">GPay / Bank account</option>
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
  const {notify} = useStore();
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
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({reason: reason.trim(), idempotencyKey}),
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
  const {state, isLive} = useStore();
  const [date, setDate] = useState(TODAY);
  const [account, setAccount] = useState('All');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [kind, setKind] = useState<'in' | 'out' | 'transfer' | null>(null);
  const [reversingMovement, setReversingMovement] = useState<MovementRow | null>(null);

  const [registerData, setRegisterData] = useState<RegisterResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
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

  // In live mode, NEVER substitute offline demo state
  const liveCashPaise = registerData?.liveBalances?.cashPaise;
  const liveBankPaise = registerData?.liveBalances?.bankPaise;

  const cashBalDisplay = isLive
    ? liveCashPaise !== undefined
      ? money(liveCashPaise / 100)
      : isLoading
      ? 'Loading…'
      : '—'
    : money(accountBalance(state, 'Cash', date));

  const bankBalDisplay = isLive
    ? liveBankPaise !== undefined
      ? money(liveBankPaise / 100)
      : isLoading
      ? 'Loading…'
      : '—'
    : money(accountBalance(state, 'Bank account', date));

  const combinedBalDisplay = isLive
    ? liveCashPaise !== undefined && liveBankPaise !== undefined
      ? money((liveCashPaise + liveBankPaise) / 100)
      : isLoading
      ? 'Loading…'
      : '—'
    : money(accountBalance(state, 'Cash', date) + accountBalance(state, 'Bank account', date));

  const hist = registerData?.historicalPosition;
  const isHistoricalDate = date !== TODAY;

  return (
    <>
      <PageHead
        title="Cash & Account Register"
        description="All receipts, expenses, transfers and settlements in one authoritative ledger. GPay and bank payments use one account."
        actions={
          <>
            <Btn onClick={() => setKind('in')}>+ Money in</Btn>
            <Btn secondary onClick={() => setKind('out')}>
              − Money out
            </Btn>
            <Btn secondary onClick={() => setKind('transfer')}>
              ⇄ Cash ↔ Account
            </Btn>
          </>
        }
      />

      <div className="toolbar">
        <Field label="Ledger Date">
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
          Review daily closing
        </Link>
        <Btn
          secondary
          onClick={() => {
            if (isLive && registerData) {
              const rows = [
                ['Date', 'Purpose', 'Category', 'Account', 'Direction', 'Amount (₹)', 'Payment Method', 'Reference', 'Details'],
                ...registerData.movements.map(m => [
                  m.date,
                  m.reason,
                  m.category,
                  m.account,
                  m.direction,
                  (m.amountPaise / 100).toFixed(2),
                  m.paymentMethod || '',
                  m.reference || '',
                  m.partyName || '',
                ]),
              ];
              csvDownload(`account-register-${date}.csv`, rows);
            } else {
              csvDownload(
                `cash-account-${date}.csv`,
                [
                  ['Date', 'Purpose', 'Account', 'Direction', 'Amount', 'Reference', 'Details'],
                  ...offlineList.map(p => [
                    p.date,
                    p.purpose,
                    p.account,
                    p.direction,
                    p.amount,
                    p.reference,
                    p.note,
                  ]),
                ]
              );
            }
          }}
        >
          Export CSV
        </Btn>
      </div>

      {/* Historical Date Position Panel */}
      {isLive && hist && isHistoricalDate && (
        <div style={{marginBottom: '1rem', padding: '1rem', background: '#f1f5f9', borderRadius: '8px', border: '1px solid #cbd5e1'}}>
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem'}}>
            <h3 style={{margin: 0, fontSize: '1rem', color: '#1e293b'}}>
              Position on Historical Date: <strong>{date}</strong>
            </h3>
            <Badge>Historical Position</Badge>
          </div>
          <div className="grid-3" style={{gap: '1rem'}}>
            <div style={{background: '#ffffff', padding: '0.75rem', borderRadius: '6px', border: '1px solid #e2e8f0'}}>
              <div style={{fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600}}>
                Opening Balances ({date})
              </div>
              <div style={{marginTop: '0.25rem', fontSize: '0.875rem'}}>
                <div>Cash: <strong>{money(hist.openingCashPaise / 100)}</strong></div>
                <div>Bank: <strong>{money(hist.openingBankPaise / 100)}</strong></div>
                <div style={{borderTop: '1px solid #e2e8f0', marginTop: '0.25rem', paddingTop: '0.25rem'}}>
                  Total: <strong>{money(hist.openingCombinedPaise / 100)}</strong>
                </div>
              </div>
            </div>

            <div style={{background: '#ffffff', padding: '0.75rem', borderRadius: '6px', border: '1px solid #e2e8f0'}}>
              <div style={{fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600}}>
                Day Movements ({date})
              </div>
              <div style={{marginTop: '0.25rem', fontSize: '0.875rem'}}>
                <div>Cash: <span style={{color: '#16a34a'}}>+{money(hist.dayCashInPaise / 100)}</span> / <span style={{color: '#dc2626'}}>-{money(hist.dayCashOutPaise / 100)}</span></div>
                <div>Bank: <span style={{color: '#16a34a'}}>+{money(hist.dayBankInPaise / 100)}</span> / <span style={{color: '#dc2626'}}>-{money(hist.dayBankOutPaise / 100)}</span></div>
                <div style={{borderTop: '1px solid #e2e8f0', marginTop: '0.25rem', paddingTop: '0.25rem'}}>
                  Net Day Delta: <strong style={{color: (hist.dayCashInPaise + hist.dayBankInPaise - hist.dayCashOutPaise - hist.dayBankOutPaise) >= 0 ? '#16a34a' : '#dc2626'}}>
                    {money((hist.dayCashInPaise + hist.dayBankInPaise - hist.dayCashOutPaise - hist.dayBankOutPaise) / 100)}
                  </strong>
                </div>
              </div>
            </div>

            <div style={{background: '#ffffff', padding: '0.75rem', borderRadius: '6px', border: '1px solid #e2e8f0'}}>
              <div style={{fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600}}>
                Expected Closing Balances ({date})
              </div>
              <div style={{marginTop: '0.25rem', fontSize: '0.875rem'}}>
                <div>Cash: <strong>{money(hist.expectedClosingCashPaise / 100)}</strong></div>
                <div>Bank: <strong>{money(hist.expectedClosingBankPaise / 100)}</strong></div>
                <div style={{borderTop: '1px solid #e2e8f0', marginTop: '0.25rem', paddingTop: '0.25rem'}}>
                  Total: <strong>{money(hist.expectedClosingCombinedPaise / 100)}</strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Live Account Cards */}
      <div className="grid-3 spaced">
        <Card title="Current Live Cash (Drawer)">
          <div className="body-pad">
            <h1>{cashBalDisplay}</h1>
            <p>Physical cash drawer balance</p>
          </div>
        </Card>
        <Card title="Current Live Bank / GPay">
          <div className="body-pad">
            <h1>{bankBalDisplay}</h1>
            <p>UPI, cards & bank transfer balance</p>
          </div>
        </Card>
        <Card title="Current Combined Funds">
          <div className="body-pad">
            <h1>{combinedBalDisplay}</h1>
            <p>Transfers preserve this total.</p>
          </div>
        </Card>
      </div>

      {isLive && registerData && (
        <div style={{marginTop: '0.75rem', marginBottom: '0.75rem', padding: '0.5rem 1rem', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0', display: 'flex', gap: '2rem', fontSize: '0.875rem', flexWrap: 'wrap'}}>
          <span>
            <strong>Filter Match:</strong> {registerData.filterSummary.count} entries
          </span>
          <span style={{color: '#16a34a'}}>
            <strong>Inflow:</strong> {money(registerData.filterSummary.totalInPaise / 100)}
          </span>
          <span style={{color: '#dc2626'}}>
            <strong>Outflow:</strong> {money(registerData.filterSummary.totalOutPaise / 100)}
          </span>
          <span>
            <strong>Net:</strong>{' '}
            <span style={{color: registerData.filterSummary.netPaise >= 0 ? '#16a34a' : '#dc2626', fontWeight: 600}}>
              {registerData.filterSummary.netPaise >= 0 ? '+' : ''}
              {money(registerData.filterSummary.netPaise / 100)}
            </span>
          </span>
        </div>
      )}

      <div className="notice">
        Payments received while creating sales, service and non-GST invoices appear here automatically.
        Customer collection and supplier settlements update dues and cash balances atomically.
      </div>

      {loadError && (
        <div className="notice" style={{background: '#fef2f2', borderColor: '#fca5a5', color: '#b91c1c'}}>
          {loadError}
        </div>
      )}

      <Card title="Money Movements">
        <div className="toolbar">
          <SearchBox
            value={q}
            onChange={v => {
              setQ(v);
              setPage(1);
            }}
            placeholder="Search reason, party or reference…"
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
            <option value="Cash">Cash in shop</option>
            <option value="Bank">GPay / Bank account</option>
          </select>
        </div>

        {isLoading ? (
          <div className="body-pad" style={{textAlign: 'center', color: '#64748b'}}>
            Loading ledger entries…
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date & Purpose</th>
                  <th>Account</th>
                  <th>Method</th>
                  <th>Money In</th>
                  <th>Money Out</th>
                  <th>Details / Reference</th>
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
                        <tr key={m._id} style={m.isReversed ? {opacity: 0.5, textDecoration: 'line-through'} : undefined}>
                          <td>
                            <strong>{m.reason || m.category}</strong>
                            {m.subCategory && (
                              <div>
                                <small style={{color: '#64748b'}}>{m.subCategory}</small>
                              </div>
                            )}
                            {m.partyName && (
                              <div>
                                <small style={{color: '#475569'}}>{m.partyName}</small>
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
                            {m.paymentMethod ? <Badge>{m.paymentMethod}</Badge> : <small style={{color: '#94a3b8'}}>—</small>}
                          </td>
                          <td className="positive" style={{fontWeight: 600}}>
                            {m.direction === 'In' ? money(m.amountPaise / 100) : '—'}
                          </td>
                          <td style={{color: '#dc2626', fontWeight: 600}}>
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
                                style={{padding: '0.2rem 0.5rem', fontSize: '0.75rem'}}
                              >
                                Reverse
                              </Btn>
                            ) : m.isReversed ? (
                              <small style={{color: '#94a3b8'}}>Reversed</small>
                            ) : isReversal ? (
                              <small style={{color: '#94a3b8'}}>Reversal</small>
                            ) : (
                              <small style={{color: '#64748b'}} title="Operational records use their own settlement reversal workflow">
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
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', borderTop: '1px solid #e2e8f0', fontSize: '0.875rem'}}>
            <span style={{color: '#64748b'}}>
              Showing {(registerData.pagination.page - 1) * registerData.pagination.limit + 1} to{' '}
              {Math.min(
                registerData.pagination.page * registerData.pagination.limit,
                registerData.pagination.totalCount
              )}{' '}
              of <strong>{registerData.pagination.totalCount}</strong> matching movements
            </span>
            <div style={{display: 'flex', gap: '0.5rem', alignItems: 'center'}}>
              <Btn
                secondary
                disabled={page <= 1 || isLoading}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                style={{padding: '0.3rem 0.75rem'}}
              >
                Previous
              </Btn>
              <span style={{padding: '0 0.5rem', color: '#475569'}}>
                Page {registerData.pagination.page} of {registerData.pagination.totalPages}
              </span>
              <Btn
                secondary
                disabled={page >= registerData.pagination.totalPages || isLoading}
                onClick={() => setPage(p => Math.min(registerData.pagination.totalPages, p + 1))}
                style={{padding: '0.3rem 0.75rem'}}
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
    </>
  );
}
