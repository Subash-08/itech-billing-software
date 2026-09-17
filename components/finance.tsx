'use client';
import {useState, useEffect} from 'react';
import Link from 'next/link';
import {Plus,ArrowLeftRight,Download,Wallet,Landmark,Check,LockKeyhole,Eye,CalendarDays} from 'lucide-react';
import {TODAY,uid,money,accountBalance,openingAccounts,Payment,roundedTotal,balance,Bill,Purchase} from '@/lib/domain';
import {addPayment} from '@/lib/operations';
import {useStore} from './store';
import {PageHead,Card,Stat,Btn,Modal,Field,SearchBox,Badge,Empty,csvDownload} from './ui';
import SupplierSettlement from './supplier-settlement';
import {useRouter} from 'next/navigation';
import {PaymentDialog} from './payments';
export function MoneyForm({onClose,transfer=false}:{onClose:()=>void;transfer?:boolean}){const {run}=useStore();const [f,setF]=useState<Payment>({id:uid('PAY'),date:TODAY,direction:transfer?'Transfer':'Out',account:'Cash',toAccount:'Bank account',amount:0,purpose:transfer?'Transfer':'Operating expense',reference:uid('EXP'),party:'Shop',note:''});return <Modal title={transfer?'Transfer between accounts':'Record money in / out'} onClose={onClose}><form onSubmit={e=>{e.preventDefault();if(run(s=>addPayment(s,f),'Transaction recorded. Account balances updated.'))onClose();}}><div className="form-body form-grid"><Field label="Transaction type"><select value={f.purpose} onChange={e=>setF({...f,purpose:e.target.value,direction:e.target.value==='Owner contribution'?'In':e.target.value==='Transfer'?'Transfer':'Out'})}>{['Operating expense','Owner withdrawal','Owner contribution','Transfer'].map(p=><option key={p}>{p}</option>)}</select></Field><Field label="Date"><input required type="date" max={TODAY} value={f.date} onChange={e=>setF({...f,date:e.target.value})}/></Field><Field label={f.direction==='In'?'Receive into':'Pay from'}><select value={f.account} onChange={e=>setF({...f,account:e.target.value})}>{Object.keys(openingAccounts).map(a=><option key={a}>{a}</option>)}</select></Field>{f.direction==='Transfer'&&<Field label="Transfer to"><select value={f.toAccount} onChange={e=>setF({...f,toAccount:e.target.value})}>{Object.keys(openingAccounts).map(a=><option key={a}>{a}</option>)}</select></Field>}<Field label="Amount"><input required type="number" min="0.01" step="0.01" value={f.amount} onChange={e=>setF({...f,amount:+e.target.value})}/></Field><Field label="Person / payee"><input required value={f.party} onChange={e=>setF({...f,party:e.target.value})}/></Field><div className="full"><Field label="Reason / reference"><textarea required value={f.note} onChange={e=>setF({...f,note:e.target.value})}/></Field></div><div className="full notice">For customer or supplier payments, open the linked bill under Dues. This keeps each outstanding balance correct.</div></div><div className="form-actions"><Btn secondary onClick={onClose}>Cancel</Btn><Btn type="submit">Record transaction</Btn></div></form></Modal>;}
export default function Finance({expenses=false}:{expenses?:boolean}){const router=useRouter();const {state,setState,notify}=useStore();const [date,setDate]=useState(TODAY),[account,setAccount]=useState('All accounts'),[q,setQ]=useState(''),[form,setForm]=useState<'money'|'transfer'|null>(null),[close,setClose]=useState(false),[actual,setActual]=useState(''),[note,setNote]=useState('');const list=state.payments.filter(p=>p.date===date&&(account==='All accounts'||p.account===account||p.toAccount===account)&&(!expenses||['Operating expense','Owner withdrawal','Owner contribution','Transfer'].includes(p.purpose))&&(!q||[p.note,(p as any).notes,p.purpose,p.reference,p.party,(p as any).paymentNumber].filter(Boolean).map(String).join(' ').toLowerCase().includes(q.toLowerCase())));const priorDate=new Date(new Date(date+'T12:00:00').getTime()-86400000).toISOString().slice(0,10);const expected=accountBalance(state,'Cash',date);const closing=state.closings.find(c=>c.date===date);return <><PageHead title={expenses?'Expenses & transfers':'Daily cash & bank register'} description={expenses?'Separate shop expenses, owner withdrawals and transfers.':'Opening balances, actual money movements and a clear closing position.'} actions={<><Btn secondary onClick={()=>setForm('transfer')}><ArrowLeftRight size={16}/>Transfer</Btn><Btn onClick={()=>setForm('money')}><Plus size={16}/>Money in / out</Btn></>}/><div className="toolbar register-toolbar"><Field label="Business date"><input type="date" max={TODAY} value={date} onChange={e=>setDate(e.target.value||TODAY)}/></Field><span className="notice-inline">GPay receipts are included in their bank account, never counted twice.</span><Btn secondary onClick={()=>csvDownload(`register-${date}.csv`,[['Date','Direction','Account','To account','Amount','Purpose','Reference','Notes'],...list.map(p=>[p.date,p.direction,p.account,p.toAccount||'',p.amount,p.purpose,p.reference,p.note])])}><Download size={16}/>Export day</Btn></div><div className="stats-grid accounts-grid">{Object.keys(openingAccounts).map(a=><Stat key={a} label={a==='Cash'?'Cash in drawer':a} value={money(accountBalance(state,a,date))} detail={`Opening ${money(accountBalance(state,a,priorDate))}`} icon={a==='Cash'?<Wallet size={19}/>:<Landmark size={19}/>} accent={a==='Cash'?'green':'purple'}/>)}<Stat label="Combined funds" value={money(Object.keys(openingAccounts).reduce((n,a)=>n+accountBalance(state,a,date),0))} detail="Cash + tracked bank accounts" icon={<ArrowLeftRight size={19}/>} accent="blue"/></div><Card title={expenses?'Expense and transfer entries':'Transactions'} actions={!expenses&&<Btn secondary onClick={()=>router.push('/profit?date='+date)}><Check size={15}/>{closing?'Review closing':'Count & close day'}</Btn>}><div className="toolbar"><SearchBox value={q} onChange={setQ} placeholder="Search reason, bill or payment…"/><select aria-label="Account filter" value={account} onChange={e=>setAccount(e.target.value)}><option>All accounts</option>{Object.keys(openingAccounts).map(a=><option key={a}>{a}</option>)}</select>{closing&&<Badge>{closing.actual===closing.expected?'Closed · Tally matched':'Closed · Difference noted'}</Badge>}</div><div className="table-wrap"><table><thead><tr><th>Transaction / purpose</th><th>Account</th><th>Reference</th><th>Money in</th><th>Money out</th><th>Notes</th></tr></thead><tbody>{list.map(p=><tr key={p.id}><td>{p.purpose}<small>{p.id}</small></td><td>{p.account}{p.direction==='Transfer'&&<small>→ {p.toAccount}</small>}</td><td>{p.reference.startsWith('INV')||p.reference.startsWith('SVC')?<Link className="record-link" href={'/sales/'+p.reference}>{p.reference}</Link>:p.reference.startsWith('PUR')?<Link className="record-link" href={'/purchases/'+p.reference}>{p.reference}</Link>:p.reference}</td><td className="positive">{p.direction==='In'?money(p.amount):'—'}</td><td>{p.direction==='Out'?money(p.amount):p.direction==='Transfer'?money(p.amount)+' transfer':'—'}</td><td className="wrap-cell">{p.note}</td></tr>)}</tbody></table></div>{!list.length&&<Empty title="No transactions for this date" text="Choose another date or record a money movement."/>}<div className="table-footer"><span>{list.length} transactions</span><span>Transfers do not change combined funds.</span></div></Card>{closing&&<div className="notice spaced">Day reviewed · Expected {money(expected)} · Counted {money(closing.actual)} · Difference {money(closing.actual-expected)}{closing.note&&` · ${closing.note}`}{closing.expected!==expected&&' · Transactions changed after closing. Review and close again.'}</div>}{form&&<MoneyForm transfer={form==='transfer'} onClose={()=>setForm(null)}/>}</>;}
export function Dues() {
  const {
    state,
    setState,
    notify,
    isLive,
    fetchInvoicesPage,
    fetchPurchasesPage,
    updateInvoiceDueDateApi,
    updatePurchaseDueDateApi,
  } = useStore();
  const [tab, setTab] = useState<'Customers' | 'Suppliers'>('Customers');
  const [q, setQ] = useState('');
  const [pay, setPay] = useState<Bill | Purchase | null>(null);
  const [due, setDue] = useState<Bill | Purchase | null>(null);
  const [dueDate, setDueDate] = useState('');
  const [dueNotes, setDueNotes] = useState('');
  const [savingDate, setSavingDate] = useState(false);
  const [loading, setLoading] = useState(false);
  const [liveInvoices, setLiveInvoices] = useState<Bill[]>([]);
  const [livePurchases, setLivePurchases] = useState<Purchase[]>([]);

  const supplier = tab === 'Suppliers';

  const loadLiveDues = async () => {
    if (!isLive) return;
    setLoading(true);
    try {
      if (supplier) {
        const res = await fetchPurchasesPage({hasDue: true, limit: 100, search: q || undefined});
        setLivePurchases(res?.records || []);
      } else {
        const res = await fetchInvoicesPage({hasDue: true, limit: 100, search: q || undefined});
        setLiveInvoices(res?.records || []);
      }
    } catch (err: any) {
      notify(err.message || 'Failed to load outstanding dues.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isLive) {
      loadLiveDues();
    }
  }, [isLive, supplier, q]);

  const demoDocs = (supplier
    ? state.purchases
    : state.bills.filter((b) => b.kind !== 'Quotation' && b.status === 'Issued')
  ).filter(
    (b) =>
      balance(state, b) > 0 &&
      (
        b.id +
        (supplier
          ? state.suppliers.find((c) => c.id === (b as Purchase).supplierId)?.name || ''
          : state.customers.find((c) => c.id === (b as Bill).customerId)?.name || '')
      )
        .toLowerCase()
        .includes(q.toLowerCase())
  );

  const docs = isLive ? (supplier ? livePurchases : liveInvoices) : demoDocs;

  async function handleSaveDueDate(e: React.FormEvent) {
    e.preventDefault();
    if (!due) return;

    if (isLive) {
      setSavingDate(true);
      try {
        const res = supplier
          ? await updatePurchaseDueDateApi(due.id, dueDate, dueNotes, due.version)
          : await updateInvoiceDueDateApi(due.id, dueDate, dueNotes, due.version);

        if (!res.success) {
          notify(res.error || 'Failed to update promised payment date.');
          return;
        }

        notify('Promised payment date saved.');
        setDue(null);
        setDueNotes('');
        loadLiveDues();
      } catch (err: any) {
        notify(err.message || 'Failed to save promised payment date.');
      } finally {
        setSavingDate(false);
      }
    } else {
      setState((s) =>
        supplier
          ? {
              ...s,
              purchases: s.purchases.map((b) =>
                b.id === due.id ? {...b, due: dueDate, promisedPaymentDate: dueDate} : b
              ),
            }
          : {
              ...s,
              bills: s.bills.map((b) =>
                b.id === due.id ? {...b, due: dueDate, promisedPaymentDate: dueDate} : b
              ),
            }
      );
      notify('Due date updated.');
      setDue(null);
      setDueNotes('');
    }
  }

  function getDocBalance(b: Bill | Purchase): number {
    if (isLive) {
      if (supplier) {
        return (b as Purchase).dueAmount ?? (b as Purchase).total ?? 0;
      }
      return (b as any).dueAmount ?? (b as any).total ?? 0;
    }
    return balance(state, b);
  }

  return (
    <>
      <PageHead
        title="Dues & reminders"
        description="Know who needs to pay you, and who you need to pay."
      />
      <div className="tabs">
        {(['Customers', 'Suppliers'] as const).map((t) => (
          <button
            className={tab === t ? 'active' : ''}
            key={t}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="dues-total">
        <span>{supplier ? 'Total payable' : 'Total to collect'}</span>
        <strong>
          {money(docs.reduce((a, b) => a + getDocBalance(b), 0))}
        </strong>
        <small>{docs.length} outstanding bills{isLive ? ' · Live backend' : ''}</small>
      </div>
      <Card>
        <div className="toolbar">
          <SearchBox
            value={q}
            onChange={setQ}
            placeholder="Search party or bill…"
          />
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{supplier ? 'Supplier' : 'Customer'}</th>
                <th>Bill</th>
                <th>Due date</th>
                <th>Outstanding</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {docs.map((b) => {
                const bal = getDocBalance(b);
                const effectiveDue = b.promisedPaymentDate || b.due;
                const isOverdue = effectiveDue < TODAY;
                const isDueToday = effectiveDue === TODAY;

                return (
                  <tr key={b.id}>
                    <td>
                      {supplier
                        ? state.suppliers.find((c) => c.id === (b as Purchase).supplierId)?.name || 'Supplier'
                        : state.customers.find((c) => c.id === (b as Bill).customerId)?.name || 'Customer'}
                    </td>
                    <td>
                      <Link
                        className="record-link"
                        href={`${supplier ? '/purchases' : '/sales'}/${b.id}`}
                      >
                        {b.id}
                      </Link>
                    </td>
                    <td>
                      <div>
                        <strong>{b.promisedPaymentDate ? b.promisedPaymentDate : b.due}</strong>
                        {b.promisedPaymentDate && b.promisedPaymentDate !== b.due && (
                          <small className="muted" style={{display: 'block'}}>
                            Original: {b.due}
                          </small>
                        )}
                      </div>
                    </td>
                    <td className="amount">{money(bal)}</td>
                    <td>
                      <Badge>
                        {isOverdue ? 'Overdue' : isDueToday ? 'Due today' : 'Upcoming'}
                      </Badge>
                    </td>
                    <td>
                      <div className="actions">
                        <Btn secondary onClick={() => setPay(b)}>
                          {supplier ? 'Pay' : 'Receive'}
                        </Btn>
                        <button
                          className="link-button"
                          onClick={() => {
                            setDue(b);
                            setDueDate(b.promisedPaymentDate || b.due);
                            setDueNotes('');
                          }}
                        >
                          Change due date
                        </button>
                        {!supplier && (
                          <Link
                            className="text-link"
                            href={`/communication?customer=${(b as Bill).customerId}&reminder=${b.id}`}
                          >
                            Reminder
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {loading && <div style={{padding: '16px', textAlign: 'center'}} className="muted">Loading outstanding records…</div>}
        {!loading && !docs.length && (
          <Empty
            title="All settled"
            text="No outstanding balances match your search."
          />
        )}
      </Card>
      {pay &&
        (supplier ? (
          <SupplierSettlement
            supplierId={(pay as Purchase).supplierId}
            defaultPurchaseId={(pay as Purchase).id}
            onClose={() => {
              setPay(null);
              if (isLive) loadLiveDues();
            }}
          />
        ) : (
          <PaymentDialog
            record={pay}
            onClose={() => {
              setPay(null);
              if (isLive) loadLiveDues();
            }}
          />
        ))}
      {due && (
        <Modal
          title="Update promised payment date"
          onClose={() => {
            setDue(null);
            setDueNotes('');
          }}
        >
          <form onSubmit={handleSaveDueDate}>
            <div className="form-body">
              <Field label="Original due date">
                <input type="text" readOnly disabled value={due.due} />
              </Field>
              <Field label="New promised payment date">
                <input
                  required
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </Field>
              <Field label="Staff notes / justification">
                <textarea
                  placeholder="e.g. Customer promised cash settlement next Tuesday"
                  value={dueNotes}
                  onChange={(e) => setDueNotes(e.target.value)}
                />
              </Field>
            </div>
            <div className="form-actions">
              <Btn
                secondary
                onClick={() => {
                  setDue(null);
                  setDueNotes('');
                }}
              >
                Cancel
              </Btn>
              <Btn type="submit" disabled={savingDate}>
                {savingDate ? 'Saving…' : 'Save date'}
              </Btn>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
export function Profit(){const {state,setState,role,notify}=useStore();const [date,setDate]=useState(TODAY),[draft,setDraft]=useState<Record<string,string>>({}),[show,setShow]=useState(false),[filter,setFilter]=useState('All entries');const list=state.bills.filter(b=>b.kind!=='Quotation'&&b.status==='Issued'&&b.date===date&&(filter==='All entries'||b.profit===null));const allDay=state.bills.filter(b=>b.kind!=='Quotation'&&b.status==='Issued'&&b.date===date);const total=allDay.reduce((a,b)=>a+(b.profit??0),0);function save(){const updated=state.bills.map(b=>Object.hasOwn(draft,b.id)?{...b,profit:draft[b.id]===''?null:Number(draft[b.id])}:b);if(updated.some(b=>b.profit!==null&&!Number.isFinite(b.profit))){notify('Enter valid profit amounts.');return;}setState(s=>({...s,bills:updated,audit:[{id:uid('LOG'),action:'Profit entries updated',detail:`${role} · ${Object.keys(draft).length} entries · ${date}`},...s.audit]}));setDraft({});notify('Profit entries saved. Continue reviewing until the day tallies.');}return <><PageHead title="Day-end profit entry" description="Enter the profit beside each sale and service, then review until everything tallies." actions={<Btn onClick={save}><Check size={16}/>Save profit entries</Btn>}/><div className="profit-banner"><div><div className="eyebrow">MANUAL ENTRY</div><h2>Your numbers. One clear daily tally.</h2><p>Enter the agreed profit for the whole sale or service entry. A blank amount stays pending; zero is a valid entry.</p></div>{role==='Owner'?<div className="profit-total"><small>Owner-only total</small><strong>{show?money(total):'₹ •••••'}</strong><button className="link-button" onClick={()=>setShow(!show)}><Eye size={14}/>{show?'Hide total':'Show total'}</button></div>:<div className="profit-total"><LockKeyhole size={24}/><small>Totals visible to owner only</small></div>}</div><Card><div className="toolbar"><input aria-label="Profit entry date" type="date" value={date} max={TODAY} onChange={e=>{setDate(e.target.value||TODAY);setDraft({});}}/><select aria-label="Profit entry status" value={filter} onChange={e=>setFilter(e.target.value)}><option>All entries</option><option>Pending profit only</option></select><Badge>{allDay.filter(b=>b.profit===null).length} pending entries</Badge><span className="muted">Cash, GPay and split payments all count once per bill.</span></div><div className="table-wrap"><table><thead><tr><th>Sale / service</th><th>Customer</th><th>Category</th><th>Bill amount</th><th>Payment</th><th>Enter profit</th><th>Entry status</th></tr></thead><tbody>{list.map(b=><tr key={b.id}><td><Link className="record-link" href={'/sales/'+b.id}>{b.id}</Link><small>{b.lines.map(l=>l.name).join(', ').slice(0,60)}</small></td><td>{state.customers.find(c=>c.id===b.customerId)?.name}</td><td>{b.category}{totalsTax(b)===0&&<small>Non-GST entry</small>}</td><td>{money(roundedTotal(b))}</td><td>{state.payments.filter(p=>p.reference===b.id&&p.direction==='In').map(p=>p.account).filter((a,i,arr)=>arr.indexOf(a)===i).join(' + ')||'Unpaid'}</td><td><div className="profit-input"><span>₹</span><input aria-label={`Profit for ${b.id}`} type="number" step="0.01" placeholder="Enter profit" value={Object.hasOwn(draft,b.id)?draft[b.id]:b.profit??''} onChange={e=>setDraft(d=>({...d,[b.id]:e.target.value}))}/></div></td><td><Badge>{Object.hasOwn(draft,b.id)?'Unsaved':b.profit===null?'Pending':'Entered'}</Badge></td></tr>)}</tbody></table></div>{!list.length&&<Empty title="No entries to review" text="Choose another day or show all entries."/>}<div className="form-actions"><span className="muted" style={{marginRight:'auto'}}>Profit does not change cash or bank balances.</span><Btn onClick={save}>Save entries</Btn></div></Card>{role==='Owner'&&show&&<div className="grid-3 spaced">{['New goods','Used goods','Service'].map(c=><Card key={c} title={c}><div className="body-pad"><h2>{money(allDay.filter(b=>b.category===c).reduce((a,b)=>a+(b.profit??0),0))}</h2><small>Sum of manually entered amounts</small></div></Card>)}</div>}<div className="notice spaced">These are recorded profit amounts, not automatically calculated accounting profit. Supplier costs and expenses are not deducted again.</div></>;}
function totalsTax(b:Bill){return b.lines.reduce((a,l)=>a+l.tax,0);}
