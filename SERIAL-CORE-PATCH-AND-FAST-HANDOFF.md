# Serial core patch and focused completion handoff

## What Codex changed

Source edits only. No tests/build/browser runs and no database operations were performed. Do not reuse previous passing counts as evidence for this patch.

- serial-identity.ts: invoice ownership and legacy version predicates now compose under AND. Previously the second `$or` overwrote the invoice constraint, allowing a wrong owner to pass the shared transition guard.
- Transition type now enforces an explicit source/destination state table. Exact tenant/product/source lot, active Mongo transaction and required hold/invoice ownership are enforced. Cross-lot generic restore is blocked. Unit version zero/missing remains compatible; stale versions fail.
- Customer return and warranty replacement callers now pass invoice and line ownership into the atomic transition. Last invoice/line history is retained separately from current ownership.
- Legacy resolver queries aliases together, returns at most two matches and has a five-second database query timeout. It catches ambiguous canonical/legacy identities even when one exact canonical match exists. It never rewrites serialNormalized during a lookup. Missing/inconsistent original and canonical facts block instead of being guessed.
- Creation helper checks legacy aliases too; a lowercase-only lookup was insufficient to reject an existing uppercase serial.
- Shared transitions touch the serial gate with an incrementing writeVersion inside the enclosing transaction, not a potentially unchanged timestamp alone. This is NOT proof that every application creator has adopted the gate; audit remaining callers below.
- Readiness/audit materialization has an explicit 5,000-unit limit with error beyond that size, rather than unbounded memory use or silent truncation. This is a temporary limit, not a completed paginated migration tool.
- reconcileTenantSerials now defaults to read-only and rejects apply. The prior function could change real serial keys by default without maintenance locking, expected-value checks, a journal or approval. Re-enable apply only after implementing those requirements.

## Remaining scope (do not claim fully complete)

1. master-service.ts positive adjustments still have their own lookup/insertion path and can attempt to reuse Removed/Defective serials in a new lot. The new shared guard rejects that mutation. Route legitimate defect restoration through existing quarantine/restore flow on the original lot. A positive stock addition must call the shared creation helper and preserve no-reuse policy. Opening creation also must share duplicate/fence checks across all lots.
2. Inspect negative adjustments and lot conservation end to end. Do not infer Defective from reason text. Quarantine transfers sellable -> defective without changing on-hand. Physical removal needs an explicit removed bucket, valid movement and all read models; leave unsupported removal blocked until complete.
3. The compatibility resolver is bounded in results/time, but regex alias lookup may scan tenant records. Complete the indexed canonical migration/readiness strategy from SERIAL-IDENTITY-PLAN-CORRECTIONS-AND-EXECUTION.md before a large deployment. Do not present this compatibility path as a fully indexed production migration.
4. Audit and apply must be separate. Apply needs an approved tenant scope, coordinated writers, expected old values, resumable journal, collision checks and post-reconciliation. Do not run apply on test 1. Existing original labels must never be invented to pass a fixture.
5. Verify state transitions for receipt reversal and physical removal use their actual business meaning. Current receipt reversal calls SupplierReturn for serial status; assess lot/receipt lineage before changing that contract. Do not flatten every reversal into one generic state change.

## Avoid the repeated testing loop

Run tests in two passes, not after each individual edit:

**While implementing:** one typecheck and a focused helper/lifecycle suite after a coherent patch. Do not rerun signup/browser onboarding or all historical phase suites after every change. If a test fails, diagnose the first failure and rerun that case and directly affected cases.

**At completion:** run the affected regression suites and build once after the final code change. Broaden/repeat only when a new failure or new cross-module change justifies it. Report command, elapsed time, result, checkout state and actual assertions. Stop browser infrastructure retries after two focused attempts; use a manual checklist, marked pending until performed.

### Focused checks for this patch (Antigravity executes)

1. A unit with version missing/zero but wrong invoice ID must fail. Correct invoice with stale version must fail. Both ownership and version checks apply simultaneously.
2. Illegal state pair, missing source lot, wrong reservation, cross-tenant ID and cross-lot Restore must roll back. Valid reserve -> release -> sale and warranty replacement still work.
3. Resolve an uppercase/punctuated legacy serial using canonical input: original/key unchanged. Two aliases on different lots must fail as ambiguous. Creation must reject an alias of a sold/returned unit. No duplicate during concurrent creators using the gate/index.
4. Receive -> sale -> customer return -> supplier return; and fresh-stock warranty replacement. Assert source lots, invoice lineage, counters and monetary invariance, not just HTTP success.
5. Migration omitted options and dryRun true must write nothing; dryRun false must fail safely until a reviewed apply implementation replaces the disabled path. Audit invalid identities and over-limit inventory must not return a misleading clean/partial report.

Do not weaken guards to make older fixtures pass. If a fixture lacks required serialOriginal or source ownership, distinguish legacy-reconciliation fixtures from valid new-record fixtures. Produce no fabricated stock/payment entries.

## Prompt for Antigravity

Work in D:\AI\itech. Read SERIAL-CORE-PATCH-AND-FAST-HANDOFF.md and inspect the latest diff. Codex has implemented the shared-helper ownership/version/state/lookup protections; do not overwrite them with prior staging snapshots. Complete the remaining master/opening/adjustment integration and safe migration scaffolding listed here. Keep existing user-company data unchanged. Run the five focused checks first, not the whole historical browser suite. Diagnose failures individually; preserve evidence for unchanged passing cases. Then run the appropriate final regression gate/build once after all relevant code edits. Correct claims in reports and document remaining UI/manual gaps. Keep current supported Phase 4 Live labels; unfinished register/profit/jobs/enquiries/library/communication remain Preview. Do not start Phase 5 or re-enable migration apply without its complete fence/journal/approval design. Return concise files changed, results, remaining gaps and readiness verdict.

## Next development boundary

After the focused serial and adjustment corrections pass, Phase 5A is the next complex core: shared transactional day-close/posting protection. UI wiring of Money in/out, transfers, daily tables and manual profit can follow in Antigravity. Do not implement a close button before all money and stock writers use the shared day fence; otherwise closed totals could change after closing.

Current shell already labels sales, quotations, reservations, returns, warranties and templates Live. Dashboard/customers/dues/reports remain mixed; unfinished modules remain Preview. No extra label change is needed in this patch, and Live does not mean every edge case is verified.
