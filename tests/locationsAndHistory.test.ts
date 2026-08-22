import { describe, it, expect, beforeEach } from 'vitest';
import { getDb } from '../src/lib/db';

// Setup in-memory mock for localStorage in Node environment
const storageMap = new Map<string, string>();
const mockLocalStorage = {
  getItem: (key: string) => (storageMap.has(key) ? storageMap.get(key)! : null),
  setItem: (key: string, val: string) => storageMap.set(key, val),
  removeItem: (key: string) => storageMap.delete(key),
  clear: () => storageMap.clear(),
};
Object.defineProperty(globalThis, 'localStorage', {
  value: mockLocalStorage,
  configurable: true,
});

import {
  getLocalSavedLocations,
  saveLocalLocation,
  deleteLocalLocation,
  getActiveLocationId,
  setActiveLocationId,
  getDefaultLocationId,
  setDefaultLocationId,
  STORAGE_KEYS,
} from '../src/lib/savedLocationsStorage';

describe('Historical Data Verification in DB', () => {
  it('correctly identifies whether historical data has been fetched before', () => {
    const db = getDb();
    const testLocId = 'loc_test_history_check_' + Date.now();

    // 1. Initial state: No historical data
    expect(db.hasHistoricalData(testLocId)).toBe(false);

    // 2. Add some partial data (less than 24 observations)
    db.saveObservationsBatch([
      {
        id: `obs_test_1`,
        location_id: testLocId,
        station_id: 'SN12345',
        observed_at: '2026-08-20T10:00:00Z',
        air_temperature: 15.0,
        relative_humidity: 70,
        air_pressure: 1013.2,
        precipitation_amount: 0,
        wind_speed: 3.5,
        wind_gust: 5.0,
        wind_direction: 180,
        snow_depth: null,
        source: 'TEST',
        quality_code: '0',
        retrieved_at: '2026-08-20T10:05:00Z',
      },
    ]);
    expect(db.hasHistoricalData(testLocId)).toBe(false);

    // 3. Add 24+ observations and daily summaries
    const bulkObs = Array.from({ length: 30 }, (_, i) => ({
      id: `obs_test_bulk_${i}`,
      location_id: testLocId,
      station_id: 'SN12345',
      observed_at: new Date(Date.now() - i * 3600 * 1000).toISOString(),
      air_temperature: 12 + (i % 5),
      relative_humidity: 75,
      air_pressure: 1010,
      precipitation_amount: 0.1,
      wind_speed: 4.0,
      wind_gust: 6.0,
      wind_direction: 200,
      snow_depth: null,
      source: 'TEST',
      quality_code: '0',
      retrieved_at: new Date().toISOString(),
    }));
    db.saveObservationsBatch(bulkObs);

    db.saveDailySummariesBatch([
      {
        id: `daily_${testLocId}_2026-08-20`,
        location_id: testLocId,
        date: '2026-08-20',
        temperature_min: 10,
        temperature_max: 18,
        temperature_avg: 14,
        precipitation_total: 2.5,
        precipitation_max_hour: 1.0,
        wind_avg: 4,
        wind_max: 6,
        wind_gust_max: 8,
        wind_dominant_direction: 190,
        pressure_min: 1008,
        pressure_max: 1015,
        pressure_avg: 1012,
        humidity_min: 60,
        humidity_max: 85,
        humidity_avg: 72,
        rain_hours: 3,
        frost_hours: 0,
        dominant_symbol: 'rain',
      },
    ]);

    // 4. Now hasHistoricalData should return true ("Hvis ja, ikke hent")
    expect(db.hasHistoricalData(testLocId)).toBe(true);
  });
});

describe('savedLocationsStorage (Local Storage & Persistence)', () => {
  beforeEach(() => {
    // Clean mock storage
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
  });

  it('saves and retrieves user locations locally', () => {
    const loc1 = {
      id: 'loc_custom_oslo',
      name: 'Oslo Sentrum',
      latitude: 59.9139,
      longitude: 10.7522,
      altitude: 20,
      timezone: 'Europe/Oslo',
      is_active: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    saveLocalLocation(loc1);
    const saved = getLocalSavedLocations();
    expect(saved.some((l) => l.id === 'loc_custom_oslo')).toBe(true);
  });

  it('deletes location and handles default locations', () => {
    const loc2 = {
      id: 'loc_custom_bergen',
      name: 'Bergen Brygge',
      latitude: 60.3913,
      longitude: 5.3221,
      altitude: 10,
      timezone: 'Europe/Oslo',
      is_active: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    saveLocalLocation(loc2);
    setDefaultLocationId(loc2.id);
    expect(getDefaultLocationId()).toBe('loc_custom_bergen');

    setActiveLocationId(loc2.id);
    expect(getActiveLocationId()).toBe('loc_custom_bergen');

    deleteLocalLocation('loc_custom_bergen');
    const remaining = getLocalSavedLocations();
    expect(remaining.some((l) => l.id === 'loc_custom_bergen')).toBe(false);
  });
});
