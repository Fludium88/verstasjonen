import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { WEATHER_CONFIG } from '@/lib/weatherConfig';
import {
  hourlyValuesForElement,
  hourlyObservationsForElement,
  latestMeasuredWithElement,
  measuredForElement,
  measuredObservations,
} from '@/services/observations/observationQuality';
import { ConstructionMetrics, Observation } from '@/types/weather';
import {
  checkRateLimit,
  createRateLimitExceededResponse,
  getAnonymizedClientIp,
  sanitizeString,
} from '@/lib/security';

export const dynamic = 'force-dynamic';

const HOUR_MS = 60 * 60 * 1000;

function observationsSince(observations: Observation[], timestampMs: number): Observation[] {
  return observations.filter(
    (observation) => new Date(observation.observed_at).getTime() >= timestampMs
  );
}

function precipitationTotal(
  values: number[],
  expectedHours: number,
  minimumCoverage = 0.7
): number | null {
  values = values.map((value) => Math.max(0, value));
  if (values.length < Math.ceil(expectedHours * minimumCoverage)) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) * 10) / 10;
}

export async function GET(req: NextRequest) {
  const clientIp = getAnonymizedClientIp(req);
  const rate = checkRateLimit(`construction_${clientIp}`, 60, 60_000);
  if (!rate.success) return createRateLimitExceededResponse(rate.reset);

  try {
    const { searchParams } = new URL(req.url);
    const rawLocationId = searchParams.get('locationId');
    const locationId = rawLocationId
      ? sanitizeString(rawLocationId, 64)
      : WEATHER_CONFIG.defaultLocation.id;
    const db = getDb();
    const location = db.getLocation(locationId);
    if (!location) return NextResponse.json({ error: 'Location not found' }, { status: 404 });

    const now = new Date();
    const observations = measuredObservations(db.getObservations(location.id));
    const stationMappings = new Map(
      db.getStationMappings(location.id).map((mapping) => [mapping.element, mapping.station_id])
    );
    const observations24h = observationsSince(observations, now.getTime() - 24 * HOUR_MS);
    const observations72h = observationsSince(observations, now.getTime() - 72 * HOUR_MS);
    const observations7d = observationsSince(observations, now.getTime() - 7 * 24 * HOUR_MS);
    const latestTemperature = latestMeasuredWithElement(
      observations,
      'air_temperature',
      stationMappings.get('temperature')
    );
    const latestAgeMs = latestTemperature
      ? now.getTime() - new Date(latestTemperature.observed_at).getTime()
      : Number.POSITIVE_INFINITY;
    const currentTemp =
      latestTemperature?.air_temperature !== null &&
      latestTemperature?.air_temperature !== undefined &&
      latestAgeMs <= 2 * HOUR_MS
        ? latestTemperature.air_temperature
        : null;

    const rain24h = precipitationTotal(hourlyValuesForElement(observations24h, 'precipitation_amount', stationMappings.get('precipitation')), 24);
    const rain72h = precipitationTotal(hourlyValuesForElement(observations72h, 'precipitation_amount', stationMappings.get('precipitation')), 72);
    const rain7d = precipitationTotal(hourlyValuesForElement(observations7d, 'precipitation_amount', stationMappings.get('precipitation')), 168);
    const temperatureValues7d = hourlyValuesForElement(
      observations7d,
      'air_temperature',
      stationMappings.get('temperature')
    );
    const frostHours7d =
      temperatureValues7d.length >= Math.ceil(168 * 0.7)
        ? temperatureValues7d.filter((temperature) => temperature < 0).length
        : null;

    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * HOUR_MS).toISOString().slice(0, 10);
    const daily30d = db.getDailySummaries(location.id, thirtyDaysAgo);
    const frostDays30d =
      daily30d.length >= 21
        ? daily30d.filter(
            (day) => (day.frost_hours ?? 0) > 0 || (day.temperature_min !== null && day.temperature_min < 0)
          ).length
        : null;

    const gustValues = measuredForElement(observations24h, 'wind_gust', stationMappings.get('wind'))
      .map((observation) => observation.wind_gust)
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    const windValues = measuredForElement(observations24h, 'wind_speed', stationMappings.get('wind'))
      .map((observation) => observation.wind_speed)
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    const hourlyWindObservations = [
      ...hourlyObservationsForElement(observations24h, 'wind_speed', stationMappings.get('wind')),
      ...hourlyObservationsForElement(observations24h, 'wind_gust', stationMappings.get('wind')),
    ];
    const windCoverageHours = new Set(
      hourlyWindObservations.map((observation) =>
        Math.floor(new Date(observation.observed_at).getTime() / HOUR_MS)
      )
    ).size;
    const windCoverageIsSufficient = windCoverageHours >= 17;
    const windGustMax24h = windCoverageIsSufficient && gustValues.length > 0 ? Math.max(...gustValues) : null;
    const highWindHours = new Set<number>();
    for (const observation of hourlyWindObservations) {
      if (
        (observation.wind_speed !== null && observation.wind_speed >= 15) ||
        (observation.wind_gust !== null && observation.wind_gust >= 15)
      ) {
        highWindHours.add(Math.floor(new Date(observation.observed_at).getTime() / HOUR_MS));
      }
    }
    const windAbove15msHours = windCoverageIsSufficient ? highWindHours.size : null;
    const rainLast3h = precipitationTotal(
      hourlyValuesForElement(
        observationsSince(observations, now.getTime() - 3 * HOUR_MS),
        'precipitation_amount',
        stationMappings.get('precipitation')
      ),
      3,
      0.66
    );

    let concreteStatus: ConstructionMetrics['concrete_pouring_status'] = 'UNKNOWN';
    let concreteNotes = 'Datagrunnlaget er mangelfullt eller gammelt. Kontroller lokale forhold før støping.';
    if (currentTemp !== null) {
      if (currentTemp < 0) {
        concreteStatus = 'PROHIBITED';
        concreteNotes = 'Kulde/frostfare. Vinterstøp krever prosjekterte vintertiltak.';
      } else if (currentTemp < 5) {
        concreteStatus = 'CAUTION';
        concreteNotes = 'Temperatur under 5 °C krever tiltak for herding og temperaturkontroll.';
      } else if (frostHours7d !== null && frostHours7d > 0) {
        concreteStatus = 'CAUTION';
        concreteNotes = 'Det er målt frost siste sju døgn. Kontroller underlag og herdeforhold.';
      } else if (rain24h !== null && rain24h > 15) {
        concreteStatus = 'ACCEPTABLE';
        concreteNotes = 'Mye nedbør siste døgn krever tildekking mot utvasking.';
      } else if (frostHours7d !== null && rain24h !== null) {
        concreteStatus = 'OPTIMAL';
        concreteNotes = 'Målingene viser gunstige temperatur- og nedbørsforhold.';
      }
    }

    let asphaltStatus: ConstructionMetrics['asphalt_laying_status'] = 'UNKNOWN';
    let asphaltNotes = 'Datagrunnlaget er mangelfullt eller gammelt. Kontroller dekke og temperatur på stedet.';
    if (currentTemp !== null && rainLast3h !== null) {
      if (currentTemp < 5 || rainLast3h > 1) {
        asphaltStatus = 'PROHIBITED';
        asphaltNotes = 'Målt nedbør eller lav temperatur kan hindre tilfredsstillende komprimering.';
      } else if (currentTemp < 10 || (windGustMax24h !== null && windGustMax24h > 12)) {
        asphaltStatus = 'CAUTION';
        asphaltNotes = 'Temperatur eller vind kan gi rask avkjøling. Kontroller massetemperaturen.';
      } else {
        asphaltStatus = 'OPTIMAL';
        asphaltNotes = 'Målingene viser tørre og temperaturmessig gode forhold.';
      }
    }

    const latestRelevantObservation = [
      latestTemperature,
      latestMeasuredWithElement(observations, 'precipitation_amount', stationMappings.get('precipitation')),
      latestMeasuredWithElement(observations, 'wind_speed', stationMappings.get('wind')),
      latestMeasuredWithElement(observations, 'wind_gust', stationMappings.get('wind')),
    ]
      .filter((observation): observation is Observation => Boolean(observation))
      .sort((a, b) => b.observed_at.localeCompare(a.observed_at))[0];
    const latestRelevantAgeMs = latestRelevantObservation
      ? now.getTime() - new Date(latestRelevantObservation.observed_at).getTime()
      : Number.POSITIVE_INFINITY;
    const hasAnyData = Boolean(latestRelevantObservation);
    const hasIncompleteMetrics = [rain24h, rain72h, rain7d, frostHours7d, windAbove15msHours].some(
      (value) => value === null
    );
    const metrics: ConstructionMetrics = {
      location_name: location.name,
      rain_24h_mm: rain24h,
      rain_72h_mm: rain72h,
      rain_7d_mm: rain7d,
      frost_hours_7d: frostHours7d,
      frost_days_30d: frostDays30d,
      current_temp: currentTemp,
      is_below_freezing: currentTemp === null ? null : currentTemp < 0,
      wind_gust_max_24h: windGustMax24h,
      wind_above_15ms_hours: windAbove15msHours,
      concrete_pouring_status: concreteStatus,
      concrete_notes: concreteNotes,
      asphalt_laying_status: asphaltStatus,
      asphalt_notes: asphaltNotes,
      data_status: !hasAnyData
        ? 'UNAVAILABLE'
        : latestRelevantAgeMs > 2 * HOUR_MS
          ? 'STALE'
          : hasIncompleteMetrics
            ? 'PARTIAL'
            : 'CURRENT',
      latest_observation_at: latestRelevantObservation?.observed_at ?? null,
    };

    return NextResponse.json(metrics, {
      headers: { 'Cache-Control': 'private, no-store, max-age=0' },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Failed to calculate construction metrics' },
      { status: 500 }
    );
  }
}
