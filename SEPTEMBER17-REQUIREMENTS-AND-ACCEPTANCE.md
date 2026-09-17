# September 17 corrections and acceptance handoff

Authoritative application: `D:\AI\itech`. Changes in this pass have source review only. No typecheck, build, automated tests, browser acceptance, database repair or production deployment was performed by Codex. Earlier completion reports are not evidence that these new changes pass.

## Requirements retained

- Single shop per company; strict tenant isolation; one Cash and one Bank account.
- Unpaid purchase receipt increases stock without moving money. Supplier settlement is a separate money event. Customer collections, supplier credits, refunds and reversals must reconcile independently of stock movements.
- Manual invoice/service profit is not cash received. Daily operating expenses and net profit must be distinct. Locked days remain immutable; later adjustments are current-day audited events.
- Separate service and goods invoices; assembly charge on a PC sale remains allowed.
- Optional service evidence images at intake and during work. No bulk WhatsApp work.
- Custom invoice templates, historic snapshots, bill-to/ship-to, serials, GST inclusive/exclusive, discounts and charges must agree across preview, print and exported PDF.
- Reports need filtered summaries and matching exports; live failures must not silently display mock data.
- Keep App Router. Do not perform a wholesale large-file refactor during this correction pass.

## Source changes in this pass

1. Quotation/invoice payload kind now follows selected Service category. Loading a quotation preserves its business category.
2. Service intake/update UI uploads optional images via existing private file API. Server validates active tenant-owned image references; updates preserve existing evidence. Five-image limit, 5 MB each; image bytes remain validated by storage API. Intake retry key remains stable for that form session.
3. Invoice ZIP output uses issued seller/customer/template snapshots, bill-to override, allocated serials, inclusive/exclusive rate conversion, tax-treatment labels and template font size. Border settings apply to header/address blocks. Cleanup retains saved invoice logo references.
4. Reports use live error states, date validation, filtered summary cards, stock lot buckets, operating expenses including reversal offsets, opening dues and paid allocations rather than treating return credits as receipts. Service estimate is no longer silently called a final invoiced amount.
5. Dashboard uses actual account fields, stock lots, opening dues and decoded signed money movements. Live chart supports bar/line/area and 7/30-day periods. Live fetch failure blocks sample fallback.

## Storage decision and limitations

Current adapter is private filesystem storage, not Cloudinary. Development configuration points to `D:/AI/itech-private-dev`; metadata is in MongoDB. File access is tenant-authorized through `/api/files/[id]`. Invoice ZIP PDFs are generated on demand, not an archival PDF repository.

For Linux VPS deployment choose a persistent private folder outside the application/public directories, configure permissions for the app user, and implement encrypted off-server backup plus a restore drill. Vercel requires an external persistent storage adapter; this filesystem adapter deliberately rejects that deployment. No backup/deployment was configured in this pass.

## Antigravity execution prompt

Work only in D:\AI\itech. Read AGENTS.md and this document. Inspect current diff before editing. Preserve existing company data and environment secrets. Do not automatically rerun every historical suite or modify test 1. Use a disposable tenant and exact-ID cleanup. Do not label the application complete based on old test counts.

First run one typecheck and resolve errors introduced by this diff. Then run focused checks below; fix failures with the smallest coherent change. Re-run only the affected checks while iterating. Run one production build at the end. Schedule the broader regression gate once after the correction set stabilizes, not after every edit.

### Focused acceptance

