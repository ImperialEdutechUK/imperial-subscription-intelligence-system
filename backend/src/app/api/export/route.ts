/**
 * Exports.
 *
 * Four shapes of the same portfolio, each aimed at a different reader:
 *
 *   csv      — the whole register, one row per subscription, for anyone who
 *              wants to open it in a spreadsheet and sort it themselves.
 *   xlsx     — the same rows, formatted so they are readable without work.
 *   finance  — a three-sheet workbook that answers Finance's questions:
 *              what do we spend, which department carries it, and how was
 *              each split arrived at.
 *   template — an empty import sheet with the exact column names this
 *              application reads back in.
 *
 * Stored passwords are never exported in any format. The register records
 * only whether a password is held, which is what an audit needs to know.
 */

import ExcelJS from 'exceljs';
import { sessionFromRequest } from '@/lib/auth';
import { getPortfolio, type Portfolio, type SubscriptionView } from '@/services/portfolio';
import { ALLOCATION_METHOD_META, STATUS_META, type AllocationMethod, type SubStatus } from '@/lib/domain';
import { IMPORT_FIELDS, IMPORT_FIELD_META, type ImportField } from '@/lib/import-parse';
import { round2 } from '@/lib/money';

const MONEY_FORMAT = '£#,##0.00';
const DATE_FORMAT = 'dd/mm/yyyy';

const isoDate = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : '');
const today = () => new Date().toISOString().slice(0, 10);

const statusLabel = (key: string) => STATUS_META[key as SubStatus]?.label ?? key;
const allocationLabel = (key: string) => ALLOCATION_METHOD_META[key as AllocationMethod]?.label ?? key;

/** "CD:60.0%; MKT:40.0%" — the split as exported, auditable at a glance. */
const departmentSplit = (s: SubscriptionView) =>
  s.allocations.map((a) => `${a.departmentCode}:${(a.share * 100).toFixed(1)}%`).join('; ');

// ─────────────────────────────────────────────────────────── Register rows ──

const REGISTER_COLUMNS = [
  { header: 'Name', width: 32, type: 'text' },
  { header: 'Vendor', width: 20, type: 'text' },
  { header: 'URL', width: 30, type: 'text' },
  { header: 'Category', width: 22, type: 'text' },
  { header: 'Status', width: 12, type: 'text' },
  { header: 'Billing model', width: 15, type: 'text' },
  { header: 'Currency', width: 10, type: 'text' },
  { header: 'Amount per charge', width: 17, type: 'number' },
  { header: 'Seats', width: 8, type: 'number' },
  { header: 'Per seat', width: 10, type: 'text' },
  { header: 'Monthly (GBP)', width: 15, type: 'money' },
  { header: 'Annual (GBP)', width: 15, type: 'money' },
  { header: 'Cost confidence', width: 16, type: 'text' },
  { header: 'Next charge date', width: 17, type: 'date' },
  { header: 'Auto renew', width: 12, type: 'text' },
  { header: 'Allocation method', width: 18, type: 'text' },
  { header: 'Departments', width: 26, type: 'text' },
  { header: 'Owner department', width: 22, type: 'text' },
  { header: 'Owner name', width: 20, type: 'text' },
  { header: 'Account email', width: 30, type: 'text' },
  { header: 'Password stored', width: 15, type: 'text' },
  { header: 'Credential location', width: 24, type: 'text' },
  { header: 'Card label', width: 20, type: 'text' },
  { header: 'Card last 4', width: 12, type: 'text' },
  { header: 'Tags', width: 24, type: 'text' },
  { header: 'Notes', width: 40, type: 'text' },
] as const;

type Cell = string | number | Date | null;

