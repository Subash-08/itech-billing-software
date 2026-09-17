# Vercel, tenant Cloudinary and recovery review

Source review: 2026-09-17. No tests, external uploads, credential validation, database mutation or Vercel deployment performed by Codex in this review.

## Findings

The six prior missed-day changes are present: canonical return dates, sequential checks with sessions, inactive prefix, visible fetch errors, pagination controls and closing-history continuity. UI retains a retry key for an unchanged fingerprint. The test now races two bulk closing calls; that does not prove service-posting-versus-closing race behavior. API replay is not a browser lost-response test. Real current expense/reversal endpoints are exercised with a directly seeded prior expense fixture. Record these distinctions honestly.

Critical new storage findings in server/storage.ts:
- uploadToCloudinary does not specify restricted delivery type. Signed upload authentication does not make delivery private. secure_url means HTTPS, not tenant authorization.
- deleteFromCloudinary ignores missing configuration, HTTP errors and provider errors; cleanup then removes the database file record and reports success.
- root() returns an empty string whenever Cloudinary is configured, even when getFile is trying to read an old local asset. Storage selection must be per file, not current default.
- Cloudinary account/connection identity is not recorded per asset. The proposed default/custom reset resolver would use the wrong account for old files.
- Proposed hardcoded credential fallbacks and reuse of BETTER_AUTH_SECRET for encryption must be removed from the design.
- Current upload limit is 5 MB but Vercel Function payload limit is 4.5 MB, including multipart overhead. Existing buffered download paths also need review for payload limits.
- checkOrigin trusts request Host/X-Forwarded-Host and includes HTTP in production. Use an explicit configured origin allowlist shared with Better Auth.

## Implementation prompt for Antigravity

Work in D:\AI\itech. Read AGENTS.md, current source and prior handoffs. Implement the following as one storage/auth correction feature, preserving all transaction workflows and files. Do not touch test 1 data, rotate credentials automatically, or bulk delete/migrate user assets without a reviewed migration plan. Do not place credential values in source, logs, documentation, test fixtures or NEXT_PUBLIC variables.

### A. Production login

Require BETTER_AUTH_URL and APP_ORIGIN to identify the canonical production origin, https://itech-billing-software.vercel.app for this deployment. Normalize exact origins once and share the allowlist with Better Auth. Additional approved custom/preview origins must be explicitly configured. Do not allow arbitrary *.vercel.app, incoming Host/X-Forwarded-Host, or production HTTP. Missing/invalid production configuration must fail clearly. Keep localhost development behavior explicit. Verify login, logout, signup, cookie/session continuity and write CSRF checks after redeploy. Do not disable origin checks to fix login.

### B. Credential storage and access

Platform defaults come only from server environment variables CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET. Missing default credentials means unavailable, not hardcoded fallback. Operator must rotate previously disclosed secrets and configure replacements separately.

Use a dedicated random 32-byte encryption key, e.g. STORAGE_CREDENTIALS_KEY_V1 (base64 encoded); never derive it from the auth signing secret. AES-256-GCM envelope stores algorithm/version, key ID, random 12-byte IV, ciphertext and authentication tag. Bind tenant ID, connection ID and version as authenticated additional data. Support key rotation while retaining decryption of referenced old versions; invalid/tampered ciphertext fails closed. Back up key material separately and securely.

Store secrets in a separate server-only storageConnections collection rather than general companySettings/bootstrap responses. Store only activeStorageConnectionId in company settings. Explicit response DTOs expose provider, cloud name, configured/verified status, lastVerifiedAt and safe display labels; never return ciphertext or plaintext secrets. Use a fixed configured indicator, not secret suffixes. Never insert a masked placeholder into an update as a new secret.

Since the app uses a single ordinary role, storage mutation requires recent account-password reauthentication scoped to the authenticated tenant/session, short expiry and rate limiting. Do not misuse profit unlock as storage authorization. GET does not expose platform credentials. Validate origin, tenant approval and account enabled state on every sensitive route. Test/save/reset have audited outcomes with credentials redacted.

### C. Provider switching without broken files

Use immutable/versioned storage connections with lifecycle ActiveForNewUploads/ReadOnlyRetained/Unavailable. File metadata pins storageProvider, storageConnectionId, cloud name, provider asset ID, public ID, resource type, delivery type, version, MIME, byte size, tenant and checksum as appropriate. Never derive an old asset's connection from today's company settings.

Reset to platform default changes only the destination for future uploads. Keep referenced old connection versions for reads/deletes; do not delete custom secrets when resetting. Explain this in UI. Switching account does not move assets. If the client revokes credentials, show old assets unavailable; do not retry their IDs in the platform account. No silent fallback to platform after a custom provider fails/quota is exhausted. Same-account credential rotation must retain access to existing assets and validate the account identity.

