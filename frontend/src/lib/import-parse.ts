/**
 * Import parsing.
 *
 * Text in, structured rows out. Everything here is pure and synchronous so the
 * same functions serve a pasted block from Excel, an uploaded CSV and a test
 * script without change. No React, no papaparse, no I/O.
 *
 * The guiding assumption is that the spreadsheet a person already keeps is
 * messy: headers are worded however they were worded, amounts carry currency
 * symbols and "/mo" suffixes, dates are British, and billing terms are written
 * in English rather than in the enum values this application stores. Parsing is
 * therefore lenient, but every leniency is reported as a per-row, per-column
 * issue so nothing is quietly reinterpreted.
 *
 * `ImportRow` is imported for its type only — the import is erased at compile
 * time, so this module carries no dependency on the server action. It is
 * deliberately not redefined here: the importer and the parser must agree on
 * one shape, not two that drift.
 */

import {
  ALLOCATION_METHODS,
  BILLING_MODELS,
  CATEGORIES,
  CATEGORY_META,
  CURRENCIES,
  SUB_STATUSES,
  type AllocationMethod,
  type BillingModel,
  type Category,
  type SubStatus,
} from './domain';
import type { ImportRow } from '@/server/actions';

// ────────────────────────────────────────────────────────────────── Fields ──

/**
 * The fields a pasted or uploaded column can be mapped onto, in the order they
 * appear in the downloadable template and in the mapping dropdown.
 */
export const IMPORT_FIELDS = [
  'name',
  'vendor',
  'url',
  'category',
  'status',
  'billingModel',
  'currency',
  'unitAmount',
  'seats',
  'perSeat',
  'renewalDate',
  'ownerDepartmentCode',
  'allocationMethod',
  'accountEmail',
  'username',
  'password',
  'cardLast4',
  'tags',
  'notes',
] as const;

export type ImportField = (typeof IMPORT_FIELDS)[number];

export interface ImportFieldMeta {
  /** The column heading used in the downloadable template. */
  label: string;
  /** One line explaining what belongs in the column. */
  hint: string;
  /** Used in the template's example rows. */
  example: string;
}

export const IMPORT_FIELD_META: Record<ImportField, ImportFieldMeta> = {
  name: { label: 'Name', hint: 'The software or service. This is the only column that must be filled in.', example: 'Adobe Creative Cloud' },
  vendor: { label: 'Vendor', hint: 'Who you buy it from, if that differs from the product name.', example: 'Adobe' },
  url: { label: 'URL', hint: 'Where the account is managed.', example: 'https://account.adobe.com' },
  category: { label: 'Category', hint: 'Plain words are accepted, for example "design" or "AI".', example: 'Design' },
  status: { label: 'Status', hint: 'Active, trial, paused, cancelled or pending.', example: 'Active' },
  billingModel: { label: 'Billing model', hint: 'Monthly, annual, quarterly, usage, credit top-up, one-off or free.', example: 'Annual' },
  currency: { label: 'Currency', hint: 'A three-letter code or a symbol. Defaults to GBP.', example: 'GBP' },
  unitAmount: { label: 'Amount per charge', hint: 'What the vendor charges each time, before any seat multiplication.', example: '1,234.00' },
  seats: { label: 'Seats', hint: 'Number of licences held.', example: '12' },
  perSeat: { label: 'Per seat', hint: 'Yes if the amount above is per seat rather than the total.', example: 'No' },
  renewalDate: { label: 'Renewal date', hint: 'dd/mm/yyyy, yyyy-mm-dd and "12 Mar 2026" are all read correctly.', example: '12/03/2026' },
  ownerDepartmentCode: { label: 'Owner department code', hint: 'The department code as set up in this application, for example CD.', example: 'CD' },
  allocationMethod: { label: 'Allocation method', hint: 'Owner pays, percentage split or seat split.', example: 'Owner pays' },
  accountEmail: { label: 'Account email', hint: 'The address the account is registered to.', example: 'creative@imperiallearning.co.uk' },
  username: { label: 'Username', hint: 'The login name, where it is not the email address.', example: 'imperial.creative' },
  password: { label: 'Password', hint: 'Stored encrypted. Leave blank if you keep passwords elsewhere.', example: '' },
  cardLast4: { label: 'Card last 4', hint: 'The last four digits of the card that pays for it.', example: '4417' },
  tags: { label: 'Tags', hint: 'Comma-separated labels of your own.', example: 'design; core' },
  notes: { label: 'Notes', hint: 'Anything else worth recording.', example: 'Shared with Marketing from April.' },
};

