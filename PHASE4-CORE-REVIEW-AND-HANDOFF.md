# Phase 4: core corrections and completion handoff

Date: 13 September 2026. Project: `D:/AI/itech`.

## Actual readiness

Pass 4A1 was **not complete as a live workflow** when reviewed. The report listed TypeScript/build/audit, but no executed Phase 4 behavioral suite. Static inspection found no `/api/sales` integration in the components. A successful build does not prove ledger or stock correctness.

This correction implements critical server behavior, not the whole of Phase 4. No tests, typecheck, build, browser walkthrough, database scripts, or migrations were run by Codex. Antigravity must execute verification and finish the remaining UI/backend work below. Existing live/preview labels are intentionally unchanged.

## Defects found and code changed

| Before | Correction |
|---|---|
| `applyCustomerAdvancePaise` reduced due without checking/consuming any advance | Transactional oldest-first consumption with guarded balances and source allocations |
| Stock query accepted reserved stock but always decremented sellable | Only exact sellable stock is consumed; unsupported linked holds reject issue until 4A2 implements ownership/consumption |
| Reserved serials could be sold without an owned hold | Exact tenant/product/lot + normalized `InStock` serial transition; duplicate serials rejected |
| No customer allocation documents for immediate receipts | Explicit Receipt/Advance → Invoice allocations in the issue transaction |
| Receipt + advance could overstate allocated amount | Remaining invoice value limits receipt allocation; only actual excess cash creates a new advance |
| Bank/cash update could silently match no initialized account | Guarded account update, safe range and version increment; transaction rolls back on missing projection |
| Drafts required stock and had no edit/cancel endpoint | Empty allocation allowed in drafts; exact allocation mandatory at issue; versioned PUT and non-destructive DELETE implemented |
| Quote creation/draft creation were nontransactional, nonidempotent | Require `idempotencyKey`; document, number where relevant and audit commit together |
| Conversion marked quote completed before sale | Conversion links a draft; issue completes the quote; repeat conversion cannot create another draft |
| Invoice snapshot held only amounts/lines | Freeze seller, buyer, shipping, template revision/configuration, dispatch, tax and invoice header |
| Product HSN override discarded; new/used classification not snapshotted | Retain line HSN and product condition; maintain stable invoice line IDs through issue |
| Services could be inactive; dates could be impossible or future issue dates | Active catalog checks, real calendar validation, today-in-Kolkata issue policy and finalized opening checks |
| Credit limit override absent | Serialized customer financial write, outstanding + opening due check, explicit override/reason audit |
| Warranty month overflow and no service warranty | UTC month-end clamping; quantity/service and serial warranty records |
| Return helper silently clamped inconsistent prior credit | Reject inconsistent prior totals; add component-wise return proration for base/CGST/SGST/IGST |
| Document arithmetic could still overflow/produce negative total | Checked integer summation, nonnegative component validation, round-off bounds |
| List routes accepted NaN/fractional/unbounded query values | Validated bounds, status/date/due filters, escaped search and stable ordering |

Sources changed: `server/sales-calculations.ts`, `server/sales-schema.ts`, `server/sales-service.ts`, new `server/sales-posting.ts`, invoice list route, quotation list route, and invoice `[id]` route.

### Deliberate compatibility changes

- POST invoice/quotation now **requires** a stable `idempotencyKey`.
- PUT `/api/sales/invoices/{id}` takes `{expectedVersion, draft: {...complete draft fields, idempotencyKey}}`.
- DELETE `/api/sales/invoices/{id}` takes `{expectedVersion, idempotencyKey, reason}`; it retains the cancelled document.
- Draft product allocations can be `[]`; if supplied they must fully allocate the line. Issue requires all product quantities allocated.
- `allocatedReceiptPaise` = direct receipt allocations; `allocatedAdvancePaise` = applied advance; `allocatedCreditPaise` is reserved for accepted credit notes. Do not combine these fields or subtract an advance twice.
- Until return/credit handling is added: `due = originalTotal - allocatedReceipt - allocatedAdvance - allocatedCredit`.
- Advances use `Available / PartlyConsumed / FullyConsumed`; reversals must derive status from amounts. Keep source receipt identity and allocation history.
- New invoice payments use `Cash`, `UPI`, `BankTransfer`, `Card`. Cheques are excluded until a clearance workflow exists. Cash method maps to Cash; other methods map to the single Bank account.
- Today is the only supported operational issue date. An old draft must be updated before issue. Daily close locking is still Phase 5 and must coordinate every financial/stock writer transactionally.
- Linked reservation, enquiry and service-job issue currently returns 409. Do not remove this guard until each link is tenant-validated and its full state transition is implemented. Standalone catalog service invoices are supported.
- Quote cancellation/reopening/editing is still missing. Converted draft cancellation retains the quote link for audit; implement an explicit versioned reopen/reconversion workflow rather than deleting history.
- A cancelled issued invoice must never use the draft DELETE route. Phase 4B provides the financial correction path.

