import { Observation } from '@/types/weather';

export type NumericObservationElement =
  | 'air_temperature'
  | 'relative_humidity'
  | 'air_pressure'
  | 'precipitation_amount'
  | 'wind_speed'
  | 'wind_gust'
  | 'wind_direction'
  | 'snow_depth';

const NON_MEASUREMENT_SOURCE_MARKERS = [
  'FORECAST',
  'LOCATIONFORECAST',
  'WEATHER_MODEL',
  'HISTORICAL_ESTIMATE',
  'SYNTHETIC',
  'SIMULATED',
  'SIMULERT',
  'GENERATED',
];

export function isMeasuredObservation(observation: Observation): boolean {
  const source = String(observation.source || '').toUpperCase();
  if (!source) return false;
  return !NON_MEASUREMENT_SOURCE_MARKERS.some((marker) => source.includes(marker));
}

export function measuredObservations(observations: Observation[]): Observation[] {
  return observations.filter(isMeasuredObservation);
}

export function observationAgeMs(observation: Observation | undefined, now = new Date()): number {
  if (!observation) return Number.POSITIVE_INFINITY;
  const timestamp = new Date(observation.observed_at).getTime();
  if (!Number.isFinite(timestamp)) return Number.POSITIVE_INFINITY;
  return Math.max(0, now.getTime() - timestamp);
}

export function isFreshMeasuredObservation(
  observation: Observation | undefined,
  now = new Date(),
  maxAgeMs = 90 * 60 * 1000
): observation is Observation {
  return Boolean(
    observation &&
      isMeasuredObservation(observation) &&
      observationAgeMs(observation, now) <= maxAgeMs
  );
}

export function latestMeasuredWithElement<K extends keyof Observation>(
  observations: Observation[],
  element: K,
  preferredStationId?: string | null
): Observation | undefined {
  const candidates: Observation[] = [];
  for (let index = observations.length - 1; index >= 0; index--) {
    const observation = observations[index];
    const value = observation[element];
    if (
      isMeasuredObservation(observation) &&
      typeof value === 'number' &&
      Number.isFinite(value)
    ) {
      if (
        preferredStationId &&
        (observation.station_id === preferredStationId ||
          observation.element_sources?.[element as keyof NonNullable<Observation['element_sources']>] ===
            preferredStationId)
      ) {
        return observation;
      }
      candidates.push(observation);
    }
  }
  return candidates[0];
}

export function measuredForElement(
  observations: Observation[],
  element: NumericObservationElement,
  preferredStationId?: string | null
): Observation[] {
  const candidates = observations.filter((observation) => {
    const value = observation[element];
    return isMeasuredObservation(observation) && typeof value === 'number' && Number.isFinite(value);
  });
  if (!preferredStationId) return candidates;
  const preferred = candidates.filter(
    (observation) =>
      observation.station_id === preferredStationId ||
      observation.element_sources?.[element] === preferredStationId
  );
  return preferred.length > 0 ? preferred : candidates;
}

export function hourlyObservationsForElement(
  observations: Observation[],
  element: NumericObservationElement,
  preferredStationId?: string | null
): Observation[] {
  const selected = measuredForElement(observations, element, preferredStationId);
  const byHour = new Map<number, Observation>();
  for (const observation of selected) {
    const timestamp = new Date(observation.observed_at).getTime();
    if (!Number.isFinite(timestamp)) continue;
    const hour = Math.floor(timestamp / (60 * 60 * 1000));
    const existing = byHour.get(hour);
    if (!existing || observation.observed_at > existing.observed_at) byHour.set(hour, observation);
  }
  return [...byHour.values()].sort((a, b) => a.observed_at.localeCompare(b.observed_at));
}

export function hourlyValuesForElement(
  observations: Observation[],
  element: NumericObservationElement,
  preferredStationId?: string | null
): number[] {
  return hourlyObservationsForElement(observations, element, preferredStationId).map(
    (observation) => observation[element] as number
  );
}
