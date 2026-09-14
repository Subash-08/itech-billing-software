# Verification checklist

Update this after each phase. Use `Pass`, `Fail`, `Blocked` or `Not tested`. Link test files or attach concise evidence. A passing unit test does not replace a full UI-flow check.

## Global checks

| Check | Status | Evidence / date |
|---|---|---|
| TypeScript check | Pass | `npm run typecheck` (0 errors), 2026-09-14 |
| Domain automated tests | Pass | 26/26 tests (`npm test`), 2026-09-14 |
| Phase 2 Isolation Suite | Pass | 27/27 isolation checks (`npm run test:phase2`), 2026-09-14 |
| Phase 3 Isolation Suite | Pass | 50/50 isolation checks on 2026-09-12 |
| Phase 3.5 Isolation Suite | Pass | 32/32 isolation checks (`node tests/phase35-isolation.test.mjs`), 2026-09-14 |
| Phase 4 Isolation Suite | Pass | 25/25 isolation checks (`node tests/phase4-isolation.test.mjs`), 2026-09-14 |
| Phase 4 Acceptance Suite | Pass | 10/10 acceptance chains + 8b (`node tests/phase4-corrections.test.mjs`), 2026-09-14 |
| Production build | Pass | `next build` 51 static pages + all API routes compiled cleanly, 2026-09-14 |
| Dependency audit | Pass | 0 known vulnerabilities (`npm audit`), 2026-09-14 |
| Signup cannot self-approve or choose tenant | Pass | Temporary Atlas integration account, cleaned up |
| Login blocked before operator approval | Pass | Temporary Atlas integration account, cleaned up |
| Profit password unlock is session-bound | Pass | Temporary Atlas integration account, cleaned up |
| Cross-company private file read denied | Pass | Two temporary companies, files and records cleaned up |
| Complete interactive browser walkthrough | Pass | Verified on live company `52af8be0-463f-429a-b22e-7029669f395f` (`test@gmail.com`), 2026-09-14 |

## Phase 2 — Master data & Multi-Tenant Isolation (Correction Pass)

