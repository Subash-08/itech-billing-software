# Missed days: resume business without resetting opening balances

Status: requirement/design and source review only, 2026-09-17. Recovery wizard is NOT implemented or tested. Add this to the September 17 acceptance scope before declaring production readiness.

## Decision

Opening setup is a one-time starting point. Never change a finalized cutoff, reset opening cash/bank, delete closures, recreate stock or reset dues to resume after absence. Old closures and entered profit remain historical records. Carry balances forward through every intervening day.

Add **Resume / complete missed days** inside Daily closing, not a new sidebar module. Show last closed date, missing dates, last closing Cash/Bank and current ledger balances. Provide three explicit paths:

1. **Shop closed, no activity:** review a date range and close eligible days as Holiday. Carry balances unchanged, zero new trading profit. Bank fees, customer transfers, supplier payments, stock receipts, returns and service work are activity even when the shop is shut; such days need reconciliation, not a zero-activity holiday.
2. **Transactions entered, closing forgotten:** use existing records. Enter/review pending manual profit, reconcile and close oldest first. Never re-enter sales/payments already present.
3. **Shop operated, transactions missing:** reconcile paper invoices, supplier bills, bank records, service jobs and physical stock first. No balance reset or blanket money-in entry. Recovery of past operational dates requires the controlled workflow below; current endpoints do not support arbitrary historical posting.

## What the current source actually does

- server/closing-service.ts requires all prior calendar days after opening cutoff to be closed before a later day closes. Starting balances use the last closing plus intervening movements, or original opening plus movements.
- Holiday finalization carries starting Cash/Bank unchanged. Its activity check currently covers invoices, account movements and posted purchases only. This is incomplete for stock/service/return/adjustment activity, and counts draft invoices as activity indiscriminately.
- server/business-day.ts fences writes at or before closedThrough. Keep this protection for every financial/stock writer.
- server/sales-posting.ts and server/purchase-service.ts restrict operational posting to today's Kolkata date. A past date selected in a new UI is not sufficient. Do not merely remove those guards.
- Current closing only accepts exact ledger/count equality. It has no explicit reconstructed-count provenance or missed-day recovery case. Do not fill in invented historical physical counts.
- Closing clamps aggregate operating expenses to zero. Review cross-day expense reversals: a refund/reversal can legitimately produce negative net expense for a period; clamping can make register/report/profit disagree. Fix consistently, with source-linked reversal rules and a focused test, not by editing old closures.

## Recovery contract for implementation in Antigravity

Keep ordinary operations simple. Recovery is a deliberate, authenticated, tenant-scoped, audited workflow with reason and reference evidence. It never requires a second company account or resets balances. Reuse existing transaction engines.

