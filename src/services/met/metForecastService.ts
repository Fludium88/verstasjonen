import { getDb } from '@/lib/db';
import { WEATHER_CONFIG } from '@/lib/weatherConfig';
import { roundMetCoord, calculateFeelsLike } from '@/lib/weatherUtils';
import { ForecastRun, ForecastValue } from '@/types/weather';

interface MetTimeseriesItem {
  time: string;
  data: {
    instant: {
      details: {
        air_pressure_at_sea_level?: number;
        air_temperature?: number;
        cloud_area_fraction?: number;
        dew_point_temperature?: number;
        relative_humidity?: number;
        wind_from_direction?: number;
        wind_speed?: number;
        wind_speed_of_gust?: number;
        precipitation_rate?: number;
      };
    };
    next_1_hours?: {
      summary: { symbol_code: string };
      details?: {
        precipitation_amount?: number;
        probability_of_precipitation?: number;
      };
    };
    next_6_hours?: {
      summary: { symbol_code: string };
      details?: {
        precipitation_amount?: number;
        probability_of_precipitation?: number;
      };
    };
    next_12_hours?: {
      summary: { symbol_code: string };
    };
  };
}

type ParsedMetTimeseriesItem = {
  time: string;
  timeMs: number;
  data: MetTimeseriesItem['data'];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finiteNumber(
  value: unknown,
  min = Number.NEGATIVE_INFINITY,
  max = Number.POSITIVE_INFINITY
): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
    ? value
    : null;
}

function weatherSymbol(value: unknown): string | null {
  return typeof value === 'string' && /^[a-z0-9_]{1,64}$/.test(value) ? value : null;
}

function parseTimeseriesItem(value: unknown): ParsedMetTimeseriesItem | null {
  if (!isRecord(value) || typeof value.time !== 'string') return null;
  const timeMs = Date.parse(value.time);
  if (!Number.isFinite(timeMs) || !isRecord(value.data)) return null;
  const data = value.data as unknown as MetTimeseriesItem['data'];
  if (!isRecord(data.instant) || !isRecord(data.instant.details)) return null;
  return { time: new Date(timeMs).toISOString(), timeMs, data };
}

/**
 * MET may expose a rolling next_6_hours amount at several consecutive timestamps.
 * Keep a single chronological, non-overlapping precipitation interval chain so
 * consumers cannot accidentally add overlapping six-hour totals.
 */
export function selectNonOverlappingPrecipitationValues(
  values: ForecastValue[]
): ForecastValue[] {
  const sorted = [...values].sort(
    (a, b) => Date.parse(a.valid_at) - Date.parse(b.valid_at) ||
      (a.precipitation_period_hours ?? Number.POSITIVE_INFINITY) -
        (b.precipitation_period_hours ?? Number.POSITIVE_INFINITY)
  );
  let coveredUntil = Number.NEGATIVE_INFINITY;
  const selected: ForecastValue[] = [];
  for (const value of sorted) {
    const start = Date.parse(value.valid_at);
    const period = value.precipitation_period_hours;
    if (
      !Number.isFinite(start) ||
      value.precipitation === null ||
      !Number.isFinite(value.precipitation) ||
      typeof period !== 'number' ||
      !Number.isFinite(period) ||
      period <= 0 ||
      period > 12
    ) {
      continue;
    }
    if (start < coveredUntil) continue;
    selected.push(value);
    coveredUntil = start + period * 60 * 60 * 1000;
  }
  return selected;
}

export class MetForecastService {
  /**
   * Fetches and logs Locationforecast for a specific location
   */
  static async fetchAndLogForecast(
    locationId: string,
    lat: number,
    lon: number,
    altitude?: number | null
  ): Promise<{ run: ForecastRun; values: ForecastValue[]; fromCache: boolean; isDelayed: boolean }> {
    const db = getDb();
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      throw new Error('Invalid coordinates for MET Locationforecast.');
    }
    const roundedLat = roundMetCoord(lat);
    const roundedLon = roundMetCoord(lon);
    const altInt = typeof altitude === 'number' && Number.isFinite(altitude) ? Math.round(altitude) : undefined;

    const altitudeQuery = altInt === undefined ? '' : `&altitude=${altInt}`;
    const url = `${WEATHER_CONFIG.met.locationForecastUrl}?lat=${roundedLat}&lon=${roundedLon}${altitudeQuery}`;
    const cacheKey = `met_lf_${locationId}_${roundedLat}_${roundedLon}_${altInt ?? 'unknown'}`;
    const nowIso = new Date().toISOString();

    const cachedEntry = db.getCacheEntry(cacheKey);
    const matchingRun = db
      .getForecastRuns(locationId)
      .filter(
        (run) =>
          run.latitude === roundedLat &&
          run.longitude === roundedLon &&
          run.altitude === altInt
      )
      .sort((a, b) => b.retrieved_at.localeCompare(a.retrieved_at))[0];

