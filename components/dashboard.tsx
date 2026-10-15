'use client';
import {useState, useEffect, useRef} from 'react';
import Analytics from './analytics';
import LiveSalesChart from './live-sales-chart';
import Link from 'next/link';
import {
  ArrowUpRight,
  IndianRupee,
  Wallet,
  Wrench,
  Package,
  Plus,
  ArrowDownLeft,
  ArrowUpRight as ArrowOut,
  CalendarDays,
  Landmark,
  ArrowDownCircle,
  ArrowUpCircle,
  HandCoins,
} from 'lucide-react';
import {useStore} from './store';
import {Card, Stat, PageHead, Badge} from './ui';
import {TODAY, roundedTotal, money, shortMoney, accountBalance, balance} from '@/lib/domain';

function shiftDate(date: string, days: number) {
  return new Date(new Date(date + 'T12:00:00').getTime() + days * 86400000).toISOString().slice(0, 10);
}

export default function Dashboard() {
  const {state, isLive, companySession} = useStore();
  const [liveData, setLiveData] = useState<any>(null);
  const [loadError, setLoadError] = useState('');
  const [revision, setRevision] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [dashboardDate, setDashboardDate] = useState(TODAY);
  const [summaryPreset, setSummaryPreset] = useState<'today' | '7d' | 'custom'>('today');
  const [customFrom, setCustomFrom] = useState(TODAY);
  const [customTo, setCustomTo] = useState(TODAY);
  const lastLoadedAt = useRef(0);
  const summaryFrom = summaryPreset === 'today' ? dashboardDate : summaryPreset === '7d' ? shiftDate(dashboardDate, -6) : customFrom;
  const summaryTo = summaryPreset === 'custom' ? customTo : dashboardDate;

  const changeDashboardDate = (value: string) => {
    const nextDate = value || TODAY;
    setDashboardDate(nextDate);
    setSummaryPreset('today');
    setCustomFrom(nextDate);
    setCustomTo(nextDate);
  };

  useEffect(() => {
    if (!isLive) return;
    let active = true;
    setLoadError(''); setRefreshing(true);
    const params = new URLSearchParams({from: summaryFrom, to: summaryTo});
    fetch(`/api/company/dashboard?${params.toString()}`, {cache: 'no-store'})
      .then(async res => { const data = await res.json(); if (!res.ok || data.error) throw new Error(data.error || 'Dashboard unavailable.'); return data; })
      .then((data) => {
        if (active && data && !data.error) {
          setLiveData(data);
          lastLoadedAt.current = Date.now();
        }
      })
      .catch(error => { if (active && error?.name !== 'AbortError') setLoadError(error.message || 'Dashboard unavailable.'); })
      .finally(() => { if (active) setRefreshing(false); });
    return () => {
      active = false;
    };
  }, [isLive, revision, companySession?.company?.name, companySession?.profitUnlocked, summaryFrom, summaryTo]);

  useEffect(() => {
    const refresh = () => {
      if (Date.now() - lastLoadedAt.current > 30_000) setRevision(value => value + 1);
    };
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, []);

  // Demo fallbacks
  const demoSales = state.bills.filter((b) => b.kind !== 'Quotation' && b.status === 'Issued');
  const demoLow = state.products.filter((p) => p.stock <= p.low);

  const customerDues = isLive && liveData ? (liveData.dues?.customerOutstandingPaise || 0) / 100 : 0;
  const supplierDues = isLive && liveData ? (liveData.dues?.supplierOutstandingPaise || 0) / 100 : 0;

  const activeJobsCount = isLive && liveData
    ? liveData.serviceJobs?.activeCount ?? 0
    : state.jobs.filter((j) => j.status !== 'Delivered').length;

  const readyJobsCount = isLive && liveData
    ? liveData.serviceJobs?.readyCount ?? 0
    : state.jobs.filter((j) => j.status === 'Ready').length;

  const lowStockCount = isLive && liveData
    ? liveData.inventory?.lowStockCount ?? 0
    : demoLow.length;

  const recentInvoices = isLive && liveData
    ? liveData.recentInvoices || []
    : demoSales.slice(0, 4).map((b) => ({
        id: b.id,
        invoiceNumber: b.id,
        customerName: state.customers.find((c) => c.id === b.customerId)?.name || 'Customer',
        category: b.category,
        amountPaise: Math.round(roundedTotal(b) * 100),
        duePaise: Math.round(balance(state, b) * 100),
        paymentStatus: balance(state, b) === 0 ? 'Paid' : 'Partial',
      }));

  const todayMovements = isLive && liveData
    ? liveData.todayMovements || []
    : state.payments
        .filter((p) => p.date === TODAY)
        .slice(0, 4)
        .map((p) => ({
          id: p.id,
          purpose: p.purpose,
          account: p.account,
          direction: p.direction,
          amountPaise: Math.round(p.amount * 100),
        }));

  const demoPeriodBills = demoSales.filter(b => b.date >= summaryFrom && b.date <= summaryTo);
  const demoPeriodPayments = state.payments.filter(p => p.date >= summaryFrom && p.date <= summaryTo);
  const demoCashIn = demoPeriodPayments.filter(p => p.direction === 'In' && p.account === 'Cash').reduce((sum, p) => sum + p.amount, 0);
  const demoBankIn = demoPeriodPayments.filter(p => p.direction === 'In' && p.account !== 'Cash').reduce((sum, p) => sum + p.amount, 0);
  const demoCashOut = demoPeriodPayments.filter(p => p.direction === 'Out' && p.account === 'Cash').reduce((sum, p) => sum + p.amount, 0);
  const demoBankOut = demoPeriodPayments.filter(p => p.direction === 'Out' && p.account !== 'Cash').reduce((sum, p) => sum + p.amount, 0);
  const periodSummary = isLive && liveData?.periodSummary
    ? liveData.periodSummary
    : {
        dateFrom: summaryFrom,
        dateTo: summaryTo,
        sales: {
          totalPaise: Math.round(demoPeriodBills.reduce((sum, bill) => sum + roundedTotal(bill), 0) * 100),
          invoiceCount: demoPeriodBills.length,
          newGoodsPaise: Math.round(demoPeriodBills.filter(b => b.category === 'New goods').reduce((sum, bill) => sum + roundedTotal(bill), 0) * 100),
          usedGoodsPaise: Math.round(demoPeriodBills.filter(b => b.category === 'Used goods').reduce((sum, bill) => sum + roundedTotal(bill), 0) * 100),
          servicePaise: Math.round(demoPeriodBills.filter(b => b.category === 'Service').reduce((sum, bill) => sum + roundedTotal(bill), 0) * 100),
          cashReceivedPaise: Math.round(demoCashIn * 100),
          bankReceivedPaise: Math.round(demoBankIn * 100),
        },
        expenses: {cashPaise: Math.round(demoCashOut * 100), bankPaise: Math.round(demoBankOut * 100), totalPaise: Math.round((demoCashOut + demoBankOut) * 100)},
        collections: {cashPaise: Math.round(demoCashIn * 100), bankPaise: Math.round(demoBankIn * 100), totalPaise: Math.round((demoCashIn + demoBankIn) * 100)},
        supplierPayments: {cashPaise: 0, bankPaise: 0, totalPaise: 0},
        customerRefunds: {cashPaise: 0, bankPaise: 0, totalPaise: 0},
        accountPosition: {
          openingCashPaise: Math.round(accountBalance(state, 'Cash', summaryFrom) * 100),
          openingBankPaise: Math.round(accountBalance(state, 'Bank account', summaryFrom) * 100),
          openingCombinedPaise: Math.round((accountBalance(state, 'Cash', summaryFrom) + accountBalance(state, 'Bank account', summaryFrom)) * 100),
          cashInPaise: Math.round(demoCashIn * 100), bankInPaise: Math.round(demoBankIn * 100),
          cashOutPaise: Math.round(demoCashOut * 100), bankOutPaise: Math.round(demoBankOut * 100),
          closingCashPaise: Math.round(accountBalance(state, 'Cash', summaryTo) * 100),
          closingBankPaise: Math.round(accountBalance(state, 'Bank account', summaryTo) * 100),
          closingCombinedPaise: Math.round((accountBalance(state, 'Cash', summaryTo) + accountBalance(state, 'Bank account', summaryTo)) * 100),
        },
        profit: {unlocked: false, tradingProfitPaise: null, netProfitPaise: null, pendingCount: 0},
      };

  const overviewSalesTotal = (periodSummary.sales.totalPaise || 0) / 100;
  const overviewSalesCount = periodSummary.sales.invoiceCount || 0;
  const overviewMoneyIn = ((periodSummary.accountPosition.cashInPaise || 0) + (periodSummary.accountPosition.bankInPaise || 0)) / 100;
  const overviewMoneyOut = ((periodSummary.accountPosition.cashOutPaise || 0) + (periodSummary.accountPosition.bankOutPaise || 0)) / 100;
  const overviewCashBalance = (periodSummary.accountPosition.closingCashPaise || 0) / 100;
  const overviewBankBalance = (periodSummary.accountPosition.closingBankPaise || 0) / 100;
  const overviewPeriod = periodSummary.dateFrom === periodSummary.dateTo
    ? periodSummary.dateTo
    : `${periodSummary.dateFrom} to ${periodSummary.dateTo}`;

  const companyName = state.settings.name || (isLive ? 'Company setup required' : 'iTech Computers');
  const userName = companySession?.user?.name || 'Store Manager';

  if (isLive && !liveData) return <div className="dashboard-page">
    <PageHead title="Dashboard" description={loadError || 'Loading the latest company summary…'}/>
    {loadError ? <button className="btn" onClick={() => setRevision(v => v + 1)}>Retry</button> : (
      <div className="dashboard-loading-grid" aria-label="Loading dashboard">
        {Array.from({length: 8}, (_, index) => <div className="dashboard-skeleton" key={index}/>) }
      </div>
    )}
  </div>;

  return (
    <div className="dashboard-page">
      <PageHead
        title="Dashboard"
        description="A clear view of your store, all in one place."
        actions={
          <>
            <label className="date-chip dashboard-date-picker" title="Choose the business date used by the financial summary below">
              <CalendarDays size={16} />
              <span className="sr-only">Dashboard date</span>
              <input
                aria-label="Dashboard date"
                type="date"
                value={dashboardDate}
                max={isLive ? (liveData?.todayDate || TODAY) : TODAY}
                onChange={event => changeDashboardDate(event.target.value)}
              />
            </label>
            <Link className="btn" href="/sales/new">
              <Plus size={17} />
              New invoice
            </Link>
          </>
        }
      />

      <section className="welcome-strip dashboard-hero" aria-label="Today at a glance">
        <div className="dashboard-hero-copy">
          <span className="sun-icon" aria-hidden="true">☀</span>
          <div>
            <span className="dashboard-hero-kicker">Today at a glance</span>
            <strong>Welcome back, {userName}</strong>
            <p>{companyName} · Review sales, balances and work waiting for action.</p>
          </div>
        </div>
        <div className="dashboard-hero-actions">
          <Link href="/dues" className="dashboard-hero-link">Review dues</Link>
          <Link href="/register">
            Cash & account <ArrowUpRight size={17} />
          </Link>
        </div>
      </section>

      {refreshing && <div className="dashboard-refreshing" role="status">Refreshing dashboard…</div>}

      <section className="dashboard-section dashboard-money-section" aria-labelledby="money-overview-title">
        <div className="dashboard-section-head">
          <div>
            <span>Business snapshot</span>
            <h2 id="money-overview-title">Money overview</h2>
          </div>
          <p>Sales and account activity for {overviewPeriod}.</p>
        </div>
        <div className="dashboard-kpi-grid">
          <Stat label="Sales billed" value={shortMoney(overviewSalesTotal)} detail={`${overviewSalesCount} invoice${overviewSalesCount === 1 ? '' : 's'} in this period`} icon={<IndianRupee size={20} />} />
          <Stat label="Money received" value={shortMoney(overviewMoneyIn)} detail="All cash and bank inflows" icon={<ArrowDownCircle size={20} />} accent="green" />
          <Stat label="Money paid" value={shortMoney(overviewMoneyOut)} detail="All cash and bank outflows" icon={<ArrowUpCircle size={20} />} accent="orange" />
          <Stat label="Cash in drawer" value={shortMoney(overviewCashBalance)} detail={`Closing balance on ${periodSummary.dateTo}`} icon={<Wallet size={20} />} accent="blue" />
          <Stat label="Bank balance" value={shortMoney(overviewBankBalance)} detail={`Closing balance on ${periodSummary.dateTo}`} icon={<Landmark size={20}/>} />
        </div>
      </section>

      <section className="dashboard-section dashboard-finance-summary" aria-labelledby="dashboard-summary-title">
        <div className="dashboard-section-head dashboard-summary-heading">
          <div>
            <span>Financial summary</span>
            <h2 id="dashboard-summary-title">Sales, spending and funds</h2>
          </div>
          <div className="dashboard-summary-filters" aria-label="Summary period">
            <button className={summaryPreset === 'today' ? 'active' : ''} onClick={() => setSummaryPreset('today')}>Today</button>
            <button className={summaryPreset === '7d' ? 'active' : ''} onClick={() => setSummaryPreset('7d')}>7D</button>
            <button className={summaryPreset === 'custom' ? 'active' : ''} onClick={() => setSummaryPreset('custom')}>Custom</button>
          </div>
        </div>

        <div className="dashboard-date-scope">
          <CalendarDays size={18} aria-hidden="true" />
          <div>
            <span>Selected business date</span>
            <strong>{dashboardDate}</strong>
          </div>
          <p>{summaryPreset === 'today' ? 'Showing this date only.' : summaryPreset === '7d' ? 'The 7-day summary ends on this date.' : 'Showing the custom range selected below.'}</p>
        </div>

        {summaryPreset === 'custom' && (
          <div className="dashboard-summary-custom">
            <label>From<input type="date" value={customFrom} max={customTo} onChange={event => setCustomFrom(event.target.value || dashboardDate)} /></label>
            <label>To<input type="date" value={customTo} min={customFrom} max={dashboardDate} onChange={event => setCustomTo(event.target.value || dashboardDate)} /></label>
          </div>
        )}

        <div className="dashboard-summary-period">{periodSummary.dateFrom} to {periodSummary.dateTo}</div>
        <div className="dashboard-finance-grid">
          <article><h3>Overall sales</h3><dl><div><dt>Cash received</dt><dd>{money(periodSummary.sales.cashReceivedPaise / 100)}</dd></div><div><dt>GPay / Bank received</dt><dd>{money(periodSummary.sales.bankReceivedPaise / 100)}</dd></div><div><dt>Outstanding on these invoices</dt><dd>{money((periodSummary.sales.outstandingPaise || 0) / 100)}</dd></div><div className="total"><dt>Sales billed</dt><dd>{money(periodSummary.sales.totalPaise / 100)}</dd></div></dl></article>
          <article><h3>Expenses</h3><dl><div><dt>Cash</dt><dd>{money(periodSummary.expenses.cashPaise / 100)}</dd></div><div><dt>GPay / Bank</dt><dd>{money(periodSummary.expenses.bankPaise / 100)}</dd></div><div className="total"><dt>Total expenses</dt><dd>{money(periodSummary.expenses.totalPaise / 100)}</dd></div></dl></article>
          <article><h3>Grand total</h3><dl><div><dt>Cash in drawer</dt><dd>{money(periodSummary.accountPosition.closingCashPaise / 100)}</dd></div><div><dt>GPay / Bank</dt><dd>{money(periodSummary.accountPosition.closingBankPaise / 100)}</dd></div><div className="total"><dt>Total funds</dt><dd>{money(periodSummary.accountPosition.closingCombinedPaise / 100)}</dd></div></dl></article>
          <article><h3>Profit</h3><dl><div><dt>Trading profit</dt><dd>{periodSummary.profit.unlocked ? money((periodSummary.profit.tradingProfitPaise || 0) / 100) : 'Hidden'}</dd></div><div><dt>Shop expenses</dt><dd>{money(periodSummary.expenses.totalPaise / 100)}</dd></div><div className="total"><dt>Net profit</dt><dd>{periodSummary.profit.unlocked ? money((periodSummary.profit.netProfitPaise || 0) / 100) : 'Hidden'}</dd></div></dl></article>
        </div>

        <div className="dashboard-summary-categories">
          <span>Invoices <b>{periodSummary.sales.invoiceCount}</b></span><span>New <b>{money(periodSummary.sales.newGoodsPaise / 100)}</b></span><span>Used <b>{money(periodSummary.sales.usedGoodsPaise / 100)}</b></span><span>Service <b>{money(periodSummary.sales.servicePaise / 100)}</b></span>
        </div>
        <div className="dashboard-summary-flow">
          <article><span>Customer collections</span><strong>{money(periodSummary.collections.totalPaise / 100)}</strong><small>Cash {money(periodSummary.collections.cashPaise / 100)} · Bank/GPay {money(periodSummary.collections.bankPaise / 100)}</small></article>
          <article><span>Supplier payments</span><strong>{money(periodSummary.supplierPayments.totalPaise / 100)}</strong><small>Cash {money(periodSummary.supplierPayments.cashPaise / 100)} · Bank/GPay {money(periodSummary.supplierPayments.bankPaise / 100)}</small></article>
          <article><span>Customer refunds</span><strong>{money(periodSummary.customerRefunds.totalPaise / 100)}</strong><small>Cash {money(periodSummary.customerRefunds.cashPaise / 100)} · Bank/GPay {money(periodSummary.customerRefunds.bankPaise / 100)}</small></article>
          <article><span>Net account movement</span><strong>{money((periodSummary.accountPosition.cashInPaise + periodSummary.accountPosition.bankInPaise - periodSummary.accountPosition.cashOutPaise - periodSummary.accountPosition.bankOutPaise) / 100)}</strong><small>All receipts less all payments</small></article>
        </div>
        <div className="dashboard-summary-position">
          <article><span>Opening funds</span><strong>{money(periodSummary.accountPosition.openingCombinedPaise / 100)}</strong><small>Cash {money(periodSummary.accountPosition.openingCashPaise / 100)} · Bank/GPay {money(periodSummary.accountPosition.openingBankPaise / 100)}</small></article>
          <article><span>Money moved</span><strong>{money((periodSummary.accountPosition.cashInPaise + periodSummary.accountPosition.bankInPaise - periodSummary.accountPosition.cashOutPaise - periodSummary.accountPosition.bankOutPaise) / 100)}</strong><small>In {money((periodSummary.accountPosition.cashInPaise + periodSummary.accountPosition.bankInPaise) / 100)} · Out {money((periodSummary.accountPosition.cashOutPaise + periodSummary.accountPosition.bankOutPaise) / 100)}</small></article>
          <article><span>Closing funds</span><strong>{money(periodSummary.accountPosition.closingCombinedPaise / 100)}</strong><small>Cash {money(periodSummary.accountPosition.closingCashPaise / 100)} · Bank/GPay {money(periodSummary.accountPosition.closingBankPaise / 100)}</small></article>
        </div>
      </section>

      <section className="dashboard-section dashboard-action-section" aria-labelledby="attention-title">
        <div className="dashboard-section-head">
          <div>
            <span>Action centre</span>
            <h2 id="attention-title">Needs attention</h2>
          </div>
          <p>Open only the work that needs a decision today.</p>
        </div>
      <div className="dashboard-attention-grid">
        <Link href="/dues" className="attention-card"><HandCoins size={20}/><div><span>Customer dues</span><strong>{shortMoney(customerDues)}</strong><small>Amount still to collect</small></div><ArrowUpRight size={17}/></Link>
        <Link href="/dues" className="attention-card"><ArrowOut size={20}/><div><span>Supplier dues</span><strong>{shortMoney(supplierDues)}</strong><small>Amount still to pay</small></div><ArrowUpRight size={17}/></Link>
        <Link href="/services" className="attention-card"><Wrench size={20}/><div><span>Service work</span><strong>{String(activeJobsCount).padStart(2, '0')}</strong><small>{readyJobsCount} ready for collection</small></div><ArrowUpRight size={17}/></Link>
        <Link href="/inventory" className="attention-card"><Package size={20}/><div><span>Low stock</span><strong>{String(lowStockCount).padStart(2, '0')}</strong><small>Products at reorder level</small></div><ArrowUpRight size={17}/></Link>
      </div>
      </section>

      <section className="dashboard-analytics-region" aria-labelledby="performance-title">
        <div className="dashboard-section-head">
          <div>
            <span>Performance</span>
            <h2 id="performance-title">Sales activity</h2>
          </div>
          <p>See how issued sales are moving over time.</p>
        </div>
        {isLive ? <LiveSalesChart rows={liveData?.salesTrend || []} today={liveData?.todayDate || TODAY}/> : <Analytics />}
      </section>

      <section className="dashboard-records-region" aria-labelledby="activity-title">
        <div className="dashboard-section-head">
          <div>
            <span>Recent activity</span>
            <h2 id="activity-title">Latest business records</h2>
          </div>
          <p>Invoices and money movements from today.</p>
        </div>
      <div className="dashboard-bottom">
        <Card
          title="Recent invoices"
          sub="Your latest sales and service bills"
          actions={
            <Link href="/sales" className="text-link">
              View all <ArrowUpRight size={15} />
            </Link>
          }
        >
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Invoice / customer</th>
                  <th>Category</th>
                  <th>Amount</th>
                  <th>Payment</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {recentInvoices.map((b: any) => (
                  <tr key={b.id}>
                    <td>
                      <Link className="record-link" href={'/sales/' + b.id}>
                        {b.invoiceNumber || b.id}
                      </Link>
                      <small>{b.customerName}</small>
                    </td>
                    <td>{b.category}</td>
                    <td className="amount">{money((b.amountPaise || 0) / 100)}</td>
                    <td>
                      <Badge>
                        {b.paymentStatus === 'Paid' || b.duePaise === 0 ? 'Paid' : 'Partial / Due'}
                      </Badge>
                    </td>
                    <td>
                      <Link href={'/sales/' + b.id} aria-label={'View ' + b.id}>
                        <ArrowUpRight size={17} />
                      </Link>
                    </td>
                  </tr>
                ))}
                {!recentInvoices.length && (
                  <tr>
                    <td colSpan={5} style={{textAlign: 'center', padding: '16px'}} className="muted">
                      No invoices recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Money today" sub="Actual receipts and payments">
          <div className="money-list">
            {todayMovements.map((p: any) => (
              <div key={p.id}>
                <span
                  className={`money-icon ${p.direction === 'In' ? 'green' : 'orange'}`}
                >
                  {p.direction === 'In' ? <ArrowDownLeft size={17} /> : <ArrowOut size={17} />}
                </span>
                <div>
                  <strong>{p.purpose}</strong>
                  <small>{p.account}</small>
                </div>
                <b className={p.direction === 'In' ? 'positive' : ''}>
                  {p.direction === 'In' ? '+' : '−'}
                  {money((p.amountPaise || 0) / 100)}
                </b>
              </div>
            ))}
            {!todayMovements.length && (
              <p className="muted" style={{padding: '16px', textAlign: 'center'}}>
                No cash or bank movements recorded today.
              </p>
            )}
          </div>
          <Link className="card-bottom-link" href="/register">
            View all transactions <ArrowUpRight size={16} />
          </Link>
        </Card>
      </div>
      </section>
    </div>
  );
}
