/**
 * Imperial Edutech — Subscription Intelligence Platform
 * Seed data for the Course Development department's subscription register.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IMPORTANT — READ BEFORE USING ANY NUMBER IN THIS FILE
 *
 * Every price, exchange rate, balance, seat count and renewal date below is
 * ILLUSTRATIVE SAMPLE DATA. The figures are plausible for the kind of vendor
 * named, but they are NOT verified current vendor pricing, they are not quotes,
 * and they are not what Imperial Edutech actually pays. Vendors change list
 * prices, currencies, bundling and seat models frequently.
 *
 * Before this database is used for any real budgeting, reporting or approval
 * decision, every figure must be replaced with the organisation's own invoiced
 * amounts, contract terms and renewal dates. Treat this seed as a shaped demo
 * of the application, not as a source of financial truth.
 *
 * The stored passwords are deliberately obvious dummies. Nothing in this file
 * is a real credential.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Run with:  npx tsx prisma/seed.ts
 * The script is idempotent — it clears the tables it owns before inserting.
 */

import 'dotenv/config';
import { DEPARTMENTS as CONFIG_DEPARTMENTS } from '../src/lib/organisation';

import { prisma } from '../src/lib/db';
import { encryptSecret } from '../src/lib/crypto';
import { hashPassword } from '../src/lib/auth';
import { nextChargeDate, round2 } from '../src/lib/money';
import type {
  AllocationMethod,
  BillingModel,
  CardType,
  Category,
  ChargeStatus,
  Criticality,
  CurrencyCode,
  Role,
  SubStatus,
} from '../src/lib/domain';

// ───────────────────────────────────────────────────────────── date helpers ──
// Everything is computed relative to the moment the seed runs, so the demo data
// stays meaningful (renewals still fall "next week") whenever it is re-run.

const NOW = new Date();

/** Same clock time on a day `n` days after now. Negative `n` goes backwards. */
function daysFromNow(n: number): Date {
  const d = new Date(NOW);
  d.setDate(d.getDate() + n);
  d.setHours(9, 0, 0, 0);
  return d;
}

function daysAgo(n: number): Date {
  return daysFromNow(-n);
}

/** Month arithmetic that clamps rather than overflowing (31 Jan − 1 month = 31 Dec, not 3 Mar). */
function addMonths(base: Date, n: number): Date {
  const d = new Date(base);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const lastDayOfTarget = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDayOfTarget));
  return d;
}

function monthsAgo(n: number): Date {
  const d = addMonths(NOW, -n);
  d.setHours(9, 0, 0, 0);
  return d;
}

/**
 * A specific day of the month `n` months ago, clamped to the month's length.
 * Price changes and card top-ups land on billing dates, not all on the same day,
 * so each one carries its own day rather than inheriting today's.
 */
function monthsAgoOnDay(n: number, day: number): Date {
  const base = addMonths(NOW, -n);
  const lastDay = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
  return new Date(base.getFullYear(), base.getMonth(), Math.min(day, lastDay), 9, 0, 0, 0);
}

