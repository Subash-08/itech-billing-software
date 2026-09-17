# Definitive 7-Pass Implementation Plan: Live Business Completion

**Repository:** `D:\AI\itech`  
**Working Branch:** `main`  
**Status:** Authorized for Routine Execution

---

## 1. Architectural Foundations & Correction Notes

1. **Shortcut Session Propagation:**
   - Source inspection confirms `server/purchase-service.ts` uses `purchaseTransaction = new AsyncLocalStorage<ClientSession>()`.
   - `createPurchase` line 251 already calls `purchaseTransaction.getStore()`.
   - Nested shortcuts (`recordReceiveShortcut`, `recordReceiveAndPayShortcut`) run inside `executeIdempotentTransaction`, which initializes `purchaseTransaction.run(session, ...)`.
   - Nested operations therefore already execute within that transaction. We will preserve this mechanism rather than introducing competing transaction abstractions.
   - Direct purchase creation (`POST /api/purchases` with `postImmediately: true`) and optional-idempotency fallbacks in `postPurchaseBill`, `confirmPurchaseOrder`, `cancelPurchase`, `closePurchaseRemainder` run without `session` and will be strictly wrapped in transactions.
2. **Financial Flows & Money Invariance:**
   - **Receipts move money:** `customerReceipts` generate `accountMovements` (In).
   - **Allocations settle dues:** `customerAllocations` reduce invoice `duePaise`; they create **zero** cash/bank movements.
   - **Advance allocations create no new money movements:** Applying an advance to an invoice settles dues without moving cash.
   - **Supplier payments move money:** Disbursing a payment generates `accountMovements` (Out). Subsequent line allocations settle bill liability without moving money twice.
   - **Returns vs. Refunds:** Accepted supplier return credit reduces bill liability or creates `supplierAdvances`; an actual cash refund is an explicit separate financial receipt into `Cash` or `Bank`.
   - **Dual-format compatibility:** Historical ledger decoding preserves `signedAccountMovementPaise` support for both signed `qty` and legacy `amountPaise`/`direction`.
3. **Return Stock Impact:**
   - Returning sellable goods reduces `stockLots.quantitySellable`.
   - Returning defective goods reduces `stockLots.quantityDefective`.
   - Customer returns can restore goods as sellable or defective based on condition.
4. **Service-Part Stock & Billing Architecture:**
   - Stock lots introduce an explicit `quantityConsumed` bucket so lot conservation holds:
     $$\text{quantityReceived} \equiv \text{quantitySellable} + \text{quantityReserved} + \text{quantityDefective} + \text{quantitySold} + \text{quantityReturned} + \text{quantityRemoved} + \text{quantityConsumed}$$
   - Serial units transition to `ConsumedInService`.
   - `SaleLineInputSchema` adds `lineType: 'ConsumedPart'` (or `ServicePart`) for Service invoices (`invoiceKind: 'Service'`), referencing `serviceJobId` and `partId`.
   - Invoicing validates ownership and billable status without decrementing stock a second time.
   - Audited reversal (`reverseServicePartConsumption`) returns consumed parts to sellable or defective inventory.

---

## 2. Seven-Pass Execution Plan

---

### PASS 1 — Finish Existing Transaction Foundation

**Objective:** Ensure every operational write to inventory, purchases, sales, and money executes inside a MongoDB transaction, covered by the shared business-day write fence.

1. **Shared Business-Day Write Fence (`server/business-day.ts`):**
   - Create `server/business-day.ts` exporting `lockBusinessDay(db, session, tenantId, allowClosed)`.
   - Operates on collection `businessDayGates` (`_id: "DAY-${tenantId}"`).
   - Uses an `AsyncLocalStorage` or transaction-level flag so that nested calls within a single transaction increment version only once.
   - Enforces `todayInKolkata() > gate.closedThrough` for new operational postings.
   - Idempotency check occurs before closed-day rejection so network retries of completed requests succeed.
2. **Direct Purchase Creation Hardening (`server/purchase-service.ts`):**
   - In `app/api/purchases/route.ts`, wrap direct calls to `createPurchase` with `postImmediately: true` inside `executeIdempotentTransaction`.
   - Update `createPurchase` to acquire `lockBusinessDay`.
