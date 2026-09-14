# Phase 2 implementation-plan review

Verdict: **Approved after the required adjustments below are incorporated into the plan. Do not implement the current plan unchanged.**

The proposed tenant isolation, paise storage, explicit demo import, auditing and two-company isolation tests are correct. The following changes prevent Phase 2 records from becoming incompatible with purchase lots, supplier allocations, historical documents and daily closing in later phases.

## Required adjustments

### 1. Make opening setup a draft followed by one irreversible finalization

- A live company must use its actual selected cutoff date. `2026-09-10` is only the fixed demo date and must never default in Live mode.
- Store onboarding as `Draft` until the user reviews a reconciliation summary and explicitly finalizes it.
- Saving a draft may replace draft lines; it must not post stock or money events repeatedly.
- Finalization happens once in one transaction and creates the opening records, stock/serial records, ledger opening events and audit event.
- After finalization, opening setup is read-only. Do not edit or backdate it. Later corrections require an audited current-day adjustment/reversal workflow in Phase 5.
- Block finalization if live business transactions already exist or if references/serial counts/totals do not reconcile.
- Store `cutoffDate` as an Asia/Kolkata business date and store event timestamps separately in UTC.

### 2. Do not store opening dues as mutable customer/supplier totals

- `Customer.openingDue` and `Supplier.openingDue` must not be authoritative balance fields.
- Create stable `openingReceivables` and `openingPayables` records/lines linked to customer or supplier. These act as allocatable source documents for later customer receipts and supplier payments.
- Current due is derived from opening items plus later invoices/purchases, credits and payment allocations. A cached balance is allowed only as a transactionally maintained projection, never a second independent source of truth.
- Opening records need original reference/description, date, amount in paise, remaining amount in paise and stable ID.

### 3. Separate product identity from inventory and serial units

- Product master must not own authoritative `stock` and `serials` arrays.
- Use `stockLots`/opening lots, `serialUnits` and append-only `stockMovements`. Each opening serial becomes a separate tenant-scoped serial-unit record linked to product, opening lot and opening movement.
- Add a unique compound index on normalized serial value per tenant, using a separate collection. An array multikey index on `products.serials` is insufficient for future unit status, purchase-lot allocation, sale, reservation, return and warranty links.
- Quantity-tracked inventory uses signed movements and a transactionally maintained on-hand projection if needed for performance.
- `supplierId` must not describe the source supplier for all units of a product because the same product can come from several suppliers. It may be renamed `preferredSupplierId` and remain optional; actual sourcing belongs to stock lots/purchase lines.
- General stock adjustments need a reason, direction, quantity, serial changes, idempotency key and audit event. They must not claim to validate reservations until reservations are persisted in Phase 4.

### 4. Complete the product price model

- Store `costPaise` and `sellingPricePaise` as integers.
- Also store the default price-entry mode (`Inclusive` or `Exclusive`) and integer tax rate representation, such as basis points, rather than an unrestricted floating-point percentage.
- Validate HSN/SAC as trimmed strings because leading zeroes and future code formats must be preserved.
- Product defaults are only defaults. Later purchase and invoice lines store immutable price/tax/discount snapshots.

### 5. Preserve invoice-template history

- Add stable template identity plus immutable revisions/version numbers. Editing a template creates or records a new revision; an issued invoice will later reference the exact revision used.
- Copy creates a new template identity. Rename changes the display name without changing historical invoice snapshots.
- Enforce one default template per tenant with a transaction and a partial unique index applying only when `isDefault: true`. A normal `{tenantId, isDefault}` unique index would incorrectly allow only one non-default template too.
- Validate field keys and column IDs against an allowlist; reject duplicate column IDs and require all mandatory calculation columns needed by the selected layout.

### 6. Use archival instead of destructive deletion

- Customer, supplier, product, service and template “Delete” actions should archive/deactivate records using `status`, `archivedAt`, `archivedBy` and audit history.
- Archived records remain resolvable for history but are excluded from normal selectors.
- Block archival when an active dependency makes it unsafe. Never hard-delete records referenced by opening items, stock, issued documents or later transactions.

### 7. Fix uniqueness and normalization rules

