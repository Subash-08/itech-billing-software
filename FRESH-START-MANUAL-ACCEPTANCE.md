# Fresh company acceptance and production release plan

18 September 2026. Application: D:\AI\itech.

## Decisions and evidence

- Start a NEW company account. Existing account recovery and legacy business-data migration are not required for this fresh company. No old account, database, local file or Cloudinary asset has been deleted by this change.
- Keep demo as a separate exploration experience. Recommended final navigation is Sign in / Create company / Try demo; never import demo into a live company automatically. Explicit Try demo landing-page navigation is a follow-up UI task, not implemented by this pass.
- Current changes clear sample collections before live bootstrap, remove template fallback, enforce production auth rate limiting, pin NEW platform uploads to encrypted connection documents, and implement bounded cleanup of NEVER-COMPLETED uploads. Saved files are retained. One TypeScript check passed; real provider/database/browser tests are pending.
- Cleanup excludes completed/saved files, waits 72 hours past expiry, claims records transactionally, checks tenant/path/cloud identity, limits a call to five candidates and retries unsuccessful provider deletions. It is not an account-deletion tool or a general attachment garbage collector.
- Existing pendingUploads TTL must be removed before depending on cleanup. scripts/retain-upload-cleanup-records.mjs is dry-run by default; --apply only changes index metadata. A new company in the SAME database still inherits the old indexes. Deleted pending tracking cannot be reconstructed automatically.
- Pinned connection changes apply to new uploads. Platform-v1 historical records retain their old limitations. Back up storageConnections and encryption keys. Provider credentials revoked at an old account cannot be recovered by application code.

## Rules for manual testing

Use one new company named Acceptance Shop, with your own unused email and private passwords. Set business date T to the actual Asia/Kolkata date when you test. Do not change production clocks or directly edit transaction dates in MongoDB. Use a separate company for destructive/edge-case testing. Never run seed/cleanup scripts against your real shop account.

After each save, refresh the page and check the related records. Record screenshot, route, input, expected result and actual result. Stop the main numeric scenario if an amount differs; do not add compensating money entries just to force reconciliation.

## A. Signup, approval and shop setup

1. Open a private browser. Confirm logged-out demo is clearly labelled and cannot save company transactions to Atlas. Sign up with name, email, company, login password and DIFFERENT profit password. A new account awaits approval. Approve only the exact account with the existing administrator process, then sign in.
2. Confirm header name/company/email and logout. Refresh; session must persist. Incorrect password and unapproved/disabled account must fail. A second company must not see the first company's records or files.
3. Save company trading name, address, phone, email, state/state code, GST details if applicable, bank/account/IFSC and invoice declaration. Use accountant-approved or designated test tax details; do not use another business's identity.
4. Upload a company logo, reload settings and inspect its private file link. Verify platform storage status. Custom Cloudinary is optional: test and save only an account you control. Missing credentials should produce a clear configuration error; no public/local fallback on Vercel.
5. Create/clone/rename an invoice template, set default, toggle fields/columns, adjust logo and details. Confirm the actual revision is saved. An empty live template list must not substitute a demo template.

## B. Masters and opening setup

Create five customers: Anand (retail), Priya (retail), Office Customer (business), Used Laptop Buyer and Service Customer. Use valid distinct phone numbers; search by phone. Check mandatory phone, optional email, billing/shipping address, normalized GST uniqueness WITHIN the company. Same lawful identifier in another company must not cause cross-tenant conflict.

Create two suppliers: Supplier A and Supplier B. Set contact details and payment terms. Add 10–15 products including a serialized laptop, used laptop, quantity-tracked monitor, mouse, keyboard, SSD, RAM, CPU, motherboard, PSU and prebuilt PC. Add cleaning, diagnosis and assembly to Service catalogue. Check inclusive/exclusive rate previews, HSN/SAC, tax treatment, warranty and serial-tracking settings. Product creation alone must not receive stock or pay a supplier.

