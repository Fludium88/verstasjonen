import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { LocationRecord } from '@/types/weather';
import {
  checkRateLimit,
  createRateLimitExceededResponse,
  getAnonymizedClientIp,
  sanitizeString,
  validateCoordinates,
  validateCsrfOrigin,
  logSecurityEvent,
} from '@/lib/security';

export const dynamic = 'force-dynamic';

function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
    return true;
  } catch {
    return false;
  }
}

function distanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const earthRadiusKm = 6371;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const deltaLat = toRadians(lat2 - lat1);
  const deltaLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(deltaLon / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function GET(req: NextRequest) {
  const clientIp = getAnonymizedClientIp(req);
  const rate = checkRateLimit(`loc_get_${clientIp}`, 120, 60000);
  if (!rate.success) {
    return createRateLimitExceededResponse(rate.reset);
  }

  const db = getDb();
  const locations = db.getLocations();
  return NextResponse.json(locations);
}

export async function POST(req: NextRequest) {
  const clientIp = getAnonymizedClientIp(req);

  const rate = checkRateLimit(`loc_post_${clientIp}`, 30, 60000);
  if (!rate.success) {
    return createRateLimitExceededResponse(rate.reset);
  }

  // 2. CSRF Origin Check
  const csrf = validateCsrfOrigin(req, '/api/locations');
  if (!csrf.valid) {
    return NextResponse.json({ error: csrf.reason }, { status: 403 });
  }

  try {
    const contentLength = Number(req.headers.get('content-length') || 0);
    if (contentLength > 32 * 1024) {
      return NextResponse.json({ error: 'Forespørselen er for stor' }, { status: 413 });
    }

    const body = await req.json();
    const db = getDb();

    const requestedId = typeof body.id === 'string' ? body.id.trim() : '';
    if (requestedId && !/^[a-zA-Z0-9_-]{1,64}$/.test(requestedId)) {
      return NextResponse.json({ error: 'Ugyldig sted-ID' }, { status: 400 });
    }
    const rawId = requestedId || `loc_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const nowIso = new Date().toISOString();

    const existing = db.getLocation(rawId);
    const actionRate = existing
      ? checkRateLimit(`loc_update_${clientIp}`, 30, 60000)
      : checkRateLimit(`loc_create_${clientIp}`, 3, 60 * 60 * 1000);
    if (!actionRate.success) {
      return createRateLimitExceededResponse(actionRate.reset);
    }

    // 3. Strict Coordinate Validation
    const coordCheck = validateCoordinates(
      body.latitude,
      body.longitude,
      body.altitude ?? existing?.altitude ?? null
    );
    if (!coordCheck.valid) {
      logSecurityEvent({
        type: 'INVALID_INPUT',
        endpoint: '/api/locations',
        ipMasked: clientIp,
        details: `Avvist ugyldige koordinater: ${coordCheck.error}`,
        severity: 'warn',
      });
      return NextResponse.json({ error: coordCheck.error }, { status: 400 });
    }

    const cleanName = sanitizeString(body.name, 100) || (existing ? existing.name : 'Ny værstasjon');
    const cleanAddress = body.address !== undefined ? sanitizeString(body.address, 250) : (existing ? existing.address : null);
    const cleanTimezone = sanitizeString(body.timezone, 50) || (existing ? existing.timezone : 'Europe/Oslo');
    if (!isValidTimezone(cleanTimezone)) {
      return NextResponse.json({ error: 'Ugyldig tidssone' }, { status: 400 });
    }

    const targetLocation: LocationRecord = {
      id: rawId,
      name: cleanName,
      latitude: coordCheck.latitude!,
      longitude: coordCheck.longitude!,
      altitude: coordCheck.altitude!,
      address: cleanAddress,
      timezone: cleanTimezone,
      is_active: 1,
      created_at: existing ? existing.created_at : nowIso,
      updated_at: nowIso,
    };

    const locationMoved = Boolean(
      existing &&
        distanceKm(
          existing.latitude,
          existing.longitude,
          targetLocation.latitude,
          targetLocation.longitude
        ) >= 1
    );
    if (locationMoved) {
      db.clearLocationWeatherData(rawId);
    }
    db.saveLocation(targetLocation);

    logSecurityEvent({
      type: 'LOCATION_MODIFIED',
      endpoint: '/api/locations',
      ipMasked: clientIp,
      details: `Sted ${existing ? 'oppdatert' : 'opprettet'}: ${targetLocation.name} (${targetLocation.id})`,
      severity: 'info',
    });

    // Keep location persistence independent from external weather APIs. The
    // dashboard/forecast/history routes fetch their own requested ranges after
    // this response, avoiding long Frost backfills and serverless timeouts.
    db.flush();
    return NextResponse.json(targetLocation, {
      status: existing ? 200 : 201,
      headers: { 'Cache-Control': 'private, no-cache, no-store, must-revalidate' },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Kunne ikke opprette sted' }, { status: 400 });
  }
}

export async function PUT(req: NextRequest) {
  const clientIp = getAnonymizedClientIp(req);

  // 1. Rate limit
  const rate = checkRateLimit(`loc_put_${clientIp}`, 30, 60000);
  if (!rate.success) {
    return createRateLimitExceededResponse(rate.reset);
  }

  // 2. CSRF Origin Check
  const csrf = validateCsrfOrigin(req, '/api/locations');
  if (!csrf.valid) {
    return NextResponse.json({ error: csrf.reason }, { status: 403 });
  }

  try {
    const body = await req.json();
    const db = getDb();
    const id = sanitizeString(body.id, 64);
    if (!id || id !== String(body.id || '').trim() || !/^[a-zA-Z0-9_-]{1,64}$/.test(id)) {
      return NextResponse.json({ error: 'Ugyldig sted-ID' }, { status: 400 });
    }
    const existing = db.getLocation(id);

    if (!existing) {
      return NextResponse.json({ error: 'Location not found' }, { status: 404 });
    }

    const lat = body.latitude !== undefined ? body.latitude : existing.latitude;
    const lon = body.longitude !== undefined ? body.longitude : existing.longitude;
    const alt = body.altitude !== undefined ? body.altitude : existing.altitude;

    const coordCheck = validateCoordinates(lat, lon, alt);
    if (!coordCheck.valid) {
      return NextResponse.json({ error: coordCheck.error }, { status: 400 });
    }

    const updatedTimezone = body.timezone !== undefined
      ? sanitizeString(body.timezone, 50)
      : existing.timezone;
    if (!isValidTimezone(updatedTimezone)) {
      return NextResponse.json({ error: 'Ugyldig tidssone' }, { status: 400 });
    }

    const updated: LocationRecord = {
      ...existing,
      name: body.name !== undefined ? sanitizeString(body.name, 100) : existing.name,
      latitude: coordCheck.latitude!,
      longitude: coordCheck.longitude!,
      altitude: coordCheck.altitude!,
      address: body.address !== undefined ? sanitizeString(body.address, 250) : existing.address,
      timezone: updatedTimezone,
      is_active: body.is_active !== undefined ? (body.is_active ? 1 : 0) : existing.is_active,
      updated_at: new Date().toISOString(),
    };

    const locationMoved =
      distanceKm(existing.latitude, existing.longitude, updated.latitude, updated.longitude) >= 1;
    if (locationMoved) {
      db.clearLocationWeatherData(id);
    }
    db.saveLocation(updated);
    logSecurityEvent({
      type: 'LOCATION_MODIFIED',
      endpoint: '/api/locations',
      ipMasked: clientIp,
      details: `Sted oppdatert: ${updated.name} (${updated.id})`,
      severity: 'info',
    });

    db.flush();
    return NextResponse.json(updated);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to update location' }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const clientIp = getAnonymizedClientIp(req);

  // 1. Rate limit
  const rate = checkRateLimit(`loc_del_${clientIp}`, 10, 60000);
  if (!rate.success) {
    return createRateLimitExceededResponse(rate.reset);
  }

  // 2. CSRF Origin Check
  const csrf = validateCsrfOrigin(req, '/api/locations');
  if (!csrf.valid) {
    return NextResponse.json({ error: csrf.reason }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const requestedId = searchParams.get('id')?.trim() || '';
  const id = sanitizeString(requestedId, 64);
  if (!id) {
    return NextResponse.json({ error: 'Missing location ID' }, { status: 400 });
  }
  if (id !== requestedId || !/^[a-zA-Z0-9_-]{1,64}$/.test(id)) {
    return NextResponse.json({ error: 'Ugyldig sted-ID' }, { status: 400 });
  }

  const db = getDb();
  if (!db.getLocation(id)) {
    return NextResponse.json({ error: 'Location not found' }, { status: 404 });
  }
  db.deleteLocation(id);
  db.flush();

  logSecurityEvent({
    type: 'LOCATION_MODIFIED',
    endpoint: '/api/locations',
    ipMasked: clientIp,
    details: `Sted slettet ID: ${id}`,
    severity: 'info',
  });

  return NextResponse.json({ success: true });
}
