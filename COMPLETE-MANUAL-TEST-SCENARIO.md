# Complete manual acceptance scenario

Use this on a dedicated test company before real trading. `T` means the actual current business date in Asia/Kolkata. Complete the numbered checks in order and stop at the first incorrect balance, stock quantity or status. Record the route, screenshot, input, expected result and actual result.

This dataset uses exactly five customers and five products. It covers the live modules without filling the production database with unnecessary records.

## 1. Account and company setup

- [ ] Sign up: owner `Subash Test`, company `iTech Acceptance Shop`, a new email, a private login password and a different profit password.
- [ ] Confirm login is blocked before `verified: true`, then approve the exact user and tenant with the supported approval script. Sign in and verify header company/name/email and Logout.
- [ ] Settings → Shop details:
  - Shop: `iTech Acceptance Shop`
  - Phone: `98421 00001`
  - Email: `accounts@itech-acceptance.example`
  - Address: `9/2 RBT Mall, Meyyanur Main Road, Salem`
  - GSTIN: use an accountant-approved test GSTIN; leave blank if this test company is non-GST. Never use another firm's real GSTIN.
  - State: `Tamil Nadu`; state code: `33`; postal code: `636004`
  - Bank: `Canara Bank, Salem`; account: `TEST-0001`; IFSC: `CNRB0001771`
  - Declaration: `We declare that this invoice shows the actual price and particulars of the goods and services.`
- [ ] Click Save changes. Button must disable and show a rotating loader plus `Saving changes…`; success appears once. Refresh and verify every field persists.
- [ ] Upload a PNG/WebP logo under 5 MiB. Refresh and verify it is private and visible. Unsupported or oversized file must fail clearly.
- [ ] Data & retention must identify Platform or Custom Cloudinary without displaying an API secret.

## 2. Template before invoices exist

- [ ] Open Invoice templates → Create first/New template before creating any invoice.
- [ ] A labelled `Preview-only sample invoice` must render using current company details. It must not create a customer, invoice, stock movement, payment or report entry.
- [ ] Name it `iTech Classic GST A4`; keep A4 portrait, borders, 11px, logo left.
- [ ] Enable company/customer details, ship-to, serials, warranty, totals, amount words, HSN summary, payment/due, bank, declaration and signatures.
- [ ] Use columns: Sl. No., Description, HSN/SAC, GST rate, Quantity, Rate incl. tax, Rate excl. tax, Amount. Save, make default, clone as `iTech Service Invoice`, rename and save.
- [ ] Confirm preview resembles the supplied invoice: centred title, seller/meta two-column header, Bill to/Ship to, bordered item table, tax totals, words, HSN summary, bank/declaration and signatures.

## 3. Master data

Create these five customers:

| Customer | Phone | Type/details |
|---|---|---|
| Anand Kumar | 9842101001 | Retail, Salem; no GSTIN |
| Priya Systems | 9842101002 | Business, Salem; unique test GSTIN if available |
| Ravi Used Laptops | 9842101003 | Used-goods buyer |
| Meena Service Customer | 9842101004 | Service customer |
| Delta Technologies | 9842101005 | Interstate customer, Bengaluru/Karnataka |

- [ ] Phone is mandatory and normalized phone search finds each record.
- [ ] Duplicate GSTIN in the same company is rejected. Blank GSTIN may be used by multiple customers.
- [ ] Customer profile starts with zero due and an empty timeline.

Create suppliers `Salem IT Distribution` and `Laptop Reuse Hub`, with phones, address, optional GSTIN and 30-day terms.

Create exactly these five products:

| Product | Condition/tracking | Purchase incl. GST | Sale incl. GST | GST | HSN | Warranty |
|---|---|---:|---:|---:|---|---:|
| Dell G15 Laptop | New, serial | ₹60,000 | ₹70,000 | 18% | 84713010 | 12 mo |
| LG 24-inch Monitor | New, serial | ₹7,000 | ₹9,000 | 18% | 85285200 | 36 mo |
| Logitech M185 Mouse | New, quantity | ₹500 | ₹800 | 18% | 84716060 | 12 mo |
| Crucial 500GB SSD | New, serial | ₹2,500 | ₹3,500 | 18% | 85235100 | 36 mo |
| HP EliteBook 840 G5 | Used, serial | ₹20,000 | ₹28,000 | choose approved used-goods treatment | 84713010 | 3 mo |

Create services: `Laptop diagnosis` ₹500, `Internal cleaning` ₹1,500, `PC assembly and testing` ₹1,000; SAC 998713, 18% unless your accountant specifies another treatment.

## 4. Opening setup

