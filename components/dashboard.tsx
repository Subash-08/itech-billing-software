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

export default function Dashboard() {
  const {state, isLive, companySession} = useStore();
  const [liveData, setLiveData] = useState<any>(null);
  const [loadError, setLoadError] = useState('');
  const [revision, setRevision] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const lastLoadedAt = useRef(0);

  useEffect(() => {
    if (!isLive) return;
    const controller = new AbortController();
    let active = true;
    setLoadError(''); setRefreshing(true);
    fetch('/api/company/dashboard', {signal: controller.signal, cache: 'no-store'})
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
      controller.abort();
    };
  }, [isLive, revision, companySession?.company?.name]);

  useEffect(() => {
    const refresh = () => {
      if (Date.now() - lastLoadedAt.current > 30_000) setRevision(value => value + 1);
    };
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, []);

  // Demo fallbacks
  const demoSales = state.bills.filter((b) => b.kind !== 'Quotation' && b.status === 'Issued');
  const demoToday = demoSales.filter((b) => b.date === TODAY);
  const demoLow = state.products.filter((p) => p.stock <= p.low);

  const todaySalesTotal = isLive && liveData
    ? (liveData.sales?.todayTotalPaise || 0) / 100
    : demoToday.reduce((a, b) => a + roundedTotal(b), 0);

  const todaySalesCount = isLive && liveData
    ? (liveData.sales?.todayCount || 0)
    : demoToday.length;

  const cashBalance = isLive && liveData
    ? (liveData.cash?.balancePaise || 0) / 100
    : accountBalance(state, 'Cash');

  const bankBalance = isLive && liveData ? (liveData.bank?.balancePaise || 0) / 100 : accountBalance(state, 'Bank account');
  const moneyInToday = isLive && liveData ? (liveData.moneyToday?.inPaise || 0) / 100 : 0;
  const moneyOutToday = isLive && liveData ? (liveData.moneyToday?.outPaise || 0) / 100 : 0;
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

  const companyName = companySession?.company?.name || state.settings.name || 'iTech Computers';
  const userName = companySession?.user?.name || 'Store Manager';

  if (isLive && !liveData) return <>
    <PageHead title="Dashboard" description={loadError || 'Loading the latest company summary…'}/>
    {loadError ? <button className="btn" onClick={() => setRevision(v => v + 1)}>Retry</button> : (
      <div className="dashboard-loading-grid" aria-label="Loading dashboard">
        {Array.from({length: 8}, (_, index) => <div className="dashboard-skeleton" key={index}/>) }
      </div>
    )}
  </>;

  return (
    <>
      <PageHead
        title="Dashboard"
        description="A clear view of your store, all in one place."
        actions={
          <>
            <span className="date-chip">
              <CalendarDays size={16} />
              {isLive ? liveData?.todayDate : '10 September 2026'}
            </span>
            <Link className="btn" href="/sales/new">
              <Plus size={17} />
              New invoice
            </Link>
          </>
        }
      />

      <div className="welcome-strip">
        <div>
          <span className="sun-icon">☀</span>
          <div>
            <strong>Welcome, {userName}</strong>
            <p>Here’s what’s happening at {companyName} today.</p>
          </div>
        </div>
        <Link href="/register">
          Open cash & account <ArrowUpRight size={17} />
        </Link>
      </div>

      {refreshing && <div className="dashboard-refreshing" role="status">Refreshing dashboard…</div>}

      <div className="dashboard-kpi-grid">
        <Stat
          label="Today’s sales"
          value={shortMoney(todaySalesTotal)}
          detail={`${todaySalesCount} invoices issued today`}
          icon={<IndianRupee size={20} />}
        />
        <Stat
          label="Money received today"
          value={shortMoney(moneyInToday)}
          detail="Cash and bank inflows"
          icon={<ArrowDownCircle size={20} />}
          accent="green"
        />
        <Stat
          label="Money paid today"
          value={shortMoney(moneyOutToday)}
          detail="Expenses, suppliers and refunds"
          icon={<ArrowUpCircle size={20} />}
          accent="orange"
        />
        <Stat
          label="Cash in drawer"
          value={shortMoney(cashBalance)}
          detail="Current physical cash balance"
          icon={<Wallet size={20} />}
          accent="blue"
        />
        <Stat label="Bank balance" value={shortMoney(bankBalance)} detail="Current account balance" icon={<Landmark size={20}/>} />
      </div>

      <div className="dashboard-attention-grid">
        <Link href="/dues" className="attention-card"><HandCoins size={20}/><div><span>Customer dues</span><strong>{shortMoney(customerDues)}</strong><small>Amount still to collect</small></div><ArrowUpRight size={17}/></Link>
        <Link href="/dues" className="attention-card"><ArrowOut size={20}/><div><span>Supplier dues</span><strong>{shortMoney(supplierDues)}</strong><small>Amount still to pay</small></div><ArrowUpRight size={17}/></Link>
        <Link href="/services" className="attention-card"><Wrench size={20}/><div><span>Service work</span><strong>{String(activeJobsCount).padStart(2, '0')}</strong><small>{readyJobsCount} ready for collection</small></div><ArrowUpRight size={17}/></Link>
        <Link href="/inventory" className="attention-card"><Package size={20}/><div><span>Low stock</span><strong>{String(lowStockCount).padStart(2, '0')}</strong><small>Products at reorder level</small></div><ArrowUpRight size={17}/></Link>
      </div>

      {isLive ? <LiveSalesChart rows={liveData?.salesTrend || []} today={liveData?.todayDate || TODAY}/> : <Analytics />}

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
    </>
  );
}
