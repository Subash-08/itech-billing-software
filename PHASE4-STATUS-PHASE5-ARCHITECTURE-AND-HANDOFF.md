# iTech: Phase 4 completion gate, Phase 5 architecture and remaining work

## Review scope and status

Authoritative checkout: `D:\AI\itech`. This pass uses source inspection, not test execution, browser acceptance or database inspection. Previous reports do not prove that newer working-tree changes pass. Phase 4 is not yet approved as fully complete. Begin Phase 5 design now; integrate live closing only after the posting/receipt/return acceptance gate below passes.

This pass implements mandatory customer phone validation (frontend and server), normalized phone search and tenant-scoped customer GSTIN conflict checks including archived accounts. Create/update/restore serialize identity checks. Blank GSTIN remains allowed. Duplicate phone numbers warn rather than being unique, because a shared family/business number can identify several customers; search must show all matches.

No historic customer records are deleted or assigned invented phone numbers. Editing a customer now requires a valid phone. Before broad rollout, report legacy missing phones and duplicate GSTINs read-only; resolve deliberately. The current database unique index covers active GSTINs; an all-status index migration needs duplicate preflight and must not run blindly. Direct database writes are not a supported application workflow.

## Module inventory (implementation is not verification)

| Sidebar module | Source state | Completion condition |
|---|---|---|
| Company account/settings | Live backend; master APIs | Verify approved-account session, tenant isolation, opening initialization, private logo lifecycle |
| Customers | Live master records; mixed history | New phone/GST rules, later-page search, real statements/collections/contribution history |
| Suppliers/Purchases/Inventory | Live backend and UI paths | Verify recent receive/normalization fixes, unpaid receipt, partial settlement, lots/serials/returns |
| Sales/Quotations | Live transaction core with recent fixes | Browser create/reopen/convert/allocate/issue/pay/refund and retry tests |
| Stock holds | Live core and selection | Partial consume/release/expiry, exact customer ownership and concurrency |
| Returns/Warranty | Live core and UI wiring | Full lot, serial, credit/refund, coverage quantity/photo and reversal dependency tests |
| Invoice templates | Persisted templates/revisions; recent changes | Empty company, repeated editing, conflict, logos, issued snapshot print/export |
| Dues | Mixed UI | Both customer receipt and supplier payment connect to authoritative ledgers |
| Dashboard/Reports | Mixed | Replace illustrative charts with scoped aggregates; verify filters and exports after transactions |
| Service jobs | Preview workflow | Live intake, accessory free text, job updates/parts/charges, separate service invoice, delivery, history |
| Enquiries | Preview workflow | Simple search/status/follow-up and optional linked sale; no complex filter system |
| Document library | Preview | Tenant-authorized persisted/generated documents and filters |
| Cash & account / Daily closing | Phase 5 pending | Shared posting fence, daily financial flows, reconciliation, manual profit and locked carry-forward |
| WhatsApp & offers | Bulk intentionally deferred | Only user-initiated single-customer message preparation; never automatic send |

Use Live only for working persisted flows. Use Partly live where a screen mixes them with previews. Backend presence alone does not justify a Live badge. Do not disable supported invoice links because Dashboard is mixed. Keep clear per-action availability and errors. Group Service jobs/Service catalogue/Warranty together when simplifying navigation; keep Purchases/Stock/Suppliers together and Cash & account/Daily closing as the two money-workflow pages. Dues can link into their existing settlement dialogs.

## No-delete and correction policy

Do not add Delete or generic soft-delete to posted financial records. A deletedAt filter must never remove issued bills, payments, movements or credits from financial reports.