// ───────────────────────────────────────────────────────────── Delimiters ──

export type Delimiter = '\t' | ',' | ';' | '|';

const DELIMITERS: Delimiter[] = ['\t', ';', ',', '|'];

export const DELIMITER_LABEL: Record<Delimiter, string> = {
  '\t': 'tab',
  ',': 'comma',
  ';': 'semicolon',
  '|': 'pipe',
};

function countOutsideQuotes(line: string, delimiter: string): number {
  let count = 0;
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      quoted = !quoted;
      continue;
    }
    if (!quoted && ch === delimiter) count++;
  }
  return count;
}

/**
 * Works out which character separates the columns. A block copied out of Excel
 * is tab-separated; a file saved from Excel is usually comma-separated, and
 * semicolons appear on machines set to a European locale. The winner is the
 * candidate that appears the same number of times on every line, because a
 * delimiter that varies line to line is almost certainly part of the content.
 */
export function detectDelimiter(text: string): Delimiter {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '').slice(0, 12);
  if (lines.length === 0) return ',';

  let best: Delimiter = ',';
  let bestScore = -1;
  for (const d of DELIMITERS) {
    const counts = lines.map((l) => countOutsideQuotes(l, d));
    if (counts[0] === 0) continue;
    const consistent = counts.every((c) => c === counts[0]);
    const score = counts[0] * (consistent ? 10 : 1);
    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return best;
}

/**
 * Splits delimited text into a grid, honouring double quotes so that a quoted
 * cell may contain the delimiter or a line break. Blank lines are dropped.
 */
export function splitDelimited(text: string, delimiter: Delimiter): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  const endCell = () => {
    row.push(cell.trim());
    cell = '';
  };
  const endRow = () => {
    endCell();
    if (row.some((c) => c !== '')) rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"' && cell.trim() === '') {
      quoted = true;
      cell = '';
      continue;
    }
    if (ch === delimiter) {
      endCell();
      continue;
    }
    if (ch === '\r') continue;
    if (ch === '\n') {
      endRow();
      continue;
    }
    cell += ch;
  }
  endRow();
  return rows;
}

// ─────────────────────────────────────────────────────── Value normalisers ──

/** Lowercases and reduces punctuation to single spaces, for tolerant matching. */
export function canonicalise(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9%]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Reads a money value, tolerating currency symbols, thousands separators,
 * trailing period suffixes such as "/mo", and the European decimal comma.
 * Returns null when the cell contains no number at all.
 */