3. **Optional-Idempotency Fallback Elimination (`server/purchase-service.ts`):**
   - In `postPurchaseBill`, remove the `if (!input.idempotencyKey) return fn()` fallback. Ensure execution always runs within a transaction (`executeIdempotentTransaction` or `session.withTransaction`).
   - Pass `session` to `recordAudit` across all mutating purchase functions.
   - Ensure `confirmPurchaseOrder`, `cancelPurchase`, `closePurchaseRemainder` execute transactionally.
4. **Integration with Operational Writers:**
   - Integrate `lockBusinessDay` in `server/sales-posting.ts` (`assertSalePostingDay`).
   - Integrate `lockBusinessDay` in `server/master-service.ts` (`adjustProductStock`).
   - Integrate `lockBusinessDay` in `server/stock-reservations.ts` (`createReservation`, `releaseReservation`).
   - Integrate `lockBusinessDay` in `server/warranties.ts` (`claimWarranty`).
   - Integrate `lockBusinessDay` in `server/sales-returns.ts` (`recordCustomerReturn`).

---

### PASS 2 — Live Cash & Account Register

**Objective:** Connect the cash and bank register to authoritative database movements, supporting pagination, filters, transfers, and audited reversals.

1. **Money Management Schema & Service (`server/money-schema.ts`, `server/money-service.ts`):**
   - Schemas for `MoneyEntrySchema`, `ReverseMoneySchema`, `RegisterQuerySchema`.
   - Validate integer paise ranges ($\le \text{₹50 crore}$) and calendar dates.
   - Methods:
     - `recordMoney`: Operating expenses, owner contributions, owner withdrawals, and cash $\leftrightarrow$ bank transfers. Updates `tenantAccountBalances` atomically and inserts `accountMovements`.
     - `reverseMoney`: Audited reversal of a manual money entry with balance sufficiency checks.
     - `getRegister`: Server-paginated query of `accountMovements` with date, account, and search filters.
2. **API Routes:**
   - `app/api/money/route.ts` (`GET` register list, `POST` record money).
   - `app/api/money/[id]/reverse/route.ts` (`POST` reverse money entry).
3. **UI Connection (`components/money-desk.tsx`, `components/store.tsx`):**
   - Replace demo `state.payments` with live `fetchRegisterApi`.
   - Implement distinct modal actions:
     - "+ Money in": Customer collection (delegates to `recordCustomerReceiptApi`), Owner contribution, Other receipt.
     - "− Money out": Operating expense, Supplier settlement (delegates to `SupplierSettlement`), Owner withdrawal.
     - "Cash ↔ account": Atomic transfer between Cash and Bank with structured `sourceType: 'Transfer'`.
   - Show Opening Cash/Bank, Money Received/Paid, and Expected Closing.
   - Support audited reversal with confirmation dialog.

---

### PASS 3 — Daily Closing, Profit, and Holidays

**Objective:** Implement authoritative day reconciliation, manual profit entry, profit adjustments, holiday management, and server-side profit protection.

1. **Daily Closing Schema & Service (`server/closing-schema.ts`, `server/closing-service.ts`):**
   - Schemas: `ProfitEntrySchema`, `CloseDaySchema`, `HolidaySchema`.
   - `getClosing`: Reads historical figures (or immutable closing checkpoint), issued bills for manual profit entry, reconciliation discrepancies, and closing status. Excludes protected profit fields if not unlocked.
   - `listClosings`: Paginated list of closed days.
   - `saveProfit`: Records manual profit per issued bill in `manualProfits`.
   - `closeBusinessDay`: Reconciles actual physical Cash and Bank counts against ledger figures; verifies all issued bills have entered profit; advances `businessDayGates.closedThrough`.
   - `saveReconciliationDraft`: Persists in-progress cash count, bank reconciliation, and notes so reload/failure does not discard user input.
   - `manualProfitAdjustments`: Records linked current-day adjustments for returns or reversals on closed-day invoices.
   - Holiday scheduling: List, add, and remove shop holidays (`listHolidays`, `addHoliday`, `removeHoliday`).
