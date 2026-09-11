# Development log

Record completed implementation work here. Keep entries factual and concise. Do not store secrets, passwords, connection strings or customer data.

## Entry template

### YYYY-MM-DD — Phase and feature

- Scope completed:
- User-visible behavior:
- Collections/indexes/migrations:
- Important files changed:
- Verification commands and results:
- Manual flows checked:
- Remaining mock behavior:
- Follow-up work:

## 2026-09-11 — UI prototype and backend foundation

- Scope completed: reviewed frontend workflows; Better Auth Atlas foundation; pending-company approval; profit-session unlock; private file API; PDF/XLSX/invoice-ZIP generation.
- User-visible behavior: full mock workflow remains available; `/account` reaches the real authentication API.
- Development database: isolated `itech_dev` database. Business records are not persisted yet.
- Verification: production build passed; 26 domain tests passed; temporary-account authentication flow passed; cross-company private-file access was denied; sample invoice PDF was rendered on one A4 page.
- Remaining mock behavior: all customer, supplier, product, purchase, sale, service, money, closing and report source data.

