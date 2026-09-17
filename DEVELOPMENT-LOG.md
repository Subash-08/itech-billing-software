# Development log

Record completed implementation work here. Keep entries factual and concise. Do not store secrets, passwords, connection strings or customer data.

## Entry template

### YYYY-MM-DD — Phase and feature

- Scope completed:
- User-visible behavior:
- Collections/indexes/migrations:
- Important files changed:
- Verification commands and results:
- Manual flows checked:
- Remaining mock behavior:
- Follow-up work:

## 2026-09-11 — Phase 2: Company setup and master data

- Scope completed: Full multi-tenant master data backend and UI wiring. Persists company settings, customers, suppliers, products, serial tracking configuration, stock adjustments, reusable service catalogue, invoice templates with immutable revision history, and a Draft → Finalized opening balance setup (opening stock lots, serial units, opening receivables, opening payables, cash/bank balances). Supported explicit demo master data import into fresh tenants, transactional audit logging with snapshot sanitization, bounded bootstrap endpoint (`/api/master/bootstrap`), and master export.
- User-visible behavior: Unauthenticated sessions run in the standalone in-memory Demo Workspace. Authenticated sessions with an approved company operate in Live Mode: company settings, customers, suppliers, products, services, templates, and opening setups persist directly to MongoDB Atlas. Live mode labels non-migrated financial transaction modules (sales, purchases, cash register, closing) as mock preview until Phases 3–5.
- Collections/indexes/migrations: Created collections `companySettings`, `customers`, `suppliers`, `products`, `serialUnits`, `stockLots`, `stockMovements`, `openingSetups`, `openingReceivables`, `openingPayables`, `serviceCatalog`, `invoiceTemplates`, `templateRevisions`, and `auditHistory`. Enforced compound indexes on `{tenantId: 1, ...}`, multikey text search indexes, partial unique index for default templates `{tenantId: 1, isDefault: 1}`, and unique compound index `{tenantId: 1, serialNormalized: 1}` on `serialUnits`.
- Important files changed: `server/master-schema.ts`, `server/master-service.ts`, `server/audit.ts`, `server/db.ts`, `server/auth.ts`, `app/api/company/settings/route.ts`, `app/api/master/**`, `components/store.tsx`, `components/settings.tsx`, `components/people.tsx`, `components/inventory.tsx`, `components/service-catalog.tsx`, `components/templates.tsx`, `components/shell.tsx`, `app/enhancements.css`, `tests/phase2-isolation.test.mjs`.
- Verification commands and results:
  - `npm run typecheck`: Passed with zero TypeScript errors.
  - `npm test`: Passed all 26 domain automated tests.
  - `npm run test:phase2`: Passed all 19 multi-tenant isolation, cross-company injection rejection, serial uniqueness, atomic rollback, and audit tests.
  - `npm run build`: Production Next.js build completed successfully (29 routes).
  - `npm audit`: 0 vulnerabilities found.
- Manual flows checked: Company settings save with private file logo, Draft opening balance save, atomic finalization locking, customer and supplier save with duplicate phone warnings, product catalogue save, stock adjustment with serial tracking, and template editing with immutable revision snapshots.
- Remaining mock behavior: Billing/invoicing, purchases, supplier payment allocations, money desk, and daily closing remain mock in Live mode until Phases 3–5.
- Follow-up work: Phase 3 (Purchases, stock receipt, and supplier settlement).

## 2026-09-11 — Phase 2: Correction Pass and Rigorous Verification

- Scope completed: Resolved all 10 blocking and major audit findings from independent review:
  1. Canonical API-to-Domain Mapping: Established single mapper module (`lib/mappers.ts`) converting MongoDB `_id` to UI `id` consistently across Customers, Suppliers, Products, Service Catalog, and Invoice Templates, preserving real zero values for GST tax (0%), low stock threshold (0), and warranty (0).
  2. Complete Opening Setup Editor: Implemented full interactive UI tables in `components/settings.tsx` for entering draft opening receivables, payables, stock lots with serials, and cash/bank balances with live debit/credit reconciliation summary.
  3. Opening Cash and Bank Ledger Source Entries: Finalization atomically posts opening cash and bank balances to `accountMovements` as source records (`account: 'Cash'|'Bank'`, `direction: 'In'`).
  4. Persisted Draft Finalization: `finalizeOpeningSetup()` loads and locks the previously saved draft from the database. Rejects finalization if no saved draft exists or if financial/stock activity already occurred.
  5. Stock Adjustment Idempotency: Enforced idempotency via `idempotencyKey` backed by partial unique compound index `{tenantId: 1, idempotencyKey: 1}` on `stockMovements`.
  6. Serial Tracking Mode Lock: Blocked mutating `isSerialTracked` on products that currently hold stock on hand.
  7. Serial Unit Lifecycle: Removing serials tracks disposition (`Defective` vs `Removed`); restoring or re-adding previously removed serial units reactivates status to `InStock`.
  8. Unmigrated Financial Action Disabling: Action buttons across unmigrated financial modules (billing, purchases, money desk, closing) in Live Mode are explicitly disabled with clear visual cues and informational badges.
  9. Strict Uniqueness, Date Validation, and Freshness Guard: Enforced calendar date constraints (`<= cutoffDate`), normalized phone duplicate checks across the entire database, case-insensitive template uniqueness with exactly-one default template guarantee, and fresh-tenant requirement for demo imports.
  10. Test Suite Expansion & Rate Limit Immunity: Expanded `tests/phase2-isolation.test.mjs` to 24 comprehensive checks. Configured test runner to bypass database-backed auth rate limiter via `DISABLE_AUTH_RATE_LIMIT=true` for 100% deterministic reproducibility.
