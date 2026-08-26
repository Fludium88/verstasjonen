import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { WEATHER_CONFIG } from '@/lib/weatherConfig';
import {
  getForecastSourceLabel,
  MetForecastService,
} from '@/services/met/metForecastService';
import { formatWeatherSymbolName, getWindDirectionCardinal8, formatNorwegianTime, formatNorwegianDate } from '@/lib/weatherUtils';
import { getLocalDateKey, getLocalDayBounds } from '@/services/time/timeZone';
import {
  checkRateLimit,
  createRateLimitExceededResponse,
  getAnonymizedClientIp,
  sanitizeString,
} from '@/lib/security';

export const dynamic = 'force-dynamic';
const HOUR_MS = 60 * 60 * 1000;

type PrecipitationIntervalItem = {
  valid_at: string;
  precipitation: number | null;
  precipitation_period_hours?: number;
};

function summarizePrecipitationWindow(
  items: PrecipitationIntervalItem[],
  windowStartMs: number,
  windowEndMs: number
): { total: number | null; coverageHours: number } {
  const candidates = items
    .map((item) => ({
      item,
      start: Date.parse(item.valid_at),
      period: item.precipitation_period_hours,
    }))
    .filter(
      ({ item, start, period }) =>
        Number.isFinite(start) &&
        item.precipitation !== null &&
        Number.isFinite(item.precipitation) &&
        typeof period === 'number' &&
        Number.isFinite(period) &&
        period > 0 &&
        period <= 12
    )
    .sort((a, b) => a.start - b.start || a.period! - b.period!);

  let cursor = windowStartMs;
  let total = 0;
  let coverageHours = 0;
  let hasGap = false;
  for (const candidate of candidates) {
    const end = candidate.start + candidate.period! * HOUR_MS;
    if (candidate.start < windowStartMs || candidate.start < cursor) continue;
    if (candidate.start >= windowEndMs) break;
    if (end > windowEndMs) continue; // A multi-hour total cannot safely be prorated.
    if (candidate.start > cursor + 60_000) hasGap = true;
    total += candidate.item.precipitation!;
    coverageHours += candidate.period!;
    cursor = end;
  }

  const expectedHours = (windowEndMs - windowStartMs) / HOUR_MS;
  const complete = !hasGap && cursor >= windowEndMs - 60_000 && coverageHours >= expectedHours - 0.01;
  return {
    total: complete ? Math.round(total * 10) / 10 : null,
    coverageHours: Math.round(coverageHours * 100) / 100,
  };
}

