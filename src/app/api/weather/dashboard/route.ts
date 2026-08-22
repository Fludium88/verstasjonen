import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { WEATHER_CONFIG } from '@/lib/weatherConfig';
import {
  bin24HoursObservations,
  calculateDewPoint,
  calculateFeelsLike,
  evaluatePressureTrend,
  formatNorwegianTime,
  formatWeatherSymbolName,
  getBeaufort,
  getWindDirectionCardinal8,
} from '@/lib/weatherUtils';
import { AggregationService } from '@/services/aggregation/aggregationService';
import { AstronomyService } from '@/services/astronomy/astronomyService';
import { CalibrationService } from '@/services/calibration/calibrationService';
import { FrostService } from '@/services/frost/frostService';
import { MetForecastService } from '@/services/met/metForecastService';
import {
  isFreshMeasuredObservation,
  hourlyValuesForElement,
  latestMeasuredWithElement,
  measuredForElement,
  measuredObservations,
} from '@/services/observations/observationQuality';
import { WeatherStationResolver } from '@/services/station-resolver/stationResolver';
import { getLocalDateKey, getLocalDayBounds } from '@/services/time/timeZone';
import {
  CurrentElementProvenance,
  DashboardPayload,
  Observation,
  WeatherDataSourceType,
} from '@/types/weather';
import {
  checkRateLimit,
  createRateLimitExceededResponse,
  getAnonymizedClientIp,
  sanitizeString,
} from '@/lib/security';

export const dynamic = 'force-dynamic';
const HOUR_MS = 60 * 60 * 1000;

function nearestElementAt(
  observations: Observation[],
  field: 'air_pressure',
  targetMs: number,
  toleranceMs: number,
  preferredStationId?: string
): number | null {
  const match = measuredForElement(observations, field, preferredStationId)
    .filter((observation) => {
      const value = observation[field];
      return (
        typeof value === 'number' &&
        Number.isFinite(value) &&
        Math.abs(new Date(observation.observed_at).getTime() - targetMs) <= toleranceMs
      );
    })
    .sort(
      (a, b) =>
        Math.abs(new Date(a.observed_at).getTime() - targetMs) -
        Math.abs(new Date(b.observed_at).getTime() - targetMs)
    )[0];
  return match?.[field] ?? null;
}

function coveredPrecipitationTotal(
  values: number[],
  expectedHours: number,
  minimumCoverage = 0.7
): number | null {
  values = values.map((value) => Math.max(0, value));
  if (values.length < Math.max(1, Math.ceil(expectedHours * minimumCoverage))) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) * 10) / 10;
}

