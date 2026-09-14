# Phase 4 status, stock-hold core and Antigravity continuation

## Review result

The restored sales-service.ts retains the earlier key safeguards: transactional advance consumption through sales-posting.ts, exact sellable stock checks, normalized serial handling, issue snapshots, and versioned draft update/cancellation. The invoice `[id]` route actually has GET, PUT and DELETE; the completion report omitted the latter methods.

However, the claimed 109 checks are 27 + 50 + 32 from Phases 2, 3 and 3.5. They are not Phase 4 behavioral verification. Static searches found no issueInvoice, /api/sales or settleInvoiceOnIssue coverage in `tests`, no Phase 4 test file, and no `/api/sales` wiring in `components`. Therefore Pass 4A1 is not yet verified as a complete live workflow. Compilation and old-phase regressions are useful but do not demonstrate correct sale/receipt transactions.

This pass performs static review and complex backend implementation only. No tests, typecheck, build, browser actions, migrations or database mutations were executed. Do not infer verified production readiness from these code changes.

## Complex code added here

New `server/stock-reservations.ts` contains:

- `createStockReservation(db, identity, input)`: tenant-safe/idempotent atomic hold creation; active customer/product and exact lot checks; optional same-customer open quotation reference; stock/serial movement and audit.
- `consumeStockReservation(db, identity, session, input)`: internal primitive called ONLY within invoice issue's transaction. Validates exact customer/product/lot/hold/serial ownership, expiry and remaining quantity; handles partial/full fulfilment. No separate endpoint should expose this function.
- `releaseStockReservation(db, identity, input)`: releases the remaining hold, with expected version and idempotency key. No implicit refund or invoice cancellation.
- `expireStockReservation(db, identity, id)`: idempotent expiry worker primitive. Expiry is after the entire `expiresAt` date in Asia/Kolkata. This function exists, but the scheduler/API adapters are not implemented here.

`sales-schema.ts` accepts `reservationId` on each stock allocation; duplicate allocation validation now uses lot + reservation identity. `sales-service.ts` routes held allocations through the new primitive and ordinary allocations through the existing sellable-stock path. Both remain in the same issue transaction as receipts, advance allocation, warranty and audit.

No routes, pages or live badges were added for reservations in this pass. Antigravity owns these straightforward integration tasks and verification.

## Data contract and invariants

One hold identifies one customer, product and lot. Multiple holds can be selected on an invoice, including different holds in the same lot. The UI may group these into a simple “Stock holds” workflow rather than exposing technical allocation objects.

New hold fields:

```
schemaVersion: 1
version: integer
status: Active | Fulfilled | Released | Expired
quantity: original held quantity
remainingQuantity: still reserved
consumedQuantity: already sold through invoices
releasedQuantity: returned to available stock
isSerialTracked: boolean
serials: original serial display values
remainingSerials: normalized serial identities still held
customerId, productId, lotId, reservedAt, expiresAt, quotationId?, notes
```

`quantity = remainingQuantity + consumedQuantity + releasedQuantity`. Closed holds have no remaining quantity. Partial consumption keeps status Active until its remainder is sold, released or expired. Release/expiry retains consumption history; do not represent a partly consumed then expired hold as if none was sold.

| Action | Sellable / quantityRemaining | Reserved | Sold | On hand | Cash/Bank |
|---|---:|---:|---:|---:|---:|
| Create hold N | -N | +N | 0 | 0 | 0 |
| Sell N from hold | 0 | -N | +N | -N | Only actual payment |
| Release/expire remainder N | +N | -N | 0 | 0 | 0 |

Held serials carry reservationId and status Reserved. Issue validates that exact owner before transitioning to Sold and recording fulfilledReservationId plus invoice/line IDs. A normal sale cannot consume Reserved serials. Every action creates stockMovements with explicit bucket deltas and actor/source identity. Invoice movement records link to the hold; no unbounded invoice-history array is added to the hold.

If later invoice settlement fails, the invoice transaction must roll back its hold consumption and stock movements too. Concurrent issue/release/expiry contend on the same hold, stock lot and serial documents with guarded writes. No endpoint may perform these steps as separate independent transactions.

