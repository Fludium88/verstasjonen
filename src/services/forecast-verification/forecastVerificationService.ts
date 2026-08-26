import { getDb } from '@/lib/db';
import { measuredObservations } from '@/services/observations/observationQuality';
import { ForecastAccuracyItem, ForecastRun, ForecastValue, Observation } from '@/types/weather';

const HOUR_MS = 60 * 60 * 1000;
const OBSERVATION_MATCH_TOLERANCE_MS = 40 * 60 * 1000;
const LEAD_TIME_TOLERANCE_HOURS = 0.75;

export interface VerificationPair {
  valid_at: string;
  lead_time_hours: number;
  temp_forecast: number | null;
  temp_observed: number | null;
  temp_diff: number | null;
  precip_forecast: number | null;
  precip_observed: number | null;
  wind_forecast: number | null;
  wind_observed: number | null;
}

export interface VerificationAvailability {
  retained_forecast_runs: number;
  oldest_forecast_run_at: string | null;
  newest_forecast_run_at: string | null;
  maximum_runs_retained: number;
  observation_match_tolerance_minutes: number;
  lead_time_tolerance_hours: number;
  note: string;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function nearestObservation(
  observations: Observation[],
  targetMs: number,
  toleranceMs = OBSERVATION_MATCH_TOLERANCE_MS
): Observation | undefined {
  let best: Observation | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const observation of observations) {
    const timestamp = new Date(observation.observed_at).getTime();
    if (!Number.isFinite(timestamp)) continue;
    const distance = Math.abs(timestamp - targetMs);
    if (distance <= toleranceMs && distance < bestDistance) {
      best = observation;
      bestDistance = distance;
    }
  }
  return best;
}

function observedPrecipitationForForecast(
  observations: Observation[],
  validAtMs: number,
  periodHours: number,
  nowMs: number
): number | null {
  const endMs = validAtMs + periodHours * HOUR_MS;
  if (endMs > nowMs + OBSERVATION_MATCH_TOLERANCE_MS) return null;

  const values: number[] = [];
  const usedObservationIds = new Set<string>();
  for (let hour = 1; hour <= Math.max(1, Math.round(periodHours)); hour++) {
    const observation = nearestObservation(observations, validAtMs + hour * HOUR_MS);
    if (
      observation &&
      !usedObservationIds.has(observation.id) &&
      observation.precipitation_amount !== null &&
      Number.isFinite(observation.precipitation_amount)
    ) {
      usedObservationIds.add(observation.id);
      values.push(Math.max(0, observation.precipitation_amount));
    }
  }

  const minimumCoverage = Math.max(1, Math.ceil(periodHours * 0.7));
  if (values.length < minimumCoverage) return null;
  return round1(values.reduce((sum, value) => sum + value, 0));
}

