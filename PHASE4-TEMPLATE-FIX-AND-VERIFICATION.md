# Phase 4 template blocker: correction and verification handoff

Authoritative checkout: `D:\AI\itech`.

## Evidence and scope

Static inspection found live bootstrap retaining seed templates when the tenant's template list was empty. The seed Classic GST invoice has no persisted revision. The invoice composer also initialized its selection before live bootstrap and swallowed template lookup errors. These paths explain how the reported missing-revision error can occur; the actual tenant database was not inspected.

Additional confirmed defects: template saves sent UI metadata into a strict schema; merging a stored record into template settings could pass `updatedBy` and archive metadata into that schema; missing expectedRevision bypassed the update concurrency guard; the empty-company editor had no columns; imported template revision 1 contained only a name instead of its layout.

## Changes installed in this pass

- `components/store.tsx`: no seed template/default fallback in live bootstrap; visible bootstrap failure; whitelisted template request settings; update revision taken from the edited record, not newer shared state.
- `components/documents.tsx`: implicit template selection follows loaded default; explicit selection is preserved; submission fetches the tenant-owned active template and validates a real integer revision; missing/archived records surface actionable errors.
- `components/templates.tsx`: starter layout has usable columns even when the company has no templates; empty preview does not crash. The starter is unsaved editor input until POST creates the tenant-owned record and revision.
- `server/sales-templates.ts`: validate only editable settings; require expectedRevision on update; reject missing stored revision rather than inventing one.
- `server/sales-service.ts`: validate active template and usable revision snapshot before new quotation/draft/issue operations. Historical print routes are not changed.
- `server/master-service.ts`: future demo-master imports store the actual complete template snapshot.

No database records were changed, no migration executed, no tests/build/browser verification run, and no commit/push performed by Codex. Old malformed records are not silently repaired.

## Immediate user workflow

Reload the application. If the company has no saved template, open Invoice templates, create a template using the starter layout, and save it. Return to New invoice and select the saved template. If the server explicitly reports a malformed existing revision, preserve the original and investigate its history; do not set currentRevision to 1 manually.

## Antigravity prompt

Review the installed diff against the current checkout before editing. Do not copy the older phase4-transaction-hardening folder over these changes.

1. Run typecheck and focused template/invoice acceptance tests, then relevant regressions/build. Adapt tests to send a real expectedRevision; do not weaken the server guard to preserve old tests.
2. Fresh test company with zero templates: no demo layout may masquerade as a saved live template. New template must have usable editable columns, save successfully, and permit invoice creation.
3. Slow bootstrap: implicit seed selection must switch to the loaded company default. Explicit user selection must not silently switch. Test archived/deleted selection and missing default.
4. Save template, edit to revision 2, edit again to revision 3, copy, rename, switch default, archive/restore. Confirm no strict-schema metadata failures. Stale/missing expectedRevision must return 409 without mutation.
5. Issue using the selected active saved template; compare draft revision, issued snapshot and PDF. Never hardcode a revision or overwrite historical snapshots.
6. Legacy malformed template: read-only report of tenant, template ID, currentRevision and matching revision existence/layout completeness. Do not read secrets or alter real company records in tests. Propose a dry-run, versioned migration only where evidence supports recovery; never fabricate historical layouts.
7. Verify empty-template preview, failed bootstrap, failed template lookup, and retry. Inspect the actual browser requests rather than relying only on service tests.
8. Review logo upload in components/templates.tsx: it still creates a browser object URL instead of persisting the company logo. Connect to existing private upload/company settings contracts, preserve audit and historical invoice snapshots. Until completed, Templates remains Partly live.
9. Complete a module/action matrix for Sales, Quotations, Customers, Returns, Warranties, Reservations, Dues, Templates and Reports. Verify supported actions in the browser before changing labels to Live. Current backend presence alone is insufficient evidence.
10. Preserve all Phase 4 requirements: customer payments/advances/reversals/statements, exact stock/serial return linkage, warranty quantity/claim/photo workflows, printing/export filters and tenant isolation. Record unresolved work explicitly. Phase 5 daily closing and manual profit remain pending.

Use isolated test companies with exact cleanup. Record commands, outcomes, browser evidence, remaining issues and changed files in DEVELOPMENT-LOG.md and VERIFICATION-CHECKLIST.md. Do not report Phase 4 fully complete solely because existing suites pass.
