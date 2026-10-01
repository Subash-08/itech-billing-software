'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import {useEffect} from 'react';
import {usePathname, useRouter, useSearchParams} from 'next/navigation';
import {Empty} from './ui';

const loading = () => <div className="empty">Opening this module…</div>;
const Dashboard = dynamic(() => import('./dashboard'), {loading});
const People = dynamic(() => import('./people'), {loading});
const Inventory = dynamic(() => import('./inventory'), {loading});
const Documents = dynamic(() => import('./documents'), {loading});
const DocumentComposer = dynamic(
  () => import('./documents').then((module) => module.DocumentComposer),
  {loading}
);
const Services = dynamic(() => import('./service'), {loading});
const Enquiries = dynamic(() => import('./enquiries'), {loading});
const Reservations = dynamic(() => import('./reservations'), {loading});
const WarrantyPage = dynamic(() => import('./warranty'), {loading});
const Returns = dynamic(() => import('./returns'), {loading});
const Dues = dynamic(() => import('./finance').then((module) => module.Dues), {loading});
const Reports = dynamic(() => import('./reports'), {loading});
const Communication = dynamic(() => import('./communication'), {loading});
const Settings = dynamic(() => import('./settings'), {loading});
const AccountAccess = dynamic(() => import('./account-access'), {loading});
const MoneyDesk = dynamic(() => import('./money-desk'), {loading});
const Daybook = dynamic(() => import('./daybook'), {loading});
const Templates = dynamic(() => import('./templates'), {loading});
const ServiceCatalog = dynamic(() => import('./service-catalog'), {loading});
const Library = dynamic(() => import('./library'), {loading});

export default function Workspace() {
  const path = usePathname();
  const query = useSearchParams();
  const routeKey = path + query.toString();
  const router = useRouter();

  useEffect(() => {
    const context = (document as Document & {
      modelContext?: {registerTool: (tool: unknown, options: unknown) => unknown};
    }).modelContext;
    if (!context?.registerTool) return;
    const controller = new AbortController();
    try {
      Promise.resolve(
        context.registerTool(
          {
            name: 'start_new_invoice',
            description: 'Navigate to the new sales invoice form. Does not issue an invoice or move stock.',
            inputSchema: {type: 'object', properties: {}, additionalProperties: false},
            execute: (input: unknown) => {
              if (!input || typeof input !== 'object' || Object.keys(input).length) {
                throw new Error('Expected an empty object.');
              }
              router.push('/sales/new');
              return {status: 'navigating', path: '/sales/new'};
            },
          },
          {signal: controller.signal}
        )
      ).catch(() => {});
    } catch {}
    return () => controller.abort();
  }, [router]);

  const [section, id, action] = path.split('/').filter(Boolean);
  if (!section) return <Dashboard/>;

  switch (section) {
    case 'account': return <AccountAccess/>;
    case 'documents': return <Library/>;
    case 'customers': return <People id={id}/>;
    case 'suppliers': return <People supplier id={id}/>;
    case 'inventory': return <Inventory id={id}/>;
    case 'sales': return id === 'new' ? <DocumentComposer key={routeKey}/> : <Documents id={id}/>;
    case 'quotations': return id === 'new' ? <DocumentComposer key={routeKey} quotation/> : <Documents quotation id={id}/>;
    case 'purchases': return id === 'new' || action === 'receive'
      ? <DocumentComposer key={routeKey} purchase existingId={action === 'receive' ? id : undefined}/>
      : <Documents purchase id={id}/>;
    case 'services': return <Services key={routeKey} id={id}/>;
    case 'enquiries': return <Enquiries/>;
    case 'reservations': return <Reservations/>;
    case 'returns': return <Returns/>;
    case 'warranty': return <WarrantyPage/>;
    case 'register':
    case 'expenses': return <MoneyDesk/>;
    case 'templates': return <Templates/>;
    case 'service-catalog': return <ServiceCatalog/>;
    case 'profit': return <Daybook key={routeKey}/>;
    case 'dues': return <Dues/>;
    case 'reports': return <Reports/>;
    case 'communication': return <Communication/>;
    case 'settings': return <Settings/>;
    default: return <Empty title="Page not found" action={<Link href="/">Go to dashboard</Link>}/>;
  }
}
