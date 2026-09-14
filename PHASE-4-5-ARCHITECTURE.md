# Phase 4 and 5 architecture baseline

This document is the implementation contract for the remaining shop workflows. Phase 3.5 must pass its verification gate before Phase 4 mutations are connected to the live UI.

## Delivery sequence

1. **Phase 3.5 gate:** verify purchase, supplier settlement, stock-lot conservation, private files, exports, tenant isolation, and live/demo separation.
2. **Phase 4A:** quotations, reservations, invoice drafts, atomic invoice issue, customer receipts/advances, customer dues.
3. **Phase 4B:** warranty creation and claims, customer returns/credits/refunds, invoice template revisions and bulk invoice export.
4. **Phase 5:** Money in/out/transfers, expenses, daily closing/holidays, manual per-document profit, read-only historical days.
5. **Phase 6:** dashboards/reports/exports, audit administration, backup/restore runbook, performance and production deployment.

## Collection boundaries

All documents contain `tenantId`; unique and query indexes begin with it.

| Collection | Purpose |
|---|---|
| `quotations` | Editable commercial offer with immutable revision history and no stock/financial effect. |
| `stockReservations` | Temporary lot/serial hold; changes sellable/reserved buckets but not total on hand. |
| `invoices` | Draft or issued sales/service document with immutable issued snapshots and paise totals. |
| `invoiceCounters` | Tenant/financial-year/type sequence source. Numbers are assigned only when issuing. |
| `customerReceipts` | Actual incoming Cash/Bank payment components. |
| `customerAllocations` | Receipt/advance/credit allocation to invoice or opening receivable. |
| `customerAdvances` | Authoritative unallocated customer money/credits. |
| `customerReturns` | Returned invoice quantity/serial and chosen stock disposition. |
| `customerCreditNotes` | Financial credit created from a return or a standalone adjustment. |
| `customerRefunds` | Actual outgoing Cash/Bank against customer advance/credit. |
| `warranties` | Coverage per issued invoice line/serial or quantity line. |
| `warrantyClaims` | Append-only claim workflow and private photo references. |
| `invoiceTemplateRevisions` | Immutable print configuration selected by issued invoices. |
| `expenses` | Non-supplier operating money out. |
| `otherReceipts` | Owner contribution and described non-sale money in. |
| `accountTransfers` | Atomic Cash ↔ Bank transfer pair. |
| `dailyClosings` | Immutable daily balance and profit reconciliation snapshot. |
| `profitEntries` | Manual profit per sale/service/non-GST invoice and later return adjustment. |

`accountMovements`, `stockLots`, `serialUnits`, `stockMovements`, `auditHistory`, `files`, `openingReceivables`, and master collections remain shared foundations.

## Invoice issue transaction

An invoice draft has no stock, receivable, warranty, or money effect. Issuing runs one MongoDB transaction:

1. Load the exact draft version under session-derived tenant scope.
2. Revalidate customer, active product/service references, template revision, business date, credit policy, and source quotation/job/reservation.
3. Recalculate every line and document total on the server using `server/sales-calculations.ts`; reject client total differences.
4. Lock and consume exact stock lots. For each product line, allocated lot quantity must equal invoice quantity. Serialized lines require one unique `InStock` or linked `Reserved` serial per unit.
5. Decrement `quantitySellable` and the Phase 2 mirror `quantityRemaining`, increment `quantitySold`, update serial status to `Sold`, and append stock movements.
6. Generate the tenant-scoped invoice number and save immutable company, customer, bill-to, ship-to, product/service, GST, tax-mode, and template-revision snapshots.
7. Create invoice receivable fields: original total, allocated receipts, allocated credits, and remaining due.
8. Apply selected customer advance and payment components. Cash increases Cash; UPI/card/bank transfer/cheque increase the one Bank account. Create receipt, allocation, and signed account movements once.
9. Create warranty records from line warranty snapshots. Photos may be added later through tenant-private file IDs.
10. Convert linked quotation/enquiry/reservation/service job through explicit valid transitions.
11. Append sanitized audit records and commit. Any failure rolls back every counter, stock, serial, invoice, receipt, movement, warranty, and source status change.