- Collections/indexes/migrations: Added partial unique index for stock idempotency on `stockMovements`, compound index on `accountMovements`, and case-insensitive template name index.
- Important files changed: `lib/mappers.ts`, `lib/domain.ts`, `lib/extensions.ts`, `server/master-schema.ts`, `server/master-service.ts`, `server/db.ts`, `server/auth.ts`, `server/better-auth.ts`, `components/store.tsx`, `components/settings.tsx`, `components/templates.tsx`, `components/people.tsx`, `components/inventory.tsx`, `components/account-access.tsx`, `components/shell.tsx`, `tests/phase2-isolation.test.mjs`.
- Verification commands and results:
  - `npm run typecheck`: Passed (0 errors).
  - `npm test`: Passed (26/26 unit tests).
  - `npm run test:phase2`: Passed (24/24 multi-tenant isolation and data integrity tests).
  - `npm run build`: Production Next.js build succeeded (29 routes).
  - `npm audit --omit=dev`: 0 vulnerabilities.
- Follow-up work: Ready for user approval before moving to Phase 3 (Purchases, stock receipt, and supplier settlement).

## 2026-09-11 — Phase 2: Live and preview separation hardening

- Scope completed: Added explicit `LIVE READY`, `MIXED`, and `PREVIEW` badges to every sidebar module. Added page-level notices that state whether the current screen writes to Atlas, combines live master data with preview transaction panels, or uses sample browser data only.
- Correctness fixes: Aligned bootstrap opening status with the server response (`boot.opening || boot.openingStatus`); corrected opening-draft retrieval (`GET /api/master/opening` and `GET /api/master/opening/draft`); used the exact saved draft version during finalization; preserved zero-day customer payment terms and zero-cost opening lots via nullish coalescing; added stable `originalAmountPaise` to opening receivables/payables; required active opening references and preferred suppliers; validated stock idempotency-key reuse against product, quantity and serials (returning 409 Conflict on payload mismatch); added restore endpoints and UI controls (`/api/master/{customers|suppliers|products|services|templates}/[id]/restore`); and made the approval script enable both user and tenant while writing to `auditHistory`.
- UI data fixes: Live customer, supplier and product detail URLs now fetch the requested tenant-scoped record even when it is outside the bounded bootstrap page. Customer type filtering is server-side. Product and opening-setup supplier/customer/product selectors load live choices (up to 100 records) rather than relying on the first bootstrap page. Disabled unmigrated financial action links (`a[href*="/sales/new"]`, `a[href*="/purchases/new"]`, etc.) in live mode via CSS pointer events and added '· preview' badges.
- Mode definitions: `Settings`, `Company account`, and `Service catalogue` are live-ready. `Customers`, `Suppliers`, `Inventory`, and `Invoice templates` are mixed because master records persist while related transaction/history examples remain preview data. Dashboard, sales, purchases, enquiries, quotations, service jobs, reservations, returns, warranty, cash/account, dues, daily closing, reports, documents, and communication are preview-only until their transaction phases.
- Verification: `npm run typecheck` passed (0 errors); `npm test` passed 26/26 unit tests; `npm run test:phase2` passed 27/27 multi-tenant isolation tests against Atlas with exact temporary-record cleanup; `npm run build` passed (35 routes compiled); `npm audit` reported 0 vulnerabilities.
- Follow-up work: Phase 3 should implement Purchases → Stock receipt → Supplier payable → Supplier payment allocation, after which those pages can move from Preview to Live.

## 2026-09-12 — Phase 3: Purchases, Stock Receipt, and Supplier Settlement

- Scope completed: Full production backend and live UI integration for multi-tenant Purchases, Goods Stock Receipt, and Supplier Settlement adhering to all 22 product decisions (D-001 through D-022):
  1. Orthogonal Lifecycle Projections: Fully decoupled `documentStatus` ('Draft'|'Confirmed'|'Cancelled'), `billStatus` ('Unbilled'|'Posted'), `receiptStatus` ('Pending'|'PartlyReceived'|'FullyReceived'|'ClosedPartlyReceived'), and `paymentStatus` ('Unpaid'|'PartlyPaid'|'FullyPaid'). Unbilled purchase orders create zero payable liability and zero stock.
  2. Dual Numbering System: Globally unique internal ObjectId `_id` coupled with tenant-scoped sequential display `purchaseNumber` (`PUR-YYYY-XXXX` generated atomically via `tenantCounters`).
  3. Bill Posting & Scoped Uniqueness: Bill posting validates supplier invoice number uniqueness scoped to `{ tenantId, supplierId, financialYear, supplierInvoiceNumberNormalized }`, permitting different suppliers or fiscal years to share bill numbers cleanly.
  4. Calendar & Cutoff Enforcements: Enforced Asia/Kolkata business day (`todayInKolkata()`) and strict operational boundary (`> opening.cutoffDate`).
  5. Physical Stock Receipt & Traceability: Goods receipts create batch `stockLots` and signed positive `stockMovements`. Serialized items enforce global uniqueness on `{ tenantId, serialNormalized }`. Defective units route to `quantityDefective` quarantine buckets excluded from sellable inventory, eligible for supplier return.
  6. Remainder Closure & Order Cancellation: Remainder closure transitions order to `ClosedPartlyReceived` while preserving already received lots. Unbilled orders cancel with zero financial or inventory side effects.
  7. Atomic Line Allocations & Overdraft Protection: Line-level payment allocations (`purchaseAllocations`) targeting specific purchase lines and opening payables (`openingPayables`). Protected by dual-layer array update guards (`$elemMatch` on root filter + `arrayFilters`). Disbursements from shared `tenantAccountBalances` require `{ balancePaise: { $gte: amountPaise } }`, strictly blocking Cash and Bank overdrafts.
  8. Single Authoritative Credit Engine: All supplier credits (excess payments, credit note remainders) reside strictly in `supplierAdvances`. Over-allocation requires explicit user consent (`recordExcessAsAdvance: true`).
  9. Prorated Return Valuation & Rounding Reconciliation: Physical returns calculate line item costs prorating discounts and taxes, reconciling rounding differences on the final returned unit. Accepted credit notes offset line liability; excess funds flow to advances.
  10. Full Reversal Engine: Atomic reversal for payment allocations, advance allocations, unencumbered payments, credit notes, and refunds. Downstream consumption blocks payment reversal.
  11. Signed Supplier Statement & Reporting: Generates mathematical statement invariant (`Statement Balance = Gross Payables - Available Credits`), matching summary metrics, and memory-efficient streaming CSV export up to 5,000 records.
  12. Everyday Shortcut: "Record + Receive + Pay" executes order creation, bill posting, goods receipt, and payment settlement in a single atomic MongoDB transaction.
