# Three-day production acceptance workflow

Run this in a new test company. Use three consecutive open business dates shown by the app. Do not reuse production customers, serials, payments, or supplier references.

## Test data

### Company and opening setup

- Shop: `Acceptance Computer Store`
- State: Tamil Nadu; state code `33`; PIN `636004`
- Opening cash: `₹10,000`
- Opening bank: `₹1,00,000`
- Opening customer and supplier balances: zero
- Opening inventory: zero
- Cutoff: the day before Day 1

Create and save one invoice template with the logo, bill-to, optional ship-to, bank details, GST summary, declaration, serial numbers and signature enabled. Confirm the preview and downloaded PDF use the same template.

### Suppliers

1. Salem IT Distribution — Tamil Nadu — 30-day credit
2. Laptop Reuse Hub — Tamil Nadu — 7-day credit

### Customers

1. Anand Kumar — Tamil Nadu — phone `9842101001`
2. Priya Systems — Karnataka — phone `9842101002`
3. Meena Service Customer — Tamil Nadu — phone `9842101003`
4. Delta Technologies — Tamil Nadu business customer — phone `9842101004`

### Products

1. HP EliteBook 840 G5 — serial tracked — GST 18% — HSN 84713010 — sell at ₹28,000 inclusive
2. LG 24-inch Monitor — serial tracked — GST 18% — HSN 85285200 — sell at ₹9,000 inclusive
3. Logitech M185 Mouse — quantity tracked — GST 18% — HSN 84716060 — sell at ₹800 inclusive
4. Crucial 500GB SSD — serial tracked — GST 18% — HSN 85235100 — sell at ₹3,500 inclusive
5. Crucial 8GB RAM — quantity tracked — GST 18% — HSN 84733099 — sell at ₹2,200 inclusive

Create one service catalogue item: `Laptop diagnosis and cleaning`, SAC `998713`, GST 18%, rate ₹1,500 exclusive.

## Day 1 — setup, purchasing, sales, service intake and closing

### 1. Account and controls

- Create the company account, complete mandatory shop details and opening setup.
- Confirm sales, purchases and money pages are blocked until company details and opening setup are complete.
- Add a cashier user. Confirm the cashier cannot unlock aggregate profit or change owner-only settings.
- In Data & retention, confirm storage reports Cloudinary as active. Upload the logo and reopen it through the authorized file link.

Expected: cash ₹10,000; bank ₹1,00,000; inventory zero; customer dues zero; supplier dues zero.

### 2. Purchase A — unpaid credit purchase

Create a purchase from Salem IT Distribution:

- 2 HP laptops at ₹20,000 inclusive each; serials `HP-A001`, `HP-A002`
- 5 mice at ₹500 inclusive each
- Supplier bill `SIT-1001`
- Due in 30 days
- Attach one PDF or JPEG supplier bill
- Confirm order, record bill and receive stock; do not pay

Expected:

- Supplier due increases by ₹42,500.
- Cash and bank do not change when the bill or stock receipt is recorded.
- Inventory shows 2 HP laptops and 5 mice.
- The purchase Overview shows the attachment; Receipts shows one physical receipt; Payments is empty.
- Entering one laptop serial, a duplicate serial, or three serials must fail without partial stock creation.

### 3. Purchase B — partial payment

Create a purchase from Laptop Reuse Hub:

- 3 LG monitors at ₹7,000 inclusive each
- Serials `LG-B001`, `LG-B002`, `LG-B003`
- Supplier bill `LRH-2001`
- Due in 7 days
- Receive all stock and pay ₹10,000 from Bank

Expected: original bill ₹21,000; paid ₹10,000; remaining ₹11,000; bank ₹90,000; monitor stock 3.

### 4. Purchase C — fully paid

Buy 2 SSDs at ₹2,500 inclusive from Salem IT Distribution, serials `SSD-C001`, `SSD-C002`, and pay ₹5,000 from Cash.

Expected: cash ₹5,000; SSD stock 2; no remaining amount on this purchase.

### 5. Enquiry and quotation

- Create an enquiry for Anand for a gaming laptop with expected value ₹35,000.
- Create a normal quotation and mark it Shared. Confirm no stock, cash, bank, customer due or profit changes.
- Create a pre-built PC quotation, add/remove a component and save it.
- Convert one accepted quotation to an invoice only once. A second conversion attempt must be rejected or return the existing invoice.

### 6. Sales invoices

Invoice Anand:

- HP `HP-A001` at ₹28,000 inclusive
- 2 mice at ₹800 inclusive each
- Receive ₹10,000 Cash and leave the rest due