### Review existing development records before further use

An invoice issued by the previous code may have invented advance credit, missing customer allocations, wrong serial state, negative sellable stock or incomplete snapshots. Do not manufacture a missing advance or reconstruct an immutable snapshot from today's masters and present it as historical truth. Produce a read-only anomaly report first. For disposable test tenants, clean up exact tracked fixture IDs and recreate through APIs. Any real record correction requires a documented reconciliation, not an automatic destructive migration.

The new posting helper does not make all future operations safe automatically: later collection, return and reversal writers must use the same customer financial serialization and the same account/stock invariants.

## Prompt for Antigravity — finish Phase 4 in order

You are continuing the existing iTech project. Read AGENTS.md, this file, DECISIONS.md, BACKEND-REFERENCE.md and PHASE-4-5-ARCHITECTURE.md. Inspect the code; resolve stale documentation against the latest user requirements. Do not replace the approved UI or rewrite working purchase/supplier modules. Preserve unrelated work and secrets. No new platform, role system, full accounting, barcode, multi-branch, real messaging or GST filing scope.

Finish the following checkpoints sequentially. Verify each before building on it. Continue to the next checkpoint when its gate passes; stop and report a material unresolved financial, stock or tenant-isolation defect rather than declaring completion. Execute all testing here in Antigravity. Codex has not run tests on this correction.

### Checkpoint 1 — verify and finish 4A1

1. Inspect the corrected modules and API contracts. Run typecheck and targeted calculation/issue tests before UI integration. Fix actual failures; do not weaken assertions or bypass business behavior with direct database writes.
2. Audit existing development records for the anomalies described above. Use tracked isolated fixture tenants. Do not modify real data automatically.
3. Connect existing invoice/quotation new/list/detail screens to live API calls. Add live draft PUT/cancel handling, server-paginated customer/product/lot selectors, serial selection and payment panel. Keep stable idempotency keys for retries and new keys for changed operations. On 409 offer reload while preserving unsaved edits.
4. Finish quote edit/cancel/expiry/reopen and `/quotations/{id}/convert` route, retaining the existing conversion route as an adapter if needed. Do not create two linked drafts on retries. A quotation is not a cash receipt or stock reservation.
5. Add same-filter sales summary API and CSV/XLSX/PDF list exports using the shared filter builder. Summary covers all matched records, not only the current page. Exclude drafts/cancelled documents from financial totals. Dues card applies the outstanding filter. Define tax-inclusive sales vs taxable sales clearly.
6. Printable invoice uses the immutable issued snapshot and selected template revision, including company logo, bill-to, ship-to, HSN/SAC, serials, line discount, charges, tax summary, payment/due, bank details, declaration and signatures. Basic print/PDF must work now; richer template editing/bulk ZIP is checkpoint 3.
7. Support mixed new/used products through per-line product condition snapshots; don't attribute an entire mixed invoice to one category. Service invoices remain separate, with assembly as a charge on a product/build invoice. Assign charge contribution consistently and document it.
8. Complete GST input contract: explicit seller state/place-of-supply code and explainable intra/inter-state choice, inclusive/exclusive calculation, editable line rate/HSN/tax, line fixed/% discount and taxed/untaxed charges. Don't infer tax regime from template name. Validate incompatible tax mode against state inputs or require an explicit audited reason where allowed by the configured business rules. Don't invent used-goods margin rules.
9. Reuse exact arithmetic for UI previews and server issue. The current calculation module is server-only; extract pure arithmetic carefully if sharing with browser, keeping database/auth modules server-only. Do not create another divergent GST engine. Accountants configure tax applicability; zero-rated, exempt and non-GST classification must not be conflated.
10. Invalidate/reload stock, sales, customer dues and account projections after issue. No live error or empty list may fall back to seed transactions. Only mark individual actions/pages Live after browser and API verification.

### Checkpoint 2 — 4A2 reservations, collections and history

Write an endpoint/collection/state table first, then implement it against existing source contracts.