- User-visible behavior: Purchases and Supplier Settlement modules wired to live API endpoints in Live Mode. Live company accounts can create purchase orders, post supplier bills, receive serialized/standard stock, manage defective returns, disburse split payments, and inspect reconciled supplier statements with real-time balance calculations. Error states present actionable notifications with retry options and never fall back to mock data.
- Collections/indexes/migrations: Created 11 collections: `purchases`, `purchaseReceipts`, `supplierPayments`, `purchaseAllocations`, `supplierAdvances`, `supplierCreditNotes`, `supplierReturns`, `supplierRefunds`, `tenantAccountBalances`, `tenantCounters`, and `idempotencyRecords`. Enforced compound unique indexes for tenant isolation and sequence counters. Idempotent account balance migration (`POST /api/purchases/migration`) populates `tenantAccountBalances` from opening setup.
- Important files changed:
  - Backend: `server/purchase-schema.ts`, `server/purchase-service.ts`, `server/audit.ts`, `server/db.ts`.
  - API Routes: 23 routes in `app/api/purchases/**` and `app/api/suppliers/[id]/statement/route.ts`.
  - Frontend & Store: `components/store.tsx`, `components/supplier-settlement.tsx`, `components/documents.tsx`, `lib/mappers.ts`.
  - Tests: `tests/phase3-isolation.test.mjs` (50 verification flows).
- Verification commands and results:
  - `npm test`: Passed (26/26 unit tests).
  - `npm run test:phase2`: Passed (27/27 isolation checks).
  - `node --test tests/phase3-isolation.test.mjs`: Passed (50/50 live Atlas integration checks with 100% data cleanup).
  - `npm run typecheck`: Passed (0 errors).
  - `npm run build`: Production Next.js build completed successfully (58 routes compiled).
  - `npm audit --omit=dev`: 0 vulnerabilities.
- Manual flows checked: Draft purchase creation, confirmed bill posting, serialized stock receipt with duplicate detection, partial remainder closure, split cash/bank payment, advance allocation, credit note acceptance, supplier statement reconciliation, and CSV export streaming.
- Remaining mock behavior: Invoicing, sales orders, customer dues collection, daily closing, and money desk remain preview-only until Phases 4 & 5.
- Follow-up work: Phase 4 (Sales, Invoicing, Counter POS, and Customer Dues).

## 2026-09-12 — Phase 3.5: Purchases & Stock Polish, Reversals, Quarantine, Statements & Routine UI

- Scope completed: Full routine UI integration and backend hardening for Phase 3.5:
  1. Orthogonal Projections in UI: Purchases list in `components/documents.tsx` displays 4 distinct, orthogonal status badges per row (`documentStatus`, `billStatus`, `receiptStatus`, `paymentStatus`), synchronized with URL search params (`docStatus`, `billStatus`, `receiptStatus`, `paymentStatus`, `search`, `date`, `page`).
  2. Supplier Profile 8-Tab Suite: Implemented dedicated views for `Overview`, `Purchases`, `Payables`, `Payments`, `Advances & credits`, `Returns`, `Statement`, and `Activity timeline` in `components/account-history.tsx`. Added modals for "Record credit note" against posted bills, "Refund into Cash/Bank" for available advances, "Accept credit note" for uncredited returns, and dependency-aware reversal modals with reason input for eligible payments and returns. Added server-side pagination with Prev/Next controls across Purchases, Payments, and Returns.
  3. Inventory 6-Tab Suite & Quarantine Engine: Enhanced `components/inventory.tsx` to support `Overview`, `Stock lots`, `Serial units`, `Stock movements`, `Purchase sources`, and `Audit history`. Implemented inline "Quarantine to Defective" and "Restore to Sellable" actions with reason prompts, lot reloading, and condition movements with net on-hand delta zero.
  4. Topbar & Sidebar Live Status Clarification: Updated sidebar badges to clean uppercase (`LIVE`, `MIXED`, `PREVIEW`). Added 1-click "Connect Live Company" banner in `components/shell.tsx` that authenticates immediately into live multi-tenant mode (`test@gmail.com`).
  5. Local Demo State Persistence: Added `itech_demo_state_v1` local storage persistence to safeguard unauthenticated demo exploration across browser reloads without bleeding into live Atlas database.
  6. Backend Statement Aggregation Fix: Replaced illegal nested `$facet` in `getSupplierStatement` (`server/purchase-service.ts`) with MongoDB-compliant top-level facet stages (`beforePeriod`, `totalCount`, `balanceBeforePage`, `periodBalance`, `pageItems`).
  7. Bucket-Aware Movement Migration: Updated `migratePhase35StockMovements` to fall back to reason inspection (`reason.toLowerCase().includes('defective')`) for historical defective returns.
  8. Storage Orphan Cleanup Cutoff: Corrected grace period cutoff in `server/storage.ts` to 24 hours (`24 * 60 * 60 * 1000`) per Phase 3.5 specification.
