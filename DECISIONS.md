# Product and engineering decisions

Use this file for decisions that affect behavior, records, money, tax, security or deployment. Do not duplicate routine code changes; those belong in `DEVELOPMENT-LOG.md`.

## Confirmed decisions

- Replace Tally for shop operations; the accountant handles GST filing.
- Multi-tenant application, one branch per company for now.
- One normal shop permission level with a separate password/session gate for aggregate profit.
- Signup requires operator approval (`verified: true`) before login.
- One cash drawer and one GPay/bank account.
- Inventory and Purchases remain separate screens in the same navigation group.
- Supplier stock can be received unpaid, sold, and settled later against purchase items.
- Repairs use a separate service invoice; PC-build invoices may contain assembly charges.
- Invoice GST mode can be inclusive or exclusive and intra-state or interstate.
- Retain historical records; do not automatically delete them after one year.
- VPS private storage plus off-server backup is the selected production direction.
- WhatsApp/bulk messaging remains mock for now.
- Excluded scope is listed in `ANTIGRAVITY-DEVELOPMENT-PROMPT.md` and `DEVELOPMENT-PHASES.md`.

## Open decisions

Resolve these before the dependent production feature is enabled:

| ID | Decision needed | Blocks |
|---|---|---|
| D-001 | Accountant-approved GST rules for used goods, services, assembly, freight, discounts, returns/credit notes, place of supply and rounding | Live invoicing and tax reports |
| D-002 | Invoice/quotation/purchase numbering, financial-year reset, cancelled-number policy and per-company uniqueness | Phase 4 issuing documents |
| D-003 | Opening-data source, cutoff date and approval/reconciliation process | Phase 2 opening balances |
| D-004 | Customer/supplier advance and overpayment policy | Phases 3–5 payments |
| D-005 | Partial delivery and when supplier payable starts: order, invoice or receipt | Phase 3 purchases |
| D-006 | Credit-limit warning versus hard block and override policy | Phase 4 sales |
| D-007 | Closed-day correction/reversal and exceptional reopening authority | Phase 5 closing |
| D-008 | Email ownership verification and account/password/profit-password recovery | Production authentication |
| D-009 | Backup schedule, retention, encryption, off-server target and restore objective | Phase 7 launch |
| D-010 | Production host choice and storage adapter if Vercel is selected | Deployment |

When a decision is resolved, move it to Confirmed decisions with the date, decision maker, chosen behavior and affected migrations/tests.

