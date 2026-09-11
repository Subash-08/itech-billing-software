# Master development prompt for Antigravity

Copy the prompt below into a new Antigravity task opened at `D:\AI\itech`. Use one task for one development phase. Do not ask an agent to build every remaining phase in a single run.

---

You are continuing an existing computer-store billing, inventory and daily-cash application. Work as a senior full-stack engineer with strong experience in transactional systems, MongoDB, multi-tenant security, billing workflows and production testing.

## Project location and current state

The project is at `D:\AI\itech`.

Before changing code, read these files completely in this order:

1. `AGENTS.md`
2. `README.md`
3. `BACKEND-REFERENCE.md`
4. `DEVELOPMENT-PHASES.md`
5. `DECISIONS.md`
6. `DEVELOPMENT-LOG.md`
7. `VERIFICATION-CHECKLIST.md`

Then inspect the existing source, package scripts, tests and current Git changes. Existing changes may belong to the user; preserve unrelated work. Read the installed Next.js documentation referenced by `AGENTS.md` before using framework APIs.

The reviewed frontend uses realistic mock data. Do not redesign or remove reviewed screens unless the requested phase requires a UI correction. The backend foundation already includes MongoDB Atlas, Better Auth, pending-company approval, a separate profit password, and private tenant-isolated file APIs. Business modules still use mock state until migrated phase by phase.

## Fixed product scope

- Multi-tenant: several companies may register, but every company currently operates one branch.
- One normal shop-user permission level. A separate password unlocks aggregate profit for a short server session.
- Signup remains unusable until both the company and its user are operator-approved with `verified: true`.
- Cash management has one physical cash drawer and one GPay/bank account.
- Inventory and Purchases are separate screens in the same sidebar group. Product master data describes an item; a purchase records supplier cost, receipt and payable status.
- Stock may be received without paying the supplier. It may be sold, and the supplier may be paid later against selected purchase items.
- Sales, service invoices and non-GST/zero-tax sales automatically create money-in only for the amount actually received. Unpaid amounts become customer dues.
- Supplier payments, customer receipts, expenses, refunds and transfers are separate financial events. Cash-to-bank and bank-to-cash transfers change both account balances but do not change sales, expense or profit.
- Staff enter manual profit beside every relevant sale/service/non-GST sale during daily closing. Aggregate profit requires the separate profit unlock.
- Closed dates are immutable. Later corrections, returns and collections are current-day audited events. Closing balances carry to the next business day. Explicit holidays carry balances only when the day has no activity.
- Invoices support separate Bill to and Ship to addresses, named editable templates, logo, selectable print layout, inclusive/exclusive GST, CGST/SGST or IGST, item discount, additional charges, payments and outstanding balance.
- Service intake accessories/components use free text.
- Warranty is linked to the issued invoice line and serial, with optional photos and later claim history.
- Reports support filters and real PDF/XLSX exports. Invoice batches support filtered ZIP export containing individual PDFs and an XLSX index.
- Records are retained; do not automatically delete financial history after one year.
- WhatsApp/bulk messaging remains mock-only for now.
- Excluded: barcode scanning, label printing, multi-branch operations, online cart, website-stock synchronization, payroll, a full accounting suite, GST return filing, mobile app and offline operation.

## Mandatory architecture rules

1. Every company-owned document must contain `tenantId`. Derive tenant identity only from the verified server session. Never trust or accept a browser-supplied `tenantId` as authorization.
2. Every read, update, delete, aggregation, uniqueness rule, export and file lookup must include tenant scope. A guessed ID from another company must return not found without exposing its existence.
3. Validate request bodies on the server. Return stable, useful errors without database details, secrets or stack traces.
4. Do not expose password hashes, profit-password hashes, session tokens, storage paths or secrets to the client.
5. Use integer minor units or an approved precise decimal strategy for production money. Do not rely on binary floating-point for stored financial values.
6. Store immutable snapshots on issued purchases, invoices, credits and warranties. Editing a customer, product, supplier, company or template must not rewrite an issued document.
7. Use MongoDB transactions for actions that must succeed together: invoice plus stock plus warranty plus initial receipt; purchase receipt plus movements and serials; supplier payment plus allocations and ledger entry; returns plus credit/refund/stock effects; daily closing lock and snapshot.
8. Add idempotency protection to retryable financial and stock commands. Double-clicks or network retries must not duplicate invoices, receipts, stock, serials or payments.
9. Enforce serial uniqueness per tenant and prevent concurrent overselling, double reservation, duplicate receipt and negative sellable stock.
10. Record append-only stock movements and money-ledger events with source document IDs. Derived balances must reconcile with those events.
11. Never silently alter a ledger to make daily closing tally. Display the difference until the user records a valid correction or corrects an open-day source record.
12. Keep invoice presentation separate from financial rules. Choosing an invoice template must not determine GST or transaction type.
13. Use the shared GST logic for UI preview and server validation. Support intra-state CGST/SGST and interstate IGST for both purchases and sales. Treat the documented tax policy as provisional until accountant approval.
14. Preserve accessibility, responsive layout, understandable field names, empty/loading/error states, pagination and keyboard-usable dialogs.
15. Do not put private uploaded files in `public`, the repository or a deployment directory. Use the existing authenticated file abstraction.