1. Gap preview returns bounded dates, recorded activity counts by module, expected balances, missing profits, draft conflicts, reconciliation status and allowed actions. Never infer no business activity solely from no login/no records. User explicitly confirms real-world inactivity.
2. Bulk holiday closure uses bounded chunks, per-day idempotency and a resumable operation ID. Validate date order and all activity inside each transaction under the shared business-day gate. Re-check snapshot versions; stop on the first conflict, show completed/pending dates, never silently skip active days. Future days can be scheduled only, not finalized. Closing today requires explicit confirmation that today's business is finished.
3. Historical recovery posting, if implemented, uses a server-issued recovery scope, allowed module list, date range after opening cutoff and strictly after closedThrough, actor, reason, expiry and version. Ordinary API callers cannot enable backdating with a boolean. All writers use one effective-date policy including nested stock/account/receipt/return/profit events. Preserve actual createdAt and enteredBy alongside operational date and original external document reference/date.
4. Enter known missing documents in dependency order: receipt/opening-stock provenance before sale; invoice before collection/return; supplier bill before settlement. Payments do not recreate invoices, returns do not repay suppliers, and physical stock corrections do not create supplier credits automatically. Validate tenant/customer/supplier/source-line identity, partial quantities, serial lineage, exact paise values, allocations and idempotency normally.
5. Default simple historical posting to a recovery period with no later posted dependent activity. If later activity exists, do not insert an earlier event into the live state blindly. Require an explicit chronological impact/reconciliation plan or current-day source-linked correction; prevent historic negative stock/accounts, double-used serials and rewritten immutable invoice numbers/snapshots. Do not implement a hidden history replay engine to bypass this restriction.
6. If the missed date is already closed or lies on/before original cutoff, use a supported current-day correction workflow linking original evidence. Preserve old snapshots and carry the adjustment forward. Never silently unlock closed days. Original document dates/reference must not be misrepresented as newly issued historical tax documents; separate historical operational evidence from legal document issuance policy.
7. For old unclosed days whose physical counts are unknown, save explicit provenance: reconstructed from records, evidence/reference, enteredAt/by and reconciliation status. Do not call reconstructed balances 'cash counted that day'. Current actual Cash/Bank reconciliation remains required. Unresolved historical completeness must remain visible; no automatic zero profit or fake all-green completion.
8. For an unexplained current cash discrepancy, show expected/actual/difference separately. Correct known missing source transactions first. If still unexplained, retain an unresolved draft. A future explicit reconciliation-adjustment action must record shortage/overage reason, signed amount, account, date, approval and audit; never create a sale or force profit to absorb it. Set profit classification explicitly. No such action is claimed implemented here.
9. Customer/supplier dues, advances, invoice amounts, reservations, warranty dates and service statuses do not reset. Expired reservations are evaluated by effective current time and released through the normal audited stock workflow. A holiday never extends warranty or due dates automatically. Supplier return awaiting credit remains pending regardless of gap recovery.
10. Manual trading profit belongs to its original sale/service. Collection of an old due, supplier settlement, transfer and owner contribution never create trading profit. Reconstructed/missing profit stays pending. Later returns/reversals generate source-linked profit adjustments in an open day when original is closed. Net profit = entered trading profit + reviewed profit adjustments - net operating expenses, under the agreed policy; preserve negative values and display missing-entry counts.
11. Keep profit totals protected by the existing server unlock. Recovery authorization must not expose those totals to an ordinary locked session. Validate safe integer paise, tenant/session scope, version conflicts and duplicate requests throughout.
12. Synchronize Daily closing, register, dashboard, reports and timelines from authoritative events. Carry-forward is a balance derivation, not another money-in transaction. Transfers create equal/opposite Cash/Bank entries, zero combined change. No changes to database manually to make a gap disappear.

## Focused acceptance additions

- Three true inactive days after closing Cash 10000/Bank 20000: every next-day opening unchanged, no extra account movements, zero new profit, prior records unchanged.
- Shop closed but Bank receives 5000 from an old customer due: holiday blocked; source-linked receipt reduces due, Bank becomes 25000, trading profit unchanged.
- Forgot only closing for three days with transactions present: close oldest-first without duplicate documents or movements. Missing profits block normal finalization.
- Missing past sale with no subsequent activity: controlled recovery validates prerequisite stock and proper document references; normal endpoint still rejects arbitrary backdate.
- Already-closed date and pre-cutoff date: historical mutation rejected; supported current-day correction retains original linkage and old snapshots.
- Later sale/payment depends on earlier stock/funds: unsafe recovery is blocked pending explicit reconciliation. No negative historic stock/funds or serial reuse.
- Unknown historic physical count is labelled reconstructed; unresolved discrepancy cannot silently become profit or opening balance.
- Holiday batch retry/disconnect resumes exactly once; concurrent posting, tenant switch, stale review, midnight Kolkata boundary, future date, very long gap and duplicated requests are covered.
- Prior-day expense 1000, current-day reversal 1000: account recovers 1000, old close unchanged, current net expense -1000 and profit/report policy reconciles consistently.
- Paid/unpaid/part-paid supplier return and customer return during recovery retain credit-versus-cash distinction. Advances are not duplicated; all statement and lot invariants hold.

## Scope honesty

The September 17 handoff is a correction/acceptance document, not a complete traceability matrix for every requirement from the conversation. Before claiming completion, update FEATURE-STATUS.md and REMAINING-WORK.md with each requirement, route/UI, server action, relationships, acceptance evidence and status (implemented/unverified/missing/deferred). Include customer phone/GST uniqueness/search, all procurement/sales/returns/warranty flows, templates/export filters, two-account register/profit/holidays, service evidence, tenant approval, WhatsApp preview only, storage/backup and this new recovery requirement. Explicitly retain excluded features such as bulk messaging integration, payroll, GST filing, offline operation and multibranch.