Save opening draft: cutoff T-1, Cash ₹20,000, Account ₹100,000, no opening dues, no opening stock. Save/reload, inspect draft version, then finalize ONCE. Verify both ledger balances and locked setup. Zero stocks/dues are intentional here. Opening stock/serials and opening dues have separate edge-case tests below.

## C. Connected financial scenario — exact checkpoints

Use an 18% taxable quantity-tracked product at a GST-INCLUSIVE supplier rate ₹11,800 per unit. All figures below include tax. Do not perform optional tests until this sequence and its closing have been checked.

| Step | Action | Expected result |
|---|---|---|
| 1 | Supplier A: purchase 3 units at ₹11,800, post bill, pay nothing | Bill ₹35,400; due ₹35,400; Cash ₹20,000; Account ₹100,000; stock remains zero until receipt |
| 2 | Receive all 3 units, without payment | Sellable stock 3; supplier due unchanged; no account movement |
| 3 | Sell 1 unit to Anand for ₹17,700 inclusive GST; collect Cash ₹5,000 | Stock 2; customer due ₹12,700; Cash ₹25,000; supplier due still ₹35,400; taxable ₹15,000 + GST ₹2,700 |
| 4 | Collect Anand's remaining ₹12,700 through UPI into Account | Customer due zero; Account ₹112,700; sales total does not increase from the receipt |
| 5 | Return 1 UNSOLD unit to Supplier A; accept supplier credit ₹11,800 | Stock 1; supplier due ₹23,600; no cash/bank payment. Credit acceptance reduces what you owe |
| 6 | Pay Supplier A ₹10,000 from Account against this bill line | Supplier due ₹13,600; Account ₹102,700; line is Partly paid, not a fully paid physical unit |
| 7 | Anand returns his 1 sold unit, restock, retain customer credit ₹17,700 | Stock 2; sale is fully returned; customer due stays zero; available customer credit ₹17,700; no money movement yet |
| 8 | Refund that credit ₹17,700 from Account | Customer credit zero; Account ₹85,000; Cash remains ₹25,000; one refund only |
| 9 | Record shop expense ₹1,000 from Cash | Cash ₹24,000; operating expense ₹1,000 |
| 10 | Transfer ₹4,000 Cash to Account | Cash ₹20,000; Account ₹89,000; transfer is neither sales nor expense |
| 11 | Issue separate cleaning Service invoice ₹2,360 inclusive 18%, paid Cash | Cash ₹22,360; service base ₹2,000 + tax ₹360; no product-stock decrement |
| 12 | Owner adds ₹3,000 to Account using non-sales money-in category | Account ₹92,000; sales and operating profit do not increase |

End checkpoint: Cash ₹22,360; Account ₹92,000; product stock 2; Supplier A due ₹13,600; Anand due and credit zero. Net sales after full product return are the ₹2,360 service invoice (reports may show original sales/returns separately). Supplier statement net due must match ₹13,600. Gross supplier bill remains ₹35,400 with ₹11,800 credit and ₹10,000 settlement history.

Manual profit: mark the fully returned sale's final contribution ₹0 using the review/adjustment workflow. Enter ₹1,000 service profit BEFORE shop expenses. Total entered profit ₹1,000, expenses ₹1,000, net shop profit ₹0. Owner contribution and transfer are not profit. If your staff-entered profit already includes operating expenses, do not subtract them again; adopt this pre-shop-expense convention consistently.

## D. Daily register and closing

Filter movements by Cash/Account, date, category and source. Every step above must appear once with a source link. Enter actual counts from the checkpoint; deliberately enter ₹1 too little to see variance, then correct to the actual amount. Do not finalize false counts. Review all profit rows, save closing draft/reload and close T. Next day's opening carries both closing balances forward. Closed-day edits must be blocked; later refunds/returns use new dated entries and profit adjustments.

Test missed inactive days in a separate test company with a suitable initial cutoff, using only dates when no real activity occurred. Only a contiguous inactive range may close as holidays. Activity-only stock/service days block holiday closure. Historical UNRECORDED activity and cash-discrepancy correction remain a separate unfinished workflow; do not reset opening setup or invent past counts.

