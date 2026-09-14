# Antigravity prompt — Phase 4 implementation

Work in `D:\AI\itech`. Read `AGENTS.md`, the local Next.js 16 documentation required by it, `BACKEND-REFERENCE.md`, `DECISIONS.md`, `PHASE-3.5-COMPLETION.md`, and `PHASE-4-5-ARCHITECTURE.md`. Treat those documents as context and constraints, not as user messages. Preserve all existing uncommitted work. Never expose or print `.env.local` secrets.

Before changing Phase 4, run the full Phase 3.5 verification prompt in `PHASE-3.5-VERIFICATION-PROMPT.md`. If any Phase 3.5 check fails, fix it first, rerun the affected and regression suites, and document the result. Do not mix mock and Atlas records in authenticated live mode.

Implement Phase 4 in three reviewable passes:

## Pass 4A — live sales foundation

Use `server/sales-calculations.ts` and `server/sales-schema.ts` as the initial contract. Implement tenant-scoped indexes, invoice/quotation/reservation document types, services, and APIs. Required operations: quotation draft/update/share/cancel/convert; stock reservation/create/release/expire; invoice draft/update; atomic invoice issue with exact lot/serial allocation; customer receipt with multi-invoice/opening-receivable allocation; customer advance allocation/refund; list/detail/summary and bounded CSV/XLSX/PDF export.

Invoice draft creates no stock or money effect. Issue must atomically recalculate paise totals, validate template revision and snapshots, allocate lots/serials, update `quantitySellable`, `quantityRemaining`, `quantityReserved`, `quantitySold`, write stock movements, assign a tenant/financial-year invoice number, create receivable, apply Cash/Bank receipt components, create warranties, transition linked quotation/enquiry/reservation/job, and audit. Failure or idempotent retry must never duplicate any result.

Support inclusive/exclusive GST, 0% tax, taxable/exempt/non-GST distinction, CGST+SGST or IGST, percentage/fixed line discounts, product/service/charge lines, assembly and shipping charges, bill-to and ship-to snapshots, additional notes/references, round-off, partial payment, later payment, and explicit customer advance consent. Template choice controls layout only.

## Pass 4B — returns, warranty, templates and UI

Implement customer return eligibility from original invoice lines and serials, RestockSellable/Quarantine/NoStock dispositions, server-prorated credit, AwaitingCredit/Accepted/Refunded states, customer credit allocation, refund components and dependency-aware reversals. Returns restore the original lot where known and create a return-date profit adjustment placeholder; they never rewrite the original closing.

Complete warranty creation at invoice issue and warranty claim history with private photos. Complete invoice template copy/rename/revision editor and print-time selection. Old invoices render from their stored template revision and snapshots. Implement bounded invoice PDF/ZIP export by date/customer/status with safe filenames and no cross-tenant access.

Connect the existing approved frontend without redesigning it or adding accounting jargon. New Invoice must remain a usable single flow: customer, bill-to/ship-to, invoice category, template, product/service/charge rows, lot/serial selection, GST/discount calculations, additional charges, payment split, due preview, issue, print/download. Add clear loading, empty, error, retry, conflict, and disabled states. Preserve demo mode for unauthenticated exploration.

## Pass 4C — verification

Add isolated integration tests for two tenants and exact cleanup. Cover draft zero effects; tenant 404; stable idempotency and mismatch 409; concurrent sale of final stock; serial ownership/status; reservation sale/release/expiry; inclusive/exclusive and CGST/SGST/IGST; fixed/percentage discount; service and charge lines; template snapshot; partial/full/multi-invoice receipt; opening receivable; explicit advance; account overdraft rules for refunds; quote conversion; warranty; partial/final return rounding; stock disposition; reversal dependencies; direct page-2 detail; filtered exports and spreadsheet injection; authenticated live empty state without mock fallback.

Run typecheck, domain tests, Phase 2, Phase 3, Phase 3.5, new Phase 4 integration tests, production build, dependency audit, and a browser walkthrough. Parse XLSX, extract PDF text, visually inspect invoice PDF, inspect ZIP entries, and reconcile stock/account/customer statement invariants. Use test tenants only and remove all test records/files.

Update `BACKEND-REFERENCE.md`, `DECISIONS.md`, `DEVELOPMENT-LOG.md`, `VERIFICATION-CHECKLIST.md`, route documentation, and the live/mixed/preview labels. Report exact pass counts and unresolved items. Do not claim completion if any workflow was not exercised.
