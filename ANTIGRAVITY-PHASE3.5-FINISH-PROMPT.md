# Antigravity prompt — finish and prove Phase 3.5

Work in `D:\AI\itech`. Read `AGENTS.md`, `PHASE-3.5-COMPLETION.md`, `PHASE-3.5-VERIFICATION-PROMPT.md`, `BACKEND-REFERENCE.md`, and the existing Phase 3.5 plan. Preserve current uncommitted work and secrets. The complex transaction corrections have been staged, but do not assume they compile or pass until you prove them.

Complete these remaining routine UI/API integration tasks before verification:

1. Inventory product detail must expose simple tabs for Overview, Stock lots, Serial units, Stock movements, Purchase sources, and Audit history. Use the existing bounded live endpoints, add Previous/Next pagination per tab, show source purchase/supplier/receipt and line-level settlement status, and never fall back to mock rows after a live API failure.
2. Purchase detail must load Receipts, Allocations/Payments, Returns, and Credit notes from their dedicated paginated endpoints. Keep `GET /api/purchases/[id]` compact; remove the temporary capped embedded-history dependency after the tabs are connected. Add pagination and error/retry states per tab.
3. Purchase list must preserve search/status/date/page in URL parameters, show separate document/bill/receipt/payment badges, and export the exact active filters. Verify summary cards apply the intended filters.
4. Supplier profile must prove all eight tabs using live data. Add full pagination and actions for exact-line advance allocation, supplier refund into Cash/Bank, financial-only credit note, return credit-note acceptance, and every allowed reversal. Use server `canReverse` and `reverseBlockReason` while keeping server checks authoritative.
5. Supplier settlement must support full, partial, multi-line, multi-bill, opening payable, advance-only, and split Cash/Bank payment. Component totals must equal allocations plus explicit excess. Keep the stable idempotency key for retries and rotate it only after success or deliberate intent reset.
6. Purchase draft editing must use PUT with the loaded exact version. The conflict dialog needs both Reload latest and Cancel. Posted financial fields remain read-only. Supplier/product selectors use live server search. Private attachment remove/replacement must leave safe orphan cleanup behavior.
7. Complete loading, empty, error, retry, disabled and success states; prevent double submit; confirm dialog keyboard/focus behavior; keep desktop-first responsive layout.
8. Keep Purchases, Inventory and Suppliers labeled LIVE only after their live workflows pass. Returns is MIXED because supplier returns are live while customer returns await Phase 4.

Then execute every check in `PHASE-3.5-VERIFICATION-PROMPT.md`. Fix failures with the smallest change, rerun affected/regression suites, clean test tenants and files, and record evidence in `VERIFICATION-CHECKLIST.md`, `DEVELOPMENT-LOG.md`, and `walkthrough.md`. Report any open item instead of claiming completion.
