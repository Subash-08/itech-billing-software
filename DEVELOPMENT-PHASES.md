# iTech implementation phases

Updated 11 September 2026. This is a single-branch-per-company, multi-company application. The current business screens are a working mock prototype. Real account and private-file APIs are the first backend foundation; business records are not persisted yet.

## Phase 1 — Accounts and infrastructure (started)

- Next.js server on Linux VPS, MongoDB Atlas database `itech_dev` for development. Use a separate production database and least-privilege database user later.
- Better Auth email/password login. Signup creates a company and user with `verified: false`. Both must be approved and not disabled. Approval is operator-only: `npm run account:approve -- email@example.com` on the trusted server. Never expose this command as a public API.
- Each business record and file needs `tenantId`; derive it from the authenticated session, never accept it as authority from forms, URLs, or uploads.
- One shop permission level. Separate profit password is hashed and unlocks the current server session for ten minutes. Totals, profit reports and exports must enforce this server-side when business APIs are built. The prototype's visible demo password is only a UI demonstration.
- Private PDF/JPEG/PNG storage outside the deployed application, authenticated download routes, randomized filenames, tenant folders and size limits.
- Remaining before production: signup abuse controls, account/profit password recovery, session management UI, deployment configuration, operator approval audit, storage quotas, file inspection, monitoring, backup and restore verification.

## Phase 2 — Company setup and master data

Persist customers, suppliers, products, serials, service catalogue, company settings, invoice templates and opening balances. Add validation, duplicate checks, pagination and audit history. Import mock data only into an explicitly selected demo company; never seed it into customer accounts automatically.

## Phase 3 — Purchases, stock and supplier settlement

Keep Inventory and Purchases separate under one sidebar group: a product describes what is sold; a purchase records supplier, cost, tax, received quantities and money owed. Receipt increases stock even when payment is zero. A later supplier payment allocates against selected purchase lines and updates purchase dues, supplier history and the money register together. Track source purchase/serial through sale so supplier payment status can be displayed beside day-end profit. Unknown opening-stock sources must remain explicitly unknown.

Use database transactions for receipt/stock movements, serial uniqueness and payment allocation. Add idempotency keys to prevent double receipt or payment after retries. Cover partial delivery, partial payment, overpayment as supplier advance, returns, damaged stock, cancellations and concurrent sales.

## Phase 4 — Billing, service and customer payments

Persist quotations, sales, separate service invoices, assembly charges, warranties, service intake, enquiries and stock holds. Issuing an invoice snapshots customer/company/product/tax details; later master edits must not rewrite old invoices. Invoice creation, stock movement, allocations and initial payments commit atomically.

Service intake accessories accept free text. A received credit purchase may be sold before the supplier is paid. Customer receipt and supplier settlement remain separate events. Customer collections increase cash/account only for the amount actually received, not the unpaid invoice value.

Share the GST calculator on the server and client. Support inclusive/exclusive prices, editable invoice tax and price, percentage/fixed discounts, taxable additional charges, and CGST/SGST versus IGST. An invoice template name selects appearance; it does not determine tax treatment. Accountant review remains required for classification, used-goods treatment, place-of-supply rules, discount treatment, credit notes and rounding before live billing.

## Phase 5 — Money desk and daily closing

Two money screens: Money desk and Daily closing. One cash drawer plus one GPay/bank account. Sales/service receipts, customer due collections, supplier payments, expenses, refunds and manual money-in are recorded once. Transfers change the two balances in opposite directions without changing income or profit.

Daily closing captures manual profit beside each sale/service/non-GST sale and current-day return adjustment. Compare expected cash/account balances against counted/confirmed balances; show differences until reconciled. Require previous day closure, carry closing balances forward, allow explicit holidays with no transactions, and lock closed dates. Correct old mistakes through an audited current-day adjustment rather than silently rewriting later balances. Build this against database transactions and concurrency tests before enabling live use.

## Phase 6 — Reporting and documents

Current prototype generates PDF/Excel reports and selected invoice PDFs in ZIP with an Excel index. Dashboard supports bar, line, area and category charts. Production reporting must use tenant-scoped server queries, clear transaction-date versus current-balance semantics, refunds/credits and permissions. Large exports need background jobs, temporary private downloads and retention limits. Add Tamil/Unicode font support to downloadable PDFs before using non-English customer/product text; current direct PDF exporter uses a Latin font. Verify every template option against multi-page, long-name and logo examples.

## Phase 7 — Acceptance and launch

Client walkthrough of purchase-to-stock-to-sale-to-collection-to-supplier-payment-to-closing; independent accountant review; tenant isolation and permissions tests; concurrent billing and retry tests; backup restore drill; migrate opening stock/dues/balances; rehearse day-end; then launch. No payroll, online cart, multi-branch, GST filing, offline mode or mobile app. WhatsApp remains mock until a later integration.

## Storage decision

Yes, a Next.js server on your Linux VPS can store files in an absolute local folder such as `/var/lib/itech-private`. Do not put customer files in `public`, the repository, or a release directory. Store metadata and tenant ownership in Atlas; store binary files privately on disk. Back up both Atlas data and files off-server with encryption, restricted access and a tested restore process. Keep backup credentials separate from the running application where practical.

Vercel requires external persistent storage rather than relying on its function filesystem. If deployment moves to Vercel, replace the file adapter with private object storage or a secured VPS storage service. Cloudinary is optional for managed image handling; it is not needed for the chosen VPS-folder approach. See [Vercel file guidance](https://vercel.com/kb/guide/how-can-i-use-files-in-serverless-functions).

## Important limits

- Hiding totals with a password is a privacy gate: a staff member who can view every individual profit can still add them up. Production must avoid sending aggregate profit fields through ordinary APIs.
- Do not use real shared development credentials for production without rotation. Keep `.env.local` untracked and server-only.
- Account approval is separate from email verification. The current operator approval does not prove ownership of an email address.
- Do not label the current demo as production-ready or complete accounting software.