Expected: total ₹29,600; due ₹19,600; HP sellable 1; mice sellable 3; cash ₹15,000. The exact HP lot cost is used for profit.

Invoice Delta:

- LG `LG-B001` at ₹9,000 inclusive
- Receive full payment into Bank

Expected: monitor sellable 2; bank ₹99,000; Delta due zero.

Invoice Priya as an interstate sale:

- SSD `SSD-C001` at ₹3,500 inclusive
- Add Karnataka bill-to/ship-to state and PIN
- Receive full payment into Bank

Expected: IGST only; CGST and SGST zero; SSD sellable 1; bank ₹1,02,500. Download/print must include bill-to and ship-to data and the selected serial.

Negative checks:

- A Tamil Nadu destination with Interstate selected must be corrected or rejected consistently.
- A Karnataka destination with Within-state selected must be rejected.
- A sold serial, nonexistent serial, defective serial, or duplicate serial cannot be issued.
- A physical custom charge cannot create stock. A non-stock charge may affect invoice value but not inventory.
- Saving a draft must not move stock, money, receivables, warranty or profit. It may print only with a draft watermark.

### 7. Service intake

- Create a job for Meena: laptop, service tag `MEENA-SVC-001`, charger and bag selected, plus a typed accessory.
- Upload two photos. On the detail page, confirm no photo is fetched before clicking Show photos.
- Move Received → Diagnosing → Estimate pending. Confirm the WhatsApp preview changes with the current status.

Expected: no sale, payment or stock movement yet.

### 8. Money and Day 1 closing

- Record ₹1,000 cash shop expense with a receipt.
- Transfer ₹4,000 from Cash to Bank.

Expected before closing: cash ₹10,000 and bank ₹1,06,500. The transfer changes each account but not combined funds.

- Open Daily closing. Enter required manual profit only for invoice lines where the system has no authoritative stock cost, such as a manual service or charge.
- Confirm product profit is already calculated from the selected stock lot and is not entered again.
- Enter physical cash/bank counts and close Day 1.
- Attempt to add a backdated transaction after closing; it must fail.

## Day 2 — payments, service billing, returns, credits and defective stock

### 1. Customer collection

Receive ₹9,600 from Anand into Bank against the invoice.

Expected: Anand due decreases from ₹19,600 to ₹10,000; bank increases by ₹9,600; payment appears on invoice, customer statement, money register and timeline once.

Replay the same request by double-clicking or retrying after an uncertain response. Expected: one payment only.

### 2. Customer returns

Return one mouse from Anand’s partly paid invoice as sellable, with customer credit and no cash refund.

Expected: mouse sellable stock +1; invoice/customer due decreases by ₹800 to ₹9,200; sales return and profit adjustment appear; cash/bank unchanged.

Return Priya’s fully paid SSD `SSD-C001` as damaged/defective and refund Bank.

Expected: bank -₹3,500; SSD sellable does not increase; defective stock +1; the returned serial cannot be sold; invoice net value, reports and profit are reduced once.

Negative checks:

- Return more than sold quantity, return the same serial twice, return another invoice’s serial, or refund more than the eligible surplus. Every attempt must fail atomically.
- A service-only return must not create inventory.

### 3. Defective stock control

On an available stock lot, click Mark defective for one unit and enter a reason.

Expected: sellable -1; defective +1; total physically on hand unchanged; the unit cannot be invoiced. Restore it and confirm sellable +1 and defective -1. This action is optional and is only needed for damaged goods kept in the shop.

### 4. Supplier return and supplier credit

From Laptop Reuse Hub, return `LG-B002` and `LG-B003` from the original receipt.

Expected immediately after physical return: monitor stock decreases by 2; original bill still shows ₹11,000 due; return status says awaiting supplier bill reduction.

Confirm the supplier’s return credit.

Expected after confirmation:

- Return value ₹14,000.
- Purchase remaining becomes zero.
- ₹3,000 becomes available supplier balance because ₹10,000 was already paid.
- Original bill remains visible; it is not rewritten or deleted.
- Supplier Overview, Product returns, Statement, Activity and purchase detail agree.

Try returning sold serial `LG-B001`. Expected: rejected. It can be returned to the supplier only after a genuine customer return restores that exact serial.

Create a new ₹2,200 supplier bill and apply ₹2,200 of the available supplier balance. Expected: new bill remaining zero and supplier balance ₹800. Refund the remaining ₹800 into Cash. Expected: cash +₹800 and one money-register entry; do not record another manual Money In.

### 5. Supplier payments

- Pay ₹30,000 to Salem IT Distribution from Bank using oldest bills first.
- Review the proposed bill allocation before confirming.

