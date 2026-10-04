'use client';
import ProfitAccess from './profit-access';
import Link from 'next/link';
import {usePathname, useRouter} from 'next/navigation';
import {useEffect, useRef, useState, ReactNode} from 'react';
import {
  Monitor,
  LayoutDashboard,
  Users,
  MessageSquareText,
  ShoppingCart,
  FileText,
  Wrench,
  Package,
  Truck,
  CalendarClock,
  Wallet,
  ArrowLeftRight,
  ShieldCheck,
  BarChart3,
  Settings,
  Bell,
  Search,
  ChevronDown,
  Menu,
  X,
  LogOut,
  Building2,
  UserRound,
} from 'lucide-react';
import {useStore} from './store';

const primaryItems = [
  ['/', 'Dashboard', LayoutDashboard],
  ['/profit', 'Daily closing', Wallet],
  ['/sales', 'Sales & invoices', ShoppingCart],
  ['/enquiries', 'Enquiries', MessageSquareText],
  ['/quotations', 'Quotations', FileText],
  ['/services', 'Service jobs', Wrench],
] as const;

const groups = [
  {
    label: 'Customers & service',
    items: [
      ['/customers', 'Customers', Users],
      ['/service-catalog', 'Service catalogue', Wrench],
      ['/warranty', 'Warranty', ShieldCheck],
    ],
  },
  {
    label: 'Stock & purchases',
    items: [
      ['/inventory', 'Inventory', Package],
      ['/purchases', 'Purchases', Truck],
      ['/suppliers', 'Suppliers', Users],
      ['/reservations', 'Stock holds', CalendarClock],
      ['/returns', 'Returns & refunds', ArrowLeftRight],
    ],
  },
  {
    label: 'Money & reports',
    items: [
      ['/register', 'Cash & account', Wallet],
      ['/dues', 'Dues & reminders', CalendarClock],
      ['/reports', 'Reports', BarChart3],
    ],
  },
  {
    label: 'Documents & settings',
    items: [
      ['/documents', 'Document library', FileText],
      ['/templates', 'Invoice templates', FileText],
      ['/communication', 'WhatsApp & offers', MessageSquareText],
      ['/settings', 'Settings', Settings],
      ['/account', 'Company account', Users],
    ],
  },
];