/** First instant of the calendar month `n` months before the current one. */
function startOfMonthsAgo(n: number): Date {
  const d = addMonths(NOW, -n);
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

/** Last instant of the calendar month `n` months before the current one. */
function endOfMonthsAgo(n: number): Date {
  const d = addMonths(NOW, -n);
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

function invoiceRef(date: Date, seq: number): string {
  const ym = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`;
  return `INV-${ym}-${String(seq).padStart(4, '0')}`;
}

// ─────────────────────────────────────────────────────────────── seed types ──

type DeptCode = 'CDD' | 'ACAD' | 'MKTG' | 'SALES' | 'IT' | 'OPS' | 'FIN' | 'HR' | 'EXEC';
type CardKey = 'CORPORATE' | 'PREPAID_CREATIVE' | 'PREPAID_AI' | 'DIRECT_DEBIT' | 'INVOICE';

interface DepartmentSpec {
  code: DeptCode;
  name: string;
  colorHex: string;
  costCentre: string | null;
  headName: string | null;
  headEmail: string | null;
  headcount: number | null;
  sortOrder: number;
}

interface CardSpec {
  key: CardKey;
  label: string;
  last4: string;
  provider: string;
  type: CardType;
  holderName?: string;
  currency: CurrencyCode;
  currentBalance?: number;
  balanceUpdatedDaysAgo?: number;
  lowBalanceThreshold: number;
  expiryMonth?: number;
  expiryYear?: number;
  notes: string;
}

interface AllocationSpec {
  dept: DeptCode;
  percentage?: number;
  seats?: number;
  note?: string;
}

interface CostChangeSpec {
  monthsAgo: number;
  /** Day of the month the new price took effect — normally the vendor's billing day. */
  onDay: number;
  previousAmount: number;
  newAmount: number;
  reason: string;
  previousModel?: BillingModel;
  newModel?: BillingModel;
  recordedBy?: string;
}

interface UsageSpec {
  /** Calendar month, counted back from the current one. 1 = last complete month. */
  monthsAgo: number;
  units: number;
  amount: number;
  note?: string;
}

interface SubscriptionSpec {
  name: string;
  vendor: string;
  url?: string;
  category: Category;
  description: string;
  status?: SubStatus;
  criticality?: Criticality;

  // Access
  accountEmail?: string;
  username?: string;
  /** Obviously-fake sample password, stored via encryptSecret(). */
  samplePassword?: string;
  credentialLocation?: string;
  mfaNotes?: string;

  // Payment
  card?: CardKey;

  // Commercials
  billingModel: BillingModel;
  currency: CurrencyCode;
  unitAmount: number;
  seats?: number;
  perSeat?: boolean;

  // Usage / credit models
  usageUnitLabel?: string;
  usageRatePerUnit?: number;
  estimatedMonthlyUnits?: number;
  topUpAmount?: number;
  topUpThreshold?: number;
  creditBalance?: number;

  // Dates
  startMonthsAgo: number;
  renewalInDays?: number;
  contractEndInDays?: number;
  autoRenew?: boolean;
  noticePeriodDays?: number;
  cancellationUrl?: string;

  // Ownership
  allocationMethod: AllocationMethod;
  ownerDept: DeptCode;
  ownerName?: string;
  ownerEmail?: string;

  notes?: string;
  tags?: string[];

  allocations?: AllocationSpec[];
  costChanges?: CostChangeSpec[];
  usage?: UsageSpec[];
}

// ───────────────────────────────────────────────────────────── departments ──
// Colours are deliberately drawn from the non-red part of the palette: Imperial
// red (#DA291C) is reserved for brand chrome, so no department can claim it.

/**
 * Departments come from src/lib/organisation.ts — the one file the
 * organisation edits — so the demo data and the real setup can never disagree
 * about what the departments are.
 *
 * The only thing added here is an illustrative headcount, which the real config
 * deliberately leaves blank until someone supplies the true figures. Headcount
 * is used solely for the cost-per-person comparison.
 */
const DEMO_HEADCOUNT: Record<string, number> = {
  CDD: 14,
  ACAD: 11,
  MKTG: 8,
  SALES: 7,
  IT: 6,
  OPS: 9,
  FIN: 5,
  HR: 4,
  EXEC: 3,
};

const DEPARTMENTS: DepartmentSpec[] = CONFIG_DEPARTMENTS.map((d, i) => ({
  code: d.code as DeptCode,
  name: d.name,
  colorHex: d.colorHex,
  costCentre: d.costCentre,
  headName: d.headName,
  headEmail: d.headEmail,
  headcount: DEMO_HEADCOUNT[d.code] ?? null,
  sortOrder: (i + 1) * 10,
}));


// ─────────────────────────────────────────────────────────────────── cards ──
// Two prepaid cards carry a float and therefore drive the top-up alerting.
// "Creative Tools" is deliberately under-funded relative to the charges landing
// in the next 30 days, so the shortfall detection has something real to report;
// "AI & Experimentation" is comfortably funded for contrast.

const CARDS: CardSpec[] = [
  {
    key: 'CORPORATE',
    label: 'Barclaycard Corporate — Course Development',
    last4: '4417',
    provider: 'Visa',
    type: 'CORPORATE_CREDIT',
    holderName: 'Imperial Edutech Ltd',
    currency: 'GBP',
    lowBalanceThreshold: 0,
    expiryMonth: 9,
    expiryYear: NOW.getFullYear() + 2,
    notes: 'Credit limit of £15,000, not a float. Statement is settled monthly by Finance — no top-up required.',
  },
  {
    key: 'PREPAID_CREATIVE',
    label: 'Soldo Prepaid — Creative & Stock Media',
    last4: '8123',
    provider: 'Mastercard',
    type: 'PREPAID',
    holderName: 'Course Development (shared)',
    currency: 'GBP',
    currentBalance: 250,
    balanceUpdatedDaysAgo: 2,
    lowBalanceThreshold: 500,
    expiryMonth: 4,
    expiryYear: NOW.getFullYear() + 3,
    notes:
      'Float card used for stock media and asset libraries. Balance is currently well below the charges falling due in the next 30 days — a top-up is needed before the Adobe Stock and Storyblocks renewals.',
  },
  {
    key: 'PREPAID_AI',
    label: 'Soldo Prepaid — AI & Experimentation',
    last4: '2260',
    provider: 'Mastercard',
    type: 'PREPAID',
    holderName: 'Course Development (shared)',
    currency: 'GBP',
    currentBalance: 2400,
    balanceUpdatedDaysAgo: 1,
    lowBalanceThreshold: 600,
    expiryMonth: 11,
    expiryYear: NOW.getFullYear() + 2,
    notes:
      'Float card ring-fenced for AI credit top-ups so experimentation cannot overrun onto the corporate card. Topped up quarterly by Finance.',
  },
  {
    key: 'DIRECT_DEBIT',
    label: 'Direct Debit — Imperial Edutech current account',
    last4: '6042',
    provider: 'Direct Debit',
    type: 'DIRECT_DEBIT',
    holderName: 'Imperial Edutech Ltd',
    currency: 'GBP',
    lowBalanceThreshold: 0,
    notes: 'Collected automatically from the main current account. Used for enterprise agreements with fixed billing dates.',
  },
  {
    key: 'INVOICE',
    label: 'Accounts Payable — invoice / PO',
    last4: '0000',
    provider: 'Invoice',
    type: 'INVOICE',
    currency: 'GBP',
    lowBalanceThreshold: 0,
    notes: 'Billed on invoice against a purchase order and paid on 30-day terms by Finance & Operations.',
  },
];

// ──────────────────────────────────────────────────────────────── FX rates ──
// Rounded, plausible rates so multi-currency totals are demonstrable. These are
// NOT live rates — replace them with the rate your finance team books at.

const FX_SOURCE = "Illustrative sample rate — replace with your organisation's rate";

const FX_RATES: { code: CurrencyCode; rateToGbp: number }[] = [
  { code: 'USD', rateToGbp: 0.78 },
  { code: 'EUR', rateToGbp: 0.85 },
  { code: 'AUD', rateToGbp: 0.52 },
];

// ──────────────────────────────────────────────────────────── subscriptions ──
//
// Roughly half of these sit on OWNER_PAYS (Course Development carries the whole
// cost). The rest are split either by an agreed percentage or by seat count.
//
// NOTE ON "Canva Teams" BELOW: its percentage allocation deliberately sums to
// 95%, not 100%. Finance & Operations used to hold the missing 5%; when they
// stopped using Canva the line was deleted and nobody re-based the remaining
// shares. This is left in on purpose so the application's allocation
// reconciliation warning ("percentages sum to 95%, costs scaled proportionally")
// is visible in the demo data rather than being something you have to construct
// by hand. Real registers accumulate exactly this kind of drift.

const SUBSCRIPTIONS: SubscriptionSpec[] = [
  // ── AI tools ──────────────────────────────────────────────────────────────
  {
    name: 'ChatGPT Team',
    vendor: 'OpenAI',
    url: 'https://openai.com/chatgpt/team',
    category: 'AI_TOOLS',
    description: 'Shared workspace used for first-draft scripting, question-bank generation and rewriting to reading age.',
    criticality: 'HIGH',
    accountEmail: 'ai-tools@imperialedutech.co.uk',
    credentialLocation: '1Password — Course Dev vault',
    mfaNotes: 'MFA via the shared Authy account held by the Course Development Lead.',
    card: 'CORPORATE',
    billingModel: 'MONTHLY',
    currency: 'USD',
    unitAmount: 30,
    seats: 12,
    perSeat: true,
    startMonthsAgo: 15,
    renewalInDays: 5,
    autoRenew: true,
    noticePeriodDays: 0,
    allocationMethod: 'SEATS',
    ownerDept: 'CDD',
    ownerName: 'Priya Raghunathan',
    ownerEmail: 'priya.raghunathan@imperialedutech.co.uk',
    notes: 'Seat count reviewed each quarter. Two seats are currently unassigned and should be released at the next review.',
    tags: ['ai', 'writing', 'shared-seats'],
    allocations: [
      { dept: 'CDD', seats: 7, note: 'Course writers and the assessment team.' },
      { dept: 'ACAD', seats: 3 },
      { dept: 'MKTG', seats: 2, note: 'Campaign copy and landing page drafts.' },
    ],
    costChanges: [
      {
        monthsAgo: 11,
        onDay: 14,
        previousAmount: 25,
        newAmount: 30,
        reason: 'Switched from annual-commitment seats to month-to-month billing so seats can be released mid-year.',
        recordedBy: 'Priya Raghunathan',
      },
    ],
  },
  {
    name: 'Claude Team',
    vendor: 'Anthropic',
    url: 'https://www.anthropic.com/pricing',
    category: 'AI_TOOLS',
    description: 'Used for long-document work: reviewing full course specifications, accessibility rewrites and marking rubrics.',
    criticality: 'HIGH',
    accountEmail: 'ai-tools@imperialedutech.co.uk',
    samplePassword: 'SAMPLE-ONLY-Claude-Not-A-Real-Password-24',
    credentialLocation: '1Password — Course Dev vault',
    card: 'CORPORATE',
    billingModel: 'MONTHLY',
    currency: 'USD',
    unitAmount: 30,
    seats: 8,
    perSeat: true,
    startMonthsAgo: 8,
    renewalInDays: 12,
    autoRenew: true,
    allocationMethod: 'PERCENTAGE',
    ownerDept: 'CDD',
    ownerName: 'Priya Raghunathan',
    ownerEmail: 'priya.raghunathan@imperialedutech.co.uk',
    notes: 'Adopted after the long-context pilot in Q2. Split agreed with Learning Design and Marketing at the time of purchase.',
    tags: ['ai', 'writing', 'accessibility'],
    allocations: [
      { dept: 'CDD', percentage: 60 },
      { dept: 'ACAD', percentage: 25 },
      { dept: 'MKTG', percentage: 15 },
    ],
  },
  {
    name: 'Midjourney — Standard plan and fast hours',
    vendor: 'Midjourney',
    url: 'https://www.midjourney.com/account',
    category: 'AI_TOOLS',
    description: 'Course illustration and scenario artwork. Base plan plus fast-hour packs bought as needed during production sprints.',
    criticality: 'LOW',
    accountEmail: 'creative@imperialedutech.co.uk',
    samplePassword: 'SAMPLE-ONLY-Midjourney-Fake-Pw-7788',
    credentialLocation: '1Password — Course Dev vault',
    card: 'PREPAID_AI',
    billingModel: 'TOPUP_CREDIT',
    currency: 'USD',
    unitAmount: 60,
    topUpAmount: 60,
    topUpThreshold: 20,
    creditBalance: 24,
    startMonthsAgo: 20,
    renewalInDays: 16,
    autoRenew: true,
    allocationMethod: 'OWNER_PAYS',
    ownerDept: 'CDD',
    ownerName: 'Jonah Beckett',
    ownerEmail: 'jonah.beckett@imperialedutech.co.uk',
    notes: 'Spend is lumpy — it spikes in the month before a course launch and falls to the base plan in between.',
    tags: ['ai', 'imagery', 'variable-spend'],
    usage: [
      { monthsAgo: 6, units: 0, amount: 30, note: 'Base plan only — no fast hours needed.' },
      { monthsAgo: 5, units: 11, amount: 74, note: 'Illustration pass for the Level 3 Business suite.' },
      { monthsAgo: 4, units: 4, amount: 46 },
      { monthsAgo: 3, units: 0, amount: 30 },
      { monthsAgo: 2, units: 18, amount: 102, note: 'Scenario artwork for the safeguarding refresh.' },
      { monthsAgo: 1, units: 8, amount: 62 },
    ],
  },
  {
    name: 'ElevenLabs — Creator plus credit packs',
    vendor: 'ElevenLabs',
    url: 'https://elevenlabs.io/app/subscription',
    category: 'AI_TOOLS',
    description: 'Synthetic narration for module voice-overs and pronunciation examples in the ESOL courses.',
    criticality: 'MEDIUM',
    accountEmail: 'audio@imperialedutech.co.uk',
    samplePassword: 'SAMPLE-ONLY-ElevenLabs-Fake-Pw-4412',
    credentialLocation: '1Password — Course Dev vault',
    card: 'PREPAID_AI',
    billingModel: 'TOPUP_CREDIT',
    currency: 'USD',
    unitAmount: 99,
    topUpAmount: 99,
    topUpThreshold: 30,
    creditBalance: 41,
    startMonthsAgo: 16,
    renewalInDays: 21,
    autoRenew: true,
    allocationMethod: 'OWNER_PAYS',
    ownerDept: 'CDD',
    ownerName: 'Jonah Beckett',
    ownerEmail: 'jonah.beckett@imperialedutech.co.uk',
    notes: 'Voice cloning is switched off on this account by policy. All narration uses stock voices with a licence note in the course credits.',
    tags: ['ai', 'audio', 'narration'],
    costChanges: [
      {
        monthsAgo: 3,
        onDay: 6,
        previousAmount: 22,
        newAmount: 99,
        reason:
          'Vendor moved the account from a flat Creator subscription onto consumption-based credit packs. Monthly cost now tracks how much narration is produced and is materially higher in production months.',
        previousModel: 'MONTHLY',
        newModel: 'TOPUP_CREDIT',
        recordedBy: 'Priya Raghunathan',
      },
    ],
    usage: [
      { monthsAgo: 5, units: 104, amount: 22, note: 'Flat subscription month, before the pricing change. Units are thousands of characters.' },
      { monthsAgo: 4, units: 612, amount: 121 },
      { monthsAgo: 3, units: 108, amount: 22 },
      { monthsAgo: 2, units: 1140, amount: 220, note: 'Full re-record of the health and social care module after the script rewrite.' },
      { monthsAgo: 1, units: 598, amount: 121 },
    ],
  },
  {
    name: 'OpenAI API — platform credits',
    vendor: 'OpenAI',
    url: 'https://platform.openai.com/settings/organization/billing',
    category: 'AI_TOOLS',
    description: 'API credits behind the internal question-generator and the automated readability checker built by the IT team.',
    criticality: 'MEDIUM',
    accountEmail: 'platform@imperialedutech.co.uk',
    credentialLocation: '1Password — IT Infrastructure vault (API keys held separately in Azure Key Vault)',
    mfaNotes: 'Hardware key enforced on the owning account. API keys are rotated every 90 days.',
    card: 'PREPAID_AI',
    billingModel: 'TOPUP_CREDIT',
    currency: 'USD',
    unitAmount: 250,
    topUpAmount: 250,
    topUpThreshold: 50,
    creditBalance: 38,
    startMonthsAgo: 13,
    renewalInDays: 8,
    autoRenew: true,
    allocationMethod: 'OWNER_PAYS',
    ownerDept: 'CDD',
    ownerName: 'Sarah Whitcombe',
    ownerEmail: 'sarah.whitcombe@imperialedutech.co.uk',
    notes: 'Credit balance is below the top-up threshold. Auto-recharge is deliberately off so an unexpected loop cannot drain the card.',
    tags: ['ai', 'api', 'automation'],
    usage: [
      { monthsAgo: 8, units: 41, amount: 218.4, note: 'Units are millions of tokens consumed.' },
      { monthsAgo: 7, units: 38, amount: 241.1 },
      { monthsAgo: 6, units: 81, amount: 402.75, note: 'Bulk regeneration of question banks for the apprenticeship suite.' },
      { monthsAgo: 5, units: 45, amount: 233.6 },
      { monthsAgo: 4, units: 122, amount: 618.2, note: 'Readability pass across the whole back catalogue.' },
      { monthsAgo: 3, units: 40, amount: 259.4 },
      { monthsAgo: 2, units: 79, amount: 471.85 },
      { monthsAgo: 1, units: 44, amount: 227.3 },
    ],
  },
  {
    name: 'Synthesia — Creator',
    vendor: 'Synthesia',
    url: 'https://www.synthesia.io/pricing',
    category: 'AI_TOOLS',
    description: 'Presenter-led explainer videos in multiple languages without a studio booking.',
    criticality: 'MEDIUM',
    accountEmail: 'video@imperialedutech.co.uk',
    samplePassword: 'SAMPLE-ONLY-Synthesia-Fake-Pw-9013',
    credentialLocation: '1Password — Course Dev vault',
    card: 'CORPORATE',
    billingModel: 'ANNUAL',
    currency: 'USD',
    unitAmount: 768,
    seats: 2,
    startMonthsAgo: 22,
    renewalInDays: 64,
    autoRenew: true,
    noticePeriodDays: 30,
    allocationMethod: 'OWNER_PAYS',
    ownerDept: 'CDD',
    ownerName: 'Amara Nwosu',
    ownerEmail: 'amara.nwosu@imperialedutech.co.uk',
    notes: 'Minute allowance is close to being exhausted each year. Check consumption before the renewal rather than upgrading by reflex.',
    tags: ['ai', 'video', 'localisation'],
    costChanges: [
      {
        monthsAgo: 17,
        onDay: 21,
        previousAmount: 396,
        newAmount: 768,
        reason:
          'Vendor restructured onto per-editor pricing. The single shared login had to become two named editors, which roughly doubled the annual cost.',
        recordedBy: 'Mark Delaney',
      },
    ],
  },

  // ── Stock and media libraries ─────────────────────────────────────────────
  {
    name: 'Envato Elements',
    vendor: 'Envato',
    url: 'https://elements.envato.com',
    category: 'STOCK_MEDIA',
    description: 'Unlimited-download library for course templates, motion graphics, icons and background music.',
    criticality: 'MEDIUM',
    accountEmail: 'creative@imperialedutech.co.uk',
    samplePassword: 'SAMPLE-ONLY-Envato-Fake-Pw-3320',
    credentialLocation: '1Password — Course Dev vault',
    card: 'PREPAID_CREATIVE',
    billingModel: 'ANNUAL',
    currency: 'USD',
    unitAmount: 198,
    startMonthsAgo: 31,
    renewalInDays: 22,
    autoRenew: true,
    allocationMethod: 'OWNER_PAYS',
    ownerDept: 'CDD',
    ownerName: 'Jonah Beckett',
    ownerEmail: 'jonah.beckett@imperialedutech.co.uk',
    notes: 'Licence register is maintained per download in the shared asset log — required if a course is ever resold.',
    tags: ['stock', 'templates', 'licensing'],
    costChanges: [
      {
        monthsAgo: 13,
        onDay: 3,
        previousAmount: 180,
        newAmount: 198,
        reason: 'Annual plan list price increase applied at renewal.',
        recordedBy: 'Mark Delaney',
      },
    ],
  },
  {
    name: 'Adobe Stock — 40 assets per month',
    vendor: 'Adobe',
    url: 'https://stock.adobe.com/uk/plans',
    category: 'STOCK_MEDIA',
    description: 'Photography and vector assets for course pages and marketing collateral.',
    criticality: 'MEDIUM',
    accountEmail: 'creative@imperialedutech.co.uk',
    samplePassword: 'SAMPLE-ONLY-AdobeStock-Fake-Pw-5561',
    credentialLocation: '1Password — Course Dev vault',
    card: 'PREPAID_CREATIVE',
    billingModel: 'MONTHLY',
    currency: 'GBP',
    unitAmount: 69.99,
    startMonthsAgo: 26,
    renewalInDays: 4,
    autoRenew: true,
    noticePeriodDays: 14,
    allocationMethod: 'PERCENTAGE',
    ownerDept: 'CDD',
    ownerName: 'Jonah Beckett',
    ownerEmail: 'jonah.beckett@imperialedutech.co.uk',
    notes: 'Unused monthly assets roll over for one month only. Marketing draws heavily on this in campaign months.',
    tags: ['stock', 'imagery'],
    allocations: [
      { dept: 'CDD', percentage: 60 },
      { dept: 'MKTG', percentage: 25, note: 'Campaign and landing-page imagery.' },
      { dept: 'ACAD', percentage: 15 },
    ],
    costChanges: [
      {
        monthsAgo: 15,
        onDay: 2,
        previousAmount: 199.99,
        newAmount: 69.99,
        reason:
          'Downgraded from the 250-assets-per-month plan to 40 after six months of usage data showed fewer than 30 downloads a month.',
        recordedBy: 'Priya Raghunathan',
      },
    ],
  },
  {
    name: 'Freepik Premium+',
    vendor: 'Freepik Company',
    url: 'https://www.freepik.com/pricing',
    category: 'STOCK_MEDIA',
    description: 'Vector illustration and editable infographic templates, billed in euros.',
    criticality: 'LOW',
    accountEmail: 'creative@imperialedutech.co.uk',
    samplePassword: 'SAMPLE-ONLY-Freepik-Fake-Pw-1187',
    credentialLocation: '1Password — Course Dev vault',
    card: 'PREPAID_CREATIVE',
    billingModel: 'ANNUAL',
    currency: 'EUR',
    unitAmount: 143.88,
    startMonthsAgo: 19,
    renewalInDays: 26,
    autoRenew: true,
    allocationMethod: 'OWNER_PAYS',
    ownerDept: 'CDD',
    ownerName: 'Jonah Beckett',
    ownerEmail: 'jonah.beckett@imperialedutech.co.uk',
    notes: 'Billed in EUR, so the sterling cost moves with the exchange rate. Overlaps with Envato Elements — review at renewal.',
    tags: ['stock', 'illustration', 'overlap-review'],
  },
  {
    name: 'Storyblocks — Unlimited All Access',
    vendor: 'Storyblocks',
    url: 'https://www.storyblocks.com/pricing',
    category: 'STOCK_MEDIA',
    description: 'Stock video, motion backgrounds and sound effects for module intros and scenario footage.',
    criticality: 'MEDIUM',
    accountEmail: 'video@imperialedutech.co.uk',
    samplePassword: 'SAMPLE-ONLY-Storyblocks-Fake-Pw-6604',
    credentialLocation: '1Password — Course Dev vault',
    card: 'PREPAID_CREATIVE',
    billingModel: 'ANNUAL',
    currency: 'USD',
    unitAmount: 588,
    startMonthsAgo: 23,
    renewalInDays: 19,
    autoRenew: true,
    noticePeriodDays: 30,
    allocationMethod: 'OWNER_PAYS',
    ownerDept: 'CDD',
    ownerName: 'Amara Nwosu',
    ownerEmail: 'amara.nwosu@imperialedutech.co.uk',
    notes: 'Downloads are perpetually licensed, so cancelling does not invalidate assets already used in published courses.',
    tags: ['stock', 'video', 'audio'],
    costChanges: [
      {
        monthsAgo: 7,
        onDay: 17,
        previousAmount: 468,
        newAmount: 588,
        reason: 'Upgraded from Video Unlimited to Unlimited All Access so the audio and template libraries were included.',
        recordedBy: 'Amara Nwosu',
      },
    ],
  },

  // ── Design ────────────────────────────────────────────────────────────────
  {
    name: 'Adobe Creative Cloud — All Apps (Teams)',
    vendor: 'Adobe',
    url: 'https://www.adobe.com/uk/creativecloud/business/teams.html',
    category: 'DESIGN',
    description: 'Photoshop, Illustrator, InDesign, After Effects and Premiere Pro for the production team.',
    criticality: 'CRITICAL',
    accountEmail: 'adobe-admin@imperialedutech.co.uk',
    credentialLocation: 'Entra ID single sign-on — no shared password. Licences assigned in the Adobe Admin Console.',
    mfaNotes: 'Console access is restricted to the Adobe admin group and enforced through Entra ID conditional access.',
    card: 'DIRECT_DEBIT',
    billingModel: 'ANNUAL',
    currency: 'GBP',
    unitAmount: 620,
    seats: 9,
    perSeat: true,
    startMonthsAgo: 40,
    renewalInDays: 47,
    autoRenew: true,
    noticePeriodDays: 30,
    allocationMethod: 'SEATS',
    ownerDept: 'CDD',
    ownerName: 'Priya Raghunathan',
    ownerEmail: 'priya.raghunathan@imperialedutech.co.uk',
    notes:
      'Single largest design commitment. Seat reassignment requires an Adobe Admin Console change, so leavers must be processed within the notice window or the seat is billed for another year.',
    tags: ['design', 'core-tooling', 'sso'],
    allocations: [
      { dept: 'CDD', seats: 5, note: 'Media producers and the graphics lead.' },
      { dept: 'ACAD', seats: 3 },
      { dept: 'MKTG', seats: 1 },
    ],
    costChanges: [
      {
        monthsAgo: 16,
        onDay: 12,
        previousAmount: 545,
        newAmount: 575,
        reason: 'Adobe list price increase applied at the annual renewal.',
        recordedBy: 'Mark Delaney',
      },
      {
        monthsAgo: 4,
        onDay: 12,
        previousAmount: 575,
        newAmount: 620,
        reason: 'Renewal uplift, plus a move to the All Apps plan for the two instructional designers who previously had single-app licences.',
        recordedBy: 'Mark Delaney',
      },
    ],
  },
  {
    name: 'Figma — Professional',
    vendor: 'Figma',
    url: 'https://www.figma.com/pricing',
    category: 'DESIGN',
    description: 'Wireframing course interfaces, storyboard boards and the shared component library for course templates.',
    criticality: 'MEDIUM',
    accountEmail: 'design@imperialedutech.co.uk',
    credentialLocation: 'Google Workspace single sign-on — no shared password.',
    card: 'CORPORATE',
    billingModel: 'MONTHLY',
    currency: 'USD',
    unitAmount: 15,
    seats: 6,
    perSeat: true,
    startMonthsAgo: 28,
    renewalInDays: 9,
    autoRenew: true,
    allocationMethod: 'SEATS',
    ownerDept: 'CDD',
    ownerName: 'Tom Aldridge',
    ownerEmail: 'tom.aldridge@imperialedutech.co.uk',
    notes: 'Viewer accounts are free and unlimited — only editors are billed. Check for editors who only ever comment.',
    tags: ['design', 'collaboration', 'seat-review'],
    allocations: [
      { dept: 'CDD', seats: 3 },
      { dept: 'ACAD', seats: 2 },
      { dept: 'MKTG', seats: 1 },
    ],
    costChanges: [
      {
        monthsAgo: 9,
        onDay: 8,
        previousAmount: 12,
        newAmount: 15,
        reason: 'Editor seats repriced when the vendor restructured its seat types.',
        recordedBy: 'Tom Aldridge',
      },
    ],
  },
  {
    name: 'Canva Teams',
    vendor: 'Canva',
    url: 'https://www.canva.com/pricing',
    category: 'DESIGN',
    description: 'Quick-turnaround handouts, social tiles and certificate templates for staff who do not use Creative Cloud.',
    criticality: 'LOW',
    accountEmail: 'design@imperialedutech.co.uk',
    credentialLocation: '1Password — Course Dev vault',
    card: 'CORPORATE',
    billingModel: 'ANNUAL',
    currency: 'GBP',
    unitAmount: 408,
    seats: 4,
    startMonthsAgo: 21,
    renewalInDays: 81,
    autoRenew: true,
    allocationMethod: 'PERCENTAGE',
    ownerDept: 'CDD',
    ownerName: 'Elena Marchetti',
    ownerEmail: 'elena.marchetti@imperialedutech.co.uk',
    notes:
      'The recorded split sums to 95%, not 100%. Finance & Operations previously held 5% and their line was removed when they stopped using Canva, without re-basing the remaining shares. Left as-is so the reconciliation warning is visible — re-agree the split at the next renewal.',
    tags: ['design', 'self-serve', 'allocation-drift'],
    allocations: [
      { dept: 'CDD', percentage: 55 },
      { dept: 'MKTG', percentage: 25 },
      { dept: 'SALES', percentage: 15, note: 'Partner-facing one-pagers.' },
    ],
    costChanges: [
      {
        monthsAgo: 9,
        onDay: 25,
        previousAmount: 359.88,
        newAmount: 408,
        reason: 'Annual price increase plus one additional seat for the partnerships team.',
        recordedBy: 'Mark Delaney',
      },
    ],
  },

  // ── Video and audio ───────────────────────────────────────────────────────
  {
    name: 'Camtasia 2025 — perpetual licences (3)',
    vendor: 'TechSmith',
    url: 'https://www.techsmith.com/camtasia',
    category: 'VIDEO_AUDIO',
    description: 'Screen recording and screencast editing for software walkthroughs. Bought outright rather than subscribed.',
    criticality: 'MEDIUM',
    accountEmail: 'video@imperialedutech.co.uk',
    credentialLocation: '1Password — Course Dev vault (licence keys stored as secure notes)',
    card: 'INVOICE',
    billingModel: 'ONE_OFF',
    currency: 'USD',
    unitAmount: 899.97,
    seats: 3,
    startMonthsAgo: 5,
    autoRenew: false,
    allocationMethod: 'OWNER_PAYS',
    ownerDept: 'CDD',
    ownerName: 'Amara Nwosu',
    ownerEmail: 'amara.nwosu@imperialedutech.co.uk',
    notes:
      'Perpetual licences, so there is no renewal. Maintenance and major-version upgrades are chargeable — budget for a refresh roughly every two years.',
    tags: ['video', 'perpetual-licence', 'capex'],
  },
  {
    name: 'Descript — Pro',
    vendor: 'Descript',
    url: 'https://www.descript.com/pricing',
    category: 'VIDEO_AUDIO',
    description: 'Transcript-based video editing, filler-word removal and studio-sound cleanup for talking-head recordings.',
    criticality: 'MEDIUM',
    accountEmail: 'video@imperialedutech.co.uk',
    credentialLocation: '1Password — Course Dev vault',
    card: 'CORPORATE',
    billingModel: 'MONTHLY',
    currency: 'USD',
    unitAmount: 48,
    seats: 2,
    startMonthsAgo: 14,
    renewalInDays: 14,
    autoRenew: true,
    allocationMethod: 'OWNER_PAYS',
    ownerDept: 'CDD',
    ownerName: 'Amara Nwosu',
    ownerEmail: 'amara.nwosu@imperialedutech.co.uk',
    notes: 'Overlaps with Camtasia for simple edits. Kept because the transcript-first workflow is materially faster for interview footage.',
    tags: ['video', 'editing'],
    costChanges: [
      {
        monthsAgo: 5,
        onDay: 19,
        previousAmount: 30,
        newAmount: 48,
        reason: 'Second editor seat added when video production moved in-house.',
        recordedBy: 'Amara Nwosu',
      },
    ],
  },
  {
    name: 'Epidemic Sound — Commercial',
    vendor: 'Epidemic Sound',
    url: 'https://www.epidemicsound.com/pricing',
    category: 'VIDEO_AUDIO',
    description: 'Cleared background music and sound design for course videos and the marketing channel.',
    criticality: 'MEDIUM',
    accountEmail: 'audio@imperialedutech.co.uk',
    samplePassword: 'SAMPLE-ONLY-Epidemic-Fake-Pw-7742',
    credentialLocation: '1Password — Course Dev vault',
    card: 'PREPAID_CREATIVE',
    billingModel: 'ANNUAL',
    currency: 'USD',
    unitAmount: 599.88,
    startMonthsAgo: 18,
    renewalInDays: 73,
    autoRenew: true,
    noticePeriodDays: 30,
    allocationMethod: 'OWNER_PAYS',
    ownerDept: 'CDD',
    ownerName: 'Amara Nwosu',
    ownerEmail: 'amara.nwosu@imperialedutech.co.uk',
    notes: 'The Commercial tier is required because courses are sold rather than used internally. Downgrading would invalidate existing usage.',
    tags: ['audio', 'music', 'licensing'],
    costChanges: [
      {
        monthsAgo: 6,
        onDay: 11,
        previousAmount: 431.88,
        newAmount: 599.88,
        reason:
          'Moved from the Personal plan to the Commercial plan. This became mandatory once courses were sold to external clients rather than delivered internally.',
        recordedBy: 'Mark Delaney',
      },
    ],
  },
  {
    name: 'Rev — captioning and transcription',
    vendor: 'Rev.com',
    url: 'https://www.rev.com/pricing',
    category: 'VIDEO_AUDIO',
    description: 'Human-verified captions and transcripts, used where automated captions do not meet the accessibility standard.',
    criticality: 'HIGH',
    accountEmail: 'accessibility@imperialedutech.co.uk',
    credentialLocation: '1Password — Course Dev vault',
    card: 'INVOICE',
    billingModel: 'PAY_PER_USE',
    currency: 'USD',
    unitAmount: 240,
    usageUnitLabel: 'minute of finished video',
    usageRatePerUnit: 1.99,
    estimatedMonthlyUnits: 130,
    startMonthsAgo: 24,
    renewalInDays: 30,
    autoRenew: true,
    allocationMethod: 'OWNER_PAYS',
    ownerDept: 'CDD',
    ownerName: 'Priya Raghunathan',
    ownerEmail: 'priya.raghunathan@imperialedutech.co.uk',
    notes:
      'Directly tied to accessibility compliance, so it cannot simply be cut. Cost falls when scripts are captioned at source rather than after edit.',
    tags: ['accessibility', 'captions', 'variable-spend'],
    usage: [
      { monthsAgo: 6, units: 96, amount: 191.04 },
      { monthsAgo: 5, units: 142, amount: 282.58 },
      { monthsAgo: 4, units: 118, amount: 234.82 },
      { monthsAgo: 3, units: 165, amount: 328.35, note: 'Backlog of legacy modules re-captioned to the new standard.' },
      { monthsAgo: 2, units: 203, amount: 403.97 },
      { monthsAgo: 1, units: 131, amount: 260.69 },
    ],
  },
  {
    name: 'Vyond Professional — evaluation',
    vendor: 'Vyond',
    url: 'https://www.vyond.com/pricing',
    category: 'VIDEO_AUDIO',
    description: 'Animated scenario videos for compliance training. Currently on a paid evaluation before a decision is taken.',
    status: 'TRIAL',
    criticality: 'LOW',
    accountEmail: 'video@imperialedutech.co.uk',
    credentialLocation: '1Password — Course Dev vault',
    card: 'CORPORATE',
    billingModel: 'ANNUAL',
    currency: 'USD',
    unitAmount: 999,
    startMonthsAgo: 1,
    renewalInDays: 6,
    autoRenew: false,
    noticePeriodDays: 0,
    allocationMethod: 'OWNER_PAYS',
    ownerDept: 'CDD',
    ownerName: 'Amara Nwosu',
    ownerEmail: 'amara.nwosu@imperialedutech.co.uk',
    notes:
      'Evaluation ends on the renewal date. Auto-renew is off, so the account lapses unless someone acts — a decision is needed this week, not a reminder next month.',
    tags: ['trial', 'animation', 'decision-due'],
  },

  // ── eLearning authoring ───────────────────────────────────────────────────
  {
    name: 'Articulate 360 Teams',
    vendor: 'Articulate',
    url: 'https://www.articulate.com/360/pricing',
    category: 'ELEARNING_AUTHORING',
    description: 'Storyline and Rise, the primary authoring toolchain for every SCORM package the department ships.',
    criticality: 'CRITICAL',
    accountEmail: 'authoring@imperialedutech.co.uk',
    credentialLocation: 'Entra ID single sign-on — seats assigned in the Articulate team console.',
    mfaNotes: 'SSO enforced. Team console access limited to the Course Development Lead and IT.',
    card: 'INVOICE',
    billingModel: 'ANNUAL',
    currency: 'USD',
    unitAmount: 1499,
    seats: 6,
    perSeat: true,
    startMonthsAgo: 44,
    renewalInDays: 38,
    autoRenew: true,
    noticePeriodDays: 30,
    allocationMethod: 'SEATS',
    ownerDept: 'CDD',
    ownerName: 'Priya Raghunathan',
    ownerEmail: 'priya.raghunathan@imperialedutech.co.uk',
    notes:
      'The largest single line in the register and the hardest to replace — every published course is a Storyline or Rise source file. Negotiate at renewal rather than assuming the quoted uplift.',
    tags: ['authoring', 'core-tooling', 'scorm', 'negotiate'],
    allocations: [
      { dept: 'CDD', seats: 4, note: 'Four full authoring seats.' },
      { dept: 'ACAD', seats: 2 },
    ],
    costChanges: [
      {
        monthsAgo: 14,
        onDay: 5,
        previousAmount: 1299,
        newAmount: 1399,
        reason: 'List price increase at the annual renewal.',
        recordedBy: 'Mark Delaney',
      },
      {
        monthsAgo: 2,
        onDay: 5,
        previousAmount: 1399,
        newAmount: 1499,
        reason: 'Renewal uplift after the Teams plan was repriced. No additional seats were taken.',
        recordedBy: 'Mark Delaney',
      },
    ],
  },
  {
    name: 'iSpring Suite Max',
    vendor: 'iSpring Solutions',
    url: 'https://www.ispringsolutions.com/ispring-suite/pricing',
    category: 'ELEARNING_AUTHORING',
    description: 'PowerPoint-based authoring, used by subject-matter experts who do not author in Storyline.',
    status: 'PAUSED',
    criticality: 'LOW',
    accountEmail: 'authoring@imperialedutech.co.uk',
    credentialLocation: '1Password — Course Dev vault',
    card: 'INVOICE',
    billingModel: 'ANNUAL',
    currency: 'USD',
    unitAmount: 1940,
    seats: 2,
    startMonthsAgo: 29,
    renewalInDays: 58,
    autoRenew: false,
    noticePeriodDays: 30,
    allocationMethod: 'OWNER_PAYS',
    ownerDept: 'CDD',
    ownerName: 'Priya Raghunathan',
    ownerEmail: 'priya.raghunathan@imperialedutech.co.uk',
    notes:
      'Paused pending a decision on overlap with Articulate 360. Two authors used it four times in the last year. Recommendation is to let it lapse unless the SME workflow changes.',
    tags: ['authoring', 'overlap-review', 'candidate-for-cancellation'],
  },
  {
    name: 'H5P — self-hosted (open source)',
    vendor: 'H5P Group',
    url: 'https://h5p.org',
    category: 'ELEARNING_AUTHORING',
    description: 'Interactive content types embedded in Moodle. Self-hosted through the Moodle plugin, so there is no licence fee.',
    criticality: 'MEDIUM',
    accountEmail: 'authoring@imperialedutech.co.uk',
    credentialLocation: 'No separate account — authored inside Moodle with existing Moodle credentials.',
    billingModel: 'FREE',
    currency: 'GBP',
    unitAmount: 0,
    startMonthsAgo: 33,
    autoRenew: false,
    allocationMethod: 'OWNER_PAYS',
    ownerDept: 'CDD',
    ownerName: 'Tom Aldridge',
    ownerEmail: 'tom.aldridge@imperialedutech.co.uk',
    notes:
      'Free of licence cost but not free of cost — it consumes IT time for plugin upgrades and rides on the Moodle hosting bill. Tracked here for visibility, not for spend.',
    tags: ['open-source', 'interactive', 'no-cost'],
  },

  // ── LMS and delivery ──────────────────────────────────────────────────────
  {
    name: 'Moodle Workplace — managed hosting',
    vendor: 'Titus Learning',
    url: 'https://tituslearning.com',
    category: 'LMS',
    description: 'The production learning platform: managed hosting, upgrades, backups and support for every live cohort.',
    criticality: 'CRITICAL',
    accountEmail: 'lms-admin@imperialedutech.co.uk',
    credentialLocation: 'Entra ID single sign-on. Break-glass admin account held in 1Password — IT Infrastructure vault.',
    mfaNotes: 'Break-glass account is MFA-protected and its use is logged and reviewed monthly.',
    card: 'INVOICE',
    billingModel: 'QUARTERLY',
    currency: 'GBP',
    unitAmount: 2250,
    startMonthsAgo: 38,
    renewalInDays: 33,
    contractEndInDays: 400,
    autoRenew: true,
    noticePeriodDays: 90,
    allocationMethod: 'PERCENTAGE',
    ownerDept: 'CDD',
    ownerName: 'Sarah Whitcombe',
    ownerEmail: 'sarah.whitcombe@imperialedutech.co.uk',
    notes:
      'Single point of failure for delivery. The 90-day notice period means any decision to move platform has to be taken a full quarter before the contract end date.',
    tags: ['lms', 'critical-path', 'long-notice'],
    allocations: [
      { dept: 'CDD', percentage: 45, note: 'Course build and content hosting.' },
      { dept: 'ACAD', percentage: 30 },
      { dept: 'SALES', percentage: 15, note: 'Client-facing cohorts and partner tenancies.' },
      { dept: 'IT', percentage: 10 },
    ],
    costChanges: [
      {
        monthsAgo: 12,
        onDay: 30,
        previousAmount: 1950,
        newAmount: 2250,
        reason: 'Moved to the higher-availability hosting tier ahead of the September intake after two peak-load incidents.',
        recordedBy: 'Sarah Whitcombe',
      },
    ],
  },

  // ── Productivity ──────────────────────────────────────────────────────────
  {
    name: 'Microsoft 365 Business Premium',
    vendor: 'Microsoft',
    url: 'https://www.microsoft.com/en-gb/microsoft-365/business',
    category: 'PRODUCTIVITY',
    description: 'Office apps, Exchange, SharePoint, Teams and Intune device management across the content teams.',
    criticality: 'CRITICAL',
    accountEmail: 'it-admin@imperialedutech.co.uk',
    credentialLocation: 'Entra ID — privileged access managed by IT & Infrastructure.',
    mfaNotes: 'Conditional access with MFA enforced on all accounts. Global admin roles are PIM-eligible only.',
    card: 'DIRECT_DEBIT',
    billingModel: 'ANNUAL',
    currency: 'GBP',
    unitAmount: 4344,
    seats: 20,
    startMonthsAgo: 46,
    renewalInDays: 112,
    autoRenew: true,
    noticePeriodDays: 30,
    allocationMethod: 'PERCENTAGE',
    ownerDept: 'CDD',
    ownerName: 'Sarah Whitcombe',
    ownerEmail: 'sarah.whitcombe@imperialedutech.co.uk',
    notes: 'This register covers the 20 licences charged to the content teams only. The wider organisational tenancy is tracked separately by IT.',
    tags: ['productivity', 'core-tooling', 'sso'],
    allocations: [
      { dept: 'CDD', percentage: 45 },
      { dept: 'ACAD', percentage: 30 },
      { dept: 'MKTG', percentage: 15 },
      { dept: 'IT', percentage: 10, note: 'Admin and service accounts.' },
    ],
    costChanges: [
      {
        monthsAgo: 10,
        onDay: 16,
        previousAmount: 3690,
        newAmount: 4344,
        reason: 'Annual price adjustment combined with four additional licences for the expanded learning design team.',
        recordedBy: 'Mark Delaney',
      },
    ],
  },
  {
    name: 'Grammarly Business',
    vendor: 'Grammarly',
    url: 'https://www.grammarly.com/business',
    category: 'PRODUCTIVITY',
    description: 'Style and tone checking across course copy. Not renewed — the editorial checks in Microsoft 365 were judged sufficient.',
    status: 'CANCELLED',
    criticality: 'LOW',
    accountEmail: 'editorial@imperialedutech.co.uk',
    credentialLocation: '1Password — Course Dev vault (account closed, entry retained for audit)',
    card: 'INVOICE',
    billingModel: 'ANNUAL',
    currency: 'USD',
    unitAmount: 1080,
    seats: 6,
    startMonthsAgo: 27,
    renewalInDays: -34,
    contractEndInDays: -34,
    autoRenew: false,
    allocationMethod: 'PERCENTAGE',
    ownerDept: 'CDD',
    ownerName: 'Priya Raghunathan',
    ownerEmail: 'priya.raghunathan@imperialedutech.co.uk',
    notes:
      'Cancelled at the last renewal. Retained in the register so the saving is visible in the trend and so nobody re-purchases it without checking why it was dropped.',
    tags: ['cancelled', 'saving-realised'],
    allocations: [
      { dept: 'CDD', percentage: 70 },
      { dept: 'MKTG', percentage: 30 },
    ],
  },

  // ── Collaboration ─────────────────────────────────────────────────────────
  {
    name: 'Zoom Workplace Business',
    vendor: 'Zoom',
    url: 'https://zoom.us/pricing',
    category: 'COLLABORATION',
    description: 'Live delivery sessions, SME interviews and partner webinars. Billed quarterly through the reseller agreement.',
    criticality: 'HIGH',
    accountEmail: 'it-admin@imperialedutech.co.uk',
    credentialLocation: 'Entra ID single sign-on — licences assigned in the Zoom admin portal.',
    card: 'DIRECT_DEBIT',
    billingModel: 'QUARTERLY',
    currency: 'GBP',
    unitAmount: 449.64,
    seats: 12,
    startMonthsAgo: 35,
    renewalInDays: 55,
    autoRenew: true,
    noticePeriodDays: 30,
    allocationMethod: 'SEATS',
    ownerDept: 'CDD',
    ownerName: 'Sarah Whitcombe',
    ownerEmail: 'sarah.whitcombe@imperialedutech.co.uk',
    notes: 'Recording storage is the constraint, not the licence count. Old session recordings are archived to SharePoint after 90 days.',
    tags: ['collaboration', 'live-delivery'],
    allocations: [
      { dept: 'CDD', seats: 5 },
      { dept: 'ACAD', seats: 3 },
      { dept: 'SALES', seats: 2, note: 'Partner demonstrations.' },
      { dept: 'MKTG', seats: 2 },
    ],
    costChanges: [
      {
        monthsAgo: 8,
        onDay: 23,
        previousAmount: 539.64,
        newAmount: 449.64,
        reason: 'Reduced from 15 licences to 12 at renewal after two leavers and one dormant account were identified in the seat review.',
        recordedBy: 'Sarah Whitcombe',
      },
    ],
  },

  // ── Development ───────────────────────────────────────────────────────────
  {
    name: 'GitHub Team',
    vendor: 'GitHub',
    url: 'https://github.com/pricing',
    category: 'DEVELOPMENT',
    description: 'Source control for the SCORM wrapper, the xAPI adapters and the internal course-build scripts.',
    criticality: 'MEDIUM',
    accountEmail: 'dev@imperialedutech.co.uk',
    credentialLocation: '1Password — IT Infrastructure vault',
    mfaNotes: 'Organisation-wide MFA requirement is enabled. Personal access tokens expire after 90 days.',
    card: 'CORPORATE',
    billingModel: 'MONTHLY',
    currency: 'USD',
    unitAmount: 24,
    seats: 6,
    startMonthsAgo: 30,
    renewalInDays: 24,
    autoRenew: true,
    allocationMethod: 'OWNER_PAYS',
    ownerDept: 'CDD',
    ownerName: 'Sarah Whitcombe',
    ownerEmail: 'sarah.whitcombe@imperialedutech.co.uk',
    notes: 'Small line, but it holds the only copy of the build tooling. Backups of the organisation are taken weekly to Azure Storage.',
    tags: ['development', 'source-control'],
  },

  // ── Hosting and infrastructure ────────────────────────────────────────────
  {
    name: 'Vercel Pro',
    vendor: 'Vercel',
    url: 'https://vercel.com/pricing',
    category: 'HOSTING_INFRA',
    description: 'Hosting for the course preview environment and the internal subscription register itself.',
    criticality: 'MEDIUM',
    accountEmail: 'dev@imperialedutech.co.uk',
    credentialLocation: '1Password — IT Infrastructure vault',
    card: 'DIRECT_DEBIT',
    billingModel: 'MONTHLY',
    currency: 'USD',
    unitAmount: 60,
    seats: 3,
    startMonthsAgo: 11,
    renewalInDays: 27,
    autoRenew: true,
    allocationMethod: 'SEATS',
    ownerDept: 'CDD',
    ownerName: 'Sarah Whitcombe',
    ownerEmail: 'sarah.whitcombe@imperialedutech.co.uk',
    notes: 'Bandwidth overage is billed on top of the seat price. Watch the usage dashboard in the month a new course launches.',
    tags: ['hosting', 'internal-tools'],
    allocations: [
      { dept: 'CDD', seats: 2 },
      { dept: 'IT', seats: 1 },
    ],
  },
  {
    name: 'Amazon Web Services — media delivery',
    vendor: 'Amazon Web Services',
    url: 'https://aws.amazon.com',
    category: 'HOSTING_INFRA',
    description: 'S3 storage and CloudFront delivery for course video, plus MediaConvert transcoding on upload.',
    criticality: 'HIGH',
    accountEmail: 'aws-billing@imperialedutech.co.uk',
    credentialLocation: 'AWS IAM Identity Center via Entra ID. Root account credentials sealed in the IT safe.',
    mfaNotes: 'Root account MFA held on a hardware key in the office safe. All human access is federated and time-limited.',
    card: 'INVOICE',
    billingModel: 'PAY_PER_USE',
    currency: 'USD',
    unitAmount: 220,
    usageUnitLabel: 'GB delivered',
    usageRatePerUnit: 0.085,
    estimatedMonthlyUnits: 2600,
    startMonthsAgo: 34,
    renewalInDays: 12,
    autoRenew: true,
    allocationMethod: 'PERCENTAGE',
    ownerDept: 'CDD',
    ownerName: 'Sarah Whitcombe',
    ownerEmail: 'sarah.whitcombe@imperialedutech.co.uk',
    notes:
      'Bill tracks enrolment, so it rises in September and January. Reserved capacity is not worth it at this volume — review again above roughly 5 TB a month.',
    tags: ['hosting', 'variable-spend', 'seasonal'],
    allocations: [
      { dept: 'CDD', percentage: 55 },
      { dept: 'IT', percentage: 30 },
      { dept: 'ACAD', percentage: 15 },
    ],
    usage: [
      { monthsAgo: 8, units: 1980, amount: 168.3 },
      { monthsAgo: 7, units: 2240, amount: 190.4 },
      { monthsAgo: 6, units: 2610, amount: 221.85 },
      { monthsAgo: 5, units: 3120, amount: 265.2, note: 'Intake month — enrolment peak.' },
      { monthsAgo: 4, units: 2870, amount: 243.95 },
      { monthsAgo: 3, units: 2450, amount: 208.25 },
      { monthsAgo: 2, units: 2760, amount: 234.6 },
      { monthsAgo: 1, units: 3340, amount: 283.9, note: 'Second intake plus the back-catalogue re-encode.' },
    ],
  },

  // ── Data and analytics ────────────────────────────────────────────────────
  {
    name: 'Microsoft Power BI Pro',
    vendor: 'Microsoft',
    url: 'https://www.microsoft.com/en-gb/power-platform/products/power-bi/pricing',
    category: 'DATA_ANALYTICS',
    description: 'Completion, engagement and cohort-progress dashboards built on the Moodle data export.',
    criticality: 'MEDIUM',
    accountEmail: 'it-admin@imperialedutech.co.uk',
    credentialLocation: 'Entra ID — licences assigned in the Microsoft 365 admin centre.',
    card: 'DIRECT_DEBIT',
    billingModel: 'MONTHLY',
    currency: 'GBP',
    unitAmount: 32.8,
    seats: 4,
    startMonthsAgo: 17,
    renewalInDays: 11,
    autoRenew: true,
    allocationMethod: 'PERCENTAGE',
    ownerDept: 'CDD',
    ownerName: 'Mark Delaney',
    ownerEmail: 'mark.delaney@imperialedutech.co.uk',
    notes: 'Four authoring licences. Report consumers read published reports through the free viewer, so no additional licences are needed.',
    tags: ['analytics', 'reporting'],
    allocations: [
      { dept: 'CDD', percentage: 50 },
      { dept: 'FIN', percentage: 30, note: 'Cost and margin reporting.' },
      { dept: 'SALES', percentage: 20 },
    ],
  },

  // ── Research and reference ────────────────────────────────────────────────
  {
    name: 'Statista — Business Account',
    vendor: 'Statista',
    url: 'https://www.statista.com/accounts',
    category: 'RESEARCH',
    description: 'Sector statistics and labour-market data used to evidence course content and business cases for new programmes.',
    criticality: 'LOW',
    accountEmail: 'research@imperialedutech.co.uk',
    credentialLocation: '1Password — Course Dev vault',
    card: 'INVOICE',
    billingModel: 'ANNUAL',
    currency: 'USD',
    unitAmount: 2388,
    seats: 1,
    startMonthsAgo: 25,
    renewalInDays: 142,
    autoRenew: true,
    noticePeriodDays: 60,
    allocationMethod: 'OWNER_PAYS',
    ownerDept: 'CDD',
    ownerName: 'Priya Raghunathan',
    ownerEmail: 'priya.raghunathan@imperialedutech.co.uk',
    notes:
      'Single seat, shared by request through the research mailbox. Login count last year was 41 — worth testing against the free tier plus library access before the next renewal.',
    tags: ['research', 'low-usage', 'review'],
  },
];

// ────────────────────────────────────────────────────── card top-up history ──

interface TopUpSpec {
  card: CardKey;
  monthsAgo: number;
  onDay: number;
  amount: number;
  requestedBy: string;
  approvedBy: string;
  note: string;
}

const TOP_UPS: TopUpSpec[] = [
  // Creative & stock media float — topped up reactively, which is why it keeps
  // running short.
  { card: 'PREPAID_CREATIVE', monthsAgo: 6, onDay: 12, amount: 750, requestedBy: 'Jonah Beckett', approvedBy: 'Mark Delaney', note: 'Quarterly float top-up.' },
  { card: 'PREPAID_CREATIVE', monthsAgo: 5, onDay: 9, amount: 500, requestedBy: 'Jonah Beckett', approvedBy: 'Mark Delaney', note: 'Storyblocks annual renewal cover.' },
  { card: 'PREPAID_CREATIVE', monthsAgo: 4, onDay: 15, amount: 750, requestedBy: 'Amara Nwosu', approvedBy: 'Mark Delaney', note: 'Quarterly float top-up.' },
  { card: 'PREPAID_CREATIVE', monthsAgo: 3, onDay: 27, amount: 600, requestedBy: 'Jonah Beckett', approvedBy: 'Mark Delaney', note: 'Emergency top-up after a declined Adobe Stock charge.' },
  { card: 'PREPAID_CREATIVE', monthsAgo: 2, onDay: 4, amount: 400, requestedBy: 'Jonah Beckett', approvedBy: 'Mark Delaney', note: 'Partial top-up — full request was trimmed at month end.' },
  { card: 'PREPAID_CREATIVE', monthsAgo: 1, onDay: 18, amount: 250, requestedBy: 'Jonah Beckett', approvedBy: 'Mark Delaney', note: 'Holding top-up pending the annual budget review.' },

  // AI float — funded ahead of demand, so it stays comfortable.
  { card: 'PREPAID_AI', monthsAgo: 6, onDay: 20, amount: 1500, requestedBy: 'Sarah Whitcombe', approvedBy: 'Mark Delaney', note: 'Quarterly float for AI credits.' },
  { card: 'PREPAID_AI', monthsAgo: 5, onDay: 7, amount: 1000, requestedBy: 'Sarah Whitcombe', approvedBy: 'Mark Delaney', note: 'Additional credits for the readability pass.' },
  { card: 'PREPAID_AI', monthsAgo: 3, onDay: 22, amount: 1500, requestedBy: 'Sarah Whitcombe', approvedBy: 'Mark Delaney', note: 'Quarterly float for AI credits.' },
  { card: 'PREPAID_AI', monthsAgo: 2, onDay: 13, amount: 1200, requestedBy: 'Priya Raghunathan', approvedBy: 'Mark Delaney', note: 'Narration re-record for the health and social care module.' },
  { card: 'PREPAID_AI', monthsAgo: 1, onDay: 26, amount: 2000, requestedBy: 'Sarah Whitcombe', approvedBy: 'Mark Delaney', note: 'Pre-funded ahead of the autumn build cycle.' },
];

// ──────────────────────────────────────────────────────────── users, settings ──

const DEMO_PASSWORD = 'ImperialDemo2026!';

const USERS: { email: string; name: string; role: Role }[] = [
  { email: 'admin@imperialedutech.co.uk', name: 'Course Development Lead', role: 'ADMIN' },
  { email: 'editor@imperialedutech.co.uk', name: 'Content Operations Editor', role: 'EDITOR' },
  { email: 'finance@imperialedutech.co.uk', name: 'Finance', role: 'VIEWER' },
];

const SETTINGS: { key: string; value: string }[] = [
  { key: 'brand.hex', value: '#DA291C' },
  { key: 'org.name', value: 'Imperial Edutech' },
  { key: 'alerts.criticalDays', value: '7' },
  { key: 'alerts.soonDays', value: '21' },
  { key: 'alerts.upcomingDays', value: '60' },
];

// ───────────────────────────────────────────────────────── charge generation ──

/** How many months the vendor waits between charges. 0 means "not a fixed cycle". */
const PERIOD_MONTHS: Record<BillingModel, number> = {
  WEEKLY: 0,
  MONTHLY: 1,
  QUARTERLY: 3,
  BIANNUAL: 6,
  ANNUAL: 12,
  ONE_OFF: 0,
  PAY_PER_USE: 1,
  TOPUP_CREDIT: 1,
  FREE: 0,
};

interface ChargeSeed {
  subscriptionId: string;
  cardId: string | null;
  dueDate: Date;
  amount: number;
  currency: string;
  status: ChargeStatus;
  paidDate: Date | null;
  invoiceRef: string | null;
  note: string | null;
}

/**
 * Scheduled charges for the next 90 days, plus the charges that already fell in
 * the last 90 days marked as paid. Both are derived from the renewal date and
 * the billing cycle, so the ledger always agrees with the subscription record.
 */
function buildCharges(
  sub: { id: string; cardId: string | null; billingModel: string; currency: string; status: string },
  renewalDate: Date | null,
  amountPerCharge: number,
  seq: { n: number },
): ChargeSeed[] {
  const model = sub.billingModel as BillingModel;
  const step = PERIOD_MONTHS[model] ?? 0;
  if (!renewalDate || step <= 0 || sub.status === 'CANCELLED' || amountPerCharge <= 0) return [];

  const out: ChargeSeed[] = [];
  const horizon = daysFromNow(90);
  const backstop = daysAgo(90);

  const first = nextChargeDate(renewalDate, model, NOW);
  if (!first) return [];

  // Forward: everything still to be paid inside the 90-day window.
  let cursor = new Date(first);
  let guard = 0;
  while (cursor <= horizon && guard++ < 24) {
    out.push({
      subscriptionId: sub.id,
      cardId: sub.cardId,
      dueDate: new Date(cursor),
      amount: round2(amountPerCharge),
      currency: sub.currency,
      status: 'SCHEDULED',
      paidDate: null,
      invoiceRef: null,
      note: null,
    });
    cursor = addMonths(cursor, step);
  }

  // Backward: the recent past, already settled. Walk back to find the dates,
  // then number the invoices oldest-first so the reference sequence runs the
  // same way the calendar does.
  const settled: Date[] = [];
  cursor = addMonths(first, -step);
  guard = 0;
  while (cursor >= backstop && guard++ < 24) {
    settled.unshift(new Date(cursor));
    cursor = addMonths(cursor, -step);
  }

  for (const due of settled) {
    seq.n += 1;
    out.push({
      subscriptionId: sub.id,
      cardId: sub.cardId,
      dueDate: due,
      amount: round2(amountPerCharge),
      currency: sub.currency,
      status: 'PAID',
      paidDate: due,
      invoiceRef: invoiceRef(due, seq.n),
      note: 'Settled — imported from the payment ledger.',
    });
  }

  return out;
}

// ─────────────────────────────────────────────────────────────────── seeding ──

async function wipe(): Promise<void> {
  // Child rows first, then their parents. Cascades would handle most of this,
  // but being explicit keeps the order obvious if the schema gains a relation.
  await prisma.charge.deleteMany();
  await prisma.usageRecord.deleteMany();
  await prisma.costChange.deleteMany();
  await prisma.allocation.deleteMany();
  await prisma.cardTopUp.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.card.deleteMany();
  await prisma.department.deleteMany();
  await prisma.fxRate.deleteMany();
  await prisma.setting.deleteMany();
  await prisma.user.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.reminderLog.deleteMany();
}

async function main(): Promise<void> {
  console.log('Seeding Imperial Edutech subscription register (illustrative sample data)...\n');

  await wipe();

  // ── Departments ───────────────────────────────────────────────────────────
  const deptId = {} as Record<DeptCode, string>;
  for (const d of DEPARTMENTS) {
    const row = await prisma.department.create({
      data: {
        name: d.name,
        code: d.code,
        colorHex: d.colorHex,
        costCentre: d.costCentre,
        headName: d.headName,
        headEmail: d.headEmail,
        headcount: d.headcount,
        active: true,
        sortOrder: d.sortOrder,
      },
    });
    deptId[d.code] = row.id;
  }

  // ── Cards ─────────────────────────────────────────────────────────────────
  const cardId = {} as Record<CardKey, string>;
  for (const c of CARDS) {
    const row = await prisma.card.create({
      data: {
        label: c.label,
        last4: c.last4,
        provider: c.provider,
        type: c.type,
        holderName: c.holderName ?? null,
        currency: c.currency,
        currentBalance: c.currentBalance ?? null,
        balanceUpdatedAt: c.balanceUpdatedDaysAgo != null ? daysAgo(c.balanceUpdatedDaysAgo) : null,
        lowBalanceThreshold: c.lowBalanceThreshold,
        expiryMonth: c.expiryMonth ?? null,
        expiryYear: c.expiryYear ?? null,
        notes: c.notes,
        active: true,
      },
    });
    cardId[c.key] = row.id;
  }

  // ── FX rates ──────────────────────────────────────────────────────────────
  for (const fx of FX_RATES) {
    await prisma.fxRate.create({ data: { code: fx.code, rateToGbp: fx.rateToGbp, source: FX_SOURCE } });
  }

  // ── Subscriptions, with allocations, price history and usage ──────────────
  // Child rows go in as nested writes, and the closing summary counts them back
  // out of the database rather than tallying them here — so the printed totals
  // reflect what actually landed, not what was intended.
  const charges: ChargeSeed[] = [];
  const seq = { n: 0 };

  for (const s of SUBSCRIPTIONS) {
    const seats = s.seats ?? 1;
    const renewalDate = s.renewalInDays != null ? daysFromNow(s.renewalInDays) : null;
    const hasPassword = Boolean(s.samplePassword);

    const created = await prisma.subscription.create({
      data: {
        name: s.name,
        vendor: s.vendor,
        url: s.url ?? null,
        category: s.category,
        description: s.description,
        status: s.status ?? 'ACTIVE',
        criticality: s.criticality ?? 'MEDIUM',

        accountEmail: s.accountEmail ?? null,
        username: s.username ?? null,
        passwordCipher: s.samplePassword ? encryptSecret(s.samplePassword) : null,
        passwordUpdatedAt: hasPassword ? monthsAgo(3) : null,
        credentialLocation: s.credentialLocation ?? null,
        mfaNotes: s.mfaNotes ?? null,

        cardId: s.card ? cardId[s.card] : null,

        billingModel: s.billingModel,
        currency: s.currency,
        unitAmount: s.unitAmount,
        seats,
        perSeat: s.perSeat ?? false,

        usageUnitLabel: s.usageUnitLabel ?? null,
        usageRatePerUnit: s.usageRatePerUnit ?? null,
        estimatedMonthlyUnits: s.estimatedMonthlyUnits ?? null,
        topUpAmount: s.topUpAmount ?? null,
        topUpThreshold: s.topUpThreshold ?? null,
        creditBalance: s.creditBalance ?? null,
        creditBalanceUpdatedAt: s.creditBalance != null ? daysAgo(2) : null,

        startDate: monthsAgo(s.startMonthsAgo),
        renewalDate,
        contractEndDate: s.contractEndInDays != null ? daysFromNow(s.contractEndInDays) : null,
        autoRenew: s.autoRenew ?? true,
        noticePeriodDays: s.noticePeriodDays ?? 0,
        cancellationUrl: s.cancellationUrl ?? null,

        allocationMethod: s.allocationMethod,
        ownerDepartmentId: deptId[s.ownerDept],
        ownerName: s.ownerName ?? null,
        ownerEmail: s.ownerEmail ?? null,

        notes: s.notes ?? null,
        tags: s.tags?.join(', ') ?? null,
        archived: false,

        allocations: s.allocations
          ? {
              create: s.allocations.map((a) => ({
                departmentId: deptId[a.dept],
                percentage: a.percentage ?? null,
                seats: a.seats ?? null,
                note: a.note ?? null,
              })),
            }
          : undefined,

        costChanges: s.costChanges
          ? {
              create: s.costChanges.map((c) => ({
                effectiveDate: monthsAgoOnDay(c.monthsAgo, c.onDay),
                previousAmount: c.previousAmount,
                newAmount: c.newAmount,
                previousModel: c.previousModel ?? null,
                newModel: c.newModel ?? null,
                currency: s.currency,
                reason: c.reason,
                recordedBy: c.recordedBy ?? 'Course Development Lead',
              })),
            }
          : undefined,

        usageRecords: s.usage
          ? {
              create: s.usage.map((u) => ({
                periodStart: startOfMonthsAgo(u.monthsAgo),
                periodEnd: endOfMonthsAgo(u.monthsAgo),
                units: u.units,
                amount: u.amount,
                currency: s.currency,
                note: u.note ?? null,
              })),
            }
          : undefined,
      },
    });

    const amountPerCharge = s.perSeat ? s.unitAmount * seats : s.unitAmount;
    charges.push(
      ...buildCharges(
        {
          id: created.id,
          cardId: created.cardId,
          billingModel: created.billingModel,
          currency: created.currency,
          status: created.status,
        },
        renewalDate,
        amountPerCharge,
        seq,
      ),
    );
  }

  // ── Payment ledger ────────────────────────────────────────────────────────
  await prisma.charge.createMany({ data: charges });

  // ── Card top-ups ──────────────────────────────────────────────────────────
  await prisma.cardTopUp.createMany({
    data: TOP_UPS.map((t) => ({
      cardId: cardId[t.card],
      amount: t.amount,
      currency: 'GBP',
      occurredAt: monthsAgoOnDay(t.monthsAgo, t.onDay),
      requestedBy: t.requestedBy,
      approvedBy: t.approvedBy,
      note: t.note,
    })),
  });

  // ── Users ─────────────────────────────────────────────────────────────────
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  for (const u of USERS) {
    await prisma.user.create({
      data: { email: u.email, name: u.name, role: u.role, passwordHash, active: true },
    });
  }

  // ── Settings ──────────────────────────────────────────────────────────────
  await prisma.setting.createMany({ data: SETTINGS });

  // ── Summary ───────────────────────────────────────────────────────────────
  const [
    departments,
    cards,
    fxRates,
    subscriptions,
    allocations,
    costChanges,
    usageRecords,
    topUps,
    chargeRows,
    scheduledCharges,
    paidCharges,
    users,
    settings,
  ] = await Promise.all([
    prisma.department.count(),
    prisma.card.count(),
    prisma.fxRate.count(),
    prisma.subscription.count(),
    prisma.allocation.count(),
    prisma.costChange.count(),
    prisma.usageRecord.count(),
    prisma.cardTopUp.count(),
    prisma.charge.count(),
    prisma.charge.count({ where: { status: 'SCHEDULED' } }),
    prisma.charge.count({ where: { status: 'PAID' } }),
    prisma.user.count(),
    prisma.setting.count(),
  ]);

  const rows: [string, number][] = [
    ['Departments', departments],
    ['Cards', cards],
    ['FX rates', fxRates],
    ['Subscriptions', subscriptions],
    ['Allocations', allocations],
    ['Cost changes', costChanges],
    ['Usage records', usageRecords],
    ['Card top-ups', topUps],
    ['Charges (total)', chargeRows],
    ['  of which scheduled', scheduledCharges],
    ['  of which paid', paidCharges],
    ['Users', users],
    ['Settings', settings],
  ];

  console.log('Seed complete.\n');
  for (const [label, count] of rows) {
    console.log(`  ${label.padEnd(24)} ${String(count).padStart(5)}`);
  }

  console.log('\nSign-in details for the seeded accounts:');
  for (const u of USERS) {
    console.log(`  ${u.role.padEnd(7)} ${u.email.padEnd(38)} ${DEMO_PASSWORD}`);
  }

  console.log(
    [
      '',
      'WARNING — change these passwords before anyone else can reach this instance.',
      'All three accounts share one well-known password that is committed to source',
      'control. Change them on first sign-in, or delete the accounts you do not need.',
      '',
      'WARNING — every price, rate, balance and renewal date in this seed is',
      'illustrative sample data, not verified vendor pricing. Replace all of it with',
      "the organisation's own invoiced figures before using this for budgeting or",
      'reporting.',
      '',
    ].join('\n'),
  );
}

main()
  .catch((error: unknown) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