export async function GET(req: NextRequest) {
  const clientIp = getAnonymizedClientIp(req);
  const rate = checkRateLimit(`forecast_${clientIp}`, 60, 60_000);
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

    let forecastResult: Awaited<ReturnType<typeof MetForecastService.fetchAndLogForecast>> | null = null;
    try {
      forecastResult = await MetForecastService.fetchAndLogForecast(
        location.id,
        location.latitude,
        location.longitude,
        location.altitude
      );
    } catch (forecastErr) {
      console.warn('MET Locationforecast fetch warning (will fallback to cache/DB):', forecastErr);
    }

    let nowcast: {
      available: boolean;
      validAt: string | null;
      precipitationAmount1h: number | null;
      symbol: string | null;
    } = {
      available: false,
      validAt: null,
      precipitationAmount1h: null,
      symbol: null,
    };
    try {
      nowcast = await MetForecastService.fetchNowcast(
        location.latitude,
        location.longitude,
        location.altitude
      );
    } catch (nowcastErr) {
      console.warn('MET Nowcast fetch warning:', nowcastErr);
    }

    const forecastValues = forecastResult?.values ?? [];
    const forecastSourceLabel = getForecastSourceLabel(forecastResult?.isDelayed);

    const now = new Date();
    const nowMs = now.getTime();
    const futureValues = forecastValues.filter(
      (forecast) => new Date(forecast.valid_at).getTime() >= nowMs
    );

    // 1. Next hours timeline (hourly)
    const hourlyItems = futureValues.slice(0, 48).map((f, idx) => {
      const forecastTimeMs = Date.parse(f.valid_at);
      const nowcastTimeMs = nowcast.validAt ? Date.parse(nowcast.validAt) : Number.NaN;
      const isAlignedNowcast =
        idx === 0 &&
        nowcast.available &&
        Number.isFinite(nowcastTimeMs) &&
        Math.abs(forecastTimeMs - nowcastTimeMs) <= 15 * 60_000;
      const radarPrecipitation = isAlignedNowcast && nowcast.precipitationAmount1h !== null;
      const radarSymbol = isAlignedNowcast && Boolean(nowcast.symbol);
      const dt = new Date(f.valid_at);
      return {
        valid_at: f.valid_at,
        time_display: formatNorwegianTime(dt, { hour: '2-digit', minute: '2-digit', timeZone: location.timezone }),
        date_display: formatNorwegianDate(dt, { weekday: 'short', day: 'numeric', month: 'short', timeZone: location.timezone }),
        temperature: f.temperature,
        feels_like: f.feels_like,
        precipitation: radarPrecipitation ? nowcast.precipitationAmount1h : f.precipitation,
        precipitation_probability: f.precipitation_probability,
        wind_speed: f.wind_speed,
        wind_gust: f.wind_gust,
        wind_direction: f.wind_direction,
        wind_cardinal: getWindDirectionCardinal8(f.wind_direction),
        precipitation_period_hours: radarPrecipitation ? 1 : f.precipitation_period_hours,
        symbol_code: radarSymbol ? nowcast.symbol : f.symbol_code,
        weather_text: (radarSymbol && nowcast.symbol) || f.symbol_code
          ? formatWeatherSymbolName(radarSymbol && nowcast.symbol ? nowcast.symbol : f.symbol_code)
          : 'Ukjent',
        humidity: f.humidity,
        pressure: f.pressure,
        source_type:
          radarPrecipitation || radarSymbol
            ? 'MIXED'
            : 'WEATHER_MODEL',
        precipitation_source_type: radarPrecipitation
          ? 'RADAR_NOWCAST'
          : 'WEATHER_MODEL',
        symbol_source_type: radarSymbol
          ? 'RADAR_NOWCAST'
          : 'WEATHER_MODEL',
        source_badge:
          radarPrecipitation || radarSymbol
            ? `${forecastSourceLabel}; nedbør/symbol fra MET radarnowcast`
            : forecastSourceLabel,
      };
    });

    // 2. Expected 48h Precipitation Accumulation Breakdown
    const sumPrecip = (hours: number): number | null =>
      hourlyItems.length === 0
        ? null
        : summarizePrecipitationWindow(
            hourlyItems,
            Date.parse(hourlyItems[0].valid_at),
            Date.parse(hourlyItems[0].valid_at) + hours * HOUR_MS
          ).total;

    const precipAccumulation = {
      next_6h_mm: sumPrecip(6),
      next_12h_mm: sumPrecip(12),
      next_24h_mm: sumPrecip(24),
      next_48h_mm: sumPrecip(48),
    };

    // 3. 10-day Daily Forecast Cards
    const dayGroups = new Map<string, typeof futureValues>();
    for (const f of futureValues) {
      const dayKey = getLocalDateKey(f.valid_at, location.timezone);
      if (!dayGroups.has(dayKey)) dayGroups.set(dayKey, []);
      dayGroups.get(dayKey)!.push(f);
    }

    const dailyForecasts = Array.from(dayGroups.entries()).map(([dateStr, items]) => {
      const bounds = getLocalDayBounds(dateStr, location.timezone);
      const dt = new Date((bounds.startUtc.getTime() + bounds.endUtc.getTime()) / 2);
      const temps = items.map((i) => i.temperature).filter((t): t is number => t !== null);
      const winds = items.map((i) => i.wind_speed).filter((w): w is number => w !== null);
      const gusts = items.map((i) => i.wind_gust).filter((g): g is number => g !== null);

      const symbolCounts = new Map<string, number>();
      for (const item of items) {
        if (item.symbol_code) {
          symbolCounts.set(item.symbol_code, (symbolCounts.get(item.symbol_code) || 0) + 1);
        }
      }
      let dominantSymbol: string | null = null;
      let maxCount = 0;
      for (const [sym, count] of symbolCounts.entries()) {
        if (count > maxCount) {
          maxCount = count;
          dominantSymbol = sym;
        }
      }

      const precipitationStart = Math.max(
        bounds.startUtc.getTime(),
        futureValues.length > 0 ? Date.parse(futureValues[0].valid_at) : nowMs
      );
      const precipitationSummary = summarizePrecipitationWindow(
        items,
        precipitationStart,
        bounds.endUtc.getTime()
      );

      return {
        date: dateStr,
        day_name: formatNorwegianDate(dt, { weekday: 'long', timeZone: location.timezone }),
        date_formatted: formatNorwegianDate(dt, { day: 'numeric', month: 'long', timeZone: location.timezone }),
        temp_min: temps.length > 0 ? Math.min(...temps) : null,
        temp_max: temps.length > 0 ? Math.max(...temps) : null,
        precip_total: precipitationSummary.total,
        precip_coverage_hours: precipitationSummary.coverageHours,
        wind_max: winds.length > 0 ? Math.max(...winds) : null,
        wind_gust_max: gusts.length > 0 ? Math.max(...gusts) : null,
        symbol_code: dominantSymbol,
        weather_text: dominantSymbol ? formatWeatherSymbolName(dominantSymbol) : 'Ukjent',
      };
    });

    return NextResponse.json({
      location,
      hourly: hourlyItems,
      accumulation: precipAccumulation,
      daily: dailyForecasts,
      radar_available: nowcast.available,
      forecast_run: forecastResult
        ? {
            retrieved_at: forecastResult.run.retrieved_at,
            model_run: forecastResult.run.model_run,
            is_delayed: forecastResult.isDelayed,
            source: forecastResult.run.source,
            source_label: forecastSourceLabel,
          }
        : null,
    }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to fetch forecast' }, { status: 500 });
  }
}
