import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { MetForecastService } from '@/services/met/metForecastService';
import { FrostService } from '@/services/frost/frostService';
import { AggregationService } from '@/services/aggregation/aggregationService';
import { validateCronSecret, checkRateLimit, createRateLimitExceededResponse, getAnonymizedClientIp } from '@/lib/security';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return handleIngest(req);
}

export async function POST(req: NextRequest) {
  return handleIngest(req);
}

async function handleIngest(req: NextRequest) {
  // 1. Rate limiting check (max 10 requests / min)
  const clientIp = getAnonymizedClientIp(req);
  const rateCheck = checkRateLimit(`cron_ingest_${clientIp}`, 10, 60000);
  if (!rateCheck.success) {
    return createRateLimitExceededResponse(rateCheck.reset);
  }

  // 2. Secret authentication check
  const auth = validateCronSecret(req, '/api/cron/ingest');
  if (!auth.authorized) {
    return NextResponse.json(
      { error: auth.reason || 'Uautorisert tilgang til bakgrunnsjobb' },
      { status: 401 }
    );
  }

  const db = getDb();
  const activeLocations = db.getLocations().filter((l) => l.is_active === 1);
  const results = [];

  for (const loc of activeLocations) {
    try {
      const fc = await MetForecastService.fetchAndLogForecast(loc.id, loc.latitude, loc.longitude, loc.altitude);
      const obs = await FrostService.backfillLocationObservations(loc, 7);
      AggregationService.computeDailySummaries(loc.id);

      results.push({
        location_id: loc.id,
        name: loc.name,
        forecast_from_cache: fc.fromCache,
        observations_synced: obs.count,
        status: 'SUCCESS',
      });
    } catch (err: any) {
      results.push({
        location_id: loc.id,
        name: loc.name,
        error: err.message,
        status: 'ERROR',
      });
    }
  }

  db.flush();

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    locations_processed: results.length,
    results,
  });
}
