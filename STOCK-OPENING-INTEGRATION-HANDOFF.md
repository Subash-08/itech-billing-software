# Implemented stock-adjustment and opening integration

Codex source integration, without test/build/browser execution or database mutations. Earlier passing suites do not verify these changes. Preserve the source baseline; do not rerun staging edit.py.

## Implemented

- New stock-adjustment-core.ts performs transaction-only physical removal from exact lots. Serialized removal resolves available units and uses shared CAS transitions to Removed. Nonserialized removal consumes available lots FIFO with deterministic ordering and bounded cursor processing. Reserved/sold/defective units are not eligible. Lot mutations, serial mutations, movement and audit roll back together on error.
- Lot quantityRemoved records physical removals separately from supplier returns. Conservation now includes removed units; quantityRemaining stays equal to quantitySellable. Legacy inconsistent lots block with a reconciliation message rather than inferred backfills.
- Manual negative adjustment produces one authoritative movement with signed onHandDelta/sellableDelta and source lotAllocations. No duplicate per-lot movements. Inventory movements filtered by lot include allocated multi-lot adjustments and project that lot's quantity/serials, retaining documentQty for reference.
- Purchase receipt reversal rejects lots with physical removals. Purchase conservation migration checks and inventory mappers/schema/display include quantityRemoved. Removing stock does not pay a supplier, create a credit or change cash/bank.
- Positive adjustments continue through the shared duplicate-checked serial creator. Nonserialized products reject serial input. Server adjustment schema enforces nonzero bounded whole quantities. Idempotency also compares reason and normalized serial selections; a changed request conflicts rather than replaying an unrelated movement.
- Opening finalization checks duplicate serial identities across ALL draft lots using the shared creation helper before inserts, rejects serials on nontracked products, and posts explicit stock movement deltas. Opening and adjustment lots initialize quantityRemoved to zero.
- Restored initializeAccountBalances in the same transaction AFTER the opening record is marked Finalized and before commit/audit success. The checked-out master service had lost this call. Zero and nonzero account balances must both initialize; initialization cannot reset an existing inconsistent ledger.
- Inventory form explains the distinction between physical removal, supplier return and quarantine. Stock lots display Removed / written off separately from on-hand.

## Policy limits

Negative manual adjustment is a physical stock removal/write-off, not defect classification. For damaged goods still held by the shop use Quarantine/Restore. For sending goods back use Supplier Return and credit acceptance. Restoring a physically removed unit needs its own audited reversal contract; do not recreate the same serial through positive stock adjustment. This patch does not implement that reversal.

Historical removals without source lots/counters are not repaired automatically. Missing removed counters default to zero only for otherwise conserving lots; a mismatch requires review. No existing tenant metadata or records were migrated by this work.

## Fast Antigravity verification prompt

Work in D:\AI\itech and read STOCK-OPENING-INTEGRATION-HANDOFF.md. Preserve the installed code and other uncommitted changes. Do not reapply prior snapshots. Start with one typecheck, then these focused cases in isolated fixtures:

1. Fresh opening: three serialized units across multiple lots; normalized duplicate across lots must roll back opening, serials, stock and accounts. Valid opening initializes exact zero/nonzero Cash/Bank once. Same finalized opening cannot be posted twice.
2. Positive adjustment: new serial accepted; existing sold/returned/removed serial rejected. Nontracked product with serial text rejected. Cutoff and archived product guards remain intact.
3. Physical removal: remove two available units from multiple lots, serialized and nonserialized. Assert remaining + removed buckets, single product movement, lot-filtered movement quantities, removed serial states, unchanged supplier/customer dues and unchanged Cash/Bank. Stock receipt reversal must reject downstream removal.
4. Failures: sold/held/defective serial, excess quantity, wrong tenant/product/lot, duplicate serial and inconsistent legacy lot. Verify complete rollback. Race removal with sale/hold and repeat idempotent requests; no negative or duplicated stock. Changed reason/payload under same key conflicts.
5. Quarantine/restore still preserves physical on-hand and does NOT increase quantityRemoved. Supplier return still increases its own returned bucket, not removed. Check inventory display and source-lot history after refresh.

Fix an actual failure and rerun affected cases only. Once the patch is stable, run the appropriate Phase 2/3/3.5/4 regressions and build once; do not restart the entire browser onboarding loop after every edit. Browser infrastructure failure does not justify repeated retries or claims of browser Pass. Leave manual checks pending until performed.

Remaining separate work: complete the safe serial migration/readiness rollout and audit remaining writer coverage from SERIAL-CORE-PATCH-AND-FAST-HANDOFF.md. Do not re-enable migration apply on the user's company or reset finalized opening dates. The new physical-removal bucket also needs explicit inclusion in future exports/reports and any new schema-level conservation checks. Source changes discovered after this patch require review rather than silent overwriting.

After focused integration acceptance, the next complex feature is Phase 5A's shared transactional day-close fence; routine Cash & account / daily summary UI follows. Current live/sidebar classifications remain unchanged because this is backend integration, not evidence that pending service/profit/register features are finished.
