import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const load=async(name)=>require('../.test-build/'+name+'.js');
const d = await load('domain');
const {seed, makeLine} = await load('seed');
const op = await load('operations');
const closing = await load('closing');
const settlement = await load('settlement');
const fresh = () => structuredClone(seed);
const invoice = (overrides={}) => ({id:'TEST-INV',customerId:'C001',date:d.TODAY,due:d.TODAY,kind:'Sale',category:'New goods',status:'Issued',lines:[makeLine('P006')],inclusive:true,notes:'',profit:null,...overrides});
test('5000 inclusive and exclusive use the same calculator as product and invoice forms',()=>{
 const line={qty:1,rate:5000,tax:18,discount:0};
 assert.deepEqual(d.lineTotal(line,true),{base:4237.29,tax:762.71,total:5000,cgst:381.36,sgst:381.35,igst:0,discount:0});
 assert.equal(d.lineTotal(line,false).total,5900);assert.equal(d.lineTotal(line,false).tax,900);
});
test('amount discounts apply once to the whole line, shipping adds once and split tax reconciles',()=>{
 const product={...makeLine('P006'),qty:2,rate:1000,tax:18,discount:100,discountType:'Amount'};
 const charge={...product,productId:'',name:'Shipping',lineType:'Charge',qty:1,rate:100,discount:0};
 const sum=d.totals({lines:[product,charge],inclusive:false});assert.equal(sum.base,2000);assert.equal(sum.tax,360);assert.equal(sum.total,2360);assert.equal(sum.cgst+sum.sgst,sum.tax);
 assert.equal(d.lineTotal({...product,discount:2000},true).total,0);
 assert.equal(d.lineTotal({...product,tax:0},true).tax,0);
});
test('a partial return prorates a fixed line discount',()=>{
 const b=invoice({lines:[{...makeLine('P006'),qty:2,rate:1000,tax:0,discount:100,discountType:'Amount'}]});
 const s=op.issueBill(fresh(),b);const next=op.processReturn(s,{id:'R-DISCOUNT',type:'Customer',reference:b.id,date:d.TODAY,productId:'P006',qty:1,serials:[],amount:950,reason:'One unit returned',disposition:'Restock',status:'Completed'},0,'Cash');
 assert.equal(d.balance(next,b),950);
});
test('additional charges and a payment produce one receipt and the correct invoice due',()=>{
 const b=invoice({lines:[{...makeLine('P006'),rate:1000,tax:18},{...makeLine('P006'),productId:'',name:'Shipping',lineType:'Charge',rate:100,tax:18}]});
 let s=op.issueBill(fresh(),b);const before=d.accountBalance(s,'Bank account');s=op.addPayment(s,{id:'P-CHARGE',date:d.TODAY,direction:'In',account:'Bank account',amount:500,purpose:'Customer payment',reference:b.id,party:b.customerId,note:'UPI'});
 assert.equal(d.balance(s,b),600);assert.equal(d.accountBalance(s,'Bank account'),before+500);assert.equal(s.products.find(p=>p.id==='P006').stock,14);
});
test('closed dates reject backdated financial changes',()=>{
 const s=fresh();assert.throws(()=>op.issueBill(s,invoice({date:'2026-09-08'})),/closed/);
 assert.throws(()=>op.addPayment(s,{id:'X',date:'2026-09-08',direction:'In',account:'Cash',amount:100,purpose:'Owner contribution',reference:'X',party:'Owner',note:''}),/closed/);
});
test('closing requires the prior day, all profits and every account to match',()=>{
 let s=fresh();const count=date=>Object.fromEntries(Object.entries(closing.dayFacts(s,date).accounts).map(([a,v])=>[a,v.closing]));
 const firstOpen=closing.nextDate(s.closings.map(c=>c.date).sort().at(-1));
 assert.throws(()=>closing.closeDay(s,d.TODAY,count(d.TODAY),''),new RegExp(`Close ${firstOpen} first`));
 s.bills=s.bills.map(b=>({...b,profit:0}));s.returns=s.returns.map(r=>({...r,profit:0}));
 for(let date=firstOpen;date<d.TODAY;date=closing.nextDate(date)){const isHol=s.holidays.some(h=>h.date===date);s=closing.closeDay(s,date,count(date),isHol?'Weekly holiday':'Reconciled',isHol);}
 const counts=count(d.TODAY);assert.throws(()=>closing.closeDay(s,d.TODAY,{...counts,'Bank account':counts['Bank account']+1},''),/does not tally/);
 s=closing.closeDay(s,d.TODAY,counts,'Reconciled');assert.ok(closing.isLocked(s,d.TODAY));
 assert.equal(closing.dayFacts(s,closing.nextDate(d.TODAY)).accounts.Cash.opening,counts.Cash);
});
test('holiday carries balances and rejects transactions on that date',()=>{
 let s=fresh();s.bills=s.bills.filter(b=>b.date<'2026-09-09');s.payments=s.payments.filter(p=>p.date<'2026-09-09');s.purchases=s.purchases.filter(p=>p.date<'2026-09-09');s.returns=[];s.holidays.push({date:'2026-09-09',reason:'Closed'});
 const counts=Object.fromEntries(Object.entries(closing.dayFacts(s,'2026-09-09').accounts).map(([a,v])=>[a,v.closing]));
 assert.throws(()=>op.issueBill(s,invoice({date:'2026-09-09'})),/holiday/);
 s=closing.closeDay(s,'2026-09-09',counts,'Weekly holiday',true);assert.equal(s.closings.at(-1).status,'Holiday');
});
test('supplier payment updates only selected product allocations',()=>{
 let s=fresh();const b=s.purchases.find(p=>p.status==='Received'&&d.balance(s,p)>0);const row=settlement.purchaseLineBalances(s,b).find(l=>l.due>0);
 const amount=Math.min(1000,row.due);s=op.addPayment(s,{id:'ALLOC',date:d.TODAY,direction:'Out',account:'Bank account',amount,purpose:'Supplier payment',reference:b.id,party:b.supplierId,note:'Selected product',allocations:[{productId:row.productId,amount}]});
 const next=settlement.purchaseLineBalances(s,b);assert.equal(next.find(l=>l.productId===row.productId).due,row.due-amount);assert.ok(Math.abs(next.reduce((a,l)=>a+l.due,0)-d.balance(s,b))<.02);
});
test('supplier credits across paid lines reconcile with the bill balance',()=>{
 const s=fresh();const b=s.purchases.find(p=>p.status==='Received'&&d.balance(s,p)>0);const rows=settlement.purchaseLineBalances(s,b);const paid=rows.find(l=>l.paid>0);s.returns.push({id:'CREDIT',type:'Supplier',reference:b.id,date:d.TODAY,productId:paid.productId,qty:1,serials:[],amount:paid.total,reason:'Test',disposition:'Supplier',status:'Completed'});
 assert.ok(Math.abs(settlement.purchaseLineBalances(s,b).reduce((a,l)=>a+l.due,0)-d.balance(s,b))<.02);
});
test('invoice captures customer and shop details at issue time',()=>{
 const s=op.issueBill(fresh(),invoice());s.customers[0].name='Changed customer';s.settings.name='Changed shop';assert.notEqual(s.bills[0].customerSnapshot.name,s.customers[0].name);assert.notEqual(s.bills[0].shopSnapshot.name,s.settings.name);
});
test('inclusive GST extracts tax without adding it twice',()=>{
  const t=d.totals({lines:[{...makeLine('P006'),rate:15000}],inclusive:true});
  assert.equal(t.total,15000);assert.equal(t.base,12711.86);assert.equal(t.tax,2288.14);
});
test('exclusive GST and line discounts calculate together',()=>{
  const t=d.totals({lines:[{...makeLine('P006'),qty:2,rate:1000,discount:10}],inclusive:false});
  assert.equal(t.base,1800);assert.equal(t.tax,324);assert.equal(t.total,2124);
});
test('quotation changes neither stock nor money',()=>{
 const s=fresh(),next=op.issueBill(s,invoice({kind:'Quotation',status:'Draft'}));
 assert.deepEqual(next.products,s.products);assert.deepEqual(next.payments,s.payments);assert.equal(next.bills.length,s.bills.length+1);
});
test('credit sale decreases stock and creates a due without cash',()=>{
 const s=fresh(),next=op.issueBill(s,invoice());assert.equal(next.products.find(p=>p.id==='P006').stock,14);assert.equal(d.balance(next,next.bills[0]),799);assert.equal(d.accountBalance(next,'Cash'),d.accountBalance(s,'Cash'));
});
test('split payments settle one sale with one profit field',()=>{
 let s=op.issueBill(fresh(),invoice());const bill=s.bills[0];
 for(const [amount,account] of [[300,'Cash'],[499,'Bank account']])s=op.addPayment(s,{id:d.uid('PAY'),date:d.TODAY,direction:'In',account,amount,purpose:'Customer payment',reference:bill.id,party:'C001',note:''});
 assert.equal(d.balance(s,bill),0);assert.equal(s.bills.filter(b=>b.id===bill.id).length,1);assert.equal(s.bills[0].profit,null);
 assert.throws(()=>op.addPayment(s,{id:'BAD',date:d.TODAY,direction:'In',account:'Cash',amount:1,purpose:'Customer payment',reference:bill.id,party:'C001',note:''}),/exceeds/);
});
test('purchase receipt creates stock, not a cash payment; cannot receive twice',()=>{
 const s=fresh();const purchase={id:'TEST-PUR',supplierId:'S002',date:d.TODAY,due:'2026-10-10',reference:'TEST',status:'Ordered',lines:[makeLine('P006',2,500)],inclusive:true,notes:''};
 const next=op.receivePurchase(s,purchase);assert.equal(next.products.find(p=>p.id==='P006').stock,17);assert.deepEqual(next.payments,s.payments);assert.equal(d.balance(next,next.purchases[0]),1000);assert.throws(()=>op.receivePurchase(next,purchase),/already/);
});
test('serialized purchase rejects missing and duplicate serials atomically',()=>{
 const s=fresh();const b={id:'TEST-PUR',supplierId:'S001',date:d.TODAY,due:d.TODAY,reference:'X',status:'Ordered',lines:[makeLine('P001')],inclusive:true,notes:''};
 assert.throws(()=>op.receivePurchase(s,b),/serial/);b.lines[0].serials=['P001-SN1001'];assert.throws(()=>op.receivePurchase(s,b),/already exists/);assert.equal(s.products[0].stock,5);
});
test('reservation reduces availability; another customer cannot take reserved serial',()=>{
 const s=fresh(),p=s.products.find(p=>p.id==='P004');assert.equal(d.available(s,p),1);
 assert.throws(()=>op.issueBill(s,invoice({lines:[{...makeLine('P004'),serials:['P004-SN1001']}]})),/reserved/);
 const next=op.issueBill(s,invoice({customerId:'C002',lines:[{...makeLine('P004'),serials:['P004-SN1001']}]}));assert.equal(next.reservations[0].status,'Fulfilled');assert.equal(next.products.find(p=>p.id==='P004').stock,1);assert.ok(next.warranties.some(w=>w.serial==='P004-SN1001'));
});
test('invalid reservation is rejected without affecting source data',()=>{
 const s=fresh();assert.throws(()=>op.reserveStock(s,{id:'BAD',customerId:'C001',productId:'P006',qty:100,serials:[],date:d.TODAY,expires:'2026-09-12',status:'Active',notes:''}),/exceeds/);assert.equal(s.reservations.length,1);
});
test('cash-to-bank transfer preserves combined funds',()=>{
 const s=fresh(),total=s=>Object.keys(d.openingAccounts).reduce((a,k)=>a+d.accountBalance(s,k),0);
 const next=op.addPayment(s,{id:'T',date:d.TODAY,direction:'Transfer',account:'Cash',toAccount:'Bank account',amount:4000,purpose:'Transfer',reference:'T',party:'Shop',note:'Deposit'});
 assert.equal(total(next),total(s));assert.equal(d.accountBalance(next,'Cash'),d.accountBalance(s,'Cash')-4000);assert.equal(d.accountBalance(next,'Bank account'),d.accountBalance(s,'Bank account')+4000);
});
test('service part consumption decreases stock once',()=>{
 const s=op.consumePart(fresh(),'JOB-042','P011',1);assert.equal(s.products.find(p=>p.id==='P011').stock,6);
 const next=op.issueBill(s,invoice({kind:'Service',category:'Service',jobId:'JOB-042',lines:[makeLine('P011')]}));assert.equal(next.products.find(p=>p.id==='P011').stock,6);
});
test('return against unpaid bill adjusts due first and creates a current-day profit review',()=>{
 const s=op.issueBill(fresh(),invoice({profit:100}));const r={id:'TEST-CN',type:'Customer',reference:'TEST-INV',date:d.TODAY,productId:'P006',qty:1,serials:[],amount:799,reason:'Not required',disposition:'Restock',status:'Completed'};
 assert.throws(()=>op.processReturn(s,r,799,'Cash'),/Refund cannot exceed/);
 const next=op.processReturn(s,r,0,'Cash');assert.equal(d.balance(next,next.bills[0]),0);assert.equal(next.products.find(p=>p.id==='P006').stock,15);assert.equal(next.bills[0].profit,100);assert.equal(next.returns[0].profit,null);assert.throws(()=>op.processReturn(next,r,0,'Cash'),/quantity exceeds/);
});
test('paid return records refund and does not restock damaged item',()=>{
 let s=op.issueBill(fresh(),invoice());s=op.addPayment(s,{id:'P',date:d.TODAY,direction:'In',account:'Cash',amount:799,purpose:'Customer payment',reference:'TEST-INV',party:'C001',note:''});const cash=d.accountBalance(s,'Cash');const next=op.processReturn(s,{id:'CN',type:'Customer',reference:'TEST-INV',date:d.TODAY,productId:'P006',qty:1,serials:[],amount:799,reason:'Damaged',disposition:'Quarantine damaged item',status:'Completed'},799,'Cash');assert.equal(next.products.find(p=>p.id==='P006').stock,14);assert.equal(d.accountBalance(next,'Cash'),cash-799);assert.equal(d.balance(next,next.bills[0]),0);
});
test('supplier return removes only the selected serial and credits original purchase',()=>{
 const s=fresh(),b=s.purchases.find(p=>p.id==='PUR-2026-0031');const before=d.balance(s,b);const next=op.processReturn(s,{id:'SRET',type:'Supplier',reference:b.id,date:d.TODAY,productId:'P001',qty:1,serials:['P001-SN1001'],amount:40500,reason:'Return to dealer',disposition:'Return to supplier',status:'Completed'},0,'Bank account');assert.equal(next.products[0].stock,4);assert.ok(!next.products[0].serials.includes('P001-SN1001'));assert.equal(d.balance(next,b),before-40500);
});
test('negative rates, excessive discounts and overselling are rejected',()=>{
 for(const change of [{rate:-1},{discount:101},{qty:1000}])assert.throws(()=>op.issueBill(fresh(),invoice({lines:[{...makeLine('P006'),...change}]})));
});

test('interstate inclusive and exclusive GST uses only IGST',()=>{
 const line={qty:1,rate:5000,tax:18,discount:0};
 const inc=d.lineTotal(line,true,'Inter-state');assert.equal(inc.total,5000);assert.equal(inc.igst,762.71);assert.equal(inc.cgst+inc.sgst,0);
 const exc=d.lineTotal({...line,discount:10},false,'Inter-state');assert.equal(exc.base,4500);assert.equal(exc.igst,810);assert.equal(exc.total,5310);
 const sum=d.totals({lines:[line,line],inclusive:true,taxMode:'Inter-state'});assert.equal(sum.total,10000);assert.equal(sum.igst,1525.42);assert.equal(sum.cgst+sum.sgst,0);
});
