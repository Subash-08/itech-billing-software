# Shared serial identity: corrected implementation specification

## Review verdict

The submitted plan selects the right subsystems and helpers. Approve its direction, with the corrections below incorporated before execution. Do not approve the current plan as a complete concurrency/migration contract. This document reviews design and selected source; no tests or database operations were executed.

Scope: finish the Phase 4 serial identity and related stock invariants. Do not build Phase 5 here. Routine frontend wiring/testing belongs in Antigravity; the architecture below defines the safety-critical contracts it must implement. Existing tenant data remains untouched until an explicit repair proposal is approved.

## Corrections to the proposed plan

1. **Legacy fallback is not specified sufficiently.** Looking up lowercase canonical, uppercase raw and exact original strings still misses aliases. Caller `sntp001` cannot reconstruct stored `SN-TP-001`. Conversely, multiple records can share the same logical key. Do not recreate the sale OR fallback inside a helper. Resolve ambiguity across the tenant before selecting a product/lot/status; never select the first match.
2. **Creation checks need a concurrent-write guarantee.** find-before-insert is not sufficient. The tenant/canonical unique index must be verified as present and effective. Old uppercase records do not conflict with a new lowercase key under an exact-string index. Rollout must handle legacy records and stop old writers before enabling new serial creation.
3. **Migration needs exclusive writer coordination.** Expected-value updates alone do not stop another receipt, sale or reversal during an audit/migration. Add a tenant serial-schema readiness/version gate and shared transactional write fence. Do not treat this as Phase 5's cash/day-close fence; they serve different purposes and must compose in the same transaction later.
4. **The transition helper must not be a generic document updater.** Define allowed transitions and required ownership, version and lineage checks. Prohibit mutation of identity, tenant, product or lot through a lifecycle transition.
5. **Negative adjustments are not interchangeable with quarantine.** Current master-service.ts infers Defective from reason text while reducing quantityRemaining/quantitySellable without increasing quantityDefective. Fix the operation contract, not only serial normalization. Defect classification cannot depend on free text.
6. **Readers/UI are missing from the detailed refactor list.** Include inventory serial search/selectors, product details, receipt previews, holds, warranty searches, duplicate-coverage indexes and source links. Display serialOriginal; use unit ID/internal key for selection. Do not expose canonical lowercase as if it were the printed device label.
7. **Clearing current invoice ownership must not erase history.** Preserve issued snapshots, allocation source lots and append-only lineage. Resale and warranty replacement create multiple lifecycle episodes for one physical unit. Distinguish physical unit identity from current ownership and from the original commercial entitlement.
8. **Cleanup is not proven by a long collection list.** Use actual collection names and actual owner-field types. Auth sessions/accounts may be keyed by user ID, not tenantId. Add files and other collections only if the run writes them; assert residuals after cleanup and keep failure metadata.
9. **Audit must default to explicit tenant scope.** Replace the suggested unscoped `--audit` across all tenants with `--audit --tenant=<id>`. Existing-company audit is read-only; migration remains a separately approved action. Missing tenant scope must fail rather than enumerate every company.
10. **Evidence must match the current source revision.** Chain A's older screenshots remain historical evidence, not proof for changed opening code. Recheck only the impacted Chain A portion after changes to opening serial handling. An API test cannot verify the browser credit prefill. Run counts come from logs, not the planned eight scenario headings.

## A. Identity contract

Preserve the current rule: remove non-ASCII-alphanumeric characters and lowercase. Bound raw input length using the existing schema maximum; reject non-string, empty canonical key and repeated canonical keys across the entire multi-line receipt/opening/adjustment payload. Do not silently change punctuation semantics: SN-01 and SN01 currently collide by design. If they identify genuinely different devices in existing data, stop and request a deliberate policy/data decision.

For new units store stable `_id`, tenantId, productId, lotId, serialOriginal and serialNormalized, plus schema/version metadata. The canonical key never changes because a unit is sold, returned or replaced. Only an explicitly approved metadata migration may change a legacy stored key. Never change `_id` or rewrite serialOriginal during that migration.

