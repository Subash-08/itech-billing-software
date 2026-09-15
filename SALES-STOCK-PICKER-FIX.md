# Sales stock picker correction

Installed source changes; no tests/build/browser or database mutations performed here.

The backend correctly rejects an invoice line with quantity 1 and zero stock allocation. Stock on hand alone does not identify the lot/serial sold. The UI allowed saving an empty allocation and displayed no selectable serial list. It also reloaded data when unstable context function identities changed, inferred serial tracking incompletely, and loaded only the first stock page.

Corrections:
- Invoice save/issue opens the picker for an unallocated product line before making the invalid request. User chooses stock then submits again; no automatic posting.
- Clear Select stock / serial numbers action and a keyed picker per line.
- Picker loads stock pages with an explicit 2,000-record-per-resource safety bound, stale-response protection and visible retry errors. It never silently truncates a larger result.
- Serial checkbox options come from the selected lot or selected customer hold. Quantity/count, duplicate normalized serial and aggregate lot/hold capacity checks precede saving. Backend remains authoritative.
- Empty/mismatched allocation cannot be saved. Quantity change clears serial selection. FIFO uses oldest received lots and only serials actually loaded for each lot.
- Serial search uses canonical normalization instead of uppercase-only search against lowercase normalized values.

Antigravity: verify with isolated tenants; run typecheck/build and Phase 3/3.5/4 regressions. Test one of three received units, quantity-tracked and serialized products, two lots, repeated rows sharing a lot, held-only inventory, mixed held/ordinary stock, partial holds, other-customer holds, failed load/retry, empty allocation, more than one stock page, concurrent issue and rollback. Confirm selected allocation survives saving/reopening a draft and consumes exactly one unit on issue; supplier liability is unchanged.

When opening the form, product stock 3 does not prove 3 serialUnits exist. If the product was quantity-tracked on receipt, do not invent serials or flip tracking to bypass checks. Inspect product tracking plus actual purchase receipt and serialUnits if the picker shows no serials. Correct inconsistencies through an audited workflow.

The current source had an older template-resolution implementation than the preceding focused template fix. Preserve current changes, but separately compare against PHASE4-TEMPLATE-FIX-AND-VERIFICATION.md to ensure earlier fixes have not been reverted. This pass changes stock selection only.

Remaining UI work: for products exceeding the explicit picker bound, implement searchable/paginated per-lot serial selection rather than removing the bound. Do not mark the entire Phase 4 complete from this focused fix.
