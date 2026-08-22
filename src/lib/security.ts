import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { ACCESS_TOKEN_HASH_PREFIX } from './accessPolicy';

export { ACCESS_COOKIE_MAX_AGE_SECONDS, ACCESS_COOKIE_NAME } from './accessPolicy';

export interface SecurityLogEvent {
  id: string;
  timestamp: string;
  type: 'ACCESS_AUTH_SUCCESS' | 'ACCESS_AUTH_FAILURE' | 'CRON_AUTH_SUCCESS' | 'CRON_AUTH_FAILURE' | 'RATE_LIMIT_EXCEEDED' | 'CSRF_BLOCKED' | 'INVALID_INPUT' | 'SETTINGS_CHANGED' | 'LOCATION_MODIFIED';
  endpoint: string;
  ipMasked?: string;
  details: string;
  severity: 'info' | 'warn' | 'error';
}

// In-memory rate limiting map: key -> { count, resetTime }
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

// In-memory security audit log (last 50 events)
const securityAuditLogs: SecurityLogEvent[] = [];
const MAX_AUDIT_LOGS = 50;

/**
 * Log a cybersecurity or access control event
 */
export function logSecurityEvent(event: Omit<SecurityLogEvent, 'id' | 'timestamp'>): SecurityLogEvent {
  const fullEvent: SecurityLogEvent = {
    id: `sec_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    timestamp: new Date().toISOString(),
    ...event,
  };

  securityAuditLogs.unshift(fullEvent);
  if (securityAuditLogs.length > MAX_AUDIT_LOGS) {
    securityAuditLogs.pop();
  }

  if (event.severity === 'error' || event.severity === 'warn') {
    console.warn(`[SECURITY ${event.severity.toUpperCase()}] [${event.type}] [${event.endpoint}]: ${event.details}`);
  }

  return fullEvent;
}

export function getSecurityAuditLogs(): SecurityLogEvent[] {
  return [...securityAuditLogs];
}

/**
 * Anonymize client IP address for privacy-preserving logging
 */
export function getAnonymizedClientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '127.0.0.1';
  const rawIp = forwarded.split(',')[0].trim();
  
  if (rawIp.includes('.')) {
    // IPv4: Mask last octet (e.g. 192.168.1.xxx -> 192.168.1.0/24)
    const parts = rawIp.split('.');
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.${parts[2]}.xxx`;
    }
  } else if (rawIp.includes(':')) {
    // IPv6: Mask prefix
    const parts = rawIp.split(':');
    return `${parts.slice(0, 3).join(':')}::xxxx`;
  }
  return 'anonymized';
}

/**
 * In-memory Token-Bucket Rate Limiter
 * Returns { success: boolean, limit: number, remaining: number, reset: number }
 */
export function checkRateLimit(
  key: string,
  limit: number = 60,
  windowMs: number = 60000
): { success: boolean; limit: number; remaining: number; reset: number } {
  const now = Date.now();
  const record = rateLimitStore.get(key);

  // Clean up old entries periodically
  if (rateLimitStore.size > 2000) {
    for (const [k, v] of rateLimitStore.entries()) {
      if (now > v.resetTime) {
        rateLimitStore.delete(k);
      }
    }
  }

  if (!record || now > record.resetTime) {
    const resetTime = now + windowMs;
    rateLimitStore.set(key, { count: 1, resetTime });
    return {
      success: true,
      limit,
      remaining: limit - 1,
      reset: Math.ceil(resetTime / 1000),
    };
  }

  if (record.count >= limit) {
    return {
      success: false,
      limit,
      remaining: 0,
      reset: Math.ceil(record.resetTime / 1000),
    };
  }

  record.count += 1;
  return {
    success: true,
    limit,
    remaining: limit - record.count,
    reset: Math.ceil(record.resetTime / 1000),
  };
}

/**
 * Constant-time string equality check to prevent timing attacks
 */
