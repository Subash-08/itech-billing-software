# Supplier return contract, stock traceability and settlement correction

## Status
Source changes prepared by Codex; no tests, builds, browser runs or Atlas mutations performed. Do not mark Phase 4 fully verified from this document. Verify in Antigravity using the real UI and isolated test companies.

## Root cause and changes
The old live Returns form sent `{purchaseId, stockCondition, lines:[{productId,quantity,serials}]}`. SupplierReturnSchema requires `{purchaseId,purchaseLineId,lotId,quantity,condition,disposition,serials,reason,idempotencyKey}`. Missing purchaseLineId/lotId caused the undefined-string error.

The live supplier flow now uses supplier-return-form.tsx with authoritative bill lookup, exact product line selection, receipt-lot selection, available/held/defective/sold/returned counters, eligible serial selection, amount-based payment/credit/due information and stable retry keys. Existing customer and demo forms remain separate. Search is paginated; stock selectors explicitly fail above 2,000 records rather than silently omit units. Multi-lot returns are separate recorded operations, clearly explained in the UI. A future batch endpoint must be atomic before offering a single multi-lot confirmation.

Purchase Overview now shows returned quantity, allocated payment/advance, applied credit and remaining due per line. It no longer labels received quantity-tracked stock as not received. Serial details remain in receipts/lot selection.

Backend now rejects a lot from a different purchase, line or product; duplicate serials; serials on nonserialized products; and serials from the wrong condition bucket. Quantity writes use available-stock predicates; serial writes repeat status checks. Credited supplier bills remain eligible for later physical returns. Return proration uses integer BigInt cumulative differences, preserving paise across split returns. Return credit acceptance rejects reversed returns and amounts above recorded valuation. Unrelated supplier adjustments belong to their own credit-note workflow.

Supplier return reversals must occur in reverse order on a purchase line to avoid repricing later split-return credits. Active credit notes must be reversed first and downstream credit consumption remains protected. Same-timestamp later-return ambiguity is blocked conservatively; do not bypass the guard with a direct DB edit. Historical returns valued by older code require a read-only reconciliation before changing or reversing them; this patch does not rewrite historical credits.

## Simple financial model

Related accounting defects found in the same inspection: payment and advance allocation predicates, supplier payables, statement purchase rows, due filters and summary totals excluded Credited/FullyCredited bills. They now include these posted-liability states. Cancelling/reposting checks recognize them too. Credit-note reversal now restores the exact line credited amount/due together with header amounts and derives payment status. Ambiguous multi-line historical credit allocation is rejected atomically rather than guessing which line to restore. Verify these paths explicitly before approving the phase.
Stock and settlement are different dimensions. A unit may be sold while its source bill remains unpaid. Never infer payment from a stock sale or mark individual units paid by dividing payment by cost.

For each purchase line expose original billed value, payment/advance allocations, credit applied, and remaining due. Supplier advances not applied to a line remain separate available credit. Allocations must reference the exact line, not just productId: a bill may contain the same product twice at different rates.

Example: three products on a bill totalling Rs 100,000, Rs 50,000 allocated payment. Display Partly paid, paid Rs 50,000, due Rs 50,000. If an accepted goods-return credit is Rs 30,000, due becomes Rs 20,000. If credit is Rs 70,000, offset due Rs 50,000 and create supplier credit Rs 20,000. Only an actual supplier refund increases Cash/Bank. A stock return or credit acceptance alone has no account movement.

User's Rs 180,000 example: received three at Rs 60,000; return two available units; one remains physically held. Pending credit acceptance: due still Rs 180,000. Accept Rs 120,000 credit: due Rs 60,000. Pay that due: account decreases Rs 60,000 and due becomes zero. Sales of the remaining unit create a separate customer ledger entry, not supplier settlement.

Sold units cannot go straight to supplier return. Record a genuine customer return into the appropriate stock condition first. Reserved units require release. Defective units are excluded from sellable stock. Returned units cannot be sold or returned twice. Never invent serials for units received under quantity tracking; tracking-mode migration is a separate audited operation.

The quantitySold bucket describes currently issued units from the lot, not all historical sales revenue. Invoice allocations and stock movements provide historical sale/customer links. Warranty replacements and customer returns must preserve those source links. A comprehensive purchase-source-to-customer drilldown remains a follow-up UI item; do not claim the new counters alone provide it.

## Antigravity verification prompt
Work in D:\AI\itech. Preserve all existing edits and secrets. Read this document and review the current diff before running checks. Do not weaken server guards or directly mutate financial data to make a test pass.

1. Run typecheck, domain tests, Phase 2/3/3.5/4 regression suites and build. Adjust fixtures only for intentional contract changes (mandatory customer phone, exact supplier return line/lot). Report exact commands and results; do not claim a browser check based on API tests.
2. Reproduce the user's actual Returns UI flow: select received unpaid bill, exact line and receipt stock, return two of three, confirm once, inspect persisted return quantity and lotId/purchaseLineId. Confirm retry creates no duplicate.
3. Accept the supplier credit note through the supplier profile. Assert bill-line due, aggregate due, supplier statement and available advance reconcile; no cash movement until payment/refund. Confirm refreshed purchase Overview and Returns/Credit notes tabs show the same records.
4. Cover zero/partial/full payments, different-line allocations, opening payables, multiple advances and explicit excess, partial credit acceptance, credit exceeding due, supplier refund/reversal and consumed-credit reversal rejection. Never call due reduction Paid cash.
5. Cover same product on two purchase lines at different costs, multiple receipts, partial reception, mixed sold/held/available/defective quantities, one-unit and all-unit returns, wrong-source lot, cross-tenant IDs, serialized wrong-lot/wrong-status/duplicate-case serials and nonserialized input. Reserved/sold stock must remain unavailable.
6. Race return against sale/reservation/quarantine/another return; verify transaction rollback with no negative counters or duplicate serial transitions. Race credit acceptance and payment. Same idempotency key/same payload replays; changed payload returns conflict.
7. Check split-return paise conservation for fractional-unit prices, line discounts, CGST/SGST and IGST. Check return/credit/reversal ordering. Existing historical amounts must never be silently recomputed by a migration.
8. Verify UI empty/error/retry states, slow request then changed bill, archived supplier with unsettled posted bill, page-two bill selection, serialized zero-availability, and no fake editable adjustment amount. Selector caps must show errors rather than partial results.
9. Follow-up UI: add source traceability on purchase/product detail linking receipt -> lot/serial -> customer invoice -> customer return -> supplier return, with paginated authoritative endpoints. Keep financial allocations separate from physical-unit status. Preserve filters and show actual payment/credit references. Do not duplicate ledger calculations in the browser.
10. Before Phase 5, verify every affected read model refreshes (inventory, purchases, supplier due, statement, customer returns). Phase 5 must consume signed account movements; supplier settlement is not a duplicate shop expense. Returns/profit corrections require the documented current-day adjustment policy.

Update DEVELOPMENT-LOG.md and VERIFICATION-CHECKLIST.md with failures, fixes and browser evidence. Leave unfinished work labelled accurately. No production data cleanup, irreversible deletion, or direct cutoff changes.
