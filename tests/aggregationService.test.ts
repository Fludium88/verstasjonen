import { describe, it, expect } from 'vitest';
import { AggregationService } from '../src/services/aggregation/aggregationService';
import { getDb } from '../src/lib/db';
import { Observation } from '../src/types/weather';

describe('AggregationService & NULL vs 0 Handling', () => {
  it('strictly distinguishes NULL (missing) from 0.0 mm (no rain)', () => {
    const db = getDb();
    const testLocId = 'loc_test_strict_precip';

    db.saveLocation({
      id: testLocId,
      name: 'Test Location',
      latitude: 62.0,
      longitude: 7.0,
      altitude: 10,
      timezone: 'Europe/Oslo',
      is_active: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const nowIso = new Date().toISOString();

    // Day 1: Observations with measured 0.0 mm rain
    const day1Obs: Observation[] = Array.from({ length: 24 }, (_, hour) => ({
      id: `obs_${hour}`,
      location_id: testLocId,
      station_id: 'SN59500',
      observed_at: new Date(Date.parse('2026-08-09T22:00:00Z') + hour * 60 * 60 * 1000).toISOString(),
      air_temperature: 15.0,
      relative_humidity: 60,
      air_pressure: 1012,
      precipitation_amount: 0.0,
      wind_speed: 4.0,
      wind_gust: 6.0,
      wind_direction: 180,
      snow_depth: null,
      source: 'TEST',
      quality_code: 'Q0',
      retrieved_at: nowIso,
    }));

    // Day 2: Observations with NULL (missing rain gauge)
    const day2Obs: Observation[] = [
      {
        id: 'obs_3',
        location_id: testLocId,
        station_id: 'SN59500',
        observed_at: '2026-08-11T10:00:00Z',
        air_temperature: 14.0,
        relative_humidity: 70,
        air_pressure: 1008,
        precipitation_amount: null,
        wind_speed: 5.0,
        wind_gust: 8.0,
        wind_direction: 210,
        snow_depth: null,
        source: 'TEST',
        quality_code: 'Q0',
        retrieved_at: nowIso,
      },
    ];

    db.saveObservationsBatch([...day1Obs, ...day2Obs]);

    const summaries = AggregationService.computeDailySummaries(testLocId);
    const day1Summary = summaries.find((s) => s.date === '2026-08-10');
    const day2Summary = summaries.find((s) => s.date === '2026-08-11');

    // Day 1 must be exactly 0 mm
    expect(day1Summary?.precipitation_total).toBe(0.0);
    expect(day1Summary?.temperature_min).toBe(15.0);
    expect(day1Summary?.temperature_max).toBe(15.0);
    expect(day1Summary?.temperature_avg).toBe(15.0);

    // Day 2 must be NULL because all sensor values were missing
    expect(day2Summary?.precipitation_total).toBeNull();
    expect(day2Summary?.is_partial).toBe(true);
  });

  it('detects rain events and intensity accurately', () => {
    const db = getDb();
    const locId = 'loc_test_rain_events';

    db.saveLocation({
      id: locId,
      name: 'Rain Event Test',
      latitude: 62.5,
      longitude: 7.0,
      altitude: 15,
      timezone: 'Europe/Oslo',
      is_active: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const nowIso = new Date().toISOString();
    const rainObs: Observation[] = [
      {
        id: 'r1',
        location_id: locId,
        station_id: 'SN59500',
        observed_at: '2026-08-14T22:00:00Z',
        air_temperature: 12,
        relative_humidity: 90,
        air_pressure: 1002,
        precipitation_amount: 3.2,
        wind_speed: 8,
        wind_gust: 14,
        wind_direction: 220,
        snow_depth: null,
        source: 'TEST',
        quality_code: 'Q0',
        retrieved_at: nowIso,
      },
      {
        id: 'r2',
        location_id: locId,
        station_id: 'SN59500',
        observed_at: '2026-08-14T23:00:00Z',
        air_temperature: 11.5,
        relative_humidity: 92,
        air_pressure: 1000,
        precipitation_amount: 8.2,
        wind_speed: 10,
        wind_gust: 18,
        wind_direction: 230,
        snow_depth: null,
        source: 'TEST',
        quality_code: 'Q0',
        retrieved_at: nowIso,
      },
      {
        id: 'r3',
        location_id: locId,
        station_id: 'SN59500',
        observed_at: '2026-08-15T00:00:00Z',
        air_temperature: 11,
        relative_humidity: 95,
        air_pressure: 998,
        precipitation_amount: 5.0,
        wind_speed: 11,
        wind_gust: 19,
        wind_direction: 240,
        snow_depth: null,
        source: 'TEST',
        quality_code: 'Q0',
        retrieved_at: nowIso,
      },
      {
        id: 'r4',
        location_id: locId,
        station_id: 'SN59500',
        observed_at: '2026-08-15T01:00:00Z',
        air_temperature: 11.2,
        relative_humidity: 80,
        air_pressure: 1002,
        precipitation_amount: 0.0,
        wind_speed: 6,
        wind_gust: 9,
        wind_direction: 250,
        snow_depth: null,
        source: 'TEST',
        quality_code: 'Q0',
        retrieved_at: nowIso,
      },
    ];

    db.saveObservationsBatch(rainObs);
    const events = AggregationService.getRainEvents(locId);

    expect(events.length).toBeGreaterThan(0);
    const event = events[0];
    expect(event.duration_hours).toBe(3);
    expect(event.total_mm).toBeCloseTo(16.4, 0.1);
    expect(event.max_intensity_mm_per_hour).toBe(8.2);
  });

  it('does not merge rain observations separated by a large time gap', () => {
    const db = getDb();
    const locationId = 'loc_test_rain_gap';
    db.saveLocation({
      id: locationId,
      name: 'Rain gap',
      latitude: 62,
      longitude: 7,
      altitude: null,
      timezone: 'Europe/Oslo',
      is_active: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    const base = {
      location_id: locationId,
      station_id: 'SN1',
      air_temperature: 10,
      relative_humidity: 90,
      air_pressure: 1000,
      wind_speed: 2,
      wind_gust: 3,
      wind_direction: 180,
      snow_depth: null,
      source: 'FROST_SN1',
      quality_code: '0',
      retrieved_at: '2026-08-10T00:00:00Z',
    };
    db.saveObservationsBatch([
      { ...base, id: 'gap-1', observed_at: '2026-08-10T00:00:00Z', precipitation_amount: 0.5 },
      { ...base, id: 'gap-2', observed_at: '2026-08-10T05:00:00Z', precipitation_amount: 0.5 },
    ]);
    expect(AggregationService.getRainEvents(locationId)).toHaveLength(0);
  });
});
