import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

/**
 * Prisma 7 connects through a driver adapter rather than a URL in the schema.
 *
 * Two things this file has to get right, both of which have bitten this project:
 *
 * 1. PostgreSQL only. `prisma/schema.prisma` declares `provider = "postgresql"`,
 *    and Prisma refuses to pair that with a SQLite adapter at construction time.
 *    A "helpful" fallback to `file:./dev.db` therefore does not degrade
 *    gracefully — it throws, and it throws during `next build`, where the error
 *    reads as a mysterious page-data collection failure.
 *
 * 2. Construction is lazy. `next build` evaluates every route module to collect
 *    page data. If the client were built at import time, a build without
 *    DATABASE_URL in the environment would fail even though no query is ever
 *    run. The Proxy below defers construction to the first property access,
 *    so importing this module is free and only an actual query needs a URL.
 */

function connectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. This application requires a PostgreSQL connection string ' +
        '(postgres:// or postgresql://). See .env.example and HOSTING.md.',
    );
  }
  if (!url.startsWith('postgres://') && !url.startsWith('postgresql://')) {
    throw new Error(
      `DATABASE_URL must be a PostgreSQL connection string starting postgres:// or postgresql://, ` +
        `but it starts "${url.slice(0, 12)}…". The schema declares provider = "postgresql"; ` +
        'SQLite is not supported. See HOSTING.md.',
    );
  }
  return url;
}

function createClient(): PrismaClient {
  // A serverless platform gives each function instance its own pool, so the pg
  // default of 10 multiplies by the number of live instances and can exhaust
  // the database's connection limit under load. Both Prisma and Vercel advise a
  // small pool with a short idle timeout; a max of 1 is explicitly discouraged
  // because it harms concurrency without reducing total connections.
  const adapter = new PrismaPg({
    connectionString: connectionString(),
    max: Number(process.env.DATABASE_POOL_MAX ?? 5),
    idleTimeoutMillis: 5_000,
  });

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
}

// In development Next.js hot-reloads modules; without this the process would
// accumulate a new connection pool on every edit.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function client(): PrismaClient {
  globalForPrisma.prisma ??= createClient();
  return globalForPrisma.prisma;
}

/**
 * Behaves exactly like a PrismaClient to every caller, but nothing is
 * constructed — and no connection string is required — until the first
 * property is read.
 */
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const c = client();
    const value = Reflect.get(c, prop);
    return typeof value === 'function' ? value.bind(c) : value;
  },
  has(_target, prop) {
    return Reflect.has(client(), prop);
  },
});
