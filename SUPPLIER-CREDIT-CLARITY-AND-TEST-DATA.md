# Supplier credit confirmation and safe test data

## Clarification
A supplier credit note records a supplier-approved reduction for returned goods. It is not a payment instruction. Physical return and financial acceptance are separate because the supplier may reject the claim or agree a different credit value. Never record a money-out entry just because a credit amount is confirmed.

Example: receive 3 units for Rs 180,000 without paying; sell 1 to a customer; return 1 to supplier; retain 1. Accept Rs 60,000 supplier credit. Bill due is Rs 120,000: the sold unit plus the retained unit. The customer sale does not pay the supplier automatically. Returning stock has no cash movement; accepted credit offsets the original purchase-line due first, and excess becomes supplier credit. An actual supplier refund is recorded separately.

## UI correction
account-history.tsx used estimatedCreditPaise, which is absent on canonical supplierReturns. It now prefers totalReturnCreditPaise, retaining explicit compatibility fields only when present. No invented zero fallback. The amount is prefilled, labelled Supplier-agreed bill reduction, and bounded by the recorded return valuation. The button says Confirm credit — no payment. The original-line allocation is enabled on opening; today's Kolkata date is refreshed. Unchanged retries reuse their idempotency key and immediate double submissions are blocked. Supplier purchases/credits/advances reload after acceptance.

Do not accept the same credit again if the return already shows Accepted. Review its linked credit record, payable and statement. A smaller accepted amount is an agreed adjustment, not money paid. Zero or disputed credit remains pending; rejected/closed-without-credit claims require a separately designed reason/status workflow, not a fake Rs 0.01 credit. Do not promise that workflow is implemented.

## Existing versus fresh test companies
Use both. Keep the existing company for regression and compatibility tests. Create a separately named new test company for a clean acceptance baseline; use the normal signup/approval/onboarding process. Finalize accurate opening setup with cutoff before the first operational business date. Do not change locked cutoff dates in MongoDB, delete transactions to reset a company, or copy a tenant ID between users.

UI labels, corrected payloads and prefill fixes generally do not need database migrations. Schema changes, indexes, canonical field changes and financial data corrections may need versioned migration scripts. Require dry-run, backup, exact tenant scope, idempotent execution, preserved financial history, and before/after reconciliation. A fresh company's success never proves old data is compatible. Missing or inconsistent financial facts must be reported for review, not guessed or reset.

## Antigravity verification
No tests were run by Codex. Verify this correction with typecheck and a browser walkthrough in an isolated test tenant. Return one item from three after selling one, confirm the calculated credit without manually typing an amount, and assert one unit remains, due is two units' value, account balances are unchanged, and no payment record is created. Verify partial/full prior payments, excess supplier credit, smaller accepted credit, missing valuation, over-limit values, retry/double click, separate-line allocation, credit reversal safeguards and current-day dates. Confirm already-accepted rows cannot be accepted twice. Then rerun supplier return and Phase 3/3.5/4 regression suites.

For the old company: reconcile each purchase's original amount, allocated payments/advances, accepted credits and due; compare statement balance and Cash/Bank movements. The screenshot's second bill due Rs 140,000 cannot establish whether its Rs 40,000 reduction was a payment, advance allocation or credit. Inspect source records before deciding. Never manufacture entries to make totals match.
