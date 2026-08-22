import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { WEATHER_CONFIG } from '@/lib/weatherConfig';
import { AggregationService } from '@/services/aggregation/aggregationService';
import { FrostService } from '@/services/frost/frostService';
import { measuredObservations } from '@/services/observations/observationQuality';
import { addLocalDateDays, getLocalDateKey, getLocalDayBounds, isValidLocalDate } from '@/services/time/timeZone';
import {
  bin24HoursObservations,
  calculateCircularMeanDegrees,
  formatNorwegianDate,
  formatNorwegianTime,
  getWindDirectionArrowUnicode,
  getWindDirectionCardinal8,
  getWindDirectionFullName,
} from '@/lib/weatherUtils';
import {
  checkRateLimit,
  createRateLimitExceededResponse,
  getAnonymizedClientIp,
  sanitizeString,
} from '@/lib/security';

export const dynamic = 'force-dynamic';

function computeWindRose(items: { speed: number | null; dir: number | null }[]) {
  const sectors = ['N', 'NØ', 'Ø', 'SØ', 'S', 'SV', 'V', 'NV'];
  const counts = Array(8).fill(0) as number[];
  const speedSums = Array(8).fill(0) as number[];
  const speedCounts = Array(8).fill(0) as number[];
  let total = 0;
  for (const item of items) {
    if (item.dir === null || !Number.isFinite(item.dir)) continue;
    const index = Math.round((((item.dir % 360) + 360) % 360) / 45) % 8;
    counts[index]++;
    if (item.speed !== null) {
      speedSums[index] += item.speed;
      speedCounts[index]++;
    }
    total++;
  }
  return sectors.map((sector, index) => ({
    sector,
    frequency_pct: total > 0 ? Math.round((counts[index] / total) * 1000) / 10 : 0,
    avg_speed_ms: speedCounts[index] > 0 ? Math.round((speedSums[index] / speedCounts[index]) * 10) / 10 : null,
    count: counts[index],
  }));
}