The legacy invoice-level `reservationId` still rejects issue with an actionable message: callers must put references on the actual lot allocations. This avoids ambiguously assigning one hold to unrelated products. Jobs/enquiries remain guarded until their actual live workflows exist. The old handoff's blanket statement that all held-stock issue is blocked is superseded by this document.

Example draft allocation:

```json
{
  "lotId": "EXISTING_LOT_ID",
  "reservationId": "EXISTING_HOLD_ID",
  "quantity": 1,
  "serials": ["ACTUAL-SERIAL"]
}
```

For untracked products serials is empty. For ordinary stock omit reservationId. Allocation quantities across a product line must still total the line quantity. The same serialized unit cannot appear in two allocations.

## Prompt to give Antigravity

Continue Phase 4 in D:/AI/itech. Read AGENTS.md, this file and PHASE4-CORE-REVIEW-AND-HANDOFF.md. The latter contains the complete original requirements and all checkpoints; this file supersedes its reservation-blocking description. Preserve the approved UI and existing complex posting primitives. Work on the remaining adapters, UI, supporting APIs, documentation and verification. Do not rewrite the posting engine merely to connect a page.

### Step 1 — verify the current foundation first

Run typecheck and create dedicated Phase 4 domain/integration tests. The previous 109 old-phase checks are not evidence for sales. Verify invoice issue, draft editing, immediate split payments, actual advance consumption, credit limit races, snapshots and all failure rollbacks described in the older handoff. Verify the stock-hold scenarios below. Fix demonstrated defects without weakening invariants or injecting database state to bypass the behavior under test. Do not migrate real data blindly; first report any inconsistent pre-correction development records.

### Step 2 — connect reservation APIs and expiry processing

Create thin Node-runtime route handlers using the existing endpoint/requireIdentity/checkOrigin/jsonBody conventions:

- GET/POST `/api/sales/reservations`: validated, bounded pagination and createStockReservation.
- GET `/api/sales/reservations/{id}`: tenant-scoped detail, counters, status, exact customer/product/lot links and remaining serials. Paginate movement/invoice history separately.
- POST `/api/sales/reservations/{id}/release`: validate URL/body agreement and call releaseStockReservation with reservationId, expectedVersion, idempotencyKey, reason.
- A protected expiry processing adapter invoking expireStockReservation for a bounded batch of due active holds. Never expose tenant selection without authorization. The background worker must use an explicit trusted service identity; public/browser callers use their server session only.

Expiry compares date strings in Kolkata: a hold with expiresAt today is valid all day; expiresAt before today is due. Add scheduled processing appropriate to the eventual hosting environment and recovery before relevant stock selection/hold views. Work in bounded, indexed batches ordered by expiresAt and _id. Failed records must not starve later records; report anomalies and continue safely with tracked cursors. Do not silently report stock released if its transaction failed. Until the worker/adapters are wired, expiry does not run automatically.

Reuse existing tenant/status/expiry indexes; inspect query plans in Antigravity before proposing additional indexes. Add indexes for actual movement-history queries if needed. Old hold documents without schemaVersion/counters require a reviewed read-only reconciliation/dry-run migration. Do not synthesize missing ownership/serial data from guesswork.

### Step 3 — complete the approved sales UI

Wire quotation/invoice list/new/detail/edit/cancel/convert/issue using stable idempotency keys and expected versions. Use searchable paginated customer/product/lot/serial selectors. The old in-memory state must not be shown as live when the API fails or is empty.

Add Stock holds create/detail/release, customer/product links, remaining/consumed quantities, expiry and selector integration. Simple labels: “Available stock”, “Held for this customer”, “Release remaining stock”. Allow mixing held and ordinary stock in an invoice. Show unavailable/expired holds clearly. Selecting a hold does not receive money. Deposits use customer receipt/advance.

After mutations refresh all affected queries: product sellable/reserved totals, serial availability, hold detail/list, invoice lists/detail, customer due/credit, account balances and applicable dashboard cards. Reservation release has no financial refresh effect by itself and never pays a supplier. Stock brought from a supplier on credit remains sellable if physically received; customer sale leaves supplier liability unchanged.

