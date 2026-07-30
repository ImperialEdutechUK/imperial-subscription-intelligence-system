/**
 * Domain vocabulary. Everything the UI renders as a dropdown, badge or filter
 * is defined once here so labels stay consistent across the whole application.
 */

export const BILLING_MODELS = [
  'WEEKLY',
  'MONTHLY',
  'QUARTERLY',
  'BIANNUAL',
  'ANNUAL',
  'ONE_OFF',
  'PAY_PER_USE',
  'TOPUP_CREDIT',
  'FREE',
] as const;
export type BillingModel = (typeof BILLING_MODELS)[number];

export const BILLING_MODEL_META: Record<
  BillingModel,
  { label: string; short: string; periodsPerYear: number; recurring: boolean; estimated: boolean; hint: string }
> = {
  WEEKLY: { label: 'Weekly', short: 'wk', periodsPerYear: 52, recurring: true, estimated: false, hint: 'Charged every week.' },
  MONTHLY: { label: 'Monthly', short: 'mo', periodsPerYear: 12, recurring: true, estimated: false, hint: 'Charged every month.' },
  QUARTERLY: { label: 'Quarterly', short: 'qtr', periodsPerYear: 4, recurring: true, estimated: false, hint: 'Charged every three months.' },
  BIANNUAL: { label: 'Every 6 months', short: '6mo', periodsPerYear: 2, recurring: true, estimated: false, hint: 'Charged twice a year.' },
  ANNUAL: { label: 'Annual', short: 'yr', periodsPerYear: 1, recurring: true, estimated: false, hint: 'Charged once a year.' },
  ONE_OFF: { label: 'One-off', short: 'once', periodsPerYear: 0, recurring: false, estimated: false, hint: 'A single purchase — a perpetual licence or one-time fee.' },
  PAY_PER_USE: { label: 'Pay per use', short: 'usage', periodsPerYear: 12, recurring: true, estimated: true, hint: 'Billed on consumption. Cost is estimated from usage history or your forecast.' },
  TOPUP_CREDIT: { label: 'Credit top-up', short: 'credit', periodsPerYear: 12, recurring: true, estimated: true, hint: 'You load credit onto the account and draw it down. Cost is estimated from actual top-ups.' },
  FREE: { label: 'Free', short: 'free', periodsPerYear: 0, recurring: false, estimated: false, hint: 'No cost — tracked for visibility and access management.' },
};

export const ALLOCATION_METHODS = ['OWNER_PAYS', 'PERCENTAGE', 'SEATS'] as const;
export type AllocationMethod = (typeof ALLOCATION_METHODS)[number];

export const ALLOCATION_METHOD_META: Record<AllocationMethod, { label: string; hint: string }> = {
  OWNER_PAYS: {
    label: 'Owner pays',
    hint: 'The whole cost sits with the owning department. Other departments can still be listed as users.',
  },
  PERCENTAGE: {
    label: 'Split by percentage',
    hint: 'You decide the split, e.g. Course Development 60% / Marketing 40%.',
  },
  SEATS: {
    label: 'Split by seats',
    hint: 'Cost is divided in proportion to the number of licences each department uses.',
  },
};

export const SUB_STATUSES = ['ACTIVE', 'TRIAL', 'PAUSED', 'CANCELLED', 'PENDING'] as const;
export type SubStatus = (typeof SUB_STATUSES)[number];

