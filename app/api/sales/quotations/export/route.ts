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
        {quotationNumber: {$regex: escaped, $options: 'i'}},
        {'customerSnapshot.name': {$regex: escaped, $options: 'i'}},
      ];
    }

    if (dateFrom || dateTo) {
      filter.quotationDate = {};
      if (dateFrom) filter.quotationDate.$gte = dateFrom;
      if (dateTo) filter.quotationDate.$lte = dateTo;
    }

    const totalCount = await col(db, 'quotations').countDocuments(filter);
    if (totalCount > MAX_EXPORT_ROWS) {
      return Response.json(
        {
          error: `Query matches ${totalCount} rows, exceeding the ${MAX_EXPORT_ROWS} row export limit. Please refine date or filter.`,
        },
        {status: 400}
      );
    }

    const [records, company] = await Promise.all([
      col(db, 'quotations').find(filter).sort({createdAt: -1}).toArray(),
      col(db, 'companySettings').findOne({tenantId: identity.tenantId}),
    ]);

    const companyName = company?.name || 'iTech Computers';
    const filterDesc = `Applied filters: ${status ? `Status: ${status}, ` : ''}${dateFrom ? `From: ${dateFrom}, ` : ''}${dateTo ? `To: ${dateTo}` : 'All records'}`;

    const headers = [
      'Quotation Number',
      'Customer',
      'Date',
      'Valid Until',
      'Status',
      'Total (INR)',
    ];

    const dataRows = records.map(q => [
      sanitizeCell(q.quotationNumber || q._id),
      sanitizeCell(q.customerSnapshot?.name || ''),
      sanitizeCell(q.quotationDate),
      sanitizeCell(q.validUntil || ''),
      sanitizeCell(q.status),
      ((q.totalPaise || 0) / 100).toFixed(2),
    ]);

    const totalValuePaise = records.reduce((sum, p) => sum + (p.totalPaise || 0), 0);

    if (format === 'xlsx') {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = companyName;
      const sheet = workbook.addWorksheet('Quotations');

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
        (totalValuePaise / 100).toFixed(2),
      ]);

      const buffer = await workbook.xlsx.writeBuffer();
      return new Response(buffer, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="quotations-export-${Date.now()}.xlsx"`,
        },
      });
    }

    if (format === 'pdf') {
      const doc = new jsPDF({orientation: 'landscape'});
      doc.setFontSize(16);
      doc.text(companyName, 14, 15);
      doc.setFontSize(10);
      doc.text(`Quotations Export · ${filterDesc}`, 14, 22);

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
          (totalValuePaise / 100).toFixed(2),
        ]],
        styles: {fontSize: 8},
        headStyles: {fillColor: [30, 41, 59]},
        footStyles: {fillColor: [241, 245, 249], textColor: [0, 0, 0], fontStyle: 'bold'},
      });

      const pdfBytes = doc.output('arraybuffer');
      return new Response(pdfBytes, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="quotations-export-${Date.now()}.pdf"`,
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
        'Content-Disposition': `attachment; filename="quotations-export-${Date.now()}.csv"`,
      },
    });
  } catch (err: any) {
    const status = err instanceof AppError ? err.status : 500;
    return Response.json({error: err.message || 'Export failed.'}, {status});
  }
}
