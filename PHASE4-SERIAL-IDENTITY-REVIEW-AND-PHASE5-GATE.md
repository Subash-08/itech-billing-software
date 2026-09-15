# Review of latest verification: serial identity and Phase 5 gate

## Verdict and evidence boundary

Authoritative checkout: D:\AI\itech. Source review only; no new tests, builds, browser actions, database reads/writes or migrations were performed in this review.

The reported isolated supplier scenario is useful evidence for its exact sequence: receive three, directly sell one, return the other two and settle supplier due. It does not prove all serial lifecycles. Do not treat API-supplied acceptedCreditPaise as verification that the browser prefilled the credit amount. Browser evidence in the submitted report covers Chain A only. Mark remaining browser chains unverified/manual, rather than Pass.

The report calls Phase 4 ready while critical source-level serial inconsistencies remain. Its current regression list does not supply latest-run evidence for phase35-isolation.test.mjs or phase4-isolation.test.mjs; do not infer they ran. It also states 10 acceptance chains in one place versus 11 in the summary. Correct the evidence/counts from actual logs. A markdown report is not inherently tamper-evident.

## Blocking serial identity defect

Current normalizeSerial in server/master-schema.ts strips non-alphanumeric characters and lowercases. For example SN-TP-001 becomes sntp001.

Current source:

- purchase-service.ts receive: duplicate checks and writes uppercase trimmed serial, preserving punctuation (SN-TP-001).
- sales-service.ts issue: new OR fallback matches canonical key, uppercase raw or serialOriginal, then rewrites serialNormalized to sntp001 during sale.
- stock-reservations.ts create/consume/release: lookup only canonical lowercase key.
- warranties.ts replacement selection: lookup only canonical lowercase key.
- purchase-service.ts quarantine/restore/supplier return/reversal: uppercase lookups.
- master-service.ts opening/adjustment and sales-returns.ts: canonical lowercase normalization.

Consequences requiring correction:

1. Purchase -> reserve can fail before sale because the receipt key is uppercase.
2. A freshly purchased replacement serial can be unavailable to warranty replacement.
3. Sale -> customer return -> supplier return/quarantine can fail because sale changed the stored identity.
4. Receiving SN-TP-001 again after the first unit is sold can bypass the uppercase duplicate lookup. A unique exact-string index alone does not catch mixed uppercase/canonical keys.
5. The sale OR fallback can select an arbitrary matching record if legacy aliases collide. The transition must not resolve ambiguity with updateOne's first match.

## Required backend design (one contract, no isolated fallback patches)

Use the existing normalizeSerial rule consistently until a deliberate business decision changes it. Do not introduce a second normalization rule in the name of this fix. Preserve serialOriginal for display; serialNormalized is a stable internal identity and must not change when stock status changes. Retain unit _id, lot, purchase/receipt and sale/warranty lineage. If distinct physical labels collapse to the same canonical key (SN-01 versus SN01), report the collision; never merge units silently.

Inventory all serial readers/writers across receipt, opening, adjustment, inventory search, reservation, sale, customer return, warranty, supplier return, quarantine, restoration and every reversal. Extract shared server functions into a serial-identity module:

- canonicalSerialKey(raw): validate nonempty canonical key and apply one rule.
- resolveSerialUnit(db, session, tenantId, raw): resolve one physical unit; fail 404/409 on absent/ambiguous identity. Validate tenant identity before product/lot/status eligibility so a cross-lot duplicate cannot be hidden by narrow filtering.
- transitionSerialUnit(db, session, unitId, expected ownership/status/version, next state): use exact _id plus tenant/product/lot/expected status and relevant reservation/invoice IDs; require exactly one changed row, otherwise conflict. All lot counters, serial changes, movements and commercial writes are in the same Mongo transaction.
- assertSerialsAvailableForCreation: canonical duplicate checks within payload and across tenant records, including sold, returned, defective and reserved units; preserve the existing no-reuse policy. A later reused-serial policy is separate scope.

Use a unique tenant/canonical identity index as the final concurrent-write guard once legacy data is reconciled. Do not rely solely on application findOne-before-insert checks. Concurrent mixed old/new writers must be prevented during rollout.

### Existing-data compatibility and migration

First create a bounded, paginated, READ-ONLY audit: raw original, stored normalized key, canonical key, record ID, lot/product, tenant, status. Detect absent originals, empty keys, inconsistent originals/normalized keys and duplicate canonical groups. Do not expose unrelated customer data or secrets in output.

A versioned migration must default to dry-run and explicit tenant scope. Preserve original display serial and all reference snapshots, update only identity metadata with expected-current-value predicates, record counts/checksums and migration version, and verify stock and money totals unchanged. Do not edit issued invoice snapshots, historic documents or amounts.

Stop on collisions or uncertain identity, with exact IDs for review. Do not delete duplicates, invent serials, change stock tracking flags, or reset data to force success. Require backup and concrete user approval before repairing existing user-company data. Use isolated tenants to test migration/compatibility first.

Choose and document one rollout strategy: controlled maintenance for affected serial writers during migration, OR a bounded shared compatibility resolver plus canonical uniqueness fencing that all writers obey. Do not keep the current ad-hoc sale-only OR fallback. Avoid unbounded collection scans on every sale. If compatibility cannot safely resolve a record, return an actionable reconciliation error and no partial transaction.

## Focused acceptance before broader reruns

Use one isolated tenant and separate fixtures as needed. No business actions against test 1. Tests must enter serials through actual receipt/opening endpoints rather than directly seeding already-canonical serialUnits for every test.

