# FINANCIAL-INVARIANTS.md: System Financial, Stock, and Ledger Invariants

**Enforcement Policy:** Every invariant documented here has an explicit verification status:
- **`[VERIFIED]`**: Enforced in code and covered by verified automated tests or live browser chains.
- **`[IMPLEMENTED]`**: Written in codebase; pending full integration gate verification.
- **`[REQUIRED]`**: Target invariant required for production correctness, to be implemented and verified in the current sequence.

---

## 1. Single Authoritative Money Ledger

1. **Two Accounts Only `[VERIFIED]`:** Exactly two money accounts exist: `Cash` and `Bank`.
   - Evidence: Verified in Phase 2 isolation tests (`tests/phase2-isolation.test.mjs`, Check 14) and `server/account-initialization.ts`.
2. **GPay / UPI Identity `[VERIFIED]`:** GPay, PhonePe, and UPI payments are payment methods flowing into the `Bank` account. GPay is **never** a third balance or separate ledger counter.
   - Evidence: Verified in `server/customer-ledger.ts` (components mapping) and `server/purchase-service.ts`.
3. **Dual-Format Historical Movement Compatibility `[VERIFIED]`:**
   - Canonical representation for new writes is signed integer paise in `qty` (+ for inflow, - for outflow).
   - Historical entries with legacy `{ amountPaise, direction: 'In' | 'Out' }` are decoded and verified through `signedAccountMovementPaise(movement)` in `server/account-initialization.ts`.
   - Reconciliations must decode both formats without silently dropping legacy records or counting dual-format records twice.
   - Conflicting or malformed historical amounts require an explicit reconciliation error (HTTP 409), not a guessed value.
   - Evidence: Verified in `tests/phase4-corrections.test.mjs` (Check 8b) and `ACCOUNT-INITIALIZATION-FIX.md`.
4. **Authoritative Balance Projections `[VERIFIED]`:**
   - `tenantAccountBalances` stores `{ account: 'Cash' | 'Bank', balancePaise: number, version: number }`.
   - Running balance must equal the sum of historical movements decoded via `signedAccountMovementPaise`.
   - Normal operations never overwrite `balancePaise` directly; balances update via atomic `$inc` with non-negative lower bounds (`$gte: Math.max(0, -amount)`).
   - Evidence: `tests/phase3-isolation.test.mjs` (Check 44, 45, 46).
5. **Strict No-Overdraft Invariant `[VERIFIED]`:**
   - Cash balance cannot fall below zero: `balancePaise: { $gte: amountPaise }`.
   - Bank balance cannot fall below zero: `balancePaise: { $gte: amountPaise }`.
   - Evidence: `tests/phase3-isolation.test.mjs` (Check 43) and D-019/D-020 in `DECISIONS.md`.
6. **Atomic Account Transfers `[REQUIRED]`:**
   - A Cash $\leftrightarrow$ Bank transfer atomically creates two equal and opposite `accountMovements` (one debit, one credit) in a single transaction.
   - A transfer is neither income nor expense; it creates zero profit/loss and zero change to combined funds (`Cash + Bank`).
   - Categorized by structured field `sourceType: 'Transfer'` (not text-matching reason strings).
7. **Money In vs. Money Out vs. Allocations `[REQUIRED]`:**
   - **Customer Collections** move money into Cash/Bank via `recordCustomerReceipt` and generate `accountMovements`. Subsequent allocations of that receipt to invoices settle dues without moving money again.
   - **Customer Advances** allocated to invoices settle dues and create **no** new cash/bank movements.
   - **Supplier Payments** disburse money from Cash/Bank and generate outgoing `accountMovements`. Allocation to purchase bills settles payable liability without moving money again.
   - **Other Receipts** (non-customer) move money into Cash/Bank and are reported separately from invoice sales and trading profit.
   - Generic money entries cannot bypass customer or supplier ledgers.

---

## 2. Supplier Liabilities, Stock, and Settlements

1. **Liability Timing `[VERIFIED]`:** Supplier bill liability begins **strictly** when `billStatus === 'Posted'`. Unposted drafts and confirmed purchase orders create **zero** payable liability.
   - Evidence: Verified in `tests/phase3-isolation.test.mjs` (Check 3, 5, 7).
2. **Independence of Stock and Payment `[VERIFIED]`:**
   - Receiving goods (`quantityReceived`) increases stock on hand and sellable stock. It does **not** move money.
   - Disbursing supplier payment settles liability. It does **not** alter stock quantities.
   - Selling received stock before paying the supplier is fully supported. Customer sales do not reduce supplier payable liability.
   - Evidence: Verified in `tests/focused-supplier-scenario.test.mjs` (Invariants 1 & 2).
3. **No Unwarranted Unit Allocations `[VERIFIED]`:** A partly paid purchase bill tracks payments at the line/bill amount level. Individual physical units or serials are never represented as "paid" units unless an explicit per-unit contract exists.
4. **Supplier Returns Stock Impact `[VERIFIED]`:**
   - Returning sellable goods reduces `stockLots.quantitySellable` and `quantityRemaining`.
   - Returning defective goods reduces `stockLots.quantityDefective`. Defective units can be returned even when sellable stock is zero.
   - Returning goods creates a negative `stockMovements` entry and transitions serials to `ReturnedToSupplier`.
   - Returning goods does **not** move money.
   - Evidence: Verified in `tests/phase3-isolation.test.mjs` (Check 18, 20).