| Flow | Status | Evidence |
|---|---|---|
| Canonical API-to-Domain Mapping (`id: _id`) | Pass | Verified via `lib/mappers.ts` for all entities, 2026-09-11 |
| Zero-Value Preservation (0% tax, 0 low stock, 0 mo warranty, 0-day terms, 0-cost lots) | Pass | Verified in Check 8 of `phase2-isolation.test.mjs`, 2026-09-11 |
| Company settings persist after refresh & private logo | Pass | Verified in Checks 2–4 of `phase2-isolation.test.mjs`, 2026-09-11 |
| Cross-tenant logo and preferred-supplier injection | Pass | Verified 404 response (zero existence leakage) in Checks 3 & 7, 2026-09-11 |
| Customer and Supplier create/edit/archive/restore | Pass | Verified in Checks 5, 23 & 27 of `phase2-isolation.test.mjs`, 2026-09-11 |
| Duplicate phone number detection (normalized DB check) | Pass | Verified in Check 6 of `phase2-isolation.test.mjs`, 2026-09-11 |
| Product catalog, pricing modes, and serial tracking | Pass | Verified in Checks 8 & 9 of `phase2-isolation.test.mjs`, 2026-09-11 |
| Service catalog and Invoice templates with immutable revisions | Pass | Verified in Checks 10 & 11 of `phase2-isolation.test.mjs`, 2026-09-11 |
| Exactly-one default template enforcement | Pass | Verified in Check 11 of `phase2-isolation.test.mjs`, 2026-09-11 |
| Calendar date validation (YYYY-MM-DD, <= cutoffDate) | Pass | Verified in Check 12 of `phase2-isolation.test.mjs`, 2026-09-11 |
| Opening Setup Draft Editor (receivables, payables, stock lots, serials) | Pass | Verified in Check 13 & UI in `components/settings.tsx`, 2026-09-11 |
| Finalization loads & locks persisted draft | Pass | Verified in Check 14 of `phase2-isolation.test.mjs`, 2026-09-11 |
| Opening Cash and Bank Ledger Source Entries (`accountMovements`) | Pass | Verified in Check 14 of `phase2-isolation.test.mjs`, 2026-09-11 |
| Stock Adjustment Idempotency (`idempotencyKey` + 409 on payload mismatch) | Pass | Verified in Check 15 of `phase2-isolation.test.mjs`, 2026-09-11 |
| Serial Tracking Mode Lock (cannot toggle if stock exists) | Pass | Verified in Check 16 of `phase2-isolation.test.mjs`, 2026-09-11 |
| Serial Unit Lifecycle (Defective / Removed / Re-activated) | Pass | Verified in Check 17 of `phase2-isolation.test.mjs`, 2026-09-11 |
| Atomic Transaction Rollback on Partial Write Error | Pass | Verified in Check 18 of `phase2-isolation.test.mjs`, 2026-09-11 |
| Cross-Company Zero-Existence Leakage (all 404s) | Pass | Verified in Check 19 of `phase2-isolation.test.mjs`, 2026-09-11 |
| Server-Side Pagination & Bounded Bootstrap (10 customers, 50 services/templates) | Pass | Verified in Check 20 of `phase2-isolation.test.mjs`, 2026-09-11 |
| Fresh-Company Demo Import Rule (blocks non-fresh tenants) | Pass | Verified in Check 21 of `phase2-isolation.test.mjs`, 2026-09-11 |
| Sanitized & Versioned Master Data Export | Pass | Verified in Check 22 of `phase2-isolation.test.mjs`, 2026-09-11 |
| Archival Safety (stock on hand blocks product archival) | Pass | Verified in Check 23 of `phase2-isolation.test.mjs`, 2026-09-11 |
| Audit History Integrity (tenant-scoped, before/after diffs, no secrets) | Pass | Verified in Check 24 of `phase2-isolation.test.mjs`, 2026-09-11 |
| Opening Draft Reload & Bootstrap Hydration | Pass | Verified in Check 25 of `phase2-isolation.test.mjs`, 2026-09-11 |
| Page-Two Record Detail Navigation & GET-by-ID Retrieval | Pass | Verified in Check 26 of `phase2-isolation.test.mjs`, 2026-09-11 |
| Master Record Restore Workflow | Pass | Verified in Check 27 of `phase2-isolation.test.mjs` & UI controls, 2026-09-11 |
| Unmigrated Financial Action Disabling in Live Mode (buttons & links) | Pass | Verified in `components/shell.tsx` & `app/enhancements.css`, 2026-09-11 |
| Live/Mixed/Preview separation and page notices | Pass | Sidebar badges and current-page notices verified in `components/shell.tsx`, 2026-09-11 |
| Opening draft API and exact-version finalization | Pass | Correct GET endpoint and save-returned version used by Settings, 2026-09-11 |
| Approval enables user and tenant | Pass | Operator script sets `verified=true`, `disabled=false` and writes `auditHistory`, 2026-09-11 |

## Phase 3 — Purchases, Stock Receipt & Supplier Settlement

