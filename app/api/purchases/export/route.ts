import {requireIdentity} from '@/server/auth';
import {database, AppError} from '@/server/db';
import {col} from '@/server/purchase-service';
import {MAX_EXPORT_ROWS} from '@/server/purchase-schema';
import ExcelJS from 'exceljs';
import {jsPDF} from 'jspdf';
import autoTable from 'jspdf-autotable';

export const runtime = 'nodejs';

function sanitizeCell(val: unknown): string {
  const str = String(val ?? '');
  if (/^[=+\-@]/.test(str)) {
    return `'${str}`;
  }
  return str;
}

export async function GET(request: Request) {
  try {
    const identity = await requireIdentity();
    const db = await database();
    const url = new URL(request.url);

    const format = (url.searchParams.get('format') || 'csv').toLowerCase();
    if (!['csv', 'xlsx', 'pdf'].includes(format)) throw new AppError(400, 'Export format must be CSV, XLSX, or PDF.');
    const hasDue = url.searchParams.get('hasDue') === 'true';
    const supplierId = url.searchParams.get('supplierId') || undefined;
    const status = url.searchParams.get('status') || undefined;
    const documentStatus = url.searchParams.get('documentStatus') || undefined;
    const billStatus = url.searchParams.get('billStatus') || undefined;
    const receiptStatus = url.searchParams.get('receiptStatus') || undefined;
    const paymentStatus = url.searchParams.get('paymentStatus') || undefined;
    const dateFrom = url.searchParams.get('dateFrom') || undefined;
    const dateTo = url.searchParams.get('dateTo') || undefined;
    const search = (url.searchParams.get('search') || '').trim().slice(0, 200);

    const filter: Record<string, any> = {tenantId: identity.tenantId};
    if (hasDue) {
      filter.billStatus = 'Posted';
      filter.duePaise = {$gt: 0};
    }
    if (supplierId) filter.supplierId = supplierId;
    if (documentStatus) filter.documentStatus = documentStatus;
    if (billStatus) filter.billStatus = billStatus;
    if (receiptStatus) filter.receiptStatus = receiptStatus;
    if (paymentStatus) filter.paymentStatus = paymentStatus;
    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        {purchaseNumber: {$regex: escaped, $options: 'i'}},
        {supplierInvoiceNumber: {$regex: escaped, $options: 'i'}},
        {'supplierSnapshot.name': {$regex: escaped, $options: 'i'}},
      ];
    }

    if (dateFrom || dateTo) {
      filter.orderDate = {};
      if (dateFrom) filter.orderDate.$gte = dateFrom;
      if (dateTo) filter.orderDate.$lte = dateTo;
    }

    if (status) {
      if (status === 'Draft' || status === 'Confirmed' || status === 'Cancelled') {
        filter.documentStatus = status;
      } else if (status === 'Posted') {
        filter.billStatus = 'Posted';
      } else if (status === 'Unpaid' || status === 'PartlyPaid' || status === 'Paid') {
        filter.paymentStatus = status;
      }
    }

    const totalCount = await col(db, 'purchases').countDocuments(filter);
    if (totalCount > MAX_EXPORT_ROWS) {
      return Response.json(
        {
          error: `Query matches ${totalCount} rows, exceeding the ${MAX_EXPORT_ROWS} row export limit. Please refine date or filter.`,
        },
        {status: 400}
      );
    }

    const [records, company] = await Promise.all([
      col(db, 'purchases').find(filter).sort({createdAt: -1}).toArray(),
      col(db, 'companySettings').findOne({tenantId: identity.tenantId}),
    ]);

    const companyName = company?.name || 'iTech Computers';
    const filterDesc = `Applied filters: ${hasDue ? 'Has Due, ' : ''}${status ? `Status: ${status}, ` : ''}${dateFrom ? `From: ${dateFrom}, ` : ''}${dateTo ? `To: ${dateTo}` : 'All records'}`;

    const headers = [
      'Purchase Number',
      'Supplier',
      'Order Date',
      'Bill Status',
      'Receipt Status',
      'Payment Status',
      'Supplier Invoice No',
      'Total (INR)',
      'Paid (INR)',
      'Credited (INR)',
      'Due (INR)',
    ];

    const dataRows = records.map(p => [
      sanitizeCell(p.purchaseNumber),
      sanitizeCell(p.supplierSnapshot?.name || ''),
      sanitizeCell(p.orderDate),
      sanitizeCell(p.billStatus),
      sanitizeCell(p.receiptStatus),
      sanitizeCell(p.paymentStatus),
      sanitizeCell(p.supplierInvoiceNumber || ''),
      (p.totalPaise / 100).toFixed(2),
      (p.allocatedPaidPaise / 100).toFixed(2),
      (p.creditedLiabilityPaise / 100).toFixed(2),
      (p.duePaise / 100).toFixed(2),
    ]);

    const totalValuePaise = records.reduce((sum, p) => sum + (p.totalPaise || 0), 0);
    const totalDuePaise = records.reduce((sum, p) => sum + (p.duePaise || 0), 0);

    if (format === 'xlsx') {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = companyName;
      const sheet = workbook.addWorksheet('Purchases');

      sheet.addRow([companyName]);
      sheet.addRow([filterDesc]);
      sheet.addRow(headers);

      dataRows.forEach(r => sheet.addRow(r));

      // Add summary row
      sheet.addRow([]);
      sheet.addRow([
        'Total',
        '',
        '',
        '',
        '',
        '',
        '',
        (totalValuePaise / 100).toFixed(2),
        '',
        '',
        (totalDuePaise / 100).toFixed(2),
      ]);

      const buffer = await workbook.xlsx.writeBuffer();
      return new Response(new Uint8Array(buffer), {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="purchases-${Date.now()}.xlsx"`,
          'Cache-Control': 'no-store',
        },
      });
    }

    if (format === 'pdf') {
      const doc = new jsPDF({orientation: 'landscape'});
      const width = doc.internal.pageSize.getWidth();

      doc.setFontSize(16);
      doc.text(companyName, 14, 15);
      doc.setFontSize(10);
      doc.text(`Purchases Report — ${filterDesc}`, 14, 22);

      autoTable(doc, {
        startY: 28,
        head: [headers],
        body: dataRows,
        styles: {fontSize: 8, cellPadding: 2},
        headStyles: {fillColor: [79, 70, 229]},
      });

      const finalY = (doc as any).lastAutoTable?.finalY || 100;
      doc.setFontSize(10);
      doc.text(
        `Total Amount: INR ${(totalValuePaise / 100).toFixed(2)} | Total Due: INR ${(totalDuePaise / 100).toFixed(2)}`,
        14,
        finalY + 8
      );

      const pdfBytes = doc.output('arraybuffer');
      return new Response(new Uint8Array(pdfBytes), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="purchases-${Date.now()}.pdf"`,
          'Cache-Control': 'no-store',
        },
      });
    }

    // Default CSV
    const csvRows = dataRows.map(row =>
      row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
    );
    const csvContent = [headers.join(','), ...csvRows].join('\n');

    return new Response(csvContent, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="purchases-${Date.now()}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err: any) {
    return Response.json({error: err?.message || 'Export failed.'}, {status: err?.status || 500});
  }
}
