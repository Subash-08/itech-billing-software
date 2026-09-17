# Login credential incident and hydration correction

17 September 2026 — authoritative repository D:\AI\itech.

## Confirmed findings

Read-only check of the locally configured Atlas development database returned 9 authUsers, 0 credential-provider authAccounts, and 9 users missing credential accounts. No passwords or hashes were printed. No database records were modified.

scripts/cleanup-browser-evidence.mjs contained authAccounts.deleteMany({userId: {$exists: true}}). That predicate deletes all companies' credential accounts. Its execution history was not independently established, but it explains the observed missing credentials. The script now captures fixture users before deletion and restricts account/session deletion to those exact user IDs.

components/store.tsx read localStorage in its initial state initializer, producing different server and client data. It now restores saved demo state after mount, renders a stable loading shell before then, and prevents demo persistence before readiness/session bootstrap completion. A non-incremental TypeScript check passed.

## Recovery required

Do not create replacement company accounts, alter opening balances, disable password verification, or attempt to guess hashes. Business records and user identities must retain their IDs.

Preferred: an authorized operator restores the deleted authAccounts records from an available backup into an isolated recovery database, verifies exact authUsers ID relationships, and restores only missing credential records into the affected database. Never restore the entire production database over newer business transactions. Revoke affected sessions after recovery.

If no backup exists: perform an operator-controlled password reset with explicit account-owner verification, using Better Auth's configured password hashing and exact existing user IDs. Use fresh secrets through a secure channel, not chat or committed files. Recreate only missing credential records, audit the recovery without recording passwords, and revoke sessions. Do not seed all accounts with one shared password.

Confirm which email and environment the user is trying before recovery. The count check above concerns the local environment's database; the deployed Vercel database was not independently inspected.

## Focused verification after recovery

1. Valid password signs in to the existing company; invalid password is rejected; approval/disabled checks still apply.
2. Existing customers, invoices, stock, opening balances and closings remain unchanged.
3. Cold-refresh /sales with saved demo state, empty storage, and a live session: no hydration warning or overwritten saved demo state.
4. Use isolated fixtures to prove cleanup removes fixture credentials only while retaining another tenant's accounts. Do not run cleanup against real company data to test it.
5. Deploy the hydration correction to Vercel separately; deployment cannot recreate deleted credentials.