| Flow | Status | Evidence |
|---|---|---|
| Company Isolation (all cross-tenant purchase/payment calls 404) | Pass | Verified in Check 1 of `phase3-isolation.test.mjs`, 2026-09-12 |
| Dual Numbering (tenant-scoped display `PUR-2026-0001` + global `_id`) | Pass | Verified in Check 2 of `phase3-isolation.test.mjs`, 2026-09-12 |
| Draft Purchase Order No-Effect (0 stock, 0 payable, 0 ledger) | Pass | Verified in Check 3 of `phase3-isolation.test.mjs`, 2026-09-12 |
| Independent Orthogonal Projections (`documentStatus`, `billStatus`, `receiptStatus`, `paymentStatus`) | Pass | Verified in Check 4 of `phase3-isolation.test.mjs`, 2026-09-12 |
| Unposted Orders Excluded from Dues Query (`hasDue=true`) | Pass | Verified in Check 5 of `phase3-isolation.test.mjs`, 2026-09-12 |
| Archived Product Reference Hard Rejection | Pass | Verified in Check 6 of `phase3-isolation.test.mjs`, 2026-09-12 |
| Bill Posting Creates Payable Liability Without Moving Cash | Pass | Verified in Check 7 of `phase3-isolation.test.mjs`, 2026-09-12 |
| Supplier Bill Uniqueness Scoped to `{tenantId, supplierId, financialYear, supplierInvoiceNumberNormalized}` | Pass | Verified in Check 8 of `phase3-isolation.test.mjs`, 2026-09-12 |
| Same Bill Number Across Different Suppliers | Pass | Verified in Check 9 of `phase3-isolation.test.mjs`, 2026-09-12 |
| Opening Cutoff Date Enforcement (`> cutoffDate`) | Pass | Verified in Check 10 of `phase3-isolation.test.mjs`, 2026-09-12 |
| Kolkata Business Date Invariant (`todayInKolkata()`) | Pass | Verified in Check 11 of `phase3-isolation.test.mjs`, 2026-09-12 |
| Tenant-Owned Attachment Integrity (cross-tenant attachment returns 404) | Pass | Verified in Check 12 of `phase3-isolation.test.mjs`, 2026-09-12 |
| Server Total Recalculation (client total hints ignored) | Pass | Verified in Check 13 of `phase3-isolation.test.mjs`, 2026-09-12 |
| Stock Receipt Creates Lots & Signed Positive Stock Movements | Pass | Verified in Check 14 of `phase3-isolation.test.mjs`, 2026-09-12 |
| Serialized Receipt Integrity & Collision Rejection | Pass | Verified in Check 15 of `phase3-isolation.test.mjs`, 2026-09-12 |
| Partial Receipts & Remainder Closure (`ClosedPartlyReceived`) | Pass | Verified in Check 16 of `phase3-isolation.test.mjs`, 2026-09-12 |
| Over-Receipt Hard Rejection | Pass | Verified in Check 17 of `phase3-isolation.test.mjs`, 2026-09-12 |
| Defective Unit Quarantine Bucket (`quantityDefective`) | Pass | Verified in Check 18 of `phase3-isolation.test.mjs`, 2026-09-12 |
| Defective Stock Excluded from Sellable Inventory | Pass | Verified in Check 19 of `phase3-isolation.test.mjs`, 2026-09-12 |
| Defective Stock Return to Supplier | Pass | Verified in Check 20 of `phase3-isolation.test.mjs`, 2026-09-12 |
| Remainder Closure Preserves Received Lots & Movements | Pass | Verified in Check 21 of `phase3-isolation.test.mjs`, 2026-09-12 |
| Unbilled Purchase Order Cancellation | Pass | Verified in Check 22 of `phase3-isolation.test.mjs`, 2026-09-12 |
| Line-Level Payment Allocation (Line 1 paid without touching Line 2) | Pass | Verified in Check 23 of `phase3-isolation.test.mjs`, 2026-09-12 |
| Adversarial Array Update Guard (`$elemMatch` + `arrayFilters` prevents overpayment) | Pass | Verified in Check 24 of `phase3-isolation.test.mjs`, 2026-09-12 |
| Multi-Account Split Payment (Cash + Bank with atomic disbursement) | Pass | Verified in Check 25 of `phase3-isolation.test.mjs`, 2026-09-12 |
| Opening Payable Settlement (`openingPayables` balance reduction) | Pass | Verified in Check 26 of `phase3-isolation.test.mjs`, 2026-09-12 |
| Duplicate Allocation Target Rejection in Same Payload | Pass | Verified in Check 27 of `phase3-isolation.test.mjs`, 2026-09-12 |
| Over-Allocation Exceeding Line Due Rejected | Pass | Verified in Check 28 of `phase3-isolation.test.mjs`, 2026-09-12 |
| Explicit Advance Consent Requirement (`recordExcessAsAdvance: true`) | Pass | Verified in Check 29 of `phase3-isolation.test.mjs`, 2026-09-12 |
| Single Authoritative Available Credit Source (`supplierAdvances`) | Pass | Verified in Check 30 of `phase3-isolation.test.mjs`, 2026-09-12 |
| Concurrent Advance Allocation and Refund Guard | Pass | Verified in Check 31 of `phase3-isolation.test.mjs`, 2026-09-12 |
| Multi-Line Return Isolation (return on Line A does not reduce Line B due) | Pass | Verified in Check 32 of `phase3-isolation.test.mjs`, 2026-09-12 |
| Return Valuation Preserves Discounts & GST | Pass | Verified in Check 33 of `phase3-isolation.test.mjs`, 2026-09-12 |
| Final Partial Return Rounding Reconciliation Invariant | Pass | Verified in Check 34 of `phase3-isolation.test.mjs`, 2026-09-12 |
| Financial-Only Credit Note Creates Zero Stock Movement | Pass | Verified in Check 35 of `phase3-isolation.test.mjs`, 2026-09-12 |
| Direct Payment Allocation Reversal Creates Advance | Pass | Verified in Check 36 of `phase3-isolation.test.mjs`, 2026-09-12 |
| Advance Allocation Reversal Restores Advance Balance | Pass | Verified in Check 37 of `phase3-isolation.test.mjs`, 2026-09-12 |
| Payment Reversal Blocked if Generated Advance Was Consumed | Pass | Verified in Check 38 of `phase3-isolation.test.mjs`, 2026-09-12 |
| Clean Unencumbered Payment Reversal Restores Cash Balance | Pass | Verified in Check 39 of `phase3-isolation.test.mjs`, 2026-09-12 |
| Credit Note Reversal Restores Shop Liability | Pass | Verified in Check 40 of `phase3-isolation.test.mjs`, 2026-09-12 |
| Refund Reversal Restores Advance Credit & Posts Outgoing Movement | Pass | Verified in Check 41 of `phase3-isolation.test.mjs`, 2026-09-12 |
| Reconciled Signed Supplier Statement Invariant (`Statement Balance = Gross Payables - Available Credits`) | Pass | Verified in Check 42 of `phase3-isolation.test.mjs`, 2026-09-12 |
| Cash Overdraft Strictly Blocked (`balancePaise >= 0`) | Pass | Verified in Check 43 of `phase3-isolation.test.mjs`, 2026-09-12 |
| Account Projection Migration Idempotency (`companySettings.phase3Migration.status`) | Pass | Verified in Check 44 of `phase3-isolation.test.mjs`, 2026-09-12 |
| Migration Cannot Overwrite Live Balances (`version > 1`) | Pass | Verified in Check 45 of `phase3-isolation.test.mjs`, 2026-09-12 |
| Read-Only Ledger Reconciliation Invariant Check (`GET /api/purchases/reconciliation/accounts`) | Pass | Verified in Check 46 of `phase3-isolation.test.mjs`, 2026-09-12 |
| Record + Receive + Pay Atomic Rollback on Error | Pass | Verified in Check 47 of `phase3-isolation.test.mjs`, 2026-09-12 |
| Idempotency Replay & 409 Conflict Protection | Pass | Verified in Check 48 of `phase3-isolation.test.mjs`, 2026-09-12 |
| Dues Query Strict Inclusion (`billStatus === 'Posted' && duePaise > 0`) | Pass | Verified in Check 49 of `phase3-isolation.test.mjs`, 2026-09-12 |
| Summary Aggregation & 5,000-Row CSV Export Stream | Pass | Verified in Check 50 of `phase3-isolation.test.mjs`, 2026-09-12 |