export async function GET(req: NextRequest) {
  const clientIp = getAnonymizedClientIp(req);
  const rate = checkRateLimit(`dashboard_${clientIp}`, 120, 60_000);
  if (!rate.success) return createRateLimitExceededResponse(rate.reset);

  try {
    const { searchParams } = new URL(req.url);
    const db = getDb();
    const rawLocationId = searchParams.get('locationId');
    const locationId = rawLocationId
      ? sanitizeString(rawLocationId, 64)
      : WEATHER_CONFIG.defaultLocation.id;
    const location = db.getLocation(locationId);
    if (!location) return NextResponse.json({ error: 'Location not found' }, { status: 404 });

    let observations = measuredObservations(db.getObservations(location.id));
    const now = new Date();
    const latestMeasured = observations[observations.length - 1];
    if (
      FrostService.getFrostClientId() &&
      (!latestMeasured || now.getTime() - new Date(latestMeasured.observed_at).getTime() > 30 * 60 * 1000)
    ) {
      try {
        const sync = await FrostService.backfillLocationObservations(location, 2);
        if (sync.count > 0) observations = measuredObservations(db.getObservations(location.id));
      } catch (error) {
        console.warn('Frost refresh failed:', error);
      }
    }

    let forecastResult: Awaited<ReturnType<typeof MetForecastService.fetchAndLogForecast>> | null = null;
    try {
      forecastResult = await MetForecastService.fetchAndLogForecast(
        location.id,
        location.latitude,
        location.longitude,
        location.altitude
      );
    } catch (error) {
      console.warn('Forecast unavailable for dashboard:', error);
    }
    const nowcast = await MetForecastService.fetchNowcast(
      location.latitude,
      location.longitude,
      location.altitude
    );

    if (observations.length > 0 && db.getDailySummaries(location.id).length === 0) {
      AggregationService.computeDailySummaries(location.id);
    }

    const stationMappings = new Map(
      db.getStationMappings(location.id).map((mapping) => [mapping.element, mapping.station_id])
    );
    const tempObs = latestMeasuredWithElement(observations, 'air_temperature', stationMappings.get('temperature'));
    const windObs = latestMeasuredWithElement(observations, 'wind_speed', stationMappings.get('wind'));
    const gustObs = latestMeasuredWithElement(observations, 'wind_gust', stationMappings.get('wind'));
    const directionObs = latestMeasuredWithElement(observations, 'wind_direction', stationMappings.get('wind'));
    const pressureObs = latestMeasuredWithElement(observations, 'air_pressure', stationMappings.get('pressure'));
    const humidityObs = latestMeasuredWithElement(observations, 'relative_humidity', stationMappings.get('humidity'));
    const precipitationObs = latestMeasuredWithElement(observations, 'precipitation_amount', stationMappings.get('precipitation'));
    const snowObs = latestMeasuredWithElement(observations, 'snow_depth', stationMappings.get('snow'));
    const freshnessMs = 90 * 60 * 1000;
    const tempMeasured = isFreshMeasuredObservation(tempObs, now, freshnessMs);
    const windMeasured = isFreshMeasuredObservation(windObs, now, freshnessMs);
    const gustMeasured = isFreshMeasuredObservation(gustObs, now, freshnessMs);
    const directionMeasured = isFreshMeasuredObservation(directionObs, now, freshnessMs);
    const pressureMeasured = isFreshMeasuredObservation(pressureObs, now, freshnessMs);
    const humidityMeasured = isFreshMeasuredObservation(humidityObs, now, freshnessMs);
    const precipitationMeasured = isFreshMeasuredObservation(precipitationObs, now, freshnessMs);
    const snowMeasured = isFreshMeasuredObservation(snowObs, now, freshnessMs);

    const forecasts = forecastResult?.values ?? [];
    const currentForecast = [...forecasts]
      .filter(
        (forecast) =>
          Math.abs(new Date(forecast.valid_at).getTime() - now.getTime()) <= 90 * 60 * 1000
      )
      .sort(
        (a, b) =>
          Math.abs(new Date(a.valid_at).getTime() - now.getTime()) -
          Math.abs(new Date(b.valid_at).getTime() - now.getTime())
      )[0];
    const future24h = forecasts
      .filter((forecast) => {
        const time = new Date(forecast.valid_at).getTime();
        return time >= now.getTime() && time <= now.getTime() + 24 * HOUR_MS;
      })
      .slice(0, 24);

    let currentTemperature = tempMeasured ? tempObs.air_temperature : currentForecast?.temperature ?? null;
    let currentWindSpeed = windMeasured ? windObs.wind_speed : currentForecast?.wind_speed ?? null;
    let currentWindGust = gustMeasured ? gustObs.wind_gust : currentForecast?.wind_gust ?? null;
    const currentWindDirection = directionMeasured
      ? directionObs.wind_direction
      : currentForecast?.wind_direction ?? null;
    let currentPressure = pressureMeasured ? pressureObs.air_pressure : currentForecast?.pressure ?? null;
    let currentHumidity = humidityMeasured ? humidityObs.relative_humidity : currentForecast?.humidity ?? null;
    const currentSnowDepth = snowMeasured ? snowObs.snow_depth : null;
    const temperatureStationId = tempMeasured
      ? tempObs.element_sources?.air_temperature ?? tempObs.station_id
      : undefined;
    const measuredStation = temperatureStationId ? db.getStation(temperatureStationId) : undefined;

    const profile = db.getCalibrationProfile(location.id);
    if (profile.is_enabled) {
      const calibrated = CalibrationService.applyCalibration(
        {
          temperature: tempMeasured ? currentTemperature : null,
          humidity: humidityMeasured ? currentHumidity : null,
          pressure: pressureMeasured ? currentPressure : null,
          wind_speed: windMeasured ? currentWindSpeed : null,
          wind_gust: gustMeasured ? currentWindGust : null,
          precipitation: null,
        },
        profile.offsets,
        true
      );
      if (tempMeasured) currentTemperature = calibrated.temperature;
      if (humidityMeasured) currentHumidity = calibrated.humidity;
      if (pressureMeasured) currentPressure = calibrated.pressure;
      if (windMeasured) currentWindSpeed = calibrated.wind_speed;
      if (gustMeasured) currentWindGust = calibrated.wind_gust;
    }

    let currentSymbol = nowcast.symbol || currentForecast?.symbol_code || null;
    if (!currentForecast && !nowcast.available) currentSymbol = null;
    const past24h = observations.filter(
      (observation) => new Date(observation.observed_at).getTime() >= now.getTime() - 24 * HOUR_MS
    );
    const { startUtc: todayStart, endUtc: todayEnd } = getLocalDayBounds(
      getLocalDateKey(now, location.timezone),
      location.timezone
    );
    const todayObservations = observations.filter((observation) => {
      const time = new Date(observation.observed_at).getTime();
      return time >= todayStart.getTime() && time < Math.min(todayEnd.getTime(), now.getTime() + 1);
    });
    const expectedTodayHours = Math.max(1, (now.getTime() - todayStart.getTime()) / HOUR_MS);
    let precipitationLastHour = precipitationMeasured ? precipitationObs.precipitation_amount : null;
    let precipitationToday = coveredPrecipitationTotal(
      hourlyValuesForElement(todayObservations, 'precipitation_amount', stationMappings.get('precipitation')),
      expectedTodayHours,
      0.6
    );
    let precipitationLast24h = coveredPrecipitationTotal(
      hourlyValuesForElement(past24h, 'precipitation_amount', stationMappings.get('precipitation')),
      24
    );
    if (profile.is_enabled) {
      const multiplier = profile.offsets.precip_multiplier;
      if (Number.isFinite(multiplier) && multiplier >= 0.1 && multiplier <= 10) {
        if (precipitationLastHour !== null) precipitationLastHour = Math.round(precipitationLastHour * multiplier * 10) / 10;
        if (precipitationToday !== null) precipitationToday = Math.round(precipitationToday * multiplier * 10) / 10;
        if (precipitationLast24h !== null) precipitationLast24h = Math.round(precipitationLast24h * multiplier * 10) / 10;
      }
    }

    const provenanceFor = (
      measured: boolean,
      observation: Observation | undefined,
      observationField: keyof NonNullable<Observation['element_sources']>,
      forecastAvailable: boolean,
      calibrationApplied: boolean
    ): CurrentElementProvenance => {
      if (measured && observation) {
        const stationId = observation.element_sources?.[observationField] ?? observation.station_id;
        const station = db.getStation(stationId);
        const stationLabel = station?.name || stationId;
        return {
          source_type: calibrationApplied ? 'ESTIMERT' : 'MÅLT',
          observed_at: observation.observed_at,
          station_id: stationId,
          source_label: calibrationApplied
            ? `Modelljustert måling fra ${stationLabel}`
            : `Målt ved ${stationLabel}`,
        };
      }
      if (forecastAvailable && currentForecast) {
        return {
          source_type: 'PROGNOSE',
          observed_at: currentForecast.valid_at,
          source_label: forecastResult?.isDelayed
            ? 'Forsinket MET Locationforecast 2.0'
            : 'MET Locationforecast 2.0',
        };
      }
      return {
        source_type: 'UKJENT',
        observed_at: null,
        source_label: 'Ingen ferske data',
      };
    };

    const elementProvenance: DashboardPayload['current']['element_provenance'] = {
      temperature: provenanceFor(
        tempMeasured,
        tempObs,
        'air_temperature',
        currentForecast?.temperature !== null && currentForecast?.temperature !== undefined,
        profile.is_enabled && tempMeasured
      ),
      wind: provenanceFor(
        windMeasured,
        windObs,
        'wind_speed',
        currentForecast?.wind_speed !== null && currentForecast?.wind_speed !== undefined,
        profile.is_enabled && windMeasured
      ),
      gust: provenanceFor(
        gustMeasured,
        gustObs,
        'wind_gust',
        currentForecast?.wind_gust !== null && currentForecast?.wind_gust !== undefined,
        profile.is_enabled && gustMeasured
      ),
      direction: provenanceFor(
        directionMeasured,
        directionObs,
        'wind_direction',
        currentForecast?.wind_direction !== null && currentForecast?.wind_direction !== undefined,
        false
      ),
      pressure: provenanceFor(
        pressureMeasured,
        pressureObs,
        'air_pressure',
        currentForecast?.pressure !== null && currentForecast?.pressure !== undefined,
        profile.is_enabled && pressureMeasured
      ),
      humidity: provenanceFor(
        humidityMeasured,
        humidityObs,
        'relative_humidity',
        currentForecast?.humidity !== null && currentForecast?.humidity !== undefined,
        profile.is_enabled && humidityMeasured
      ),
      precipitation: provenanceFor(
        precipitationMeasured && precipitationLastHour !== null,
        precipitationObs,
        'precipitation_amount',
        false,
        profile.is_enabled && precipitationMeasured && precipitationLastHour !== null
      ),
      snow: provenanceFor(snowMeasured, snowObs, 'snow_depth', false, false),
    };
    const presentSourceTypes = new Set(
      Object.values(elementProvenance)
        .map((source) => source.source_type)
        .filter((sourceType) => sourceType !== 'UKJENT')
    );
    // The condition icon is supplied by forecast/nowcast even when all numeric
    // telemetry is measured, so the aggregate badge must disclose mixed sources.
    if (currentSymbol) presentSourceTypes.add('PROGNOSE');
    let sourceType: WeatherDataSourceType = 'UKJENT';
    if (presentSourceTypes.size === 1) {
      sourceType = [...presentSourceTypes][0];
    } else if (presentSourceTypes.size > 1) {
      sourceType = 'BLANDET';
    }
    const sourceLabel =
      sourceType === 'MÅLT'
        ? 'Målte verdier per element'
        : sourceType === 'ESTIMERT'
          ? 'Modelljusterte målinger per element'
          : sourceType === 'PROGNOSE'
            ? 'MET Locationforecast / Nowcast'
            : sourceType === 'BLANDET'
              ? 'Blandede kilder – se kilde per element'
              : 'Ingen ferske data';
    const sourceTimestamps = Object.values(elementProvenance)
      .map((source) => (source.observed_at ? Date.parse(source.observed_at) : Number.NaN))
      .filter(Number.isFinite);
    if (currentSymbol && forecastResult) {
      sourceTimestamps.push(Date.parse(forecastResult.run.retrieved_at));
    }
    const latestSourceTimestamp = sourceTimestamps.length > 0 ? Math.max(...sourceTimestamps) : null;
    const updatedAt = latestSourceTimestamp === null
      ? ''
      : formatNorwegianTime(latestSourceTimestamp, {
          hour: '2-digit',
          minute: '2-digit',
          timeZone: location.timezone,
        });

    const todayTemperatures = measuredForElement(
      todayObservations,
      'air_temperature',
      stationMappings.get('temperature')
    )
      .map((observation) => observation.air_temperature)
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    const tempMinToday = todayTemperatures.length > 0 ? Math.min(...todayTemperatures) : null;
    const tempMaxToday = todayTemperatures.length > 0 ? Math.max(...todayTemperatures) : null;
    let diff3h: number | null = null;
    let diff24h: number | null = null;
    if (pressureMeasured && pressureObs.air_pressure !== null) {
      const pressure3hAgo = nearestElementAt(
        observations,
        'air_pressure',
        now.getTime() - 3 * HOUR_MS,
        45 * 60 * 1000,
        stationMappings.get('pressure')
      );
      const pressure24hAgo = nearestElementAt(
        observations,
        'air_pressure',
        now.getTime() - 24 * HOUR_MS,
        90 * 60 * 1000,
        stationMappings.get('pressure')
      );
      if (pressure3hAgo !== null) diff3h = Math.round((pressureObs.air_pressure - pressure3hAgo) * 10) / 10;
      if (pressure24hAgo !== null) diff24h = Math.round((pressureObs.air_pressure - pressure24hAgo) * 10) / 10;
    }
    const pressureTrend = evaluatePressureTrend(diff3h);
    const pressureValues24h = measuredForElement(
      past24h,
      'air_pressure',
      stationMappings.get('pressure')
    )
      .map((observation) => observation.air_pressure)
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

    const forecastNext24h = future24h.map((forecast, index) => {
      const forecastTimeMs = Date.parse(forecast.valid_at);
      const nowcastTimeMs = nowcast.validAt ? Date.parse(nowcast.validAt) : Number.NaN;
      const useRadar =
        index === 0 &&
        nowcast.available &&
        Number.isFinite(nowcastTimeMs) &&
        Math.abs(forecastTimeMs - nowcastTimeMs) <= 15 * 60_000;
      return {
        time: forecast.valid_at,
        display_time: formatNorwegianTime(forecast.valid_at, {
          hour: '2-digit',
          minute: '2-digit',
          timeZone: location.timezone,
        }),
        temperature: forecast.temperature,
        precipitation:
          useRadar && nowcast.precipitationAmount1h !== null
            ? nowcast.precipitationAmount1h
            : forecast.precipitation,
        precipitation_prob: forecast.precipitation_probability,
        precipitation_period_hours: useRadar ? 1 : forecast.precipitation_period_hours,
        wind_speed: forecast.wind_speed,
        wind_gust: forecast.wind_gust,
        wind_direction: forecast.wind_direction,
        symbol_code: useRadar && nowcast.symbol ? nowcast.symbol : forecast.symbol_code,
        is_radar_nowcast: useRadar,
      };
    });

    const records = AggregationService.getAllTimeRecords(location.id);
    const past7d = observations.filter(
      (observation) => new Date(observation.observed_at).getTime() >= now.getTime() - 7 * 24 * HOUR_MS
    );
    const sectors = ['N', 'NØ', 'Ø', 'SØ', 'S', 'SV', 'V', 'NV'];
    const counts = Array(8).fill(0) as number[];
    const speedSums = Array(8).fill(0) as number[];
    const speedCounts = Array(8).fill(0) as number[];
    let totalWindPoints = 0;
    for (const observation of measuredForElement(past7d, 'wind_direction', stationMappings.get('wind'))) {
      if (observation.wind_direction === null || !Number.isFinite(observation.wind_direction)) continue;
      const index = Math.round((((observation.wind_direction % 360) + 360) % 360) / 45) % 8;
      counts[index]++;
      if (observation.wind_speed !== null) {
        speedSums[index] += observation.wind_speed;
        speedCounts[index]++;
      }
      totalWindPoints++;
    }
    const windRose = sectors.map((sector, index) => ({
      sector,
      frequency_pct: totalWindPoints > 0 ? Math.round((counts[index] / totalWindPoints) * 1000) / 10 : 0,
      avg_speed_ms: speedCounts[index] > 0 ? Math.round((speedSums[index] / speedCounts[index]) * 10) / 10 : null,
      count: counts[index],
    }));

    let sunTimes: DashboardPayload['sun_times'];
    try {
      const summary = AstronomyService.calculateDaySummary(
        location.latitude,
        location.longitude,
        location.altitude ?? 0,
        getLocalDateKey(now, location.timezone),
        location.timezone
      );
      sunTimes = {
        sunrise: summary.sun.sunrise || 'Ikke tilgjengelig',
        sunset: summary.sun.sunset || 'Ikke tilgjengelig',
      };
    } catch (error) {
      console.warn('Astronomy summary unavailable for dashboard:', error);
    }

    const payload: DashboardPayload = {
      location,
      current: {
        temperature: currentTemperature,
        feels_like: calculateFeelsLike(currentTemperature, currentWindSpeed, currentHumidity),
        weather_text: currentSymbol ? formatWeatherSymbolName(currentSymbol) : 'Ukjent',
        symbol_code: currentSymbol,
        source_type: sourceType,
        source_label: sourceLabel,
        element_provenance: elementProvenance,
        station_name: measuredStation?.name,
        station_distance_km: undefined,
        station_altitude: measuredStation?.altitude,
        updated_at: updatedAt,
        is_delayed:
          sourceType === 'UKJENT' ||
          (presentSourceTypes.has('PROGNOSE') && (forecastResult?.isDelayed ?? !nowcast.available)),
        precipitation_last_hour: precipitationLastHour,
        precipitation_today: precipitationToday,
        precipitation_last_24h: precipitationLast24h,
        wind_speed: currentWindSpeed,
        wind_gust: currentWindGust,
        wind_direction: currentWindDirection,
        wind_direction_cardinal: getWindDirectionCardinal8(currentWindDirection),
        beaufort_label: currentWindSpeed === null ? 'Ukjent' : getBeaufort(currentWindSpeed).name,
        temp_min_today: tempMinToday,
        temp_max_today: tempMaxToday,
        pressure: {
          current_hpa: currentPressure,
          diff_3h: diff3h,
          diff_24h: diff24h,
          trend: pressureTrend.trend,
          trend_label: pressureTrend.label,
          min_24h: pressureValues24h.length > 0 ? Math.min(...pressureValues24h) : null,
          max_24h: pressureValues24h.length > 0 ? Math.max(...pressureValues24h) : null,
        },
        humidity: currentHumidity,
        dew_point: calculateDewPoint(currentTemperature, currentHumidity),
        snow_depth: currentSnowDepth,
        new_snow_24h: null,
        calibration_active: profile.is_enabled,
        calibration_offsets: profile.is_enabled
          ? {
              temp: profile.offsets.temp_offset,
              hum: profile.offsets.humidity_offset,
              press: profile.offsets.pressure_offset,
              wind: profile.offsets.wind_multiplier,
              precip: profile.offsets.precip_multiplier,
            }
          : undefined,
      },
      hourly_history_24h: bin24HoursObservations(
        past24h,
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
      ),
      forecast_next_24h: forecastNext24h,
      sources: WeatherStationResolver.getElementSourceDetails(location),
      records: {
        highest_temp: records.highestTemp ? { value: records.highestTemp.val, date: records.highestTemp.date } : null,
        lowest_temp: records.lowestTemp ? { value: records.lowestTemp.val, date: records.lowestTemp.date } : null,
        wettest_day: records.wettestDay ? { value: records.wettestDay.val, date: records.wettestDay.date } : null,
        strongest_wind_gust: records.highestGust ? { value: records.highestGust.val, date: records.highestGust.date } : null,
      },
      wind_rose_7d: windRose,
      sun_times: sunTimes,
    };

    return NextResponse.json(payload, {
      headers: { 'Cache-Control': 'private, no-store, max-age=0' },
    });
  } catch (error: any) {
    console.error('Error in /api/weather/dashboard:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch dashboard data' },
      { status: 500 }
    );
  }
}
