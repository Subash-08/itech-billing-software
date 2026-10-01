import {requireIdentity} from '@/server/auth';
import {database, AppError} from '@/server/db';
import {col} from '@/server/purchase-service';
import {MAX_EXPORT_ROWS} from '@/server/purchase-schema';
import ExcelJS from 'exceljs';
import {jsPDF} from 'jspdf';
import autoTable from 'jspdf-autotable';
import {buildSalesFilter} from '@/server/sales-service';

export const runtime = 'nodejs';

function sanitizeCell(val: unknown): string {
  const str = String(val ?? '');
  if (/^[=+@]/.test(str) || (/^-/.test(str) && !/^-\d+(\.\d+)?$/.test(str.trim()))) {
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
    const raw = Object.fromEntries(url.searchParams);
    const {filter} = buildSalesFilter(identity, raw, 'invoices');
    if (!url.searchParams.has('status') && url.searchParams.get('hasDue') !== 'true') {
      filter.status = {$in: ['Issued', 'Cancelled']};
    }

    const totalCount = await col(db, 'invoices').countDocuments(filter);
    if (totalCount > MAX_EXPORT_ROWS) {
      return Response.json(
        {
          error: `Query matches ${totalCount} rows, exceeding the ${MAX_EXPORT_ROWS} row export limit. Please refine date or filter.`,
        },
        {status: 400}
      );
    }

    const [records, company] = await Promise.all([
      col(db, 'invoices').find(filter).sort({createdAt: -1}).toArray(),
      col(db, 'companySettings').findOne({tenantId: identity.tenantId}),
    ]);

    const companyName = company?.name || 'iTech Computers';
    const filterDesc = `Applied filters: ${url.searchParams.toString() || 'Issued and cancelled invoices'}`;

    const headers = [
      'Invoice Number',
      'Customer',
      'Date',
      'Due Date',
      'Status',
      'Payment Status',
      'Total (INR)',
      'Paid (INR)',
      'Due (INR)',
    ];

    const dataRows = records.map(inv => [
      sanitizeCell(inv.invoiceNumber || inv._id),
      sanitizeCell(inv.customerSnapshot?.name || ''),
      sanitizeCell(inv.invoiceDate),
      sanitizeCell(inv.dueDate || ''),
      sanitizeCell(inv.status),
      sanitizeCell(inv.paymentStatus),
      ((inv.totalPaise || 0) / 100).toFixed(2),
      ((inv.allocatedPaidPaise || 0) / 100).toFixed(2),
      ((inv.duePaise || 0) / 100).toFixed(2),
    ]);

    const totalValuePaise = records.reduce((sum, p) => sum + (p.totalPaise || 0), 0);
    const totalDuePaise = records.reduce((sum, p) => sum + (p.duePaise || 0), 0);

    if (format === 'xlsx') {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = companyName;
      const sheet = workbook.addWorksheet('Sales Invoices');

      sheet.addRow([companyName]);
      sheet.addRow([filterDesc]);
      sheet.addRow(headers);

      dataRows.forEach(r => sheet.addRow(r));

      sheet.addRow([]);
      sheet.addRow([
        'Total',
        '',
        '',
        '',
        '',
        '',
        (totalValuePaise / 100).toFixed(2),
        '',
        (totalDuePaise / 100).toFixed(2),
      ]);

      const buffer = await workbook.xlsx.writeBuffer();
      return new Response(buffer, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="invoices-export-${Date.now()}.xlsx"`,
        },
      });
    }

    if (format === 'pdf') {
      const doc = new jsPDF({orientation: 'landscape'});
      doc.setFontSize(16);
      doc.text(companyName, 14, 15);
      doc.setFontSize(10);
      doc.text(`Sales Invoices Export · ${filterDesc}`, 14, 22);

      autoTable(doc, {
        startY: 28,
        head: [headers],
        body: dataRows,
        foot: [[
          'Total',
          '',
          '',
          '',
          '',
          '',
          (totalValuePaise / 100).toFixed(2),
          '',
          (totalDuePaise / 100).toFixed(2),
        ]],
        styles: {fontSize: 8},
        headStyles: {fillColor: [30, 41, 59]},
        footStyles: {fillColor: [241, 245, 249], textColor: [0, 0, 0], fontStyle: 'bold'},
      });

      const pdfBytes = doc.output('arraybuffer');
      return new Response(pdfBytes, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="invoices-export-${Date.now()}.pdf"`,
        },
      });
    }

    // Default: CSV
    const csvContent = [
      headers.map(h => `"${h}"`).join(','),
      ...dataRows.map(row => row.map(c => `"${c}"`).join(',')),
    ].join('\n');

    return new Response(csvContent, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="invoices-export-${Date.now()}.csv"`,
      },
    });
  } catch (err: any) {
    const status = err instanceof AppError ? err.status : 500;
    return Response.json({error: err.message || 'Export failed.'}, {status});
  }
}