## E. Remaining functional scenarios (separate run/company)

1. Purchase draft → edit → confirm → post → receive 1 then remaining 2. Charge-only purchase lines cannot be received. Reject duplicate supplier bill number for the same supplier/year. Test price/discount/charge tax totals and mixed rates.
2. Serialized stock: receive distinct serials, reject duplicate/case/space variants, reserve one for a customer, prevent another customer consuming it, release/expire hold, issue allocated serial, return exact sold serial and reject unrelated serial. Two simultaneous last-unit sales: at most one succeeds.
3. Supplier settlement: partial line payment, pay several lines, opening payable allocation, prepayment with no bill, consume advance without new account movement, refund unused advance, reverse eligible payment, block reversal once dependent credit is consumed. Supplier return after partial payment must offset that line's due and put only the actual surplus into credit.
4. Quotation: goods and service, save/reload, edit/version conflict, convert once, issue. No stock/money change on draft or quote. Open enquiries close Won only through the linked issued sale. Quote expiry/cancellation must remain distinguishable.
5. Invoice pricing: inclusive ₹5,000 at 18% shows approximately ₹4,237.29 base + ₹762.71 tax; exclusive ₹5,000 gives ₹900 GST and ₹5,900 gross. With 10% discount on exclusive ₹5,000, base ₹4,500 + ₹810 tax = ₹5,310. Check interstate IGST, intrastate split, Exempt/NonGST, shipping, assembly, round-off, separate ship-to and long descriptions. Do not treat a 0% taxable line as automatically NonGST.
6. Payments: credit, partial/full/split, customer advance, explicitly approved excess credit; blank/negative/malformed amount rejected; response retry records once. Receipts reduce dues but do not repeat revenue. Current issue-draft null-reference correction needs this test.
7. Customer returns: unpaid, partly paid, fully paid, partial quantity, multiple lots, multiple serials, service NoStock, defective quarantine, credit versus refund. Reject over-return and over-refund. Check due-first offsets and last-unit paise reconciliation.
8. Service job: intake/customer/device/accessories/free text/photos; diagnosis, estimate revisions, approval/rejection, parts consumption and reversal, service invoice without second stock decrement, ready/delivered. Photo-only edits may work before opening finalization without creating balances; operational status changes still follow setup rules. Verify deliveredAt is unchanged by later photo additions.
9. Service edit gap: currently existing-job PATCH handles status/notes/photos. Other visible intake fields must either persist through a validated update flow or be shown read-only; do not accept a success toast that silently discards those edits.
10. Warranty: record coverage with optional photos, start/end and serial; reject out-of-scope serial, repair/reject/replace, replacement serial traceability and original-return restrictions. Check calendar expiry even when the shop has not logged in.
11. Customer profile: new/used/service contributions, outstanding and credit, timeline of enquiry/service/invoice/receipt/return. Check supplier profile and purchase line payment history, with links back to stock/returns.
12. Reports/dashboard: match C's totals, filters/date bounds/customer/category/status, pagination, CSV/Excel/PDF and ZIP. Include >one page of results, empty results, credit notes, partial dues, and zero/negative net-expense periods. Exports must not silently omit later pages. Profit totals are unavailable while locked, including direct APIs.
13. Templates: clone/rename/default/edit; existing issued invoice retains its snapshot. Print, individual PDF and ZIP show correct logo, billing/shipping, serials, HSN/SAC, discounts, tax breakdown, payment/due, declaration, bank and multipage alignment. Test long Tamil/English descriptions and missing optional settings. Preview/print parity still needs visual acceptance.
14. Files: image/PDF upload, <=5 MiB, max five service photos, unsupported/mislabeled bytes rejected. No image content fetch until Show photos. Hide/reopen, route change, failure retry, refresh persistence and cross-tenant denial. Switch platform/custom/back; old and new files keep correct connection. No secrets in returned metadata/logs.
15. Archive/restore: masters referenced by transactions retain history; archived master cannot create a new transaction. Issued financial records are corrected with reversals/returns/credit notes, never hidden by delete. Draft cancellation changes no money/stock.
16. WhatsApp: select customer, edit message, open WhatsApp with number/text, manually review/send. The app must not send automatically. Bulk remains excluded.
17. Session/security: logout and account switching remove previous company data; refresh produces no hydration warning; profit unlock expires; data/exports/photos are tenant-authorized; concurrent version conflicts preserve entries. Validate at least 101 master records so selectors are not capped at the first page.