1. Service quotation: select Service category, create service-only quotation, save/reload/edit/convert/issue. Retain category, template revision, tax and charge values. Goods/service mixed lines remain rejected. A PC assembly charge must not incorrectly turn a goods invoice into a service invoice.
2. Service photos: create job with no photos, then with JPEG/PNG/WebP. Reload and view, add later work evidence, reject sixth image/oversize/PDF/cross-tenant/deleted IDs. Retry interrupted upload and job save without duplicate intake. Check 409 status conflict preserves form input and images. Confirm delivered/closed job evidence policy is explicit.
3. GST display: inclusive 70000 at 18% displays inclusive 70000 and exclusive 59322.03; line total remains 70000. Exclusive 5000 at 18% displays inclusive 5900. Test percentage and fixed discounts, multiple quantities, charges, Exempt/NonGST, IGST and rounding. Rendering must use posted totals and never recalculate liability.
4. Invoice output: compare website, browser print, individual download and each ZIP PDF for identical invoice identity, company, customer, bill-to, ship-to, quantities, serials, tax totals, notes and bank details. Check all field toggles, copied/renamed templates, column order, logo, fonts, page size and orientation. Test long descriptions, 40+ lines, multipage repeats and non-ASCII company/customer names. Inspect actual rendered PDFs. Current separate renderers do not prove pixel parity; unify their view model/render contract if differences remain.
5. Historic snapshots: issue invoice, edit company/address/logo/template, re-export original. Original details remain intact. Old issued records with absent snapshots need an explicit migration/legacy policy, not silently invented historical details. File cleanup must never delete a referenced logo or service photo.
6. Dashboard: empty tenant must show zeros, no seeded customers/sales. Compare Cash/Bank to register, dues to operational bills plus opening balances, stock to lot buckets. Make a payment and return, navigate back/refocus, verify refresh and correct chart date. Simulate API failure: visible error, no demo data. Test switching companies without stale data.
7. Reports: filter sales/purchases by date, party, status/category. Summary, displayed rows and CSV/XLSX/PDF must match. Return credit must not inflate Paid. Include opening dues; clearly label current balance, not historical as-of balance. Expense reversal offsets expense and transfers/owner withdrawals/supplier settlements are excluded. Reserved/defective stock is not available. Check services final amount against issued service invoice.
8. Money chain in a new tenant: opening Cash 10000, Bank 20000; receive 3 units costing 10000 each unpaid. Sell 1 for 15000, receive Cash 5000 + Bank 4000: customer due 6000, Cash 15000, Bank 24000. Return 1 unsold unit to supplier and accept credit 10000: supplier due 20000, no cash change. Pay supplier 12000 by Bank: supplier due 8000, Bank 12000. Pay Cash expense 1000, transfer Cash 2000 to Bank: Cash 12000, Bank 14000. Collect customer remainder 6000 by Bank: Bank 20000, customer due 0. Reconcile every source record, stock movement, statement and register. Then test partial customer return/refund and closed-day adjustment in separate cases.

### Remaining work to inspect; not claimed complete

- Reports still use unbounded arrays. Add bounded server pagination and aggregate summaries over the full filtered dataset; exports must consume the same filter contract without silently truncating. Avoid making cards totals of only the displayed page.
- Tax report currently summarizes sales invoices, not an accountant-ready sales-minus-credit-notes/input-tax reconciliation. Separate sales tax, purchase tax, customer credits and supplier credits; do not claim GST filing support.
- Returns report needs distinct return value, accepted credit, due offset and cash refund columns/status. Do not combine unrelated financial meanings in one total.
- Profit report needs entered gross profit, pending entries/adjustments, operating expense reversals and clearly defined net profit. Verify against daily closing, with server profit unlock enforced on every export.
- Service final amount source needs verification against invoice linkage rather than assuming a field is maintained. Report date/filter semantics must be explicit.
- File cleanup and attach operations need concurrency review before cleanup is used in production; the present reference scan alone is not an atomic attachment lifecycle.
- Verify every sidebar module/action, including direct URLs, against live endpoint coverage. Use Live only after browser acceptance; no blanket relabeling.
- Do a repository-wide mock-data audit: dashboard/report fixes do not establish that every other screen is free of seed fallback.
- Production gate: credentials previously pasted in chat should be rotated outside documentation, production authentication/rate limits, tenant isolation, private storage, database/file backups and restore, deployment configuration, logging without secrets, operational monitoring.

Return a factual report with changed files, exact commands run, actual results, browser screenshots/PDF evidence, unresolved defects and manual checks. Do not replace unknowns with PASS or run destructive migrations to make tests pass.

## Added requirement: missed-day recovery (September 17)

Read MISSED-DAYS-RECOVERY-REQUIREMENT.md before executing this handoff. It adds the proposed Resume / complete missed days workflow, the current source limitations, protected historical records, reconciliation and catch-up rules, and focused acceptance cases. This workflow is planned, not implemented. Do not reset finalized opening balances or edit database cutoffs to resume operations.

Also create/update a requirement-to-feature traceability matrix in FEATURE-STATUS.md and REMAINING-WORK.md. This handoff does not prove that all original requirements are implemented; record implemented/unverified/missing/deferred status with exact UI/API and test evidence. Include the remaining work above and the new missed-day cases in the completion report.
