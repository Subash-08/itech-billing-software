# Phase 2 and Phase 3 Code Review

Reviewed: 12 September 2026

## Result

Phase 2 master data and Phase 3 purchasing are connected to live tenant data after the corrections below. Modules still marked **Preview** in the sidebar remain mock-only and are outside Phase 2/3.

## Corrections made

- Session hydration now uses the implemented `GET /api/auth/me` endpoint. The previous client URL did not exist, so an approved login could remain in demo mode.
- Sign-out now accepts an empty POST body and invalidates the active Better Auth session.
- The header shows loading, demo, or live-company state; the signed-in user's name, initials, email, and company; links to account/settings; and a working sign-out action.
- Purchases are marked live in the sidebar and are no longer disabled by preview CSS.
- Live purchase arrays replace demo purchases even when the company has zero records, preventing sample transactions from appearing as company data.
- Live purchase totals, paid amounts, line balances, and supplier settlement rows use server-calculated paise values.
- Purchase receipt requests include an idempotency key.
- Receiving an existing purchase now calls the receipt endpoint instead of creating a duplicate purchase.
- Draft purchases can be posted, posted purchases can receive stock, partial receipts can close their remainder, and untouched draft orders can be cancelled from the purchase detail screen.
- Browser business dates use the current Kolkata date instead of a hard-coded prototype date.
- The Record + Receive + Pay shortcut now shares one MongoDB session across its nested purchase, receipt, payment, ledger, and audit operations. A failed duplicate-serial receipt no longer leaves a purchase behind.
- The Phase 3 serial-count test is tenant-scoped and the rollback test now checks collection counts before and after failure.
- Added the missing `npm run test:phase3` script.

## Verification completed in Codex before testing was moved to Antigravity

- TypeScript: passed.
- Domain tests: 26/26 passed.
- Phase 2 Atlas suite: 27/27 passed, including live profile hydration and empty-body sign-out; test data cleaned.
- Phase 3 Atlas suite: 50/50 passed with the stronger atomic rollback assertion; test data cleaned.

The final purchase lifecycle UI addition was type-checked. Run the broader regression and browser walkthrough in Antigravity as requested.

## Antigravity verification checklist

Run these commands from `D:\AI\itech`:

```powershell
npm run typecheck
npm test
npm run test:phase2
npm run test:phase3
npm run build
npm audit
```

Then verify this browser flow with an approved test company:

1. Sign in and confirm the header shows the correct user email, user initials, company name, and **Live data**.
2. Open the account menu, visit Company account and Company settings, then sign out. Confirm the header changes to **Demo workspace** and the signed-out session cannot call `/api/auth/me`.
3. Sign in again, create a draft purchase, and confirm it creates no stock, supplier due, cash movement, or bank movement.
4. Open the draft and post the supplier bill. Confirm the payable appears but stock and account balances do not move.
5. Receive part of a quantity product and a serialized product. Confirm stock increases once, duplicate serials fail, and a retry does not duplicate stock.
6. Pay selected purchase lines using cash and bank. Confirm the selected line dues, supplier statement, purchase status, cash balance, and bank balance update together.
7. Close an unreceived remainder and confirm already received stock remains. Verify the closed remainder cannot be received later.
8. Test a failed Record + Receive + Pay shortcut with a duplicate serial and confirm no purchase, receipt, payment, stock movement, or account movement remains.
9. Confirm a second company cannot view or mutate any IDs created by the first company.

## Scope still pending

Sales invoices, customer receipts and dues, customer returns/refunds, service-job transactions, warranties, reservations, cash/account register, daily closing/profit, reports, and WhatsApp remain Preview or Mixed until their later backend phases are implemented. Do not treat those sample records as production data.