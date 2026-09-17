# Service photos and storage — source review and next steps

Authoritative application: `D:\AI\itech`. Review date: 17 September 2026.

## Corrections installed

- Storage GET returns `storageSettingsVersion`. Save/reset require that reviewed version in the API, UI, and service. Missing legacy version is treated as zero. A missing company settings record fails closed. Transactions reject stale updates instead of silently replacing another session's configuration.
- Storage audit records now commit in the storage-change transaction; a separate failing audit can no longer turn a committed change into a misleading failed response.
- Settings preserves entered credentials on conflict, refreshes the configuration, and requires explicit resubmission. Failed status refresh clears stale status rather than silently hiding failure.
- An unresolved custom storage reference is reported as an error rather than displayed as a working default connection.
- Service detail/list requests are cancelled when superseded. Errors have a visible Retry action; only detail HTTP 404 means job not found. Demo mode does not call the live service endpoints.

Validation performed here: `node node_modules/typescript/bin/tsc --noEmit --incremental false` passed. No Atlas records or Cloudinary assets were changed by this review. No live upload, browser acceptance, or regression suite was run here.

## Evidence limitations

The supplied browser walkthrough encountered a missing job. That does not prove Show photos works for an existing job with attachments. The completion replay test inspected during review creates an already-completed pending upload and calls completion sequentially. It proves replay of completed state, not concurrent completion of a genuinely pending upload. Do not describe either as full end-to-end verification.

## Focused Antigravity verification prompt

Work only in D:\AI\itech. Read this handoff and preserve all existing edits. Do not run every historical phase suite. Run the following targeted checks with isolated test companies and tracked fixture IDs; never modify the user's existing company balances or records. Update tests for required expectedVersion on storage save/reset. Do not print environment values, passwords, upload signatures, API secrets, or encryption keys.

1. Existing service job with several authorized photos: opening the page makes zero attachment-content requests. Show photos fetches them only after clicking. Verify previews, hide/reopen, failed-photo retry, route change during loading, and cross-tenant denial. A nonexistent-job screen is not evidence for this test.
2. Verify detail 404, unauthorized response, server failure, and offline failure produce distinguishable behavior; Retry recovers. Quickly navigate between two jobs and confirm no wrong-job photos/details appear. Confirm demo workspace sends no live service-list/detail requests.
3. Exercise a real signed Cloudinary upload using an isolated account/tenant. Verify file bytes, MIME/magic-byte checks, authenticated delivery, pinned connection metadata, actual resource type, and cleanup. Verify the 5 MiB boundary and rejection above it; validate the photo-count limit on both client and service mutation.
4. For a genuinely Pending upload, send concurrent complete requests and an uncertain-response retry. Assert exactly one file record, one completed pending record, tenant isolation, correct byte metadata, and no duplicate cloud asset. Do not replace the behavior under test with direct database writes to Completed status.
5. Two settings tabs read version N. Save a valid connection from tab A; tab B save/reset using N must receive 409, refresh displayed status, preserve entries, and require a new click. Check initial absent version is interpreted as 0. Check missing expectedVersion is rejected. Inspect that connection activation, version change, and audit commit together.
6. Switch platform to custom and back. Existing images/PDFs must still download from their original connection; future uploads use the new one. A broken custom connection must not silently upload to platform storage. Verify no secret is returned by settings APIs or exposed in client bundles/logs.
7. Test provider/network failures and upload cancellation. No infinite spinner or success message before completion. Test credential verification failures and cleanup failure without claiming verification succeeded.

Record exact commands, actual results, fixture cleanup and outstanding failures. Run typecheck and affected tests once after changes. Broaden regression testing only if a failure or shared-code change justifies it. Do not mark production ready merely because typecheck passed.

## Remaining implementation and production gates

1. Pending upload limits currently use count-then-insert and can race under concurrency. Implement a transactional tenant/user quota reservation or equivalent atomic admission control, including release and expiry reconciliation.
2. Expiring pending-upload tracking must not orphan provider assets. Design bounded, authenticated scheduled cleanup before removing tracking records. Cleanup is intentionally blocked; do not simply enable deletion without re-checking ownership, active file references, leases and pinned connections. Keep failed cleanup retryable and observable.
3. Platform connection rotation needs durable versioned account identity/credentials. Current platform identifiers resolve environment credentials, so changing the platform account can make old files unavailable. Do not silently redirect historical files or delete retained custom connections.
4. Audit legacy local/encrypted files and plan explicit migration with backup, checksums and download verification. Switching Vercel to Cloudinary does not migrate old filesystem attachments automatically. Do not silently repair or overwrite user data.
5. Rotate credentials previously pasted into chat and set fresh values only in server environment/secret settings. Preserve required encryption-key versions for existing ciphertext. Never commit secrets or put them in NEXT_PUBLIC variables. Current credential validity was not checked in this review.
6. Complete production deployment checks: exact HTTPS origin allowlist, session/approval enforcement, rate limits, tenant authorization, private downloads, bounded uploads/exports, backup and restore drill, and error monitoring.
7. Earlier application gates still require acceptance evidence: invoice preview/print/PDF/ZIP layout parity and template fields; filtered report totals/exports; supplier receipt/payment/return and customer sale/receipt/return reconciliation; daily closing and signed expenses. This storage pass does not re-verify those features.
8. Historical catch-up for days with real unrecorded activity remains separate from inactive-day holiday closure. Never re-finalize opening balances to bridge that gap or invent physical counts. Bulk WhatsApp remains deferred by request.

Only change a module's label to Live when its supported actions are persisted and connected. A Live badge is not a claim that every production acceptance test has passed.
