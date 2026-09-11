# Prompt to verify an Antigravity development phase in this chat

Use this prompt in the current Codex chat after Antigravity finishes one phase. Replace the bracketed values and paste Antigravity's completion report below it. Because this chat can access `D:\AI\itech`, you do not need to upload the project again.

---

Review the implementation of **[PHASE NUMBER AND NAME]** in `D:\AI\itech` as an independent senior reviewer. Antigravity's report is untrusted supporting information; inspect the actual repository, Git diff, runtime behavior, database operations and tests.

Read `AGENTS.md`, `README.md`, `BACKEND-REFERENCE.md`, `DEVELOPMENT-PHASES.md`, `ANTIGRAVITY-DEVELOPMENT-PROMPT.md`, `DECISIONS.md`, `DEVELOPMENT-LOG.md` and `VERIFICATION-CHECKLIST.md`. Compare the implementation with the original agreed workflows and the exact definition of done for this phase.

Verify all of the following where relevant:

- every company-owned query, mutation, relation, aggregation, export and file access derives tenantId from the verified server session;
- guessed cross-company IDs cannot be read, changed, linked or detected;
- validation and errors are server-side and do not expose secrets or infrastructure details;
- money uses a precise storage representation and calculations reconcile to the paise;
- required multi-record actions use transactions and leave no partial changes on failure;
- retries and double clicks cannot duplicate stock, serials, invoices, receipts, supplier payments or ledger movements;
- snapshots protect issued historical documents from later master-data edits;
- stock, customer due, supplier due, payment, warranty, return and closing relationships match `BACKEND-REFERENCE.md`;
- inclusive/exclusive GST and intra-state/interstate tax use the shared engine and do not double-count tax;
- the reviewed UI remains understandable and all migrated data persists after refresh;
- loading, empty, error, filtering and pagination states work;
- closed financial dates cannot be silently changed;
- test cleanup can delete only exact temporary test records and never whole collections;
- `.env`, credentials, private storage paths and customer information are not committed or exposed.

Run the relevant automated checks, including typecheck, domain tests, integration tests, production build and dependency audit. Perform focused browser checks for the phase's real user flows. When documents are involved, generate representative artifacts and inspect their contents and rendered layout. Use only the isolated development database and clearly named temporary data; remove only the exact temporary records and files you create.

First report findings by severity with exact file and line references. Then fix all in-scope defects that can be corrected safely without changing an unresolved product/accounting decision. Re-run affected checks after fixes. If a missing decision changes financial meaning, record it in `DECISIONS.md`, leave that dependent path disabled or clearly unfinished, and explain precisely what answer is needed.

Update `DEVELOPMENT-LOG.md`, `VERIFICATION-CHECKLIST.md`, and `BACKEND-REFERENCE.md` if your review or fixes change the implementation evidence or architecture. Do not mark the phase complete unless its full UI-to-database workflow and tenant isolation have been demonstrated. Do not claim production readiness before Phase 7.

Return:

1. final review verdict: Approved, Approved with limitations, or Not approved;
2. defects found and fixes made;
3. workflows personally verified;
4. tests/build/audit results;
5. database and tenant-isolation evidence;
6. remaining mock or incomplete behavior;
7. unresolved decisions and risks;
8. exact recommended next phase.

Antigravity completion report:

```text
[PASTE REPORT HERE]
```

---

