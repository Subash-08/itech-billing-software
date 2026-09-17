'use client';
import {useState} from 'react';
import {useStore} from './store';
import {Btn, Modal, Field} from './ui';

export default function ProfitAccess() {
  const {role, setRole, notify, isLive} = useStore();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleLock = async () => {
    if (isLive) {
      try {
        await fetch('/api/auth/profit-lock', {method: 'POST'});
      } catch {
        // ignore network error on lock
      }
    }
    setRole('Staff');
    notify('Profit totals locked.');
  };

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) {
      notify('Enter your profit password.');
      return;
    }

    if (!isLive) {
      if (password !== 'ProfitDemo2026!') {
        notify('Incorrect profit password for demo preview mode.');
        return;
      }
      setRole('Owner');
      setPassword('');
      setOpen(false);
      notify('Profit totals unlocked.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/auth/profit-unlock', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({password}),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Profit password is incorrect.');
      }

      setRole('Owner');
      setPassword('');
      setOpen(false);
      notify('Profit totals unlocked. Session valid for 10 minutes.');
    } catch (err: any) {
      notify(err.message || 'Failed to unlock profit totals.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Btn
        secondary
        onClick={() => {
          if (role === 'Owner') {
            handleLock();
          } else {
            setOpen(true);
          }
        }}
      >
        {role === 'Owner' ? 'Lock profit' : 'Unlock profit'}
      </Btn>

      {open && (
        <Modal title="Unlock Profit Totals" onClose={() => setOpen(false)}>
          <form onSubmit={handleUnlock}>
            <div className="form-body stack">
              <p>
                All shop staff can enter individual bill profits. Only aggregate totals, closing profit summaries, and
                profit reports require this server-verified company profit password.
              </p>
              <Field label="Profit Password">
                <input
                  autoComplete="off"
                  type="password"
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Enter your profit password"
                />
              </Field>
              <div className="notice">
                Protected by server-side rate limits and automatic 10-minute session expiry.
              </div>
            </div>
            <div className="form-actions">
              <Btn secondary onClick={() => setOpen(false)} disabled={isSubmitting}>
                Cancel
              </Btn>
              <Btn type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Verifying…' : 'Unlock Totals'}
              </Btn>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
