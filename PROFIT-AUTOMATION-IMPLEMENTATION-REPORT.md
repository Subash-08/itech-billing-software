# Automatic GST-aware profit accounting — implementation report

Authoritative application: `D:\AI\itech`

## Implemented behavior

- Purchase product lines now store whether eligible input GST credit is claimed.
- The purchase UI defaults to **Claim eligible GST**, suitable for a regular GST resale purchase, and allows **Do not claim** for blocked/non-creditable GST.
- Every new purchase receipt freezes an exact lot economic cost:
  - credit claimed: discounted taxable value, excluding recoverable GST;
  - credit not claimed: discounted supplier total, including GST.
- Partial receipts use cumulative integer-paise allocation, so the final receipt absorbs rounding and the lot costs reconcile to the purchase line.
- Invoice issue freezes product cost from the exact selected lots. FIFO is only a suggestion; choosing a different lot correctly uses that lot's cost.
- Consumed service parts freeze their exact source-lot cost and contribute to the service invoice profit without decrementing stock twice.
- Service and manual charge lines use an owner-only **Confirm direct cost for automatic profit** action inside the existing pricing helper. The cost is private and is not printed.
- Invoice profit is `taxable sale value after discount − frozen product/direct cost`. Output GST and customer/supplier payment timing do not change profit.
- Customer returns reverse the exact prorated taxable revenue and exact prorated issued cost. Returns against already-closed days create an automatic signed current-day adjustment.
- Daily closing and Profit reports use an owner override when present; otherwise they use automatic profit. A day is blocked only when a service/manual line still has genuinely unknown direct cost.
- Profit access restores correctly after refresh, expires at the server-provided deadline, and automatically returns the browser to Staff mode.
- Locked invoice/list APIs omit private cost and profit fields. Staff edits preserve an owner's previously confirmed draft cost. Customer-facing issued snapshots contain no private cost fields.

## Compatibility policy

- No existing stock, invoices, closings, or money records were rewritten.
- New receipts have the exact GST-aware `costTotalPaise` basis.
- Older lots without that field use their existing `costPaise × received quantity` as a safe legacy fallback.
- Existing issued invoices keep their existing manual-profit workflow. New invoices receive automatic profit snapshots.
- Existing closed days remain immutable.

## Verification already run

- `npx tsc --noEmit --incremental false` — passed with 0 errors.
- `npm test` — passed 26/26 domain tests.
- `git diff --check` — passed; only existing line-ending notices were emitted.

## Manual browser acceptance scenarios

Use a new product called **Profit Test SSD**, GST 18%, quantity 3.

### 1. GST-inclusive purchase with ITC

1. Create a purchase for 3 units at ₹1,180 each, GST inclusive.
2. Keep **Claim eligible GST** selected.
3. Post the supplier bill and receive all 3 units.
4. Sell 1 unit at ₹1,770 GST inclusive and issue the invoice.
5. Unlock profit and open Daily Closing.

Expected:

- supplier payable: ₹3,540;
- stock economic cost: ₹1,000 per unit;
- sale taxable value: ₹1,500;
- automatic profit: ₹500;
- paying or not paying the supplier does not change ₹500 profit.

### 2. Same purchase without ITC

1. Repeat with a different product/lot at ₹1,180 inclusive.
2. Select **Do not claim**.
3. Sell for ₹1,770 inclusive.

Expected automatic profit: ₹320 (`₹1,500 taxable sale − ₹1,180 full cost`).

### 3. Different purchase prices / selected lot

1. Receive 1 unit at taxable cost ₹1,000 and another lot at taxable cost ₹1,200.
2. Issue one invoice selecting the ₹1,200 lot manually.

Expected: profit uses ₹1,200, regardless of the product master selling price or older lot.

### 4. Partial receipt rounding

1. Buy 3 units with a line-level discount that produces a paise remainder.
2. Receive 1 unit, then receive 2 units.
3. Sell all 3.

Expected: the two receipt lot costs add exactly to the purchase line's economic cost; total COGS has no lost paise.

### 5. Service and direct cost

1. Create a service invoice with labour taxable value ₹1,000.
2. Unlock profit, open **Help me set the selling price**, enter ₹200 direct cost, and click **Confirm direct cost for automatic profit**.
3. Add a consumed part whose received lot cost is ₹300.
4. Issue the invoice.

Expected: automatic profit equals service/part taxable revenue minus ₹500 combined direct cost. The invoice PDF must not show either cost.

### 6. Missing service cost

1. Create a service/manual charge line but do not confirm direct cost.
2. Issue it and open Daily Closing.

Expected: the invoice is marked as needing a profit/cost decision and closing is blocked until an amount is entered. A confirmed zero is accepted only when explicitly saved as zero cost.

### 7. Customer return before closing

1. Sell 2 units from one known-cost lot.
2. Return 1 unit before closing the sale date.

Expected: stock returns to the chosen condition bucket; invoice automatic profit reduces by exactly the returned unit's taxable margin; cash changes only if a refund is actually made.

### 8. Customer return after closing

1. Close the sale date.
2. Return one unit on the next open day.

Expected: the closed day does not change; the current day gets an automatic negative profit adjustment.

### 9. Security/session

1. Confirm a service direct cost while profit is unlocked and save the draft.
2. Lock profit, reload the draft, change only the printed note, and save.
3. Unlock again.

Expected: the saved cost remains; it was not visible while locked. Wait until the 10-minute expiry and confirm the UI changes back to **Unlock profit** without a refresh.

## Focused AntiGravity verification prompt

Work only in `D:\AI\itech`. Do not change production or user data. Create isolated tenants and clean them in `finally`. Verify the nine scenarios in `PROFIT-AUTOMATION-IMPLEMENTATION-REPORT.md`, including exact MongoDB assertions for purchase line taxable totals, `stockLots.costTotalPaise`, issued line `costOfGoodsPaise`, invoice `calculatedProfitPaise`, return `returnedCostPaise`, post-close automatic adjustment, and locked API redaction. Also race two invoice issues against the same lot and confirm exactly one succeeds when stock is insufficient. Run only the new focused suite, `npx tsc --noEmit --incremental false`, and `npm test`; do not run all Phase 2/3/3.5/4 suites unless the focused suite reveals a regression. Report exact pass/fail counts and always remove test tenants.