export async function GET(req: NextRequest) {
  const clientIp = getAnonymizedClientIp(req);
  const rate = checkRateLimit(`history_${clientIp}`, 60, 60_000);
  if (!rate.success) return createRateLimitExceededResponse(rate.reset);

  try {
    const { searchParams } = new URL(req.url);
    const rawLocationId = searchParams.get('locationId');
    const locationId = rawLocationId
      ? sanitizeString(rawLocationId, 64)
      : WEATHER_CONFIG.defaultLocation.id;
    const parameter = sanitizeString(searchParams.get('parameter'), 32) || 'temperature';
    const range = sanitizeString(searchParams.get('range'), 16) || '30d';
    const drilldownDate = sanitizeString(searchParams.get('date'), 10);
    const db = getDb();
    const location = db.getLocation(locationId);
    if (!location) return NextResponse.json({ error: 'Location not found' }, { status: 404 });

    const now = new Date();
    const todayKey = getLocalDateKey(now, location.timezone);
    const requestedBackfillDays: Record<string, number> = {
      '24h': 2,
      '7d': 8,
      '30d': 31,
      '3m': 95,
      '1y': 366,
      '2y': 366,
      all: 366,
    };
    let backfillDays = requestedBackfillDays[range] ?? 31;
    if (drilldownDate && isValidLocalDate(drilldownDate)) {
      const { startUtc } = getLocalDayBounds(drilldownDate, location.timezone);
      backfillDays = Math.min(366, Math.max(2, Math.ceil((now.getTime() - startUtc.getTime()) / (24 * 60 * 60 * 1000)) + 1));
    }
    // Long historical imports belong to scheduled synchronization. A request
    // returns the measured coverage already available instead of blocking a
    // serverless response on dozens of sequential Frost pages.
    const longBackfillDeferred = backfillDays > 31;
    let observations = measuredObservations(db.getObservations(location.id));
    if (observations.length < 24 && FrostService.getFrostClientId() && !longBackfillDeferred) {
      await FrostService.backfillLocationObservations(location, backfillDays);
      observations = measuredObservations(db.getObservations(location.id));
    } else if (
      observations.length > 0 &&
      FrostService.getFrostClientId() &&
      Date.now() - new Date(observations[observations.length - 1].observed_at).getTime() > 48 * 60 * 60 * 1000
    ) {
      await FrostService.backfillLocationObservations(location, Math.min(8, backfillDays));
      observations = measuredObservations(db.getObservations(location.id));
    }
    if (observations.length > 0) AggregationService.computeDailySummaries(location.id);
    const stationMappings = new Map(
      db.getStationMappings(location.id).map((mapping) => [mapping.element, mapping.station_id])
    );

    const responseHeaders = {
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Data-Source': 'measured-observations',
    };

    if (drilldownDate) {
      if (!isValidLocalDate(drilldownDate)) {
        return NextResponse.json({ error: 'Invalid date' }, { status: 400 });
      }
      const { startUtc, endUtc } = getLocalDayBounds(drilldownDate, location.timezone);
      const dayObservations = observations.filter((observation) => {
        const timestamp = new Date(observation.observed_at).getTime();
        return timestamp >= startUtc.getTime() && timestamp < endUtc.getTime();
      });
      const dailySummary = db.getDailySummaries(location.id, drilldownDate, drilldownDate)[0];
      const hourly = dayObservations.map((observation) => ({
        time: observation.observed_at,
        hour_display: formatNorwegianTime(observation.observed_at, {
          hour: '2-digit',
          minute: '2-digit',
          timeZone: location.timezone,
        }),
        temperature: observation.air_temperature,
        precipitation: observation.precipitation_amount,
        wind_speed: observation.wind_speed,
        wind_gust: observation.wind_gust,
        wind_direction: observation.wind_direction,
        wind_cardinal: getWindDirectionCardinal8(observation.wind_direction),
        wind_arrow: getWindDirectionArrowUnicode(observation.wind_direction),
        wind_name: getWindDirectionFullName(observation.wind_direction),
        pressure: observation.air_pressure,
        humidity: observation.relative_humidity,
        snow_depth: observation.snow_depth,
        source: observation.source,
        quality_code: observation.quality_code,
      }));
      return NextResponse.json(
        {
          type: 'DAY_EXPLORER',
          date: drilldownDate,
          summary: dailySummary
            ? {
                ...dailySummary,
                wind_dominant_cardinal: getWindDirectionCardinal8(dailySummary.wind_dominant_direction),
                wind_dominant_arrow: getWindDirectionArrowUnicode(dailySummary.wind_dominant_direction),
                wind_dominant_name: getWindDirectionFullName(dailySummary.wind_dominant_direction),
              }
            : null,
          hourly,
          data_status: hourly.length > 0 ? 'MEASURED' : longBackfillDeferred ? 'PARTIAL' : 'UNAVAILABLE',
          data_availability: {
            long_backfill_deferred: longBackfillDeferred,
            message: longBackfillDeferred
              ? 'Lang historikk synkroniseres separat. Responsen viser tilgjengelige målinger.'
              : null,
          },
        },
        { headers: responseHeaders }
      );
    }

    let fromDate: string;
    let isHourly = false;
    if (range === '24h') {
      isHourly = true;
      fromDate = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    } else {
      const rangeDays: Record<string, number | null> = {
        '7d': 7,
        '30d': 30,
        '3m': 90,
        '1y': 365,
        '2y': 730,
        all: null,
      };
      const requestedFrom = sanitizeString(searchParams.get('fromDate'), 10);
      if (range === 'custom' && requestedFrom && isValidLocalDate(requestedFrom)) {
        fromDate = requestedFrom;
      } else if (rangeDays[range] === null) {
        fromDate = '1970-01-01';
      } else {
        const days = rangeDays[range] ?? 30;
        fromDate = addLocalDateDays(todayKey, -(Math.max(1, days) - 1));
      }
    }
    const requestedTo = sanitizeString(searchParams.get('toDate'), 10);
    const toDate = requestedTo && isValidLocalDate(requestedTo) ? requestedTo : undefined;
    const records = AggregationService.getAllTimeRecords(location.id);
    const rainEvents = AggregationService.getRainEvents(location.id, 6);

    if (isHourly) {
      const hourlyObservations = observations.filter(
        (observation) => observation.observed_at >= fromDate
      );
      const binned = bin24HoursObservations(
        hourlyObservations,
        now,
        null,
        null,
        null,
        undefined,
        {
          air_temperature: stationMappings.get('temperature'),
          relative_humidity: stationMappings.get('humidity'),
          air_pressure: stationMappings.get('pressure'),
          precipitation_amount: stationMappings.get('precipitation'),
          wind_speed: stationMappings.get('wind'),
          wind_gust: stationMappings.get('wind'),
          wind_direction: stationMappings.get('wind'),
          snow_depth: stationMappings.get('snow'),
        }
      );
      const points = binned.map((point) => ({
        date: point.time,
        label: point.display_time,
        temp_avg: point.temperature,
        temp_min: point.temp_min,
        temp_max: point.temp_max,
        precip_total: point.precipitation,
        wind_avg: point.wind_speed,
        wind_gust_max: point.wind_gust,
        wind_dominant_direction: point.wind_direction,
        wind_dominant_cardinal: getWindDirectionCardinal8(point.wind_direction),
        wind_dominant_arrow: getWindDirectionArrowUnicode(point.wind_direction),
        wind_dominant_name: getWindDirectionFullName(point.wind_direction),
        pressure_avg: point.pressure,
        humidity_avg: point.humidity,
        source_type: point.source_type,
      }));
      const temperatures = binned.map((item) => item.temperature).filter((value): value is number => value !== null);
      const precipitation = binned.map((item) => item.precipitation).filter((value): value is number => value !== null);
      const winds = binned.map((item) => item.wind_speed).filter((value): value is number => value !== null);
      const gusts = binned.map((item) => item.wind_gust).filter((value): value is number => value !== null);
      const directionPoints = binned.filter((item) => item.wind_direction !== null);
      const dominantDirection = calculateCircularMeanDegrees(
        directionPoints.map((item) => item.wind_direction),
        directionPoints.map((item) => item.wind_speed)
      );
      return NextResponse.json(
        {
          type: 'HOURLY',
          range,
          parameter,
          points,
          stats: {
            temp_avg: temperatures.length ? Math.round((temperatures.reduce((a, b) => a + b, 0) / temperatures.length) * 10) / 10 : null,
            temp_min: temperatures.length ? Math.min(...temperatures) : null,
            temp_max: temperatures.length ? Math.max(...temperatures) : null,
            precip_total: precipitation.length ? Math.round(precipitation.reduce((a, b) => a + b, 0) * 10) / 10 : null,
            precip_rainy_days: precipitation.length ? precipitation.filter((value) => value > 0).length : null,
            precip_max_event: precipitation.length ? Math.max(...precipitation) : null,
            wind_avg: winds.length ? Math.round((winds.reduce((a, b) => a + b, 0) / winds.length) * 10) / 10 : null,
            wind_max: winds.length ? Math.max(...winds) : null,
            wind_gust_max: gusts.length ? Math.max(...gusts) : null,
            wind_dominant_direction: dominantDirection,
            wind_dominant_cardinal: getWindDirectionCardinal8(dominantDirection),
            wind_dominant_arrow: getWindDirectionArrowUnicode(dominantDirection),
            wind_dominant_name: getWindDirectionFullName(dominantDirection),
          },
          wind_rose: computeWindRose(binned.map((item) => ({ speed: item.wind_speed, dir: item.wind_direction }))),
          rain_events: rainEvents,
          records,
          data_status: hourlyObservations.length > 0 ? 'MEASURED' : longBackfillDeferred ? 'PARTIAL' : 'UNAVAILABLE',
          data_availability: {
            long_backfill_deferred: longBackfillDeferred,
            message: longBackfillDeferred
              ? 'Lang historikk synkroniseres separat. Responsen viser tilgjengelige målinger.'
              : null,
          },
        },
        { headers: responseHeaders }
      );
    }

    const daily = db.getDailySummaries(location.id, fromDate, toDate);
    const monthly = db.getMonthlySummaries(location.id);
    const points = daily.map((day) => {
      const { startUtc, endUtc } = getLocalDayBounds(day.date, location.timezone);
      const midday = new Date((startUtc.getTime() + endUtc.getTime()) / 2);
      return {
        date: day.date,
        label: formatNorwegianDate(midday, {
          day: 'numeric',
          month: range === '2y' || range === 'all' ? 'numeric' : 'short',
          ...(range === '2y' || range === 'all' ? { year: '2-digit' as const } : {}),
          timeZone: location.timezone,
        }),
        temp_avg: day.temperature_avg,
        temp_min: day.temperature_min,
        temp_max: day.temperature_max,
        precip_total: day.precipitation_total,
        precip_max_hour: day.precipitation_max_hour,
        wind_avg: day.wind_avg,
        wind_max: day.wind_max,
        wind_gust_max: day.wind_gust_max,
        wind_dominant_direction: day.wind_dominant_direction,
        wind_dominant_cardinal: getWindDirectionCardinal8(day.wind_dominant_direction),
        wind_dominant_arrow: getWindDirectionArrowUnicode(day.wind_dominant_direction),
        wind_dominant_name: getWindDirectionFullName(day.wind_dominant_direction),
        pressure_avg: day.pressure_avg,
        humidity_avg: day.humidity_avg,
        dominant_symbol: day.dominant_symbol,
      };
    });
    const temperaturesAvg = daily.map((day) => day.temperature_avg).filter((value): value is number => value !== null);
    const temperaturesMin = daily.map((day) => day.temperature_min).filter((value): value is number => value !== null);
    const temperaturesMax = daily.map((day) => day.temperature_max).filter((value): value is number => value !== null);
    const precipitation = daily.map((day) => day.precipitation_total).filter((value): value is number => value !== null);
    const hourlyPrecipitationMax = daily.map((day) => day.precipitation_max_hour).filter((value): value is number => value !== null);
    const winds = daily.map((day) => day.wind_avg).filter((value): value is number => value !== null);
    const gusts = daily.map((day) => day.wind_gust_max).filter((value): value is number => value !== null);
    const directionDays = daily.filter((day) => day.wind_dominant_direction !== null);
    const dominantDirection = calculateCircularMeanDegrees(
      directionDays.map((day) => day.wind_dominant_direction),
      directionDays.map((day) => day.wind_avg)
    );

    return NextResponse.json(
      {
        type: 'DAILY',
        range,
        parameter,
        points,
        monthly: [...monthly].reverse().map((month) => ({
          ...month,
          wind_dominant_cardinal: month.wind_dominant_cardinal || getWindDirectionCardinal8(month.wind_dominant_direction),
          wind_dominant_arrow: getWindDirectionArrowUnicode(month.wind_dominant_direction),
          wind_dominant_name: getWindDirectionFullName(month.wind_dominant_direction),
        })),
        stats: {
          temp_avg: temperaturesAvg.length ? Math.round((temperaturesAvg.reduce((a, b) => a + b, 0) / temperaturesAvg.length) * 10) / 10 : null,
          temp_min: temperaturesMin.length ? Math.min(...temperaturesMin) : null,
          temp_max: temperaturesMax.length ? Math.max(...temperaturesMax) : null,
          precip_total: precipitation.length ? Math.round(precipitation.reduce((a, b) => a + b, 0) * 10) / 10 : null,
          precip_rainy_days: daily.length ? daily.filter((day) => day.precipitation_total !== null && day.precipitation_total >= 0.1).length : null,
          precip_max_day: precipitation.length ? Math.max(...precipitation) : null,
          precip_max_hour: hourlyPrecipitationMax.length ? Math.max(...hourlyPrecipitationMax) : null,
          wind_avg: winds.length ? Math.round((winds.reduce((a, b) => a + b, 0) / winds.length) * 10) / 10 : null,
          wind_max: winds.length ? Math.max(...winds) : null,
          wind_gust_max: gusts.length ? Math.max(...gusts) : null,
          wind_dominant_direction: dominantDirection,
          wind_dominant_cardinal: getWindDirectionCardinal8(dominantDirection),
          wind_dominant_arrow: getWindDirectionArrowUnicode(dominantDirection),
          wind_dominant_name: getWindDirectionFullName(dominantDirection),
        },
        wind_rose: computeWindRose(daily.map((day) => ({ speed: day.wind_avg, dir: day.wind_dominant_direction }))),
        rain_events: rainEvents,
        records,
        data_status: daily.length > 0 ? 'MEASURED' : longBackfillDeferred ? 'PARTIAL' : 'UNAVAILABLE',
        data_availability: {
          long_backfill_deferred: longBackfillDeferred,
          message: longBackfillDeferred
            ? 'Lang historikk synkroniseres separat. Responsen viser tilgjengelige målinger.'
            : null,
        },
      },
      { headers: responseHeaders }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to fetch history' },
      { status: 500 }
    );
  }
}
