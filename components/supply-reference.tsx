'use client';
import Link from 'next/link';
import {Bill,State,money} from '@/lib/domain';
import {supplyStatus} from '@/lib/supply';
import {Badge} from './ui';
export default function SupplyReference({bill,state}:{bill:Bill;state:State}){const items=bill.lines.filter(l=>l.productId);return <div className="stack">{items.length?items.map((l,i)=>{const refs=supplyStatus(state,l);return <div key={i}><small>{l.name}</small>{refs.length?refs.map(r=><div key={r.id}><Link className="text-link" href={'/purchases/'+r.id}>{r.id}</Link> <Badge>{r.status}</Badge><small>Purchase item due {money(r.due)}</small></div>):<small>Opening stock / purchase not linked</small>}</div>}):<small>No purchased product</small>}</div>;}