| Record/action | Supported treatment | Effects |
|---|---|---|
| Unissued draft/quotation | Cancel with actor/reason/version; retain history | No stock or cash; release linked holds only through explicit hold operation |
| Issued invoice | Immutable commercial snapshot; correct using explicit credit/return and replacement invoice where appropriate | Never renumber or erase original; report gross invoice and separate adjustment |
| Actual goods return | Credit note + exact stock/serial disposition | Reduce eligible due first; surplus credit/refund; warranty adjustments; all atomic |
| Price-only correction | Separate credit/debit adjustment if implemented and approved | No artificial stock movement; do not disguise as physical return |
| Customer/supplier payment error | Reversal event with dependency checks and reason | Compensating cash/bank movement and allocations, no duplicate due restoration |
| Supplier purchase correction | Draft edit or posted supplier return/credit workflow | Preserve receipt and settlement lineage; do not cancel delivered stock by hiding bill |
| Customer/product/supplier no longer used | Archive master record | Exclude from new selection; retain historical references and permit settlement of existing obligations under an explicit policy |
| Service job | Cancel operational job with reason | If invoiced/paid, separately correct financial records; never erase invoice/payment by deleting job |
| Closed-day mistake | Current-day audited correction referencing original | Never rewrite a locked day or silently propagate changed opening balances |

Preserve original event date and reversal date. Reports for a past period must not change because a later receipt was reversed. Net revenue uses invoice/credit events; money reports use signed account movements; allocations alone are not cash. Supplier payment is not another inventory expense in profit reports. A cancellation is not a physical return. All reversals and returns are tenant-scoped, idempotent, version/dependency-checked and transactional. Preserve original snapshots even if master data is archived.

Do not promise a generic issued-invoice cancellation endpoint until its stock, serial, payment, advance, warranty, tax and closed-day effects are explicitly specified. Existing safeguards must not be removed to make a test pass.

## Phase 5 architecture: shared posting and closing

Keep the product simple: one Cash account and one Bank account. UPI/GPay/card are payment methods mapped to Bank, not extra accounts. Sales/service/non-GST invoices increase billed revenue; only actual customer payments increase money balances. A credit invoice is not money received.

### Data and relationships

- `businessDaySessions`: unique (tenantId, businessDate), status Open/Closed/Holiday, version, opening source/previous closing ID, expected/count balances, closing actor/time, immutable closing summary and sequence watermark.
- `tenantPostingState`: unique tenantId, active business date, monotonically increasing version/sequence. All stock/financial posting and day close use the same transactional write fence. Reuse an existing suitable record if possible; do not introduce competing authoritative locks.
- `accountMovements`: retain one canonical signed-paise contract (signed integer paise). Each event links to receipt/payment/refund/expense/transfer/correction and business date. Normalize legacy formats consistently; never sum both representations twice.
- `cashbookTransactions`: manual money in/out categories with references and reason. Prefer existing source collections where suitable; avoid duplicate ledger writers.
- `accountTransfers`: one document and exactly two equal/opposite movements, Cash->Bank or Bank->Cash, in one transaction. Transfer is neither income nor expense.
- `dailyProfitEntries`: tenant/date/invoice-or-service-source ID, manually entered paise, version, actor, audit; unique source/day rule. Staff may enter individual values; aggregate access is separately protected.
- `businessHolidays`: date/reason/planned status. Planning a holiday must not silently close or discard real transactions.

Master records and issued invoices remain the sources of identity and commercial history. Stock lots retain purchase linkage, so supplier-paid status can be shown as a separate reference alongside a sale. Never derive supplier-paid status from customer-paid status. Where multiple purchases supply one sale, show the corresponding sources and settlements rather than an invented single paid flag.

### Posting fence and day boundary

Implement one shared `assertAndLockPostingDay` primitive that takes the current MongoDB session. Every receipt, payment, refund, reversal, invoice issue, stock receipt/return, manual adjustment and transfer calls it in the same transaction as its writes. Enumerate every caller before enabling close.

Posting and closing must write the same tenant/day fence. A read-only `closed === false` check is insufficient: a transaction could commit after close. On conflict, the database retry must recheck the day; closed days reject new posting. Increment the sequence and attach it to new events.

Close transaction locks the fence, reads consistent authoritative balances/events, validates reconciliation and required manual profit entries, then stores an immutable closing snapshot and closes the day. Server aggregates; do not trust client totals. A repeat close with the same key returns the existing result; conflicting payload returns 409.

