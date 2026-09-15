# Serial migration core implemented — integration and next steps

## Current code status

The reported TS7006 in app/api/inventory/movements/route.ts already had an explicit allocation parameter type when inspected. That correction was preserved. No typecheck was executed by Codex.

Codex completed the bounded transactional apply primitive in server/serial-identity.ts. It remains an internal server function; there is no automatic migration at login, invoice issue, lookup or opening setup.

## Contract

`auditTenantSerials(db, tenantId, session?)` is read-only and returns auditHash, invariantHash, counts and exact planned legacy-key changes. Explicit tenant scope is mandatory. It rejects missing originals, disagreeing identity fields and invalid versions; aliases/collisions are reported. It sorts records deterministically, reads at most 5,001 to enforce a 5,000-unit supported limit, and never returns a silently partial clean report.

`reconcileTenantSerials(db, tenantId)` defaults to dry-run. Apply requires all of:

- dryRun: false;
- an active transaction/session owned by the caller;
- expectedAuditHash from the reviewed read-only result;
- a stable migrationId;
- an actorId supplied by the trusted operator workflow.

Apply checks the existing unique tenant/serial index, locks the tenant serial gate with a write, repeats the audit in the transaction and rejects stale fingerprints/collisions. It updates only normalized keys, updatedAt and versions using expected-old-key/original/version predicates. It then verifies unchanged unit count and invariantHash, zero remaining legacy keys and zero collisions, writes a completed serialIdentityMigrations journal and releases the gate to Ready in the same transaction.

The invariant hash covers every unit field except normalized key/version/updatedAt. Stock lots, balances, invoices, allocations and other financial documents are not written by this function. Existing stock/financial invariant tests still matter for its integration with callers; a hash is not proof of unrelated ledger correctness.

One transaction means a crash/failure before commit has no partial applied batch. The journal and data commit together. Same migrationId/actor/audit hash replays the original result, even if subsequent normal transactions changed unit state. Changed input under the same migration ID conflicts. For more than 5,000 units, use a separately designed paginated maintenance procedure; this helper blocks instead of silently slicing data.

All operational serial writers must use the same gate. Stop/drain old application binaries that bypass it before applying migration. Maintenance is a transactional conflict boundary: concurrent writers will conflict/retry, not necessarily see an intermediate Maintenance status. Do not market it as a globally visible long-lived lock while the transaction is uncommitted.

## Remaining Antigravity work: bounded, not another broad plan

1. Run one typecheck, addressing only actual compile failures. The inventory callback annotation is already present; do not reapply old code.
2. Add focused isolated-fixture checks for: dry-run zero writes; successful uppercase migration; same-request replay; changed hash/actor/ID conflict; changed serial after audit; cross-tenant scope; collision rejection; invalid identity; absent unique index; forced rollback; concurrent receipt/transition versus migration; over-limit rejection. Use fresh test tenants. Do not execute apply against test 1.
3. Verify journal teardown: serialIdentityMigrations belongs in the collection-specific test cleanup along with tenantSerialGates. Delete only owned fixture records. Do not remove user migration journals.
4. Build a thin trusted operator wrapper only after testing the primitive. Require explicit tenant, reviewed hash and stable migration ID; own `session.withTransaction`, rethrow all apply errors so they abort, then end session. Default to read-only. Never catch an apply error inside the transaction and commit the earlier writes. Do not expose actorId/tenantId as untrusted public API authority. Existing-user-data apply remains a separately approved operational action with backup and a concrete dry-run report.
5. Run focused stock/opening cases from STOCK-OPENING-INTEGRATION-HANDOFF.md if not yet verified. Keep prior unaffected passes, with their source revision. Do not restart all browser onboarding. Run the final affected regression/build gate only after the code batch is stable.

No new generic stock-removal reversal, service-job backend or day-close UI is claimed by this patch. Current Phase 4 sidebar live labels are already present; unfinished register/profit/jobs/enquiries/library/communication stay Preview.

## Phase 5 boundary

Once this serial and stock integration passes focused acceptance, proceed to the shared posting/day-close transaction core. Keep money in/out, transfers and daily closing as separate implementation slices. Every ledger/stock writer, including refunds/reversals/warranty and automated hold expiry, must participate before live daily closing is enabled. No historical closing or money records should be edited to accommodate an implementation shortcut.

## Copyable prompt

Read SERIAL-MIGRATION-CORE-IMPLEMENTED.md in D:\AI\itech. Preserve Codex's installed migration primitive and stock/opening fixes. Run one typecheck and focused isolated-fixture checks listed here; correct actual failures. Do not start repeated full regression or browser onboarding loops. Complete only the thin trusted operator wrapper and evidence/cleanup wiring after the core checks pass. Do not run migration apply on my existing company, reset opening balances or overwrite current files with old staging patches. Provide exact results and remaining manual checks; then propose the Phase 5A coding batch.