2. **API Routes:**
   - `app/api/closings/route.ts` (`GET` list).
   - `app/api/closings/[date]/route.ts` (`GET` details).
   - `app/api/closings/[date]/profit/route.ts` (`POST` save bill profit).
   - `app/api/closings/[date]/draft/route.ts` (`POST` save reconciliation draft).
   - `app/api/closings/[date]/close/route.ts` (`POST` reconcile and close).
   - `app/api/holidays/route.ts` (`GET`, `POST`, `DELETE`).
3. **Server-Side Profit Protection (`components/profit-access.tsx`, `server/auth.ts`):**
   - Connect UI to existing `POST /api/auth/profit-unlock` with rate-limiting and session-bound `profitUntil`.
   - Remove hardcoded `ProfitDemo2026!` password from live mode.
   - Server strips protected totals (`manualProfitPaise`, `netProfitPaise`) from responses when profit is locked.
4. **UI Connection (`components/daybook.tsx`):**
   - Connect daybook to live closing endpoints.
   - Support manual profit inputs for every issued invoice.
   - Display Cash and Bank variance reconciliation against counted physical funds.
   - Enforce chronological day closing and carrying forward of balances.

---

### PASS 4 — Live Service Jobs

**Objective:** Implement complete database-backed workshop management with parts consumption, lot conservation, and service billing.

1. **Service Schemas & Stock Conservation (`server/service-schema.ts`):**
   - Schemas for service intake, status progression, parts consumption, and service billing.
   - Add `quantityConsumed` bucket on `stockLots` and `ConsumedInService` status on `serialUnits`.
   - Support `lineType: 'ConsumedPart'` in `server/sales-schema.ts` for Service invoices (`invoiceKind: 'Service'`).
2. **Service Job Service (`server/service-job-service.ts`):**
   - Intake: Customer lookup/creation, device brand/model/serial, problem, condition, free-text accessories, intake photos, estimate.
   - State machine: `Received` $\rightarrow$ `Diagnosis` $\rightarrow$ `Awaiting approval` $\rightarrow$ `In progress` $\rightarrow$ `Ready for collection` $\rightarrow$ `Delivered`.
   - Parts consumption: Issues stocked part from `stockLots`, sets serial to `ConsumedInService`, inserts `stockMovements` (`sourceType: 'ServiceJob'`).
   - Audited reversal: `reverseServicePartConsumption` restores part to sellable or defective inventory.
   - Billing: Generates service invoice linking service charge lines and consumed part lines without double-decrementing stock.
3. **API Routes:**
   - `app/api/services/route.ts` (`GET` list, `POST` intake).
   - `app/api/services/[id]/route.ts` (`GET` detail, `PATCH` update).
   - `app/api/services/[id]/parts/route.ts` (`POST` issue part).
   - `app/api/services/[id]/parts/[partId]/reverse/route.ts` (`POST` reverse consumed part).
   - `app/api/services/[id]/invoice/route.ts` (`POST` create service invoice).
4. **UI Connection (`components/service.tsx`):**
   - Replace demo state with live API methods in `components/store.tsx`.
   - Support intake, estimate revision history, technician assignment, parts issuance/reversal, and invoice creation.

---

### PASS 5 — Customers, Enquiries, Dues, and WhatsApp

**Objective:** Harden customer records, enable persistent promised payment dates, build database-backed enquiries, and connect single-customer WhatsApp preview.

1. **Customer Master Hardening (`server/master-service.ts`, `server/master-schema.ts`):**
   - Mandatory phone number validation on create/edit.
   - Normalized phone search.
   - Tenant-unique GSTIN validation.
   - Paginated customer activity timeline (sales, receipts, service jobs, returns, promised date changes).
2. **Persistent Dues Dates (`server/sales-service.ts`, `server/purchase-service.ts`):**
   - Create `PATCH /api/sales/invoices/[id]/due-date` and `PATCH /api/purchases/[id]/due-date` to record `promisedPaymentDate` separately from the original `dueDate`, with version check and audit log.
   - Wire `components/finance.tsx` Dues tab to call persistent endpoints instead of local `setState`.
3. **Enquiries Backend & UI (`server/enquiry-schema.ts`, `server/enquiry-service.ts`):**
   - CRUD endpoints: `app/api/enquiries/route.ts`, `app/api/enquiries/[id]/route.ts`.
   - Connect `components/enquiries.tsx` to live backend.
   - Closing an enquiry requires a linked completed sale (draft invoice does not close enquiry).