export function calculateForecastVerification(
  observationsInput: Observation[],
  forecastValues: ForecastValue[],
  forecastRuns: ForecastRun[],
  leadTimes: number[] = [1, 6, 12, 24, 48],
  now = new Date()
): { metrics: ForecastAccuracyItem[]; recentPairs: VerificationPair[]; availability: VerificationAvailability } {
  const nowMs = now.getTime();
  const observations = measuredObservations(observationsInput)
    .filter(
      (observation) =>
        new Date(observation.observed_at).getTime() <= nowMs + OBSERVATION_MATCH_TOLERANCE_MS
    )
    .sort((a, b) => a.observed_at.localeCompare(b.observed_at));
  // Accuracy metrics describe MET Locationforecast specifically. A separately
  // sourced fallback must not silently alter those statistics.
  const eligibleRuns = forecastRuns.filter((run) => run.source === 'MET_LOCATIONFORECAST_2_0');
  const runMap = new Map(eligibleRuns.map((run) => [run.id, run]));
  const recentPairs: VerificationPair[] = [];
  const metrics: ForecastAccuracyItem[] = [];

  for (const requestedLeadTime of leadTimes) {
    let tempDiffSum = 0;
    let tempAbsDiffSum = 0;
    let tempCount = 0;
    let precipForecastSum = 0;
    let precipObservedSum = 0;
    let precipAbsDiffSum = 0;
    let precipCount = 0;
    let windAbsDiffSum = 0;
    let windCount = 0;

    const matchingValues = forecastValues.filter((value) => {
      const run = runMap.get(value.forecast_run_id);
      if (!run) return false;
      const validAtMs = new Date(value.valid_at).getTime();
      const issuedAtMs = new Date(run.retrieved_at).getTime();
      if (!Number.isFinite(validAtMs) || !Number.isFinite(issuedAtMs) || issuedAtMs > validAtMs) {
        return false;
      }
      const actualLeadTime = (validAtMs - issuedAtMs) / HOUR_MS;
      return Math.abs(actualLeadTime - requestedLeadTime) <= LEAD_TIME_TOLERANCE_HOURS;
    });

    for (const forecast of matchingValues) {
      const validAtMs = new Date(forecast.valid_at).getTime();
      const observation = nearestObservation(observations, validAtMs);
      const precipObserved =
        forecast.precipitation === null
          ? null
          : observedPrecipitationForForecast(
              observations,
              validAtMs,
              forecast.precipitation_period_hours ?? 1,
              nowMs
            );
      const tempObserved = observation?.air_temperature ?? null;
      const windObserved = observation?.wind_speed ?? null;
      const pair: VerificationPair = {
        valid_at: forecast.valid_at,
        lead_time_hours: requestedLeadTime,
        temp_forecast: forecast.temperature,
        temp_observed: tempObserved,
        temp_diff:
          forecast.temperature !== null && tempObserved !== null
            ? round1(forecast.temperature - tempObserved)
            : null,
        precip_forecast: forecast.precipitation,
        precip_observed: precipObserved,
        wind_forecast: forecast.wind_speed,
        wind_observed: windObserved,
      };

      if (
        requestedLeadTime === 24 &&
        (pair.temp_observed !== null || pair.precip_observed !== null || pair.wind_observed !== null)
      ) {
        recentPairs.push(pair);
      }

      if (forecast.temperature !== null && tempObserved !== null) {
        const diff = forecast.temperature - tempObserved;
        tempDiffSum += diff;
        tempAbsDiffSum += Math.abs(diff);
        tempCount++;
      }
      if (forecast.precipitation !== null && precipObserved !== null) {
        precipForecastSum += forecast.precipitation;
        precipObservedSum += precipObserved;
        precipAbsDiffSum += Math.abs(forecast.precipitation - precipObserved);
        precipCount++;
      }
      if (forecast.wind_speed !== null && windObserved !== null) {
        windAbsDiffSum += Math.abs(forecast.wind_speed - windObserved);
        windCount++;
      }
    }

    metrics.push({
      lead_time_hours: requestedLeadTime,
      temp_mae: tempCount > 0 ? round1(tempAbsDiffSum / tempCount) : null,
      temp_bias: tempCount > 0 ? round1(tempDiffSum / tempCount) : null,
      precip_forecast_sum: precipCount > 0 ? round1(precipForecastSum) : null,
      precip_observed_sum: precipCount > 0 ? round1(precipObservedSum) : null,
      precip_mae: precipCount > 0 ? round1(precipAbsDiffSum / precipCount) : null,
      wind_mae: windCount > 0 ? round1(windAbsDiffSum / windCount) : null,
      data_points: Math.max(tempCount, precipCount, windCount),
      temp_points: tempCount,
      precip_points: precipCount,
      wind_points: windCount,
    });
  }

  const sortedRuns = [...eligibleRuns].sort((a, b) => a.retrieved_at.localeCompare(b.retrieved_at));
  return {
    metrics,
    recentPairs: recentPairs.sort((a, b) => a.valid_at.localeCompare(b.valid_at)).slice(-48),
    availability: {
      retained_forecast_runs: sortedRuns.length,
      oldest_forecast_run_at: sortedRuns[0]?.retrieved_at ?? null,
      newest_forecast_run_at: sortedRuns[sortedRuns.length - 1]?.retrieved_at ?? null,
      maximum_runs_retained: 192,
      observation_match_tolerance_minutes: OBSERVATION_MATCH_TOLERANCE_MS / 60000,
      lead_time_tolerance_hours: LEAD_TIME_TOLERANCE_HOURS,
      note: 'Resultatene gjelder bare MET Locationforecast-kjøringer som kan matches mot faktiske målinger. Databasen beholder opptil åtte døgn med timevise kjøringer per sted.',
    },
  };
}

export class ForecastVerificationService {
  static evaluateAccuracy(locationId: string, leadTimes: number[] = [1, 6, 12, 24, 48]) {
    const db = getDb();
    return calculateForecastVerification(
      db.getObservations(locationId),
      db.getAllForecastValues(locationId),
      db.getForecastRuns(locationId),
      leadTimes
    );
  }
}
