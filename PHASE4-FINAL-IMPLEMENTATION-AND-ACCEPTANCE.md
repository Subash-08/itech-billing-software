# Phase 4 final implementation and acceptance

Authoritative checkout: `D:\AI\itech`. Preserve existing changes and the installed template fixes. Do not copy old staging folders over this checkout.

## Immediate correction by Codex

Added a catch block to `handleSalesAction` in `components/documents.tsx`: thrown template validation/network errors now notify the user, retain entered fields and release busy state. This corrects a missing error boundary in the previous focused patch. Static review only; no tests, build, browser session, database mutation or push performed here.

## Instructions for Antigravity

Proceed with the submitted template-blocker plan, augmented by every requirement below. Complete the current Phase 4 before Phase 5. Do not request another approval for routine implementation choices. If a genuine business policy is unresolved, describe the exact case and continue independent work.

### 1. Template blocker and revision lifecycle

- Keep the new catch; show persistent inline action errors where needed rather than a toast alone. Zero-template state should link to template creation without losing the invoice form. Opening the editor in another tab is acceptable; returning must offer template refresh.
- Empty template lists in live mode must never reuse seed records. A starter layout is unsaved editor input until POST succeeds.
- Test first-template creation, implicit default selection after delayed bootstrap, explicit selection, revision 2 and 3, copy, rename, archive, restore, default changes and conflicts.
- Require the loaded editor revision on update. Do not use a newer global-store revision to authorize an old edit.
- If history is malformed, inspect read-only first. Never invent currentRevision=1 or overwrite issued snapshots. A migration must be dry-run capable, versioned, tenant-scoped and explain irrecoverable cases.
- Preserve existing issued/draft layout policy: do not silently update an existing document's selected revision when merely changing payment or an unrelated field. Offer explicit layout refresh if desired. A new invoice uses its selected saved revision.
- Validate active selection on new posting while preserving historical printing of archived template revisions.

### 2. Company logo persistence

The proposed `saveSettingsApi(state.settings, file)` approach needs care: the helper currently builds a full settings PUT and replaces absent fields with empty strings. A logo change must not overwrite newer company settings or clear fields missing from the frontend model.

Prefer a narrow tenant-authorized logo update using existing conventions, or a version-checked full settings save after loading the complete record. Document the chosen contract.

- Upload via the actual file API response contract; validate returned ID.
- Server validates image content, MIME, size and tenant ownership; use the private file system, not persistent browser object URLs.
- Link the uploaded file to company settings atomically where database state changes. Failed settings saves leave a retryable upload or a safely collectible orphan, never a false success.
- Disable upload/removal during submission. Distinguish upload failure from settings-save failure.
- Removal clears only the current logo reference. Preserve older files referenced by issued invoice snapshots.
- Test hard reload, cross-tenant access, invalid file, failed second step and historical PDF logo after replacement/removal.

### 3. Invoice and quotation workflow

- Buttons work from Dashboard, Sales, Quotations and customer profiles. Action availability must not depend on the preview status of an unrelated parent page.
- Searchable live customers/products/services/templates must reach records beyond bootstrap/page 1. Company state must not silently fall back to sample transactions after loading failures.
- Preserve stable line keys, HSN/SAC, rate, quantity, discount type/value, tax treatment, inclusive/exclusive basis, CGST/SGST versus IGST, shipping/additional charges, buyer/ship-to, serials, warranty and notes across save/reopen/conversion/issue.
- Treat Taxable 0%, Exempt and NonGST distinctly. Frontend, server, print and export totals must agree in paise.
- Separate service invoices; permit assembly charges on a PC-build invoice. Classify new/used/service contributions consistently.
- A quotation/draft does not consume stock or create incoming cash. Issue atomically consumes eligible lots/holds/serials, posts invoice and permitted payments, creates warranty and audit.
- Stable idempotency for draft creation, conversion and issue. The current composer generates fresh draft keys during submission: review retry and two-step Save+Issue carefully. If draft creation succeeds but issue fails, retry the same draft rather than creating another. Do not lose the draft ID or use a placeholder if an API response is malformed.
- Prevent over-allocation, cross-customer advances, unintended overpayment and partial financial writes. Preserve explicit consent for excess paid as advance.
- Filtered summary cards cover the entire server filter; outstanding shortcut uses the same filter contract.

### 4. Customer collections, advances and statement/profile

- Single authoritative services for issue-time receipt and later collections. Cash and one Bank account; UPI is Bank method metadata.
- Keep money received, existing advance applied and return credit separate. Due/status/counters must reconcile after every operation.
- Cover standalone receipt, opening-due allocation, invoice allocation, advance payment, advance allocation, refund and supported reversals through live UI.
- An allocation is not new cash. Reversal restores due once. Consumed derived credit blocks unsafe receipt reversal. Show dependencies and a supported recovery workflow, never manual DB edits.
- Original events remain visible; later reversals are dated events, not erasure of past periods. Statements need correct opening/page balances, deterministic ordering and bounded reads/exports.
- Customer profile shows live billed contribution, collections, due, available credit and returns without counting credit as payment. Timeline links to real source records. Enquiry/service-job entries remain clearly preview until those workflows are implemented.
- Customer/Supplier table routing, later pages, back navigation, stale responses, retry and mutation refresh must continue working.

