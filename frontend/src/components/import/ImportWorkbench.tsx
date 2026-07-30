'use client';

/**
 * Import and export.
 *
 * The brief from the client was specific: entering data here has to be less
 * work than the spreadsheet it replaces. So the first tab accepts a block
 * copied straight out of Excel, works out what the columns are, and says
 * plainly what it could and could not read before anything is written.
 *
 * Both input tabs feed one pipeline — parse, map, validate, import — so a
 * pasted block and an uploaded file behave identically once they are a grid.
 */

import { useCallback, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Papa from 'papaparse';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ClipboardPaste,
  Download,
  FileDown,
  FileSpreadsheet,
  Lock,
  Table2,
  Upload,
  X,
  type LucideIcon,
} from 'lucide-react';
import { Badge, EmptyState, type Tone } from '@/components/ui/kit';
import { Button, Field, Segmented, Select, Textarea, Toggle, LinkButton } from '@/components/ui/controls';
import { bulkImport } from '@/server/actions';
import {
  DELIMITER_LABEL,
  IMPORT_FIELDS,
  IMPORT_FIELD_META,
  gridToTable,
  guessMapping,
  parseDelimitedText,
  prepareRows,
  type Delimiter,
  type ImportField,
  type PreparedTable,
} from '@/lib/import-parse';

type Tab = 'paste' | 'file' | 'export';

interface Ingested {
  /** Where the rows came from, shown back to the reader. */
  label: string;
  delimiterLabel: string;
  /** Every row as read, header included if there is one. */
  grid: string[][];
}

type ImportOutcome =
  | { ok: true; created: number; updated: number; errors: { row: number; message: string }[]; rowNumbers: number[]; names: string[] }
  | { ok: false; error: string };

const PREVIEW_ROWS = 8;
const MAX_LISTED_ISSUES = 25;

const PLACEHOLDER = [
  'Software\tCost\tRenews\tDept\tBilling',
  'Adobe Creative Cloud\t£1,234.00\t12/03/2026\tCD\tYearly',
  'ChatGPT Team\t£25.00/mo\t01/09/2026\tAI\tMonthly',
].join('\n');

// ─────────────────────────────────────────────────────────────── Layout ──