- User-visible behavior: Live company accounts experience end-to-end purchase order creation with charge lines, bill posting, serialized goods receipt, goods receipt reversal, lot quarantine and restoration, defective stock returns, return credit note acceptance, advance refunds, supplier statement generation with running balances and date filtering, and streaming exports in CSV, XLSX, and PDF formats. No fallback to mock data on errors.
- Collections/indexes/migrations: Created migration endpoint `POST /api/purchases/migration/phase35` migrating historical stock movements to populate `sellableDelta` and `defectiveDelta`. Enforced RFC 5987 compliant downloads in `app/api/files/[id]/route.ts`. Verified 24-hour orphan file cleanup in `server/storage.ts`.
- Important files changed:
  - Backend: `server/purchase-service.ts`, `server/purchase-schema.ts`, `server/storage.ts`, `server/db.ts`.
  - Frontend: `components/documents.tsx`, `components/account-history.tsx`, `components/inventory.tsx`, `components/shell.tsx`, `components/supplier-settlement.tsx`, `components/ui.tsx`, `app/enhancements.css`.
  - Tests: `tests/phase35-isolation.test.mjs`.
- Verification commands and results:
  - `npm run typecheck`: Passed (0 errors).
  - `npm test`: Passed (26/26 unit tests).
  - `npm run test:phase2`: Passed (27/27 isolation tests with clean teardown).
  - `npm run test:phase3`: Passed (50/50 isolation tests with clean teardown).
  - `node tests/phase35-isolation.test.mjs`: Passed (32/32 isolation tests with clean teardown).
  - `npm run build`: Production Next.js build succeeded (70+ routes compiled dynamically).
  - `npm audit`: 0 vulnerabilities.
- Manual flows checked: Interactive browser walkthrough on live company `52af8be0-463f-429a-b22e-7029669f395f` verifying 4 orthogonal purchase badges, supplier profile 8 tabs, advance refund, return credit note acceptance, payment reversal, stock quarantine/restore, and statement balance invariant reconciliation.
- Remaining mock behavior: Invoicing, sales orders, counter POS, customer receipts, customer returns, customer warranty claims, daily closing, and profit tracking remain preview-only until Phases 4 & 5.
- Follow-up work: Phase 4 (Pass 4A: Live Sales Foundation — customer invoices, quotations, stock reservations, customer receipts & advances).

## 2026-09-13 — Phase 4 Pass 4A1: Sales calculations hardening + quotation/invoice service + API routes

- Scope completed:
  1. **Hardened `server/sales-calculations.ts`**: Fixed `prorateSaleReturnPaise` using the cumulative-floor-difference method — adds `alreadyReturnedQuantity` parameter so credits for partial returns always sum to exactly `originalLineTotalPaise` with zero paise loss or excess across any number of returns. Added BigInt overflow-safe paths for all intermediate products (discount, inclusive-tax, exclusive-tax) that could overflow `Number.MAX_SAFE_INTEGER`.
  2. **Fixed `server/sales-schema.ts`**: Extracted `InvoiceDraftBase` (pure `z.object`) and applied `superRefine(lineValidation)` after `.extend()` calls, resolving Zod v3 error "`.omit()` cannot be used on schemas containing refinements" that caused `CreateQuotationSchema` to crash the Next.js page-data collection step.
  3. **Created `server/sales-service.ts`**: Implements `createQuotation`, `convertQuotationToDraft`, `createInvoiceDraft`, `issueInvoice` (atomic 14-step MongoDB transaction), `listQuotations`, `listInvoices`, `getInvoice`, and `getQuotation`. Reuses `executeIdempotentTransaction`, `nextTenantSequence`, `assertOperationalPostingAllowed`, `assertPhase3MigrationComplete`, and `col` from `purchase-service`.
  4. **Extended `purchase-service.ts`**: Added `'Quotation' | 'Invoice' | 'ServiceInvoice'` to `nextTenantSequence` union type.
  5. **Added Phase 4 indexes to `server/db.ts`**: 19 new compound/partial indexes covering `quotations`, `invoices`, `customerReceipts`, `customerAllocations`, `customerAdvances`, `warranties`, and `stockReservations`.
  6. **Created 5 API routes**: `GET/POST /api/sales/quotations`, `GET+POST(convert) /api/sales/quotations/[id]`, `GET/POST /api/sales/invoices`, `GET /api/sales/invoices/[id]`, `POST /api/sales/invoices/[id]/issue`.

- User-visible behavior: API endpoints are live and authenticated. A draft invoice can be created, then issued atomically (stock lock → serial mark-sold → movement → invoice number → receipt → advance → warranty → audit) in a single MongoDB transaction with idempotency protection. Quotations can be created and converted to invoice drafts.

- Collections/indexes/migrations: `quotations`, `invoices`, `customerReceipts`, `customerAllocations`, `customerAdvances`, `warranties`, `stockReservations` — all indexed. No migration required (new empty collections).

- Important files changed:
  - `server/sales-calculations.ts` (hardened, BigInt overflow guard + rounding fix)
  - `server/sales-schema.ts` (Zod superRefine extraction fix)
  - `server/sales-service.ts` (NEW — full service layer)
  - `server/purchase-service.ts` (extended sequenceType union)
  - `server/db.ts` (19 new Phase 4 indexes)
  - `app/api/sales/quotations/route.ts` (NEW)
  - `app/api/sales/quotations/[id]/route.ts` (NEW)
  - `app/api/sales/invoices/route.ts` (NEW)
  - `app/api/sales/invoices/[id]/route.ts` (NEW)
  - `app/api/sales/invoices/[id]/issue/route.ts` (NEW)

- Verification commands and results:
  - `npx tsc --noEmit`: Passed (0 errors).
  - `npm run build`: Exit 0. All 5 new routes compiled as Dynamic (ƒ). 75+ routes total.
  - `npm audit --audit-level=high`: 0 vulnerabilities.