## Phase 3.5 — Purchases & Stock Polish, Reversals, Quarantine, Statements & Routine UI

| Flow | Status | Evidence |
|---|---|---|
| Client Line Key Uniqueness per Document Enforced | Pass | Verified in Scenario 1 of `phase35-isolation.test.mjs`, 2026-09-12 |
| Purchase Charge Lines Supported, Taxed, & Excluded from Stock | Pass | Verified in Scenario 2 of `phase35-isolation.test.mjs`, 2026-09-12 |
| Purchase Order Confirmation Concurrency Control (`expectedVersion`) | Pass | Verified in Scenario 3 of `phase35-isolation.test.mjs`, 2026-09-12 |
| Bill Posting Concurrency Control (`expectedVersion`) | Pass | Verified in Scenario 4 of `phase35-isolation.test.mjs`, 2026-09-12 |
| Order Cancellation Concurrency Control & Reason Enforcement | Pass | Verified in Scenario 5 of `phase35-isolation.test.mjs`, 2026-09-12 |
| Remainder Closure Concurrency Control & Reason Enforcement | Pass | Verified in Scenario 6 of `phase35-isolation.test.mjs`, 2026-09-12 |
| Goods Receipt Reversal Restores Quantities & Cancels Serials | Pass | Verified in Scenario 7 of `phase35-isolation.test.mjs`, 2026-09-12 |
| Goods Receipt Reversal Guard (blocked if stock consumed/modified) | Pass | Verified in Scenario 8 of `phase35-isolation.test.mjs`, 2026-09-12 |
| Supplier Return Reversal Restores Stock Lot Quantities | Pass | Verified in Scenario 9 of `phase35-isolation.test.mjs`, 2026-09-12 |
| Supplier Return Reversal Guard (blocked when credit note/advance consumed) | Pass | Verified in Scenario 10 of `phase35-isolation.test.mjs`, 2026-09-12 |
| Stock Quarantine Moves Sellable to Defective (`onHandDelta: 0`) | Pass | Verified in Scenario 11 of `phase35-isolation.test.mjs`, 2026-09-12 |
| Stock Quarantine Rejection on Insufficient Sellable Stock | Pass | Verified in Scenario 12 of `phase35-isolation.test.mjs`, 2026-09-12 |
| Stock Restore Moves Defective to Sellable (`onHandDelta: 0`) | Pass | Verified in Scenario 13 of `phase35-isolation.test.mjs`, 2026-09-12 |
| Stock Restore Rejection on Insufficient Defective Stock | Pass | Verified in Scenario 14 of `phase35-isolation.test.mjs`, 2026-09-12 |
| Phase 3.5 Bucket-Aware Stock Movement Migration | Pass | Verified in Scenario 15 of `phase35-isolation.test.mjs`, 2026-09-12 |
| `canReverse` Predicate Accuracy for Purchase Receipts | Pass | Verified in Scenario 16 of `phase35-isolation.test.mjs`, 2026-09-12 |
| `canReverse` Predicate Accuracy for Supplier Returns | Pass | Verified in Scenario 17 of `phase35-isolation.test.mjs`, 2026-09-12 |
| `canReverse` Predicate Accuracy for Supplier Payments | Pass | Verified in Scenario 18 of `phase35-isolation.test.mjs`, 2026-09-12 |
| `canReverse` Predicate Accuracy for Supplier Allocations | Pass | Verified in Scenario 19 of `phase35-isolation.test.mjs`, 2026-09-12 |
| `canReverse` Predicate Accuracy for Supplier Credit Notes | Pass | Verified in Scenario 20 of `phase35-isolation.test.mjs`, 2026-09-12 |
| `canReverse` & Refund Reversal Account Overdraft Protection | Pass | Verified in Scenario 21 of `phase35-isolation.test.mjs`, 2026-09-12 |
| Supplier Statement Database-Level Pagination & `balanceBeforePage` | Pass | Verified in Scenario 22 of `phase35-isolation.test.mjs`, 2026-09-12 |
| Supplier Statement Date Filtering (inclusive start & end) | Pass | Verified in Scenario 23 of `phase35-isolation.test.mjs`, 2026-09-12 |
| Supplier Refund Direction & Accounting Sign Verification | Pass | Verified in Scenario 24 of `phase35-isolation.test.mjs`, 2026-09-12 |
| Supplier Statement Invariant (`Statement Balance = Gross Payables - Available Credits`) | Pass | Verified in Scenario 25 of `phase35-isolation.test.mjs`, 2026-09-12 |
| Supplier Advance 3-State Status Derivation (`Open` / `PartlyConsumed` / `Consumed`) | Pass | Verified in Scenario 26 of `phase35-isolation.test.mjs`, 2026-09-12 |
| Advance Allocation to Bill Transitioning Advance to `Consumed` | Pass | Verified in Scenario 27 of `phase35-isolation.test.mjs`, 2026-09-12 |
| Advance Allocation Reversal Restoring Advance Balance to `Open` | Pass | Verified in Scenario 28 of `phase35-isolation.test.mjs`, 2026-09-12 |
| File Upload Magic Bytes, MIME, & 5 MB Limit Validation | Pass | Verified in Scenario 29 of `phase35-isolation.test.mjs`, 2026-09-12 |
| File Download RFC 5987 Compliant `Content-Disposition` | Pass | Verified in Scenario 30 of `phase35-isolation.test.mjs`, 2026-09-12 |
| Tenant-Scoped Orphan File Cleanup Safely Purges Aged Orphans (24h cutoff) | Pass | Verified in Scenario 31 of `phase35-isolation.test.mjs`, 2026-09-12 |
| Export Sanitization & XLSX, PDF, CSV Streaming Validation | Pass | Verified in Scenario 32 of `phase35-isolation.test.mjs`, 2026-09-12 |
| Four Distinct Orthogonal Badges in Purchases List UI | Pass | Verified in `components/documents.tsx` & browser walkthrough, 2026-09-12 |
| Supplier Profile All 8 Tabs & Action Modals (Credit Note, Refund, Reversals) | Pass | Verified in `components/account-history.tsx` & browser walkthrough, 2026-09-12 |
| Inventory All 6 Tabs & Lot Quarantine/Restore Controls | Pass | Verified in `components/inventory.tsx` & browser walkthrough, 2026-09-12 |
| Quotation Full Lifecycle (Create, Get, List, Update, Cancel, Reopen) | Pass | Verified in Scenario 1 of `phase4-isolation.test.mjs`, 2026-09-14 |
| Quotation Conversion Idempotency & Conflict (409) | Pass | Verified in Scenario 2 of `phase4-isolation.test.mjs`, 2026-09-14 |
| Invoice Draft Lifecycle & Unallocated Issue Prevention | Pass | Verified in Scenario 3 of `phase4-isolation.test.mjs`, 2026-09-14 |
| Non-Serialized Hold Lifecycle (Hold 3 -> Sell 1 -> Release Remainder) | Pass | Verified in Scenario 4 of `phase4-isolation.test.mjs`, 2026-09-14 |
| Serialized Hold Lifecycle (Unit Isolation, Consumption & Release) | Pass | Verified in Scenario 5 of `phase4-isolation.test.mjs`, 2026-09-14 |
| Cross-Tenant & Cross-Customer Reservation Isolation | Pass | Verified in Scenario 6 of `phase4-isolation.test.mjs`, 2026-09-14 |
| Mixed Held & Ordinary Stock Combined Allocation in Single Invoice | Pass | Verified in Scenario 7 of `phase4-isolation.test.mjs`, 2026-09-14 |
| Hold Partial Consumption + Auto-Expiry Worker | Pass | Verified in Scenario 8 of `phase4-isolation.test.mjs`, 2026-09-14 |
| Settlement Failure Atomic Rollback (Stock, Hold, Draft) | Pass | Verified in Scenario 9 of `phase4-isolation.test.mjs`, 2026-09-14 |
| Asia/Kolkata Business Date Boundary Enforcement for Holds | Pass | Verified in Scenario 10 of `phase4-isolation.test.mjs`, 2026-09-14 |
| Archived Customer Hold Prevention & Existing Hold Release | Pass | Verified in Scenario 11 of `phase4-isolation.test.mjs`, 2026-09-14 |
| Draft Edit/Cancel Isolation (Preserves Independent Holds) | Pass | Verified in Scenario 12 of `phase4-isolation.test.mjs`, 2026-09-14 |
| Quotations & Invoices Server-Side Pagination and Filter Bounds | Pass | Verified in Scenario 13 of `phase4-isolation.test.mjs`, 2026-09-14 |
| Customer Advance Auto-Consumption on Invoice Issue | Pass | Verified in Scenario 14 of `phase4-isolation.test.mjs`, 2026-09-14 |
| Excess Cash Conversion to Customer Advance with Explicit Consent | Pass | Verified in Scenario 15 of `phase4-isolation.test.mjs`, 2026-09-14 |
| Credit Limit Concurrency Lock & Supervisor Override Audit | Pass | Verified in Scenario 16 of `phase4-isolation.test.mjs`, 2026-09-14 |
| Inter-State vs Intra-State GST Calculation Reconciliation | Pass | Verified in Scenario 17 of `phase4-isolation.test.mjs`, 2026-09-14 |
| Standalone Customer Receipt Settlement & Financial Version Lock | Pass | Verified in Scenario 18 of `phase4-isolation.test.mjs`, 2026-09-14 |
| Customer Advance Allocation with Zero Account Movement Invariant | Pass | Verified in Scenario 19 of `phase4-isolation.test.mjs`, 2026-09-14 |
| Customer Advance Refund with Cash/Bank Overdraft Protection | Pass | Verified in Scenario 20 of `phase4-isolation.test.mjs`, 2026-09-14 |
| Downstream Advance Consumption Blocks Receipt Reversal (409) | Pass | Verified in Scenario 21 of `phase4-isolation.test.mjs`, 2026-09-14 |
| Customer Statement Running Balance Equation & Period Totals | Pass | Verified in Scenario 22 of `phase4-isolation.test.mjs`, 2026-09-14 |
| Sales Return GST Proration & Restock vs Quarantine Disposition | Pass | Verified in Scenario 23 of `phase4-isolation.test.mjs`, 2026-09-14 |
| Warranty Claim Lifecycle (Repair, Serial Swap Replacement & Reject) | Pass | Verified in Scenario 24 of `phase4-isolation.test.mjs`, 2026-09-14 |
| Invoice Template CRUD, Clone, Default & Batch PDF ZIP Export | Pass | Verified in Scenario 25 of `phase4-isolation.test.mjs`, 2026-09-14 |