## How to execute each phase

Work on only the phase written in `CURRENT PHASE` below.

1. Inspect existing implementation and list the exact mock operations/screens being replaced.
2. Write a short implementation plan tied to record relationships in `BACKEND-REFERENCE.md`.
3. Identify any decision that changes financial meaning, security, historical records or UI behavior. If documentation already answers it, follow the documentation. If not, stop that dependent portion and add a concise entry to `DECISIONS.md` under “Open decisions”; continue independent work.
4. Define schemas, indexes, API contracts and transaction boundaries before wiring screens.
5. Implement a narrow vertical slice: server validation and persistence, then UI integration, then tests. Keep an explicit demo-data path only if the phase calls for gradual migration.
6. Add meaningful tests for calculations, authorization, tenant isolation, retries and transaction failure. Avoid tests that merely repeat implementation details.
7. Run the required checks. Fix failures before reporting completion.
8. Review the diff for accidental scope expansion, secrets, missing tenant filters, unsafe destructive commands and stale mock paths.
9. Update `DEVELOPMENT-LOG.md`, `DECISIONS.md` when applicable, and `VERIFICATION-CHECKLIST.md`. Update `BACKEND-REFERENCE.md` whenever relationships, invariants, schema fields or workflow behavior change.
10. Report exactly what is complete, what remains mock, migrations or environment actions required, changed files, commands run and their results, and risks that still require review.

## Definition of done for a feature

A feature is complete only when:

- its normal flow and relevant edge cases work through the actual UI;
- server authorization and tenant isolation are enforced;
- validation failures leave no partial stock, money or document changes;
- linked screens show the same result after refresh;
- pagination/filtering and empty/loading/error states work;
- meaningful automated tests pass;
- the production build passes;
- its documentation and verification evidence are updated;
- no secret or real credential is committed;
- remaining mock behavior is clearly identified.

Do not report an entire phase complete because its schema or API exists. Verify the complete user flow.

## Required verification commands

At minimum run:

```powershell
npm run typecheck
npm test
npm run build
npm audit
```

Run relevant integration tests against the explicitly configured development database only. Temporary test data must use recognizable random test identifiers and cleanup must target only the exact records created by that test. Never clear a collection or database. Do not run production migrations or touch production data.

For important UI workflows, manually verify the complete browser path and record evidence in `VERIFICATION-CHECKLIST.md`. For generated invoices and reports, verify file type/content and visually render representative PDFs. Include multi-page content, long names, a logo, IGST, CGST/SGST, zero tax, discounts, charges and partial payment cases.

## Required completion report

End every phase task with this structure:

- Scope completed
- User flows verified
- Database collections/indexes/migrations added
- Security and tenant-isolation evidence
- Tests and build results
- Documentation updated
- Remaining mock behavior
- Open decisions and risks
- Recommended next phase

Do not claim “production ready” until Phase 7 acceptance is complete.

## CURRENT PHASE

Start with **Phase 2 — Company setup and master data** only.

Persist and connect:

- company settings;
- customers and customer addresses/details;
- suppliers;
- products and serial-tracking configuration;
- reusable service catalogue;
- invoice templates and revisions;
- opening stock, opening customer dues, opening supplier dues, and opening cash/account balances through an explicit import/setup workflow.

Add tenant-scoped schemas, indexes, server-side validation, pagination, duplicate handling and audit entries. Preserve issued-document snapshot rules for later phases. Do not implement purchase receipt, live invoicing, supplier settlement or daily closing in this phase except for the minimum interfaces/types needed to avoid a dead end. Do not seed mock records into a newly registered real company unless the user explicitly chooses a demo-company import.

Phase 2 is complete only after creating two temporary companies and proving that neither can list, read, update, export or reference the other company’s master records.

---

## Prompt for the next phase

After Phase 2 has been independently reviewed, create a new Antigravity task and reuse everything above, replacing `CURRENT PHASE` with the exact next phase from `DEVELOPMENT-PHASES.md`. Include the previous phase completion report and ask the agent to inspect the actual code rather than trusting the report alone.