export function safeEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  // Hash first so timingSafeEqual always receives equal-length buffers and
  // does not leak the configured secret's length through an early return.
  const digestA = crypto.createHash('sha256').update(a, 'utf8').digest();
  const digestB = crypto.createHash('sha256').update(b, 'utf8').digest();
  return crypto.timingSafeEqual(digestA, digestB);
}

/**
 * The browser cookie never contains APP_ACCESS_TOKEN itself. It contains a
 * deterministic, fixed-length session proof derived from the configured token.
 */
export function createAccessSessionToken(accessToken: string): string {
  return crypto
    .createHash('sha256')
    .update(`${ACCESS_TOKEN_HASH_PREFIX}${accessToken}`, 'utf8')
    .digest('base64url');
}

export function getConfiguredAccessToken(): string | null {
  const token = process.env.APP_ACCESS_TOKEN?.trim();
  return token && token.length >= 16 ? token : null;
}

export function validateAppAccessToken(providedToken: string): boolean {
  const configuredToken = getConfiguredAccessToken();
  return Boolean(configuredToken && safeEqual(providedToken.trim(), configuredToken));
}

export function validateAccessSession(sessionToken: string): boolean {
  const configuredToken = getConfiguredAccessToken();
  return Boolean(
    configuredToken &&
      safeEqual(sessionToken, createAccessSessionToken(configuredToken))
  );
}

function isLocalRequest(req: NextRequest): boolean {
  // nextUrl is derived by the framework; do not trust a caller-supplied
  // X-Forwarded-Host to turn a remote request into a localhost bypass.
  const hostname = req.nextUrl.hostname.toLowerCase();
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

/**
 * Validates CRON execution secret against environment CRON_SECRET
 */
export function validateCronSecret(req: NextRequest, endpointName: string = 'cron'): { authorized: boolean; reason?: string } {
  const configuredSecret = process.env.CRON_SECRET?.trim();
  const authHeader = req.headers.get('authorization') || '';
  const xCronHeader = req.headers.get('x-cron-secret') || '';
  const clientIp = getAnonymizedClientIp(req);

  let providedToken = '';
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    providedToken = authHeader.slice(7).trim();
  } else if (xCronHeader) {
    providedToken = xCronHeader.trim();
  }

  if (
    process.env.NODE_ENV === 'production' &&
    configuredSecret &&
    configuredSecret.length < 16
  ) {
    logSecurityEvent({
      type: 'CRON_AUTH_FAILURE',
      endpoint: endpointName,
      ipMasked: clientIp,
      details: 'Cron-jobb avvist fordi CRON_SECRET er kortere enn 16 tegn',
      severity: 'error',
    });
    return { authorized: false, reason: 'CRON_SECRET is configured insecurely' };
  }

  // If CRON_SECRET is configured in environment, enforce strict match
  if (configuredSecret && configuredSecret.length > 0) {
    if (!providedToken || !safeEqual(providedToken, configuredSecret)) {
      logSecurityEvent({
        type: 'CRON_AUTH_FAILURE',
        endpoint: endpointName,
        ipMasked: clientIp,
        details: 'Uautorisert forsøk på å kjøre cron-jobb (ugyldig eller manglende CRON_SECRET)',
        severity: 'warn',
      });
      return { authorized: false, reason: 'Unauthorized: Invalid or missing CRON_SECRET token' };
    }

    logSecurityEvent({
      type: 'CRON_AUTH_SUCCESS',
      endpoint: endpointName,
      ipMasked: clientIp,
      details: 'Cron-jobb autentisert med gyldig hemmelig nøkkel',
      severity: 'info',
    });
    return { authorized: true };
  }

  // Local development stays convenient. Any production/remote deployment is
  // fail-closed when CRON_SECRET has not been configured.
  if (process.env.NODE_ENV !== 'production' && isLocalRequest(req)) {
    return { authorized: true };
  }

  logSecurityEvent({
    type: 'CRON_AUTH_FAILURE',
    endpoint: endpointName,
    ipMasked: clientIp,
    details: 'Cron-jobb avvist fordi CRON_SECRET ikke er konfigurert',
    severity: 'error',
  });
  return { authorized: false, reason: 'CRON_SECRET is not configured' };
}

