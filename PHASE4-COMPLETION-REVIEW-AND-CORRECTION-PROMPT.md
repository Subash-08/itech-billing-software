# Phase 4 completion review — corrections required

Reviewed 14 September 2026. Project: D:/AI/itech.

## Decision

Do not approve Phase 4 as 100% complete or start production daily closing yet. Static review found stock and financial inconsistencies that the reported tests do not detect. The report's test results are supplied evidence, not results reproduced in this review. No test, build, browser or database operation was executed by Codex.

The implementation now includes substantial live API and UI work. The required correction is to make those paths use the same data contracts and to verify their relationships. Preserve the approved UI and the existing single-role, multi-company, one-Cash/one-Bank scope.

## Findings from actual source

### P0 — Customer return stock and serial ownership

In `server/sales-returns.ts`, createCustomerReturn restores all quantity into `line.stockAllocations[0].lotId`. A line sold from multiple lots therefore restores the wrong source lot. It adds to quantityReturned as well as sellable/defective while never decrementing quantitySold. This conflicts with the existing lot bucket conservation equation: quantityReturned is already used for stock returned to the supplier.

Serial checks only run if the caller supplies serials, so a tracked product can be returned with an empty list. Lookup checks product and serialOriginal but not the original invoice/line. A sold serial from another customer's invoice can pass that lookup. The code writes `Quarantined` while the stock engine uses `Defective`, and clears soldInvoiceId although invoice issue uses invoiceId/invoiceLineId. Update counts are not consistently checked.

### P0 — Return settlement can refund unpaid sales

RefundNow pays the full calculated return value without first reducing the invoice's unpaid due. For example, an unpaid 1,000-paise sale can return 1,000 paise in cash while retaining the debt. CustomerCredit uses a different path and increments allocatedPaidPaise rather than allocatedCreditPaise. Credit-created advances lack a sourceId linking the return/credit event. Direct return refunds are account movements without a matching customerRefunds record for the statement/reversal engine.

### P0 — Warranty replacement is not atomic and does not move lot stock

`server/warranties.ts` updates the old serial before it verifies the replacement, without a transaction. If replacement validation fails, the old serial is already changed. Successful replacement does not update lot sellable/sold/defective counters or append corresponding stock movements, allowing inventory and serials to disagree.

Claims read warranty.serialNumber whereas issue creates warranty.serial. The test manually inserts another warranty using serialNumber before testing replacement, bypassing this real issue-to-claim mismatch. Claiming lacks an idempotency key/version, expiry validation and append-only claim history. Current repair processing marks coverage Claimed, preventing another valid repair; rejection overwrites claimDetails.

### P0 — Two incompatible customer payment contracts

`sales-posting.ts` creates issue-time receipts without isReversed, embedded allocations or advanceId. `customer-ledger.ts` selects receipts using `isReversed: false`, restores dues from receipt.allocations and only checks receipt.advanceId for downstream credit. Therefore invoice-time receipts are omitted by these queries and are not handled by the same reversal path as standalone receipts.

Issue updates allocatedReceiptPaise/allocatedAdvancePaise; later receipt/advance allocation updates allocatedPaidPaise. Reversals decrement allocatedPaidPaise too. This breaks the intended invoice projection and makes due, reports and reversal limits disagree. Direct receipt-allocation reversal restores due but only replenishes available funds when sourceType is Advance, leaving a reversed Receipt allocation's money without corresponding spendable customer credit. Later receipt reversal can also restore an already-reversed embedded allocation again.

### P1 — Customer statement does not prove ledger reconciliation

`getCustomerStatement` excludes issue-time receipts using the isReversed filter. It excludes reversed originals rather than retaining original and opposite reversal events by their effective dates, so later reversals rewrite historical statements. Direct return refunds are absent. It loads all period transactions into memory before slicing. `balanceBeforePagePaise` is the balance before the date window, not before page 2 or later. Sorting has no final ID tie-breaker.

A test that adds each displayed debit/credit to the previous displayed balance only proves arithmetic on that list. It does not prove all events were included or that the result equals outstanding invoices + opening dues - available customer credit.

### P1 — Template API is disconnected from the canonical template model

`sales-templates.ts` uses collection `templates`. Phase 2, the editor and invoice issue use `invoiceTemplates` plus `templateRevisions`. The new create/copy do not insert revision 1. Update stores the old revision, then increments currentRevision without storing the new snapshot. A template that passes the new CRUD tests may therefore be unusable for invoice issue. Defaults and changes are not atomic and lack concurrency protection. A nonexistent default target can clear all defaults first.

### P1 — PDF/ZIP output fails the approved template/retention contract

`app/api/sales/invoices/export-zip/route.ts` silently limits selection to 100 and does not default to issued invoices only. It renders a hard-coded layout from current companySettings, not the issuedSnapshot's seller/template. It cannot reliably reproduce old invoices after company details change or honor the user's selected template and field/column settings. Whole ZIP generation is in memory; calling it a streaming export is inaccurate. Filename collisions, bounded selection behavior, private caching and complete filtered membership need explicit handling.