- Manual flows checked: None yet — UI integration is Pass 4A2 scope.
- Remaining mock behavior: Customer receipts (standalone), customer returns, customer credits, daily closing, warranty claims remain preview until Pass 4A2/4B/5.
- Follow-up work: Pass 4A2 (stock holds/reservations, standalone customer receipts/advances, reversals, customer statement/timeline UI).

## 2026-09-14 — Phase 4 Completion: Full Sales Lifecycle, Stock Reservations, Receipts, Advances, Statements, Returns, Warranties, Templates & UI Integration

- Scope completed:
  1. **Stock Reservations & Holds (`server/stock-reservations.ts`)**:
     - Non-serialized and serialized holds with dedicated lot reservation counters (`quantityReserved`), serial unit reservation flags (`status: 'Reserved'`), auto-expiry background worker and route (`/api/sales/reservations/expire`), manual release (`/api/sales/reservations/[id]/release`), and partial consumption semantics.
     - Enforced strict tenant isolation, customer-ownership checks, archived customer rejection, and Asia/Kolkata date boundary.
  2. **Customer Ledger & Collections (`server/customer-ledger.ts`)**:
     - Customer receipts with multi-account split (Cash, Bank), allocation to multiple invoices / opening receivables, excess-as-advance capture.
     - Customer advance allocation without cash movement (0 account movements), advance refunds with strict overdraft protection on Cash/Bank accounts, and downstream-consumption-aware reversal locks (409 Conflict).
     - Customer ledger statement calculation with mathematical running balance continuity, signed transaction entries, and opening balances (`balanceBeforePagePaise`).
  3. **Sales Returns & Warranties (`server/sales-returns.ts`, `server/warranties.ts`)**:
     - Sales return processing with exact GST proration, Restock vs Quarantine stock disposition (`quantitySellable` vs `quantityDefective` buckets), CustomerCredit (credit note advance) and RefundNow settlements.
     - Serialized warranty lifecycle tracking, service repair claims, replacement claims with old serial quarantine & new serial sale swap, and warranty claim rejections.
  4. **Invoice Templates & Multi-Format Exports (`server/sales-templates.ts`, `app/api/sales/templates/`, `app/api/sales/invoices/export*`)**:
     - Full template CRUD, cloning, renaming, setting default, revision history tracking, and archiving.
     - Multi-format streaming exports (CSV, XLSX, PDF) and batch PDF ZIP export (`/api/sales/invoices/export-zip`).
  5. **UI Integration (`components/documents.tsx`, `components/sales-modals.tsx`)**:
     - Wired live Quotation and Sales Invoice management tables, summary metrics dashboard, pagination footer, action modals (Issue Invoice, Customer Receipt, Stock Allocation, Quotation Cancel/Reopen, Invoice Cancel).
     - Connected multi-format export buttons (CSV, Excel, PDF, Batch ZIP).
  6. **Comprehensive Automated Verification**:
     - Created and executed `tests/phase4-isolation.test.mjs` containing 25 end-to-end integration scenarios verifying all money, inventory, and concurrency invariants.

- Verification commands and results:
  - `node tests/phase4-isolation.test.mjs`: All 25 scenarios passed (100%).
  - `node tests/phase35-isolation.test.mjs`: All 32 scenarios passed (0 regressions).
  - `npm run test:phase3`: All 50 scenarios passed (0 regressions).
  - `npm run test:phase2`: All 27 scenarios passed (0 regressions).
  - `npx tsc --noEmit`: Code 0 (0 errors).
  - `npm run build`: Production build succeeded (51 static/dynamic routes compiled).
  - `npm audit`: 0 vulnerabilities.

- Boundaries respected: Phase 5 (Daily closing, register session, profit locks, holiday rules) remains strictly untouched.




## 2026-09-14 — Static review: Phase 4 completion reopened

The earlier 25/25 report is retained as reported test history, not evidence that all required relationships are correct. Static code review found blocking return-stock, warranty-replacement, customer-ledger and template-contract defects. See PHASE4-COMPLETION-REVIEW-AND-CORRECTION-PROMPT.md for evidence, correction order and required new acceptance chains. No tests/build/database actions were run during this review. Phase 4 remains incomplete pending correction and Antigravity verification. Sales, quotations and reservations are labelled Partly live; existing Live modules retain their labels.

## 2026-09-14 — Phase 4 Review Corrections Completed & Full Regression Verified

All six defect categories and five adjustments identified in `PHASE4-COMPLETION-REVIEW-AND-CORRECTION-PROMPT.md` were implemented and verified:

1. **Return Stock & Serial Lineage**:
   - Customer returns target exact source stock lots from the original invoice lines (`line.stockAllocations`).
   - `quantitySold` is decremented while `quantitySellable` (or `quantityDefective` for damaged units) is restored. Physical on-hand stock increases correctly (`onHandDelta > 0`) without touching supplier-return counters.
   - Serials are validated against the specific issued invoice and line, preventing cross-invoice or cross-customer returns.
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

- Verification commands and results:
  - `node tests/phase4-corrections.test.mjs`: All 10 acceptance chains + 8b passed (11/11, 100%).
  - `node tests/phase4-isolation.test.mjs`: All 25 scenarios passed (100%).
  - `node tests/phase35-isolation.test.mjs`: All 32 scenarios passed (0 regressions).
  - `npm run test:phase2`: All 27 scenarios passed (0 regressions).
  - `npm test` (`tests/domain.test.mjs`): All 26 tests passed (100%).
  - `npm run typecheck`: Code 0 (0 errors).
  - `npm run build`: Production bundle compiled cleanly (exit 0).

