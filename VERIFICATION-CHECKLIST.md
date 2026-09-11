# Verification checklist

Update this after each phase. Use `Pass`, `Fail`, `Blocked` or `Not tested`. Link test files or attach concise evidence. A passing unit test does not replace a full UI-flow check.

## Global checks

| Check | Status | Evidence / date |
|---|---|---|
| TypeScript check | Pass | 2026-09-11 |
| Domain automated tests | Pass | 26 tests on 2026-09-11 |
| Production build | Pass | 2026-09-11 |
| Dependency audit | Pass | 0 known vulnerabilities after dependency setup, 2026-09-11 |
| Signup cannot self-approve or choose tenant | Pass | Temporary Atlas integration account, cleaned up |
| Login blocked before operator approval | Pass | Temporary Atlas integration account, cleaned up |
| Profit password unlock is session-bound | Pass | Temporary Atlas integration account, cleaned up |
| Cross-company private file read denied | Pass | Two temporary companies, files and records cleaned up |
| Complete interactive browser walkthrough | Not tested | Required for each migrated phase |

## Phase 2 — Master data

| Flow | Status | Evidence |
|---|---|---|
| Company settings persist after refresh | Not tested | |
| Customer create/edit/view/list and addresses | Not tested | |
| Supplier create/edit/view/list | Not tested | |
| Product create/edit/view/list and tax-price preview | Not tested | |
| Serial-tracking configuration validation | Not tested | |
| Service catalogue create/edit/deactivate | Not tested | |
| Invoice template copy/rename/edit/default/revision | Not tested | |
| Explicit opening-data import/setup and reconciliation | Not tested | |
| Pagination, filtering, loading, empty and error states | Not tested | |
| Company A cannot access Company B master records by list, guessed ID, mutation, relation or export | Not tested | |
| Audit history records before/after values without secrets | Not tested | |

## Future critical flows

- Purchase ordered, partly received, unpaid, sold, partly paid to supplier, returned and reconciled.
- Invoice issued atomically with serial/stock, warranty, initial receipt and customer due.
- Concurrent sale/reservation and duplicate-submit protection.
- Later customer collection posts once to the selected account and original due.
- Cash/account transfer preserves total funds and does not change sales/profit.
- Daily closing carries balances, blocks differences, enforces sequence, handles holiday and protects closed dates.
- Customer and supplier returns distinguish credit, refund/payment and stock disposition.
- IGST versus CGST/SGST, inclusive/exclusive prices, fixed/percentage discounts, additional charges and rounding.
- PDF/XLSX/ZIP filters match visible results; multi-page and Unicode invoices render correctly.