## Antigravity implementation and targeted test prompt

Work in D:\AI\itech, preserve all changes, read this handoff. Do not recover the old account, delete old company data, or use production DB/provider assets as fixtures. Use a dedicated disposable TEST database and provider folder. Every cleanup must target tracked IDs, not broad collection predicates. Assert a database allowlist before tests; do not assume a tenant prefix makes a destructive script safe.

First source-review the new storage pinning/cleanup and live-state changes. Run scripts/retain-upload-cleanup-records.mjs without --apply and report the exact index. Apply only on the isolated test DB for verification; production index changes require a reviewed deployment step. Never print secrets.

Test: NEW platform uploads pin encrypted connection; same-account credential rotation and different-account switch; custom retained files; missing encryption keys fail closed. Cleanup must reject active/saved/Completed uploads, cross-tenant IDs and cloud mismatch; respect 72-hour grace, batch bound and leases; race complete versus claim; retry after provider timeout/crash without touching active attachments. Never simulate deletion success without checking the provider result. Old TTL removal is a prerequisite. Saved-but-unattached files deliberately remain outside cleanup scope. Scheduled cleanup UI/job wiring is still needed if operational automation is required.

Test live empty company versus demo, failed bootstrap, login/logout and switching companies. Fix residual fixed-demo balances in any live report instead of fabricating API totals. Implement explicit Try demo landing navigation, and complete or disable unsupported service-edit fields. Do not hide unfinished features behind a Live badge.

Run typecheck, the affected invoice/service/storage tests, and the numeric scenario C once. Update tests expecting blanket cleanup 409: eligible NEVER-COMPLETED expired uploads now use the bounded cleanup contract; saved-file deletion remains prohibited. Run broader financial regressions only for shared ledger/stock modifications or a failure. For release, run the full agreed acceptance gate once on a fixed commit, including production build, dependency audit and browser/export checks. Keep result counts factual and record not-run/failed/blocked scenarios.

Deliver changed files, actual commands/results, fixtures cleaned, remaining defects, and deployment instructions. Never claim all features complete from typecheck alone. No push/deploy or account deletion unless separately requested.

## Production steps after manual acceptance

1. Freeze the accepted commit and deploy to staging with a separate database. Back up the NEW production database, connection documents and encryption keys; perform one restore drill. Not wanting old test data does not remove backup needs for future customer invoices.
2. Configure HTTPS origin allowlist, server-only fresh credentials, encryption key, approved accounts, production rate limits, upload bounds, private files, error monitoring and provider quota alerts. Do not reuse credentials exposed in chat. This is deployment configuration, not recovery of old users.
3. Confirm serverless file delivery, signed upload flow, scheduled reservation expiry and cleanup operation. Migration for old local files is intentionally omitted for a fresh account; do not copy their metadata into the new account.
4. Resolve historical unrecorded-activity workflow, service-edit persistence and print/PDF parity before claiming your COMPLETE requested scope. Invoice/stock/money acceptance must have no unresolved discrepancy before real trading.
5. Update FEATURE-STATUS and REMAINING-WORK with implementation versus actual verification. Supply staff quick-start, incident contact, correction/reversal rules and daily closing routine.
6. Only then use a supervised shop pilot. Exact deletion of obsolete companies/files is a separate tenant-scoped operation with preview of IDs and linked assets; never reuse the evidence cleanup script as a company reset tool.