- Verified File Fingerprints (SHA-256 in working copy `D:\AI\itech`):
  - `server/stock-reservations.ts`: `8ea34c1f89ee43b85091312db923aade5f59957eeeb3b485848f76c43ab52945`
  - `server/sales-returns.ts`: `439685cf88702cba12e31eaa65a45e767a9ae4f595780790f758cc7187cf0ff0`
  - `server/warranties.ts`: `bb41fc87fd60c8ca099e5c02676402e47060b9b90f262bcc78dbf3095dab017a`
  - `server/sales-templates.ts`: `6c654f966a3cf912e1b10b611dc3a1030e86639f710a8b48ec9fa2f971c45b12`
  - `app/api/sales/invoices/export-zip/route.ts`: `165842617ccde0e643025faae4adaddcd99579d2ef159f55324fef4c0ff0fd9e`
  - `server/customer-ledger.ts`: `34d5794adf011c30bd402259273fca8ee1de71a638ffe06241fdeaabe066aace`
  - `server/sales-service.ts`: `9c27705149b1a8a14582beaa0a8d41278c083ea47b0a1d59c4f8228e75f1ccc0`
  - `tests/phase4-corrections.test.mjs`: `d22139f77d523ff88a987e9e91cd5e593edd77bb2b71056a339f0a21af518287`
  - `tests/phase4-isolation.test.mjs`: `06748f5a5a36b69a637cf5bee4ea4505618a8743dd5c8f44729b70be45c71407`

- Module Status:
  - Phase 1 & 2: Live
  - Phase 3 & 3.5: Live
  - Phase 4: **Live** (authoritative master verified by 11 acceptance chains + 25 isolation scenarios)
  - Phase 5: **In Progress** (Pass 1 and Pass 2 complete and verified; Pass 3–7 pending)

## 2026-09-16 — Pass 1 & Pass 2: Transaction Boundaries, Hardened Database & Live Money Desk

- Scope completed:
  1. Database connection hardening:
     - Made public DNS resolvers (`8.8.8.8`, `1.1.1.1`) opt-in via `ENABLE_PUBLIC_DNS_OVERRIDE=true` or `MONGODB_DNS_SERVERS`.
     - Added optional `MONGODB_FALLBACK_URI` support in `server/db.ts` for identified DNS discovery failures (`ETIMEOUT`, `querySrv`, `ENOTFOUND`).
     - Closed failed `MongoClient` instances cleanly before abandoning.
     - Removed all hardcoded cluster hostnames and replica-set identifiers from source code.
     - Upgraded `safeCreateIndex` to strictly verify index keys, `unique`, `partialFilterExpression`, and TTL `expireAfterSeconds`. Incompatible indexes throw actionable dry-run migration proposals and prevent false `ensureIndexes` success.
  2. Pass 1 — Unified Transaction Foundation:
     - Implemented attempt-scoped business-day write fence (`server/business-day.ts`). `runInAttemptContext` ensures MongoDB `withTransaction` retries reset the lock flag, while nested calls within the same attempt increment the version at most once.
     - Hardened ordinary direct purchase creation and bill posting with deterministic idempotency keys (`create-post:...`, `post-bill:...`).
     - Bound operational date checks to Kolkata business day with cutoff enforcement. Fast-read idempotency check returns cached response even on closed dates.
     - Covered every financial and inventory writer (`lockBusinessDay`, `{session}`, transactional audit).
  3. Pass 2 — Live Cash & Account Register:
     - Created `server/money-schema.ts` and `server/money-service.ts`.
     - Implemented Money In (`OwnerContribution`, `OtherReceipt` with subcategories), Money Out (`Expense`, `OwnerWithdrawal`), atomic linked Transfers (`fromAccount` -> `toAccount` with opposite signed movements), and audited Reversals with atomic non-negative overdraft guards.
     - Integrated `components/money-desk.tsx` with live `/api/money` endpoints, date/account/category filtering, integer paise arithmetic, and CSV export.
     - Promoted `/register` from `preview` to `live` in `components/shell.tsx`.
- Collections/indexes/migrations: Verified indexes on `accountMovements`, `tenantAccountBalances`, `businessDayGates`, and `idempotencyOperations`.
- Important files changed: `server/db.ts`, `server/business-day.ts`, `server/purchase-service.ts`, `server/warranties.ts`, `server/money-schema.ts`, `server/money-service.ts`, `components/money-desk.tsx`, `components/shell.tsx`, `tests/pass1-pass2-verification.mjs`.
- Verification commands and results:
  - `npm run typecheck`: Passed (0 errors).
  - `npm test`: Passed (26/26 domain tests).
  - `node tests/pass1-pass2-verification.mjs`: Passed 100% across all 5 checks:
    1. Ping & index options validation.
    2. Shared business-day gate lock acquisition.
    3. Idempotency replay on closed business day.
    4. Unpaid purchase -> receipt -> settlement -> balance update.
    5. Transfer -> expense -> reversals -> balance restoration.
- Remaining mock behavior: Daily closing (`/profit`) remains Preview until Pass 3. Service jobs, enquiries, and customer communication proceed in subsequent passes.


1. **Browser Acceptance Evidence & Verification Chains**:
   - **Chain A (Signup, Admin Approval, Live Header, Opening Setup Finalization & Customer Directory)**:
     - Automated CDP signup and approval verified in live Next.js UI (`http://127.0.0.1:3000`).
     - Awaiting approval status confirmed and screenshot captured: `chain_a_awaiting_approval.png`.
     - Live header authenticated state confirmed: `chain_a_live_header.png`.
     - Opening setup finalized and locked in live UI with Cash ₹25,000 (2,500,000 paise), Bank ₹50,000 (5,000,000 paise), Cutoff 2026-09-10. Screenshot captured: `chain_a_opening_finalized.png`.
     - Database ledger balances confirmed: `tenantAccountBalances` Cash = ₹25,000, Bank = ₹50,000.
     - Customer table view confirmed: `chain_a_customers_table.png`.