## Future critical flows (Phase 5 Scope)

- Cash-to-bank and bank-to-cash transfer preserves total funds and does not alter sales/profit figures.
- Daily closing carries balances, blocks differences, enforces strict date sequence, handles holiday rules and locks closed business dates.
- Register session opening/closing reconciliations with denomination counting and expected vs actual cash variances.
- Profit lock and audit trail safeguards for finalized closed periods.




## 2026-09-14 — Static review: Phase 4 completion reopened

The earlier 25/25 report is retained as reported test history, not evidence that all required relationships are correct. Static code review found blocking return-stock, warranty-replacement, customer-ledger and template-contract defects. See PHASE4-COMPLETION-REVIEW-AND-CORRECTION-PROMPT.md for evidence, correction order and required new acceptance chains. No tests/build/database actions were run during this review. Phase 4 remains incomplete pending correction and Antigravity verification. Sales, quotations and reservations are labelled Partly live; existing Live modules retain their labels.

## 2026-09-14 — Phase 4 Review Corrections Completed & Full Regression Verified

All six defect categories and five adjustments from `PHASE4-COMPLETION-REVIEW-AND-CORRECTION-PROMPT.md` have been resolved and verified across the end-to-end integration and regression suites:

1. **Return Stock & Serial Lineage**:
   - Customer returns target exact source stock lots from the original invoice lines.
   - `quantitySold` is decremented while `quantitySellable` (or `quantityDefective` for damaged goods) is restored. Physical on-hand stock increases correctly without touching supplier-return counters.
   - Serials are strictly validated against the sold invoice and line, preventing cross-invoice or cross-customer returns.

