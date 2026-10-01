# AntiGravity verification only — September 25 feature pass

Work only in `D:\AI\itech`. Do not implement, refactor, migrate, seed production data, or change financial records. Verify the current implementation and report defects with exact reproduction steps, request/response payloads, console output, screenshots, and affected file/line suggestions. Use an isolated approved test tenant.

## Fast automated gate

1. Run `npm run typecheck`.
2. Run `npm run build`.
3. Run only focused tests that already exist for sales filters, invoice snapshots, exports, templates, and tenant isolation. Do not run every historical phase suite during investigation.
4. Run the full regression gate once only after all focused checks pass.

## Product and service descriptions

1. Create a product with a multiline specification description and a service with a description.
2. Edit both and confirm persistence after refresh.
3. Search the product using a word found only in its description.
4. Add each to an invoice and confirm the description is copied but remains editable per invoice line.
5. Issue the invoice, later change the product/service master descriptions, and confirm the issued invoice still prints the original snapshot text.
6. Confirm old products and old invoices without descriptions still open and print.

## Search and inline customer creation

1. On New invoice, type rapidly into customer and product search. Confirm stale earlier responses never replace the newest results.
2. Confirm the UI does not download the complete customer/product collection.
3. Create a customer from the invoice page. Confirm the unfinished invoice remains intact, the customer is selected automatically, and duplicate phone/GST errors appear inside the form.
4. Repeat with at least 100 master records to verify pagination and response time.

## Sales filters and summaries

Create issued paid, partly paid, unpaid, draft, and cancelled invoices across New goods, Used goods, and Service categories; include intra-state and interstate invoices.

Verify 1D, 7D, 30D, This month, and custom dates. Combine date, search, document status, payment status, category, and GST supply filters. For every combination confirm:

- URL parameters survive refresh and Back/Forward navigation;
- table membership is correct;
- page count and ordering are stable;
- summary cards equal the full filtered result, not the visible page;
- CSV, XLSX, report PDF, and batch ZIP use the same selection;
- a search matches invoice number, customer name, and phone;
- another tenant cannot see or export any record.

## Draft safety

Download and print a draft. Confirm it says `DRAFT - NOT A TAX INVOICE` and uses `Draft reference`. Confirm the operation creates no stock movement, receivable, tax posting, receipt, warranty, or Cash/Bank movement. Official exports must exclude drafts unless Draft is explicitly selected.

## Invoice and ZIP visual parity

Generate PDFs for:

- one normal item;
- ten items;
- long multiline descriptions;
- serials and warranty text;
- Bill To and different Ship To;
- intra-state CGST/SGST;
- interstate IGST;
- taxable, exempt, and non-GST lines;
- discount, shipping charge, and round-off;
- company logo and no logo.

Compare browser preview, Print/PDF, Sales Batch PDFs ZIP, and Reports Invoice ZIP. Confirm filenames use visible invoice numbers, issued invoices use immutable seller/customer/template/item snapshots, one-page invoices stay on one page, and genuine overflow continues at readable size instead of shrinking. Inspect every generated page for clipped borders, split text, blank extra pages, missing currency values, or changed alignment.

## WhatsApp

1. On an issued invoice, confirm `Send on WhatsApp` opens a correctly encoded `wa.me` URL containing customer name, invoice number, total, and outstanding amount.
2. Confirm the UI does not claim the PDF is automatically attached.
3. From a customer profile, confirm the thank-you action opens a prefilled greeting.
4. Test `9876543210`, `+91 98765 43210`, `09876543210`, blank, landline, and malformed numbers. Only valid Indian mobile numbers should enable the direct action.
5. Confirm no message is sent without the staff member reviewing and pressing Send in WhatsApp.

## Performance evidence

Capture browser Network evidence for first Dashboard load, New invoice, customer search, product search, Sales filters, invoice detail, and batch preparation. Report request count, transferred JavaScript, API duration, Atlas query duration if available, and any repeated request. Confirm module code is loaded on demand and index initialization does not run one `listIndexes` query per index.

Return a concise verification report with Pass/Fail/Blocked for each section. Do not mark visual or manual cases passed without screenshots or generated-file inspection.