**Stock holds:** create, retrieve/list, partial/full consume, release remaining and expire remaining. Validate exact tenant/customer/product/lot/serial references. Decrease sellable and quantityRemaining while increasing reserved on hold; on consumption decrease reserved and increase sold, without another sellable deduction. Release returns only remaining reserved quantity to sellable. Preserve signed bucket deltas, conservation and serial transitions. Expiry is an explicit Kolkata end-of-day rule with scheduled processing and safe recovery on relevant reads/mutations. Release/expiry/sale races must affect stock once. Inventory queries may show reserved quantity separately but must never advertise it as available. Support multiple held items through invoice allocation references; adapt the legacy singular reservationId explicitly. A paid deposit is a separate receipt/advance, not a field that increments cash when a hold is saved. Remove the temporary issue guard only after this integration works.

**Standalone collections:** POST/GET receipts, customer receivables, advances, advance allocation/refund, allocation reversal, receipt reversal and refund reversal. Tenant-scoped bounded pagination on every history. Select exact invoice/opening receivable targets from the same customer; reject duplicate targets and allocation beyond current due. Receipt value equals direct allocations plus generated advance. Use `customerAllocations` source/target records for every settlement. Source advance consumption requires guarded remaining balances. Applying an advance creates no additional account movement.

**Corrections:** append reversal records with `reverses...Id`, effective date, reason and actor; enforce one reversal and repeat dependency checks inside the transaction. Reversing a direct receipt allocation restores invoice due and creates/restores spendable customer advance from that receipt. Reversing an advance allocation restores that advance and target due without changing cash. Reversing a receipt cannot withdraw funds while its generated advance remains consumed/refunded; reverse allowed dependent allocations first. Refund of an advance reduces cash/bank and available credit; reversal restores both with correct signs. All outgoing cash/bank movements enforce overdraft protection; all changes increment account versions. No UI-only canReverse policy.

**Customer concurrency:** reuse `customers.financialVersion` as the write shared by customer financial operations before balance-dependent decisions. Do not introduce a second uncoordinated credit-limit projection. Preserve read/write ordering in transaction retries. Aggregate totals must stay within safe integer bounds.

**History and analytics:** customer profile has invoice/service/new/used contribution, net returns, receipts received, outstanding and separately available credit. Timeline links to invoices, receipts, opening-dues settlements, enquiries, jobs, holds, credit notes/refunds. Statements use document liability and monetary/credit events; allocation of already-held money is not fresh income. Use stable effectiveDate/createdAt/id ordering and balanceBeforePage for filtered/paginated history. Never compare a historical closing figure directly against today's balances. Unimplemented jobs/enquiries remain labelled Preview until live persistence/links exist.

**Supplier relationship:** sale stock allocations retain invoiceLineId → lot → receipt/purchaseLine → supplier. Customer paid status and source supplier bill paid status are independent. Show "Supplier bill line: Unpaid/Partly paid/Paid"; a partially settled batch does not prove a particular physical unit was paid for. Selling supplier-credit stock leaves supplier dues unchanged. Supplier settlement continues through the existing supplier engine only.

### Checkpoint 3 — 4B returns, warranties, templates and exports

**Returns and credits:** physical customer return, accepted credit note and cash refund are separate linked records. Return exact original invoice lines/lots/serials, with quantity guards against cumulative over-return. Product returns move sold quantity to sellable or defective; service/financial credit has no stock effect. A damaged return is quarantined. Prevent a serialized item being sold/returned twice or credited again through a second path. Preserve supplier purchase liability unless a separate supplier return/credit is performed.

Credit using immutable original base and tax components via `prorateSaleReturnComponents`. Component credits sum to each partial credit total; final full return exactly reconciles original components. Keep physical returned quantity separate from accepted credited quantity if acceptance can occur later. Zero-value physical returns are valid and must not create fake positive cash. Define invoice-level round-off and nonrefundable shipping/assembly policy explicitly; do not refund all charge lines just because one product returns.

Accepted credit reduces current invoice due up to the remaining due; excess creates customer advance. Refund consumes that credit once and reduces the selected account. Pending return/credit creates no spendable advance. Reversal must reject downstream resale, spent credit, conflicting warranty disposition or other consumption; append history instead of deleting issued documents. A NoStock financial adjustment cannot be used to silently bypass a physical goods return.

**Warranty:** keep coverage created at invoice issue; allow optional private photos later with tenant ownership/MIME/size checks. Add claim, inspection, repair/replacement/rejection/completion history; warranty service does not automatically create a sale return or refund. Replacements use explicit stock movements and serial lineage. Preserve original coverage terms and define replacement coverage policy. Date boundaries must work at month-end/leap-year and in Kolkata. Service warranty and nonserialized quantities are supported.

