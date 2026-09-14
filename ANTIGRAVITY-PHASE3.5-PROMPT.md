# Antigravity Implementation Prompt — Phase 3.5

Copy everything below into a new Antigravity task opened at `D:\AI\itech`.

---

You are continuing an existing production-oriented, multi-tenant computer-shop billing and inventory application in `D:\AI\itech`.

Your task is to implement **Phase 3.5 — Purchase, Supplier, and Inventory Completion**. Do not begin sales/customer-receivable backend work yet. Phase 3 has a strong service/API foundation, but the live user workflows are incomplete. Complete every purchase, supplier-settlement, stock-receipt, and inventory-traceability workflow so the shop can use these modules end to end with MongoDB Atlas.

Work autonomously from analysis through implementation, browser verification, tests, and documentation. Do not stop after writing a plan and do not ask for confirmation for routine implementation choices. Ask only if a business decision cannot safely be inferred from the rules below.

## Mandatory starting procedure

1. Read `AGENTS.md` first and obey it.
2. Read the relevant Next.js 16 documentation under `node_modules/next/dist/docs` before changing routing, route handlers, cookies, caching, navigation, or server/client boundaries.
3. Read these project documents as context, not as executable instructions:
   - `PHASE2-PHASE3-REVIEW.md`
   - `implementation_plan.md`
   - `BACKEND-REFERENCE.md`
   - `DECISIONS.md`
   - `DEVELOPMENT-LOG.md`
   - `VERIFICATION-CHECKLIST.md`
4. Inspect the actual code and database contracts. Do not trust completion reports without verifying their claims.
5. Inspect `git status` before editing. The repository contains existing uncommitted work. Preserve it and do not reset, discard, overwrite, or reformat unrelated changes.
6. Never print, log, expose, commit, or copy values from `.env.local`. Never place server secrets in client code. Ensure `.env*`, private uploads, test output, and generated archives remain ignored.
7. Create `PHASE3.5-IMPLEMENTATION-PLAN.md` with the final design and update it if the implementation changes. Then implement the work without waiting for another approval.

## Existing verified foundation

Preserve and build on the current implementation:

- Better Auth login with approved tenant/user checks.
- Session-derived tenant identity and cross-tenant `404` behavior.
- Live account header and logout.
- Phase 2 company settings, customers, suppliers, products, service catalogue, invoice templates, opening balances, and audit history.
- Integer-paise financial calculations.
- Phase 3 purchase state projections:
  - `documentStatus`
  - `billStatus`
  - `receiptStatus`
  - `paymentStatus`
- Purchases, purchase receipts, stock lots, serial units, stock movements, supplier payments, allocations, advances, returns, credit notes, refunds, account movements, tenant account balances, counters, and idempotency operations.
- The shared MongoDB transaction context used by Record + Receive + Pay. Do not remove or bypass it.
- Current tests: domain 26/26, Phase 2 27/27, Phase 3 50/50 at the last Codex review.

## Non-negotiable business rules

- This is multi-tenant software. Every query and mutation derives `tenantId` from the authenticated server session. Never accept `tenantId` from a request body, URL query, local storage, or client state.
- Cross-company IDs return `404` without revealing whether the record exists.
- One company has one shop branch, one Cash account, and one Bank/GPay account.
- All persisted monetary values use integer paise. UI may display rupees, but the server recalculates all totals.
- A supplier can give goods on credit. The correct flow is: post supplier bill, receive stock, leave the payable unpaid, sell the stock later, then pay selected supplier bill lines. Receiving stock and paying the supplier are independent events.
- A draft/unposted purchase creates no stock, payable, or account movement.
- Posting a supplier bill creates a payable but no stock or account movement.
- Receiving stock creates stock lots, serial units where required, and signed stock movements, but no payment.
- Supplier payment reduces Cash or Bank and selected supplier liabilities. It must never change physical stock.
- Cash and Bank overdrafts remain blocked.
- Purchase and Inventory remain separate sidebar modules because a purchase is a supplier document/financial workflow while inventory is the current physical stock position. They must be deeply linked through purchase, receipt, line, lot, movement, and serial references.
- Display supplier settlement against stock as **Supplier settlement: Unpaid / Partly paid / Paid** at the purchase-line or lot-source level. Do not falsely claim that an individual unit is paid when only a line has a partial payment allocation.
- Prices support GST inclusive and GST exclusive entry. Intra-state uses CGST + SGST; inter-state uses IGST only. Discounts apply before tax. The server is authoritative.
- Posted financial facts are immutable. Correct them with returns, credit notes, refunds, allocations, or reversals. Never silently edit history.
- Records are retained and archived where applicable; do not hard-delete business records.
- No barcode scanning, label printing, multi-branch stock, payroll, e-commerce synchronization, GST filing, mobile app, or offline operation.