- Do not make customer/supplier phone globally mandatory and unique without an agreed policy. Different contacts can share a number, and some customers may provide no number.
- Normalize phone, email, GSTIN, serial and template-name search keys. Use partial unique indexes only for values that are truly unique and present.
- GSTIN, if provided, can be unique per tenant after normalization; customer/supplier phone should default to duplicate warning rather than hard rejection.
- Make duplicate handling explicit for product SKU, normalized serial, template name and service name.

### 8. Avoid an unbounded bootstrap response

- `/api/master/bootstrap` should return company mode/settings, opening status, counts and first-page summaries only. It must not return every customer, supplier, product, service, template and audit record as the company grows.
- Lists remain server-paginated and filtered. Detail pages fetch by stable ID.
- Never hydrate all real company data into the same client object used by mock financial operations.

### 9. Keep Demo and Live operations unmistakably separate

- Use an explicit repository/API boundary and mapper between API paise records and UI display values.
- In Live mode, disable or clearly label purchase, sales, payment, service, closing and other mutations that remain mock until their backend phase. A signed-in user must never believe an in-memory invoice or payment persisted.
- Prefer submit-and-confirm/refetch for master mutations. Do not implement broad optimistic rollback unless conflicts and versioning are fully handled.
- Add version fields or conditional-update checks where two sessions could overwrite the same record.

### 10. Strengthen audit behavior

- Use an allowlist for audit snapshot fields rather than recursively removing only known secret names.
- Audit writes that describe a mutation must participate in the same transaction as that mutation.
- Record action, entity, before/after allowed fields, actor, timestamp, request/correlation ID and schema version. Audit entries are append-only and tenant-scoped.
- Limit audit viewing/export appropriately because customer contact details are still personal information even when passwords are removed.

### 11. Validate all referenced IDs inside tenant scope

- Logo file IDs must resolve to a private file owned by the same tenant. Store the file ID, not an arbitrary private filesystem path. Do not trust a browser URL as ownership proof.
- `preferredSupplierId`, opening customer/supplier IDs and every other relation must be resolved with `{tenantId, _id}`. A cross-tenant or missing relation returns 404.
- Route IDs must be validated before database queries. Mutating routes must retain origin/CSRF protection and bounded request bodies.

### 12. Make demo import safe and explicit

- Allow import only into a fresh tenant with no finalized opening setup or business/master data, or require a clearly designed replacement workflow before finalization.
- Make import idempotent, transactional and reference-aware. Remap all seed IDs so they cannot collide across tenants.
- Mark imported records as demo/sample data and show a permanent Live-company warning until the sample data is deliberately removed through an exact, safe workflow.
- Never provide a collection-wide cleanup operation.

## Verification additions

Keep the proposed two-company test and add these cases:

- Company B cannot use Company A's supplier, customer, file, product, template, opening-record or serial ID as a relation in a create/update request.
- Company B cannot infer Company A data through counts, search, pagination metadata, duplicate errors, audit or export.
- Two tenants may use the same normalized serial/template name/optional GSTIN where uniqueness is tenant-scoped; duplicates within one tenant follow the defined policy.
- Duplicate serials in one request and across separate products are rejected.
- Opening draft saves do not create ledger/stock events; repeated finalization is rejected or idempotently returns the original result.
- A forced failure during opening finalization leaves no partial balances, lots, serials, movements or audit event.
- Archived records disappear from active selectors but remain available to authorized historical references.
- Template default switching leaves exactly one default after concurrent requests; revisions remain unchanged after later edits.
- Pagination metadata and filters remain tenant-isolated.
- Live-mode not-yet-migrated financial actions are disabled or unmistakably non-persistent.
- Tests record every generated tenant/user/entity/file ID and clean up only those exact values. Never delete a whole collection or database.

## Scope boundary

Phase 2 may define interfaces needed by later phases, but it must not implement live purchasing, invoicing, customer/supplier payment allocation, reservations, returns or daily closing. Opening stock and balances are special onboarding source records, not ordinary live transactions.

## Instruction to Antigravity

Revise `implementation_plan.md` to incorporate every required adjustment above. Update D-003 in `DECISIONS.md` to the proposed one-time Draft → Finalized opening workflow and identify it as pending user acceptance if the user has not yet explicitly accepted that behavior. Show the revised data relationships, indexes, transaction boundaries, Live/Demo boundary and expanded verification matrix. Then proceed with implementation only after the revised plan contains these items.