### P1 — UI still has live/demo and document-input gaps

`components/documents.tsx` uses sample state when live page data is not yet present, including after failed fetches. Its submit mapping hardcodes templateRevision = 1 and taxTreatment = Taxable, generates a new save key per invocation, and can synthesize missing stock IDs rather than requiring an actual selected source.

`components/reservations.tsx` submits reservedAt = imported TODAY, a demo-date constant. Use the current server business date for live operations. Stock holds have API adapters and UI, but that does not prove expiry is scheduled: a protected `/expire` endpoint is not a deployed scheduler.

The warranty page has no live API calls in the inspected component. Do not relabel an entire module Live merely because its backend route exists.

### P1 — Verification evidence overstates production-path coverage

The suite now exists, which is progress. However it globally clears authRateLimit in the development database, manually inserts warranty records for a path that should start with an issued invoice, changes account balances during scenarios, and its cleanup swallows deletion failures while printing success. Some fixture creation is appropriate, but it must not hide incompatible schemas between production operations. Account fixtures are not a replacement for a verified transaction chain.

The supplied walkthrough incorrectly describes a physically received damaged customer return as onHandDelta = 0. A return from a customer increases physical shop stock; a transfer from sellable to defective already inside the shop is the zero-on-hand operation.

## Changes in this review

Only module-status wording and classification were changed: sales, quotations and stock holds are now Partly live rather than wholly Preview. Existing Live modules remain Live; warranty and Phase 5 workflows remain Preview. The generic mixed banner no longer incorrectly states that all sales and purchase history is sample data. Financial/stock code is not changed in this review; use the correction prompt below before further dependency work.

## Detailed prompt for Antigravity

Continue in the existing project. Treat this review as a correction gate, not approval of the “100% complete” report. Read the two earlier Phase 4 handoffs and preserve all accepted requirements. Do not redesign the UI, add roles, or start Phase 5 while its input ledgers remain inconsistent. Preserve unrelated work, create a focused backup/diff, and never modify real shop records as test fixtures.

### A. Define one authoritative contract before patching callers

Write a compact collection/field table covering invoices, receipt sources, allocations, advances, credit notes, returns, refunds, reversals, stock lots, serials, warranty coverage/claims and template revisions. Use existing canonical collections. Include every writer and reader: issue, later receipt, return, statement, customer profile, export and reversal.

Choose one receipt schema for issue-time and standalone payments. Read active allocation records from the authoritative allocation collection; an embedded UI summary cannot be the source for reversal. Standardize sourceId/sourceType, reversal metadata and dates. Keep original event records plus append-only reversal events. Record a read-only dry-run migration/anomaly report for already-created development records; do not silently turn missing flags into evidence that an inconsistent record is valid.

Preserve:

- Invoice due = original total - direct receipt allocations - advance allocations - accepted credit applied to invoice.
- Available customer credit has one authoritative balance, including unallocated receipts and excess accepted credit notes.
- Receipt allocation and advance allocation are not fresh cash movements.
- Every refund has one financial event, one credit consumption and signed account movements; no double refund path.
- Supplier liabilities do not change when a customer sale, customer payment or customer return occurs.

### B. Correct customer allocations and reversals first

Make issue and later collections produce the same schema/projections. Reject cross-customer targets and duplicate allocations. Serialize every customer financial writer through the same financialVersion write. Reversing an allocation restores its exact target due and its exact source available balance; a direct receipt allocation must turn back into available customer funds. Later receipt reversal must not restore target dues a second time. Guard already-refunded, consumed, credited and reversed dependencies atomically. Reversal dates are current permitted operational dates; preserve original event dates.

Add read-only reconciliation: per invoice allocation sums, per advance source/consumption sums, receipt total vs allocated/available/refunded amounts, account movement sums, and customer statement closing against current liabilities minus available credit. Report inconsistencies rather than force-balancing them.

### C. Correct returns using original source allocations

Implement separate physical return and accepted-credit/refund records, optionally orchestrated by one atomic shortcut. Use canonical invoiceLineId, not clientLineKey as a second historical identity. Return exact original serial/lot allocations. Serial-tracked returns require normalized unique serials that are currently associated with that sale and have not already been returned or replaced. Nonserialized returns choose original allocations with guarded remaining returnable quantities; record the selection, never silently send everything to allocation zero.

For stock actually returning: decrement quantitySold, increment sellable + compatibility quantityRemaining OR defective; physical onHandDelta is positive. Do not increment the supplier-return bucket. Use status Defective consistently. Preserve serial sale/return/replacement lineage and check every mutation count. NoStock credit-only adjustments are explicit financial events and must not masquerade as receipt of serialized goods.

Prorate original base and tax components using the existing exact cumulative helper. Define the invoice-level round-off and charge-refund policy. Credit first offsets unpaid due; only the remaining eligible credit may become an advance/refund. An unpaid full return should clear due and pay zero cash. Refund components must equal the eligible cash refund, not the gross return value. Link all generated credit/advance/refund records to the source return and credit note. Zero-value returns move stock without inventing monetary entries.