export default function Shell({children}: {children: ReactNode}) {
  const path = usePathname();
  const router = useRouter();
  const {state, isLive, isLoading, companySession, refreshMasterData, notify, loginAsLiveCompany} = useStore();
  const [mobile, setMobile] = useState(false);
  const [query, setQuery] = useState('');
  const [notifications, setNotifications] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      groups.map((group) => [
        group.label,
        group.items.some(([url]) => path.startsWith(url as string)),
      ]),
    ),
  );
  const accountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const activeGroup = groups.find((group) =>
      group.items.some(([url]) => path.startsWith(url as string)),
    );
    if (activeGroup) {
      setOpenGroups((current) => ({...current, [activeGroup.label]: true}));
    }
  }, [path]);

  useEffect(() => {
    function closeMenus(event: MouseEvent) {
      if (accountRef.current && !accountRef.current.contains(event.target as Node)) setAccountOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setAccountOpen(false);
        setNotifications(false);
      }
    }
    document.addEventListener('mousedown', closeMenus);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeMenus);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, []);

  const userName = isLive ? companySession?.user?.name || 'Company user' : 'Demo user';
  const userEmail = isLive ? companySession?.user?.email || '' : '';
  const missingCompanyDetails = isLive ? [
    !state.settings.name?.trim() && 'shop name',
    !state.settings.phone?.trim() && 'contact phone',
    !state.settings.address?.trim() && 'shop address',
    !state.settings.state?.trim() && 'state name',
    !state.settings.stateCode?.trim() && 'GST state code',
    !state.settings.postalCode?.trim() && 'postal code',
  ].filter(Boolean) as string[] : [];
  const companySetupComplete = !isLive || missingCompanyDetails.length === 0;
  const companyName = isLive ? state.settings.name?.trim() || 'Company setup required' : 'iTech Computers';
  const setupPageAllowed = path.startsWith('/settings') || path.startsWith('/account');
  const initials = userName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'U';

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      const response = await fetch('/api/auth/logout', {method: 'POST'});
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || 'Sign out failed.');
      }
      setAccountOpen(false);
      await refreshMasterData();
      notify('Signed out. Demo workspace is now active.');
      router.push('/account');
      router.refresh();
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Sign out failed. Try again.');
    } finally {
      setSigningOut(false);
    }
  }

  const customers = query
    ? state.customers.filter((c) => (c.name + c.phone).toLowerCase().includes(query.toLowerCase())).slice(0, 3)
    : [];
  const products = query
    ? state.products.filter((p) => (p.name + (p.model || '')).toLowerCase().includes(query.toLowerCase())).slice(0, 3)
    : [];

  return (
    <div className="app">
      <aside className={`sidebar ${mobile ? 'open' : ''}`}>
        <Link href="/" className="brand">
          <div className="brand-icon">
            <Monitor size={24} />
          </div>
          <div>
            <strong>
              iTech<span>Computers</span>
            </strong>
            <small>STORE MANAGER</small>
          </div>
        </Link>
        <button className="mobile-close icon-btn" onClick={() => setMobile(false)} aria-label="Close navigation">
          <X />
        </button>
        <nav>
          <div className="nav-primary">
            {primaryItems.map(([url, label, Icon]) => {
              const active = url === '/' ? path === '/' : path.startsWith(url);
              return (
                <Link
                  onClick={() => setMobile(false)}
                  className={`nav-link ${active ? 'active' : ''}`}
                  href={url}
                  key={url}
                >
                  <Icon size={18} />
                  <span>{label}</span>
                </Link>
              );
            })}
          </div>
          {groups.map((g) => (
            <div className={`nav-group collapsible ${openGroups[g.label] ? 'open' : ''}`} key={g.label}>
              <button
                type="button"
                className="nav-group-toggle"
                aria-expanded={Boolean(openGroups[g.label])}
                onClick={() => setOpenGroups((current) => ({...current, [g.label]: !current[g.label]}))}
              >
                <span>{g.label}</span>
                <ChevronDown size={15} aria-hidden="true" />
              </button>
              {openGroups[g.label] && (
                <div className="nav-group-items">
                  {g.items.map(([url, label, Icon]) => {
                    const I = Icon as typeof Monitor;
                    return (
                      <Link
                        onClick={() => setMobile(false)}
                        className={`nav-link ${path.startsWith(url as string) ? 'active' : ''}`}
                        href={url as string}
                        key={url as string}
                      >
                        <I size={18} />
                        <span>{label as string}</span>
                        {url === '/services' && (
                          <small>{state.jobs.filter((j) => j.status !== 'Delivered').length}</small>
                        )}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="store-location">
            <span className="online-dot" />
            {isLive ? companyName : 'Salem store'} <span>01</span>
          </div>
          <small>Single branch · All records retained</small>
        </div>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <button className="icon-btn mobile-toggle" onClick={() => setMobile(true)} aria-label="Open navigation">
            <Menu />
          </button>
          <div className="global-search">
            <Search size={18} />
            <input
              aria-label="Search customers or products"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search customers, products…"
            />
            <kbd>Search</kbd>
            {query && (
              <div className="search-results">
                {customers.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => {
                      router.push('/customers/' + c.id);
                      setQuery('');
                    }}
                  >
                    <Users size={16} />
                    <div>
                      {c.name}
                      <small>{c.phone}</small>
                    </div>
                  </button>
                ))}
                {products.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      router.push('/inventory/' + p.id);
                      setQuery('');
                    }}
                  >
                    <Package size={16} />
                    <div>
                      {p.name}
                      <small>{p.model}</small>
                    </div>
                  </button>
                ))}
                {!customers.length && !products.length && <p>No matches found.</p>}
              </div>
            )}
          </div>
          <div className="topbar-actions">
            {isLoading ? (
              <span className="session-pill loading">Checking account…</span>
            ) : !isLive ? (
              <span className="demo-pill">Demo workspace</span>
            ) : null}
            <ProfitAccess />
            <div className="notification-wrap">
            <button
              className="icon-btn notification-button"
              aria-label="Notifications"
              onClick={() => setNotifications(!notifications)}
            >
              <Bell size={20} />
              <i />
            </button>
            {notifications && (
              <div className="notification-panel">
                <strong>Needs your attention</strong>
                <Link href="/inventory" onClick={() => setNotifications(false)}>
                  2 products are running low
                </Link>
                <Link href="/services/JOB-041" onClick={() => setNotifications(false)}>
                  HP Pavilion ready for collection
                </Link>
                <Link href="/profit" onClick={() => setNotifications(false)}>
                  Complete today’s profit entries
                </Link>
              </div>
            )}
            </div>
            <div className="account-menu-wrap" ref={accountRef}>
            <button
              className="user-menu"
              type="button"
              aria-label="Open account menu"
              aria-haspopup="menu"
              aria-expanded={accountOpen}
              onClick={() => setAccountOpen((open) => !open)}
            >
              <div className="avatar">{initials}</div>
              <div>
                <strong>{userName}</strong>
                <span>{isLive ? companyName : 'Demo workspace'}</span>
              </div>
              <ChevronDown size={15} />
            </button>
            {accountOpen && (
              <div className="account-menu-panel" role="menu">
                <div className="account-menu-identity">
                  <div className="avatar">{initials}</div>
                  <div>
                    <strong>{userName}</strong>
                    <small>{userEmail || 'Sample data only'}</small>
                  </div>
                </div>
                <div className={`account-data-status ${isLive ? 'live' : 'demo'}`}>
                  <span className="online-dot" />
                  <div>
                    <strong>{isLive ? 'Company account' : 'Demo workspace'}</strong>
                    <small>{isLive ? companyName : 'Changes reset when the page reloads'}</small>
                  </div>
                </div>
                <Link href="/account" role="menuitem" onClick={() => setAccountOpen(false)}>
                  <UserRound size={16} /> Company account
                </Link>
                {isLive && (
                  <Link href="/settings" role="menuitem" onClick={() => setAccountOpen(false)}>
                    <Building2 size={16} /> Company settings
                  </Link>
                )}
                {isLive ? (
                  <button type="button" role="menuitem" onClick={signOut} disabled={signingOut}>
                    <LogOut size={16} /> {signingOut ? 'Signing out…' : 'Sign out'}
                  </button>
                ) : (
                  <Link href="/account" className="account-sign-in" role="menuitem" onClick={() => setAccountOpen(false)}>
                    Sign in to live data
                  </Link>
                )}
              </div>
            )}
            </div>
          </div>
        </header>

        <main>
          {!isLive && (
            <div className="module-migration-notice preview" role="status" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem'}}>
              <div>
                <strong>Demo workspace:</strong> Changes are saved to local browser storage. Connect your live company account to persist directly in the multi-tenant database.
              </div>
              <button
                type="button"
                className="btn"
                style={{padding: '0.35rem 0.85rem', fontSize: '0.82rem', whiteSpace: 'nowrap'}}
                onClick={async () => {
                  const ok = await loginAsLiveCompany();
                  if (ok) {
                    window.location.reload();
                  }
                }}
              >
                Connect Live Company
              </button>
            </div>
          )}
          {isLive && !isLoading && !companySetupComplete && (
            <div className="module-migration-notice" role="alert" style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:'1rem',flexWrap:'wrap'}}>
              <div>
                <strong>Complete company setup before recording business activity.</strong>
                <div>Missing: {missingCompanyDetails.join(', ')}. These details are required on invoices and business records.</div>
              </div>
              {!path.startsWith('/settings') && <Link className="btn" href="/settings">Open Settings</Link>}
            </div>
          )}
          {companySetupComplete || setupPageAllowed || isLoading ? children : (
            <section className="empty-state" style={{margin:'2rem'}}>
              <Building2 size={36}/>
              <h2>Company setup required</h2>
              <p>Complete Shop details before creating sales, purchases, stock movements, payments, services or daily closings.</p>
              <Link className="btn" href="/settings">Complete Shop details</Link>
            </section>
          )}
        </main>

        <footer className="app-footer">
          <span>{isLive ? companyName : 'iTech Computers · Salem'}</span>
          <span>{isLive ? 'Multi-tenant company account' : 'Demo data · Changes reset on refresh'}</span>
        </footer>
      </div>
    </div>
  );
}