Expected: payment amount equals allocation total; oldest eligible bills reduce first; a partially covered bill keeps the remaining amount; stock does not change; one payment appears in supplier Payments, Statement, purchase allocations and bank register.

Negative checks: zero/negative payment, over-allocation, stale purchase version, duplicate submission, payment before supplier bill exists, and insufficient account balance must not create partial records.

### 6. Service completion and invoice

- Approve Meena’s estimate.
- Consume one mouse as a service part and progress to Ready for delivery.
- Issue the service invoice from the job with the consumed part and diagnosis/cleaning service.
- Receive a split payment: part Cash and part Bank; mark Delivered.

Expected: mouse stock decreases exactly once, not again when the service invoice is issued; service revenue and actual part cost feed profit; warranty is created where applicable; status WhatsApp text says ready/delivered; photos remain private.

### 7. Day 2 closing

- Confirm customer refunds, supplier refunds, payments, expenses and service collections appear in the correct cash/bank totals.
- Close only after required unknown-cost/manual-profit lines are completed.
- A count mismatch must block closing until corrected or handled through the supported discrepancy path.

## Day 3 — different lot costs, deadlines, reporting, holiday and security

### 1. Same product at a new cost

Buy one HP laptop at ₹25,000 inclusive, serial `HP-D003`, receive it unpaid.

Expected: a new lot is created; the older ₹20,000 lot and newer ₹25,000 lot remain separate. Editing catalogue price must not change either historical lot cost.

Create two draft invoice experiments, then cancel them:

- FIFO selection of the older HP lot
- Manual selection of the newer HP lot

Expected: the displayed/recorded estimated margin changes with the selected lot. GST is excluded from profit. Cancelling drafts leaves stock unchanged.

### 2. Due dates and attention menu

- Set one supplier due date to today and another overdue date where business-day rules allow.
- Confirm the header attention menu shows due/overdue actions once, links to the source bill and does not change balances.
- Extend a due date and confirm the old reminder clears and the new date appears in supplier and purchase views.
- Check customer dues and service-ready reminders in the same menu.

### 3. Reports and exports

Verify Dashboard, Sales, Purchases, Tax, Services, Expenses, Profit, Inventory, Customer dues, Supplier dues and Returns for Days 1–3.

Reconciliation rules:

- Sales totals use issued invoices less confirmed customer return credits.
- Purchase original value remains the supplier bill value; remaining payable reflects payments and confirmed supplier credits.
- GST reports use document snapshots and show IGST for Priya only.
- Cash and bank reports equal opening balances plus/minus every posted movement.
- Inventory quantity equals receipts + sellable customer returns - sales - service consumption - supplier returns - write-offs. Moving stock between sellable and defective does not change physical on-hand.
- Product profit uses invoice taxable value less exact selected-lot economic cost. GST is not profit.

Apply date, customer/supplier, payment and status filters. Export CSV, XLSX and PDF. Confirm exports contain only filtered records and spreadsheet cells beginning with formula characters are neutralized.

Download a single invoice and filtered batch ZIP. Confirm file names use printed document numbers and the same template renderer, logo, fields, totals, serials, alignment and one-page layout where content fits.

### 4. Holiday and missed-day behavior

- On a day with any sale, payment, expense, purchase, stock movement, return, service intake/update or profit adjustment, attempt Close as shop holiday. Expected: rejected.
- For a genuinely inactive past day, review the missed-day entry, confirm no real-world activity occurred and close it as holiday. Expected: cash/bank balances carry forward; sales, expenses and profit are zero; opening setup is unchanged.
- A scheduled holiday is a reminder. It becomes a closed holiday only after the inactivity check and chronological close.

### 5. Security and tenant isolation

- Sign in as cashier and owner in separate browsers. Confirm tenant A cannot fetch tenant B customer, file, invoice or photo IDs.
- Confirm private files require an authenticated company session and are not public Cloudinary URLs.
- Change a record in one browser and submit a stale form in the other. Expected: conflict/reload response, not silent overwrite.
- Confirm password or reauthentication is required for storage credential changes and secrets are never returned to the browser.

## Final release gate

Do not use production data until all of these are true:

- TypeScript check and production build pass.
- The focused finance, serial, return, closing, storage and tenant-isolation suites pass against an isolated test database.
- Every Day 1–3 expected result above is observed without console errors.
- Cash, bank, customer dues, supplier dues, inventory and tax totals reconcile to source documents.
- A database backup and restore drill succeeds.
- Production origin allowlist, auth URL, MongoDB, Cloudinary credentials, encryption key, scheduled expiry/cleanup job and monitoring are configured in the production environment.

