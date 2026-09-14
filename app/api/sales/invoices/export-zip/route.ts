import {requireIdentity} from '@/server/auth';
import {database, AppError} from '@/server/db';
import {col} from '@/server/purchase-service';
import JSZip from 'jszip';
import {jsPDF} from 'jspdf';
import autoTable from 'jspdf-autotable';
import type {InvoiceDocument} from '@/server/sales-service';

export const runtime = 'nodejs';

const MAX_ZIP_LIMIT = 500;

export async function GET(request: Request) {
  try {
    const identity = await requireIdentity();
    const db = await database();
    const url = new URL(request.url);

    const customerId = url.searchParams.get('customerId') || undefined;
    const status = url.searchParams.get('status') || undefined;
    const dateFrom = url.searchParams.get('dateFrom') || undefined;
    const dateTo = url.searchParams.get('dateTo') || undefined;
    const search = (url.searchParams.get('search') || '').trim().slice(0, 200);

    const filter: Record<string, any> = {tenantId: identity.tenantId};
    if (customerId) filter.customerId = customerId;
    if (status && status !== 'All') filter.status = status;
    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        {invoiceNumber: {$regex: escaped, $options: 'i'}},
        {'customerSnapshot.name': {$regex: escaped, $options: 'i'}},
      ];
    }
    if (dateFrom || dateTo) {
      filter.invoiceDate = {};
      if (dateFrom) filter.invoiceDate.$gte = dateFrom;
      if (dateTo) filter.invoiceDate.$lte = dateTo;
    }

    const totalCount = await col<InvoiceDocument>(db, 'invoices').countDocuments(filter);
    if (totalCount === 0) {
      throw new AppError(404, 'No invoices match the requested criteria.');
    }
    if (totalCount > MAX_ZIP_LIMIT) {
      throw new AppError(
        400,
        `Query matches ${totalCount} invoices, exceeding the maximum export limit of ${MAX_ZIP_LIMIT}. Please narrow your date range or filter.`
      );
    }

    const invoices = await col<InvoiceDocument>(db, 'invoices')
      .find(filter)
      .sort({invoiceDate: -1, createdAt: -1})
      .toArray();

    const company = await col(db, 'companySettings').findOne({tenantId: identity.tenantId});
    const companyName = company?.name || 'iTech Computers';

    const zip = new JSZip();

    // Export manifest with tenant-safe metadata and membership
    const manifest = {
      tenantId: identity.tenantId,
      exportedAt: new Date().toISOString(),
      invoiceCount: invoices.length,
      filters: {customerId, status, dateFrom, dateTo, search: search || undefined},
      invoices: invoices.map(i => {
        const s = i.issuedSnapshot || i;
        return {
          id: i._id,
          invoiceNumber: s.invoiceNumber || i.invoiceNumber || i._id,
          invoiceDate: s.invoiceDate || i.invoiceDate,
          totalPaise: s.totalPaise || i.totalPaise,
          duePaise: i.duePaise,
          paymentStatus: i.paymentStatus,
          customerName: s.customerSnapshot?.name || i.customerSnapshot?.name || 'Customer',
        };
      }),
    };
    zip.file('manifest.json', JSON.stringify(manifest, null, 2));

    for (const inv of invoices) {
      const doc = new jsPDF();
      // Render from frozen issued snapshot if available
      const snap = inv.issuedSnapshot || inv;
      const num = snap.invoiceNumber || inv.invoiceNumber || inv._id;
      const safeNum = String(num).replace(/[^a-zA-Z0-9_-]/g, '_');
      const safeId = inv._id.slice(-6);
      const fileName = `${safeNum}_${safeId}.pdf`;

      doc.setFontSize(16);
      doc.text(companyName, 14, 15);
      doc.setFontSize(12);
      doc.text(`TAX INVOICE: ${num}`, 14, 23);

      doc.setFontSize(10);
      doc.text(`Date: ${snap.invoiceDate || inv.invoiceDate}`, 14, 30);
      doc.text(`Customer: ${snap.customerSnapshot?.name || inv.customerSnapshot?.name || 'Customer'}`, 14, 36);
      const phone = snap.customerSnapshot?.phone || inv.customerSnapshot?.phone;
      if (phone) doc.text(`Phone: ${phone}`, 14, 42);

      const lines = snap.lines || inv.lines || [];
      const tableRows = lines.map((l: any, i: number) => [
        String(i + 1),
        l.description || l.productSnapshot?.name || l.serviceSnapshot?.name || 'Item',
        l.hsn || l.sac || '',
        String(l.quantity),
        ((l.unitRatePaise || 0) / 100).toFixed(2),
        `${((l.taxBasisPoints || 0) / 100).toFixed(0)}%`,
        ((l.totalPaise || 0) / 100).toFixed(2),
      ]);

      autoTable(doc, {
        startY: 48,
        head: [['#', 'Description', 'HSN/SAC', 'Qty', 'Rate', 'Tax', 'Total (INR)']],
        body: tableRows,
        foot: [[
          '',
          'Grand Total',
          '',
          '',
          '',
          '',
          ((snap.totalPaise || inv.totalPaise || 0) / 100).toFixed(2),
        ]],
        styles: {fontSize: 9},
        headStyles: {fillColor: [30, 41, 59]},
        footStyles: {fillColor: [241, 245, 249], textColor: [0, 0, 0], fontStyle: 'bold'},
      });

      const pdfArrayBuffer = doc.output('arraybuffer');
      zip.file(fileName, pdfArrayBuffer);
    }

    const zipBuffer = await zip.generateAsync({type: 'nodebuffer'});

    return new Response(new Uint8Array(zipBuffer), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="invoices-bundle-${Date.now()}.zip"`,
      },
    });
  } catch (err: any) {
    const status = err instanceof AppError ? err.status : 500;
    return Response.json({error: err.message || 'ZIP Export failed.'}, {status});
  }
}
