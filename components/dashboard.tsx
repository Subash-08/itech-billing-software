'use client';
import {useState, useEffect} from 'react';
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
} from 'lucide-react';
import {useStore} from './store';
import {Card, Stat, PageHead, Badge} from './ui';
import {TODAY, roundedTotal, money, shortMoney, accountBalance, balance} from '@/lib/domain';

export default function Dashboard() {
  const {state, isLive, companySession} = useStore();
  const [liveData, setLiveData] = useState<any>(null);
  const [loadError, setLoadError] = useState('');
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!isLive) return;
    let active = true;
    setLiveData(null); setLoadError('');
    fetch('/api/company/dashboard')
      .then(async res => { const data = await res.json(); if (!res.ok || data.error) throw new Error(data.error || 'Dashboard unavailable.'); return data; })
      .then((data) => {
        if (active && data && !data.error) setLiveData(data);
      })
      .catch(error => { if (active) setLoadError(error.message || 'Dashboard unavailable.'); });
    return () => {
      active = false;
    };
  }, [isLive, revision, companySession?.company?.name]);

  useEffect(() => { const refresh = () => setRevision(v => v + 1); window.addEventListener('focus', refresh); return () => window.removeEventListener('focus', refresh); }, []);

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

  if (isLive && !liveData) return <><PageHead title="Dashboard" description={loadError || 'Loading live company figures…'}/>{loadError && <button className="btn" onClick={() => setRevision(v => v + 1)}>Retry</button>}</>;

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
            <p>
              Here’s what’s happening at {companyName} today
              {isLive ? ' (Live Store Account)' : ' (Interactive Demo)'}.
            </p>
          </div>
        </div>
        <Link href="/register">
          Open cash & account <ArrowUpRight size={17} />
        </Link>
      </div>

      <div className="stats-grid">
        <Stat
          label="Today’s sales"
          value={shortMoney(todaySalesTotal)}
          detail={`${todaySalesCount} invoices issued today`}
          icon={<IndianRupee size={20} />}
        />
        <Stat
          label="Cash in drawer"
          value={shortMoney(cashBalance)}
          detail="Physical drawer balance"
          icon={<Wallet size={20} />}
          accent="green"
        />
        <Stat
          label="Active service jobs"
          value={String(activeJobsCount).padStart(2, '0')}
          detail={`${readyJobsCount} ready for customer collection`}
          icon={<Wrench size={20} />}
          accent="orange"
        />
        <Stat
          label="Low stock items"
          value={String(lowStockCount).padStart(2, '0')}
          detail="Review items below reorder level"
          icon={<Package size={20} />}
          accent="blue"
        />
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