1. Receive SN-TP-001/002/003 -> reserve one -> release -> reserve -> sell held unit. Confirm key stability and bucket conservation.
2. Receive another unit -> direct sale -> customer return to sellable -> supplier return -> accept credit. Also test customer return to defective -> quarantine/restore eligibility and supplier defective return.
3. Warranty replacement using a freshly received unsold unit; check old/replacement unit lineage, both lot counters, duplicate claim protection and rollback.
4. Try receipt/opening/adjustment with casing/punctuation aliases of an existing sold or returned serial; reject consistently. Two concurrent writers cannot create duplicate identities.
5. Wrong tenant, product, lot, reservation, invoice and condition; unknown serial; duplicate serial within one payload. No counter changes on failure.
6. Legacy uppercase and canonical keys in separate noncolliding fixtures; collision fixture must block without mutation. Migration dry-run changes nothing; apply/rerun on test fixtures is idempotent and preserves every financial/stock invariant.
7. Supplier return/credit reversal and receipt reversal preserve identity and amounts; retry with the same idempotency key does not duplicate stock/money. Verify old unit states are rechecked in the transaction.
8. Re-run the focused supplier scenario including read-model refresh. Manually verify the credit prefill and no-payment text if browser automation is unavailable; mark it pending until someone performs it.

Then run typecheck and affected suites, followed by the final Phase 2/3/3.5/4/domain regression/build gate after the last relevant source change. Do not restart browser onboarding repeatedly. Stop after two infrastructure recovery attempts and supply manual steps. Exact commands are in ANTIGRAVITY-PHASE4-FINAL-VERIFICATION-PROMPT.md.

## Test cleanup correction

focused-supplier-scenario.test.mjs currently deletes a hardcoded collection list that omits related records such as customerReceipts, customerAllocations, supplierAllocations and other collections the transaction helpers may create. Therefore its message claiming all test records were removed is not proof of orphan-free cleanup.

Inventory actual write sets (including tenantCounters, idempotency records, audit logs, warranty records, auth sessions and files where created). Track the test run's tenant/user/document IDs. Remove only those owned test records using collection-specific tenant or owner fields, then assert no residual owned records/files. Keep fixture identity metadata until teardown has succeeded so failed cleanup can be resumed safely. Never sweep unknown tenants or delete the user's data. Record leftovers honestly if cleanup fails.

## Sidebar decisions

Current Preview paths are enquiries, document library, service jobs, register, profit and communication. Those are not completed Phase 4 transaction modules and should remain Preview/deferred until built. Purchases/suppliers/inventory already display Live. Sales, reservations, returns and warranty are Partly live; do not promote them on the strength of the single direct-sale supplier scenario while the serial defect exists.

After correction and acceptance, promote only the verified persisted flows. Keep Dashboard/reports/customer history mixed if they still contain sample or pending data. Live means saved company data; test status should be documented separately. Do not disable supported invoice links because their containing dashboard is mixed.

## Antigravity execution prompt

Read this document and the latest verification handoffs in D:\AI\itech. Fix the shared serial identity contract across every listed writer/reader, not just invoice issue. Preserve all existing edits. Implement the read-only compatibility audit and an isolated-test migration path; present any actual user-data repair separately. Fix the focused suite cleanup and the overclaimed verification documentation. Run the focused serial lifecycle cases first, then the appropriate final regression gate. If browser infrastructure fails, provide manual steps and mark unverified rather than repeatedly rerunning onboarding. Update Live badges only as justified above. Do not execute old staging patch scripts. Do not run migrations against test 1, reset opening dates, erase financial records, or start Phase 5 during this correction run.

Return a concise root-cause/fix matrix, exact test results, remaining browser gaps, cleanup evidence, migration dry-run findings and Phase 5 readiness verdict. Routine code corrections are authorized; existing user-data changes require a concrete reviewed proposal.

## Phase 5 next: complex core first, routine UI after

Once serial/stock acceptance passes, build Phase 5A's shared transactional posting/closing fence. Do not implement a daily-closing screen over inconsistent transaction primitives.

Phase 5A: enumerate every operational writer; all use one tenant/day write fence within the same transaction as money/stock changes. Implement server-owned Kolkata business dates, idempotency-aware replay, active-day sequence, close/post races and immutable close snapshots. A successful old idempotency replay must return the original result even when that day is now closed; a new historical mutation must reject. Include refunds, reversals, stock holds/expiry and warranty replacement in the integration inventory. Define how scheduled hold expiry interacts with the current open day; do not silently post into a closed day. Do not maintain competing authoritative cash balances.

Phase 5B: Antigravity can wire Cash & account, Money in, Money out and two-leg transfers after that core contract is stable. Customer/supplier settlement dialogs reuse their services, never create duplicate expenses/movements.

Phase 5C: paginated daily closing, separate cash count/bank confirmation, visible differences, no automatic balancing entries, carry-forward, holidays/missed days and read-only history. Individual source-linked manual profits sum to trading profit; operating expenses subtract once for net profit. Current-day return/profit corrections must preserve closed history. Owner-only aggregate access is enforced on server responses/exports, not CSS.

Later slices: service intake with free-text accessories/photos, parts consumption exactly once, separate service invoices, single WhatsApp compose; then remaining enquiries/library/dashboard analytics/filtered exports. Keep UI simple and maintain a per-module relation/acceptance checklist. These are planned, not implemented by this review.