function Panel({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      className="rounded-[var(--radius-lg)] border"
      style={{ background: 'var(--surface-raised)', borderColor: 'var(--border-subtle)' }}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 px-4 pt-4 pb-2">
        <div className="min-w-0">
          <h3 className="text-[0.8125rem] font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
            {title}
          </h3>
          {description ? (
            <p className="mt-0.5 max-w-3xl text-xs leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>
              {description}
            </p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </header>
      <div className="px-4 pt-1 pb-4">{children}</div>
    </section>
  );
}

// ────────────────────────────────────────────────────── Column mapping ──

function MappingPanel({
  headers,
  rows,
  mapping,
  onChange,
  onReguess,
  hasHeader,
  onHasHeaderChange,
  source,
}: {
  headers: string[];
  rows: string[][];
  mapping: (ImportField | null)[];
  onChange: (index: number, field: ImportField | null) => void;
  onReguess: () => void;
  hasHeader: boolean;
  onHasHeaderChange: (v: boolean) => void;
  source: Ingested;
}) {
  const taken = new Map<ImportField, number>();
  mapping.forEach((f, i) => {
    if (f && !taken.has(f)) taken.set(f, i);
  });

  const sampleFor = (index: number) => rows.find((r) => (r[index] ?? '').trim() !== '')?.[index] ?? '';

  return (
    <Panel
      title="What is in each column"
      description={`${source.label} — read as ${source.delimiterLabel}-separated text, ${headers.length} column${headers.length === 1 ? '' : 's'} and ${rows.length} data row${rows.length === 1 ? '' : 's'}. Column headings have been matched to fields automatically. Check them and correct anything that is wrong.`}
      action={
        <Button size="xs" onClick={onReguess}>
          Match again
        </Button>
      }
    >
      <div className="mb-3">
        <Toggle
          checked={hasHeader}
          onChange={onHasHeaderChange}
          label="The first row names the columns"
          description={
            hasHeader
              ? 'Turn this off if the first row is data rather than headings — it is currently being used as headings and not imported.'
              : 'Turn this on if the first row names the columns. It is currently being imported as data.'
          }
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {headers.map((header, i) => {
          const sample = sampleFor(i);
          return (
            <Field
              key={`${header}-${i}`}
              label={<span className="truncate">{header}</span>}
              hint={sample ? `First value: ${sample.length > 40 ? `${sample.slice(0, 39)}…` : sample}` : 'This column is empty.'}
            >
              <Select
                value={mapping[i] ?? ''}
                onChange={(e) => onChange(i, (e.target.value || null) as ImportField | null)}
                aria-label={`What the column "${header}" contains`}
              >
                <option value="">Ignore this column</option>
                {IMPORT_FIELDS.map((f) => {
                  const owner = taken.get(f);
                  const claimed = owner != null && owner !== i;
                  return (
                    <option key={f} value={f} disabled={claimed}>
                      {IMPORT_FIELD_META[f].label}
                      {claimed ? ` — already taken by "${headers[owner]}"` : ''}
                    </option>
                  );
                })}
              </Select>
            </Field>
          );
        })}
      </div>
    </Panel>
  );
}

// ───────────────────────────────────────────────────────────── Preview ──

function PreviewTable({
  headers,
  rows,
  mapping,
  prepared,
}: {
  headers: string[];
  rows: string[][];
  mapping: (ImportField | null)[];
  prepared: PreparedTable;
}) {
  const issueAt = new Map<string, { message: string; blocking: boolean }>();
  prepared.rows.forEach((r) =>
    r.issues.forEach((issue) => {
      if (issue.columnIndex < 0) return;
      const key = `${issue.row}:${issue.columnIndex}`;
      if (!issueAt.has(key)) issueAt.set(key, { message: issue.message, blocking: issue.severity === 'BLOCKING' });
    }),
  );

  const shown = rows.slice(0, PREVIEW_ROWS);

  return (
    <div className="overflow-x-auto">
      <table className="w-full" style={{ fontSize: 'var(--density-font)' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <th className="px-2 py-2 text-left text-[0.6875rem] font-medium" style={{ color: 'var(--text-tertiary)' }}>
              Row
            </th>
            {headers.map((header, i) => (
              <th key={`${header}-${i}`} className="px-2 py-2 text-left">
                <span className="block truncate text-[0.6875rem] font-medium" style={{ color: 'var(--text-tertiary)' }}>
                  {header}
                </span>
                <span
                  className="block truncate text-[0.6875rem]"
                  style={{ color: mapping[i] ? 'var(--text-primary)' : 'var(--text-tertiary)' }}
                >
                  {mapping[i] ? IMPORT_FIELD_META[mapping[i]!].label : 'Ignored'}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((cells, r) => {
            const rowNumber = r + 1;
            const skipped = prepared.rows[r]?.skipped;
            return (
              <tr key={rowNumber} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <td className="tabular px-2 py-1.5 text-[0.6875rem]" style={{ color: skipped ? 'var(--danger)' : 'var(--text-tertiary)' }}>
                  {rowNumber}
                </td>
                {headers.map((header, c) => {
                  const issue = issueAt.get(`${rowNumber}:${c}`);
                  const ignored = !mapping[c];
                  return (
                    <td
                      key={`${header}-${c}`}
                      className="max-w-[220px] truncate px-2 py-1.5 text-[0.75rem]"
                      title={issue ? issue.message : undefined}
                      style={{
                        background: issue ? (issue.blocking ? 'var(--danger-bg)' : 'var(--warning-bg)') : undefined,
                        color: issue
                          ? issue.blocking
                            ? 'var(--danger)'
                            : 'var(--warning)'
                          : ignored
                            ? 'var(--text-tertiary)'
                            : 'var(--text-primary)',
                      }}
                    >
                      {cells[c] || '—'}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length > shown.length ? (
        <p className="px-2 pt-2 text-[0.6875rem]" style={{ color: 'var(--text-tertiary)' }}>
          Showing the first {shown.length} of {rows.length} rows. Every row is checked, not only the ones shown.
        </p>
      ) : null}
    </div>
  );
}

// ──────────────────────────────────────────────────────────── Validation ──

function ValidationPanel({ prepared, headers }: { prepared: PreparedTable; headers: string[] }) {
  const issues = prepared.rows.flatMap((r) => r.issues);
  const listed = issues.slice(0, MAX_LISTED_ISSUES);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="positive">
          {prepared.counts.ready} row{prepared.counts.ready === 1 ? '' : 's'} with nothing to check
        </Badge>
        {prepared.counts.warnings > 0 ? (
          <Badge tone="warning">
            {prepared.counts.warnings} row{prepared.counts.warnings === 1 ? '' : 's'} that will import with something changed
          </Badge>
        ) : null}
        {prepared.counts.skipped > 0 ? (
          <Badge tone="danger">
            {prepared.counts.skipped} row{prepared.counts.skipped === 1 ? '' : 's'} that cannot be imported
          </Badge>
        ) : null}
      </div>

      {prepared.mappingIssues.map((m) => (
        <p key={m} className="rounded-[var(--radius-sm)] p-2.5 text-xs leading-relaxed" style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}>
          {m}
        </p>
      ))}

      {issues.length === 0 ? (
        <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          Every value was read without ambiguity. Nothing has been changed or guessed.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {listed.map((issue, i) => (
            <li key={`${issue.row}-${issue.columnIndex}-${i}`} className="flex items-start gap-2 text-xs leading-relaxed">
              <AlertTriangle
                size={13}
                className="mt-0.5 shrink-0"
                style={{ color: issue.severity === 'BLOCKING' ? 'var(--danger)' : 'var(--warning)' }}
                aria-hidden
              />
              <span style={{ color: 'var(--text-secondary)' }}>
                <strong style={{ color: 'var(--text-primary)' }}>
                  Row {issue.row}, column “{headers[issue.columnIndex] ?? issue.column}”
                </strong>{' '}
                — {issue.message}
              </span>
            </li>
          ))}
          {issues.length > listed.length ? (
            <li className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              And {issues.length - listed.length} more of the same kind.
            </li>
          ) : null}
        </ul>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────── Result ──

function ResultPanel({ outcome, onDismiss }: { outcome: ImportOutcome; onDismiss: () => void }) {
  if (!outcome.ok) {
    return (
      <Panel title="The import did not run">
        <p className="text-xs leading-relaxed" style={{ color: 'var(--danger)' }}>
          {outcome.error}
        </p>
      </Panel>
    );
  }

  const total = outcome.created + outcome.updated;
  const tone: Tone = outcome.errors.length > 0 ? 'warning' : 'positive';

  return (
    <Panel
      title="What was imported"
      action={
        <Button size="xs" variant="ghost" icon={X} onClick={onDismiss}>
          Dismiss
        </Button>
      }
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={tone}>
            {total} row{total === 1 ? '' : 's'} written
          </Badge>
          <Badge tone="neutral" showIcon={false}>
            {outcome.created} added
          </Badge>
          <Badge tone="neutral" showIcon={false}>
            {outcome.updated} updated in place
          </Badge>
          {outcome.errors.length > 0 ? (
            <Badge tone="danger">
              {outcome.errors.length} failed
            </Badge>
          ) : null}
        </div>

        <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          Rows are matched on name. Where a subscription of the same name already existed it was updated rather than
          duplicated, which makes re-importing a corrected sheet safe. The register and every dashboard now reflect this.
        </p>

        {outcome.errors.length > 0 ? (
          <ul className="space-y-1.5">
            {outcome.errors.map((e) => {
              const sourceRow = outcome.rowNumbers[e.row - 1];
              const name = outcome.names[e.row - 1];
              return (
                <li key={`${e.row}-${e.message}`} className="flex items-start gap-2 text-xs leading-relaxed">
                  <AlertTriangle size={13} className="mt-0.5 shrink-0" style={{ color: 'var(--danger)' }} aria-hidden />
                  <span style={{ color: 'var(--text-secondary)' }}>
                    <strong style={{ color: 'var(--text-primary)' }}>
                      Row {sourceRow ?? e.row}
                      {name ? ` (${name})` : ''}
                    </strong>{' '}
                    — {e.message}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </Panel>
  );
}

// ─────────────────────────────────────────────────────────────── Export ──

const EXPORTS: { href: string; title: string; what: string; who: string; icon: LucideIcon }[] = [
  {
    href: '/api/export?format=csv',
    title: 'Full register — CSV',
    what: 'Every subscription as one row, with cost, billing, renewal date, departmental split, owner, account email and card. Stored passwords are never included; the file records only whether one is held.',
    who: 'For anyone who wants the raw data to sort, filter or load somewhere else.',
    icon: Download,
  },
  {
    href: '/api/export?format=xlsx',
    title: 'Full register — Excel',
    what: 'The same rows, formatted: heading row frozen, filters switched on, money in pounds and dates in dd/mm/yyyy.',
    who: 'For sending to someone who will read it as it stands rather than re-work it.',
    icon: FileSpreadsheet,
  },
  {
    href: '/api/export?format=finance',
    title: 'Departmental cost breakdown — Excel',
    what: 'Three sheets: total spend with the share of it that is estimated, cost by department including cost per head, and a per-subscription sheet with one column per department so any split can be checked line by line.',
    who: 'For Finance, and for the conversation with a budget holder who wants to see how their figure was arrived at.',
    icon: Table2,
  },
  {
    href: '/api/calendar.ics',
    title: 'Renewal calendar — .ics',
    what: 'Upcoming renewal dates as calendar entries, with the amount and the card in the entry.',
    who: 'For whoever needs renewals to appear in their diary rather than in a report they have to remember to open.',
    icon: CalendarClock,
  },
];

function ExportTab() {
  return (
    <Panel
      title="Take the data out"
      description="Each file below contains the same register, arranged for a different reader. All four are generated when you click, so they are current at the moment of download."
    >
      <ul className="space-y-3">
        {EXPORTS.map((item) => {
          const Icon = item.icon;
          return (
            <li
              key={item.href}
              className="flex flex-wrap items-start justify-between gap-3 rounded-[var(--radius-md)] border p-3"
              style={{ borderColor: 'var(--border-subtle)' }}
            >
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                  <Icon size={14} strokeWidth={2.1} style={{ color: 'var(--text-tertiary)' }} aria-hidden />
                  {item.title}
                </p>
                <p className="mt-1 max-w-2xl text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  {item.what}
                </p>
                <p className="mt-1 max-w-2xl text-xs leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>
                  {item.who}
                </p>
              </div>
              <LinkButton href={item.href} download size="sm" icon={Download} ariaLabel={`Download ${item.title}`}>
                Download
              </LinkButton>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

// ─────────────────────────────────────────────────────────── Workbench ──

export interface ImportDepartment {
  code: string;
  name: string;
}
export interface ImportCard {
  label: string;
  last4: string;
}

export function ImportWorkbench({
  departments,
  cards,
  canEdit,
}: {
  departments: ImportDepartment[];
  cards: ImportCard[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(canEdit ? 'paste' : 'export');
  const [text, setText] = useState('');
  const [ingested, setIngested] = useState<Ingested | null>(null);
  const [hasHeader, setHasHeader] = useState(true);
  const [mapping, setMapping] = useState<(ImportField | null)[]>([]);
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);
  const [dragging, setDragging] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  const ctx = useMemo(
    () => ({
      departmentCodes: departments.map((d) => d.code),
      departmentNames: departments.map((d) => d.name),
      cardLast4: cards.map((c) => c.last4),
    }),
    [departments, cards],
  );

  /** Everything downstream of the grid is derived, so nothing can fall out of step. */
  const table = useMemo(() => (ingested ? gridToTable(ingested.grid, hasHeader) : null), [ingested, hasHeader]);

  const prepared = useMemo(
    () => (table ? prepareRows(table.headers, table.rows, mapping, ctx) : null),
    [table, mapping, ctx],
  );

  const ingest = useCallback((grid: string[][], label: string, delimiterLabel: string) => {
    const detected = gridToTable(grid);
    setIngested({ grid, label, delimiterLabel });
    setHasHeader(detected.hasHeader);
    setMapping(detected.hasHeader ? guessMapping(detected.headers) : detected.headers.map(() => null));
    setOutcome(null);
    setReadError(null);
  }, []);

  const readText = useCallback(
    (raw: string, label: string) => {
      const trimmed = raw.trim();
      if (trimmed === '') {
        setReadError('There was nothing to read. Paste some rows first.');
        return;
      }
      const parsed = parseDelimitedText(trimmed);
      if (parsed.rows.length === 0) {
        setReadError('No data rows were found. Copy the rows as well as the headings.');
        return;
      }
      ingest(parsed.grid, label, parsed.delimiterLabel);
    },
    [ingest],
  );

  const readFile = useCallback(
    async (file: File) => {
      const name = file.name.toLowerCase();
      if (!name.endsWith('.csv') && !name.endsWith('.tsv') && !name.endsWith('.txt')) {
        setReadError(`${file.name} is not a .csv or .tsv file. Save the sheet as CSV and try again.`);
        return;
      }
      // Excel writes a byte-order mark at the front of a CSV; it is not data.
      const raw = (await file.text()).replace(/^\uFEFF/, '');
      const result = Papa.parse<string[]>(raw, { skipEmptyLines: 'greedy' });
      const grid = result.data.filter((r) => Array.isArray(r) && r.some((c) => (c ?? '').trim() !== ''));
      if (grid.length === 0) {
        setReadError(`${file.name} contained no rows that could be read.`);
        return;
      }
      const delimiter = result.meta.delimiter as Delimiter;
      ingest(grid, file.name, DELIMITER_LABEL[delimiter] ?? 'delimited');
    },
    [ingest],
  );

  const reset = () => {
    setIngested(null);
    setMapping([]);
    setText('');
    setOutcome(null);
    setReadError(null);
  };

  const runImport = () => {
    if (!prepared || prepared.importable.length === 0) return;
    const payload = prepared.importable.map((r) => r.values);
    const rowNumbers = prepared.importable.map((r) => r.row);
    const names = prepared.importable.map((r) => r.values.name);
    startTransition(async () => {
      try {
        const res = await bulkImport(payload);
        setOutcome({ ok: true, created: res.created, updated: res.updated, errors: res.errors, rowNumbers, names });
        router.refresh();
      } catch (e) {
        setOutcome({ ok: false, error: e instanceof Error ? e.message : 'The import could not be completed.' });
      }
    });
  };

  // ── Viewers ────────────────────────────────────────────────────────────
  if (!canEdit) {
    return (
      <div className="space-y-4">
        <Panel title="Importing needs edit access">
          <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            Your account is read-only, so the paste and upload tabs are not shown. Bringing data in changes the register
            that every dashboard is derived from, which is why it is limited to editors and administrators. Ask an
            administrator to change your role if you need to import. Exports are available to you in full and are listed
            below.
          </p>
        </Panel>
        <ExportTab />
      </div>
    );
  }

  const tabs: { value: Tab; label: React.ReactNode; title: string }[] = [
    { value: 'paste', label: 'Paste from a spreadsheet', title: 'Copy rows out of Excel and paste them in' },
    { value: 'file', label: 'Upload a CSV file', title: 'Read a .csv or .tsv file from your machine' },
    { value: 'export', label: 'Export', title: 'Download the register in several shapes' },
  ];

  return (
    <div className="space-y-4">
      <Segmented options={tabs} value={tab} onChange={setTab} />

      {tab === 'paste' ? (
        <Panel
          title="Paste rows from your spreadsheet"
          description="Select the rows in Excel, copy them, and paste below. Tab, comma and semicolon separated text are all read. Include the heading row if you have one — the columns are matched to fields for you, and you can correct any that are wrong before anything is written."
        >
          <div className="space-y-2">
            <Textarea
              value={text}
              rows={10}
              spellCheck={false}
              placeholder={PLACEHOLDER}
              aria-label="Rows pasted from a spreadsheet"
              onChange={(e) => setText(e.target.value)}
              onPaste={(e) => {
                const pasted = e.clipboardData.getData('text');
                if (pasted.trim() === '') return;
                e.preventDefault();
                setText(pasted);
                readText(pasted, 'Pasted from a spreadsheet');
              }}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="primary" icon={ClipboardPaste} onClick={() => readText(text, 'Pasted from a spreadsheet')}>
                Read this
              </Button>
              {ingested || text ? (
                <Button variant="ghost" icon={X} onClick={reset}>
                  Start again
                </Button>
              ) : null}
              <span className="text-[0.6875rem]" style={{ color: 'var(--text-tertiary)' }}>
                Pasting replaces whatever is in the box and reads the rows straight away. Nothing is saved until you
                choose to import.
              </span>
            </div>
          </div>
        </Panel>
      ) : null}

      {tab === 'file' ? (
        <Panel
          title="Upload a CSV file"
          description="Save your sheet as CSV or tab-separated text, then drop it here. It is read in your browser and checked before anything is sent."
          action={
            <LinkButton href="/api/export?format=template" download size="xs" icon={FileDown}>
              Download a blank template
            </LinkButton>
          }
        >
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const file = e.dataTransfer.files?.[0];
              if (file) void readFile(file);
            }}
            className="rounded-[var(--radius-md)] border border-dashed p-6 text-center transition-colors"
            style={{
              borderColor: dragging ? 'var(--brand-400)' : 'var(--border-default)',
              background: dragging ? 'var(--brand-50)' : 'var(--surface-sunken)',
            }}
          >
            <Upload size={18} strokeWidth={1.8} className="mx-auto" style={{ color: 'var(--text-tertiary)' }} aria-hidden />
            <p className="mt-2 text-sm" style={{ color: 'var(--text-primary)' }}>
              Drop a .csv or .tsv file here
            </p>
            <p className="mt-0.5 text-xs" style={{ color: 'var(--text-tertiary)' }}>
              The file stays in your browser until you press Import.
            </p>
            <div className="mt-3 flex justify-center gap-2">
              <Button icon={Upload} onClick={() => fileInput.current?.click()}>
                Choose a file
              </Button>
              {ingested ? (
                <Button variant="ghost" icon={X} onClick={reset}>
                  Start again
                </Button>
              ) : null}
            </div>
            <input
              ref={fileInput}
              type="file"
              accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void readFile(file);
                e.target.value = '';
              }}
            />
          </div>
        </Panel>
      ) : null}

      {tab === 'export' ? <ExportTab /> : null}

      {readError && tab !== 'export' ? (
        <p className="rounded-[var(--radius-sm)] p-2.5 text-xs" style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}>
          {readError}
        </p>
      ) : null}

      {/* ── The shared pipeline: mapping, preview, checks, import ──────── */}
      {tab !== 'export' && ingested && table && prepared ? (
        <>
          <MappingPanel
            headers={table.headers}
            rows={table.rows}
            mapping={mapping}
            hasHeader={hasHeader}
            source={ingested}
            onHasHeaderChange={(v) => {
              setHasHeader(v);
              const next = gridToTable(ingested.grid, v);
              setMapping(v ? guessMapping(next.headers) : next.headers.map(() => null));
            }}
            onChange={(index, field) =>
              setMapping((prev) => prev.map((f, i) => (i === index ? field : f === field ? null : f)))
            }
            onReguess={() => setMapping(guessMapping(table.headers))}
          />

          <Panel
            title="How the rows will be read"
            description="Cells that could not be read are marked. Amber means the row will still import with that value changed or left out; red means the row cannot be imported at all."
          >
            {table.rows.length === 0 ? (
              <EmptyState icon={Table2} title="No data rows" description="Only a heading row was found." compact />
            ) : (
              <PreviewTable headers={table.headers} rows={table.rows} mapping={mapping} prepared={prepared} />
            )}
          </Panel>

          <Panel title="What needs checking">
            <ValidationPanel prepared={prepared} headers={table.headers} />
          </Panel>

          <div
            className="flex flex-wrap items-center gap-3 rounded-[var(--radius-lg)] border p-3"
            style={{ background: 'var(--surface-raised)', borderColor: 'var(--border-subtle)' }}
          >
            <Button
              variant="primary"
              size="md"
              icon={CheckCircle2}
              loading={pending}
              disabled={prepared.importable.length === 0}
              onClick={runImport}
            >
              Import {prepared.importable.length} row{prepared.importable.length === 1 ? '' : 's'}
            </Button>
            <p className="min-w-[220px] flex-1 text-xs leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>
              {prepared.importable.length === 0
                ? 'Nothing can be imported yet. Map a column to Name and give every row a name.'
                : `A subscription that already exists with the same name is updated rather than duplicated.${
                    prepared.counts.skipped > 0
                      ? ` ${prepared.counts.skipped} row${prepared.counts.skipped === 1 ? '' : 's'} will be left out, as listed above.`
                      : ''
                  }${prepared.importable.length > 200 ? ' Rows are written one at a time, so a sheet this size takes a moment.' : ''}`}
            </p>
          </div>
        </>
      ) : null}

      {outcome ? <ResultPanel outcome={outcome} onDismiss={() => setOutcome(null)} /> : null}

      {tab !== 'export' && !ingested ? (
        <div
          className="rounded-[var(--radius-lg)] border"
          style={{ background: 'var(--surface-raised)', borderColor: 'var(--border-subtle)' }}
        >
          <EmptyState
            icon={tab === 'paste' ? ClipboardPaste : Upload}
            title="Nothing read yet"
            description={
              tab === 'paste'
                ? 'Paste a block of rows above. The columns will be matched to fields and checked before anything is written.'
                : 'Choose or drop a file above. It is read and checked in your browser before anything is written.'
            }
          />
        </div>
      ) : null}

      <p className="flex items-start gap-1.5 px-1 text-[0.6875rem] leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>
        <Lock size={12} className="mt-0.5 shrink-0" aria-hidden />
        <span>
          Passwords in an imported column are encrypted before they are stored and are never included in any export. The
          exports record only whether a password is held.
        </span>
      </p>
    </div>
  );
}
