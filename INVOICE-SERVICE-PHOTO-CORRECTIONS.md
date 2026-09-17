# Invoice and service photo corrections — 17 September 2026

Application: D:\AI\itech. Changes are local; deploy them to Vercel before testing the production URL.

## Findings and installed changes

1. Service updates unconditionally initialized Cash/Bank before loading the job. Photo-only updates now skip that financial dependency when status and diagnostic notes are unchanged. Tenant file checks, five-photo limit, optimistic version, no-removal evidence policy, audit, transaction and business-day fence remain. Status/diagnostic changes retain onboarding checks. Photos do not create money or stock movements. Re-saving a delivered job's photos no longer changes its delivery timestamp.
2. Invoice composer lines lacked explicit types for product/service catalogue selections and custom rows. These now have explicit Product, Service or Charge types. A service job URL selects service mode even if the job is absent from the bootstrap list. Legacy untyped rows without products map to Service only in service invoices, otherwise Charge. Explicit repair-service rows on sales invoices are rejected with the row number and corrective action; they are not silently reclassified.
3. Custom charge rows do not decrement inventory. Physical goods must come from the product catalogue and receive stock allocation at issue. Unallocated drafts can be saved; issuing still enforces stock allocation.
4. Invoice-form payment entries now populate the issue modal. Credit invoices start without a forced empty payment row. Invalid amounts are rejected before issuing, unchanged retries reuse their request key, and excess-as-advance starts unchecked for explicit consent. Real repair services still require their own service invoice.
5. Storage test rate-limit bypass is ignored in production and Vercel environments.

One non-incremental TypeScript check passed. No database or Cloudinary integration suite ran here; no user balances, opening setups or provider assets were changed. The exact deployed production request was not captured, so do not claim all deployed errors are verified resolved.

## Focused Antigravity acceptance prompt

Read this file and preserve existing work. Run focused acceptance using isolated fixtures; do not rerun every historical suite. Do not fabricate opening balances for the evidence account to conceal failures.

- On an existing job without finalized opening setup, append a fourth authorized image with unchanged status and notes. Save, reload and confirm persistence. Confirm no Cash/Bank initialization or movement occurred. Status/diagnostic changes still obey their setup constraints; display the error rather than silently discarding changes.
- Confirm closed-day protection, wrong-tenant file rejection, stale job version 409, max five photos, failed upload preservation, and deliveredAt unchanged when only photos change. Show photos must still load only after a click and hide/revoke afterward.
- Create sales invoice with a received product: explicit Product payload, exact stock/serial allocation, editable price, discounts, inclusive/exclusive GST, and no erroneous Service line.
- Add a custom charge and shipping/assembly charge to goods invoice. Verify Charge payload and no independent stock decrease. Add a real service via service invoice or service quotation; verify Service and consumed-part handling. Mixed repair Service/Product invoices must remain rejected clearly.
- Save an unallocated product draft successfully; attempt issuing without allocation and confirm guided allocation. Do not weaken server stock checks.
- Enter cash, UPI/account and split payments on the invoice form; open issue dialog and confirm exact carried amounts, method/account mapping, due and total. Issue on credit with zero payment rows. Reject negative, malformed and excess-precision amounts. Test partial/full payment and explicit excess consent. Replay unchanged issue request after an uncertain response and confirm one invoice/receipt/stock posting only.
- Attempt changing payment inputs after an uncertain request; inspect issued state before retrying. Never generate a duplicate financial posting. The server remains authoritative for idempotency and draft state.
- Verify production ignores DISABLE_AUTH_RATE_LIMIT even if accidentally set; development fixtures may use it only outside Vercel/production.

Run typecheck plus affected invoice/service/storage tests once. Record actual HTTP payloads/statuses with secrets redacted, screenshots, exact counts and cleanup. If another Invalid input appears, report its route and response field path; do not guess from the toast.

## Remaining gates

The upload quota transaction serializes admission, but expiring reservations is not Cloudinary asset cleanup. Safe orphan cleanup remains blocked. Historical platform-account rotation, legacy local-file migration, secret rotation, restore testing, PDF/print parity and the earlier business acceptance chains remain separate production gates. Existing photo-view evidence does not prove photo editing, and the evidence fixture's missing opening setup explains the reported account initialization failure.
