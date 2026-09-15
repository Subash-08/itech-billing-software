# Purchase receipt correction and verification handoff

Authoritative checkout: D:\AI\itech. Static review and source correction only; no tests/build or database operations executed by Codex.

## Defects corrected

Purchase reload spread raw API lines directly into UI Line objects, losing name and other normalized properties. It also restored full ordered quantities rather than remaining quantities. Receipt detection relied on a purchase being present in the initial bootstrap array, so a later-page purchase could enter the wrong workflow. Basic bill validation blocked receipts with skipped/completed rows or old due dates, and posted bills disabled receipt quantity changes. The store generated a different receipt idempotency key for every retry.

Changes:
- components/documents.tsx uses mapPurchaseFromApi for reloaded rows, explicit receipt-route mode, remaining ordered-minus-received-minus-cancelled quantities, receipt-only validation and readiness guard, editable receipt quantities including zero-to-skip, stable retry request identity/date, and recoverable purchase action errors. Missing/nonfinite basic line fields no longer cause a trim crash. Receipt requests contain only existing line IDs, quantities and serials.
- components/store.tsx accepts the captured receipt key/date and continues refreshing live data after receipt.
- lib/mappers.ts preserves zero tax/zero cost rather than defaulting to 18% or another cost, and normalizes line names, HSN/SAC and warranty display fields.

## Business relationship

Post supplier bill -> supplier liability, no payment. Receive goods -> stock lots/serials/movements, no payment and no reduction of supplier due. Sell goods -> sales/customer balances/stock changes, no automatic supplier payment. Pay supplier later -> allocation to selected bill/lines, supplier due reduction, one outgoing Cash/Bank movement. Supplier payment must not also be booked as a duplicate expense or duplicate daily-register entry.

Example: posted bill 180000 rupees, zero paid, receive 3 units. Status becomes received and unpaid; supplier due remains 180000. Later payment 20000 from Bank leaves due 160000 and reduces Bank by 20000 once. Sales proceeds are independent incoming payments. Phase 5 must read the existing authoritative account movements rather than recreating these entries.

## Antigravity verification prompt

Review the installed diff; run typecheck, Phase 3/3.5/4 regressions and browser receipt chains with isolated tenants. Do not claim these passed on behalf of Codex.

1. Reopen the user's existing purchase via its /receive URL. Confirm every item has its name, zero rates/taxes preserved, and quantity is remaining, not original ordered.
2. Post a 3-unit unpaid bill. Receive 1, verify stock +1, supplier due unchanged, zero account/payment movements. Reopen: remaining 2. Receive 2; reject another receive/over-receipt without any stock change.
3. Mixed completed/remaining/charge lines: zero skipped rows and charge lines never submitted; no need to edit old due dates to receive current-day stock. All-zero receipt shows a useful validation message.
4. Serialized products require exact unique serials; quantity-tracked products receive without serials. Server rejects wrong tenant/line, repeated serial and over-receipt atomically.
5. Refresh directly on a purchase beyond bootstrap page 1. Explicit /receive routing must work without cached purchase presence.
6. Repeated same submission after a simulated uncertain response uses the same key and date. If editing a previously attempted payload, reopen and inspect receipt history before creating a new receipt; do not silently generate a new key for a possibly committed operation.
7. Sell received goods before supplier payment; do not settle supplier automatically. Then use Pay supplier for partial payment and verify purchase status/due, supplier profile/statement and Cash/Bank projection/movement exactly once. Follow an advance/return case as appropriate.
8. Confirm /purchases/new and draft editing have not become receipt actions. Review remaining draft confirm/post edit semantics separately: creating duplicate orders while editing must not be treated as completion.
9. Existing detail already shows Unpaid/PartlyPaid and Balance due; keep stock receipt status independent. Use human labels, and verify full refresh updates all related views. Daily Closing remains Phase 5; document reuse of these movements there.
10. Verify no unintended rate/product edits, add/remove/reorder controls or invoice-only payment controls are exposed in receipt mode; simplify/disable remaining irrelevant controls as needed without rewriting posted bill data.

Do not reset real purchase/stock records or recreate the user's existing bill to work around the UI error. Update DEVELOPMENT-LOG.md and VERIFICATION-CHECKLIST.md with actual results and remaining gaps.
