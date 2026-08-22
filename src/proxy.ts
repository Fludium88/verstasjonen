import { NextRequest, NextResponse } from 'next/server';
import { ACCESS_COOKIE_NAME, ACCESS_TOKEN_HASH_PREFIX } from '@/lib/accessPolicy';

const PUBLIC_PATHS = new Set([
  '/access',
  '/api/auth',
  '/favicon.ico',
  '/manifest.json',
  '/sw.js',
]);

function isLocalhost(req: NextRequest): boolean {
  const hostname = req.nextUrl.hostname.toLowerCase();
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

function isPublicPath(pathname: string): boolean {
  return (
    PUBLIC_PATHS.has(pathname) ||
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/icons/')
  );
}

async function deriveSessionToken(accessToken: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${ACCESS_TOKEN_HASH_PREFIX}${accessToken}`);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  let binary = '';
  for (const byte of digest) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

// Both values are fixed-length hashes. The loop always examines every byte and
// does not return early when a character differs.
function constantTimeEqual(left: string, right: string): boolean {
  let mismatch = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    mismatch |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return mismatch === 0;
}

function apiError(status: number, error: string): NextResponse {
  return NextResponse.json(
    { error },
    { status, headers: { 'Cache-Control': 'no-store' } }
  );
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (isPublicPath(pathname) || pathname.startsWith('/api/cron/')) {
    return NextResponse.next();
  }

  // Local development is intentionally open. Preview/production deployments,
  // including mobile test deployments, require the personal access token.
  if (process.env.NODE_ENV !== 'production' && isLocalhost(req)) {
    return NextResponse.next();
  }

  const accessToken = process.env.APP_ACCESS_TOKEN?.trim() || '';
  if (accessToken.length < 16) {
    if (pathname.startsWith('/api/')) {
      return apiError(503, 'APP_ACCESS_TOKEN er ikke konfigurert sikkert');
    }
    const accessUrl = new URL('/access', req.url);
    accessUrl.searchParams.set('reason', 'configuration');
    return NextResponse.redirect(accessUrl);
  }

  const providedSession = req.cookies.get(ACCESS_COOKIE_NAME)?.value || '';
  const expectedSession = await deriveSessionToken(accessToken);
  if (constantTimeEqual(providedSession, expectedSession)) {
    return NextResponse.next();
  }

  if (pathname.startsWith('/api/')) {
    return apiError(401, 'Tilgang krever innlogging');
  }

  const accessUrl = new URL('/access', req.url);
  const requestedPath = `${pathname}${req.nextUrl.search}`;
  accessUrl.searchParams.set('next', requestedPath);
  return NextResponse.redirect(accessUrl);
}

export const config = {
  matcher: ['/((?!.*\\.[^/]+$).*)', '/manifest.json', '/sw.js'],
};
