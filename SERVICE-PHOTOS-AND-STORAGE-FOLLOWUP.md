# Service photos and storage corrections

## Implemented in this pass

- Service detail now includes Show photos / Hide photos. Update/intake forms also use the same viewer. No photo bytes requested before the click; at most five sequential downloads, 5 MiB each, tenant-authorized API only. Blob URLs are revoked on hide/unmount; pending requests abort; per-photo failures allow retry. No persistent public Cloudinary URL is put in the page.
- Live service detail no longer falls back to demo job records after an API miss.
- Selected custom storage failure rejects uploads instead of silently routing to platform storage.
- Direct upload completion verifies provider identity, actual length and file signature/MIME; computes checksum. File promotion and pending completion now share a Mongo transaction and cannot overwrite an existing file using an upsert. Provider verification is outside the transaction; expiry/status are rechecked within it.
- Proxy PDF upload records the actual provider resource type, rather than always labelling PDF as raw.
- Saved Cloudinary file account mismatch fails closed instead of reading in a changed platform account.
- ZIP invoice logo loading consumes the new storage stream contract with a bounded buffer.
- Orphan cleanup intentionally returns 409 until a safe replacement exists. Previous scanner omitted service device.photos, canonical template collections/revisions, warranty evidence and issued invoice logos; it could delete still-used assets. No files were deleted.

## Actual limits / storage behavior

Service: optional maximum five images total per job, PNG/JPEG/WebP, 5 MiB (5,242,880 bytes) each. Shared file helper also accepts PDF for appropriate non-service attachments. Direct-to-Cloudinary uploads bypass application multipart body limits; legacy proxy is 4 MiB on Vercel, 5 MiB locally. Local files remain local; earlier uploads are not automatically migrated by enabling Cloudinary. Successful active cloud completion saves provider reference metadata in Mongo, content in the selected Cloudinary account. No live Cloudinary upload was performed by Codex during this source correction.

## Security/production issues still requiring implementation

1. Remove deterministic development encryption key fallback from server/storage-encryption.ts. Do not just replace keys: audit whether existing envelopes used fallback and plan controlled re-encryption. Rotating Cloudinary credentials is different from rotating the storage encryption master key; never discard keys needed by retained assets.
2. Platform connections still map all platform-* IDs to current environment credentials. Implement versioned account identity and retain old connections. The new cloud-name check prevents misrouting but does not migrate old files or restore absent credentials.
3. Custom save/reset are still multiple nontransactional writes. Add expectedVersion and atomic pointer/lifecycle changes; do not retire a valid connection before a replacement can be encrypted and committed. Verify account switches during prepared uploads.
4. pendingUploads TTL currently deletes tracking metadata while provider signatures/assets may remain usable. Implement retained cleanup records/jobs with upload-window-aware grace and provider-enforced limits. Do not re-enable orphan deletion until all canonical reference fields and attach-vs-delete claims are tested.
5. Cloudinary test currently checks image upload only and ignores cleanup failure; extend to authenticated PDF delivery, checked deletes and leftover retry tracking. Status Verified must reflect exactly what was tested.
6. Prepare endpoints lack robust pending/upload quotas. Add tenant/user rate limits, signed preset constraints for format/size, bounded provider timeouts and replay cases. Completion validation prevents activation but alone does not prevent malicious bandwidth/storage consumption.
7. Shared upload helper needs timeout, abort-listener cleanup and retry-resume of the same fileId after an uncertain complete response; do not create another cloud asset on every retry. Viewer image fetching is click-only, but general avatar/company-logo behavior is unchanged.
8. Review all private-download methods on real image/raw PDF assets; preserve expiration, no-store and byte bounds. Reject revoked credentials clearly. Existing public assets and local files still need explicit verified migration.

## Focused Antigravity verification prompt

Work only in D:\AI\itech; preserve all existing edits/data. Read this document and STORAGE-PLAN-FINAL-REVIEW.md. Do not claim the prior eight tests cover the full direct-upload lifecycle.

1. Open /services/JOB-MU5ECY9S-IN7. Network panel must show no /api/files/{id} requests before Show photos; click loads photos in-place. Hide/unmount aborts and frees blobs. Test empty job, failed/missing file, other-tenant file, revoked storage, expired session, new job navigation and retry. No seeded job fallback in live mode.
2. Upload valid PNG/JPEG/WebP to a disposable job using prepare -> actual Cloudinary upload -> complete -> job save. Reload, click Show photos, compare content. Verify both default/custom storage and reset with old photos retained. Test 5 MiB boundary, sixth image, PDF rejection in service, fake MIME, renamed file and oversized direct-provider content.
3. Concurrent /complete calls yield one file and consistent completed pending state. Retry after successful response loss returns same file. Expired/deleted/changed pending state cannot be activated. Capture real provider verification, not just preparation signatures.
4. PDF upload/download and invoice ZIP logo render succeed with actual provider resource type and streaming contract. Check long multipage invoice output separately.
5. Selected custom account unavailable must not fall back to default. Changed platform cloud name produces clear unavailable error for old pinned files.
6. Cleanup returns 409 with no provider/DB deletion until replacement is ready. Repair reference model and race handling before removing this guard. Existing photos, template revisions, warranty evidence and historical logos must survive.
7. Complete remaining security items above; use isolated assets, exact cleanup only, no production user data mutation. Run focused checks and one build after changes stabilize, then update evidence/status honestly.

Remaining product scope: full-filter report totals/pagination, return/refund/profit distinctions, exact print/PDF parity, historical catch-up/discrepancy scope, backup restore and deployment pilot. Not completed by this photo UI pass.
