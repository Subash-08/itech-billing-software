# AntiGravity verification only: GST rates, PC quotations, and shop holidays

Authoritative repository: `D:\AI\itech`

## Strict scope

Verify the implementation described below. Do not redesign the workflow, refactor unrelated files, mutate existing production/company data, or silently fix failures. Use an isolated, uniquely prefixed tenant in `itech_dev`, track every inserted ID, and remove only those test records during teardown. If a check fails, report the exact request, response, database invariant, and likely source location before proposing a patch.

Run the focused checks first. Run the full Phase 2/3/3.5/4 suites only if a focused check exposes a cross-module regression.

## 1. Inclusive/exclusive GST rate contract

Test the shared invoice and quotation composer, including a saved inventory product taxed at 18%.

1. In GST-inclusive mode, enter `5000.00` in **Rate incl. GST**. Confirm **Rate excl. GST** is `4237.29`, taxable value and GST reconcile in integer paise, and total remains `5000.00` for quantity 1 with no discount.
2. Edit **Rate excl. GST** to `5000.00`. Confirm the inclusive field becomes `5900.00` and total is `5900.00`.
3. Switch the document to GST-exclusive mode. Confirm displayed inclusive/exclusive values and final total do not change during the switch. The selected field must be marked `Entry`.
4. In exclusive mode, enter `5000.00`; total must be `5900.00`. Edit the inclusive field to `1180.00`; exclusive must become `1000.00` and total `1180.00`.
5. Change GST from 18% to 12%. Confirm the active entry value is preserved and the derived counterpart and totals recalculate.
6. For Exempt and Non-GST lines, inclusive and exclusive rates must be identical and GST must be zero.
7. Repeat with quantity 3, percentage discount, fixed line discount, intra-state CGST/SGST, and interstate IGST. Confirm rounding uses integer paise and the tax split reconciles exactly.
8. Add an existing inventory product in both entry modes. Its saved selling price must seed the correct value without changing the product master or stock.
9. Save and reload a quotation and invoice draft. Confirm the chosen entry mode, stored rate, derived rates, GST, discount, and total are unchanged.
10. Issue one invoice and confirm its immutable snapshot, printable invoice, sales summary, receivable, stock movement, and customer statement all use the same totals.

## 2. Pre-built PC quotation workflow

1. Open `/quotations`; confirm **Pre-built PC quotation** appears beside **New quotation** and routes to `/quotations/new?mode=pc-build`.
2. Confirm the heading explains that catalogue products are stock linked and quick rows are non-stock quotation placeholders.
3. Quick-add Processor, Motherboard, RAM, SSD, SMPS, Cabinet, Monitor, and Operating System. Confirm each creates one editable row with quantity 1, description, HSN/SAC, both GST rates, discount, GST treatment, total, reorder, and remove controls.
4. Add a real catalogue product using product search. Confirm it retains `productId`, description, HSN, tax, warranty, and current selling price.
5. Add a custom item with label, category, multiline description, price, and quantity greater than 1. Reject missing label/category, negative price, zero quantity, fractional quantity, NaN, and overflow values with a clear message.
6. Remove and reorder rows; ensure `clientLineKey` identity remains stable and the correct row changes.
7. Save, reload, preview, print, share, expire, cancel, and convert the quotation to an invoice draft. Confirm quotation actions create no stock, receivable, payment, or account movement.
8. When converted, catalogue product rows must still require genuine stock allocation at invoice issue. Placeholder/custom rows must remain explicit non-stock rows and must never fabricate inventory or serial units.
9. Confirm a 10-line PC quotation and a 21-line quotation paginate/print cleanly with descriptions and matching browser/PDF totals.
10. Verify another tenant cannot read, edit, convert, or export the quotation.

## 3. Shop holiday and daily closing

1. On a zero-activity open day, select **Close as shop holiday**. Confirm the client omits `cashCountPaise` and `bankCountPaise`; the server accepts the close without counts and carries Cash/Bank balances unchanged.
2. Confirm the holiday close produces no synthetic sales, expense, profit, account movement, or stock movement.
3. Repeat with activity in each category: issued sale, collection, manual money entry, expense, supplier bill/payment, purchase receipt, customer return, supplier return, stock movement, service intake/status/parts/delivery, and profit adjustment. Every case must be rejected atomically with a useful message.
4. For a normal trading close, omit either Cash or Bank count. Confirm schema/service rejects it. Enter both counts and confirm reconciliation still works.
5. Plan a future shop holiday. Confirm writers are blocked on that date. Remove the plan and confirm the shop can post normally.
6. Confirm a planned holiday is labelled **Planned holiday**, while an actually closed zero-activity day is a finalized holiday closure. Planning must not itself create a daily closing.
7. Test stale `reviewVersion`, duplicate idempotency replay, changed-payload reuse, two concurrent close attempts, strict chronological closing, Kolkata midnight, and cross-tenant isolation.
8. Verify the missed-day flow can close only the earliest contiguous zero-activity prefix and cannot overwrite prior closures.

## 4. Fast gates and evidence

Run:

```text
npm run typecheck
npm run build
```

Add a focused integration test for the three contracts above. Reuse domain helpers and public APIs; direct MongoDB access is allowed only for isolated fixture setup, exact-ID cleanup, and read-only invariant assertions. Capture screenshots of:

- invoice in inclusive mode showing both rates;
- the same invoice in exclusive mode with unchanged total;
- PC build quick-add and edited line table;
- saved PC quotation preview;
- zero-activity holiday close with no Cash/Bank inputs;
- planned holiday list and clear explanatory text.

Report PASS/FAIL per numbered check, exact test counts, build/typecheck results, created/removed fixture counts, and any remaining production risk. Do not claim completion for checks that were not executed.