### 5. Returns and warranty relations

- Single-line return UI sends the actual schema; choose exact line, not product alone. Repeated product lines and multi-lot sales must remain distinguishable.
- Source lots/serial ownership, previous returns and normalized duplicates validated server-side. No fallback invented source quantities. All stock counters/movements conserve quantities; customer returns do not alter supplier-return counters.
- Return credit offsets due first; surplus goes to explicit customer credit or refund. Backend computes/revalidates amounts and component proration. NoStock for eligible service/charge credit, not physical stock bypass.
- Update every related view and operational projection. Partial non-serialized returns reduce covered quantity without invalidating all remaining units.
- Warranty replacement receives old unit defective and issues available replacement; both movements, ownership and claim history atomic. Same-lot and different-lot replacements conserve physical stock. Preserve original coverage expiry and issued snapshot.
- Required version and stable key for warranty actions. A 409 needs reload/revalidation and explicit resubmission, not silently adopting a new version.
- Post-sale coverage, normalized duplicate/concurrency prevention, eligible quantities, provider, dates, notes, photos and authorized history/download must work end to end.
- Explicitly document and enforce whether/how replacement units may later be returned financially; do not silently refund against unrelated original allocations.

### 6. Stock holds and supplier separation

- Hold -> partial issue -> release/expiry must conserve sellable/reserved/sold quantities and serial ownership. Concurrent operations cannot double-consume.
- Use current Kolkata date at action time, including a tab left open overnight. Server remains authoritative. Internal expiry authorization must not expose secrets to the browser.
- Product purchase on supplier credit may be sold before supplier settlement. Customer sale/payment does not pay supplier. Preserve source-lot purchase links and independent supplier paid/due status for later reporting/daily closing reference.
- Run Phase 3 and 3.5 regressions after shared inventory/account changes.

### 7. Printing, output and module status

- Browser print, single PDF and filtered ZIP must agree on issued values, selected layout, buyer/ship-to, logo, serials, tax treatment, HSN summary, payment and amount fields.
- Historical documents use frozen commercial data. Rendering cannot quietly substitute current customer/product/company data or recalculate with a different tax rule.
- Date/customer/filter exports include every matching record within explicit resource limits; no silent truncation. Validate PDF content/layout, XLSX content/totals and safe filenames/formula injection handling.
- Complete a matrix per module and action: UI, API, data source, related refresh, test evidence, remaining work. Expose precise labels: Live for complete persistent workflows, Partly live for mixed workflows, Preview for intentional mock work. No bulk relabelling based merely on APIs existing.
- Dues spans customer and supplier transactions already in Phases 3/4; it is not wholly a Phase 5 feature. Reports can contain live exports alongside future analytics. WhatsApp remains intentionally mock.

### 8. Verification and evidence (Antigravity only)

Run typecheck, build, domain tests, Phase 2, Phase 3, Phase 3.5, Phase 4 isolation and correction suites. Record actual counts; investigate disappearing scenarios (including the cross-period reversal chain), rather than targeting a predetermined 10/10 result.

Browser chains must include:
1. Fresh company -> empty templates -> create/save -> revision 2/3 -> invoice draft -> issue with partial payment -> print.
2. Quotation -> convert once -> issue -> collect due -> statement/profile/account balances.
3. Multi-lot/repeated-product invoice -> partial return -> due offset plus credit/refund -> linked stock/warranty/customer views.
4. Receipt -> reverse allocation -> reverse receipt, with and without downstream advance consumption; no double due or money effect.
5. Warranty repair/replacement/repeat claim, return conflict, duplicate coverage, photos and historical logo retention.
6. Hold -> partial consume -> release/expiry; concurrent requests and tenant isolation.
7. Network failure after possible commit -> retry -> exactly one logical operation. Include the draft-save/issue boundary.
8. More than ten customers/products, search, pagination, direct reload, back navigation and mutation refresh.
9. Filtered sales totals, outstanding shortcut, PDF/XLSX/ZIP content and limit boundaries.

Dedicated test companies, public APIs for behaviour under test, exact cleanup. No real data mutations or secret exposure. Static inspection/typecheck alone does not qualify a UI workflow as verified.

Update DEVELOPMENT-LOG.md, VERIFICATION-CHECKLIST.md and the requirement matrix with changed files, actual outcomes, failures and remaining gaps. Preserve prior evidence with dates rather than replacing it with an unsupported blanket completion statement.

## After Phase 4

Next: Phase 5 Cash & Account and Daily Closing. One Cash and one Bank balance; automatic payment movements, manual Money in/out, supplier settlement reuse, cash-to-bank transfers, day-level reconciliation, manual per-transaction profit, owner-only aggregate profit, closing carry-forward, immutable closed days and holidays. Profit is not cash received; unpaid invoices do not increase cash. Design locking across all posting services before implementing closing. Keep this next phase out of the present correction patch.
