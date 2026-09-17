'use client';
import {useState, useEffect} from 'react';
import {useSearchParams} from 'next/navigation';
import {MessageCircle, Copy, Eye, ExternalLink, Send} from 'lucide-react';
import {useStore} from './store';
import {money, balance, TODAY} from '@/lib/domain';
import {PageHead, Card, Btn, Field, Modal, Badge} from './ui';

export default function Communication() {
  const {state, notify} = useStore();
  const params = useSearchParams();

  const initialCustomerId = params.get('customer') || state.customers[0]?.id || '';
  const [customerId, setCustomerId] = useState(initialCustomerId);
  const [template, setTemplate] = useState(
    params.get('job')
      ? 'Service received'
      : params.get('reminder')
      ? 'Payment reminder'
      : 'General message'
  );
  const [message, setMessage] = useState('');
  const [preview, setPreview] = useState(false);

  const customer = state.customers.find((c) => c.id === customerId);
  const job =
    state.jobs.find((j) => j.id === params.get('job')) ||
    state.jobs.find((j) => j.customerId === customerId);
  const bill =
    state.bills.find((b) => b.id === params.get('reminder')) ||
    state.bills.find((b) => b.customerId === customerId && b.kind !== 'Quotation' && balance(state, b) > 0);
  const quote = state.bills.find((b) => b.customerId === customerId && b.kind === 'Quotation');

  const shopName = state.settings.name || 'iTech Computers';

  const defaultTemplates: Record<string, string> = {
    'General message': `Hello ${customer?.name || 'Customer'}, thank you for contacting ${shopName}. How can we assist you today?`,
    'Service received': `Hello ${customer?.name || 'Customer'}, thank you for choosing ${shopName}. We have received your ${job?.device || 'device'} for service. Reported issue: ${job?.problem || 'under diagnosis'}. Job Ref: ${job?.id || 'pending'}. We will update you once diagnosis is complete.`,
    'Service ready': `Hello ${customer?.name || 'Customer'}, your ${job?.device || 'device'} service is complete at ${shopName}.${job?.work ? ` Work done: ${job.work}.` : ''} Total payable: ${money(job?.final || 0)}. Please visit our store to collect your device.`,
    'Payment reminder': `Hello ${customer?.name || 'Customer'}, this is a gentle reminder from ${shopName} regarding your outstanding balance of ${bill ? money(balance(state, bill)) : 'pending amount'}${bill ? ' against invoice ' + bill.id : ''}. Kindly arrange for settlement at your earliest convenience. Thank you!`,
    'Quotation follow-up': `Hello ${customer?.name || 'Customer'}, following up on the quotation ${quote?.id || ''} provided by ${shopName}. Please let us know if you would like to proceed or need any adjustments to the configuration.`,
  };

  const currentMessage = message || defaultTemplates[template] || '';

  function getWhatsAppUrl(phoneStr: string, text: string): string | null {
    const digits = phoneStr.replace(/\D/g, '');
    if (!digits) return null;
    const normalized = digits.length === 10 ? `91${digits}` : digits;
    return `https://wa.me/${normalized}?text=${encodeURIComponent(text)}`;
  }

  const phone = customer?.phone || '';
  const waUrl = getWhatsAppUrl(phone, currentMessage);

  return (
    <>
      <PageHead
        title="WhatsApp communication"
        description="Review, customize, and launch direct WhatsApp messages to customers for service updates, payment reminders, and quotations."
      />

      <div className="notice spaced">
        Direct staff-initiated messaging: Launches WhatsApp Web or Desktop on your device. No automated third-party bots or unscheduled bulk spam.
      </div>

      <div className="detail-grid">
        <Card title="Compose customer message">
          <div className="form-body stack">
            <Field label="Select customer">
              <select
                value={customerId}
                onChange={(e) => {
                  setCustomerId(e.target.value);
                  setMessage('');
                }}
              >
                {state.customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.phone ? `(${c.phone})` : ''}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Message scenario / template">
              <select
                value={template}
                onChange={(e) => {
                  setTemplate(e.target.value);
                  setMessage('');
                }}
              >
                <option value="General message">General customer query</option>
                <option value="Service received">Service device intake</option>
                <option value="Service ready">Service ready for delivery</option>
                <option value="Payment reminder">Payment / due reminder</option>
                <option value="Quotation follow-up">Quotation follow-up</option>
              </select>
            </Field>

            <Field label="Editable message text">
              <textarea
                style={{minHeight: 160}}
                value={currentMessage}
                onChange={(e) => setMessage(e.target.value)}
              />
            </Field>

            <div className="actions" style={{display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center'}}>
              {waUrl ? (
                <a
                  className="btn"
                  style={{backgroundColor: '#25D366', color: '#fff', display: 'inline-flex', alignItems: 'center', gap: '6px'}}
                  href={waUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <MessageCircle size={16} />
                  Open in WhatsApp
                  <ExternalLink size={14} />
                </a>
              ) : (
                <Btn disabled>
                  <MessageCircle size={16} />
                  No valid phone number
                </Btn>
              )}

              <Btn
                secondary
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(currentMessage);
                    notify('Message copied to clipboard.');
                  } catch {
                    notify('Could not copy. Select and copy the text manually.');
                  }
                }}
              >
                <Copy size={15} />
                Copy text
              </Btn>

              <Btn secondary onClick={() => setPreview(true)}>
                <Eye size={16} />
                Preview in chat bubble
              </Btn>
            </div>
          </div>
        </Card>

        <div className="stack">
          <Card title="Customer contact details">
            <div className="body-pad">
              <div className="customer-cell" style={{marginBottom: 16}}>
                <div className="avatar">{customer?.name?.[0] || 'C'}</div>
                <div>
                  <strong>{customer?.name}</strong>
                  <small>{customer?.phone || 'No phone entered'}</small>
                </div>
              </div>

              <dl className="detail-list">
                <div>
                  <dt>Email</dt>
                  <dd>{customer?.email || '—'}</dd>
                </div>
                <div>
                  <dt>Address</dt>
                  <dd>{customer?.address || '—'}</dd>
                </div>
                <div>
                  <dt>GSTIN</dt>
                  <dd>{customer?.gst || 'Unregistered'}</dd>
                </div>
                <div>
                  <dt>Outstanding Dues</dt>
                  <dd>
                    {bill ? (
                      <span className="negative">{money(balance(state, bill))}</span>
                    ) : (
                      <span className="positive">All settled</span>
                    )}
                  </dd>
                </div>
              </dl>
            </div>
          </Card>

          <Card title="Message preview">
            <div className="body-pad">
              <div className="chat-preview">
                <div className="chat-bubble">
                  {currentMessage}
                  <small>Preview for {customer?.name} ({customer?.phone || 'No phone'})</small>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {preview && (
        <Modal title="WhatsApp chat preview" onClose={() => setPreview(false)}>
          <div className="form-body">
            <div className="chat-preview">
              <div className="chat-bubble">
                {currentMessage}
                <small>To: {customer?.name} · {customer?.phone}</small>
              </div>
            </div>
            <p className="notice spaced">
              Clicking "Open in WhatsApp" will open WhatsApp Web or Desktop with this pre-filled message ready to review and send.
            </p>
          </div>
          <div className="form-actions">
            {waUrl && (
              <a
                className="btn"
                style={{backgroundColor: '#25D366', color: '#fff'}}
                href={waUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setPreview(false)}
              >
                <MessageCircle size={16} style={{marginRight: 6}} />
                Launch WhatsApp
              </a>
            )}
            <Btn secondary onClick={() => setPreview(false)}>
              Close
            </Btn>
          </div>
        </Modal>
      )}
    </>
  );
}