Within one tenant a serial key remains reserved across all statuses, including sold/returned/removed. Across different tenants the same key is allowed. Reselling a customer-returned device uses its existing unit, not creation of a duplicate. Products configured without serial tracking must reject serial selections; serial tracking mode changes with existing stock need their own safe migration/blocking rule.

## B. Choose a concrete rollout before coding

Recommended minimal safe rollout: canonical-only writes after an approved per-tenant migration, with an explicit compatibility/readiness gate.

1. Add shared serial-operation locking/readiness checks used by every serial writer. Acquire the tenant serial fence with a write inside the caller's MongoDB transaction; migration acquires the same fence and sets maintenance state. A read-only readiness check is not race-safe.
2. A genuinely new empty tenant can establish canonical readiness atomically. Do not label a tenant ready merely because one queried page contains no serials.
3. Existing tenants require a bounded full audit and collision check. Until readiness is established, serial mutations return a clear reconciliation-required response and write nothing. Existing read-only views remain available. Explain this temporary restriction; do not silently migrate during an invoice issue.
4. For existing user companies, present audit findings and the concrete migration for approval. No operation against test 1 beyond the authorized read-only audit. Isolated fixtures can exercise apply/rerun without user-data changes.
5. All running app instances must respect this gate before migration. Old binaries that bypass it must be stopped/drained during rollout. One process-local mutex is insufficient.
6. When migration and index verification finish, mark the tenant ready with schema version. Failure leaves it blocked/resumable, not partially ready.

If a no-downtime compatibility strategy is chosen instead, replace this section with a complete indexed identity-claim design and shared unique canonical-key registration used by ALL creators and migrators. Specify deterministic collision detection and legacy resolution from punctuation-free input. Do not implement a partial OR fallback or unbounded tenant scan on every sale. No extra identity registry is needed for the recommended maintenance rollout.

## C. Shared helper contract

Helpers receive the existing MongoDB session and server-derived tenant identity. They must not start/commit nested transactions. Use dependency-light imports; do not import purchase-service from the serial helper when purchase-service imports it.

- `canonicalSerialKey(raw)`: pure validated normalization, shared by backend creators/readers and compatible frontend selection code. One source of truth; audit script behavior must match it through shared import or parity tests, not an untested copied regex.
- `assertSerialsAvailableForCreation`: requires readiness/fence; rejects payload and tenant duplicates across every status; insert under the unique tenant/key index in the SAME transaction. Map a genuine duplicate-key conflict to a clear 409. Do not swallow unrelated database errors.
- `resolveSerialUnit`: tenant-first identity lookup against the ready canonical index; then product/lot/status/ownership checks. An invalid or ambiguous legacy tenant is blocked by readiness, not guessed. Return stable ID and version to the caller. Do not leak another tenant's existence through errors.
- `transitionSerialUnit`: exact unit ID + tenant + expected product/lot + expected status/version + operation-specific ownership. Next state is an allowlisted operation, not arbitrary `$set`. Set/unset current ownership consistently; increment version; require exactly one matched/modified unit. Same-operation retries are handled by the enclosing idempotent operation and must replay before rechecking a state that already changed.

For every transition, update lot counters, serial state, movements, reference documents, audit and relevant money/credit records atomically in the enclosing transaction. A helper returning success must not imply the wider transaction committed. Check all stock update counts too, and retain quantityRemaining as the explicit compatibility mirror of quantitySellable while it exists.

## D. Explicit state and bucket transitions