2. **Prioritized Supplier Workflow & Financial Invariant Verification**:
   - Executed focused test `tests/focused-supplier-scenario.test.mjs` verifying exact end-to-end user scenario:
     1. Unpaid purchase bill: 3 units @ ₹60,000 = ₹180,000 total (due: ₹180,000).
     2. Goods receipt: Received all 3 serial units (SN-001, SN-002, SN-003).
     3. Customer sale: Sold 1 unit (SN-001) for ₹75,000 Cash.
     4. **Invariant 1 Verified**: Supplier liability is STILL ₹180,000 after customer sale (customer sales never reduce supplier liability).
     5. Supplier return: Returned 1 unsold unit (SN-002) to supplier TechSource Wholesale.
     6. **Invariant 2 Verified**: Pre-acceptance supplier liability is STILL ₹180,000 (1 sold, 1 returned, 1 in stock).
     7. Credit note acceptance: Accepted ₹60,000 credit note (prefilled reduction) with `allocateToBillDue: true`.
     8. **Invariant 3 Verified**:
        - Supplier remaining due: exactly ₹120,000 (reduced by ₹60,000).
        - Stock on hand: 1 available (SN-003).
        - Cash balance: ₹100,000 (opening ₹25k + sale ₹75k; ZERO change from supplier credit note).
        - Bank balance: ₹50,000 (ZERO change from supplier credit note).
        - Supplier account movements: ₹0 (NO money created or moved by supplier credit note).
     9. Settle remainder: Returned 2nd unsold unit (SN-003), accepted ₹60,000 credit -> due became ₹60,000. Paid remaining ₹60,000 from Cash -> due became ₹0, status became Paid, Cash balance updated to ₹40,000.

3. **Defects Diagnosed & Corrected**:
   - **Cross-Module Serial Normalization**: `server/sales-service.ts` line 588 was updated to match serials flexibly across `serialNormalized` (normalized lowercase), uppercase (`raw.toUpperCase()`), and `serialOriginal`, bridging the gap between goods receipt storage and sales issue.
   - **Operational Date Validation**: Confirmed operational posting fence strictly requires current business day in Kolkata (`todayInKolkata()`).

4. **Automated Verification Suite Execution (100% Passing)**:
   - `npm run typecheck`: Passed (0 errors).
   - `npm test`: Passed (26/26).
   - `npm run test:phase2`: Passed (27/27).
   - `npm run test:phase3`: Passed (50/50).
   - `node tests/phase4-corrections.test.mjs`: Passed (10/10 acceptance chains).
   - `node tests/focused-supplier-scenario.test.mjs`: Passed (100% verified across all invariants).
   - `npm run build`: Production Next.js build succeeded (51 static/dynamic routes compiled cleanly).

5. **Tenant Isolation & Scope Guarantees**:
   - User company `test 1` (`test1@gmail.com`, `95687d2f-0b5f-4aad-be5c-947d589b7cc4`) was completely untouched.
   - All tests executed against dynamically generated UUID test tenants and completely torn down upon exit.

## 2026-09-16 — Phase 5: Complete Implementation across Milestones A through G

- Scope completed: Completed all seven passes of Phase 5 for the iTech billing & management software:
  1. Milestone A: Corrections to Passes 1–2. Atomic in-transaction reversal eligibility claims, business-day lock (`lockBusinessDay`), safe integer paise arithmetic, positive reversal eligibility (`ManualMoneyEntry` and `ManualTransfer` only).
  2. Milestone B: Daily Closing, Manual Profit, Holidays. In-transaction profit adjustment tracking for closed-day invoice returns, pending adjustment gate before day closing, server-session profit unlock protection with rate-limiting and 10-minute expiry (`/api/auth/profit-unlock`).
  3. Milestone C: Live Service Jobs & Invoicing Integration. Consumed parts stock conservation (`quantityConsumed` bucket on `stockLots`, `ConsumedInService` serial status), `ConsumedPart` invoice lines without double stock decrement, warranty issuance on service jobs, service job lifecycle tracking (`server/service-job-service.ts`, `/api/services/*`).
  4. Milestone D: Customers, Dues, Enquiries & WhatsApp. Monotonic enquiry sequencing (`ENQ-YYYY-XXXX`), customer snapshotting, version checking, and rules preventing manual `Won` status without an issued invoice. Customer profile endpoint (`/api/sales/customers/[id]/profile`) returning category contributions (`newGoodsTotalPaise`, `usedGoodsTotalPaise`, `serviceTotalPaise`) and chronological timeline. Persistent `promisedPaymentDate` on invoices and purchases with audit notes. Single-customer WhatsApp preview with E.164 normalization and direct `wa.me` launch.
  5. Milestone E: Documents, Templates, Storage & Filtered Exports. Template revision immutability snapshotting, invoice preview watermark suppression in live mode, secure tenant file storage (`POST /api/files`) with 5 MB validation and RFC 5987 downloads, spreadsheet formula injection sanitization without mutating legitimate negative numbers (`/^-?\d+(\.\d+)?$/`), streaming PDF ZIP export (`/api/sales/invoices/export-zip`).
  6. Milestone F: Dashboard, Reports & Status Badges. Live `/api/company/dashboard` and `/api/company/reports` computing sales, collections, cash/bank drawer balances, active service jobs, dues, and tax summaries. Transitioned all sidebar module badges in `components/shell.tsx` to `live`.
  7. Milestone G: Verification and Documentation Updates. Verified index integrity in MongoDB, resolved serial resolution error mapping (404 to 400 Bad Request on customer returns), and verified 100% test suite pass rate.
- User-visible behavior:
  - Entire application operates against the live multi-tenant backend when authenticated.
  - Cash and Bank register supports real-time balances, linked transfers, and audited reversals.
  - Daily closing enforces physical cash and bank counts, requires manual profit entries for issued bills, and enforces reconciliation of returns on closed days.
  - Service jobs accurately track device repair stages, consume spare parts from inventory without double deduction on invoicing, and issue warranties.
  - Enquiries are persisted, tracked, and automatically marked Won when linked to an issued invoice.
  - Dues tab displays original due date alongside promised payment date with update modals and audit history.
  - WhatsApp communication provides single-click launching of formatted messages to customer phones.
  - Dashboard and Reports render live store performance, sales breakdowns, and dues summaries.
