# September 30 verification-only handoff

Authoritative checkout: `D:\AI\itech`

## Rules

- Verification only. Do not edit source files, database indexes, or existing company records.
- Use a fresh isolated test tenant and unique names prefixed `SEP30-QA-`.
- Record exact expected versus actual values, screenshots, request timing, and any console/API error.
- Delete only records created by this test tenant when finished.

## 1. Price-entry and GST acceptance

Create or use a stock-backed product with 18% GST and an available unit. Add it to a draft invoice.

1. Select **GST inclusive**, enter `118.00`, quantity `1`, no discount. Expect base `100.00`, GST `18.00`, total `118.00`.
2. Switch that line to **GST exclusive**. Expect entered exclusive rate `100.00`, derived inclusive rate `118.00`, and unchanged total `118.00`.
3. Change the exclusive entry to `200.00`. Expect derived inclusive rate `236.00`, base `200.00`, GST `36.00`, total `236.00`.
4. Switch to **Non-GST**. Expect GST `0.00`; only the active inclusive entry remains editable.
5. Switch to **GST exempt**. Expect GST `0.00` and the treatment to remain distinct from Non-GST after saving/reloading.
6. Switch back to taxable inclusive and verify the product GST rate is restored. Repeat with 5%, 12%, 18%, and 28%.
7. Verify percentage and fixed-amount discounts in both inclusive and exclusive modes.
8. Verify intra-state produces CGST + SGST and interstate produces IGST only.
9. Save as draft, reload, and issue. Verify line modes, amounts, and tax treatment are unchanged.
10. Verify editing the sale price did not change the product master sale price, source lot cost, purchase bill, or stock quantity other than the issued quantity.
11. Verify sales report, customer due, receipt amount, and daily closing use the issued invoice total exactly once.

## 2. Address policy

1. Save a draft and quotation for an unregistered customer without an address. Both must succeed.
2. Issue an unregistered invoice with taxable value below ₹50,000 and no address. It must succeed.
3. Try to issue an invoice with taxable value ₹50,000 or above and no address. It must be blocked with the address-specific message.
4. Try to issue an invoice for a customer with a GSTIN and no address. It must be blocked.
5. Add the billing address and issue both blocked cases successfully.
6. Enable a separate ship-to address. Blank name/address/state must be rejected; a complete address must be snapshotted on the document and PDF.

## 3. Manual profit and closing

1. Issue two invoices for the open day.
2. Enter profit for only one and save. Reload the day. The saved row must show its amount when profit is unlocked, or `Entered · unlock profit to view or edit` while locked. It must never revert to `Pending`.
3. Attempt to close the day. The server must reject closing and identify the remaining invoice whose manual profit is missing.
4. Enter `0.00` as the second invoice profit and save. Zero is a valid entered value.
5. Reconcile Cash and Bank, close the day, and confirm both saved profit amounts appear in the finalized snapshot.

## 4. Invoice/PDF visual acceptance

Use the same issued service invoice for preview, Print/Save as PDF, direct Download PDF, and batch ZIP.

1. Verify an ordinary invoice with 1–5 lines is exactly one A4 page in every output.
2. Verify the outer border, item grid, tax table, declaration, bank details, signature block, and footer have consistent line weight and stay inside the page margins.
3. Verify no nearly blank second page contains only the signatory or footer.
4. Verify logo and text remain legible at 100% zoom and in a printed sample.
5. Verify single download and ZIP copy show the same template fields, ordering, totals, and filename.
6. Verify a genuinely long invoice may paginate, but no row is cut through the middle and the totals/signature remain together.
7. Compare screenshots with `C:\Users\Dell\Downloads\INVOICE 173.pdf`; report remaining visual differences rather than modifying the renderer.

## 5. Performance evidence

Run once after a cold deployment start and again after warm-up for `/sales`, `/customers`, and `/profit`.

1. Capture browser Network timings for each API request and total usable-page time.
2. Confirm the first cold request may run the versioned index migration once; later cold instances read only the `schemaMetadata/required-indexes` marker.
3. Confirm each authenticated API still rejects an expired session, disabled user, unapproved user, disabled tenant, and cross-tenant identifiers.
4. Target: warm API calls should no longer pay for complete MongoDB index-catalog inspection. Report any individual endpoint over 1 second with its URL and server timing.

## 6. Automated gate

Run:

```powershell
npm run typecheck
npm test
npm run build
```

Then run only focused sales/closing integration tests already present in the repository. Do not rerun every historical phase suite unless a focused check fails or a shared invariant was changed.

Return one report with: pass/fail per numbered case, screenshots/PDF page counts, performance timings, command outputs, cleanup result, and no source changes.
