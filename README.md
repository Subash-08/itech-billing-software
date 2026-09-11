# iTech Computers UI prototype

A complete, local frontend workflow prototype for one computer shop in Salem. Built with Next.js App Router, React and TypeScript. The business screens use mock data. The initial backend foundation now connects to MongoDB Atlas with Better Auth account approval and private VPS file APIs. Payment processing and WhatsApp integration are not implemented. See [development phases](DEVELOPMENT-PHASES.md).

## Development handoff

- `ANTIGRAVITY-DEVELOPMENT-PROMPT.md`: master prompt and the exact Phase 2 starting task.
- `CODEX-PHASE-REVIEW-PROMPT.md`: independent review-and-fix prompt to paste into the existing Codex chat after each Antigravity phase.
- `BACKEND-REFERENCE.md`: record relationships, financial rules, GST behavior and edge cases.
- `DEVELOPMENT-PHASES.md`: implementation sequence and storage/deployment plan.
- `DECISIONS.md`: confirmed requirements and decisions that still block particular production features.
- `DEVELOPMENT-LOG.md`: factual record of completed implementation changes.
- `VERIFICATION-CHECKLIST.md`: evidence for automated and end-to-end verification.

## Run

```powershell
cd D:\AI\itech
npm install
npm run dev
```

Open http://127.0.0.1:3000. The demo business date is **10 September 2026**, matching the supplied invoice reference. This fixed date makes the mock reports, reminders and balances reproducible. Dates can be selected inside the relevant screens.

```powershell
npm run typecheck
npm test
npm run build
```

## Review the complete workflow

1. **Inventory**: inspect 15 products, edit a product, add a new product or record a reasoned stock adjustment. Serial numbers identify individual tracked units; untracked components use quantities.
2. **Purchases**: create a purchase order, choose a supplier and products, enter rates and tax, then receive stock. For laptops, monitors, printers and prebuilt PCs, enter one serial per unit. Receive an order once. Pay fully, partly or later; split payments are available at purchase creation. Supplier profiles and Dues allow selecting purchased products across bills.
3. **Customers and enquiries**: use the five mock customers or add one. Add a simple enquiry and follow-up. Search by text, category or status. Create a quotation from an enquiry.
4. **Quotations**: add items, change prices, reorder rows, add assembly charges and inspect tax-inclusive/exclusive totals. Edit, duplicate, mark shared or cancel a quotation. Convert it to an invoice after selecting the sold serials.
5. **Sales and invoices**: issue a new-goods, used-goods or separate service invoice. Use a line GST rate of 0% for an illustrative non-GST line. The demo is not a tax classification engine. Review the Tally-style invoice and use the browser print dialog to print or save PDF.
6. **Payments and dues**: receive full or partial payment. At invoice creation, add Cash and GPay payment rows with the receiving bank account. Remaining outstanding calculates immediately. Follow the linked due until settled.
7. **Service jobs**: record device, serial, condition, accessories and optional local photos. Progress the repair, add a stocked part, create a separate service invoice and hand over the device. Stocked parts are deducted once, when issued to the job.
8. **Stock holds (optional)**: hold quantities and specific serials for a customer. Other customers cannot buy the held serial. Issue a sale to the reservation customer using the selected serial, or release the hold.
9. **Warranty**: selling warranty-covered products creates records linked to serials and the invoice. Review manufacturer/shop coverage and update claim notes/status.
10. **Returns**: select the original sale/purchase, the item and return quantity, serials where applicable, credit amount and stock disposition. An unpaid balance is reduced before a cash refund is allowed. Damaged returns stay out of sellable stock. Settle pending refunds later.
11. **Daily register**: inspect Cash and one Bank account balance. Add expenses, owner withdrawals/contributions and account transfers. Open Daily closing to reconcile cash and every bank. A difference blocks closure. Transfers preserve combined funds. A count never silently changes the ledger.
12. **Daily closing**: enter one manual amount beside each sale/service bill, including non-GST entries, and save. Zero is valid; blank is pending. The paginated date table opens a full daily report; the owner sees profit totals. Close days in order after all entries are complete. Closed days are read-only and balances carry forward. A later return receives its own dated profit adjustment. Schedule shop holidays and close empty days as holidays. Payment instalments do not create extra profit entries. Supplier costs are not deducted again.
13. **Reports**: choose report/date range/category, download PDF or Excel (.xlsx). Select invoices by customer/date/status for a ZIP containing individual PDFs and an Excel index, or open a combined print preview. Inventory and dues are labelled as current balances rather than reconstructed historical balances.
14. **Document library**: preview issued documents and attach a historical PDF to a customer. Attaching a file creates no sale, stock movement, payment or due.
15. **WhatsApp and offers**: change message templates, edit/copy text, preview conversations, choose audiences and save campaign drafts. File selection for bulk contact import is a labelled mock state only. Nothing is sent.
16. **Settings**: update invoice details/logo, review profit-access guidance, export a mock snapshot, download a local shortcut, view activity or reset the demo.

## State and restrictions

