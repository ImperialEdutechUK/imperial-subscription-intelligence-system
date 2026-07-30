import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import { prisma } from './db';
import type { Role } from './domain';

/**
 * Authentication for the API service.
 *
 * This deliberately has no cookie handling. The browser never talks to this
 * service directly — the Next.js frontend holds the session cookie on its own
 * origin and forwards the token as `Authorization: Bearer <jwt>`. That keeps
 * the cookie httpOnly and same-site, and means this service needs no CORS
 * configuration and no cross-site cookie exemptions.
 *
 * The token is signed with APP_SECRET, which both services share. Verification
 * here is stateless: no session table, no round trip.
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

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 12);
}

export async function verifyPassword(pw: string, hash: string) {
  return bcrypt.compare(pw, hash);
}

/** Issued at sign-in and handed to the frontend, which stores it in its own httpOnly cookie. */
export async function issueToken(user: SessionUser): Promise<string> {
  return new SignJWT({ email: user.email, name: user.name, role: user.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secret());
}

export const TOKEN_MAX_AGE_SECONDS = MAX_AGE_SECONDS;

export async function verifyToken(token: string | null | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  try {
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

/** Reads the bearer token off an incoming request and resolves it to a user. */
export async function sessionFromRequest(request: Request): Promise<SessionUser | null> {
  if (process.env.AUTH_DISABLED === 'true') {
    return { id: 'local', email: 'local@imperial', name: 'Local user', role: 'ADMIN' };
  }
  const header = request.headers.get('authorization') ?? '';
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : null;
  return verifyToken(token);
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

export async function authenticate(email: string, password: string): Promise<SessionUser | null> {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
  if (!user || !user.active) return null;
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return null;
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  return { id: user.id, email: user.email, name: user.name, role: user.role as Role };
}