export function parseAmount(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const text = String(raw).trim();
  if (text === '') return null;

  // Keep only the characters a number can be made of.
  const stripped = text.replace(/[^0-9.,\- ]/g, ' ').trim();
  if (!/[0-9]/.test(stripped)) return null;

  const negative = /^-/.test(stripped);
  let digits = stripped.replace(/-/g, '').replace(/\s+/g, '');

  const lastComma = digits.lastIndexOf(',');
  const lastDot = digits.lastIndexOf('.');
  if (lastComma > -1 && lastDot > -1) {
    // Whichever separator comes last is the decimal point.
    if (lastComma > lastDot) digits = digits.replace(/\./g, '').replace(',', '.');
    else digits = digits.replace(/,/g, '');
  } else if (lastComma > -1) {
    // A single comma with one or two digits after it is a decimal comma;
    // anything else is a thousands separator.
    const after = digits.length - lastComma - 1;
    digits = after > 0 && after <= 2 && digits.indexOf(',') === lastComma ? digits.replace(',', '.') : digits.replace(/,/g, '');
  }
  digits = digits.replace(/\.(?=.*\.)/g, '');

  const n = Number(digits);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

function isoOf(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

const fullYear = (y: number) => (y >= 100 ? y : y >= 70 ? 1900 + y : 2000 + y);

/**
 * Reads a date and returns it as yyyy-mm-dd, or null if it cannot be read.
 * Accepts dd/mm/yyyy, yyyy-mm-dd and "12 Mar 2026". Where a numeric date is
 * ambiguous the British reading is used, so 03/04/2026 is 3 April.
 */
export function parseDateValue(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const text = String(raw).trim().replace(/(\d)(st|nd|rd|th)\b/gi, '$1');
  if (text === '') return null;

  // yyyy-mm-dd or yyyy/mm/dd
  const ymd = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (ymd) return isoOf(Number(ymd[1]), Number(ymd[2]), Number(ymd[3]));

  // dd/mm/yyyy, dd-mm-yy, dd.mm.yyyy
  const dmy = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (dmy) {
    const a = Number(dmy[1]);
    const b = Number(dmy[2]);
    const year = fullYear(Number(dmy[3]));
    // Only fall back to the American reading when the British one is impossible.
    return isoOf(year, b, a) ?? isoOf(year, a, b);
  }

  // 12 Mar 2026 / 12 March 2026
  const dMonthY = text.match(/^(\d{1,2})\s+([a-z]+)\.?\s+(\d{2,4})$/i);
  if (dMonthY) {
    const month = MONTHS[dMonthY[2].slice(0, 4).toLowerCase()] ?? MONTHS[dMonthY[2].slice(0, 3).toLowerCase()];
    if (month) return isoOf(fullYear(Number(dMonthY[3])), month, Number(dMonthY[1]));
  }

  // Mar 12 2026 / March 12, 2026
  const monthDY = text.match(/^([a-z]+)\.?\s+(\d{1,2})\s+(\d{2,4})$/i);
  if (monthDY) {
    const month = MONTHS[monthDY[1].slice(0, 4).toLowerCase()] ?? MONTHS[monthDY[1].slice(0, 3).toLowerCase()];
    if (month) return isoOf(fullYear(Number(monthDY[3])), month, Number(monthDY[2]));
  }

  return null;
}

/** Reads yes/no, true/false and 1/0. Returns null when the cell says neither. */
export function parseBoolean(raw: string | null | undefined): boolean | null {
  const c = canonicalise(String(raw ?? ''));
  if (c === '') return null;
  if (['y', 'yes', 'true', '1', 'per seat', 'per user', 'each', 'seat'].includes(c)) return true;
  if (['n', 'no', 'false', '0', 'total', 'flat'].includes(c)) return false;
  return null;
}

/** Reads a whole number of seats. Returns null when the cell is not a count. */
export function parseSeats(raw: string | null | undefined): number | null {
  const n = parseAmount(raw);
  if (n == null) return null;
  const rounded = Math.round(n);
  return rounded >= 1 ? rounded : null;
}

const CURRENCY_BY_SYMBOL: Record<string, string> = { '£': 'GBP', $: 'USD', '€': 'EUR', '₹': 'INR' };

/** Reads a currency as a three-letter code, accepting symbols and stray words. */
export function parseCurrency(raw: string | null | undefined): string | null {
  const text = String(raw ?? '').trim();
  if (text === '') return null;
  for (const [symbol, code] of Object.entries(CURRENCY_BY_SYMBOL)) {
    if (text.includes(symbol)) return code;
  }
  const letters = text.toUpperCase().match(/[A-Z]{3}/);
  return letters ? letters[0] : null;
}

/** Reads the last four digits of a card from "···· 4417", "x4417" or "4417". */
export function parseCardLast4(raw: string | null | undefined): string | null {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (digits.length < 4) return null;
  return digits.slice(-4);
}

/**
 * `exact` patterns only match a cell in its entirety. That distinction matters
 * for the short forms: "mo" should mean monthly on its own, but must not turn
 * "12 months" into a match on a stray substring.
 */
type Rule<T extends string> = { value: T; exact?: string[]; patterns: string[] };

function matchRules<T extends string>(raw: string, rules: Rule<T>[]): T | null {
  const c = canonicalise(raw);
  if (c === '') return null;
  for (const rule of rules) {
    if (rule.exact?.includes(c) || rule.patterns.includes(c)) return rule.value;
  }
  for (const rule of rules) {
    if (rule.patterns.some((p) => c.includes(p))) return rule.value;
  }
  return null;
}

const BILLING_RULES: Rule<BillingModel>[] = [
  { value: 'FREE', exact: ['0', 'nil', 'zero', 'n a'], patterns: ['free', 'no cost', 'complimentary'] },
  { value: 'ONE_OFF', patterns: ['one off', 'oneoff', 'once', 'perpetual', 'lifetime', 'single payment', 'outright'] },
  { value: 'TOPUP_CREDIT', patterns: ['credit', 'top up', 'topup', 'prepaid', 'pre paid', 'wallet', 'pre pay'] },
  { value: 'PAY_PER_USE', exact: ['payg'], patterns: ['pay as you go', 'usage', 'per use', 'metered', 'consumption', 'on demand'] },
  { value: 'WEEKLY', exact: ['wk', 'w'], patterns: ['weekly', 'per week', 'week'] },
  { value: 'BIANNUAL', patterns: ['biannual', 'bi annual', 'semi annual', 'half year', '6 month', 'six month', 'twice a year'] },
  { value: 'QUARTERLY', exact: ['qtr', 'q'], patterns: ['quarterly', 'quarter', 'per quarter', '3 month', 'three month'] },
  { value: 'ANNUAL', exact: ['pa', 'p a', 'yr', 'y'], patterns: ['annually', 'annual', 'yearly', 'per year', 'per annum', '12 month', '1 year', 'year'] },
  { value: 'MONTHLY', exact: ['mo', 'pm', 'p m', 'm'], patterns: ['monthly', 'per month', 'month'] },
];

/**
 * Reads a billing term written in ordinary English — "per month", "Yearly",
 * "PAYG" — and returns the stored billing model, or null if it is unreadable.
 */
export function normaliseBillingModel(raw: string | null | undefined): BillingModel | null {
  const text = String(raw ?? '').trim();
  if (text === '') return null;
  const upper = text.toUpperCase().replace(/[\s-]+/g, '_');
  if ((BILLING_MODELS as readonly string[]).includes(upper)) return upper as BillingModel;
  return matchRules(text, BILLING_RULES);
}

const STATUS_RULES: Rule<SubStatus>[] = [
  { value: 'CANCELLED', patterns: ['cancelled', 'canceled', 'ended', 'closed', 'stopped', 'terminated', 'expired', 'lapsed'] },
  { value: 'TRIAL', patterns: ['trial', 'free trial', 'pilot', 'evaluation', 'poc'] },
  { value: 'PAUSED', patterns: ['paused', 'on hold', 'hold', 'suspended', 'dormant', 'frozen'] },
  { value: 'PENDING', patterns: ['pending', 'requested', 'awaiting', 'to set up', 'proposed', 'in progress'] },
  { value: 'ACTIVE', exact: ['yes', 'y'], patterns: ['active', 'live', 'in use', 'current', 'running', 'subscribed'] },
];

/** Reads a status written in ordinary English. Returns null if unreadable. */
export function normaliseStatus(raw: string | null | undefined): SubStatus | null {
  const text = String(raw ?? '').trim();
  if (text === '') return null;
  const upper = text.toUpperCase().replace(/[\s-]+/g, '_');
  if ((SUB_STATUSES as readonly string[]).includes(upper)) return upper as SubStatus;
  return matchRules(text, STATUS_RULES);
}

const ALLOCATION_RULES: Rule<AllocationMethod>[] = [
  { value: 'PERCENTAGE', patterns: ['percentage', 'percent', '%', 'split by percentage', 'share', 'apportioned'] },
  { value: 'SEATS', patterns: ['seats', 'seat', 'by licence', 'by license', 'per seat', 'licences', 'licenses'] },
  { value: 'OWNER_PAYS', patterns: ['owner pays', 'owner', 'single department', 'one department', 'whole cost'] },
];

/** Reads an allocation method written in ordinary English. */
export function normaliseAllocationMethod(raw: string | null | undefined): AllocationMethod | null {
  const text = String(raw ?? '').trim();
  if (text === '') return null;
  const upper = text.toUpperCase().replace(/[\s-]+/g, '_');
  if ((ALLOCATION_METHODS as readonly string[]).includes(upper)) return upper as AllocationMethod;
  return matchRules(text, ALLOCATION_RULES);
}

const CATEGORY_RULES: Rule<Category>[] = [
  { value: 'ELEARNING_AUTHORING', patterns: ['elearning authoring', 'authoring', 'elearning', 'e learning', 'scorm', 'course build'] },
  { value: 'LMS', patterns: ['lms', 'learning management', 'delivery', 'learning platform'] },
  { value: 'AI_TOOLS', exact: ['ai', 'ml'], patterns: ['ai tools', 'artificial intelligence', 'llm', 'generative'] },
  { value: 'STOCK_MEDIA', patterns: ['stock media libraries', 'stock', 'media library', 'images', 'photos', 'footage', 'fonts'] },
  { value: 'VIDEO_AUDIO', patterns: ['video audio', 'video', 'audio', 'voice', 'sound', 'editing'] },
  { value: 'DESIGN', patterns: ['design', 'graphics', 'creative', 'illustration'] },
  { value: 'DEVELOPMENT', patterns: ['development', 'dev', 'code', 'engineering', 'software dev'] },
  { value: 'DATA_ANALYTICS', exact: ['bi'], patterns: ['data analytics', 'analytics', 'data', 'reporting'] },
  { value: 'MARKETING', patterns: ['marketing', 'seo', 'social', 'advertising', 'crm'] },
  { value: 'HOSTING_INFRA', patterns: ['hosting infrastructure', 'hosting', 'infrastructure', 'infra', 'server', 'domain', 'cloud'] },
  { value: 'SECURITY', patterns: ['security', 'antivirus', 'vpn', 'password manager', 'backup'] },
  { value: 'FINANCE_OPS', patterns: ['finance ops', 'finance', 'accounting', 'accounts', 'payroll', 'ops'] },
  { value: 'RESEARCH', patterns: ['research reference', 'research', 'reference', 'journals', 'library'] },
  { value: 'COLLABORATION', patterns: ['collaboration', 'comms', 'communication', 'meetings', 'chat'] },
  { value: 'PRODUCTIVITY', patterns: ['productivity', 'office', 'notes', 'tasks', 'project management'] },
  { value: 'OTHER', patterns: ['other', 'misc', 'miscellaneous', 'general'] },
];

/** Reads a category written in ordinary English, or as one of our own labels. */
export function normaliseCategory(raw: string | null | undefined): Category | null {
  const text = String(raw ?? '').trim();
  if (text === '') return null;
  const upper = text.toUpperCase().replace(/[\s&-]+/g, '_');
  if ((CATEGORIES as readonly string[]).includes(upper)) return upper as Category;

  const c = canonicalise(text);
  for (const key of CATEGORIES) {
    if (canonicalise(CATEGORY_META[key].label) === c) return key;
  }
  return matchRules(text, CATEGORY_RULES);
}

// ────────────────────────────────────────────────────── Column guessing ──

interface HeaderRule {
  field: ImportField;
  patterns: string[];
  /** Words that veto the rule, so "Cost centre" is not read as an amount. */
  unless?: string[];
}

/**
 * Order is the whole design here. The first rule that matches wins, so the
 * specific sits above the general: "per seat" is tested before "seats", and
 * "billing frequency" before the looser renewal words.
 */
const HEADER_RULES: HeaderRule[] = [
  { field: 'perSeat', patterns: ['per seat', 'perseat', 'per user', 'per licence', 'per license', 'priced per'] },
  { field: 'renewalDate', patterns: ['renewal date', 'renew date', 'next charge', 'next payment', 'next bill', 'due date', 'expiry', 'expires', 'expiry date', 'end date'] },
  { field: 'billingModel', patterns: ['billing', 'frequency', 'cycle', 'term', 'how often', 'interval', 'recurrence', 'payment period'] },
  { field: 'renewalDate', patterns: ['renewal', 'renews', 'renew', 'due'] },
  { field: 'currency', patterns: ['currency', 'ccy', 'curr'] },
  { field: 'unitAmount', patterns: ['amount', 'cost', 'price', 'charge', 'fee', 'spend', 'net', 'rrp'], unless: ['centre', 'center', 'code'] },
  { field: 'seats', patterns: ['seats', 'seat', 'licences', 'licenses', 'licence', 'license', 'number of users', 'no of users', 'quantity', 'qty'] },
  { field: 'accountEmail', patterns: ['email', 'e mail', 'account'] },
  { field: 'username', patterns: ['username', 'user name', 'login', 'user id', 'user'] },
  { field: 'password', patterns: ['password', 'passphrase', 'pwd', 'pass'] },
  { field: 'cardLast4', patterns: ['last 4', 'last4', 'last four', 'card ending', 'card'] },
  { field: 'ownerDepartmentCode', patterns: ['department', 'dept', 'business unit', 'faculty', 'owning team', 'team'] },
  { field: 'allocationMethod', patterns: ['allocation', 'split'] },
  { field: 'category', patterns: ['category', 'type', 'group', 'classification'] },
  { field: 'status', patterns: ['status', 'state', 'active'] },
  { field: 'url', patterns: ['url', 'website', 'web site', 'site', 'link', 'web address'] },
  { field: 'vendor', patterns: ['vendor', 'supplier', 'provider', 'publisher', 'company', 'manufacturer'] },
  { field: 'name', patterns: ['software', 'name', 'tool', 'service', 'subscription', 'product', 'application', 'platform', 'system'] },
  { field: 'tags', patterns: ['tags', 'tag', 'labels', 'keywords'] },
  { field: 'notes', patterns: ['notes', 'note', 'comment', 'comments', 'description', 'details', 'remarks'] },
];

function containsWord(haystack: string, pattern: string): boolean {
  return new RegExp(`\\b${pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(haystack);
}

/**
 * Guesses which field a column heading refers to. Matching is on whole words
 * from the start of a word, so "renew" finds "Renewal date" and "Renews on"
 * but "app" does not find "Approved by".
 */
export function guessFieldForHeader(header: string): ImportField | null {
  const c = canonicalise(header);
  if (c === '') return null;

  // An exact match on one of our own template headings always wins.
  for (const field of IMPORT_FIELDS) {
    if (canonicalise(IMPORT_FIELD_META[field].label) === c || field.toLowerCase() === c.replace(/ /g, '')) return field;
  }

  for (const rule of HEADER_RULES) {
    if (rule.unless?.some((u) => containsWord(c, u))) continue;
    if (rule.patterns.some((p) => containsWord(c, p))) return rule.field;
  }
  return null;
}

/**
 * Guesses a mapping for every column. A field is used at most once — where two
 * columns would claim the same field the later one is left unmapped, so the
 * person importing decides rather than the guess deciding silently.
 */
export function guessMapping(headers: string[]): (ImportField | null)[] {
  const taken = new Set<ImportField>();
  return headers.map((h) => {
    const guess = guessFieldForHeader(h);
    if (!guess || taken.has(guess)) return null;
    taken.add(guess);
    return guess;
  });
}

// ─────────────────────────────────────────────────────────── Header rows ──

/**
 * True when a cell is a value rather than a label. A digit alone is not enough:
 * "Card last 4" is a heading, while "£1,234.00/mo" and "12 Mar 2026" are not,
 * so a cell only counts as numeric when it carries no word in it.
 */
function looksLikeDataValue(cell: string): boolean {
  if (parseDateValue(cell) != null) return true;
  return parseAmount(cell) != null && !/[a-z]{3,}/i.test(cell);
}

/**
 * Decides whether the first row names the columns rather than holding data.
 * A row of labels contains no amounts or dates; the row beneath it usually
 * does, and at least one label is normally recognisable.
 */
export function looksLikeHeaderRow(first: string[], second?: string[]): boolean {
  const cells = first.filter((c) => c.trim() !== '');
  if (cells.length === 0) return false;
  if (cells.some(looksLikeDataValue)) return false;
  if (cells.some((c) => c.length > 60)) return false;

  const recognised = cells.filter((c) => guessFieldForHeader(c) != null).length;
  const secondHasData = second ? second.some(looksLikeDataValue) : false;
  return recognised >= 1 || secondHasData;
}

export interface Table {
  /** True when the first line of the source was treated as column headings. */
  hasHeader: boolean;
  headers: string[];
  /** Data rows only, padded to the width of the header row. */
  rows: string[][];
}

export interface ParsedTable extends Table {
  delimiter: Delimiter;
  delimiterLabel: string;
  /** Every row exactly as split, header included. Kept so the caller can ask
   *  for the table again with a different answer about the header row. */
  grid: string[][];
}

/** Pads or trims every row to the same width so the preview table lines up. */
function squareOff(rows: string[][], width: number): string[][] {
  return rows.map((r) => Array.from({ length: width }, (_, i) => r[i] ?? ''));
}

/**
 * Turns a pasted or uploaded block of text into headers plus data rows,
 * detecting the delimiter and whether a header row is present.
 */
export function parseDelimitedText(text: string, headerOverride?: boolean): ParsedTable {
  const delimiter = detectDelimiter(text);
  const grid = splitDelimited(text, delimiter);
  const table = gridToTable(grid, headerOverride);
  return { ...table, grid, delimiter, delimiterLabel: DELIMITER_LABEL[delimiter] };
}

/**
 * The same header handling for a grid that has already been split by something
 * else — a CSV parsed in the browser, for instance. Pass `headerOverride` when
 * the person importing has told us whether the first row is a header, so their
 * answer takes precedence over the guess.
 */
export function gridToTable(grid: string[][], headerOverride?: boolean): Table {
  const clean = grid.map((r) => r.map((c) => (c ?? '').trim())).filter((r) => r.some((c) => c !== ''));
  if (clean.length === 0) return { hasHeader: false, headers: [], rows: [] };

  const width = clean.reduce((max, r) => Math.max(max, r.length), 0);
  const hasHeader = headerOverride ?? looksLikeHeaderRow(clean[0], clean[1]);
  const headers = hasHeader
    ? Array.from({ length: width }, (_, i) => clean[0][i]?.trim() || `Column ${i + 1}`)
    : Array.from({ length: width }, (_, i) => `Column ${i + 1}`);

  return { hasHeader, headers, rows: squareOff(hasHeader ? clean.slice(1) : clean, width) };
}

// ────────────────────────────────────────────────────────── Row building ──

export type IssueSeverity = 'BLOCKING' | 'WARNING';

export interface RowIssue {
  /** Row number as shown in the preview, counting data rows from 1. */
  row: number;
  /** Index of the offending column, or -1 where the problem is the row itself. */
  columnIndex: number;
  /** The heading of the offending column, as it appeared in the source. */
  column: string;
  field: ImportField | null;
  message: string;
  severity: IssueSeverity;
}

export interface PreparedRow {
  /** Row number as shown in the preview, counting data rows from 1. */
  row: number;
  values: ImportRow;
  issues: RowIssue[];
  /** True when a blocking problem means the row cannot be sent for import. */
  skipped: boolean;
}

export interface ImportContext {
  /** Department codes already set up, used to flag codes that do not exist. */
  departmentCodes: string[];
  /** Department names, accepted as an alternative to the code. */
  departmentNames?: string[];
  /** Card last-4s already set up, used to flag cards that do not exist. */
  cardLast4: string[];
}

export interface PreparedTable {
  rows: PreparedRow[];
  /** Rows that will be sent to the importer. */
  importable: PreparedRow[];
  counts: { total: number; ready: number; warnings: number; skipped: number };
  /** Problems that apply to the mapping as a whole rather than to one row. */
  mappingIssues: string[];
}

/**
 * Applies a column mapping to the data rows and reports, cell by cell, anything
 * that could not be read. Nothing is discarded silently: a value that cannot be
 * understood is left out of the import and named in an issue.
 */
export function prepareRows(
  headers: string[],
  rows: string[][],
  mapping: (ImportField | null)[],
  ctx: ImportContext,
): PreparedTable {
  const codes = new Set(ctx.departmentCodes.map((c) => c.trim().toUpperCase()));
  const names = new Set((ctx.departmentNames ?? []).map((n) => n.trim().toLowerCase()));
  const cards = new Set(ctx.cardLast4.map((c) => c.trim()));

  const mappingIssues: string[] = [];
  if (!mapping.includes('name')) {
    mappingIssues.push('No column is mapped to Name. Every subscription needs a name, so nothing can be imported until one column is mapped to it.');
  }

  const prepared: PreparedRow[] = rows.map((cells, i) => {
    const rowNumber = i + 1;
    const issues: RowIssue[] = [];
    const values: ImportRow = { name: '' };

    const flag = (columnIndex: number, field: ImportField | null, message: string, severity: IssueSeverity = 'WARNING') => {
      issues.push({
        row: rowNumber,
        columnIndex,
        column: headers[columnIndex] ?? `Column ${columnIndex + 1}`,
        field,
        message,
        severity,
      });
    };

    mapping.forEach((field, columnIndex) => {
      if (!field) return;
      const raw = (cells[columnIndex] ?? '').trim();
      if (raw === '') return;

      switch (field) {
        case 'name':
          values.name = raw;
          break;
        case 'vendor':
          values.vendor = raw;
          break;
        case 'url':
          values.url = raw;
          break;
        case 'notes':
          values.notes = raw;
          break;
        case 'tags':
          values.tags = raw.split(/[;,]/).map((t) => t.trim()).filter(Boolean).join(', ');
          break;
        case 'username':
          values.username = raw;
          break;
        case 'password':
          values.password = raw;
          break;
        case 'accountEmail': {
          values.accountEmail = raw;
          if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(raw)) {
            flag(columnIndex, field, `"${raw}" is not a valid email address. It will be imported as written.`);
          }
          break;
        }
        case 'unitAmount': {
          const amount = parseAmount(raw);
          if (amount == null) flag(columnIndex, field, `"${raw}" could not be read as an amount, so the cost will be imported as 0.`);
          else if (amount < 0) flag(columnIndex, field, `"${raw}" is negative, so the cost will be imported as 0. Amounts are recorded as positive charges.`);
          else values.unitAmount = amount;
          break;
        }
        case 'seats': {
          const seats = parseSeats(raw);
          if (seats == null) flag(columnIndex, field, `"${raw}" could not be read as a number of seats, so 1 will be used.`);
          else values.seats = seats;
          break;
        }
        case 'perSeat': {
          const bool = parseBoolean(raw);
          if (bool == null) flag(columnIndex, field, `"${raw}" is neither yes nor no, so the amount will be treated as the total rather than per seat.`);
          else values.perSeat = bool;
          break;
        }
        case 'renewalDate': {
          const iso = parseDateValue(raw);
          if (iso == null) {
            flag(columnIndex, field, `"${raw}" could not be read as a date. Use dd/mm/yyyy, yyyy-mm-dd or 12 Mar 2026. No renewal date will be set.`);
          } else values.renewalDate = iso;
          break;
        }
        case 'currency': {
          const code = parseCurrency(raw);
          if (code == null) flag(columnIndex, field, `"${raw}" could not be read as a currency, so GBP will be used.`);
          else {
            values.currency = code;
            if (!(CURRENCIES as readonly string[]).includes(code)) {
              flag(columnIndex, field, `${code} has no exchange rate set. It will be treated as 1:1 with GBP until a rate is added in Settings.`);
            }
          }
          break;
        }
        case 'billingModel': {
          const model = normaliseBillingModel(raw);
          if (model == null) flag(columnIndex, field, `"${raw}" was not recognised as a billing term, so Monthly will be used.`);
          else values.billingModel = model;
          break;
        }
        case 'category': {
          const category = normaliseCategory(raw);
          if (category == null) flag(columnIndex, field, `"${raw}" was not recognised as a category, so it will be filed under Other.`);
          else values.category = category;
          break;
        }
        case 'status': {
          const status = normaliseStatus(raw);
          if (status == null) flag(columnIndex, field, `"${raw}" was not recognised as a status, so Active will be used.`);
          else values.status = status;
          break;
        }
        case 'allocationMethod': {
          const method = normaliseAllocationMethod(raw);
          if (method == null) flag(columnIndex, field, `"${raw}" was not recognised as an allocation method, so the owning department will carry the whole cost.`);
          else values.allocationMethod = method;
          break;
        }
        case 'ownerDepartmentCode': {
          values.ownerDepartmentCode = raw;
          if (!codes.has(raw.toUpperCase()) && !names.has(raw.toLowerCase())) {
            flag(columnIndex, field, `There is no department with the code or name "${raw}". The subscription will be imported without an owning department.`);
          }
          break;
        }
        case 'cardLast4': {
          const last4 = parseCardLast4(raw);
          if (last4 == null) {
            flag(columnIndex, field, `"${raw}" does not contain four digits, so no card will be attached.`);
          } else {
            values.cardLast4 = last4;
            if (!cards.has(last4)) {
              flag(columnIndex, field, `No card ending ${last4} has been set up, so no card will be attached. Add the card on the Cards page first.`);
            }
          }
          break;
        }
      }
    });

    if (!values.name) {
      const nameColumn = mapping.indexOf('name');
      issues.push({
        row: rowNumber,
        columnIndex: nameColumn,
        column: nameColumn >= 0 ? (headers[nameColumn] ?? 'Name') : 'Name',
        field: 'name',
        message: 'This row has no name, so it cannot be imported.',
        severity: 'BLOCKING',
      });
    }

    return { row: rowNumber, values, issues, skipped: issues.some((x) => x.severity === 'BLOCKING') };
  });

  const importable = prepared.filter((r) => !r.skipped);
  return {
    rows: prepared,
    importable,
    counts: {
      total: prepared.length,
      ready: importable.filter((r) => r.issues.length === 0).length,
      warnings: importable.filter((r) => r.issues.length > 0).length,
      skipped: prepared.length - importable.length,
    },
    mappingIssues,
  };
}
