/**
 * The shape of an automatic statistical observation.
 *
 * The observations themselves are computed by the API service, which owns the
 * statistics (`backend/src/services/observations.ts`) and returns them
 * alongside the portfolio. This module is types only: `tiles.tsx` and
 * `AnalyticsView.tsx` import `Observation` in order to render one, and nothing
 * in this service needs to know how it was derived.
 *
 * Each observation carries the method used, the sample size it rests on and a
 * reliability verdict, because a portfolio of thirty subscriptions is a small
 * dataset and several of these measures are unstable at that size.
 */

/** Mirrors `Reliability` in the API service's statistics module. */
export type Reliability = 'OK' | 'LOW_N' | 'INSUFFICIENT';

export interface Observation {
  id: string;
  title: string;
  body: string;
  tone: 'neutral' | 'info' | 'warning' | 'danger' | 'positive';
  metric?: string;
  method: string;
  n: number;
  reliability: Reliability;
}