Use Kolkata date at action time, including tabs open overnight. Do not update historical invoice dates to bypass restrictions. Define a missed-close workflow: explicitly close prior days in order, or create empty-day carry-forward records after checking no activity. Preserve the initial finalized opening cutoff. Do not silently auto-close days with transactions or unresolved reconciliation.

### Cash & account page

- Automatic movements from sales/service payments, supplier payments and refunds appear once.
- Separate Money in button: account, amount, date, category, party/reference and notes. Owner capital is not sales; collection of customer due must call the customer receipt service.
- Money out: expense, supplier payment, customer refund, owner withdrawal. Selecting supplier payment opens the existing payable allocation flow with bill/product references. Never also save an expense for the same payment.
- Transfer: direction and amount; balance checks and two atomic movements.
- Search/filter by business date, Cash/Bank, category, party and source; source links navigate to real records.

### Daily closing page

Paginated table of business dates; open a date for invoices by sales/service/new/used/non-GST classification, actual money in/out, supplier payments, expenses, transfers, refunds/reversals and manual profit entries.

Per account: expected close = prior close + signed movements. Difference = counted/confirmed balance - expected close. Cash count and Bank reconciliation are separate. All differences remain visible until corrected. No automatic balancing expense. If an approved adjustment is needed, require a category, reason, authorization and separate source event before recalculating.

Carry forward the immutable closing balances. Closed details are read-only. Holiday with no activity carries balances forward without fake sales or profit; an attempted transaction on a holiday needs explicit reopening while still unclosed, or a clear rejection. Do not retrofit into closed history.

Manual profit is not cash reconciliation. Record zero explicitly rather than treating it as missing. Negative profit can be valid with an explanation. User clarification: add all manually entered per-sale/service profit to obtain trading profit; show operating expenses separately and deduct them once to obtain net profit. Treat entered profit as after item/service direct costs and before shop operating expenses. Display this meaning beside profit entry fields. Supplier settlements, stock purchases, transfers, owner withdrawals and collection of old dues are not additional operating expenses. Return/reversal profit adjustments must link to the original source and affect the current open day; never silently retain profit on a fully returned sale or rewrite closed history. Separate sales value, collections, customer outstanding, operating expenses, supplier payments, trading profit, net profit and cash/bank closing totals.

### Aggregate profit protection

One ordinary role does not mean no authorization. Use a server-verified owner profit PIN/password hash and a short-lived tenant/user-scoped unlock grant. Rate-limit attempts. Never send totals to a locked browser, hide them only with CSS, put a PIN in localStorage, or expose them through dashboard/export endpoints. Individual entry permissions and aggregate viewing are separate. Decide who may configure/reset the credential using the approved company owner identity.

## Service management and WhatsApp (separate delivery slice)

Service intake requires customer, device/serial, reported fault, visible condition, free-text accessories/components received, optional photos, estimate/approval, technician/status, parts used and customer communications. Parts consume reserved/available stock once at the chosen documented event; generating the service invoice must not consume them twice. Separate service invoice, advances/receipts, outstanding collection and delivery all reuse Phase 4 contracts.

Add a WhatsApp button to each service detail/status update with an editable preview: customer name, job number, device, current status, collection information and business contact. Normalize to international number; ten-digit Indian numbers may default to +91, other countries require explicit country code. Do not use the last-ten-digit search normalization for messaging destinations.

Only on the staff member's click, open the WhatsApp web/app compose link with encoded text. The staff member reviews and sends there. Opening the compose link is NOT proof of sending or delivery; audit it as Message prepared/opened only. No automatic send, bulk campaign, API credential, scheduling or paid messaging integration now. Do not include internal profit, credentials or private attachment URLs. A private invoice PDF must be manually attached unless secure customer sharing is explicitly implemented.

## Actual storage in this source

