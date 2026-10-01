# AntiGravity handoff: filtered sales, WhatsApp, PDF parity, and verification

Work only in `D:\AI\itech`. Read `AGENTS.md`, `FEATURE-STATUS.md`, `FINANCIAL-INVARIANTS.md`, `DATA-RELATIONSHIPS.md`, and the current source before planning. Do not change financial formulas, tenant isolation, stock allocation, ledger posting, or immutable issued-document snapshots unless a failing invariant proves a correction is required. Do not seed mock data into live accounts.

The senior architecture pass has already added product descriptions end to end, line-level printable details, live server search in the sales composer, inline customer refresh after creation, draft invoice identification, stable invoice item-table space, route-level code splitting, and reduced MongoDB index-catalog round trips. Preserve those changes.

## 1. Server-paginated sales filters

Implement URL-preserved filters on `/sales`: preset `1 day`, `7 days`, `30 days`, `This month`, and `Custom`; `dateFrom`, `dateTo`, customer, document status, payment status, business category, tax type, and search by invoice number/customer/phone. Validate every query with Zod, cap page size, escape regex input, derive `tenantId` only from the server session, and use stable indexed sorting. Summary cards must be calculated from the same filtered query, not from the current page or client memory.

Add or extend indexes only after comparing exact key order and partial-filter expressions in `server/db.ts`. Do not silently replace incompatible indexes.

## 2. Filtered exports

CSV, XLSX, PDF, and batch PDF ZIP must receive the same normalized filter contract as the list endpoint. Export only matching records. Default official exports to issued/cancelled business documents and exclude drafts unless the user explicitly selects Draft. A draft may be individually previewed or downloaded, but it must say `DRAFT - NOT A TAX INVOICE` and must never create stock, receivable, tax, receipt, or account movements.

Sanitize CSV/XLSX formula injection, use integer paise throughout, cap synchronous exports, stream ZIP output, include a manifest, and return a clear 413/422 response when a safe limit is exceeded.

## 3. Canonical invoice rendering and batch parity

Remove the separate simplified batch-PDF layout as a source of truth. Create one canonical invoice view model and one canonical renderer contract used by:

- browser preview;
- single PDF download;
- print;
- batch PDF ZIP;
- quotation PDF.

Issued invoices must render from their immutable company/customer/item/template revision snapshots. Current company or template edits must not alter an old issued invoice. Drafts may use the current selected revision until issuance.

Match the supplied Tally-style reference: A4 outer border with practical print margins, seller/logo and document metadata grid, Bill To and optional Ship To, a fixed-height item area that comfortably shows 5-10 normal rows without shrinking fonts, continued pages for overflow, totals, amount in words, HSN/SAC GST summary, declaration, bank details, customer signature and authorised signature. Never stretch a single page until text becomes unreadable. Print and downloaded PDF must use the same fonts, column widths, wrapping, borders, and pagination. Remove duplicate copy pages unless the user explicitly selects Original/Duplicate/Triplicate copies.

Verify long Tamil/English addresses, 10 items, long descriptions, serials, warranty text, intra-state CGST/SGST, interstate IGST, exempt/non-GST lines, discounts, shipping charge, round-off, Bill To/Ship To, missing optional fields, and logo/no-logo.

## 4. WhatsApp actions

Add focused actions on issued invoice detail and customer profile:

- `Send invoice on WhatsApp`: download/open the PDF and open `https://wa.me/<E164>?text=<encoded message>` with invoice number, amount, due amount, and a secure share URL when one exists.
- `Send thank-you message`: prefill a short editable greeting for the selected customer.

Normalize Indian phone numbers to E.164 and show a friendly error if invalid. Do not claim a PDF is attached: `wa.me` cannot attach a local file automatically. Where Web Share with files is supported, offer it as an optional user-initiated action; otherwise provide `Download PDF` plus `Open WhatsApp`. Never send automatically and do not implement bulk WhatsApp.

## 5. Search and inline-create acceptance

Verify customer, supplier, product, and service selectors use debounced server pagination rather than full master-data arrays. Requirements: minimum two-character search where appropriate, 250-350 ms debounce, AbortController cancellation, loading/empty/error states, keyboard support, no stale response replacement, capped results, and exact selected record retained even when search text changes.

On New invoice, `Add customer` must create a live customer, refresh the selector, auto-select the created customer, preserve the current invoice draft, and surface duplicate phone/GST errors inline. Customer phone remains mandatory and normalized; GST uniqueness follows the existing tenant rules.

## 6. Focused verification only

First run `npm run typecheck`. Then add focused tests for the new query contract, cross-tenant filter isolation, filtered summary/export parity, draft side-effect absence, snapshot rendering, and WhatsApp URL encoding. Do not run every historical phase suite during iteration. After focused tests pass, run `npm run build`. Run the full regression gate once, only at the final release checkpoint.

Perform browser verification at desktop and narrow widths. Produce screenshots/PDFs for: a 1-line draft, 10-line issued invoice, interstate invoice, long-description invoice, filtered sales page, filtered ZIP contents, inline customer creation, and both WhatsApp actions. Parse exported ZIP filenames and PDF text, and visually inspect rendered PDF pages. Record exact commands, counts, limitations, and evidence in `DEVELOPMENT-LOG.md` and `VERIFICATION-CHECKLIST.md`. Do not mark manual checks as passed without evidence.
