import { NextRequest, NextResponse } from 'next/server';
import {
  ACCESS_COOKIE_MAX_AGE_SECONDS,
  ACCESS_COOKIE_NAME,
  checkRateLimit,
  createAccessSessionToken,
  createRateLimitExceededResponse,
  getAnonymizedClientIp,
  getConfiguredAccessToken,
  logSecurityEvent,
  validateAccessSession,
  validateAppAccessToken,
  validateCsrfOrigin,
} from '@/lib/security';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = req.cookies.get(ACCESS_COOKIE_NAME)?.value || '';
  const localDevelopment =
    process.env.NODE_ENV !== 'production' &&
    ['localhost', '127.0.0.1', '::1'].includes(req.nextUrl.hostname);

  return NextResponse.json(
    {
      configured: Boolean(getConfiguredAccessToken()),
      authenticated: localDevelopment || validateAccessSession(session),
      localDevelopment,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

export async function POST(req: NextRequest) {
  const clientIp = getAnonymizedClientIp(req);
  const globalRate = checkRateLimit('access_login_global', 100, 15 * 60 * 1000);
  if (!globalRate.success) return createRateLimitExceededResponse(globalRate.reset);
  const rate = checkRateLimit(`access_login_${clientIp}`, 10, 15 * 60 * 1000);
  if (!rate.success) return createRateLimitExceededResponse(rate.reset);

  const csrf = validateCsrfOrigin(req, '/api/auth');
  if (!csrf.valid) {
    return NextResponse.json({ error: csrf.reason }, { status: 403 });
  }

  const configuredToken = getConfiguredAccessToken();
  if (!configuredToken) {
    return NextResponse.json(
      { error: 'APP_ACCESS_TOKEN mangler eller er kortere enn 16 tegn' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const contentLength = Number(req.headers.get('content-length') || 0);
  if (contentLength > 4096) {
    return NextResponse.json({ error: 'Forespørselen er for stor' }, { status: 413 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Ugyldig forespørsel' }, { status: 400 });
  }

  const providedToken =
    body && typeof body === 'object' && typeof (body as { token?: unknown }).token === 'string'
      ? (body as { token: string }).token
      : '';

  if (providedToken.length > 512) {
    return NextResponse.json({ error: 'Ugyldig forespørsel' }, { status: 400 });
  }

  if (!validateAppAccessToken(providedToken)) {
    logSecurityEvent({
      type: 'ACCESS_AUTH_FAILURE',
      endpoint: '/api/auth',
      ipMasked: clientIp,
      details: 'Ugyldig personlig tilgangsnøkkel',
      severity: 'warn',
    });
    return NextResponse.json(
      { error: 'Ugyldig tilgangsnøkkel' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const response = NextResponse.json(
    { success: true },
    { headers: { 'Cache-Control': 'no-store' } }
  );
  response.cookies.set({
    name: ACCESS_COOKIE_NAME,
    value: createAccessSessionToken(configuredToken),
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: ACCESS_COOKIE_MAX_AGE_SECONDS,
  });

  logSecurityEvent({
    type: 'ACCESS_AUTH_SUCCESS',
    endpoint: '/api/auth',
    ipMasked: clientIp,
    details: 'Personlig tilgang godkjent',
    severity: 'info',
  });
  return response;
}

export async function DELETE(req: NextRequest) {
  const csrf = validateCsrfOrigin(req, '/api/auth');
  if (!csrf.valid) {
    return NextResponse.json({ error: csrf.reason }, { status: 403 });
  }

  const response = NextResponse.json(
    { success: true },
    { headers: { 'Cache-Control': 'no-store' } }
  );
  response.cookies.set({
    name: ACCESS_COOKIE_NAME,
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
  return response;
}
