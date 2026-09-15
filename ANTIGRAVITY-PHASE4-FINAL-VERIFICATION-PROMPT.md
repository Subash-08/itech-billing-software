# Antigravity prompt: Phase 2–4 verification, corrections and readiness for Phase 5

Work in the authoritative checkout `D:\AI\itech`. My goal is a simple, reliable computer-shop billing, inventory and cash-flow application. This task is to inspect current implementation, fix defects in the already-authorized Phase 2–4 workflows, verify them, and give an evidence-based completion report. Do not implement Phase 5 in this run. Do not merely review and ask me to click Proceed for routine fixes already covered here.

## 1. Read current source; do not replay old patches

Read AGENTS.md and relevant locally installed Next.js documentation. Inspect git status/diff and the latest application source before changing anything. Preserve unrelated and uncommitted edits. Do not reset, overwrite whole files with older versions, upgrade dependencies wholesale, or assume an earlier completion report proves the current checkout works.

Read these repository documents, treating them as requirements/history to reconcile against source:

- PHASE4-STATUS-PHASE5-ARCHITECTURE-AND-HANDOFF.md
- SUPPLIER-RETURN-FIX-AND-ACCEPTANCE.md
- SUPPLIER-CREDIT-CLARITY-AND-TEST-DATA.md
- ACCOUNT-INITIALIZATION-FIX.md
- PURCHASE-RECEIPT-FIX.md
- SALES-STOCK-PICKER-FIX.md
- PHASE4-TEMPLATE-FIX-AND-VERIFICATION.md
- DECISIONS.md, DEVELOPMENT-LOG.md and VERIFICATION-CHECKLIST.md, where present.

The Codex staging directories under `C:\Users\Dell\Documents\ChatGPT\itech` contain historical snapshots and one-off patch scripts. Do NOT rerun prepare.py, edit.py, accounting.py or other patch scripts, and do NOT copy staging files over newer code. The changes were already installed in D:\AI\itech. Compare and make focused edits only if current source requires them.

If a document is missing, report that and use current source plus these instructions. Resolve ordinary implementation choices autonomously. Ask only when missing information would materially change business behavior or require unsafe changes to existing data.

## 2. Scope and confirmed business rules

- Multiple companies with strict tenant isolation; one branch per company.
- One Cash account and one Bank account; GPay/UPI is a Bank payment method.
- Customer phone mandatory on create/edit; valid GSTIN optional but unique within a tenant, including archived customer accounts. Shared phone numbers may match multiple customers. Do not invent phones for legacy records.
- Supplier goods can be received without paying and sold while the supplier bill is unpaid. Supplier payment happens only when actually made.
- Track physical stock separately from money. Partly paid is an amount-based bill/line status, not an invented paid/unpaid flag on each physical unit.
- Supplier stock return removes goods. Accepted supplier credit reduces the original line's payable; excess becomes supplier credit. Neither action is cash payment. Actual supplier payment/refund changes Cash/Bank.
- Customer return reduces eligible invoice due first; any remaining customer entitlement is explicit credit or refund. Refunds must not exceed entitlement or available account funds.
- Sales/service payments and collection of old dues must not post money twice. Issuing an unpaid invoice is not money received.
- Posted documents, allocations and movements cannot be deleted or hidden through generic soft deletion. Use explicit linked reversals/returns/credits with reason, actor and dependency checks. Archive master data while preserving financial history and outstanding settlement.
- No payroll, multi-branch, barcode, offline/mobile app, online store or GST filing scope.
- Bulk WhatsApp is deferred. Single-customer WhatsApp compose is a later bounded feature; opening a prepared message is not evidence it was sent.
- Profit rule is already clarified: sum per-sale/service manually entered profit to obtain trading profit; subtract shop operating expenses once to obtain net profit. Do not subtract supplier settlements, transfers or owner withdrawals as operating expenses. This is Phase 5 design, not authorization to implement closing in this run.

