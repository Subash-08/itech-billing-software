# Phase 3.5 completion notes

## Scope

Phase 3.5 completes purchase orders, posted supplier bills, physical receipts, stock lots and serial units, defective quarantine/restore, supplier returns and credit notes, supplier payments/advances/refunds, supplier statements, and purchase/inventory exports. Customer sales, customer receipts, customer returns, daily closing, and profit remain later phases.

## Authoritative relationships

- A purchase belongs to one tenant and one supplier. Product and charge lines keep immutable price/tax snapshots.
- Posting a supplier bill creates liability. Confirming an order or receiving stock alone does not create liability.
- A receipt creates stock lots and serial units. `quantityRemaining` mirrors `quantitySellable` for compatibility with the Phase 2 product stock summary.
- Quarantine moves sellable stock to defective stock with zero change to total on hand. Restore reverses that condition transfer.
- A supplier return removes stock from the selected lot and condition. An accepted credit note reduces only the linked purchase line liability. Excess credit becomes supplier advance.
- Supplier payments allocate to exact purchase lines or opening payables. Unallocated excess requires explicit advance consent.
- Cash and Bank are the only tenant accounts in this phase. Supplier payments cannot overdraw either account.
- The supplier statement uses chronological order: effective date, creation time, then record ID. Page balances include the brought-forward amount.

## Phase 4 and 5 compatibility

- Sales must consume `quantitySellable` and update the compatibility mirror `quantityRemaining` in the same MongoDB transaction.
- Reservations must move quantity between sellable and reserved without changing total on hand; serialized reservations must change the serial status atomically.
- Customer returns must restore the original sold lot where traceability exists and must not change supplier liability.
- Daily closing must read signed account movements; it must not recompute supplier settlements from UI state.
- Profit must use immutable purchase-lot cost snapshots and must remain protected by the existing profit unlock flow.

## Deployment storage

For a Linux VPS, set `PRIVATE_STORAGE_ROOT` to a persistent folder outside the application release directory, for example `/var/lib/itech-private`, grant the application user read/write access, and back it up off-server. A local folder is suitable on a persistent VPS. Vercel's runtime filesystem is ephemeral, so production files on Vercel require external object storage or a separate storage service.

## Status labels

- Purchases: LIVE
- Inventory: LIVE
- Suppliers: LIVE
- Returns: MIXED until customer-return persistence is implemented
- Customer, template, and remaining transaction modules retain their existing preview/mixed status.

## Verification rule

No test or browser suite was executed during this correction pass because verification was delegated to Antigravity by request. Use `PHASE-3.5-VERIFICATION-PROMPT.md` and record the actual results in `VERIFICATION-CHECKLIST.md` before Phase 4 begins.