2. **Return Settlement & Due Offsetting**:
   - Return credit offsets unpaid invoice due first. Direct cash/bank refund is strictly limited to actual paid amounts (`maxRefund = max(0, returnAmount - outstandingDue)`).
   - Customer credit advances record `sourceType: 'Return'` and link to the source return/credit note.
   - Cash/bank refunds generate corresponding customer refund records with signed account movements.

3. **Atomic Warranty Replacement & Stock Movements**:
   - Warranty replacement transacts defective unit return, replacement unit sale, serial status transitions (`Defective` / `Removed`), lot counter adjustments (`quantityDefective` / `quantitySold`), and append-only stock movements atomically in a single MongoDB transaction with `expectedVersion`.
   - Replaced serials cannot be refunded or claimed again. Original invoice records remain immutable snapshots.

4. **Unified Customer Payment Contract & Reversals**:
   - Settle-on-issue and standalone customer receipts share the unified schema (`allocatedPaidPaise`, `isReversed: false`, `customerAllocations`, `customerAdvances`).
   - Downstream advance consumption (including from reversed allocations) blocks receipt reversal with `409 Conflict`.
   - Allocation reversals restore invoice due and return funds to available customer advance credit.

5. **Canonical Template Engine & Snapshot-Based Multi-Format Exports**:
   - Unified on `invoiceTemplates` and `templateRevisions` with immutable revision creation and atomic default setting.
   - Batch PDF ZIP export generates valid PDFs using issued invoice snapshots and template column/field settings with no silent truncation.