## 3. Inventory and contracts first

Produce a compact checklist of routes/forms/services/collections touched by the recent fixes. Inspect especially:

- account-history.tsx: credit amount from totalReturnCreditPaise, automatic prefill, clear no-payment wording, maximum validation, action-time Kolkata date and retry key.
- supplier-return-form.tsx and returns.tsx: exact purchaseId/purchaseLineId/lotId contract, line/lot/condition/serial selection, live versus demo handling.
- purchase-service.ts and purchase-schema.ts: returns, accepted credits, reversals, split-return rounding and settlement invariants.
- Supplier payable endpoint, statement, summary and payment/advance queries: include valid Credited/FullyCredited posted-liability states; remaining due must not disappear after credit acceptance.
- documents.tsx and mappers.ts: purchase names/IDs, received/returned quantities, paid/credit/due values, invoice stock selections and template revisions.
- Customer schema/service/forms: required phone, normalized search, GST create/update/archive/restore concurrency.
- Opening setup and account initialization: all account balances derive from valid opening events without duplicate initialization.

Verify both frontend payload and server validation. Do not fix missing data by inventing template revision 1, empty IDs, fake serials, fake payments or current timestamps used as real supplier bill numbers.

## 4. Safe test environments and old-data compatibility

Create uniquely named isolated test companies through supported signup/approval/setup flows. Fixture helpers may create isolated test identities and exact fixture records when needed. Business behavior under test must use application services/public APIs, not direct database mutations that bypass it.

Keep the user's existing company, test 1, intact. Initial inspection of existing data must be read-only. Do not return another item, pay another bill, accept an already-accepted credit, change opening cutoff, delete documents, or reset balances in that company just to test a fix.

Use a fresh company for a clean baseline AND a read-only compatibility audit of the existing company. A fresh company passing does not prove legacy records are correct. Before recommending a migration: identify the exact mismatch, affected IDs, target invariant, versioned idempotent migration, dry-run output, backup and rollback/compensation approach. Do not execute a repair to user transactions without presenting the concrete change for approval.

Integration teardown may delete only records owned by that run's tracked test IDs/tenant IDs. Check orphan files/records. No broad deleteMany, dropDatabase, wildcard folder cleanup or unrelated tenant deletion. Do not print credentials, alter production rate limits or disable authorization to get tests to pass. Inspect test setup before running it against Atlas. Record environment and tenant labels without exposing secrets.

## 5. Mandatory browser acceptance chains

Use actual pages, buttons, selectors, dialogs and refresh/reopen navigation. Record expected versus actual results and evidence; API success alone does not prove UI completion.

### A. Opening setup and account identity
Fresh signup, awaiting approval, approved login, current company/header, logout, unauthorized access and cross-company isolation. Save/reload opening draft, finalize exact version, enforce cutoff, initialize zero and nonzero Cash/Bank once. Reject duplicate finalization and cutoff bypasses. Verify customers/suppliers list pages show tables, and records beyond page one open correctly.

### B. Unpaid purchase, stock receipt and sale
Create supplier and products; save order/bill; receive without payment. Verify liability appears at bill posting, stock at receipt and no money movement until payment. Exercise separate and shortcut flows without double posting. Test serial-tracked and quantity-tracked stock, repeat product on different lines, partial receipts, multiple lots and deferred supplier payment.

Create quotation and invoice from the live UI. Customer selection fills details. Lines have valid names, HSN, tax treatment, prices and allocations. Select exact lot/serial; save/reopen draft; change quantities; convert quotation once; issue with no/full/partial/split payment. Recheck current stock and credit limits atomically. Draft changes must not consume stock or create payments.

### C. User's supplier-return scenario
Use an isolated fixture with THREE units at Rs 60,000 each, FINAL GST-inclusive total Rs 180,000. Do not add GST again to that fixture total. Receive unpaid. Sell one unit to a customer. Return one different available unit to the supplier.

