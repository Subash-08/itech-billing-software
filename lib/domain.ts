import {calculateGst} from './gst';
import type {Extensions} from './extensions';
export const TODAY = '2026-09-10';
export const money = (n:number) => new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:2}).format(n);
export const shortMoney = (n:number) => n >= 100000 ? `₹${(n/100000).toFixed(2)}L` : `₹${Math.round(n).toLocaleString('en-IN')}`;
export const dateLabel = (d:string) => new Date(d+'T12:00:00').toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});
export type Customer = {id:string;name:string;phone:string;email:string;address:string;gst:string;type:string;notes:string;details?:Record<string,string>};
export type Product = {id:string;name:string;category:string;brand:string;condition:'New'|'Used';model:string;hsn:string;cost:number;price:number;tax:number;stock:number;low:number;serials:string[];warranty:number;supplier:string};
export type Supplier = {id:string;name:string;phone:string;email:string;address:string;gst:string;terms:number};
export type Line = {productId:string;name:string;qty:number;rate:number;discount:number;tax:number;serials:string[];hsn:string;warranty:number;warrantyPhotos?:string[];discountType?:'Percentage'|'Amount';lineType?:'Product'|'Service'|'Charge';purchaseId?:string};
export type Bill = {id:string;customerId:string;date:string;due:string;kind:'Sale'|'Service'|'Quotation';category:'New goods'|'Used goods'|'Service';status:string;lines:Line[];inclusive:boolean;taxMode?:'Intra-state'|'Inter-state';placeOfSupply?:string;notes:string;profit:number|null;customerSnapshot?:Customer;shopSnapshot?:StateBase['settings'];templateId?:string;shipTo?:{name:string;address:string;phone:string;state:string;postalCode:string};previewPaid?:number;orderRef?:string;deliveryNote?:string;dispatch?:string;jobId?:string;enquiryId?:string;sourceId?:string;attachment?:string};
export type Purchase = {id:string;supplierId:string;date:string;due:string;reference:string;status:string;receivedDate?:string;lines:Line[];inclusive:boolean;taxMode?:'Intra-state'|'Inter-state';placeOfSupply?:string;notes:string};
export type Payment = {id:string;date:string;direction:'In'|'Out'|'Transfer';account:string;toAccount?:string;amount:number;purpose:string;reference:string;party:string;note:string;allocations?:{productId:string;amount:number}[]};
export type Job = {id:string;customerId:string;date:string;device:string;serial:string;problem:string;accessories:string[];condition:string;estimate:number;final:number;status:string;outcome:string;work:string;delivery:string;parts:{productId:string;qty:number}[];photos:string[]};
export type Enquiry = {id:string;customerId:string;date:string;category:string;requirement:string;budget:number;status:string;followUp:string;notes:string};
export type Reservation = {id:string;customerId:string;productId:string;qty:number;serials:string[];date:string;expires:string;status:string;notes:string};
export type ReturnRecord = {id:string;type:'Customer'|'Supplier';reference:string;date:string;productId:string;qty:number;serials:string[];amount:number;reason:string;disposition:string;status:string;profit?:number|null};
export type Warranty = {id:string;customerId:string;productId:string;serial:string;invoiceId:string;start:string;end:string;coverage:string;status:string;notes:string;photos?:string[]};
export type Attachment = {id:string;customerId:string;name:string;date:string;url:string;note:string};
export type StateBase = {attachments:Attachment[];customers:Customer[];products:Product[];suppliers:Supplier[];bills:Bill[];purchases:Purchase[];payments:Payment[];jobs:Job[];enquiries:Enquiry[];reservations:Reservation[];returns:ReturnRecord[];warranties:Warranty[];movements:{id:string;date:string;productId:string;qty:number;reason:string;reference:string}[];closings:{date:string;expected:number;actual:number;note:string;status?:string;bankActuals?:Record<string,number>}[];audit:{id:string;action:string;detail:string}[];settings:{name:string;phone:string;email:string;address:string;gst:string;bank:string;account:string;ifsc:string;declaration:string;logo:string};campaigns:{id:string;name:string;message:string;audience:string;status:string}[]};
export type State = StateBase & Extensions;
export const lineTotal=calculateGst;
export function totals(b:{lines:Line[];inclusive:boolean;taxMode?:'Intra-state'|'Inter-state'}){return b.lines.reduce((a,l)=>{const t=lineTotal(l,b.inclusive,b.taxMode);return {base:a.base+t.base,tax:a.tax+t.tax,total:a.total+t.total,cgst:a.cgst+t.cgst,sgst:a.sgst+t.sgst,igst:a.igst+t.igst};},{base:0,tax:0,total:0,cgst:0,sgst:0,igst:0});}
export const roundedTotal=(b:{lines:Line[];inclusive:boolean})=>Math.round(totals(b).total*100)/100;
export const uid=(prefix:string)=>`${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2,5).toUpperCase()}`;
export const activeReservation=(r:Reservation)=>r.status==='Active'&&r.expires>=TODAY;
export const reserved=(s:State,p:string)=>s.reservations.filter(r=>r.productId===p&&activeReservation(r)).reduce((a,r)=>a+r.qty,0);
export const available=(s:State,p:Product)=>p.stock-reserved(s,p.id);
export function paid(s:State,ref:string){return s.payments.filter(p=>p.reference===ref&&['Customer payment','Supplier payment','Customer refund','Supplier refund'].includes(p.purpose)).reduce((a,p)=>a+(['Customer refund','Supplier refund'].includes(p.purpose)?-p.amount:p.amount),0);}
export function credits(s:State,ref:string){return s.returns.filter(r=>r.reference===ref).reduce((a,r)=>a+r.amount,0);}
export function balance(s:State,b:Bill|Purchase){return Math.max(0,Math.round((roundedTotal(b)-credits(s,b.id)-paid(s,b.id))*100)/100);}
export const openingAccounts:Record<string,number>={'Cash':25000,'Bank account':240000};
export function accountBalance(s:State,account:string,until=TODAY){return (openingAccounts[account]||0)+s.payments.filter(p=>p.date<=until).reduce((a,p)=>a+(p.account===account?(p.direction==='In'?p.amount:-p.amount):0)+(p.direction==='Transfer'&&p.toAccount===account?p.amount:0),0);}


