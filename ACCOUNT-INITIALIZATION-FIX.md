# Opening setup to financial posting: initialization fix

## Confirmed defects

- Opening finalization posted accountMovements but did not create tenantAccountBalances or the Phase 3 readiness marker.
- Legacy opening entries used amountPaise/direction; the old migration summed only qty, silently dropping nonzero opening balances.
- Old migration read outside its transaction, checked only Cash for active projections, and clamped negative totals to zero.
- The reconciliation reader had the same legacy-amount omission and treated missing balances as zero.

## Installed changes

- server/account-initialization.ts: shared transactional initialization, strict signed/legacy amount decoding, bounded cursor, BigInt accumulation, finalized opening total checks, both-account reconciliation and preservation of existing balances. Version 2 readiness means this corrected initialization completed. No historical movement is rewritten or added by recovery.
- server/master-service.ts: finalization creates Cash/Bank balances and readiness in the same transaction as opening setup. New opening movements also include canonical signed qty consistent with their legacy fields.
- server/purchase-service.ts: posting guard safely initializes previously finalized companies, reusing an existing transaction where applicable; explicit migration delegates to the same logic and audits; reconciliation understands both amount formats and reports absent projections as absent.

## User action

Reload the app if necessary, reopen the existing invoice draft and retry issue. The backend initializes the current tenant from its actual ledger before financial posting. This includes a finalized zero-opening company. Do not manually toggle phase3Migration or add fake balances. If a mismatch is reported, inspect it instead of bypassing the guard. No tenant records were changed directly during this code patch.

## Antigravity verification prompt

Review the installed diff in D:\AI\itech. Codex did static inspection only; no tests, builds or live DB operations were run.

1. Run typecheck, domain tests, Phase 2, Phase 3, Phase 3.5 and Phase 4 suites plus build. Existing fixtures must finalize a legitimate opening setup; do not bypass the public initialization behaviour with manual flags.
2. Finalize a fresh company at zero: two zero account rows and version 2 readiness must exist atomically. Repeat posting cannot create duplicate balances.
3. Finalize nonzero Cash/Bank: opening signed movements and projections must agree exactly. Both amountPaise/direction and qty representations must reconcile once, not twice.
4. Previously finalized legacy company: initialize using opening amountPaise/direction plus later signed movements. Retain valid existing projections and versions; reject any mismatch without overwriting balances.
5. Test missing one/both account rows, stale Completed/version 1 markers, conflicting existing Bank with valid Cash, duplicate projections, invalid/unsafe amounts, negative ledger totals, unknown accounts and inconsistent dual-format amounts.
6. Concurrent initialization/posting: exactly one effective initialization; no lost financial movement, partial marker or partially created account pair. Verify caller transaction reuse, especially Record+Receive+Pay and invoice issue.
7. Failure later in invoice issue rolls back any initialization performed inside that same transaction. Retry safely; no duplicate receipt or stock effect.
8. Ledger reconciliation must include legacy amounts and must not report a missing zero account as reconciled.
9. Use isolated tenants and exact cleanup. Verify cross-tenant isolation. Preserve all records for real test 1 unless a deliberate user operation posts them.
10. Inspect the earlier direct cutoff edit separately: detect inconsistencies between finalized setup dates and opening entries. Do not change historical dates automatically in this repair.

For the user's actual company, retry the existing draft in the browser after this patch. If reconciliation rejects existing records, produce a read-only discrepancy report before proposing a targeted audited correction. Never weaken guards or reset balances to make tests pass.

Update DEVELOPMENT-LOG.md and VERIFICATION-CHECKLIST.md with actual outcomes. The entire Phase 4 is not declared complete by this focused fix. Phase 5 remains pending.
