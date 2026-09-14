# Tasks to delegate to Antigravity

These tasks are suitable for Antigravity after the architecture and transaction services are fixed:

1. Build responsive list/detail/form UI from existing components without changing domain rules.
2. Add pagination controls, URL-preserved filters, loading/empty/error/retry views, accessibility labels and focus handling.
3. Connect export buttons and verify CSV/XLSX/PDF/ZIP contents.
4. Write integration fixtures, exact cleanup, cross-tenant tests, idempotency tests and browser walkthrough scripts.
5. Maintain `DEVELOPMENT-LOG.md` after each pass and update `VERIFICATION-CHECKLIST.md` only with evidence.
6. Produce screenshots of the invoice, purchase, inventory, supplier, customer dues, warranty and daily-closing flows for client review.
7. Run performance checks on paginated lists and exports; add indexes only when explain plans justify them.
8. Prepare VPS deployment service, persistent private-storage permissions, off-server backup job, environment checklist and restore drill documentation.

Keep Astra/Codex review for transaction invariants, stock/serial concurrency, money allocation, return/reversal math, daily-closing lock rules, data migrations, security boundaries and changes that affect several collections atomically.