| Operation | Serial transition | Stock buckets / ownership |
|---|---|---|
| Receipt/opening/positive addition | Create InStock, or explicitly received Defective | Add matching received and sellable/defective quantities exactly once |
| Hold | InStock -> Reserved | sellable -q, reserved +q; current reservation ID required |
| Release/expiry | Reserved -> InStock | reserved -q, sellable +q; exact hold ID, no sale ownership |
| Direct/held sale | InStock/Reserved -> Sold | source available bucket -q, sold +q; exact invoice/line IDs; consume hold once |
| Customer return | Sold -> InStock or Defective | sold -q, matching return bucket +q; validate commercial entitlement/lineage and source lot |
| Quarantine | InStock -> Defective | sellable -q, defective +q; physical on-hand unchanged |
| Restore | Defective -> InStock | defective -q, sellable +q; physical on-hand unchanged |
| Supplier return | InStock/Defective -> Returned | relevant bucket -q, supplier-returned +q; exact source purchase/line/lot |
| Supplier-return reversal | Returned -> original condition | reverse those buckets only after exact return/credit dependencies pass |
| Warranty replacement | old Sold -> Defective; new InStock -> Sold | two source lots, old sold -1/defective +1; new sellable -1/sold +1; net on-hand unchanged across both |
| Physical write-off/removal | InStock (or separately authorized Defective) -> Removed | decrease physical on-hand and increment a dedicated removed bucket; never pretend it is a supplier return |

The plan's `negative delta -> Removed or Defective` must become explicit operations. Existing quarantine/restore APIs are the appropriate defect workflow. Do not select state by `reason.includes('defect')`.

For supported physical write-offs, extend the lot conservation equation to include quantityRemoved and define defaults/migration/read models: received = sellable + reserved + defective + sold + supplierReturned + removed. Update schema, writers, conservation checks, inventory summaries and test assertions together. Do not backfill historical removed quantity by guessing; use trusted movements or flag reconciliation. Alternatively keep physical write-off disabled with a clear message until that complete contract is implemented; do not ship a serial refactor that claims this path passed while it still violates conservation.

Receipt reversal is distinct from removal: it unwinds an eligible receipt according to the existing receipt policy and must not leave removed serials attached to a deleted/missing lot without documented lineage. Reuse existing validated reversal semantics rather than applying one generic transition blindly.

## E. Ownership and warranty/return edge cases

Always validate invoice AND line, not just product/status. For ordinary returns, verify issued allocation -> unit -> lot. For a warranty replacement unit absent from the original immutable allocation snapshot, verify an explicit claim lineage path before treating it as the current unit for that entitlement. Original replaced unit cannot also obtain another refund/replacement.

Preserve original purchase-source association for both warranty units. The defective old unit can be supplier-returned against its own source purchase; the new unit's source is separate. Warranty stock changes do not create a second sales receipt or supplier payment.

On customer return clear current ownership only after an immutable event captures invoice/line/unit/lot/return IDs. Clear stale reservation IDs on consumption and release consistently. A later resale points to the new invoice while old invoices and returns remain immutable. Test resale, second customer return, repeated warranty replacement and return after replacement, including quantity limits on the original commercial entitlement.

Define whether duplicate warranty coverage is constrained by serial unit plus entitlement or by canonical serial plus invoice/line. Update relevant lookup/index paths consistently; changing serialUnits alone does not fix warranties.serial/serialNumber filters or historical normalized coverage keys.

## F. Audit/migration specification

`--audit --tenant=<id>` and `--dry-run --tenant=<id>` are read-only, keyset-paginated and memory bounded. Show counts and the exact affected IDs needed for review, without secrets. Compare serialOriginal and stored key; do not blindly choose serialOriginal when they disagree beyond normalization. Include units in all statuses and missing fields. Detect collisions across batches, not only within one page.

`--migrate --tenant=<id>` additionally requires maintenance/fence ownership, approved dry-run identity/checksum, verified index plan and durable progress. Revalidate after locking because data may have changed since audit. Update expected old key/version predicates; record per-record outcomes and a durable migration journal. Fail closed on conflicts, duplicate key, missing data or count mismatch. Do not mark complete until an exhaustive post-check passes. Rerun resumes safely; never delete financial records or change stock quantities to finish migration.

Verify money totals, lot totals, unit states/IDs and immutable snapshot hashes before/after. Migration changes only serial identity metadata and migration/audit markers. Decide rollback from actual journal; do not reverse a completed migration after newer transactions without a reviewed strategy.

## G. Implementation order and Antigravity work

