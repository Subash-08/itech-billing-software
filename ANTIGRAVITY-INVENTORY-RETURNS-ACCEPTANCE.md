# Targeted inventory, customer due, and returns acceptance

Use the current `D:\AI\itech` checkout. Do not modify production or existing tenant data. Create one isolated approved test tenant, finalize opening setup with yesterday as cutoff, and run only the focused scenarios below. Do not run Phase 2/3/3.5/4 regression suites unless a focused scenario fails and the failure needs isolation.

## Verification rules

- Use API/UI workflows for business mutations; direct MongoDB access is allowed only for read-only invariant checks and exact test-tenant teardown.
- Record HTTP status, visible UI result, account balance, document due, stock-lot buckets, serial status, and relevant report totals after each step.
- Every amount is integer paise in MongoDB. No balance may become negative and no transaction may be counted twice.
- Do not change implementation unless a scenario fails. Report the exact route, payload, response, file/line suspected, and the smallest recommended correction.

## Scenario A — product price history and stock selection

1. Create serial-tracked product `LG 24-inch Monitor`, HSN `85285200`, GST 18%, default purchase cost ₹7,000 and selling price ₹9,000.
2. Purchase and receive 3 units at ₹7,000 with serials `MON-004`, `MON-005`, `MON-006` without supplier payment.
3. Make a second purchase of the same product at ₹7,500 and receive serial `MON-007`. Do not create a second product master.
4. Verify Stock lots shows separate ₹7,000 and ₹7,500 costs and Purchase sources preserves both bills.
5. Create an invoice for quantity 1. Open stock selection and verify rows appear immediately, available serials are selectable, customer holds appear first, and “Choose oldest stock (FIFO)” suggests the oldest lot. Select `MON-006` manually to prove the cashier may override FIFO.
6. Issue the invoice and verify only `MON-006` becomes Sold, the exact source lot decreases, and other serials remain InStock.
7. Add a custom charge line named `Delivery charge`. Verify it affects invoice sales/tax/due but creates no product, lot, serial, warranty, or stock movement.
8. Verify the UI clearly says a physical item missing from inventory must be created as a product and stocked before sale.

## Scenario B — customer list and partial customer return

1. Issue a ₹7,000 invoice to `Return Test Customer`; receive ₹4,000 into Bank and leave ₹3,000 due.
2. Verify Customers list shows ₹3,000 outstanding, invoice count 1, and last sale date.
3. Open Returns → Customer return. Verify the issued invoice loads from the live API and one product line can be selected independently.
4. Return the full ₹7,000 line as Restock sellable and select Refund now to Bank.
5. Verify ₹3,000 return credit offsets invoice due, only ₹4,000 leaves Bank, invoice due becomes zero, the exact lot/serial returns to sellable/InStock, sales net reduces by ₹7,000, and the return appears in customer timeline/reports.
6. Repeat with Quarantine and verify quantityDefective increases instead of quantitySellable.
7. Verify a second return of the same quantity/serial is rejected, another customer’s invoice is inaccessible, service/charge returns use NoStock, and insufficient Cash/Bank blocks Refund now atomically.

## Scenario C — supplier return, credit, allocation and refund

1. Purchase 3 monitors for ₹21,000, receive all three, pay supplier ₹10,000, sell one, and leave two sellable.
2. Return the two remaining units to the supplier. Verify sold/reserved units cannot be chosen and the stock return itself moves no Cash/Bank and initially changes no payable.
3. Confirm the supplier credit note for ₹14,000 with “Reduce original purchase-line due” enabled.
4. Verify ₹11,000 clears the original payable and ₹3,000 becomes an available supplier advance. Credit-note table must show ₹14,000 and advance date must be valid.
5. Allocate ₹1,000 of that advance to another posted bill. Verify no Cash/Bank movement and both bill/advance balances update once.
6. Record the remaining ₹2,000 as a Bank refund. Verify Bank increases ₹2,000, SupplierRefund appears once in cash/account register and daily flow, and available supplier credit becomes zero.
7. Verify manual Money In is not used for this refund and replaying the same idempotency key does not duplicate money, credit, stock, or ledger records.

## Scenario D — concurrency and failure safety

1. Race two invoice issues for the same final serial: exactly one succeeds.
2. Race two returns for the same serial: exactly one succeeds.
3. Retry unchanged customer return, supplier return, credit acceptance, and supplier refund requests with their original idempotency keys: return the original result without duplication.
4. Change a payload while reusing its key: HTTP 409.
5. Verify tenant B cannot read or mutate tenant A’s invoices, lots, returns, advances, or payments.

## Required report

Return a compact table with each scenario marked Pass/Fail, the document IDs used, before/after Cash and Bank, before/after customer/supplier due, stock/serial transitions, report reconciliation, and any browser console errors. Include screenshots only for the customer list, direct serial selection, customer return settlement, and supplier advance/refund result.
