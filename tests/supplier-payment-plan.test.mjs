import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {planSupplierPayment, planSupplierSettlement} = createRequire(import.meta.url)('../.test-build/supplier-payment-plan.js');
const bill = (id, amount, date = '2026-10-01') => ({id, type:'Purchase',number:id,date,dueDate:'2026-11-01',duePaise:amount,lines:[{lineId:`${id}-1`,duePaise:amount}]});
test('one amount settles oldest bills and part of the next',()=>{
  const p=planSupplierPayment([bill('C',500000,'2026-10-03'),bill('A',400000),bill('B',300000,'2026-10-02')],1000000);
  assert.deepEqual(p.allocations.map(a=>[a.targetId,a.amountPaise]),[['A',400000],['B',300000],['C',300000]]);assert.equal(p.excessPaise,0);
});
test('selected bills only; available credit is used without a second cash payment',()=>{
  const p=planSupplierSettlement([bill('A',400000),bill('B',300000)],100000,150000,['B']);
  assert.equal(p.creditUsedPaise,150000);assert.equal(p.payment[0].amountPaise,100000);assert.equal(p.credit[0].targetId,'B');assert.equal(p.excessPaise,0);
});
test('unused credit stays available and excess cash stays separate',()=>{
  const p=planSupplierSettlement([bill('A',10000)],5000,20000);
  assert.equal(p.creditUsedPaise,10000);assert.deepEqual(p.payment,[]);assert.equal(p.excessPaise,5000);
});
test('credit-only settlement and opening payable work',()=>{
  const b={id:'OPEN',type:'OpeningPayable',number:'Old bill',date:'2026-09-01',dueDate:'',duePaise:10001,lines:[]};
  const p=planSupplierSettlement([b,bill('A',10000)],0,15000);
  assert.deepEqual(p.credit.map(a=>a.amountPaise),[10001,4999]);assert.equal(p.credit[0].targetType,'OpeningPayable');
});
test('bill line reconciliation, duplicate targets and invalid amounts fail closed',()=>{
  const b=bill('A',100);b.lines[0].duePaise=99;
  assert.throws(()=>planSupplierPayment([b],100),/do not match/);
  assert.throws(()=>planSupplierPayment([bill('A',100),bill('A',100)],100),/Duplicate/);
  for(const x of [-1,NaN,Infinity,0.5]) assert.throws(()=>planSupplierSettlement([],x,0));
});
test('payment and credit never allocate beyond bill due for many amounts',()=>{
  for(let due=1;due<100;due+=7)for(let cash=0;cash<150;cash+=11)for(let credit=0;credit<150;credit+=13){
    const p=planSupplierSettlement([bill('A',due)],cash,credit);
    const paid=p.payment.reduce((s,a)=>s+a.amountPaise,0);
    assert.equal(paid+p.excessPaise,cash);assert.ok(paid+p.creditUsedPaise<=due);assert.ok(p.creditUsedPaise<=credit);
  }
});