Before acceptance: one sold, one supplier-returned, one available; supplier due remains Rs 180,000. Open supplier -> Returns -> Confirm supplier credit. It must prefill Rs 60,000, explicitly state no payment, and default to offsetting the original line's due. Confirm once.

After acceptance: supplier due Rs 120,000; stock still one available; no Cash/Bank movement or supplier payment record created. A customer sale/payment does not reduce supplier due. Verify purchase header AND line due, supplier profile/payables/statement, inventory and related histories agree after refresh and reopening. Accepted return must not offer duplicate acceptance.

Separate case: return TWO unsold units from three, accept Rs 120,000 credit, then pay remaining Rs 60,000 through Pay supplier. Only this payment decreases account balance; payable becomes zero. Do not reuse or mutate the user's existing accepted return for either case.

### D. Partial settlements and credits
Test a Rs 100,000 bill with Rs 50,000 payment allocated to the SAME line as the returned goods. With accepted return credit Rs 30,000, due becomes Rs 20,000. Separate fixture: accepted credit Rs 70,000 offsets Rs 50,000 due and creates Rs 20,000 supplier credit. For multi-line bills, a return on line A must not silently offset line B; apply leftover credit explicitly if desired.

Cover unpaid, partially paid, fully paid, opening payables, advance-funded payments, explicit excess payment, unapplied credit, credit allocation, refund and reversals. Check payment/advance/credit original amounts, remaining amounts and source references. Preserve zero values. A settled-by-credit bill must not be represented as cash paid.

### E. Return guards and reversal dependencies
Reject wrong purchase/line/product lot, cross-tenant lot, sold/reserved units, wrong serial status/condition, duplicate normalized serials, zero/fractional/excess quantities and repeated returns. A genuine customer return can restore eligibility; a stock hold needs explicit release. Test available versus defective buckets and multiple receipts independently.

Check credit acceptance on a reversed return, duplicate acceptance, over-valuation and missing valuation. Smaller approved credit is not cash. Zero/disputed credits must not become fake Rs 0.01 entries; document the pending rejected/closed-without-credit workflow as a product gap.

Reverse an accepted credit before reversing the physical return, respecting downstream credit allocations/refunds. Verify both line and header due restoration. Check reverse-order split-return restrictions and same-timestamp behavior; if correction is needed, use deterministic persisted ordering, not blanket removal of rounding safeguards. Legacy ambiguous allocation histories require reconciliation, not guessed line targets.

### F. Customer returns, warranties and statements
Test unpaid/partial/full invoice returns, exact sold lots/serials, sellable versus quarantine, due-first credit, customer refunds/advances and their reversals. Include service/charge NoStock returns. Verify partial returns cannot exceed remaining eligibility; warranties follow returned/replaced serial lineage, reject duplicate active coverage, preserve issued snapshots and do not consume replacement stock twice. Exercise attachment access isolation. Customer statements must reconcile across pagination and filters.

### G. Templates, documents and existing exports
Empty-company template setup; create/edit/copy/rename/default/archive; actual revision resolution; company logo upload; Bill to/Ship to; toggles/columns; immutable issued data and template revisions. Reopen old invoices after master/template edits and confirm agreed snapshot behavior.

For already-live exports, verify matching customer/date/status filters, totals, beyond-first-page records and explicit limits. CSV must be safe for spreadsheet formula injection, XLSX must parse as a workbook, PDF must contain expected text and render legibly, ZIP must contain distinct valid PDFs for the requested invoices without silent truncation. Test tenant/permission isolation and protected-profit exclusion. Do not label a CSV renamed .xlsx or browser HTML renamed .pdf as passing. Record pending report/export screens honestly; broad analytics/export completion follows stable source workflows.

### H. Usability and stale state
Empty data, error/retry, rapid bill/line changes during loading, page-two selectors, stock changing while modal is open, overnight tabs, expired session and failed network responses. Preserve inputs when appropriate, revalidate availability, and do not display stale success. Test shared phone searches, duplicate GST across active/archived customers, same GST allowed in different tenants, missing legacy phone on edit, and no unique-phone restriction.