### D. Make warranty processing atomic and historically accurate

Use the same warranty fields emitted by invoice issue, including serial and invoiceLineId. Store claim history separately with independent claim outcome and coverage status; a repair need not terminate the coverage. Validate date, customer/device ownership and previous return/replacement disposition.

Replacement must transact old unit return to defective, replacement sellable-to-sold movement, exact serial transitions, lot counters, claim record, replacement coverage/lineage and audit together. Reject missing/unavailable replacement with zero changes. Require idempotency and expected version. Prevent the original customer return route from refunding the replaced serial again. Preserve original invoice data; warranty replacement is not an unrecorded edit to the invoice. Support optional authorized photos and quantity/service coverage as required.

### E. Reuse canonical templates and one renderer

Remove the duplicate templates write path; adapt sales endpoints to the existing invoiceTemplates/templateRevisions model. Creation/copy inserts revision 1 atomically; each edit creates the new immutable revision. Validate inputs, active/default rules, expected revision and tenant ownership before mutation. Preserve old referenced revisions; use new IDs for copies. Migrate duplicate dev records only after a read-only reconciliation and collision plan.

Wire create/edit/copy/rename/default/print selection to canonical IDs and actual revisions, never hardcoded revision 1. One renderer must support preview, print, individual PDF and ZIP. Its financial/customer/seller data comes from issued snapshots. An explicitly selected alternative layout changes presentation only. Include logo, buyer/ship-to, HSN/SAC, serials, warranty, charges, discounts, tax summary and column/field visibility options from the approved UI.

ZIP membership uses validated matching filters and issued documents only unless a separate clearly labelled draft export is requested. Never silently truncate: return a clear selection limit or use a bounded asynchronous export job with progress and private download. Include an expected-count manifest, collision-safe filenames and explicit partial-failure behavior. Use suitable Tamil-capable fonts if Tamil content is present. Verify PDF text/layout and actual XLSX cells, not merely file signatures.

### F. Finish UI integration without expanding complexity

Use server business date in live mode, stable retry keys, actual template revision, actual tax treatment, real selected lots and proper due/partial-payment fields. Live failures show an error/empty state and never seed records. Refresh all affected records after mutations; the status matrix must enumerate actions, not just pages. Selectors must work past the bootstrap limit. Customer profile contribution separates new/used/service revenue, receipts, returns, due and available credit.

Use Live only when that module's required actions are connected and acceptance passes. Keep Partly live where history or actions remain incomplete. Keep daily closing, profit lock, holidays and other Phase 5 work Preview. Document how and where expiry scheduling actually runs and its recovery behavior.

### G. Correct verification and documentation

Use isolated tracked test tenants. Remove global authRateLimit deletion. Cleanup must verify that no fixture records remain, including generated child records, and fail/report errors rather than swallow them. Do not invent alternate-schema warranty/template fixtures for end-to-end tests; issue an invoice using the real template API, then return/claim/reprint that exact record.

Mandatory new acceptance chains:

1. Issue-time receipt appears in customer statement and can follow the same valid reversal rules as a later receipt.
2. Reverse a direct receipt allocation, reallocate its available money, then attempt original receipt reversal: reject double use; dues and cash reconcile.
3. Unpaid 1,000-paise invoice, full return: due zero, cash refund zero. Part-paid 300: full return permits at most 300 refund and clears the remaining 700 due.
4. One line sourced from two lots: each return restores its exact source; all bucket sums hold. Serial from another invoice/customer, missing serial and duplicate serial reject atomically.
5. Invalid warranty replacement changes nothing. Valid replacement adjusts both lots, exact serials, movements and coverage history. Run it from a warranty generated by actual invoice issue.
6. Canonical template create/copy → invoice issue with current revision → edit template/company → original print unchanged; alternate print layout changes no values.
7. More than 100 matching invoices: complete export or explicit bounded-limit response, never silent loss. Verify selected-customer/date membership and private access.
8. Statement page 2 starts at page 1's ending balance. A reversal tomorrow does not erase yesterday's original event. Include direct return refunds and reconcile against an independent aggregate.
9. Browser test on today's date, not demo TODAY; live network failure shows no seed invoices. Follow invoice, customer due, receipt, advance, return, stock and source supplier links end to end.
10. Concurrent return/refund/reversal/hold consumption cannot produce duplicate funds or physical stock. Cross-tenant IDs fail for each mutation/read/export.

Run tests, build and browser verification in Antigravity. Update DEVELOPMENT-LOG.md, VERIFICATION-CHECKLIST.md and walkthrough.md to replace “100% complete and locked” with actual gate results. Distinguish previously reported passes from new regression results. Do not move these Phase 4 defects into a Phase 5 future-work section.

## Completion order

1. Unified customer accounting contract and reversals.
2. Returns and warranty stock/financial invariants.
3. Canonical templates and snapshot-based output.
4. Live UI and scheduler integration.
5. Full relationship tests and accurate status labels.
6. Only then review the Phase 5 daily-closing architecture.