    const headers: Record<string, string> = {
      'User-Agent': WEATHER_CONFIG.defaultUserAgent,
      'Accept-Encoding': 'gzip, deflate',
    };

    if (matchingRun && cachedEntry?.etag) {
      headers['If-None-Match'] = cachedEntry.etag;
    } else if (matchingRun && cachedEntry?.last_modified) {
      headers['If-Modified-Since'] = cachedEntry.last_modified;
    }

    try {
      const response = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(WEATHER_CONFIG.met.timeoutMs),
      });

      if (response.status === 304 && cachedEntry) {
        // Not modified, reuse existing cached forecast run
        if (matchingRun) {
          const values = db.getForecastValuesForRun(matchingRun.id);
          return { run: matchingRun, values, fromCache: true, isDelayed: false };
        }
      }

      if (response.ok) {
        const data: unknown = await response.json();
        if (!isRecord(data) || !isRecord(data.properties)) {
          throw new Error('MET Locationforecast returned an invalid payload.');
        }
        const rawTimeseries = data.properties.timeseries;
        if (!Array.isArray(rawTimeseries)) {
          throw new Error('MET Locationforecast did not return a timeseries.');
        }
        const timeseries = rawTimeseries
          .map(parseTimeseriesItem)
          .filter((item): item is ParsedMetTimeseriesItem => item !== null)
          .sort((a, b) => a.timeMs - b.timeMs);
        if (timeseries.length === 0) {
          throw new Error('MET Locationforecast contained no valid time steps.');
        }
        const etag = response.headers.get('etag') || null;
        const lastModified = response.headers.get('last-modified') || null;
        const expires = response.headers.get('expires') || null;

        // Create immutable ForecastRun snapshot
        const runId = `fc_run_${locationId}_${Date.now()}`;
        const rawMeta = isRecord(data.properties.meta) ? data.properties.meta.updated_at : null;
        const modelRun =
          typeof rawMeta === 'string' && Number.isFinite(Date.parse(rawMeta))
            ? new Date(Date.parse(rawMeta)).toISOString()
            : nowIso;

        const runRecord: ForecastRun = {
          id: runId,
          location_id: locationId,
          source: 'MET_LOCATIONFORECAST_2_0',
          model_run: modelRun,
          retrieved_at: nowIso,
          expires_at: expires,
          created_at: nowIso,
          latitude: roundedLat,
          longitude: roundedLon,
          ...(altInt === undefined ? {} : { altitude: altInt }),
        };

        const duplicateRun = db
          .getForecastRuns(locationId)
          .find(
            (run) =>
              run.model_run === modelRun &&
              run.latitude === roundedLat &&
              run.longitude === roundedLon &&
              run.altitude === altInt
          );
        if (duplicateRun) {
          db.setCacheEntry({
            key: cacheKey,
            url,
            etag,
            last_modified: lastModified,
            expires_at: expires,
            data_json: JSON.stringify(data),
            updated_at: nowIso,
          });
          db.flush();
          return {
            run: duplicateRun,
            values: db.getForecastValuesForRun(duplicateRun.id),
            fromCache: true,
            isDelayed: false,
          };
        }

        // Parse and log all forecast values
        const retrievedTimeMs = new Date(nowIso).getTime();
        const values: ForecastValue[] = [];
        let precipitationCoveredUntil = Number.NEGATIVE_INFINITY;

        for (const ts of timeseries) {
          const validAt = ts.time;
          const validTimeMs = ts.timeMs;
          const leadTimeHours = Math.max(0, Math.round((validTimeMs - retrievedTimeMs) / (1000 * 60 * 60)));

          const inst = ts.data.instant?.details || {};
          const next1 = ts.data.next_1_hours;
          const next6 = ts.data.next_6_hours;
          const next12 = ts.data.next_12_hours;

          const temp = finiteNumber(inst.air_temperature, -100, 70);
          const windSpeed = finiteNumber(inst.wind_speed, 0, 150);
          const humidity = finiteNumber(inst.relative_humidity, 0, 100);
          const feelsLike = calculateFeelsLike(temp, windSpeed, humidity);

          const next1Precip = finiteNumber(next1?.details?.precipitation_amount, 0, 1000);
          const next6Precip = finiteNumber(next6?.details?.precipitation_amount, 0, 6000);
          const candidatePrecip = next1Precip ?? next6Precip;
          const candidatePeriodHours = next1Precip !== null ? 1 : next6Precip !== null ? 6 : undefined;
          const intervalDoesNotOverlap =
            candidatePrecip !== null &&
            candidatePeriodHours !== undefined &&
            validTimeMs >= precipitationCoveredUntil;
          const precip = intervalDoesNotOverlap ? candidatePrecip : null;
          const precipPeriodHours = intervalDoesNotOverlap ? candidatePeriodHours : undefined;
          if (intervalDoesNotOverlap) {
            precipitationCoveredUntil = validTimeMs + candidatePeriodHours * 60 * 60 * 1000;
          }
          const precipProb = finiteNumber(
            next1?.details?.probability_of_precipitation ??
              next6?.details?.probability_of_precipitation,
            0,
            100
          );
          const symbol =
            weatherSymbol(next1?.summary?.symbol_code) ??
            weatherSymbol(next6?.summary?.symbol_code) ??
            weatherSymbol(next12?.summary?.symbol_code);

          const valId = `fv_${runId}_${validAt}`;
          const fValue: ForecastValue = {
            id: valId,
            forecast_run_id: runId,
            valid_at: validAt,
            lead_time_hours: leadTimeHours,
            temperature: temp,
            feels_like: feelsLike,
            precipitation: precip,
            precipitation_probability: precipProb,
            wind_speed: windSpeed,
            wind_gust: finiteNumber(inst.wind_speed_of_gust, 0, 200),
            wind_direction: finiteNumber(inst.wind_from_direction, 0, 360),
            humidity: humidity,
            pressure: finiteNumber(inst.air_pressure_at_sea_level, 800, 1100),
            cloud_fraction: finiteNumber(inst.cloud_area_fraction, 0, 100),
            symbol_code: symbol,
            source_type: 'WEATHER_MODEL',
            ...(precipPeriodHours === undefined ? {} : { precipitation_period_hours: precipPeriodHours }),
          };

          values.push(fValue);
        }

        if (values.length === 0) {
          throw new Error('MET Locationforecast contained no usable forecast values.');
        }
        db.saveForecastRun(runRecord, values);
        db.setCacheEntry({
          key: cacheKey,
          url,
          etag,
          last_modified: lastModified,
          expires_at: expires,
          data_json: JSON.stringify(data),
          updated_at: nowIso,
        });
        db.flush();

        return { run: runRecord, values, fromCache: false, isDelayed: false };
      }
    } catch (err) {
      console.warn('MET Locationforecast fetch error:', err);
    }

    // Fallback to last known forecast snapshot from DB
    const fallbackRun = db
      .getForecastRuns(locationId)
      .filter(
        (run) =>
          run.latitude === roundedLat &&
          run.longitude === roundedLon &&
          run.altitude === altInt
      )
      .sort((a, b) => b.retrieved_at.localeCompare(a.retrieved_at))[0];
    if (fallbackRun) {
      const values = db.getForecastValuesForRun(fallbackRun.id);
      return { run: fallbackRun, values, fromCache: true, isDelayed: true };
    }

    throw new Error('No forecast data available (MET API offline and no cache).');
  }

  /**
   * Fetches MET Nowcast (Radar precipitation) for the nearest hours
   */
  static async fetchNowcast(
    lat: number,
    lon: number,
    altitude?: number | null
  ): Promise<{
    available: boolean;
    validAt: string | null;
    precipitationAmount1h: number | null;
    symbol: string | null;
  }> {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return { available: false, validAt: null, precipitationAmount1h: null, symbol: null };
    }
    const roundedLat = roundMetCoord(lat);
    const roundedLon = roundMetCoord(lon);
    const altInt = typeof altitude === 'number' && Number.isFinite(altitude) ? Math.round(altitude) : undefined;
    const altitudeQuery = altInt === undefined ? '' : `&altitude=${altInt}`;
    const url = `${WEATHER_CONFIG.met.nowcastUrl}?lat=${roundedLat}&lon=${roundedLon}${altitudeQuery}`;

    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': WEATHER_CONFIG.defaultUserAgent },
        signal: AbortSignal.timeout(6000),
      });

      if (res.ok) {
        const data: unknown = await res.json();
        const properties = isRecord(data) && isRecord(data.properties) ? data.properties : null;
        const rawSeries = properties?.timeseries;
        const firstTs = Array.isArray(rawSeries) ? parseTimeseriesItem(rawSeries[0]) : null;
        if (firstTs) {
          const ageMs = Date.now() - firstTs.timeMs;
          if (ageMs < -15 * 60_000 || ageMs > 30 * 60_000) {
            return { available: false, validAt: null, precipitationAmount1h: null, symbol: null };
          }
          const nextHour = isRecord(firstTs.data.next_1_hours)
            ? firstTs.data.next_1_hours
            : null;
          const details = nextHour && isRecord(nextHour.details) ? nextHour.details : null;
          const summary = nextHour && isRecord(nextHour.summary) ? nextHour.summary : null;
          // precipitation_rate is an instantaneous intensity. Only the
          // interval amount from next_1_hours may be used as an hourly total.
          const precipitationAmount1h = finiteNumber(details?.precipitation_amount, 0, 1000);
          const symbol = weatherSymbol(summary?.symbol_code);
          return {
            available: precipitationAmount1h !== null || symbol !== null,
            validAt: firstTs.time,
            precipitationAmount1h,
            symbol,
          };
        }
      }
    } catch {
      // Gracefully handle radar unavailability
    }

    return { available: false, validAt: null, precipitationAmount1h: null, symbol: null };
  }
}
