import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { WEATHER_CONFIG } from '@/lib/weatherConfig';
import { ForecastVerificationService } from '@/services/forecast-verification/forecastVerificationService';
import {
  checkRateLimit,
  createRateLimitExceededResponse,
  getAnonymizedClientIp,
  sanitizeString,
} from '@/lib/security';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const clientIp = getAnonymizedClientIp(req);
  const rate = checkRateLimit(`accuracy_${clientIp}`, 30, 60_000);
  if (!rate.success) return createRateLimitExceededResponse(rate.reset);

  try {
    const { searchParams } = new URL(req.url);
    const rawLocationId = searchParams.get('locationId');
    const locationId = rawLocationId
      ? sanitizeString(rawLocationId, 64)
      : WEATHER_CONFIG.defaultLocation.id;
    const db = getDb();
    const location = db.getLocation(locationId);

    if (!location) {
      return NextResponse.json({ error: 'Location not found' }, { status: 404 });
    }

    const accuracyData = ForecastVerificationService.evaluateAccuracy(location.id);

    return NextResponse.json({
      location,
      metrics: accuracyData.metrics,
      recentPairs: accuracyData.recentPairs,
      availability: accuracyData.availability,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to calculate forecast accuracy' }, { status: 500 });
  }
}