### Test Execution & Gate Verification:
| Test Suite | Result | Status |
|------------|--------|--------|
| `tests/phase4-corrections.test.mjs` (10 Acceptance Chains + 8b) | 11 / 11 Passed | Pass (100%) |
| `tests/phase4-isolation.test.mjs` (25 Scenarios) | 25 / 25 Passed | Pass (100%) |
| `tests/phase35-isolation.test.mjs` (32 Scenarios) | 32 / 32 Passed | Pass (100%) |
| `npm run test:phase2` (27 Scenarios) | 27 / 27 Passed | Pass (100%) |
| `npm test` (`tests/domain.test.mjs` - 26 Tests) | 26 / 26 Passed | Pass (100%) |
| `npm run typecheck` (`tsc --noEmit`) | 0 Errors | Pass |
| `npm run build` (Next.js Production Bundle) | Exit 0 | Pass |

### Verified File Fingerprints (SHA-256):
- `server/stock-reservations.ts`: `8ea34c1f89ee43b85091312db923aade5f59957eeeb3b485848f76c43ab52945`
- `server/sales-returns.ts`: `439685cf88702cba12e31eaa65a45e767a9ae4f595780790f758cc7187cf0ff0`
- `server/warranties.ts`: `bb41fc87fd60c8ca099e5c02676402e47060b9b90f262bcc78dbf3095dab017a`
- `server/sales-templates.ts`: `6c654f966a3cf912e1b10b611dc3a1030e86639f710a8b48ec9fa2f971c45b12`
- `app/api/sales/invoices/export-zip/route.ts`: `165842617ccde0e643025faae4adaddcd99579d2ef159f55324fef4c0ff0fd9e`
- `server/customer-ledger.ts`: `34d5794adf011c30bd402259273fca8ee1de71a638ffe06241fdeaabe066aace`
- `server/sales-service.ts`: `9c27705149b1a8a14582beaa0a8d41278c083ea47b0a1d59c4f8228e75f1ccc0`
- `tests/phase4-corrections.test.mjs`: `d22139f77d523ff88a987e9e91cd5e593edd77bb2b71056a339f0a21af518287`
- `tests/phase4-isolation.test.mjs`: `06748f5a5a36b69a637cf5bee4ea4505618a8743dd5c8f44729b70be45c71407`

### Module Status:
- Phase 1 & 2 (Master data, settings, auth, inventory): Live
- Phase 3 & 3.5 (Purchases, payables, stock movements): Live
- Phase 4 (Sales, quotations, reservations, warranties, returns, templates): **Live** (100% verified across 10 prompt corrections, 10 acceptance chains, 25 isolation scenarios)
- Phase 5 (Daily register closing, day-end locks, holiday policies): **Pending (Untouched)**