/**
 * Validates Origin / Referer for state-changing requests to prevent CSRF
 */
export function validateCsrfOrigin(req: NextRequest, endpointName: string): { valid: boolean; reason?: string } {
  // Non-mutating methods do not require CSRF origin validation
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return { valid: true };
  }

  const origin = req.headers.get('origin');
  const referer = req.headers.get('referer');
  const host = req.headers.get('host')?.split(',')[0].trim().toLowerCase();
  const requestOrigins = new Set([req.nextUrl.origin.toLowerCase()]);
  if (host) {
    try {
      requestOrigins.add(new URL(`${req.nextUrl.protocol}//${host}`).origin.toLowerCase());
    } catch {
      // Ignore an invalid Host header; the framework-derived origin remains.
    }
  }
  const secFetchSite = req.headers.get('sec-fetch-site');

  const reject = (reason: string) => {
    logSecurityEvent({
      type: 'CSRF_BLOCKED',
      endpoint: endpointName,
      ipMasked: getAnonymizedClientIp(req),
      details: reason,
      severity: 'warn',
    });
    return { valid: false, reason };
  };

  if (secFetchSite === 'cross-site') {
    return reject('Forespørselen kom fra et annet nettsted');
  }

  // Browsers normally send Origin for mutating fetches/forms. Referer is a
  // conservative fallback for clients which omit Origin.
  const source = origin || referer;
  if (!source) {
    if (secFetchSite === 'same-origin') {
      return { valid: true };
    }
    if (process.env.NODE_ENV !== 'production' && isLocalRequest(req)) {
      return { valid: true };
    }
    return reject('Manglende Origin/Referer på endrende forespørsel');
  }

  try {
    const sourceUrl = new URL(source);
    if (sourceUrl.protocol !== 'http:' && sourceUrl.protocol !== 'https:') {
      return reject('Ugyldig protokoll i Origin/Referer');
    }

    const sourceOrigin = sourceUrl.origin.toLowerCase();
    const allowedOrigins = (process.env.APP_ALLOWED_ORIGINS || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
      .some((value) => {
        try {
          return new URL(value).origin === sourceUrl.origin;
        } catch {
          return false;
        }
      });

    if (requestOrigins.has(sourceOrigin) || allowedOrigins) {
      return { valid: true };
    }

    return reject(`Origin/Referer er ikke tillatt for ${endpointName}`);
  } catch {
    return reject('Ugyldig Origin/Referer');
  }
}

/**
 * Mask sensitive API secrets (e.g. Frost Client ID)
 */
export function maskSecret(secret?: string, visiblePrefix: number = 4, visibleSuffix: number = 4): string {
  if (!secret || secret.trim() === '') return '';
  const trimmed = secret.trim();
  if (trimmed.length <= (visiblePrefix + visibleSuffix + 2)) {
    return '••••••••••••';
  }
  const start = trimmed.substring(0, visiblePrefix);
  const end = trimmed.substring(trimmed.length - visibleSuffix);
  const mask = '•'.repeat(Math.min(trimmed.length - (visiblePrefix + visibleSuffix), 16));
  return `${start}${mask}${end}`;
}

/**
 * Strict Coordinate Validation
 */