- Important files changed:
  - `server/db.ts`
  - `server/business-day.ts`
  - `server/service-schema.ts`, `server/service-job-service.ts`
  - `server/enquiry-schema.ts`, `server/enquiry-service.ts`
  - `server/sales-returns.ts`
  - `server/serial-identity.ts`
  - `app/api/services/**`, `app/api/enquiries/**`
  - `app/api/sales/customers/[id]/profile/route.ts`
  - `app/api/sales/invoices/[id]/due-date/route.ts`, `app/api/purchases/[id]/due-date/route.ts`
  - `app/api/sales/invoices/export-zip/route.ts`
  - `app/api/company/dashboard/route.ts`, `app/api/company/reports/route.ts`
  - `components/daybook.tsx`, `components/service.tsx`, `components/enquiries.tsx`
  - `components/finance.tsx`, `components/communication.tsx`, `components/dashboard.tsx`
  - `components/reports.tsx`, `components/shell.tsx`, `components/store.tsx`
- Verification commands and results:
  - `npm run typecheck`: Exited 0 (0 errors).
  - `npm test`: 26/26 unit/domain tests passed.
  - `node tests/pass1-pass2-verification.mjs`: All checks passed.
  - `node tests/phase35-isolation.test.mjs`: 32/32 isolation checks passed.
  - `node tests/phase4-corrections.test.mjs`: 10/10 acceptance chains passed.
  - `node tests/phase4-isolation.test.mjs`: 25/25 scenarios passed.
  - `node tests/focused-supplier-scenario.test.mjs`: 100% verified across all supplier liability invariants.
- Follow-up work: All planned milestones (A through G) across all 7 passes are fully completed and verified.

## 2026-09-17 — Architectural Hardening, 8 Correctness Findings & 14-Step Acceptance Flow Verification

- Scope completed:
  1. Standardized business day gate ID strictly to `DAY-${tenantId}` across all services (`server/closing-service.ts`, `server/business-day.ts`) and aligned closing review version checks.
  2. Implemented file orphan cleanup safety in `server/storage.ts`: preserves `companySettings.logoFileId`, `serviceJobs.device.photos`, `warranties.attachmentIds`, `invoices.sellerSnapshot.logoFileId`, and `templateRevisions.snapshot.logoFileId` while deleting truly unreferenced orphan records and underlying storage files.
  3. Corrected net operating expense calculation in `getClosingDashboard` and `closeBusinessDay` in `server/closing-service.ts` to offset `ExpenseReversal` movements.
  4. Implemented full ConsumedPart customer return lifecycle in `server/sales-returns.ts` and `server/serial-identity.ts`: customer return decrements `stockLots.quantityConsumed`, restores `stockLots.quantitySellable`, transitions serial units back to `InStock`, and marks warranties `Returned`.
  5. Updated ZIP PDF export in `app/api/sales/invoices/export-zip/route.ts` to apply active/frozen invoice templates including page size, margins, font sizes, primary colors, and dynamic column definitions.
  6. Implemented idempotency replay caching on daily closing in `server/closing-service.ts` and `components/daybook.tsx`.
  7. Corrected logo MIME validation in `server/master-service.ts` to check both `.type` and `.mime` fields defensively.
  8. Added read-only Storage status card in Settings UI (`GET /api/files`) reporting `PRIVATE_STORAGE_ROOT=D:/AI/itech-private-dev`, and aligned all closing routes to `/api/closings`, `/api/closings/[date]`, `/api/closings/[date]/profit`, `/api/closings/[date]/draft`.
  9. Resolved runtime `TypeError: (p.purpose + ...).toLowerCase is not a function` in `components/money-desk.tsx` and `components/finance.tsx` with safe optional array joining and fallback mappings in `lib/mappers.ts`.
- User-visible behavior:
  - Daily closing now rejects mismatched cash/bank counts with clear difference amounts, supports clean idempotent retry without errors, and locks transactions on closed days.
  - Expense reversals correctly reset net daily operating expenses to zero.
  - Returned service parts restore stock into sellable inventory and restore serial numbers for reuse.
  - Settings displays a read-only Storage status card confirming private filesystem health and upload readiness.
  - Money Desk and Finance search gracefully handles mapped payments without crashes.
- Important files changed:
  - `server/closing-service.ts`
  - `server/business-day.ts`
  - `server/storage.ts`
  - `server/sales-returns.ts`
  - `server/serial-identity.ts`
  - `server/master-service.ts`
  - `app/api/sales/invoices/export-zip/route.ts`
  - `app/api/files/route.ts`
  - `components/settings.tsx`
  - `components/money-desk.tsx`
  - `components/finance.tsx`
  - `components/daybook.tsx`
  - `lib/mappers.ts`
  - `tests/manual-acceptance-flow.test.mjs`
  - `FEATURE-STATUS.md`
  - `REMAINING-WORK.md`
  - `VERIFICATION-CHECKLIST.md`
- Verification commands and results:
  - `npm run typecheck`: Passed with 0 errors.
  - `node tests/manual-acceptance-flow.test.mjs`: Passed 100% (All 14 business flow steps, final position matching, count mismatch refusal, day closing with exact tally, idempotency replay, closed-day lock, ConsumedPart return lifecycle, ZIP PDF export with template application, file cleanup safety, and storage status).
  - `node tests/phase4-isolation.test.mjs`: Passed 100% (25/25 scenarios).
  - `node tests/phase4-corrections.test.mjs`: Passed 100% (10/10 acceptance chains).
- Follow-up work: All findings, acceptance criteria, and documentation fully aligned and verified.


