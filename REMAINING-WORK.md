# REMAINING-WORK.md: Detailed Execution Checklist Across All 7 Passes

**Audit & Plan Date:** 2026-09-16  
**Status:** All 7 Passes Complete and Authoritatively Verified (Milestones A through G)

---

## Pass 1 — Transaction Foundation Hardening (Milestone A)

- [x] **Transaction Writer Hardening:**
  - Audited all writers against the coverage matrix in `FEATURE-STATUS.md`.
  - In `server/purchase-service.ts`:
    - Wrapped `createPurchase` when called directly with `postImmediately: true` inside a mandatory transaction (`executeIdempotentTransaction`) with deterministic idempotency key.
    - Added deterministic idempotency key fallback for `postPurchaseBill` (`post-bill:...`).
    - Enforced transactional execution across all operational endpoints.
- [x] **Shared Business-Day Write Fence (`server/business-day.ts`):**
  - Implemented `lockBusinessDay(db, session, tenantId, allowClosed)` on `businessDayGates`.
  - Handled nested transaction calls cleanly via an attempt-scoped `AsyncLocalStorage` (`runInAttemptContext`) so the version increments only once per top-level transaction attempt, while MongoDB `withTransaction` retries cleanly re-acquire the lock on subsequent attempts.
  - Integrated `lockBusinessDay` into all operational endpoints across sales, purchases, stock, warranties, and cash register.
- [x] **Focused Concurrency & Lock Tests:**
  - Integration suite in `tests/pass1-pass2-verification.mjs` verifying transaction rollback, business day lock, and idempotency replays on closed days passed 100%.

---

## Pass 2 — Live Cash & Account Register (Milestone A)

- [x] **Money Management Service:**
  - Implemented `server/money-schema.ts` and `server/money-service.ts`.
  - Maintained compatibility with `signedAccountMovementPaise` for legacy dual-format entries.
  - Methods: `recordMoneyIn`, `recordMoneyOut`, `recordTransfer`, `reverseMoneyMovement`, `getAccountRegister`.
  - Strictly supported two accounts: `Cash` and `Bank`. UPI/GPay flows into `Bank`.
  - Structured fields for transfers (`category: 'Transfer'`), creating two linked opposite movements in one atomic transaction.
  - Full support for `OtherReceipt` with subcategories (ScrapSale, OldAssetSale, etc.).
  - Atomic non-negative balance overdraft guards on all disbursements.
- [x] **Money API Routes:**
  - `app/api/money/route.ts` (`GET` register with pagination/filters/balances, `POST` record money in/out/transfer).
  - `app/api/money/[id]/reverse/route.ts` (`POST` reverse money entry).
- [x] **Connect `components/money-desk.tsx`:**
  - Replaced `useStore().state.payments` with live `fetchRegister` against `/api/money`.
  - Wired modals: "+ Money in", "− Money out", "Cash ↔ account" transfer.
  - Customer collections delegate to existing customer receipt services.
  - Supplier settlements delegate to existing supplier settlement modal (`SupplierSettlement`).
  - Supported date picker, account filter, category filter, search, pagination, loading, error, and empty states.
  - Supported audited reversals for manual money entries.
  - Promoted `/register` from `preview` to `live` in `components/shell.tsx`.

---

## Pass 3 — Daily Closing, Profit, and Holidays (Milestone B)

- [x] **Daily Closing Backend & Service:**
  - Implemented `server/closing-service.ts` and `server/business-day.ts` (`closeBusinessDay`, `saveDayProfit`, `getClosingDashboard`, `saveHoliday`, `removeHoliday`).
  - Endpoints:
    - `/api/closings` (GET history list)
    - `/api/closings/[date]` (GET date dashboard, POST atomic day closure)
    - `/api/closings/[date]/profit` (POST manual profit entry per invoice)
    - `/api/closings/[date]/draft` (POST save draft count)
    - `/api/company/holidays` (GET list, POST add, DELETE remove)
- [x] **Profit Adjustments for Closed Days:**
  - Implemented `manualProfitAdjustments` model and API:
    - Automatically records pending current-day adjustment for returns affecting closed-day invoices.
    - Pre-closing: invalidates unclosed invoice profit review to require re-entry before closing.
    - Blocks closing if any pending profit adjustments exist for the business date.
- [x] **Profit Protection & Server Unlock:**
  - Removed hardcoded `ProfitDemo2026!` from `components/profit-access.tsx`.
  - Connected UI to `POST /api/auth/profit-unlock` with rate limiting and session-bound 10-minute expiry.
  - Protected totals: omit aggregate profit numbers in API responses when profit is locked.
- [x] **Connect `components/daybook.tsx`:**
  - Connected to live closing endpoints.
  - Supported manual profit inputs for every issued invoice.
  - Real-time Cash and Bank variance reconciliation against physical counts.
  - Enforced chronological day closing and carrying forward of balances.

---

## Pass 4 — Live Service Jobs (Milestone C)