**Templates:** reuse existing invoiceTemplates/templateRevisions; create, edit, duplicate, rename, default and archive with version checks. Field visibility, columns/order/labels, company logo, buyer/ship-to, tax and footer options follow the approved UI. Use one renderer for preview/print/download. Reprinting with a different saved layout uses original invoice data and an explicit selected layout revision; never rewrite the legal/financial snapshot. Original template option remains available. Archived revisions referenced by old invoices remain readable.

**Exports:** PDF and Excel reports for sales/purchases and applicable summaries; invoice PDF ZIP filtered by date/customer/status with a preview count. Server authorizes every document/file. Escape spreadsheet formulas, produce valid content, sanitize filenames, handle duplicate names, and paginate/snapshot export membership so concurrent changes do not silently omit/duplicate invoices. Specify bounded jobs, file-size/time limits and partial-failure behavior. For large exports use private asynchronous jobs rather than an unbounded HTTP response. PDFs/logos/photos cannot be public merely because IDs are hard to guess. Keep photos and generated files behind tenant-authorized downloads. Do not call an export "streaming XLSX/PDF" unless the implementation actually supports that memory model.

### Checkpoint 4 — full Phase 4 verification and handoff

Run targeted suites per checkpoint, regressions for phases 2/3/3.5, build and dependency audit once justified by final changes. Exercise actual browser pages. Report exact commands and results, changed files, routes, API contracts, all remaining Preview actions and known limitations. Maintain DEVELOPMENT-LOG.md, VERIFICATION-CHECKLIST.md, DECISIONS.md, BACKEND-REFERENCE.md and a page/action status matrix. Never label Phase 4 complete because its routes compile.

Keep Phase 5 separate: two simple screens Cash & account / Daily closing, explicit money in/out and transfers, carry-forward, date locking, holidays, manual per-invoice profit and server-protected total profit. All sale/customer/supplier transactions must use the existing account ledger so daily closing does not double-count payments. Staff may enter zero/negative/manual profit; it is not automatically equivalent to cash received or supplier amounts paid. Service-job operational completion remains a separately tracked requirement if not delivered here.

## Mandatory verification cases for Antigravity

1. Empty-stock product draft saves, updates and cancels with zero stock/ledger effects. Issue without full allocation fails.
2. Repeated create/update/issue with same key/payload returns original result; changed payload returns 409. Simultaneous last-unit sales allow one success only.
3. Reserved quantity with zero sellable cannot be sold through the unreserved path; exact product/lot mismatch, foreign tenant and punctuation-normalized duplicate serials reject without partial posting.
4. Invoice 1,000 paise + advance 400 + cash 300 → due 300; consumes exactly 400 existing advance and creates two allocation records. Without actual advance, everything rolls back.
5. Invoice 1,000 + advance 400 + cash 800 → receipt allocation 600, new advance 200 only with consent. Advance 1,100 on a 1,000 invoice always fails. Advance-only settlement creates no new cash receipt.
6. Missing Cash/Bank projection rolls back invoice, serial, stock, advance, receipt and allocation. Overflow and outgoing overdraft are rejected.
7. Two concurrent credit-limit issues cannot both pass if their combined new due exceeds limit. Overrides require reason and audit; a zero limit follows documented no-limit behavior.
8. GST inclusive/exclusive, 0%, non-GST, IGST, odd-paise CGST/SGST, percentage/fixed discount, free item, charges and round-off reconcile in UI/server/print. Test unsafe totals and negative rounding beyond total.
9. Three returns against a 100-paise line credit 33/33/34; component-prorated returns reconcile base/tax/total independently. Inconsistent historical credited amounts reject instead of silent clamping.
10. Quote conversion creates a draft without completing sale; retry creates no second draft; expired/closed quote cannot convert. Quotation validity is not silently used as invoice payment due date.
11. Later master/template edits do not change issued print data. New/used mixed invoice contribution and service warranty quantities are correct. 31 January + one month clamps to the last day of February.
12. Live page beyond record 100 works; invalid list query returns 400, not 500. Same-filter summaries/exports reconcile and outstanding excludes drafts.
13. Reservation expiry/release/consume concurrency; standalone split collection; opening receivable; advance refund/reversal; partial return then resale; spent-credit reversal protection; source supplier due unchanged after sale.
14. User B cannot read/write/export tenant A invoices, customer allocations, serials, warranty attachments or templates by guessed IDs.
15. All dialogs, saved detail pages, refresh/invalidation, empty states, expired session, 409 reload and print downloads work in the browser without seed fallback.

Do not use direct database mutations for the behavior under test. Fixture setup, exact-ID cleanup and read-only invariant checks are allowed. Record a failed/blocked case as such rather than deleting it from the checklist.