4. **WhatsApp Single-Customer Preview (`components/communication.tsx`):**
   - Editable message preview populated with customer name, device/bill details, and balances.
   - Direct "Open in WhatsApp" button using `https://wa.me/<phone>?text=<encodedMessage>`.
   - Remove mock bulk campaigns and simulated delivery tracking.

---

### PASS 6 — Documents, Storage, and Exports

**Objective:** Finalize invoice templates, document library, and secure filtered exports.

1. **Invoice Templates (`components/templates.tsx`, `server/sales-templates.ts`):**
   - Column visibility and field toggles.
   - Bill-to and Ship-to configuration.
   - Immutable template revision snapshot at invoice issue time.
2. **Document Library & Storage (`components/library.tsx`, `server/storage.ts`):**
   - Connect `components/library.tsx` to authoritative file records and uploads.
   - Verify tenant isolation, MIME checks, and download security.
3. **Export Integrity:**
   - Respect active date and search filters in CSV, XLSX, and PDF exports.
   - Sanitize spreadsheet formula prefixes (`=`, `+`, `-`, `@`) without mutating legitimate negative monetary amounts.
   - Filtered invoice PDF ZIP export (`/api/sales/invoices/export-zip`).
   - Require profit unlock for profit export endpoints.

---

### PASS 7 — Dashboard, Reports, and Live Labels

**Objective:** Connect live analytics and reports, update navigation classifications, and execute end-to-end verification.

1. **Dashboard & Reports Backend:**
   - `app/api/company/dashboard/route.ts`: Live sales, customer collections, outstanding dues, supplier dues, cash/bank balances, and service job counts.
   - `app/api/company/reports/route.ts`: Categorized sales, collections, expenses, and returns without double counting.
2. **UI Connection:**
   - Wire `components/dashboard.tsx` and `components/reports.tsx` to live backend.
3. **Sidebar Classification Updates (`components/shell.tsx`):**
   - Transition `/register`, `/profit`, `/services`, `/enquiries`, `/documents`, `/communication` to `live`.
   - Transition `/`, `/customers`, `/dues`, `/reports` to `live`.
4. **Verification & Regression:**
   - Run typecheck and focused integration tests per pass.
   - Execute broad regression gate at milestone.

---

## 3. Verification Plan

### Automated Tests
1. **Typecheck:**
   ```bash
   npm run typecheck
   ```
2. **Domain Automated Tests:**
   ```bash
   npm test
   ```
3. **Focused Integration Tests:**
   - Concurrency & business-day lock: `node tests/focused-lock-scenario.test.mjs`
   - Supplier partial payment and return scenario: `node tests/focused-supplier-scenario.test.mjs`
   - Phase 4 sales & returns corrections: `node tests/phase4-corrections.test.mjs`
4. **Integration Regression Gate:**
   - `npm run test:phase2`
   - `npm run test:phase3`
   - `node tests/phase35-isolation.test.mjs`
   - `node tests/phase4-isolation.test.mjs`

### Manual & Acceptance Chains
- **Chain A:** Unpaid purchase $\rightarrow$ receive stock $\rightarrow$ sell $\rightarrow$ collect $\rightarrow$ supplier payment.
- **Chain B:** Partly paid purchase $\rightarrow$ partly sold $\rightarrow$ supplier return $\rightarrow$ accepted credit.
- **Chain C:** Partial customer collection $\rightarrow$ return $\rightarrow$ due offset $\rightarrow$ credit/refund.
- **Chain D:** Cash/Bank transfer $\rightarrow$ expense $\rightarrow$ reversal $\rightarrow$ reconciled balances.
- **Chain E:** Concurrent payment and daily closing $\rightarrow$ exactly one consistent outcome.
- **Chain F:** Closed-day correction $\rightarrow$ current-day adjustment $\rightarrow$ preserved old totals.
- **Chain G:** Service intake $\rightarrow$ parts consumption $\rightarrow$ service invoice $\rightarrow$ payment $\rightarrow$ delivery.
- **Chain H:** Template/logo changes $\rightarrow$ issued snapshot $\rightarrow$ print/PDF/ZIP.
- **Chain I:** Cross-tenant guessed IDs $\rightarrow$ 404 response / no data exposure.