function registerRow(s: SubscriptionView): Cell[] {
  return [
    s.name,
    s.vendor ?? '',
    s.url ?? '',
    s.categoryLabel,
    statusLabel(s.status),
    s.billingLabel,
    s.currency,
    s.cost.amountPerCharge,
    s.seats,
    s.perSeat ? 'Yes' : 'No',
    s.monthlyGbp,
    s.annualGbp,
    s.cost.confidence === 'ESTIMATED' ? 'Estimated' : s.cost.confidence === 'CONTRACTED' ? 'Contracted' : 'None',
    s.nextCharge ?? null,
    s.autoRenew ? 'Yes' : 'No',
    allocationLabel(s.allocationMethod),
    departmentSplit(s),
    s.ownerDepartmentName ?? '',
    s.ownerName ?? '',
    s.accountEmail ?? '',
    s.hasPassword ? 'Yes' : 'No',
    s.credentialLocation ?? '',
    s.cardLabel ?? '',
    s.cardLast4 ?? '',
    s.tags.join(', '),
    s.notes ?? '',
  ];
}

// ─────────────────────────────────────────────────────────────────── CSV ──

function csvCell(value: Cell): string {
  if (value == null) return '';
  const text = value instanceof Date ? isoDate(value) : String(value);
  return /[",\r\n]/.test(text) || text !== text.trim() ? `"${text.replace(/"/g, '""')}"` : text;
}

const csvBody = (rows: Cell[][]) => rows.map((r) => r.map(csvCell).join(',')).join('\r\n');

/** A byte-order mark, so Excel opens the file as UTF-8 rather than guessing. */
function csvResponse(body: string, filename: string) {
  return new Response(`\uFEFF${body}\r\n`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}

async function xlsxResponse(workbook: ExcelJS.Workbook, filename: string) {
  const buffer = await workbook.xlsx.writeBuffer();
  return new Response(buffer as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}

// ───────────────────────────────────────────────────────── Excel helpers ──

function newWorkbook() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Imperial Edutech — Subscription Intelligence';
  workbook.created = new Date();
  return workbook;
}

/** Bold header row on a tinted fill, frozen and filterable. */
function styleHeader(sheet: ExcelJS.Worksheet, columnCount: number) {
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: 'FF1F1F1F' } };
  header.alignment = { vertical: 'middle' };
  header.height = 20;
  header.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2E9E8' } };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFD9D9D9' } } };
  });
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columnCount } };
}

function applyFormats(sheet: ExcelJS.Worksheet, formats: (string | null)[]) {
  formats.forEach((format, i) => {
    if (format) sheet.getColumn(i + 1).numFmt = format;
  });
}

// ─────────────────────────────────────────────────────── Finance workbook ──

function financeWorkbook(p: Portfolio) {
  const workbook = newWorkbook();
  const live = p.subscriptions.filter((s) => s.status !== 'CANCELLED');

  // ── Summary ───────────────────────────────────────────────────────────
  const summary = workbook.addWorksheet('Summary');
  summary.columns = [
    { header: 'Measure', width: 34 },
    { header: 'Value', width: 20 },
    { header: 'What it means', width: 78 },
  ];
  const summaryRows: [string, string | number, string][] = [
    ['Total monthly cost', p.totals.monthlyGbp, 'Every live subscription normalised to a monthly figure in GBP.'],
    ['Annual run-rate', p.totals.annualRunRateGbp, 'The monthly figure multiplied by twelve. Recurring commitment only; one-off purchases are excluded.'],
    ['12-month cash', p.totals.annualCashGbp, 'Money expected to leave the account over the next twelve months, including one-off purchases.'],
    ['Subscriptions counted', p.totals.count, 'Records in the register. Cancelled subscriptions are kept for history but contribute no cost.'],
    ['Of which active', p.totals.activeCount, 'Subscriptions with a status of Active. Trials, paused and pending records are counted separately.'],
    ['Estimated share of spend', `${p.totals.estimatedShare.toFixed(1)}%`, 'The proportion of the monthly figure that is an estimate rather than a contracted price.'],
    ['Estimated monthly cost', p.totals.estimatedMonthlyGbp, 'The part of the monthly figure that rests on an estimate.'],
    ['Contracted monthly cost', p.totals.contractedMonthlyGbp, 'The part of the monthly figure taken from a known contracted price.'],
    ['Shared subscriptions', p.totals.sharedCount, 'Subscriptions whose cost is split across more than one department.'],
    ['Generated at', new Date().toLocaleString('en-GB'), 'This workbook is a snapshot. Figures move as the register is edited.'],
  ];
  summaryRows.forEach((r) => summary.addRow(r));
  summary.addRow([]);
  summary.addRow([
    'Note on estimates',
    '',
    'Estimated figures come from subscriptions billed on usage and from credit top-up accounts. Neither has a fixed price, so the monthly cost is worked out from recorded usage and top-ups where those exist, and from the stated forecast where they do not. Treat those lines as indicative rather than committed.',
  ]);
  const noteRow = summary.lastRow;
  if (noteRow) {
    noteRow.font = { italic: true };
    noteRow.alignment = { wrapText: true, vertical: 'top' };
    noteRow.height = 46;
  }
  summary.getColumn(2).numFmt = MONEY_FORMAT;
  summary.getColumn(3).alignment = { wrapText: true, vertical: 'top' };
  styleHeader(summary, 3);

  // ── By department ─────────────────────────────────────────────────────
  const byDept = workbook.addWorksheet('By department');
  byDept.columns = [
    { header: 'Department', width: 26 },
    { header: 'Code', width: 10 },
    { header: 'Cost centre', width: 16 },
    { header: 'Monthly (GBP)', width: 16 },
    { header: 'Annual (GBP)', width: 16 },
    { header: 'Subscriptions', width: 14 },
    { header: 'Of which shared', width: 16 },
    { header: 'Cost per head, monthly (GBP)', width: 28 },
  ];
  p.byDepartment.forEach((d) => {
    byDept.addRow([
      d.name,
      d.code,
      p.departmentIndex.get(d.id)?.costCentre ?? '',
      d.monthlyGbp,
      d.annualGbp,
      d.subscriptionCount,
      d.sharedCount,
      d.perHeadMonthly ?? '',
    ]);
  });
  byDept.addRow([
    'Total',
    '',
    '',
    round2(p.byDepartment.reduce((a, d) => a + d.monthlyGbp, 0)),
    round2(p.byDepartment.reduce((a, d) => a + d.annualGbp, 0)),
    '',
    '',
    '',
  ]);
  const deptTotal = byDept.lastRow;
  if (deptTotal) deptTotal.font = { bold: true };
  applyFormats(byDept, [null, null, null, MONEY_FORMAT, MONEY_FORMAT, null, null, MONEY_FORMAT]);
  styleHeader(byDept, 8);

  // ── By subscription ───────────────────────────────────────────────────
  // One column per department, so a reader can see exactly how each monthly
  // figure was divided rather than having to take the split on trust.
  const bySub = workbook.addWorksheet('By subscription');
  const deptColumns = p.byDepartment.map((d) => ({ id: d.id, name: d.name, code: d.code }));
  bySub.columns = [
    { header: 'Subscription', width: 32 },
    { header: 'Category', width: 22 },
    { header: 'Monthly (GBP)', width: 15 },
    { header: 'Annual (GBP)', width: 15 },
    ...deptColumns.map((d) => ({ header: `${d.code} monthly (GBP)`, width: 18 })),
  ];
  live.forEach((s) => {
    const byId = new Map(s.allocations.map((a) => [a.departmentId, a.monthlyGbp]));
    bySub.addRow([s.name, s.categoryLabel, s.monthlyGbp, s.annualGbp, ...deptColumns.map((d) => byId.get(d.id) ?? 0)]);
  });
  bySub.addRow([
    'Total',
    '',
    round2(live.reduce((a, s) => a + s.monthlyGbp, 0)),
    round2(live.reduce((a, s) => a + s.annualGbp, 0)),
    ...deptColumns.map((d) => round2(live.reduce((a, s) => a + (s.allocations.find((x) => x.departmentId === d.id)?.monthlyGbp ?? 0), 0))),
  ]);
  const subTotal = bySub.lastRow;
  if (subTotal) subTotal.font = { bold: true };
  applyFormats(bySub, [null, null, MONEY_FORMAT, MONEY_FORMAT, ...deptColumns.map(() => MONEY_FORMAT)]);
  styleHeader(bySub, 4 + deptColumns.length);

  return workbook;
}

// ──────────────────────────────────────────────────────────────── Handler ──

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const user = await sessionFromRequest(request);
  if (!user) {
    return Response.json({ error: 'You need to be signed in to export the register.' }, { status: 401 });
  }

  const format = new URL(request.url).searchParams.get('format') ?? 'csv';
  const stamp = today();

  // The template needs no data, so it is answered before the portfolio loads.
  if (format === 'template') {
    // The second example uses a different currency, a per-charge amount with a
    // symbol and a suffix, and a written-out date, to show what the importer
    // will accept without complaint.
    const secondExample: Record<ImportField, string> = {
      name: 'Envato Elements',
      vendor: 'Envato',
      url: 'https://elements.envato.com',
      category: 'Stock media',
      status: 'Active',
      billingModel: 'Monthly',
      currency: 'USD',
      unitAmount: '$33.00/mo',
      seats: '3',
      perSeat: 'No',
      renewalDate: '01 Apr 2026',
      ownerDepartmentCode: 'MKT',
      allocationMethod: 'Owner pays',
      accountEmail: 'studio@imperiallearning.co.uk',
      username: '',
      password: '',
      cardLast4: '9021',
      tags: 'media',
      notes: '',
    };

    const exampleRow = (source: Record<ImportField, string>): Cell[] =>
      IMPORT_FIELDS.map((f) =>
        f === 'name'
          ? `EXAMPLE — ${source[f]}`
          : f === 'notes'
            ? 'Example row — delete this row before importing.'
            : source[f],
      );

    const firstExample = Object.fromEntries(IMPORT_FIELDS.map((f) => [f, IMPORT_FIELD_META[f].example])) as Record<ImportField, string>;
    const rows: Cell[][] = [IMPORT_FIELDS.map((f) => IMPORT_FIELD_META[f].label), exampleRow(firstExample), exampleRow(secondExample)];
    return csvResponse(csvBody(rows), `imperial-subscription-import-template-${stamp}.csv`);
  }

  if (format !== 'csv' && format !== 'xlsx' && format !== 'finance') {
    return Response.json(
      { error: `"${format}" is not a format this endpoint produces.`, supported: ['csv', 'xlsx', 'finance', 'template'] },
      { status: 400 },
    );
  }

  const portfolio = await getPortfolio();

  if (format === 'csv') {
    const rows: Cell[][] = [REGISTER_COLUMNS.map((c) => c.header), ...portfolio.subscriptions.map(registerRow)];
    return csvResponse(csvBody(rows), `imperial-subscription-register-no-passwords-${stamp}.csv`);
  }

  if (format === 'xlsx') {
    const workbook = newWorkbook();
    const sheet = workbook.addWorksheet('Subscriptions');
    sheet.columns = REGISTER_COLUMNS.map((c) => ({ header: c.header, width: c.width }));
    portfolio.subscriptions.forEach((s) => sheet.addRow(registerRow(s)));
    applyFormats(
      sheet,
      REGISTER_COLUMNS.map((c) => (c.type === 'money' ? MONEY_FORMAT : c.type === 'date' ? DATE_FORMAT : c.type === 'number' ? '#,##0.00' : null)),
    );
    styleHeader(sheet, REGISTER_COLUMNS.length);
    return xlsxResponse(workbook, `imperial-subscription-register-no-passwords-${stamp}.xlsx`);
  }

  return xlsxResponse(financeWorkbook(portfolio), `imperial-subscription-finance-pack-${stamp}.xlsx`);
}
