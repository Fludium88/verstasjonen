import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { WEATHER_CONFIG } from '@/lib/weatherConfig';
import { AstronomyService } from '@/services/astronomy/astronomyService';
import { MetForecastService } from '@/services/met/metForecastService';
import { AstronomyPayload } from '@/types/astronomy';
import { getLocalDateKey, getLocalDayBounds, isValidLocalDate } from '@/services/time/timeZone';
import {
  checkRateLimit,
  createRateLimitExceededResponse,
  getAnonymizedClientIp,
  sanitizeString,
} from '@/lib/security';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const clientIp = getAnonymizedClientIp(req);
  const rate = checkRateLimit(`astronomy_${clientIp}`, 120, 60000);
  if (!rate.success) {
    return createRateLimitExceededResponse(rate.reset);
  }

  try {
    const { searchParams } = new URL(req.url);
    const db = getDb();

    const rawLocationId = searchParams.get('locationId');
    const locationId = rawLocationId ? sanitizeString(rawLocationId, 64) : WEATHER_CONFIG.defaultLocation.id;
    const location = db.getLocation(locationId);
    if (!location) return NextResponse.json({ error: 'Location not found' }, { status: 404 });

    const timezone = location.timezone || 'Europe/Oslo';
    const todayDateStr = getLocalDateKey(new Date(), timezone);
    const rawDate = searchParams.get('date');
    const dateStr = rawDate ? sanitizeString(rawDate, 10) : todayDateStr;
    if (!isValidLocalDate(dateStr)) {
      return NextResponse.json({ error: 'Invalid date' }, { status: 400 });
    }
    const safeDate = dateStr;

    const rawYear = parseInt(searchParams.get('year') || safeDate.substring(0, 4), 10);
    const year = !isNaN(rawYear) && rawYear >= 1900 && rawYear <= 2100 ? rawYear : Number(todayDateStr.slice(0, 4));

    const rawMonth = parseInt(searchParams.get('month') || safeDate.substring(5, 7), 10);
    const month = !isNaN(rawMonth) && rawMonth >= 1 && rawMonth <= 12 ? rawMonth : Number(todayDateStr.slice(5, 7));

    // Retrieve or fetch forecast values for weather correlation
    let forecastValues: any[] = [];
    try {
      const forecast = await MetForecastService.fetchAndLogForecast(
        location.id,
        location.latitude,
        location.longitude,
        location.altitude
      );
      const { startUtc, endUtc } = getLocalDayBounds(safeDate, timezone);
      forecastValues = forecast.values.filter((value) => {
        const timestamp = new Date(value.valid_at).getTime();
        return timestamp >= startUtc.getTime() && timestamp < endUtc.getTime();
      });
    } catch (err) {
      console.warn('Could not fetch forecast for astronomy correlation:', err);
    }

    const lat = location.latitude;
    const lon = location.longitude;
    const calculationAltitude = location.altitude ?? 0;

    // 1. Day summary for chosen date
    const daySummary = AstronomyService.calculateDaySummary(lat, lon, calculationAltitude, safeDate, timezone);

    // 2. 24h curve sampled at 15-min intervals
    const hourly24h = AstronomyService.calculate24hCurve(lat, lon, calculationAltitude, safeDate, timezone, forecastValues);

    // 3. Month moon data
    const monthMoonDays = AstronomyService.calculateMonthMoonData(lat, lon, calculationAltitude, year, month, timezone);

    // 4. Upcoming moon phases
    const upcomingPhases = AstronomyService.calculateUpcomingPhases(new Date(), timezone);

    // 5. Yearly Sun Analysis
    const yearlyData = AstronomyService.calculateYearlySunData(lat, lon, calculationAltitude, year, timezone);

    // 6. Weather correlation
    const weatherCorrelation = AstronomyService.correlateWeather(daySummary, forecastValues);

    const payload: AstronomyPayload = {
      location: {
        id: location.id,
        name: location.name,
        latitude: location.latitude,
        longitude: location.longitude,
        altitude: location.altitude,
        timezone,
      },
      selectedDate: safeDate,
      daySummary,
      hourly24h,
      monthMoonDays,
      upcomingPhases,
      yearlyData,
      weatherCorrelation,
    };

    return NextResponse.json(payload);
  } catch (error: any) {
    console.error('Astronomy API Error:', error);
    return NextResponse.json({ error: error.message || 'Astronomy calculation error' }, { status: 500 });
  }
}