- [x] **Service-Part Stock Accounting Architecture:**
  - Lot conservation: added `quantityConsumed` bucket on `stockLots`.
  - Serial status: transitioned to `ConsumedInService`.
  - Supported `lineType: 'ConsumedPart'` in `server/sales-schema.ts` for service invoices (`invoiceKind: 'Service'`), referencing `serviceJobId` and `partId`.
  - Invoicing validates ownership and billable status without double-decrementing stock.
  - Audited reversal: `POST /api/services/[id]/parts/[partId]/reverse` restores stock lot and serials to sellable or defective.
- [x] **Service Jobs Backend:**
  - Implemented `server/service-schema.ts` and `server/service-job-service.ts`.
  - State machine: `Received` $\rightarrow$ `Diagnosis` $\rightarrow$ `Awaiting approval` $\rightarrow$ `In progress` $\rightarrow$ `Ready for collection` $\rightarrow$ `Delivered`.
  - API routes: `app/api/services/route.ts`, `app/api/services/[id]/route.ts`, `app/api/services/[id]/parts/route.ts`, `app/api/services/[id]/parts/[partId]/reverse/route.ts`, `app/api/services/[id]/invoice/route.ts`.
- [x] **Connect `components/service.tsx`:**
  - Wired to live API methods in `components/store.tsx`.
  - Supported intake form, estimate revisions/approval, technician assignment, parts selection, photo attachments, delivery notes, and service invoice generation.

---

## Pass 5 — Customers, Enquiries, Dues, and WhatsApp (Milestone D)

- [x] **Customer Master Hardening:**
  - Mandatory phone number validation on create/update.
  - Normalized phone search.
  - Tenant-unique GSTIN validation.
  - Customer profile endpoint `/api/sales/customers/[id]/profile` returning category contributions (`newGoodsTotalPaise`, `usedGoodsTotalPaise`, `serviceTotalPaise`), financial summaries, and paginated chronological timeline.
- [x] **Persistent Promised Payment Dates (Dues):**
  - Created `PATCH /api/sales/invoices/[id]/due-date` and `PATCH /api/purchases/[id]/due-date`.
  - Wired `components/finance.tsx` Dues tab to call persistent endpoints with version checking and audit notes.
- [x] **Enquiries Backend & UI:**
  - Implemented `server/enquiry-schema.ts` and `server/enquiry-service.ts`.
  - Monotonic sequencing (`ENQ-YYYY-XXXX`), customer snapshotting, version checking, and rules preventing manual `Won` status without an issued invoice.
  - API routes: `app/api/enquiries/route.ts`, `app/api/enquiries/[id]/route.ts`.
  - Connected `components/enquiries.tsx` to live backend with pagination.
- [x] **WhatsApp & Communication:**
  - Updated `components/communication.tsx` to display an editable message preview for an individual customer.
  - Provided direct "Open in WhatsApp" button (`https://wa.me/<phone>?text=...`) for manual staff review and sending.
  - Removed mock bulk campaigns and fake delivery tracking.

---

## Pass 6 — Documents, Storage, and Filtered Exports (Milestone E)

- [x] **Invoice Templates:**
  - Added field visibility and product table column toggles in `components/templates.tsx`.
  - Supported Bill-to and Ship-to configuration.
  - Enforced template revision snapshots on issued invoices.
- [x] **Document Library & Storage:**
  - Connected `components/library.tsx` to `/api/files` and authoritative records.
  - Validated MIME types, magic bytes, tenant ownership, 5 MB limit, and private access.
- [x] **Export Integrity:**
  - Honored active filters in CSV, XLSX, and PDF exports.
  - Sanitized spreadsheet formulas (`=`, `+`, `-`, `@`) without mutating negative monetary numbers (`/^-?\d+(\.\d+)?$/`).
  - Created filtered invoice PDF ZIP export (`/api/sales/invoices/export-zip`) with 500-invoice guard and manifest.
  - Required profit unlock for profit export endpoints.

---

## Pass 7 — Dashboard, Reports, and Live Shell (Milestones F & G)

- [x] **Live Dashboard & Reports Backend:**
  - Created `app/api/company/dashboard/route.ts` computing live sales, collections, customer dues, supplier dues, cash/bank drawer balances, active service jobs, and low stock count.
  - Created `app/api/company/reports/route.ts` computing category-level sales, collections, expenses, and returns without double counting.
- [x] **Connect Dashboard & Reports UI:**
  - Connected `components/dashboard.tsx` and `components/reports.tsx` to live APIs with demo fallback.
- [x] **Sidebar Navigation Badges:**
  - Updated `components/shell.tsx`: transitioned all routes (`/`, `/customers`, `/enquiries`, `/sales`, `/quotations`, `/documents`, `/templates`, `/services`, `/inventory`, `/purchases`, `/suppliers`, `/reservations`, `/returns`, `/warranty`, `/register`, `/dues`, `/profit`, `/reports`, `/communication`, `/settings`, `/account`) to `live`.
