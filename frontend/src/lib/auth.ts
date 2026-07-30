import 'server-only';
import { jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import type { Role } from './domain';
import { SESSION_COOKIE } from './api';

/**
 * Session handling for the web interface.
 *
 * The token itself is minted by the API service at sign-in. This service only
 * stores it in an httpOnly cookie on its own origin and verifies the signature
 * locally, so deciding whether to render an "Edit" button costs no network
 * round trip.
 *
 * Verifying here means both services share APP_SECRET. That is deliberate: they
 * are one application deployed as two processes. Note that this service never
 * connects to the database, so it never holds an encrypted credential to
 * decrypt — the shared secret buys it nothing beyond reading its own tokens.
 *
 * Authorisation is still enforced by the API service on every request. Anything
 * decided here is presentation only.
 */

const MAX_AGE_SECONDS = 60 * 60 * 12;

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

function secret(): Uint8Array {
  const s = process.env.APP_SECRET;
  if (!s || s.length < 16) throw new Error('APP_SECRET is missing or too short. See .env.example.');
  return new TextEncoder().encode(s);
}

export async function storeSession(token: string) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function destroySession() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

export async function getSession(): Promise<SessionUser | null> {
  if (process.env.AUTH_DISABLED === 'true') {
    return { id: 'local', email: 'local@imperial', name: 'Local user', role: 'ADMIN' };
  }
  try {
    const jar = await cookies();
    const token = jar.get(SESSION_COOKIE)?.value;
    if (!token) return null;
    const { payload } = await jwtVerify(token, secret());
    return {
      id: String(payload.sub),
      email: String(payload.email),
      name: String(payload.name),
      role: payload.role as Role,
    };
  } catch {
    return null;
  }
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSession();
  if (!user) throw new Error('UNAUTHORISED');
  return user;
}

export function canEdit(role: Role | undefined | null) {
  return role === 'ADMIN' || role === 'EDITOR';
}

export function canRevealSecrets(role: Role | undefined | null) {
  return role === 'ADMIN';
}

export function canAdminister(role: Role | undefined | null) {
  return role === 'ADMIN';
}
