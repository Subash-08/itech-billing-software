'use client';
import {useEffect, useRef, useState} from 'react';
import {usePathname} from 'next/navigation';
import Link from 'next/link';
import {Bell} from 'lucide-react';
export default function AttentionMenu() {
  const [open, setOpen] = useState(false), [items, setItems] = useState<any[]>([]), [error, setError] = useState(''), [loading, setLoading] = useState(true), [more, setMore] = useState(false), [revision, setRevision] = useState(0);
  const path = usePathname(); const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let active = true, inFlight = false;
    async function refresh() {
      if (inFlight || document.visibilityState === 'hidden') return;
      inFlight = true;
      try {const r=await fetch('/api/company/attention',{cache:'no-store'}); const d=await r.json(); if(!r.ok) throw new Error('Could not check reminders.'); if(active){setItems(d.items || []);setMore(!!d.hasMore);setError('');}}
      catch(e){if(active)setError(e instanceof Error?e.message:'Could not check reminders.');}
      finally {inFlight=false;if(active)setLoading(false);}
    }
    void refresh(); const timer=setInterval(refresh,60000);
    window.addEventListener('focus',refresh); window.addEventListener('itech:attention-refresh',refresh); document.addEventListener('visibilitychange',refresh);
    return ()=>{active=false;clearInterval(timer);window.removeEventListener('focus',refresh);window.removeEventListener('itech:attention-refresh',refresh);document.removeEventListener('visibilitychange',refresh);};
  },[path,revision]);
  useEffect(()=>{function outside(e:MouseEvent){if(root.current && !root.current.contains(e.target as Node))setOpen(false);} function key(e:KeyboardEvent){if(e.key==='Escape')setOpen(false);} document.addEventListener('mousedown',outside);document.addEventListener('keydown',key);return()=>{document.removeEventListener('mousedown',outside);document.removeEventListener('keydown',key);};},[]);
  return <div className="notification-wrap" ref={root}><button type="button" className="icon-btn notification-button" aria-label={`Needs attention: ${items.length}${more?'+':''}`} aria-expanded={open} onClick={()=>{setOpen(v=>!v);if(!open)setRevision(v=>v+1);}}><Bell size={20}/>{items.length>0 && <span style={{fontSize:11,fontWeight:700}}>{items.length}{more?'+':''}</span>}</button>
    {open && <div className="notification-panel" style={{width:'min(390px, 90vw)',maxHeight:'70vh',overflowY:'auto'}}><strong>Needs your attention</strong>
      {loading && <p aria-live="polite">Checking reminders…</p>}
      {error && <p role="alert">{error} <button type="button" onClick={()=>setRevision(v=>v+1)}>Retry</button></p>}
      {!loading && !error && !items.length && <p>No pending reminders.</p>}
      {items.map(item=><Link key={item.id} href={item.href} onClick={()=>setOpen(false)}><strong>{item.title}</strong><small style={{display:'block',marginTop:4}}>{item.detail}</small></Link>)}
      {more && <p className="muted">Showing the first reminders in each area. Open a section to see all.</p>}
    </div>}
  </div>;
}