- All business state lives in the React provider and survives navigation within the app. Refreshing restores the seed data; no persistence was requested.
- The header profit unlock demonstrates the one-role UI. Its visible demo password is not production security; mock client data is inspectable. The real account API separately implements a hashed profit password and ten-minute server-session unlock, ready for later business API integration.
- Business-screen attachments currently use browser object URLs. Separately, the authenticated /api/files foundation supports private uploads/downloads; those APIs are not yet wired into business forms. Snapshot exports exclude binary attachments and local URLs, including warranty photos.
- Seed stock is the starting imported snapshot after the sample activity. Seed purchase/invoice records are not replayed into it when the app opens. New actions update the snapshot and record movements.
- Default tax examples use 18% with CGST/SGST halves for the single-state demonstration. Actual classifications, tax rounding, interstate tax and final compliant invoice rules must be completed before real billing.
- Printed sample documents are marked **DEMO — not a valid tax invoice**. Real client/supplier bank details from the reference image were not copied into mock settings.
- There is no automatic record deletion. Reset is an explicit demo-only action.
- Warranty terms, invoice rates and prices are illustrative mock data, not product recommendations.
- Stock reservations expire against the fixed demo date. Real-time expiry, concurrent stock control and record locking belong to the later backend implementation.
- CSV exports are usable in Excel. Print/PDF uses the browser dialog; this prototype does not generate server-side PDFs or ZIP archives.
- A feature-detected WebMCP action can open the new invoice form in supporting browsers. It does not issue an invoice. This optional browser integration is not required for normal UI operation.

## Structure for the backend handoff

- `lib/domain.ts`: business record types, totals, balances and availability helpers.
- `lib/seed.ts`: five customers, fifteen products and connected demo records.
- `lib/operations.ts`: pure, validated mock transitions for invoices, purchases, payments, stock, reservations and returns.
- `components/store.tsx`: shared in-memory state, role preview and notifications.
- `components/*`: feature screens and common UI primitives.
- `app/[[...path]]/page.tsx`: route entry; the shared provider in the root layout keeps session state while navigating.
- `tests/domain.test.mjs`: meaningful checks on financial and stock transitions using the same code as the UI.

Future backend work can replace each mock transition with validated server operations while preserving the screens and interaction contracts. MongoDB is planned; Cloudinary versus VPS storage is intentionally undecided.

## Latest review additions

- **Invoice templates** (`/templates`): three layouts; copy, rename, choose a default, change field visibility and item columns, labels, order, alignment, borders, shading, colour, text size, logo position, paper and orientation. Select a template in individual or batch print preview. Shop logo is managed in Settings.
- **Customer profiles**: category spending net of return credits, outstanding, payment history and an activity timeline. Optional business contact, alternate phone, delivery address, location, GSTIN, payment terms, credit limit and language are available. Terms default the invoice due date; credit limit is displayed for staff review, not a hard credit block.
- **Supplier profiles**: item-wise purchased, paid, credited and due amounts. Select items across bills and settle in one action. All allocations succeed together or no payment is recorded. Historical unallocated mock payments use FIFO allocation.
- **Service catalogue** (`/service-catalog`): reusable services with rate, tax, SAC and warranty duration, selectable in a service invoice.
- **Warranty**: duration and optional photos during product invoicing; add coverage after the sale, edit dates and provider, attach photos, and track claims.
- **Sales**: filter-linked invoice and payment totals; click outstanding to show unpaid bills. Customer contribution values are billed spending, not a second cash balance.
- **Daily closing**: September 1–8 are seeded as closed. Start with September 9, then September 10. Enter actual cash and the bank balance exactly, save all invoice and return profit entries, then close. Holiday scheduling does not silently close a day. This fixed-date prototype intentionally blocks further postings once September 10 is closed; refresh restores the mock workspace.
- Invoice identity snapshots preserve customer and shop details when the master records change. A receipt of an older purchase order preserves the original purchase date and records a separate stock receipt date.

Validation: production build and domain workflow checks passed. HTTP route checks passed. Interactive browser and print-layout review remains for the user; this is not a production-readiness certification.


## Cash, purchase and GST revision

- Use **Cash & account** for separate Money in / Money out actions and a simple two-way Cash ↔ Bank transfer. The old `/expenses` URL opens this same consolidated screen.
- Money in can settle an outstanding sales, service or non-GST invoice, or record an owner contribution / other receipt. Money out can pay a supplier's selected purchased products or record a shop expense.
- `/inventory/new` is a full product page with inclusive/exclusive price and purchase-cost previews. Prices, discounts and charge rows use `lib/gst.ts` throughout the app.
- Invoice composition includes a named template selector, separate ship-to address, amount or percentage line discounts, shipping/other charges, and source-purchase references. Print templates show Bill to and Ship to and support editable company logos.
- Daily closing shows customer payment status and available supplier purchase-item payment references beside manual profit. Inventory product details also link to their supplier bills.
- Read **[BACKEND-REFERENCE.md](BACKEND-REFERENCE.md)** before replacing mock state with backend operations. It records relationships, schema fields, calculator behaviour, audit/locking rules and unresolved production tax/stock/payment decisions.

## Atlas account foundation

Configure `.env.local` from `.env.example` (never commit secrets). The development database is `itech_dev`. Open `/account`, register a company, then approve it from a trusted terminal with `npm run account:approve -- email@example.com`. Login remains blocked until both user and company are verified. Private storage uses `PRIVATE_STORAGE_ROOT` outside the application.

Verified: production build; 26 domain tests; Atlas signup/approval/login/profit unlock/logout; tenant-isolated private file upload/download; PDF/Excel/ZIP generation. The compact sample invoice was rendered and visually checked. Automated browser interaction testing was not performed.

Optional explicit integration scripts: `node scripts/check-atlas.mjs` and `node scripts/check-private-files.mjs` (running dev server and itech_dev configuration required). They create temporary test records and remove only those records. Rate limits remain active; do not repeatedly run signup checks in a short interval.
