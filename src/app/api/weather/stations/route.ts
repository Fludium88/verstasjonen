import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { WEATHER_CONFIG } from '@/lib/weatherConfig';
import { WeatherStationResolver } from '@/services/station-resolver/stationResolver';
import { FrostService } from '@/services/frost/frostService';
import { calculateHaversineDistanceKm } from '@/lib/weatherUtils';
import {
  checkRateLimit,
  createRateLimitExceededResponse,
  getAnonymizedClientIp,
  sanitizeString,
  validateCsrfOrigin,
} from '@/lib/security';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const clientIp = getAnonymizedClientIp(req);
  const rate = checkRateLimit(`stations_get_${clientIp}`, 60, 60_000);
  if (!rate.success) return createRateLimitExceededResponse(rate.reset);

  try {
    const { searchParams } = new URL(req.url);
    const rawLocationId = searchParams.get('locationId');
    const locationId = rawLocationId
      ? sanitizeString(rawLocationId, 64)
      : WEATHER_CONFIG.defaultLocation.id;
    const discover = searchParams.get('discover') === 'true';
    const db = getDb();
    const location = db.getLocation(locationId);

    if (!location) {
      return NextResponse.json({ error: 'Location not found' }, { status: 404 });
    }

    const hasFrostConfig = Boolean(FrostService.getFrostClientId());

    // If requested or if client ID is set, discover nearby stations from Frost API
    if (discover && hasFrostConfig) {
      try {
        await FrostService.discoverActiveStations(location);
      } catch (discErr) {
        console.warn('Frost station discovery warning:', discErr);
      }
    }

    const recommendations = WeatherStationResolver.resolveStationsForLocation(location);
    const rawStations = db.getStations();
    const mappings = db.getStationMappings(location.id);

    // Annotate all stations with accurate distance from the selected location
    const allStations = rawStations
      .map((st) => {
        const dist = calculateHaversineDistanceKm(
          location.latitude,
          location.longitude,
          st.latitude,
          st.longitude
        );
        return {
          ...st,
          distance_km: Math.round(dist * 10) / 10,
        };
      })
      .sort((a, b) => (a.distance_km ?? 9999) - (b.distance_km ?? 9999));

    return NextResponse.json({
      location,
      recommendations,
      allStations,
      mappings,
      frostConfigured: hasFrostConfig,
      totalStationsCount: allStations.length,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to fetch stations' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const clientIp = getAnonymizedClientIp(req);
  const rate = checkRateLimit(`stations_post_${clientIp}`, 30, 60_000);
  if (!rate.success) return createRateLimitExceededResponse(rate.reset);
  const csrf = validateCsrfOrigin(req, '/api/weather/stations');
  if (!csrf.valid) return NextResponse.json({ error: csrf.reason }, { status: 403 });

  try {
    const body = await req.json();
    const locationId = sanitizeString(body.locationId, 64);
    const stationId = sanitizeString(body.stationId, 64);
    const element = sanitizeString(body.element, 32);
    const allowedElements = ['temperature', 'precipitation', 'wind', 'pressure', 'humidity', 'snow'] as const;
    if (!locationId || !stationId || !allowedElements.includes(element as (typeof allowedElements)[number])) {
      return NextResponse.json({ error: 'Invalid station mapping' }, { status: 400 });
    }
    const safeElement = element as (typeof allowedElements)[number];
    const db = getDb();

    const station = db.getStation(stationId);
    if (!station) {
      return NextResponse.json({ error: 'Station not found' }, { status: 404 });
    }

    const location = db.getLocation(locationId);
    if (!location) return NextResponse.json({ error: 'Location not found' }, { status: 404 });
    const dist = Math.round(
      calculateHaversineDistanceKm(
        location.latitude,
        location.longitude,
        station.latitude,
        station.longitude
      ) * 10
    ) / 10;

    db.setStationMapping({
      location_id: locationId,
      element: safeElement,
      station_id: stationId,
      station_name: station.name,
      distance_km: dist,
      station_altitude: station.altitude,
    });
    db.flush();

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to update mapping' }, { status: 400 });
  }
}