- [x] **End-to-End Verification:**
  - `npm run typecheck`: Passed (0 errors).
  - `npm test`: Passed (26/26 domain tests).
  - `node tests/pass1-pass2-verification.mjs`: Passed (All checks passed).
  - `node tests/phase35-isolation.test.mjs`: Passed (32/32 tests passed).
  - `node tests/phase4-corrections.test.mjs`: Passed (10/10 acceptance chains passed).
  - `node tests/phase4-isolation.test.mjs`: Passed (25/25 scenarios passed).
  - `node tests/focused-supplier-scenario.test.mjs`: Passed (100% verified).

---

## Pass 8 — Architectural Hardening & 14-Step Acceptance Flow Verification

- [x] **Finding 1: Unified Gate ID & Closing Concurrency:**
  - Standardized business day gate ID strictly to `DAY-${tenantId}` across all services (`server/closing-service.ts`, `server/business-day.ts`).
  - Aligned closing review version check to prevent split-brain updates while preserving atomic concurrency.
- [x] **Finding 2: File Orphan Cleanup Safety:**
  - Preserves referenced assets: `companySettings.logoFileId`, `serviceJobs.device.photos`, `warranties.attachmentIds`, `invoices.sellerSnapshot.logoFileId`, `templateRevisions.snapshot.logoFileId`.
  - Deletes truly unreferenced orphan records and storage files safely.
- [x] **Finding 3: ExpenseReversal Offset in Closing Dashboard:**
  - Net operating expenses in `getClosingDashboard` and `closeBusinessDay` correctly account for `ExpenseReversal` movements, ensuring closed positions match live ledger balances.
- [x] **Finding 4: ConsumedPart Customer Return Lifecycle:**
  - Implemented return lifecycle in `server/sales-returns.ts` and `server/serial-identity.ts`:
  - Customer return of a `ConsumedPart` line decrements `stockLots.quantityConsumed`, restores `stockLots.quantitySellable`, transitions serials from `ConsumedInService` back to `InStock`, and marks linked warranties as `Returned`.
- [x] **Finding 5: ZIP PDF Export Template Application:**
  - `app/api/sales/invoices/export-zip/route.ts` applies active/frozen invoice templates including page size, margins, font sizes, primary colors, and dynamic column definitions.
- [x] **Finding 6: Closing Idempotency Replay:**
  - Daily closing retry with identical idempotency key returns cached 200 replay response rather than 409 or duplicate gate increment.
- [x] **Finding 7: Logo MIME Validation:**
  - Logo upload validation in `server/master-service.ts` checks both `.type` and `.mime` fields defensively.
- [x] **Finding 8: Storage Status & Route Alignment:**
  - Read-only Storage status card added to Settings UI (`GET /api/files`) reporting `PRIVATE_STORAGE_ROOT=D:/AI/itech-private-dev`.
  - Route documentation updated across project documentation.
- [x] **Full 14-Step Business Scenario & Acceptance Flow Verification:**
  - Suite: `node tests/manual-acceptance-flow.test.mjs`
  - All 14 steps passed:
    - Step 1: Customer & supplier creation and reload search.
    - Step 2: Serialized product creation with 0 initial stock.
    - Step 3: Finalize opening balances (Cash ₹20,000, Bank ₹1,00,000).
    - Step 4: Purchase 3 laptops on credit (Supplier due ₹1,80,000, cash/bank unchanged, stock 0).
    - Step 5: Receive 3 serialized laptops (`TEST-LAP-001`, `002`, `003`), stock 3.
    - Step 6: Invoice serial `001` at ₹70,000, split receipt (Cash ₹20,000, UPI ₹30,000, customer due ₹20,000).
    - Step 7: Return unsold serial `002` to supplier (stock 1, supplier due ₹1,80,000).
    - Step 8: Accept supplier credit ₹60,000 (supplier due ₹1,20,000, bill reduction).
    - Step 9: Pay supplier ₹50,000 from Bank (supplier due ₹70,000, Bank ₹80,000, Cash ₹40,000).
    - Step 10: Collect customer ₹20,000 via UPI (customer due ₹0, Bank ₹1,00,000).
    - Step 11: Transfer ₹10,000 Cash -> Bank (Cash ₹30,000, Bank ₹1,10,000, combined ₹1,40,000).
    - Step 12: Record expense ₹2,000 from Cash (Cash ₹28,000, Bank ₹1,10,000).
    - Step 13: Reverse expense (Cash ₹30,000, Bank ₹1,10,000, net operating expense 0).
    - Step 14: Manual invoice profit entry ₹10,000 (Trading profit ₹10,000, net shop profit ₹10,000).
    - Final position 100% matched: stock 1 (serial 003 InStock, 001 Sold, 002 Returned), customer due ₹0, supplier due ₹70,000, Cash ₹30,000, Bank ₹1,10,000.
    - Daily closing refusal on mismatched counts (400 Bad Request with diff details).
    - Daily closing success with exact tally (Gate version incremented, closedThrough set).
    - Idempotency replay on closing retry (200 cached response).
    - Closed-day transaction lock (409 Conflict).
    - ConsumedPart customer return lifecycle verified.
    - ZIP PDF export with template rendering verified.
    - File cleanup safety and storage status verified.