5. **Supplier Credit Note vs. Cash Refund `[VERIFIED]`:**
   - Accepting a supplier credit note reduces payable liability on the returned bill line; excess credit creates `supplierAdvances`. It creates **zero** account movements.
   - An actual supplier refund is a separate, explicit cash/bank receipt linked to an open advance in `supplierAdvances`, creating an incoming `accountMovement`.
   - Evidence: Verified in `tests/focused-supplier-scenario.test.mjs` (Invariant 3).

---

## 3. Customer Receivables, Invoicing, and Returns

1. **Receivable Timing `[VERIFIED]`:** Customer receivable liability is created when an invoice transitions to `Issued`. Drafts create zero receivable and zero stock reduction.
   - Evidence: Verified in `tests/phase4-isolation.test.mjs` (Check 4).
2. **Customer Returns Stock and Due Offset `[VERIFIED]`:**
   - Returning customer goods restores physical stock: sellable items restore `quantitySellable`, defective items restore `quantityDefective`. Serials transition back to `InStock` or `Defective`.
   - Returned credit is applied first as `ReturnCredit` against any unpaid due on that specific invoice.
   - Any remaining credit becomes a customer advance (`customerAdvances`) or an authorized cash refund.
   - Evidence: Verified in `tests/phase4-corrections.test.mjs` (Chain 3) and `server/sales-returns.ts`.
3. **Customer Credit Limit `[VERIFIED]`:**
   - When `creditLimitPaise > 0`, $\text{outstanding invoices} + \text{opening receivables} + \text{new invoice due} \le \text{creditLimitPaise}$, unless an explicit override reason is recorded.
   - Evidence: Verified in `tests/phase4-isolation.test.mjs` (Check 8).

---

## 4. Daily Closing, Profit, and Business Day Fence

1. **Shared Business-Day Write Fence `[REQUIRED]`:**
   - Every operational transaction that writes financial movements or stock must acquire the shared business-day lock on `businessDayGates` (`DAY-${tenantId}`).
   - Operations dated on or before `businessDayGates.closedThrough` are rejected with HTTP 409 (`Business day is closed. Post a correction on the next open day`).
   - Idempotency replay check executes before the closed-day rejection so completed requests return cached responses even after day closure.
2. **Manual Trading Profit Definition `[REQUIRED]`:**
   - Staff/owner enters manual profit beside each issued sale and service bill.
   - Blank profit means **Pending**. Zero (`0`) and negative amounts are valid entries.
   - **Trading Profit** = $\sum \text{manually entered bill profits} + \sum \text{applicable signed current-day profit adjustments}$.
   - **Net Shop Profit** = Trading Profit $-$ Operating Expenses.
   - Supplier payments, stock purchases, transfers, and owner withdrawals are **never** deducted from manual trading profit.
3. **Profit Adjustments for Returns and Reversals `[REQUIRED]`:**
   - **Before Closing:** A return or reversal invalidates the unclosed invoice profit entry in the same transaction, requiring staff review before closing.
   - **After Closing:** The closed day's profit total is permanently immutable. A current-day profit adjustment (`manualProfitAdjustments`) is recorded with:
     - `invoiceId`, `returnId` / `reversalId`, `date` (current business day), signed `amountPaise`, `reason`, `actorId`.
   - Prevents duplicate adjustments for the same triggering event.
4. **Reconciliation and Closing Tally `[REQUIRED]`:**
   - Actual physical cash count and bank statement count must match ledger balances.
   - The system **never** creates an automatic balancing expense or income entry to force a tally.
   - Dates must be closed in strict chronological order. Balances carry forward to the next business day.
5. **Holidays `[REQUIRED]`:**
   - A day with posted transactions cannot be closed as an inactive holiday.
   - Inactive holidays preserve balances and carry them forward. Future scheduled holidays can be edited or cancelled before closing.

---

## 5. Service-Part Stock Accounting and Invoicing Invariants

1. **Service Part Consumption `[REQUIRED]`:**
   - Issuing a stocked part to a service job decrements sellable stock from `stockLots` (`quantitySellable -= qty`) and increments `stockLots.quantityConsumed += qty`.
   - Serial units transition to `ConsumedInService`.
   - Inserts `stockMovements` with `reason: 'Service job part consumption'`, `reference: jobId`, `sourceType: 'ServiceJob'`, `sourceId: jobId`.
   - Lot conservation holds: $\sum \text{buckets} \equiv \text{quantityReceived}$.
2. **Service Invoicing Without Double Decrement `[REQUIRED]`:**
   - Service invoice lines represent labor/repair as `lineType: 'Service'`.
   - Consumed parts on service invoices are represented as `lineType: 'ConsumedPart'` (or `ServicePart`), referencing `serviceJobId` and `partId`.
   - Invoicing validates ownership and billable status (`isBilled === false`), setting `isBilled: true, invoiceId: invoice._id`.
   - Invoicing does **not** decrement stock or serials a second time.
3. **Audited Service Part Reversal `[REQUIRED]`:**
   - Consumed parts not yet billed can be reversed back to inventory via an explicit audited action (`reverseServicePartConsumption`).
   - Restores stock lot: `quantityConsumed -= qty`, and `quantitySellable += qty` (or `quantityDefective += qty` based on condition).
   - Reverses serial transition. Cannot delete a consumed part silently.