## Known incomplete areas that must be fixed

Do not mark Phase 3.5 complete until all are addressed:

1. Purchase screens currently depend heavily on a bootstrap list and local filtering. They do not provide complete server pagination, direct record loading, or all live lifecycle history.
2. The draft update API exists but the live UI does not provide a correct edit-and-save workflow using `version` optimistic concurrency.
3. Purchase detail does not fully render receipts, allocations, payments, returns, credit notes, advances, refunds, and reversal history from live endpoints.
4. Existing supplier-return, credit-note, advance, allocation, refund, and reversal APIs have little or no usable UI.
5. The generic Returns page is still preview-oriented and must not mutate browser-only state for live supplier returns.
6. The existing Phase 3 test’s defective-stock scenario manipulates MongoDB directly. Implement a tenant-safe audited API and UI for marking received stock/serials defective or restoring an eligible defective item to sellable stock.
7. Product inventory screens do not provide a complete lot/serial/movement trail or clearly show which supplier purchase line created each stock quantity.
8. Live supplier profiles do not yet provide a complete reconciled statement, opening payable settlement, advance balance, return credit, and refund workflow.
9. Purchase attachment upload and viewing are not fully connected.
10. Purchase line charges such as freight or handling are supported in the backend contract but need a clear UI.
11. Live purchase export and reporting are incomplete. Current generic client CSV behavior must not be presented as a complete server-backed report.
12. Live empty arrays must remain empty. Never fall back to sample purchases, payments, stock, statements, or histories after login.

## Required implementation

### A. Live purchase list

Create a production-ready `/purchases` experience using server endpoints.

- Server pagination with bounded page size, total count, current page, and total pages.
- Search by internal ID, displayed purchase number, supplier name, and supplier invoice number.
- Filters for supplier, order/invoice date range, `documentStatus`, `billStatus`, `receiptStatus`, `paymentStatus`, and `hasDue`.
- Summary cards driven by `/api/purchases/summary`, not the current page:
  - posted purchase value
  - unpaid/partly-paid supplier due
  - unposted drafts/orders
  - awaiting receipt
  - partly received
  - available supplier credits
- Clicking summary cards applies the relevant filter.
- Each row shows separate document, bill, receipt, and payment badges. Do not collapse them into one ambiguous status.
- Show total, paid/allocated, credited, and remaining due from server-calculated paise fields.
- Keep filters in URL search parameters when practical so refresh/back navigation preserves them.
- Add live CSV and Excel export for the selected filters. PDF may be a formatted purchase-summary report. Exports must use the complete filtered server dataset, enforce a safe maximum, sanitize spreadsheet cells beginning with `=`, `+`, `-`, or `@`, and include company/date/filter metadata.

### B. Create and edit purchases

Complete `/purchases/new` and draft editing.

- Modes:
  1. Save draft purchase order.
  2. Post supplier bill now without receiving or paying.
  3. Record + Receive for a posted unpaid purchase.
  4. Record + Receive + Pay using the existing atomic shortcut only when all required data is present.
- Never label posting as receiving.
- Product lines select live active products and snapshot name, HSN, condition, serial-tracking mode, cost, GST, and supplier context.
- Support custom purchase charge lines for freight, handling, delivery, and other service/charge descriptions with SAC, rate, discount, and GST.
- Correct inclusive/exclusive GST calculations, percentage/fixed line discounts, CGST/SGST versus IGST, place of supply, and totals.
- Support supplier invoice number/date, order date, due date, notes, and a private bill image/PDF attachment.
- Validate the attachment belongs to the current tenant.
- Draft edit uses `PUT /api/purchases/[id]` with the exact loaded `version`.
- On `409`, do not overwrite. Explain that the draft changed elsewhere and provide Reload latest and Cancel options.
- Posted financial data is read-only.
- Archive/inactive suppliers or products cannot be selected for new lines; historical snapshots remain readable.
- Prevent duplicate products only if the rule is intentional. If the same product needs different rate, tax, condition, or batch details, allow separate lines with clear labels.
- A direct URL to a purchase not in the first page must load through `GET /api/purchases/[id]`.

