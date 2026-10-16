'use client';
import {useEffect, useMemo, useRef, useState} from 'react';
import {usePathname} from 'next/navigation';
import Link from 'next/link';
import {Bell, CheckCheck, Clock3} from 'lucide-react';

type AttentionItem = {
  id: string;
  key: string;
  title: string;
  detail: string;
  href: string;
  area: string;
  occurredAt: string;
  unread: boolean;
};

function timeLabel(value: string) {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const parsed = new Date(dateOnly ? `${value}T00:00:00+05:30` : value);
  if (Number.isNaN(parsed.getTime())) return value;
  const now = new Date();
  const dayMs = 86400000;
  const startNow = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startThen = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()).getTime();
  const days = Math.round((startNow - startThen) / dayMs);
  if (days === 0) return dateOnly ? 'Today' : `Today · ${parsed.toLocaleTimeString('en-IN', {hour: 'numeric', minute: '2-digit'})}`;
  if (days === 1) return 'Yesterday';
  if (days > 1 && days < 7) return `${days} days ago`;
  if (days === -1) return 'Tomorrow';
  if (days < -1 && days > -7) return `In ${Math.abs(days)} days`;
  return parsed.toLocaleDateString('en-IN', {day: 'numeric', month: 'short', year: parsed.getFullYear() === now.getFullYear() ? undefined : 'numeric'});
}

export default function AttentionMenu() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AttentionItem[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState(false);
  const [more, setMore] = useState(false);
  const [revision, setRevision] = useState(0);
  const path = usePathname();
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    let inFlight = false;
    async function refresh() {
      if (inFlight || document.visibilityState === 'hidden') return;
      inFlight = true;
      try {
        const response = await fetch('/api/company/attention', {cache: 'no-store'});
        const data = await response.json();
        if (!response.ok) throw new Error('Could not check reminders.');
        if (active) {
          setItems(data.items || []);
          setMore(!!data.hasMore);
          setError('');
        }
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : 'Could not check reminders.');
      } finally {
        inFlight = false;
        if (active) setLoading(false);
      }
    }
    void refresh();
    const timer = setInterval(refresh, 60000);
    window.addEventListener('focus', refresh);
    window.addEventListener('itech:attention-refresh', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('itech:attention-refresh', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [path, revision]);

  useEffect(() => {
    function outside(e: MouseEvent) {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    }
    function key(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', outside);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', outside);
      document.removeEventListener('keydown', key);
    };
  }, []);

  const ordered = useMemo(() => [...items].sort((a, b) => Number(b.unread) - Number(a.unread)), [items]);
  const unreadCount = items.filter((item) => item.unread).length;

  async function markRead(keys: string[]) {
    if (!keys.length) return;
    setMarking(true);
    setItems((current) => current.map((item) => keys.includes(item.key) ? {...item, unread: false} : item));
    try {
      const response = await fetch('/api/company/attention', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({keys}),
        keepalive: true,
      });
      if (!response.ok) throw new Error('Could not mark reminders as read.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not mark reminders as read.');
      setRevision((value) => value + 1);
    } finally {
      setMarking(false);
    }
  }

  return (
    <div className="notification-wrap" ref={root}>
      <button
        type="button"
        className="icon-btn notification-button"
        aria-label={unreadCount ? `${unreadCount} unread reminders` : 'No unread reminders'}
        aria-expanded={open}
        onClick={() => {
          setOpen((value) => !value);
          if (!open) setRevision((value) => value + 1);
        }}
      >
        <Bell size={20} />
        {unreadCount > 0 && <span className="notification-count">{unreadCount > 99 ? '99+' : unreadCount}</span>}
      </button>
      {open && (
        <div className="notification-panel notification-panel-modern">
          <div className="notification-head">
            <div>
              <strong>Notifications</strong>
              <small>{unreadCount ? `${unreadCount} unread` : 'You are up to date'}</small>
            </div>
            {unreadCount > 0 && (
              <button type="button" onClick={() => void markRead(items.filter((item) => item.unread).map((item) => item.key))} disabled={marking}>
                <CheckCheck size={15} /> {marking ? 'Saving…' : 'Mark all read'}
              </button>
            )}
          </div>
          {loading && <p className="notification-state" aria-live="polite">Checking reminders…</p>}
          {error && <p className="notification-state error" role="alert">{error} <button type="button" onClick={() => setRevision((value) => value + 1)}>Retry</button></p>}
          {!loading && !error && !items.length && <p className="notification-state">No pending actions. New reminders will appear here.</p>}
          <div className="notification-list">
            {ordered.map((item) => (
              <Link
                key={item.key}
                className={item.unread ? 'unread' : 'read'}
                href={item.href}
                onClick={() => {
                  if (item.unread) void markRead([item.key]);
                  setOpen(false);
                }}
              >
                <span className="notification-dot" aria-hidden="true" />
                <span className="notification-copy">
                  <span className="notification-meta"><b>{item.area}</b><time dateTime={item.occurredAt}><Clock3 size={12} />{timeLabel(item.occurredAt)}</time></span>
                  <strong>{item.title}</strong>
                  <small>{item.detail}</small>
                </span>
              </Link>
            ))}
          </div>
          {more && <p className="notification-more">Showing the first actions in each area. Open the related page to see all records.</p>}
          {!!items.length && <p className="notification-footnote">Read reminders stay visible until the underlying action is completed.</p>}
        </div>
      )}
    </div>
  );
}