- [ ] Set cutoff `T-1`, physical Cash ₹50,000 and Account ₹2,50,000. No opening stock or dues for the main scenario.
- [ ] Save draft, refresh and verify exact values/version. Finalize once. It becomes locked and posts exactly two opening account movements.
- [ ] Operational posting on T is allowed; posting on/before cutoff is rejected.

Separate edge company: test opening receivable, payable, serialized stock and quantity stock; duplicate opening serial must be rejected. Never re-finalize opening setup after inactivity.

## 5. Purchase, receipt and supplier liability

- [ ] Supplier A purchase bill: 3 Dell G15 at ₹60,000, 10 mice at ₹500, 2 SSDs at ₹2,500; inclusive 18%; no payment. Total ₹1,90,000, due ₹1,90,000, stock remains zero until receipt.
- [ ] Receive all: Dell serials `DG15-A001..A003`, SSD serials `SSD-A001..A002`, mice quantity 10. Stock becomes Dell 3, SSD 2, Mouse 10. Money does not move.
- [ ] Pay ₹5,000 from Account allocated to the mouse line. Account becomes ₹2,45,000; supplier due ₹1,85,000. Product receipt remains independent from payment.
- [ ] Supplier B purchase/receive one used HP serial `HPEB-U001`, unpaid ₹20,000. Total supplier dues across both suppliers ₹2,05,000.
- [ ] Test purchase draft/edit/confirm/post, partial receipt, close remainder, attachment, due date and duplicate supplier bill protection separately.

## 6. Stock hold, quotation and enquiry

- [ ] Create enquiry for Anand: `Dell gaming laptop`, budget ₹75,000, Open. Phone/category filters find it.
- [ ] Create quotation for Anand: one Dell at ₹70,000 plus assembly charge ₹1,000. No stock, receivable or money changes.
- [ ] Reserve serial `DG15-A001` for Anand. Available Dell becomes 2 while on-hand remains 3. Priya cannot consume Anand's hold.
- [ ] Convert quotation once. Duplicate conversion must return conflict. The enquiry becomes Won only after the linked invoice is issued.
- [ ] Separately test hold release and expiry; released stock becomes available and creates no money movement.

## 7. Goods invoices and customer money

- [ ] Issue Anand's invoice using held `DG15-A001`, ₹70,000 plus ₹1,000 assembly Charge, within-state inclusive GST. Collect Cash ₹20,000 and Account/UPI ₹30,000. Due ₹21,000.
- [ ] Verify stock: Dell sellable 2, held 0, sold serial belongs to Anand/invoice; assembly charge changes no stock.
- [ ] Collect remaining ₹21,000 by Account from Dues/customer profile. Cash ₹70,000; Account ₹2,96,000; Anand due zero. Receipt increases collections, not sales.
- [ ] Issue Ravi a used-laptop invoice for `HPEB-U001` at ₹28,000 on full credit using the configured tax treatment. Ravi due ₹28,000; used stock zero.
- [ ] Issue Delta one SSD `SSD-A001` at ₹3,500 as interstate supply. Confirm IGST only, no CGST/SGST. Receive full Account payment. Account ₹2,99,500; SSD stock 1.
- [ ] Test exclusive GST separately: ₹5,000 exclusive at 18% = ₹5,900. Ten-percent percentage discount gives taxable ₹4,500, GST ₹810, total ₹5,310.
- [ ] Test ship-to, edited price/GST, fixed discount, Exempt, Non-GST, shipping, round-off, credit, partial and split payments. Blank/negative/malformed payment must fail; unchanged retry must create one issue/payment/stock posting.

## 8. Returns, credits, refunds and warranties

- [ ] Anand returns the Dell in sellable condition. Return credit ₹71,000 first offsets unpaid due (zero here), then becomes customer credit or refund according to selection. Return exact serial only; unrelated/duplicate return is rejected.
- [ ] Refund ₹71,000 using Cash ₹20,000 and Account ₹51,000 only if split-refund UI supports it; otherwise use Account only and ensure sufficient balance. Every component must appear once in the ledger. If split refund is unsupported, record that as a defect rather than inventing entries.
- [ ] Returned serial becomes sellable and stock Dell 3. Defective disposition must go to quarantine, not sellable.
- [ ] Return unsold Dell `DG15-A003` to Supplier A and accept ₹60,000 credit. No payment is made. Supplier A due becomes ₹1,25,000 (₹1,90,000 - ₹5,000 payment - ₹60,000 credit); Dell stock becomes 2 after Anand restock and supplier return.
- [ ] Pay Supplier A ₹50,000 from Account. Supplier A due ₹75,000. Statement must preserve original bill, line payment and credit separately.
- [ ] For the SSD sold to Delta, create/verify warranty coverage, photo evidence, repair claim, rejection and replacement using remaining serial `SSD-A002`. Replacement changes serial lineage once and does not create a second sale.