## 6. Automated invariants and concurrency

Add focused tests for gaps; do not inflate counts with tests that only mirror implementation. Assert persisted events, allocations and all affected read models.

- Each lot: received = sellable + reserved + defective + sold + supplier-returned, according to the canonical bucket contract. Physical on-hand excludes sold/supplier-returned; quarantine/restore is a zero-on-hand transfer.
- Each posted purchase line: total = allocated payment/advance + applied liability credit + remaining due. Header equals sum of lines, including charge lines. Available supplier credit is separate; gross payable minus available credits reconciles to net statement balance without hiding either amount.
- Cash/Bank = valid opening + authoritative signed movements. Stock receipt/return/credit allocation does not create money. Never count legacy and canonical fields twice.
- Refunds/reversals conserve credit and allocations and cannot overdraw accounts. No financial rounding loss across split returns or reversal/re-return chains. Test discount/tax proration with CGST/SGST, IGST, inclusive/exclusive and non-GST/exempt treatment without trusting browser totals.
- Concurrent sale/return/reserve/quarantine of the same stock; competing payments/credit acceptance/refunds; template defaults; duplicate GST; repeated invoice issue. No negative stock/dues or double money movement. Induced downstream failures must roll back the entire transaction.
- Same idempotency key/same canonical payload replays safely; changed payload conflicts. A valid replay should not be incorrectly rejected because current state has changed after the original success.
- Cross-tenant guessed IDs and reference injection cannot disclose or mutate another company's records; access policy is enforced server-side.

Check the configured environment before running these current repository commands:

```text
npm run typecheck
npm test
npm run test:phase2
npm run test:phase3
node tests/phase35-isolation.test.mjs
node tests/phase4-isolation.test.mjs
node tests/phase4-corrections.test.mjs
npm run build
```

Run added focused suites too. Inspect available package scripts rather than inventing test:phase35 or test:phase4 aliases. Do not use dependency upgrades as a routine substitute for defect diagnosis. Coordinate build/dev processes so stale assets do not invalidate the browser walkthrough. Run the final appropriate regression gate after the last code changes; earlier results do not cover later edits.

## 7. Completion report and stopping point

Update DEVELOPMENT-LOG.md and VERIFICATION-CHECKLIST.md. Create PHASE4-FINAL-VERIFICATION-REPORT.md with:

1. Authoritative checkout, base commit, final working-tree changes and execution date.
2. Defect -> root cause -> files changed -> affected modules -> verification evidence.
3. Exact test commands/results, browser chains, expected/actual financial balances, and safe test cleanup results.
4. Module matrix: Live and verified / implemented but unverified / partly live / preview / deferred. Separate whole-module status from individual supported actions; New invoice must remain enabled when its own workflow works.
5. Remaining defects, legacy data anomalies, migration proposals and product gaps. Include source-to-customer traceability drilldown if unfinished; counters alone do not prove full lineage UI.
6. Explicit Phase 4 verdict: ready for Phase 5, or blocked with specific reasons. Do not say 100% complete if user-required Phase 4 flows or critical checks remain unverified. If only a subset is ready, say which subset.
7. Proposed Phase 5 implementation slices and dependencies, without implementing them yet.

Next-phase order: (A) shared transactional posting/day-close protection across every financial and stock writer, (B) Cash & account with money in/out and transfers, (C) daily closing/profit/holidays/read-only history, (D) live service jobs/parts/separate invoices and manual WhatsApp compose, (E) remaining enquiries/document library/analytics/filtered exports. Service catalogue invoicing alone does not mean service-job management is live.

Stop after the verified report and next-phase plan. Routine fixes are authorized; irreversible user-data changes and new business policies require a concrete proposal. Do not deploy, push unrelated changes, implement bulk WhatsApp, or start Phase 5 based solely on an old completion claim.