export function validateCoordinates(
  lat: unknown,
  lon: unknown,
  alt: unknown = null
): { valid: boolean; latitude?: number; longitude?: number; altitude?: number | null; error?: string } {
  const parseNum = (v: unknown): number => {
    if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
    if (typeof v === 'string') {
      const normalized = v.replace(',', '.').trim();
      return normalized === '' ? NaN : Number(normalized);
    }
    return NaN;
  };

  const latitude = parseNum(lat);
  const longitude = parseNum(lon);
  const hasAltitude = alt !== undefined && alt !== null && alt !== '';
  const altitude = hasAltitude ? parseNum(alt) : null;

  if (isNaN(latitude) || latitude < -90 || latitude > 90) {
    return { valid: false, error: 'Ugyldig breddegrad (må være mellom -90 og 90 grader)' };
  }

  if (isNaN(longitude) || longitude < -180 || longitude > 180) {
    return { valid: false, error: 'Ugyldig lengdegrad (må være mellom -180 og 180 grader)' };
  }

  if (altitude !== null && (isNaN(altitude) || altitude < -500 || altitude > 9000)) {
    return { valid: false, error: 'Ugyldig høyde over havet (må være mellom -500m og 9000m)' };
  }

  return { valid: true, latitude, longitude, altitude };
}

/**
 * Strict Calibration Offsets Validation
 */
export function validateCalibrationOffsets(offsets: any): { valid: boolean; error?: string; cleaned?: any } {
  if (!offsets || typeof offsets !== 'object') {
    return { valid: false, error: 'Kalibreringsoffsets må være et objekt' };
  }

  const temp = typeof offsets.temp_offset === 'number' ? offsets.temp_offset : parseFloat(offsets.temp_offset || 0);
  const humidity = typeof offsets.humidity_offset === 'number' ? offsets.humidity_offset : parseFloat(offsets.humidity_offset || 0);
  const pressure = typeof offsets.pressure_offset === 'number' ? offsets.pressure_offset : parseFloat(offsets.pressure_offset || 0);
  const windMult = typeof offsets.wind_multiplier === 'number' ? offsets.wind_multiplier : parseFloat(offsets.wind_multiplier || 1);
  const precipMult = typeof offsets.precip_multiplier === 'number' ? offsets.precip_multiplier : parseFloat(offsets.precip_multiplier || 1);

  if (isNaN(temp) || temp < -20 || temp > 20) {
    return { valid: false, error: 'Temperaturjustering må være mellom -20°C og +20°C' };
  }
  if (isNaN(humidity) || humidity < -50 || humidity > 50) {
    return { valid: false, error: 'Luftfuktighetsjustering må være mellom -50% og +50%' };
  }
  if (isNaN(pressure) || pressure < -100 || pressure > 100) {
    return { valid: false, error: 'Lufttrykksjustering må være mellom -100 hPa og +100 hPa' };
  }
  if (isNaN(windMult) || windMult < 0.1 || windMult > 5.0) {
    return { valid: false, error: 'Vindmultiplikator må være mellom 0.1 og 5.0' };
  }
  if (isNaN(precipMult) || precipMult < 0.1 || precipMult > 5.0) {
    return { valid: false, error: 'Nedbørmultiplikator må være mellom 0.1 og 5.0' };
  }

  return {
    valid: true,
    cleaned: {
      temp_offset: Math.round(temp * 100) / 100,
      humidity_offset: Math.round(humidity * 10) / 10,
      pressure_offset: Math.round(pressure * 10) / 10,
      wind_multiplier: Math.round(windMult * 100) / 100,
      precip_multiplier: Math.round(precipMult * 100) / 100,
    },
  };
}

/**
 * Sanitize text inputs against XSS and control characters
 */
export function sanitizeString(input: unknown, maxLength: number = 200): string {
  if (typeof input !== 'string') return '';
  return input
    .replace(/[<>'"\0\x08\x09\x1a\n\r]/g, '') // remove dangerous control/markup chars
    .trim()
    .slice(0, maxLength);
}

/**
 * Helper to build rate-limited response
 */
export function createRateLimitExceededResponse(reset: number): NextResponse {
  return NextResponse.json(
    {
      error: 'For mange forespørsler (Rate limit exceeded). Vennligst vent litt.',
      retryAfterSeconds: Math.max(1, reset - Math.floor(Date.now() / 1000)),
    },
    {
      status: 429,
      headers: {
        'Retry-After': String(Math.max(1, reset - Math.floor(Date.now() / 1000))),
        'Cache-Control': 'no-store',
      },
    }
  );
}