## 9. Service lifecycle

- [ ] Intake Meena's `Lenovo ThinkPad T14`, serial `PF3TEST01`; accessories text `65W charger, laptop bag`; problem and condition notes; upload two photos.
- [ ] Confirm photos are not downloaded until Show photos; hide/reopen and failed-photo retry work.
- [ ] Move Received → Diagnosis; revise estimate ₹2,000 → approved ₹2,500; add diagnostic notes.
- [ ] Consume one mouse as a part. Stock Mouse 9 and serial/lot movement appears once. Reverse once to Sellable or Defective and verify counters; consume again if required.
- [ ] Create separate Service invoice from the job: diagnosis ₹500 + cleaning ₹1,500 + consumed mouse at configured billing rate. Service and consumed parts must link to the job and must not decrement the part twice.
- [ ] Receive partial payment, collect due, mark ready and delivered. Adding a later photo must not change deliveredAt or money.
- [ ] Verify customer timeline and contribution totals separate New goods, Used goods and Service.

## 10. Cash, account and daily closing

- [ ] Record shop expense `Internet bill` ₹1,000 from Cash. Record other money-in `Owner contribution` ₹3,000 to Account. Contribution is not sales/profit.
- [ ] Transfer ₹4,000 Cash → Account, then a small Account → Cash transfer. Each creates linked opposite movements; transfer is neither income nor expense.
- [ ] Supplier and customer payments link to their source records. Reversal is allowed only while dependencies permit and never deletes issued history.
- [ ] Enter manual profit beside each eligible sale/service. Fully returned sale profit must be zero or use the required adjustment. Operating expenses are displayed separately; confirm the agreed convention: sum line profits, then subtract shop expenses once for net shop profit.
- [ ] Daily register shows automatic sales/service/receipts/refunds/supplier payments plus manual money-in/out. Reconcile physical Cash and Account separately. Deliberately create ₹1 variance, verify closing is blocked/warned, then correct it.
- [ ] Close T and verify immutable snapshot and carry-forward. Closed-day edits fail; later return/reversal posts an audited current-day adjustment.
- [ ] On a separate company, test holiday, missed inactive-day preview, 31-day bound, contiguous closing and activity-blocked holiday. Historical unrecorded activity remains unavailable and must not be fabricated via a new opening balance.

## 11. Reports, exports and documents

- [ ] Dashboard cards and graphs match source records for T. Profit remains hidden until owner unlock; direct reports/API must also hide it.
- [ ] Test Sales, Purchases, Tax, Services, Expenses, Profit, Inventory, Customer dues, Supplier dues, Returns and Invoice exports.
- [ ] For each relevant report verify date/customer/category/status filters, summary cards, page 2+, empty result and source links.
- [ ] CSV/XLSX/PDF contain the same filtered records and totals. Spreadsheet cells beginning with formula characters are safe. Invoice ZIP respects date/customer/template filters, contains every selected invoice plus manifest and never silently truncates.
- [ ] Open issued invoice preview, browser print, individual PDF and ZIP PDF. Compare logo, seller/buyer/ship-to, numbers, serials, HSN/SAC, GST split/IGST, totals, due, declaration, bank and pagination against the supplied reference.
- [ ] Issued invoices retain their original template/company/customer snapshots after later edits.

## 12. Files, archive, WhatsApp and isolation

- [ ] Document library displays only current-company files/invoices. Download images/PDFs through authorized routes; another tenant receives not found.
- [ ] Switch future uploads Platform → Custom Cloudinary → Platform in a disposable company. Historical files remain readable from pinned connections; secrets never appear in browser/API/logs.
- [ ] Cleanup tests only expired never-completed uploads after grace period; saved logo, service, warranty, purchase and invoice files remain.
- [ ] Archive/restore customer, supplier, product, service and template. Historical transactions remain visible; archived master cannot be used for a new transaction.
- [ ] WhatsApp preview normalizes the customer's phone and opens an editable prefilled message; the operator manually sends it. No bulk or automatic sending.
- [ ] Sign out, sign in to a second company and confirm no first-company customer, stock, invoices, balances, files or searches appear. Refresh must not produce hydration warnings.

## Release gate

Do not use real trading until all critical arithmetic/stock/tenant tests pass. Cosmetic differences can be logged separately, but any incorrect total, duplicate posting, cross-tenant access, missing file, stock mismatch or closing mismatch blocks release.

After manual acceptance, run one fixed-commit gate: TypeScript, production build, dependency audit, focused invoice/service/storage tests, then the financial/stock regression suites affected by any discovered fixes. Do not rerun every historical suite after each small UI correction.
