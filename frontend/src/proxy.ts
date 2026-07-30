import { NextResponse, type NextRequest } from 'next/server';

/**
 * In Next.js 16 this file replaces `middleware.ts`. It runs on the Node.js
 * runtime and performs an optimistic check only: it looks for the presence of
 * the session cookie and sends anonymous visitors to the sign-in page.
 *
 * It deliberately does NOT verify the token. Microsoft's own guidance and the
 * Next.js documentation both make the same point — proxy-level checks are for
 * routing, not authorisation. Every page, Server Action and Route Handler
 * re-checks the session properly, so a forged cookie gets past this file and
 * then achieves nothing.
 */
const PUBLIC_PATHS = ['/login', '/api/alerts', '/api/calendar.ics'];

export function proxy(request: NextRequest) {
  if (process.env.AUTH_DISABLED === 'true') return NextResponse.next();

  const { pathname, search } = request.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return NextResponse.next();

  const hasSession = request.cookies.has('imperial_subs_session');
  if (hasSession) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = '/login';
  url.search = pathname === '/' ? '' : `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Excluding static assets matters: without it, the proxy would run for every
  // stylesheet and image and could block them from loading.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