export const STATUS_META: Record<SubStatus, { label: string; tone: 'positive' | 'warning' | 'neutral' | 'danger' | 'info' }> = {
  ACTIVE: { label: 'Active', tone: 'positive' },
  TRIAL: { label: 'Trial', tone: 'info' },
  PAUSED: { label: 'Paused', tone: 'warning' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral' },
  PENDING: { label: 'Pending', tone: 'info' },
};

export const CRITICALITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export type Criticality = (typeof CRITICALITIES)[number];

export const CATEGORIES = [
  'AI_TOOLS',
  'STOCK_MEDIA',
  'DESIGN',
  'VIDEO_AUDIO',
  'ELEARNING_AUTHORING',
  'LMS',
  'PRODUCTIVITY',
  'COLLABORATION',
  'DEVELOPMENT',
  'DATA_ANALYTICS',
  'MARKETING',
  'HOSTING_INFRA',
  'SECURITY',
  'FINANCE_OPS',
  'RESEARCH',
  'OTHER',
] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_META: Record<Category, { label: string; icon: string }> = {
  AI_TOOLS: { label: 'AI Tools', icon: 'sparkles' },
  STOCK_MEDIA: { label: 'Stock & Media Libraries', icon: 'images' },
  DESIGN: { label: 'Design', icon: 'palette' },
  VIDEO_AUDIO: { label: 'Video & Audio', icon: 'clapperboard' },
  ELEARNING_AUTHORING: { label: 'eLearning Authoring', icon: 'graduation-cap' },
  LMS: { label: 'LMS & Delivery', icon: 'school' },
  PRODUCTIVITY: { label: 'Productivity', icon: 'check-square' },
  COLLABORATION: { label: 'Collaboration', icon: 'users' },
  DEVELOPMENT: { label: 'Development', icon: 'code' },
  DATA_ANALYTICS: { label: 'Data & Analytics', icon: 'bar-chart' },
  MARKETING: { label: 'Marketing', icon: 'megaphone' },
  HOSTING_INFRA: { label: 'Hosting & Infrastructure', icon: 'server' },
  SECURITY: { label: 'Security', icon: 'shield' },
  FINANCE_OPS: { label: 'Finance & Ops', icon: 'receipt' },
  RESEARCH: { label: 'Research & Reference', icon: 'book-open' },
  OTHER: { label: 'Other', icon: 'box' },
};

export const CARD_TYPES = [
  'CORPORATE_CREDIT',
  'PREPAID',
  'DEBIT',
  'DIRECT_DEBIT',
  'INVOICE',
  'PERSONAL_REIMBURSED',
] as const;
export type CardType = (typeof CARD_TYPES)[number];

export const CARD_TYPE_META: Record<CardType, { label: string; needsBalance: boolean; hint: string }> = {
  CORPORATE_CREDIT: { label: 'Corporate credit card', needsBalance: false, hint: 'Credit limit, not a float. No top-up needed.' },
  PREPAID: { label: 'Prepaid card', needsBalance: true, hint: 'Must be topped up before renewals or the payment fails.' },
  DEBIT: { label: 'Debit card', needsBalance: true, hint: 'Draws from an account balance you may need to fund.' },
  DIRECT_DEBIT: { label: 'Direct debit', needsBalance: false, hint: 'Collected from the bank account automatically.' },
  INVOICE: { label: 'Invoice / PO', needsBalance: false, hint: 'Billed on invoice through accounts payable.' },
  PERSONAL_REIMBURSED: { label: 'Personal card (reimbursed)', needsBalance: false, hint: 'Paid personally and claimed back on expenses.' },
};

export const CHARGE_STATUSES = ['SCHEDULED', 'DUE', 'PAID', 'OVERDUE', 'FAILED', 'WAIVED'] as const;
export type ChargeStatus = (typeof CHARGE_STATUSES)[number];

export const ROLES = ['ADMIN', 'EDITOR', 'VIEWER'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_META: Record<Role, { label: string; hint: string }> = {
  ADMIN: { label: 'Administrator', hint: 'Full access, including users, settings and revealing stored passwords.' },
  EDITOR: { label: 'Editor', hint: 'Can add and edit subscriptions, cards and departments.' },
  VIEWER: { label: 'Viewer', hint: 'Read-only. Intended for Finance — no access to stored credentials.' },
};

export const CURRENCIES = ['GBP', 'USD', 'EUR', 'AUD', 'CAD', 'INR', 'LKR', 'SGD', 'AED'] as const;
export type CurrencyCode = (typeof CURRENCIES)[number];

export const CURRENCY_SYMBOL: Record<string, string> = {
  GBP: '£', USD: '$', EUR: '€', AUD: 'A$', CAD: 'C$', INR: '₹', LKR: 'Rs', SGD: 'S$', AED: 'AED ',
};

export function labelFor(map: Record<string, { label: string }>, key: string | null | undefined, fallback = '—') {
  if (!key) return fallback;
  return map[key]?.label ?? key;
}
