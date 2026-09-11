'use client';
import {usePathname,useSearchParams} from 'next/navigation';
import Dashboard from './dashboard';
import People from './people';
import Inventory from './inventory';
import Documents,{DocumentComposer} from './documents';
import Services from './service';
import Enquiries from './enquiries';
import Reservations from './reservations';
import WarrantyPage from './warranty';
import Returns from './returns';
import Finance,{Dues,Profit} from './finance';
import Reports from './reports';
import Communication from './communication';
import Settings from './settings';
import AccountAccess from './account-access';
import MoneyDesk from './money-desk';
import Daybook from './daybook';
import Templates from './templates';
import ServiceCatalog from './service-catalog';
import Library from './library';
import {Empty} from './ui';
import Link from 'next/link';
import {useEffect} from 'react';
import {useRouter} from 'next/navigation';
import {useStore} from './store';
export default function Workspace(){const path=usePathname();const query=useSearchParams();const routeKey=path+query.toString();const router=useRouter();const {state}=useStore();useEffect(()=>{const ctx=(document as Document&{modelContext?:{registerTool:(t:unknown,o:unknown)=>unknown}}).modelContext;if(!ctx?.registerTool)return;const controller=new AbortController();try{Promise.resolve(ctx.registerTool({name:'start_new_invoice',description:'Navigate to the new sales invoice form. Does not issue an invoice or move stock.',inputSchema:{type:'object',properties:{},additionalProperties:false},execute:(input:unknown)=>{if(!input||typeof input!=='object'||Object.keys(input).length)throw new Error('Expected an empty object.');router.push('/sales/new');return {status:'navigating',path:'/sales/new'};}},{signal:controller.signal})).catch(()=>{});}catch{}return()=>controller.abort();},[router]);const [section,id,action]=path.split('/').filter(Boolean);if(!section)return <Dashboard/>;switch(section){case 'account':return <AccountAccess/>;case 'documents':return <Library/>;case 'customers':return <People id={id}/>;case 'suppliers':return <People supplier id={id}/>;case 'inventory':return <Inventory id={id}/>;case 'sales':return id==='new'?<DocumentComposer key={routeKey}/>:<Documents id={id}/>;case 'quotations':return id==='new'?<DocumentComposer key={routeKey} quotation/>:<Documents quotation id={id}/>;case 'purchases':return id==='new'||action==='receive'?<DocumentComposer key={routeKey} purchase existingId={action==='receive'?id:undefined}/>:<Documents purchase id={id}/>;case 'services':return <Services key={routeKey} id={id}/>;case 'enquiries':return <Enquiries/>;case 'reservations':return <Reservations/>;case 'returns':return <Returns/>;case 'warranty':return <WarrantyPage/>;case 'register':return <MoneyDesk/>;case 'expenses':return <MoneyDesk/>;case 'templates':return <Templates/>;case 'service-catalog':return <ServiceCatalog/>;case 'profit':return <Daybook key={routeKey}/>;case 'dues':return <Dues/>;case 'reports':return <Reports/>;case 'communication':return <Communication/>;case 'settings':return <Settings/>;default:return <Empty title="Page not found" action={<Link href="/">Go to dashboard</Link>}/>;}}