`server/storage.ts` uses PRIVATE_STORAGE_ROOT, an absolute private directory outside the application/public folder, with tenant subdirectories. File metadata is in MongoDB and downloads go through authorized routes. Cloudinary is not the current upload implementation. The runtime rejects local storage on Vercel; deploy this adapter on the VPS or implement an external object-storage adapter before choosing Vercel.

Invoices and issued snapshots are MongoDB records. The inspected ZIP path renders PDF bytes on demand with jsPDF; this does not imply every generated invoice PDF is archived as a file. If immutable PDF archives are needed, store versioned rendered artifacts with invoice/revision/hash metadata, preserve old versions and apply private authorization.

Off-server backup/restore is not proven by the existence of a local folder. Configure coordinated DB/file backups and perform a restore drill before production. Never remove a logo/photo referenced by an issued document while cleaning orphans.

## Exports after feature completion

Use the same validated filter object and tenant scope as the table/summary. Export every matching row within explicit resource limits, not just the displayed page. Dates use Kolkata business dates; opening/page balances remain correct. Expose generation time and applied filters. CSV formula-injection protection, XLSX numeric/paise conversion, PDF layout/content and ZIP count/name/manifest must be verified. Separate gross sales, credits, net sales, collections, due, available advances and manual profit; do not label them all Revenue.

Profit authorization applies to exports. Daily closing export uses the immutable closing snapshot. Very large exports need bounded streaming/jobs, not unlimited memory. Make no silent truncation. Finish each underlying workflow before exposing its export as Live.

## Antigravity execution prompt

1. Read this document and the latest focused fix handoffs: ACCOUNT-INITIALIZATION-FIX.md, PURCHASE-RECEIPT-FIX.md, SALES-STOCK-PICKER-FIX.md, PHASE4-TEMPLATE-FIX-AND-VERIFICATION.md and PHASE4-FINAL-IMPLEMENTATION-AND-ACCEPTANCE.md. Preserve newer working-tree changes; do not copy old staging over them.
2. Verify the mandatory phone/GST customer changes. Test blank/invalid phones, shared numbers, formatted search, lowercase GST, blank GST, duplicate active/archived GST, self-edit, simultaneous create/update/restore and tenant isolation. Audit older data before any unique-index change; no automatic customer merging.
3. Complete the Phase 4 browser gate: unpaid purchase -> receive stock -> allocate serial/lot -> invoice with partial receipt -> collect balance -> partial return/refund -> supplier payment -> statement/profile/stock/account reconciliation. Include service invoice without stock and template revision/print/logo flows. Exercise later pages, errors, retries and ambiguous-commit responses.
4. Run meaningful domain, Phase 2, 3, 3.5, 4 regression suites, typecheck/build and browser acceptance. Do not edit production fixtures or bypass APIs under test. Record actual outcomes; identify omitted tests. Fix failures before enabling Phase 5 closing.
5. Implement Phase 5A shared day fence and source/movement contracts first. Enumerate and connect every posting writer. Add zero/nonzero opening, concurrent close/post, transfers, supplier settlement and reversal acceptance cases.
6. Implement Phase 5B Cash & account UI using existing transaction services. Then Phase 5C paginated closing/detail/counts/manual profit/holiday/carry-forward and owner aggregate unlock. Resolve the profit-definition question before final net-profit formula.
7. Implement service jobs and user-triggered WhatsApp compose separately; keep bulk untouched. Implement enquiries/document-library remaining scope without hiding it under Phase 5 completion.
8. Finish dashboard aggregates and filtered exports after underlying workflows pass. Apply per-module Live/Partly live/Preview labels based on demonstrated user flows, not API file presence.
9. Update DEVELOPMENT-LOG.md, VERIFICATION-CHECKLIST.md, decisions, collection relationships, migration notes and module matrix. Report what remains incomplete. No claim of all edge cases or full production readiness without evidence.

Before real use: resolve legacy anomalies, verify backup restore, finalize accurate opening balances, and run owner/staff acceptance. Never delete issued financial history or manually flip readiness/cutoff fields to make a demo work.
