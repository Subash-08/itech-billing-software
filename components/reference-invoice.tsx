import type {CSSProperties, ReactNode} from 'react';
import {Bill, State, lineTotal, totals} from '@/lib/domain';
import {InvoiceTemplate} from '@/lib/extensions';
import {amountWords} from '@/lib/amount-words';

// One renderer for template preview, print, single PDF and browser ZIP export.
export default function ReferenceInvoice({bill, template: t, shop, customer, supplier = false, received = 0, due = 0, demo = false}: {
  bill: Bill; template: InvoiceTemplate; shop: State['settings'];
  customer?: {name: string; address?: string; phone?: string; gst?: string; details?: Record<string,string>};
  supplier?: boolean; received?: number; due?: number; demo?: boolean;
}) {
  const f = t.fields;
  const sum = totals(bill);
  const cols = t.columns.filter(c => c.show);
  const buyer = bill.billTo || customer;
  const number = (bill as any).invoiceNumber || (bill as any).quotationNumber || bill.id;
  const draft = bill.status === 'Draft';
  const inter = bill.taxMode === 'Inter-state';
  const num = (n: number) => n.toLocaleString('en-IN', {minimumFractionDigits:2, maximumFractionDigits:2});
  const date = (value?: string) => value ? new Date(value + 'T12:00:00Z').toLocaleDateString('en-GB', {day:'2-digit',month:'short',year:'2-digit',timeZone:'UTC'}).replace(/ /g,'-') : '';
  const groups = Object.values(bill.lines.reduce<Record<string,{hsn:string;rate:number;base:number;cgst:number;sgst:number;igst:number}>>((a,l) => {
    const x = lineTotal(l,bill.inclusive,bill.taxMode);
    const rate = l.taxTreatment === 'Exempt' || l.taxTreatment === 'NonGST' ? 0 : l.tax;
    const key = `${l.hsn}|${rate}|${l.taxTreatment || 'Taxable'}`;
    a[key] ??= {hsn:l.hsn,rate,base:0,cgst:0,sgst:0,igst:0};
    a[key].base += x.base; a[key].cgst += x.cgst; a[key].sgst += x.sgst; a[key].igst += x.igst;
    return a;
  },{}));
  const rates = Object.values(groups.reduce<Record<string,{rate:number;cgst:number;sgst:number;igst:number}>>((a,g) => {
    a[g.rate] ??= {rate:g.rate,cgst:0,sgst:0,igst:0};
    a[g.rate].cgst += g.cgst; a[g.rate].sgst += g.sgst; a[g.rate].igst += g.igst;
    return a;
  },{}));
  const widths: Record<string,number> = {index:3,description:47,hsn:10,qty:10,rateExcl:10,per:4.5,amount:15.5,tax:7,rateIncl:10,discount:8,warranty:9};
  const weight = cols.reduce((n,c) => n + (widths[c.id] || 10),0);
  const cells = (values: Record<string,ReactNode>) => cols.map(c => <td key={c.id} data-column={c.id} style={{textAlign:c.align}}>{values[c.id]}</td>);
  const hasValue = (value: ReactNode) => value !== undefined && value !== null && String(value).trim() !== '';
  const meta = (key:string,label:string,value:ReactNode, keepEmpty = false) => f[key] && (keepEmpty || hasValue(value)) ? <div key={`${key}-${label}`}><span>{label}</span><strong>{hasValue(value) ? value : '\u00a0'}</strong></div> : null;
  const title = draft ? (bill.kind === 'Quotation' ? 'DRAFT QUOTATION' : 'DRAFT INVOICE') : t.title || (bill.kind === 'Quotation' ? 'QUOTATION' : supplier ? 'PURCHASE RECORD' : bill.kind === 'Service' ? 'SERVICE INVOICE' : sum.tax ? 'TAX INVOICE' : 'SALES INVOICE');
  const quantityLines = bill.lines.filter(l => l.lineType !== 'Charge');
  const totalQuantity = quantityLines.reduce((n,l) => n + l.qty, 0);
  const quantityUnits = [...new Set(quantityLines.map(l => (l as any).unit || 'Nos'))];
  const totalQuantityLabel = quantityUnits.length === 1 ? `${totalQuantity} ${quantityUnits[0]}` : `${totalQuantity}`;
  const hasShipTo = Boolean(bill.shipTo && [bill.shipTo.name,bill.shipTo.address,bill.shipTo.phone,bill.shipTo.state,bill.shipTo.postalCode].some(v => v?.trim()));
  return <div className="print-area"><article className={`invoice-paper template-paper reference-paper ${draft ? 'draft-document' : ''} ${t.borders ? '' : 'reference-no-borders'}`} style={{'--reference-font':`${t.fontSize}px`,'--invoice-accent':t.accent} as CSSProperties}>
    <header className="ref-title"><h2>{title}</h2><i>{draft ? 'DRAFT - NOT A TAX INVOICE' : '(ORIGINAL FOR RECIPIENT)'}</i></header>
    <div className="ref-box">
      <section className="ref-heading">
        <div className="ref-parties">
          <div className={`ref-seller logo-${t.logoPosition}`}>
            {f.logo && shop.logo && <img src={shop.logo} alt="Company logo" />}
            <div>{f.shopName && shop.name && <b>{shop.name}</b>}{f.shopAddress && shop.address && <p>{shop.address}</p>}{f.shopGst && shop.gst && <p>GSTIN/UIN: {shop.gst}</p>}{f.shopState !== false && shop.state && <p>State Name: {shop.state}{shop.stateCode ? `, Code: ${shop.stateCode}` : ''}</p>}{f.shopPhone && shop.phone && <p>Contact: {shop.phone}</p>}{f.shopEmail && shop.email && <p>E-Mail: {shop.email}</p>}</div>
          </div>
          <div className="ref-buyer"><span>{supplier ? 'Supplier' : 'Buyer (Bill to)'}</span>{f.customerName && buyer?.name && <b>{buyer.name}</b>}{f.customerAddress && buyer?.address && <p>{buyer.address}</p>}{f.customerPhone && buyer?.phone && <p>{buyer.phone}</p>}{f.customerGst && customer?.gst && <p>GSTIN/UIN: {customer.gst}</p>}{f.customerState !== false && ((buyer as any)?.state || customer?.details?.state) && <p>State Name: {(buyer as any)?.state || customer?.details?.state}{(buyer as any)?.stateCode ? `, Code: ${(buyer as any).stateCode}` : ''}</p>}
          {f.shipping && hasShipTo && bill.shipTo && <div className="ref-shipping"><b>Ship to (Deliver to)</b>{bill.shipTo.name&&<p>{bill.shipTo.name}</p>}{bill.shipTo.address&&<p>{bill.shipTo.address}</p>}{bill.shipTo.phone&&<p>{bill.shipTo.phone}</p>}{(bill.shipTo.state||bill.shipTo.postalCode)&&<p>{bill.shipTo.state} {bill.shipTo.postalCode}</p>}</div>}</div>
        </div>
        <div className="ref-meta">
          {meta('number',draft ? 'Draft reference' : bill.kind === 'Quotation' ? 'Quotation No.' : 'Invoice No.',number)}{meta('date','Dated',date(bill.date))}
          {meta('delivery','Delivery Note',bill.deliveryNote)}{meta('referenceBoxes','Mode/Terms of Payment','',true)}
          {meta('reference','Reference No. & Date.',bill.sourceId || bill.jobId)}{meta('referenceBoxes','Other References','',true)}
          {meta('order',"Buyer's Order No.",bill.orderRef)}{meta('referenceBoxes','Dated','',true)}
          {meta('referenceBoxes','Dispatch Doc No.','',true)}{meta('referenceBoxes','Delivery Note Date','',true)}
          {meta('dispatch','Dispatched through',bill.dispatch)}{meta('destination','Destination',bill.placeOfSupply)}
          {f.due && meta('due',bill.kind === 'Quotation' ? 'Valid until' : 'Due date',date(bill.due))}
          {f.referenceBoxes && <div className="ref-delivery-terms"><span>Terms of Delivery</span></div>}
        </div>
      </section>
      <table className="ref-items"><colgroup>{cols.map(c => <col key={c.id} style={{width:`${(widths[c.id] || 10)/weight*100}%`}}/>)}</colgroup><thead><tr>{cols.map(c => <th key={c.id} data-column={c.id}>{c.id === 'index' ? <span>Sl.<br/>No.</span> : c.label}</th>)}</tr></thead><tbody>
        {bill.lines.map((l,i) => {
          const x = lineTotal(l,bill.inclusive,bill.taxMode);
          const inclusive = l.priceEntryMode ? l.priceEntryMode === 'Inclusive' : bill.inclusive;
          const factor = l.taxTreatment === 'NonGST' || l.taxTreatment === 'Exempt' ? 1 : 1+l.tax/100;
          const unit = (l as any).unit || 'Nos';
          return <tr key={i} className="ref-item">{cells({index:i+1,description:<><b>{l.name}</b>{f.model && (l as any).model && <small>{(l as any).model}</small>}{l.description && <small className="ref-description">{l.description}</small>}{f.serials && l.serials?.map(sn => <i className="ref-serial" key={sn}>SN: {sn}</i>)}{f.warranty && l.warranty > 0 && <small>Warranty: {l.warranty} months</small>}</>,hsn:l.hsn,qty:<b>{l.qty} {unit}</b>,per:unit,rateExcl:num(inclusive ? l.rate/factor : l.rate),rateIncl:num(inclusive ? l.rate : l.rate*factor),amount:<b>{num(x.base)}</b>,tax:l.taxTreatment === 'NonGST' ? 'Non-GST' : l.taxTreatment === 'Exempt' ? 'Exempt' : `${l.tax}%`,discount:l.discountType === 'Amount' ? num(l.discount) : `${l.discount}%`,warranty:l.warranty ? `${l.warranty} months` : ''})}</tr>;
        })}
        {f.subtotal && <tr className="ref-tax">{cells({description:<i>Taxable value</i>,amount:num(sum.base)})}</tr>}
        {f.taxes && rates.flatMap(g => (inter ? [['IGST',g.igst,g.rate] as const] : [['CGST',g.cgst,g.rate/2] as const,['SGST',g.sgst,g.rate/2] as const]).filter(([,amount]) => amount !== 0).map(([name,amount,rate]) => <tr key={`${name}-${g.rate}`} className="ref-tax">{cells({description:<b><i>OUTPUT {name} {rate}%</i></b>,rateExcl:rate,per:'%',amount:<b>{num(amount)}</b>})}</tr>))}
        <tr className="ref-filler" aria-hidden="true">{cells({})}</tr>
        {f.grandTotal && <tr className="ref-total">{cells({description:'Total',qty:<b>{totalQuantityLabel}</b>,amount:<b>₹ {num(sum.total)}</b>})}</tr>}
      </tbody></table>
      {f.amountWords && <div className="ref-words"><i>E. & O.E.</i><span>Amount Chargeable (in words)</span><b>INR {amountWords(sum.total)}</b></div>}
      {f.payments && bill.kind !== 'Quotation' && <div className="ref-payment">Received: ₹ {num(received)} <span>Outstanding: ₹ {num(due)}</span></div>}
      {f.taxSummary && <><table className="ref-tax-summary"><thead><tr><th rowSpan={2}>HSN/SAC</th><th rowSpan={2}>Taxable<br/>Value</th><th colSpan={2}>{inter ? 'Integrated Tax' : 'Central Tax'}</th>{!inter && <th colSpan={2}>State Tax</th>}<th rowSpan={2}>Total<br/>Tax Amount</th></tr><tr><th>Rate</th><th>Amount</th>{!inter && <><th>Rate</th><th>Amount</th></>}</tr></thead><tbody>{groups.map((g,i)=><tr key={i}><td>{g.hsn}</td><td>{num(g.base)}</td><td>{inter?g.rate:g.rate/2}%</td><td>{num(inter?g.igst:g.cgst)}</td>{!inter&&<><td>{g.rate/2}%</td><td>{num(g.sgst)}</td></>}<td>{num(g.cgst+g.sgst+g.igst)}</td></tr>)}<tr className="ref-tax-total"><td>Total</td><td>{num(sum.base)}</td><td/><td>{num(inter?sum.igst:sum.cgst)}</td>{!inter&&<><td/><td>{num(sum.sgst)}</td></>}<td>{num(sum.tax)}</td></tr></tbody></table>{f.taxWords !== false && <div className="ref-tax-words">Tax Amount (in words): <b>INR {amountWords(sum.tax)}</b></div>}</>}
      <section className="ref-bottom"><div className="ref-declaration">{f.declaration&&<><u>Declaration</u><p>{shop.declaration}</p></>}{f.notes&&bill.notes&&<p>{bill.notes}</p>}</div><div className="ref-bank-sign">{f.bank&&<div className="ref-bank">Company's Bank Details<p>A/c Holder's Name : <b>{shop.name}</b></p><p>Bank Name : <b>{shop.bank}</b></p><p>A/c No. : <b>{shop.account}</b></p><p>Branch &amp; IFS Code : <b>{shop.ifsc}</b></p></div>}{f.signatures&&<div className="ref-sign"><b>for {shop.name}</b><span>Authorised Signatory</span></div>}</div></section>
    </div>{f.footer&&<p className="ref-footer">{t.footer}</p>}{demo&&<p className="ref-footer ref-demo">DEMO — not a valid tax invoice</p>}
  </article></div>;
}