1. Enumerate actual functions/files and write sets; proposed names such as returnPurchaseStock/returnSaleInvoice/createWarrantyRecord are descriptive, not necessarily current exports. Use current recordSupplierReturn/createCustomerReturn/createWarrantyCoverage or the actual source names. Read AGENTS.md and installed Next.js docs; preserve unrelated edits.
2. Finalize the rollout and schemas above; implement shared helpers and the gate. Add read-only audit and isolated-fixture migration. No migration of the user's company.
3. Refactor creation first (receipt/opening/adjustment), then transitions (holds/sale/customer returns/warranty/supplier return and all reversals). Remove lifecycle rewrites of normalized identity. Fix the explicit adjustment/quarantine accounting contract together with its dependent projections.
4. Refactor live read APIs and UI selections to preserve printed serial labels and exact unit/source IDs. Inspect inventory serial API, product detail, receipt view, sales picker, reservation picker, warranty search and return form. Keep backwards-compatible presentation of old snapshots without rewriting them.
5. Run focused tests below before broader reruns. Antigravity performs all tests; Codex has not executed them. Browser recovery attempts remain bounded; manual results are recorded only after actually performed.
6. Correct cleanup and verification documents. Discover actual touched collections and collection-specific owner keys from source, retain tracked fixture ownership until teardown succeeds, check files and orphan records, and report failed cleanup honestly. Never sweep unknown tenants.
7. After the last changes, run the relevant final Phase 2/3/3.5/4/domain/typecheck/build gate once. Update only supported Live labels. Unbuilt jobs/register/profit/enquiries/library/communication remain Preview/deferred. No Phase 5 implementation in this correction pass.

## H. Acceptance additions beyond the original eight headings

- Canonical collision checks across receipt lines, across opening lots, across creator types and concurrent requests; include sold/returned/removed units and distinct tenant reuse.
- Legacy input already stripped of punctuation, mixed case, whitespace, punctuation-only and maximum-length values. Same canonical key with different source product/lot must be flagged before narrow eligibility filtering.
- Unit version race and ABA (available -> held -> available) between selection and submit; no stale operation can bypass required ownership/version rules.
- Receipt -> hold/release/consume; newly received warranty replacement; sold -> customer return -> supplier return for both conditions. Validate both stock buckets and serial status after each step.
- Return -> resale to another customer -> second return; warranty replacement chain -> eligible customer return -> supplier return; original/replacement double-claim rejection.
- Quarantine/restore physical on-hand invariance, explicit write-off conservation if enabled, nonserialized product regressions and safe tracking-mode restrictions.
- Migration concurrent writer rejection, restart after a partial batch, index creation failure, collision across pages, changed dry-run input, exact-value CAS conflict and no mutation in audit/dry-run. Existing tenant remains untouched by tests.
- Stable retry keys, same payload replay after state changes, changed payload conflict, rolled-back downstream failures; no duplicate money/stock or audit success for an aborted operation.
- UI raw-label rendering, page-two selection, stale selection, eligible serial count, blocked legacy readiness message, credit prefill/no-payment message and refreshed dues. API tests alone do not prove these UI checks.

Do not use a test fixture with already-normalized serialUnits to stand in for receipt integration. Create them through supported business endpoints except explicit legacy migration fixtures. Assert every affected line/header/statement/account/inventory result, not only HTTP 200.

## Copyable instruction to Antigravity

Revise your Shared Serial Identity Correction plan using SERIAL-IDENTITY-PLAN-CORRECTIONS-AND-EXECUTION.md in D:\AI\itech, then implement the authorized code corrections in its order. The original plan is approved in direction with these mandatory amendments. Do not ask for another routine Proceed confirmation. Implement one serial identity contract, a concrete safe rollout, explicit atomic transition rules and all related read/write integrations. Fix the adjustment/quarantine conservation issue instead of carrying it forward. Preserve existing user data; migration of test 1 requires a separate concrete approved proposal. Use isolated fixtures for tests/migration apply. Correct cleanup and evidence, run focused acceptance first, then the final relevant regression gate. Do not replay staging patch scripts or start Phase 5. Return a changed-file/defect matrix, actual test counts, UI verification gaps, migration dry-run findings, leftover risks and an evidence-based readiness verdict.