Backfill legacy local/provider metadata using a dry-run, bounded migration with audit and validation. Fix local root resolution independently of the current upload provider. Vercel cannot access files still located on a Windows PC or old VPS: migration must run on a host with access, preserve file IDs/references, verify bytes and provider retrieval, and retain originals until verified. Do not claim this migration is automatic.

### D. Private upload/download

Use authenticated Cloudinary delivery for private photos/documents. A tenant folder is a naming convention, not authorization. Verify PDF/image behavior and provider configuration using restricted delivery. Gate every app download by tenant; use server fetch or an appropriately short-lived provider-authorized delivery mechanism. Signed URLs are bearer links, not proof of the viewer's identity. Preserve Cache-Control: private, no-store on authorized app responses. Do not expose durable public URLs in metadata/bootstrap/export manifests.

Keep client secrets server-only. For the requested 5 MB upload allowance on Vercel, implement constrained direct-to-provider signed uploads with a server-created pendingUpload record bound to tenant, user, connection version, nonce and immutable public ID. No arbitrary signed parameter endpoint or unsigned public upload preset. Provider restrictions plus completion verification must enforce type/size/ownership. Verify provider metadata and file signatures through a safe, bounded mechanism before status Active; direct-upload pending assets cannot be attached to invoices/jobs. Use fixed provider hosts/paths, timeouts, limits and redirect restrictions; never fetch arbitrary client URLs. Reject cross-tenant/replayed completion, mismatched IDs and wrong MIME. Clean only abandoned unreferenced pending assets after a grace period. If this cannot be completed, explicitly choose and document a temporary lower upload cap; do not advertise 5 MB while requests fail on Vercel.

Review PDF ZIP generation/download duration and size on Vercel. Large exports need bounded jobs and private storage-backed download with expiration rather than a huge buffered response. Preserve filters, full counts and manifest; no silent truncation.

### E. Provider failures, connection tests and cleanup

Test/save must validate image and PDF permissions relevant to this app, using fixed tiny generated content and a unique test prefix, never user assets. Handle upload success/delete failure explicitly and track leftovers for retry. Rate-limit test endpoints, validate cloud-name syntax and prevent arbitrary endpoints. Do not say verified solely because env variables exist. Return Configured/Verified at timestamp/Unavailable accurately.

Deletion must use the asset's pinned connection and exact resource/delivery type. Check HTTP and provider result; accepted already-absent responses are idempotent. Preserve metadata/tombstones and retry state on failure. Record errors without secrets. Protect attachment-vs-cleanup races with a transactional claim/reference policy; scanning collections alone is not enough. Audit referenced logos in issued snapshots, template revisions, service photos, warranty attachments and purchase documents. Cloud API and Mongo cannot share one transaction: use pending/finalized state and compensation/retry jobs for partial failures.

### F. Settings UX

Display Platform managed storage by default only when configured. Optional Connect your Cloudinary form: cloud name, API key, write-only API secret, test, save, connection status. Reset label: Use platform storage for future uploads. Explain old files remain in their original account. Never require ordinary shop staff to configure storage during basic onboarding. Do not promise unlimited or cost-free storage: show quotas/errors where available and leave pricing claims to current provider terms.

### G. Focused verification

- Default A/custom B tenant isolation for uploads, downloads, deletes, settings and pending-upload finalization.
- Platform -> custom -> reset: ALL earlier photos, logos and PDFs still load and delete using original connection.
- Public unauthenticated asset retrieval denied; authorized tenant access succeeds; guessed cross-tenant ID denied.
- Secret never appears in API GET/bootstrap, logs, audit snapshots or source. Encryption tampering/rotation tested. Reauthentication required for mutations.
- 5 MB Vercel deployment upload, invalid content, PDF permissions, unsupported type, duplicate completion, quota outage and revoked credentials.
- Provider upload succeeds/database fails; provider deletion fails; concurrent attach/cleanup; settings changed during upload.
- Existing local assets still load locally after enabling Cloudinary. Vercel old-local references clearly identify migration needed.
- Origin allowlist rejects hostile, spoofed forwarded-host, missing origin and production HTTP; canonical login and normal writes work.
- Missed-day browser retry actually simulate a lost response; service update versus closing race in addition to two closing calls. Reset confirmation on changed ranges; do not submit stale summaries while loading or after fetch error.

Run focused tests while editing, then one typecheck/build. Real provider smoke tests should use isolated test folders/accounts and exact asset cleanup. Do not rerun every historical suite on each edit. Return exact changed files, evidence and unresolved cases. No 100% production-ready claim based on compilation alone.

## Remaining product gate

After storage/auth: finish bounded reports and full-filter totals, return-credit/refund/offset splits, protected profit/export reconciliation, print/PDF template parity, historical catch-up and discrepancy handling according to approved scope, then full shop-flow acceptance, database/files/key backup restoration, production monitoring and controlled pilot. Cloudinary integration does not replace backups or complete those modules.