### C. Stock receipt workflow

Build a dedicated receipt form for posted purchases.

- Load the purchase directly from the server.
- For each product line show ordered, previously received, cancelled, returned, and remaining receivable quantity.
- Default receive quantity to the remaining quantity but allow partial receipt and zero for lines not received today.
- Serialized products require exactly one normalized, non-empty, unique serial per received unit. Show duplicate rows immediately but rely on the server for final enforcement.
- Quantity products do not ask for serials.
- Prevent over-receipt and receipt after `Received` or `ClosedPartlyReceived`.
- Every submission uses a stable client-generated idempotency key that is retained while retrying the same payload. Generate a new key only after success or a deliberate payload change.
- Show receipt result and link back to purchase, product, lot, and supplier.
- Add receipt history to purchase detail, including receipt number/date, quantities, serials, notes, and stock movement references.
- Remainder closure must clearly explain that received stock remains and financial liability does not change automatically.

### D. Inventory stock position and traceability

Extend the live Inventory module with server-backed stock views.

- Product list shows:
  - total on hand
  - sellable
  - reserved (zero until reservations become live)
  - defective/quarantined
  - available
  - reorder level and low-stock status
- Product detail tabs:
  - Overview
  - Stock lots
  - Serial units
  - Stock movements
  - Purchase sources
  - Audit history
- Stock lots show opening/purchase source, supplier, purchase number, purchase line, receipt, original quantity, sellable quantity, defective quantity, returned quantity, unit cost, received date, and settlement status of the linked purchase line.
- Serial units show original serial, normalized serial, product, lot, supplier, purchase/receipt, current status, received date, and later sale/reservation/warranty references when those phases exist.
- Stock movements are immutable signed events with reason, reference, date, actor, and resulting traceability.
- Add bounded, tenant-safe, paginated APIs for lots, serials, and movements. Avoid sending unbounded arrays through bootstrap.
- Stock totals shown in product list/detail must reconcile to stock-lot and serial-unit data. Do not maintain an independent writable stock counter that can drift.

### E. Defective and quarantined stock

Implement the missing real workflow that the test currently simulates with direct database writes.

- Add an audited transactional endpoint and UI to move eligible received quantity/serials from Sellable to Defective.
- Add an audited transactional endpoint and UI to restore eligible defective quantity/serials to Sellable when inspection passes.
- Validate tenant, product, lot, quantity, current serial status, and available bucket quantities.
- Quantity changes, serial status changes, and signed stock movement(s) must commit atomically.
- An item already sold, returned, reserved, or otherwise unavailable cannot be moved.
- Duplicate requests use idempotency and payload mismatch returns `409`.
- Defective stock is excluded from sellable/available inventory but remains visible and eligible for supplier return.
- Replace the direct MongoDB mutation in the Phase 3 integration test with calls to these public endpoints.

### F. Supplier payments and opening payables

Build a clear settlement workspace from supplier profile and purchase detail.

- Show posted purchase lines with original total, payment allocations, accepted credits, and remaining due.
- Include Phase 2 opening payables as separate selectable rows.
- Allow full, partial, multi-line, and multi-bill allocations in one payment.
- Support split payment between Cash and Bank/GPay and methods Cash, UPI/GPay, Bank transfer, and Cheque. Map every method to the single Cash or Bank account correctly.
- Show available Cash and Bank balance before confirmation. Block amounts that would overdraw either account.
- The payment amount must equal selected allocation plus explicitly approved excess advance.
- Excess requires an explicit `Record excess as supplier advance` choice and a clear preview.
- Use a stable idempotency key across retry.
- After success, update purchase rows, supplier profile, supplier statement, available account balances, and advances without a full-page reload when reasonable.
- Do not create a supplier payable from an unposted draft.