Finish quote edit/cancel/reopen, actual printable invoice, tax/discount/charge previews, same-filter summary cards and exports as specified in the older prompt. Preserve exact invoice snapshots, separate service invoices and per-line new/used classification. Keep daily closing, jobs and other unimplemented modules visibly Preview.

### Step 4 — customer money workflow, then returns and outputs

Complete 4A2 standalone customer collections, opening-receivable settlement, advances, refund/reversal adapters and customer statement/timeline using the exact financial contracts in PHASE4-CORE-REVIEW-AND-HANDOFF.md. Reuse customer financialVersion serialization, integer paise, authoritative source allocations and shared account projections. Do not implement money changes as UI state updates.

Then implement 4B customer returns/accepted credits/refunds, warranty claims and attachments, template editor/copy/rename/revision selection, reports and filtered PDF/ZIP export. Follow the original handoff's component-wise return rounding, source lot/serial traceability, separate physical/financial events, privacy, pagination and export-content checks. Raise an explicit architectural question if a new operation cannot maintain those invariants; do not bypass safeguards to finish a screen.

Run verification per checkpoint and continue sequentially when its gate passes. Report defects honestly and keep documentation current. Phase 4 is only complete when the UI workflow, backend relations, current tests and exports are demonstrated together.

## Reservation acceptance cases — Antigravity runs these

1. Nonserialized stock starts sellable 5/reserved 0/sold 0: hold 3 → 2/3/0; sell 1 from hold → 2/2/1; release remainder → 4/0/1. Physical on-hand follows 5,5,4,4. Cash changes only for actual invoice payment.
2. Serialized A/B/C: hold A/B; ordinary issue of A fails; held issue of A succeeds; B remains reserved; release/expiry restores only B. Different punctuation/case normalizing to the same serial cannot bypass duplicate checks.
3. Cross-tenant/customer/product/lot/hold references reject; an invoice for another customer cannot consume the hold. Wrong serial ownership must roll back all earlier line changes.
4. One invoice can contain held and ordinary allocations in the same lot, multiple holds and multiple product lines. No double sellable deduction or duplicate stock movement.
5. Hold 3, consume 1, then expire → consumed 1/released 2/remaining 0. Repeated release/expiry cannot restore stock twice. A same-key replay returns its original result; changed release payload gets 409.
6. Race final held sale against release and expiry: only valid consistent outcome commits. Failed payment/advance/credit-limit settlement after stock consumption rolls back hold, serials, stock movements and invoice entirely.
7. Hold expires today: usable until end of day. Tomorrow it cannot be consumed, even before the expiry worker runs. Worker restores available quantity once; failed/anomalous records remain visible for reconciliation.
8. Archived customer/product does not prevent releasing an existing hold, but cannot create a new hold or issue a new sale. Receipt reversal/supplier return/quarantine/negative adjustment cannot consume held units through another pathway.
9. Draft editing/cancellation does not release a separate hold automatically. Cancelling/reopening quotations has a documented explicit hold policy; no silent loss of stock or deposits.
10. Index/pagination behavior beyond page 1; UI retry/409/empty/session-expiry; all relevant balances refetch. Test direct database invariants as read-only assertions, not as a replacement for public API behavior.

## Remaining phase map

| Work | Current status |
|---|---|
| Draft/issue/advance-at-issue backend | Present; needs Phase 4 behavioral verification |
| Stock hold transaction core and issue integration | Added here; untested |
| Hold API/UI/expiry scheduling | Antigravity next |
| Actual sales/quotation UI wiring and print | Still required |
| Standalone collections/advances/reversals/customer statement | Still required |
| Returns, warranty claims, full template workflow, PDF/ZIP | Still required |
| Dedicated Phase 4 tests and browser acceptance | Still required |
| Daily register/closing/profit lock/holidays | Phase 5; keep separate |

Maintain DEVELOPMENT-LOG.md, VERIFICATION-CHECKLIST.md, DECISIONS.md and the page/action status matrix. Record results per phase so an old suite count cannot be mistaken for coverage of a new feature.
