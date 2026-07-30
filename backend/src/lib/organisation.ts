/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  THE ONE FILE TO EDIT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Everything in this file describes *your organisation* rather than how the
 *  application works. If you want to change the list of departments, add a
 *  currency, rename a category or set the brand colour, this is the only place
 *  you need to touch. Nothing here requires understanding the rest of the code.
 *
 *  After changing anything in this file:
 *
 *      npm run seed:setup        # applies departments, currencies and settings
 *
 *  That command is safe to run more than once. It updates departments that
 *  already exist and adds any that are new. It never deletes a department that
 *  has subscriptions attached to it, and it never touches your subscription
 *  data.
 *
 *  Departments can also be added, renamed and recoloured from inside the
 *  application at Settings → Departments, with no code change at all. This file
 *  is the starting point; the application is the day-to-day tool.
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ─────────────────────────────────────────────────────────── Organisation ──

export const ORGANISATION = {
  /** Shown in the sidebar, the sign-in page and every export. */
  name: 'Imperial Edutech',

  /**
   * The brand colour, as a six-digit hex value.
   *
   * The whole interface is generated from this one value — button colours,
   * chart series, focus rings, dark mode, everything. Change it here and the
   * application re-tunes around it, or change it at Settings → Brand inside
   * the application, which also reports the measured contrast so you know
   * whether small text will be readable on it.
   *
   * The current value measures 4.87:1 against white, which meets WCAG 2.1 AA
   * for normal-size text. If you replace it with a lighter colour the
   * application will still work, but Settings will warn you about contrast.
   */
  brandHex: '#1266D3',

  /** The currency everything is reported in. Individual subscriptions can be billed in others. */
  reportingCurrency: 'GBP',
} as const;

// ────────────────────────────────────────────────────────────  Departments ──

export interface DepartmentSeed {
  /** Short code shown as a chip against every subscription. Keep it under about eight characters. */
  code: string;
  /** Full name, shown in reports and on the Departments page. */
  name: string;
  /**
   * The colour used for this department in every chart.
   *
   * Avoid red: red is the brand colour and is reserved for warnings, so a red
   * department would be hard to tell apart from an alert.
   */
  colorHex: string;
  /** Your finance system's cost centre code, if you use one. Set to null if not. */
  costCentre: string | null;
  /** Head of department — optional, used for contact details only. */
  headName: string | null;
  headEmail: string | null;
  /**
   * Number of people in the department.
   *
   * This is only used to work out software cost per person. Leave it as null
   * and that department is simply left out of the per-person comparison rather
   * than shown as zero.
   */
  headcount: number | null;
}

/**
 * The departments in the company.
 *
 * Add, remove or rename freely — but if you remove one that already has
 * subscriptions attached, reassign those first inside the application. The
 * setup script will refuse to delete a department that is still in use rather
 * than silently orphaning its costs.
 */
export const DEPARTMENTS: DepartmentSeed[] = [
  {
    code: 'CDD',
    name: 'Course Development',
    colorHex: '#1F6FEB',
    costCentre: 'CC-4100',
    headName: null,
    headEmail: null,
    headcount: null,
  },
  {
    code: 'ACAD',
    name: 'Academic',
    colorHex: '#047857',
    costCentre: 'CC-4200',
    headName: null,
    headEmail: null,
    headcount: null,
  },
  {
    code: 'MKTG',
    name: 'Marketing',
    colorHex: '#7C3AED',
    costCentre: 'CC-4300',
    headName: null,
    headEmail: null,
    headcount: null,
  },
  {
    code: 'SALES',
    name: 'Sales',
    colorHex: '#B45309',
    costCentre: 'CC-4400',
    headName: null,
    headEmail: null,
    headcount: null,
  },
  {
    code: 'IT',
    name: 'IT',
    colorHex: '#0E7490',
    costCentre: 'CC-4500',
    headName: null,
    headEmail: null,
    headcount: null,
  },
  {
    code: 'OPS',
    name: 'Operations',
    colorHex: '#4D7C0F',
    costCentre: 'CC-4600',
    headName: null,
    headEmail: null,
    headcount: null,
  },
  {
    code: 'FIN',
    name: 'Finance',
    colorHex: '#334155',
    costCentre: 'CC-4700',
    headName: null,
    headEmail: null,
    headcount: null,
  },
  {
    code: 'HR',
    name: 'Human Resources',
    colorHex: '#BE185D',
    costCentre: 'CC-4800',
    headName: null,
    headEmail: null,
    headcount: null,
  },
  {
    code: 'EXEC',
    name: 'Top Management',
    colorHex: '#7E22CE',
    costCentre: 'CC-4900',
    headName: null,
    headEmail: null,
    headcount: null,
  },
];

// ──────────────────────────────────────────────────────────  Exchange rates ──

/**
 * Rates used to convert non-GBP subscriptions into the reporting currency.
 *
 * These are entered by hand on purpose. The application does not fetch live
 * rates, because a figure that changes every time the page loads cannot be
 * reconciled against an invoice. Set whatever rate your finance team uses for
 * the period, and update it when they do — either here, or at Settings →
 * Exchange rates inside the application.
 *
 * A currency with no rate set is treated as 1:1 with GBP and flagged in the
 * interface, so it is never silently wrong.
 */
export const EXCHANGE_RATES: { code: string; rateToGbp: number; source: string }[] = [
  { code: 'USD', rateToGbp: 0.78, source: 'Placeholder — replace with your finance team’s rate' },
  { code: 'EUR', rateToGbp: 0.85, source: 'Placeholder — replace with your finance team’s rate' },
  { code: 'AUD', rateToGbp: 0.52, source: 'Placeholder — replace with your finance team’s rate' },
];

// ──────────────────────────────────────────────────────────────  Reminders ──

export const ALERT_THRESHOLDS = {
  /** A renewal within this many days is shown as urgent. */
  criticalDays: 7,
  /** A renewal within this many days is shown as approaching. */
  soonDays: 21,
  /** How far ahead the Teams digest and the renewals page look by default. */
  upcomingDays: 60,
} as const;

// ──────────────────────────────────────────────────────  First user account ──

/**
 * The first administrator, created by `npm run seed:setup` if no users exist.
 *
 * Change the email before running it. The password is only a starting value —
 * set a real one and change it after the first sign-in. If any user already
 * exists, the setup script leaves accounts alone entirely.
 */
export const FIRST_ADMIN = {
  name: 'Administrator',
  email: 'admin@imperialedutech.co.uk',
  /** Change this. It ends up in your git history otherwise. */
  initialPassword: 'ChangeThisOnFirstLogin!',
} as const;