### G. Supplier advances, credits, refunds, and reversals

Create usable screens for every existing Phase 3 operation.

- Supplier profile tabs:
  - Overview
  - Purchases
  - Payables
  - Payments
  - Advances & credits
  - Returns
  - Statement
  - Activity timeline
- Advances list shows source, original, allocated, refunded, remaining, and status.
- Allow explicit allocation of an advance to selected posted purchase lines/opening payables.
- Allow recording an actual supplier refund into Cash or Bank from the authoritative remaining advance.
- Supplier return form selects the exact purchase, purchase line, stock lot, quantity, and serials. It must show sellable/defective eligibility and use server-calculated return value.
- Returning stock and receiving supplier credit are separate events. A return can wait for the supplier’s credit note.
- Credit-note acceptance supports the supplier credit note number/date, accepted amount, direct liability allocation where allowed, and excess into `supplierAdvances`.
- Support financial-only credit notes without fake stock movement.
- Provide reversal actions for payments, allocations, credit notes, and refunds with mandatory reason, dependency checks, warning text, and audit trail.
- Reversal buttons must be hidden or disabled when not legally valid, but the server remains authoritative.
- Never silently apply a paid-line return credit to another unpaid line.

### H. Supplier statement and account visibility

- Render the existing reconciled supplier statement in the supplier profile.
- Show opening payable, posted bills, payments, allocations, credit notes, advances, refunds, and reversals in chronological order.
- Show and verify: `statement balance = gross outstanding payables - available supplier credits`.
- Provide date filtering, running balance, source links, and sanitized CSV/Excel export.
- Add a read-only Phase 3 Cash and Bank balance card using `tenantAccountBalances` and the account reconciliation endpoint.
- Clearly state that full cash-register/manual money-in/expense/transfer/daily-closing persistence belongs to a later phase. Do not make those preview forms write to Phase 3 collections accidentally.

### I. Live/demo boundaries and UX

- In authenticated live mode, never mix demo transactions into purchase, inventory, supplier, statement, return, payment, or account views.
- In unauthenticated demo mode, preserve the current browser-only prototype.
- Update sidebar badges and contextual banners accurately:
  - Purchases: Live
  - Inventory: Live for stock/master data after this phase
  - Suppliers: Live for master data and supplier financial history after this phase
  - Supplier returns: Live; customer returns remain Preview until the sales phase
- If one route contains both live supplier returns and preview customer returns, split the UI or clearly disable the unimplemented side in live mode.
- Use simple labels understandable to a shop operator. Keep advanced accounting wording in help text.
- Provide loading, empty, error, retry, disabled, and success states.
- Prevent double submission while a request is in flight.
- Dialogs support Escape, focus management, and accessible labels.
- Mobile/tablet layouts must remain usable, but this remains a desktop-first shop application.

## Required API and backend review

Reuse correct existing endpoints. Add or amend endpoints only where needed. At minimum review:

- `/api/purchases`
- `/api/purchases/[id]`
- `/api/purchases/[id]/post`
- `/api/purchases/[id]/receive`
- `/api/purchases/[id]/receipts`
- `/api/purchases/[id]/close-remainder`
- `/api/purchases/[id]/cancel`
- `/api/purchases/payments`
- `/api/purchases/payments/opening`
- `/api/purchases/payments/[id]/reverse`
- `/api/purchases/returns`
- `/api/purchases/returns/[id]/accept`
- `/api/purchases/credit-notes`
- `/api/purchases/credit-notes/[id]/reverse`
- `/api/purchases/advances`
- `/api/purchases/advances/[id]/allocate`
- `/api/purchases/allocations/[id]/reverse`
- `/api/purchases/refunds`
- `/api/purchases/refunds/[id]/reverse`
- `/api/purchases/summary`
- `/api/purchases/export`
- `/api/purchases/reconciliation/accounts`
- `/api/suppliers/[id]/statement`

Add stock-lot, serial-unit, stock-movement, quarantine, and restore endpoints with consistent naming. Document every new endpoint in `BACKEND-REFERENCE.md`.

All mutation endpoints must enforce:

- authenticated approved identity
- session-derived tenant scope
- origin/CSRF protection
- strict Zod body schemas
- body and array size limits
- tenant-owned referenced records
- current Asia/Kolkata business date and opening-cutoff rules where applicable
- integer paise and server totals
- transaction boundaries
- idempotency for money/stock-changing operations
- optimistic concurrency where records are editable
- sanitized append-only audit entries
- safe error status: 400 validation/business rule, 401 unauthenticated, 403 approval/permission, 404 missing or cross-tenant, 409 concurrency/idempotency conflict

## Database and indexing requirements

Review indexes in `server/db.ts`. Add only indexes justified by the final query patterns. Include tenant prefix on operational indexes. Ensure uniqueness for tenant display numbers, supplier bill scope, and tenant serial normalization. Add pagination-supporting indexes for:

- purchase list filters and dates
- supplier purchase/payable history
- receipt history
- stock lots by product/purchase/receipt
- serial units by product/lot/status/normalized serial
- stock movements by product/date/reference
- advances/credits/refunds by supplier/date/status
- statement event source lookups

Do not use an unbounded aggregation or return more than the documented limit.

## Tests and verification

Use Antigravity for all testing. Do not claim completion from type-check/build alone.

Extend the automated integration suite with isolated tenants and exact cleanup. Cover at least:

1. Live session identifies correct user/company and logout invalidates the session.
2. Purchase list pagination, filters, summary, direct page-2 detail, and cross-tenant 404.
3. Draft create/edit with exact version and stale-version 409.
4. Draft has zero stock/payable/account effects.
5. Bill posting creates payable only.
6. Inclusive/exclusive GST, fixed/percentage discounts, charge lines, CGST/SGST, and IGST.
7. Attachment ownership and cross-tenant rejection.
8. Partial and full receipt with stable idempotent retry.
9. Serialized count, normalization, duplicate-in-payload, duplicate-in-tenant, and same serial allowed in another tenant only if that is the approved unique scope.
10. Over-receipt and receipt-after-close rejection.
11. Quarantine and restore through public API with atomic lot/serial/movement assertions.
12. Defective stock excluded from sellable stock.
13. Supplier return from sellable and defective buckets.
14. Return cannot exceed eligible lot quantity and cannot reuse returned serials.
15. Payment against selected purchase lines and opening payable.
16. Split Cash/Bank payment and overdraft rollback.
17. Explicit excess advance and no-consent rejection.
18. Advance allocation and refund concurrency guards.
19. Credit note direct allocation and excess-credit advance.
20. Financial-only credit note creates zero stock movement.
21. All reversal dependency rules and exact ledger restoration.
22. Failed Record + Receive + Pay leaves no purchase, receipt, lot, serial, stock movement, payment, allocation, account movement, counter inconsistency, or audit artifact except an intentionally designed failure record.
23. Supplier statement equation and running balance.
24. Product stock totals reconcile to lots, serials, and signed movements.
25. Live zero-record tenant displays empty states and never demo records.
26. Export respects tenant/filter/limits and spreadsheet-injection sanitization.

Run:

```powershell
npm run typecheck
npm test
npm run test:phase2
npm run test:phase3
npm run build
npm audit
```

Also complete a browser walkthrough of the full workflow using a temporary approved tenant. Do not use or expose a real customer’s credentials. Clean all test records and temporary private files afterward.

## Documentation and completion output

Update:

- `PHASE3.5-IMPLEMENTATION-PLAN.md`
- `BACKEND-REFERENCE.md`
- `DECISIONS.md` for new business decisions only
- `DEVELOPMENT-LOG.md`
- `VERIFICATION-CHECKLIST.md`
- `README.md` only where setup/scripts changed

At completion provide:

1. Exact features implemented.
2. Collections/indexes/endpoints added or changed.
3. Relationship and transaction-boundary explanation.
4. UI routes completed and their live/demo status.
5. Test commands and exact pass counts.
6. Browser flows verified.
7. Any remaining limitations or deferred Phase 4 work.
8. Confirmation that test records/files were cleaned.
9. A list of files changed.

Do not state that the full application is complete. Completion means Phase 3.5 purchase, supplier, and inventory workflows are production-ready. The next planned phase after approval is **Phase 4 — Quotations, Sales Invoices, Customer Receivables, Stock Reservation, Warranty Creation, and Customer Returns**.