## Stock allocation and reservation

- The server never trusts a product-level stock counter. It locks exact lots with an atomic bucket predicate.
- Manual lot selection is supported for quantity products; serial selection determines the lot for serialized products.
- Optional FIFO suggestion may prepare allocations, but issue revalidates them atomically.
- Reservation performs `sellable -n`, `reserved +n`, `quantityRemaining -n`; release reverses it. Sale from reservation performs `reserved -n`, `sold +n` and must not decrement sellable a second time.
- Reservation expiry is an explicit idempotent release operation. A scheduler may call it, but the same service is callable manually.
- A cancelled draft has no stock effect. Cancelling an issued invoice is prohibited after downstream activity; use customer return/credit and reversal flows.

## Customer dues and money

- Invoice due is `originalTotal - receipt allocations - accepted credit allocations` and cannot be negative.
- A receipt can settle several invoices and opening receivables. Component total must equal allocations plus explicitly accepted customer advance.
- Customer overpayment is rejected unless `recordExcessAsCustomerAdvance` is true.
- Customer refund consumes available customer advance/credit and creates money out. It does not rewrite the original invoice or closing.
- Credit limit is a server warning/override decision captured on the issued invoice; it is not inferred in the UI only.
- Customer and supplier ledgers use separate collections and signs. Never use supplier advances to settle customer dues.

## Returns and warranty

- Return eligibility is based on original invoice line quantity minus prior non-reversed returns.
- Serialized returns require serials sold on that invoice line and cannot reuse a returned serial.
- `RestockSellable` restores the original lot when known. `Quarantine` restores to defective. `NoStock` creates no inventory increase.
- Credit creation and cash/bank refund are distinct events. A return may remain AwaitingCredit.
- Partial return value is prorated from the immutable issued line; the final eligible return receives any rounding remainder without exceeding the original line total.
- Return-date manual profit adjustment is separate from the original day’s profit.
- Warranty coverage is created at issue, tied to invoice line and serial where applicable. Claims append events/photos and never edit invoice facts.

## Templates and invoice files

- Template records may be copied and renamed. Saving a template creates a new immutable revision.
- An issued invoice stores `templateId` and exact `templateRevision`; later template changes do not alter old invoice rendering.
- Print-time selection may use another template revision for presentation only. It does not change invoice type, GST, or stored values.
- Field visibility, bill-to/ship-to, company logo, table columns, product detail rows, HSN/SAC, tax columns, bank/declaration/signature/footer, paper/orientation/font/borders are allowlisted configuration fields.
- Bulk invoice export accepts bounded date/customer/status filters, generates PDFs from issued snapshots, and streams a ZIP with a safe maximum. No unbounded in-memory export.

## Daily closing dependencies

- Business date is Asia/Kolkata. Money in/out and transfers create signed account movements dated to the current open day.
- Expected closing = prior closed balance + incoming - outgoing, by Cash and Bank separately. Transfers affect each account and net to zero combined funds.
- Staff enter manual profit beside every issued sales/service/non-GST invoice. Blank means pending; zero and negative are valid explicit values.
- A day closes only when every required profit entry exists, cash and bank differences are zero, and no unresolved posting is in flight.
- Closed days reject new postings and edits. A later payment/return belongs to the later open day. Historical closing snapshots remain immutable.
- Holiday dates carry balances forward and require no activity; any activity blocks holiday closing.

## API rules

Every mutation requires approved authentication, origin check, strict Zod body validation, session tenant scope, tenant-owned references, integer paise, current open business date, MongoDB transaction, stable idempotency, atomic concurrency predicates, sanitized audit, and safe 400/401/403/404/409 responses. Lists and exports use bounded validated pagination and escaped search. Cross-tenant IDs always appear as 404.

The initial deterministic contracts are implemented in `server/sales-calculations.ts` and `server/sales-schema.ts`. Antigravity should build services/routes/UI against these contracts and adjust them only when a documented business invariant requires it.
