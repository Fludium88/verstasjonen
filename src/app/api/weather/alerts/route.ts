import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { WEATHER_CONFIG } from '@/lib/weatherConfig';
import { MetAlertsService } from '@/services/alerts/metAlertsService';
import { ThresholdAlertsEngine, CustomAlertConfig } from '@/services/alerts/thresholdAlertsEngine';
import { MetForecastService } from '@/services/met/metForecastService';
import {
  isFreshMeasuredObservation,
  latestMeasuredWithElement,
  measuredObservations,
} from '@/services/observations/observationQuality';
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
  const rate = checkRateLimit(`alerts_get_${clientIp}`, 120, 60000);
  if (!rate.success) {
    return createRateLimitExceededResponse(rate.reset);
  }

  const { searchParams } = new URL(req.url);
  const db = getDb();

  const rawLocationId = searchParams.get('locationId');
  const locationId = rawLocationId ? sanitizeString(rawLocationId, 64) : WEATHER_CONFIG.defaultLocation.id;
  const location = db.getLocation(locationId);
  if (!location) return NextResponse.json({ error: 'Location not found' }, { status: 404 });

  try {
    // 1. Fetch official MET MetAlerts (CAP warnings)
    const metAlerts = await MetAlertsService.fetchMetAlertsForLocation(location);

    // 2. Fetch active telemetry to evaluate threshold alarms
    const alertConfig = ThresholdAlertsEngine.getAlertConfig();

    // Get current weather data for threshold evaluation
    const now = new Date();
    const observations = measuredObservations(db.getObservations(location.id));
    const stationMappings = new Map(
      db.getStationMappings(location.id).map((mapping) => [mapping.element, mapping.station_id])
    );
    const tempObs = latestMeasuredWithElement(observations, 'air_temperature', stationMappings.get('temperature'));
    const windObs = latestMeasuredWithElement(observations, 'wind_speed', stationMappings.get('wind'));
    const gustObs = latestMeasuredWithElement(observations, 'wind_gust', stationMappings.get('wind'));
    const pressObs = latestMeasuredWithElement(observations, 'air_pressure', stationMappings.get('pressure'));
    const humObs = latestMeasuredWithElement(observations, 'relative_humidity', stationMappings.get('humidity'));
    const precipObs = latestMeasuredWithElement(observations, 'precipitation_amount', stationMappings.get('precipitation'));
    const maxCurrentAgeMs = 90 * 60 * 1000;

    let forecastRes: Awaited<ReturnType<typeof MetForecastService.fetchAndLogForecast>> | null = null;
    try {
      forecastRes = await MetForecastService.fetchAndLogForecast(
        location.id,
        location.latitude,
        location.longitude,
        location.altitude
      );
    } catch (error) {
      console.warn('Forecast unavailable while evaluating alerts:', error);
    }
    const currentHourMs = Math.floor(now.getTime() / (60 * 60 * 1000)) * 60 * 60 * 1000;
    const future24h = (forecastRes?.values || [])
      .filter((forecast) => {
        const timestamp = new Date(forecast.valid_at).getTime();
        return timestamp >= currentHourMs && timestamp <= now.getTime() + 24 * 60 * 60 * 1000;
      })
      .map((forecast) => ({
        time: forecast.valid_at,
        display_time: '',
        temperature: forecast.temperature,
        precipitation: forecast.precipitation,
        precipitation_prob: forecast.precipitation_probability,
        precipitation_period_hours: forecast.precipitation_period_hours,
        wind_speed: forecast.wind_speed,
        wind_gust: forecast.wind_gust,
        wind_direction: forecast.wind_direction,
        symbol_code: forecast.symbol_code,
        is_radar_nowcast: false,
      }));
    const currentForecast = forecastRes?.values
      .filter(
        (forecast) =>
          Math.abs(new Date(forecast.valid_at).getTime() - now.getTime()) <= 90 * 60 * 1000
      )
      .sort(
        (a, b) =>
          Math.abs(new Date(a.valid_at).getTime() - now.getTime()) -
          Math.abs(new Date(b.valid_at).getTime() - now.getTime())
      )[0];

    const tempIsMeasured = isFreshMeasuredObservation(tempObs, now, maxCurrentAgeMs);
    const windIsMeasured = isFreshMeasuredObservation(windObs, now, maxCurrentAgeMs);
    const gustIsMeasured = isFreshMeasuredObservation(gustObs, now, maxCurrentAgeMs);
    const pressureIsMeasured = isFreshMeasuredObservation(pressObs, now, maxCurrentAgeMs);
    const humidityIsMeasured = isFreshMeasuredObservation(humObs, now, maxCurrentAgeMs);
    const precipIsMeasured = isFreshMeasuredObservation(precipObs, now, maxCurrentAgeMs);
    const currentTemp = tempIsMeasured ? tempObs.air_temperature : currentForecast?.temperature ?? null;
    const currentWindSpeed = windIsMeasured ? windObs.wind_speed : currentForecast?.wind_speed ?? null;
    const currentWindGust = gustIsMeasured ? gustObs.wind_gust : currentForecast?.wind_gust ?? null;
    const currentPressure = pressureIsMeasured ? pressObs.air_pressure : currentForecast?.pressure ?? null;
    const currentHumidity = humidityIsMeasured ? humObs.relative_humidity : currentForecast?.humidity ?? null;

    // Evaluate 3h pressure diff
    const past24hTime = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const pastObs = observations.filter((observation) => observation.observed_at >= past24hTime);
    let diff3h: number | null = null;
    if (pressureIsMeasured && currentPressure !== null) {
      const targetMs = now.getTime() - 3 * 60 * 60 * 1000;
      const p3hAgo = [...pastObs]
        .filter(
          (observation) =>
            observation.air_pressure !== null &&
            Math.abs(new Date(observation.observed_at).getTime() - targetMs) <= 45 * 60 * 1000
        )
        .sort(
          (a, b) =>
            Math.abs(new Date(a.observed_at).getTime() - targetMs) -
            Math.abs(new Date(b.observed_at).getTime() - targetMs)
        )[0]?.air_pressure;
      if (p3hAgo !== null && p3hAgo !== undefined) {
        diff3h = Math.round((currentPressure - p3hAgo) * 10) / 10;
      }
    }

    const evaluationPayload: any = {
      location,
      current: {
        temperature: currentTemp,
        wind_speed: currentWindSpeed,
        wind_gust: currentWindGust,
        source_type: tempIsMeasured || windIsMeasured ? 'MÅLT' : currentForecast ? 'PROGNOSE' : 'UKJENT',
        is_delayed: forecastRes?.isDelayed ?? !tempIsMeasured,
        pressure: {
          current_hpa: currentPressure,
          diff_3h: diff3h,
        },
        humidity: currentHumidity,
        precipitation_last_hour: precipIsMeasured ? precipObs.precipitation_amount : null,
      },
      forecast_next_24h: future24h,
    };

    const thresholdAlarms = ThresholdAlertsEngine.evaluateAlarms(evaluationPayload, alertConfig);

    return NextResponse.json({
      location,
      met_alerts: metAlerts,
      threshold_alarms: thresholdAlarms,
      config: alertConfig,
      total_active_alerts: metAlerts.length + thresholdAlarms.length,
      retrieved_at: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('Alerts API Error:', err);
    return NextResponse.json({ error: 'Kunne ikke hente farevarsler', details: err?.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const clientIp = getAnonymizedClientIp(req);

  // 1. Rate limit
  const rate = checkRateLimit(`alerts_post_${clientIp}`, 30, 60000);
  if (!rate.success) {
    return createRateLimitExceededResponse(rate.reset);
  }

  // 2. CSRF Origin validation
  const csrf = validateCsrfOrigin(req, '/api/weather/alerts');
  if (!csrf.valid) {
    return NextResponse.json({ error: csrf.reason }, { status: 403 });
  }

  try {
    const body = await req.json();
    const updated = ThresholdAlertsEngine.saveAlertConfig(body);
    return NextResponse.json({ success: true, config: updated });
  } catch (err: any) {
    return NextResponse.json({ error: 'Ugyldige innstillinger', details: err?.message }, { status: 400 });
  }
}
