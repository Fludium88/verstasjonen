import { describe, expect, it } from 'vitest';
import {
  latestMeasuredWithElement,
  measuredForElement,
} from '../src/services/observations/observationQuality';
import { Observation } from '../src/types/weather';

function observation(
  stationId: string,
  observedAt: string,
  temperature: number,
  elementSource = stationId
): Observation {
  return {
    id: `${stationId}_${observedAt}`,
    location_id: 'loc_oslo',
    station_id: stationId,
    observed_at: observedAt,
    air_temperature: temperature,
    relative_humidity: null,
    air_pressure: null,
    precipitation_amount: null,
    wind_speed: null,
    wind_gust: null,
    wind_direction: null,
    snow_depth: null,
    source: `FROST_${stationId}`,
    quality_code: '0',
    retrieved_at: observedAt,
    element_sources: { air_temperature: elementSource },
  };
}

describe('location-specific station isolation', () => {
  const oslo = observation('SN18700', '2026-08-25T10:00:00.000Z', 18);
  const bjorli = observation('SN16610', '2026-08-25T11:00:00.000Z', 7);

  it('never falls back to another station when the selected station has no value', () => {
    expect(latestMeasuredWithElement([bjorli], 'air_temperature', 'SN18700')).toBeUndefined();
    expect(measuredForElement([bjorli], 'air_temperature', 'SN18700')).toEqual([]);
  });

  it('returns only measurements from the station selected for the location', () => {
    expect(latestMeasuredWithElement([oslo, bjorli], 'air_temperature', 'SN18700')?.station_id).toBe('SN18700');
    expect(measuredForElement([oslo, bjorli], 'air_temperature', 'SN18700')).toEqual([oslo]);
  });
});
