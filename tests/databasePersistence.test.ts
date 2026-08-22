import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { getDb, resetDbForTests } from '../src/lib/db';

const originalTestDatabaseFile = process.env.VAERSTASJONEN_DB_FILE;
const ownedTempDirectories: string[] = [];

function useFreshDatabaseFile(contents?: string): string {
  resetDbForTests();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vaerstasjonen-db-test-'));
  ownedTempDirectories.push(directory);
  const databaseFile = path.join(directory, 'database.json');
  if (contents !== undefined) fs.writeFileSync(databaseFile, contents, 'utf8');
  process.env.VAERSTASJONEN_DB_FILE = databaseFile;
  return databaseFile;
}

afterEach(() => {
  resetDbForTests();
  process.env.VAERSTASJONEN_DB_FILE = originalTestDatabaseFile;
  for (const directory of ownedTempDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('JSON database persistence safety', () => {
  it('refuses to use the application database when test isolation is missing', () => {
    resetDbForTests();
    delete process.env.VAERSTASJONEN_DB_FILE;
    expect(() => getDb()).toThrow('Tests must set VAERSTASJONEN_DB_FILE');
  });

  it('preserves a corrupt database byte-for-byte before creating a replacement', () => {
    const corruptContents = '{"locations": [broken json';
    const databaseFile = useFreshDatabaseFile(corruptContents);

    const db = getDb();
    expect(db.getLocations().length).toBeGreaterThan(0);
    db.flush();

    const backups = fs
      .readdirSync(path.dirname(databaseFile))
      .filter((name) => name.startsWith('database.json.corrupt-'));
    expect(backups).toHaveLength(1);
    expect(fs.readFileSync(path.join(path.dirname(databaseFile), backups[0]), 'utf8')).toBe(
      corruptContents
    );
    expect(() => JSON.parse(fs.readFileSync(databaseFile, 'utf8'))).not.toThrow();
    expect(fs.readdirSync(path.dirname(databaseFile)).some((name) => name.includes('.tmp-'))).toBe(false);
  });

  it('purges model/synthetic observations and invalidates their aggregates on load', () => {
    const databaseFile = useFreshDatabaseFile(
      JSON.stringify({
        locations: [],
        weather_stations: [],
        station_element_mapping: [],
        observations: [
          {
            id: 'synthetic-1',
            location_id: 'loc-model',
            station_id: 'MODEL',
            observed_at: '2026-08-20T10:00:00.000Z',
            air_temperature: 12,
            relative_humidity: 70,
            air_pressure: 1010,
            precipitation_amount: 0,
            wind_speed: 2,
            wind_gust: 3,
            wind_direction: 180,
            snow_depth: null,
            source: 'MET_LOCATIONFORECAST',
            quality_code: null,
            retrieved_at: '2026-08-20T10:00:00.000Z',
          },
        ],
        forecast_runs: [],
        forecast_values: [],
        daily_weather_summary: [{ id: 'day', location_id: 'loc-model', date: '2026-08-20' }],
        monthly_weather_summary: [{ id: 'month', location_id: 'loc-model', year: 2026, month: 8 }],
        api_cache_entries: [],
        app_settings: {},
        calibration_profiles: {},
      })
    );

    const db = getDb();
    expect(db.getObservations('loc-model')).toEqual([]);
    expect(db.getDailySummaries('loc-model')).toEqual([]);
    expect(db.getMonthlySummaries('loc-model')).toEqual([]);
    db.flush();
    const persisted = JSON.parse(fs.readFileSync(databaseFile, 'utf8'));
    expect(persisted.observations).toEqual([]);
  });

  it('purges the legacy seeded station catalog once, then permits verified rediscovery', () => {
    const databaseFile = useFreshDatabaseFile(
      JSON.stringify({
        locations: [],
        weather_stations: [
          {
            id: 'SN59500',
            name: 'Legacy seeded station',
            latitude: 62.8,
            longitude: 6.9,
            altitude: 15,
            distance_km: 1,
            quality_rating: 0.99,
            elements_supported: ['air_temperature'],
          },
        ],
        station_element_mapping: [
          {
            location_id: 'loc-legacy',
            element: 'temperature',
            station_id: 'SN59500',
          },
        ],
        observations: [],
        forecast_runs: [],
        forecast_values: [],
        daily_weather_summary: [],
        monthly_weather_summary: [],
        api_cache_entries: [],
        app_settings: {},
        calibration_profiles: {},
      })
    );

    const migratedDb = getDb();
    expect(migratedDb.getStation('SN59500')).toBeUndefined();
    expect(migratedDb.getStationMappings('loc-legacy')).toEqual([]);

    migratedDb.saveStation({
      id: 'SN59500',
      name: 'Verified Frost station',
      latitude: 62.8,
      longitude: 6.9,
      altitude: 12,
      distance_km: 1.2,
      quality_rating: 1,
      elements_supported: ['air_temperature'],
    });
    migratedDb.flush();
    resetDbForTests();

    const reloadedDb = getDb();
    expect(reloadedDb.getStation('SN59500')?.name).toBe('Verified Frost station');
    const persisted = JSON.parse(fs.readFileSync(databaseFile, 'utf8'));
    expect(persisted.app_settings.migration_verified_frost_stations_v1).toBe('complete');
  });

  it('does not purge a Frost station discovered in a brand-new database', () => {
    useFreshDatabaseFile();
    const newDb = getDb();
    newDb.saveStation({
      id: 'SN59500',
      name: 'Live Frost discovery',
      latitude: 62.8,
      longitude: 6.9,
      altitude: null,
      elements_supported: ['air_temperature'],
      source_type: 'FROST',
    });
    newDb.flush();
    resetDbForTests();

    expect(getDb().getStation('SN59500')?.name).toBe('Live Frost discovery');
  });

  it('removes every location-owned record when a location is deleted', () => {
    useFreshDatabaseFile();
    const db = getDb();
    const locationId = 'loc-delete-completely';
    const timestamp = '2026-08-20T10:00:00.000Z';

    db.saveLocation({
      id: locationId,
      name: 'Delete test',
      latitude: 62.79,
      longitude: 6.92,
      altitude: null,
      timezone: 'Europe/Oslo',
      is_active: 1,
      created_at: timestamp,
      updated_at: timestamp,
    });
    db.setStationMapping({
      location_id: locationId,
      element: 'temperature',
      station_id: 'SN59500',
    });
    db.saveObservation({
      id: 'observation-delete',
      location_id: locationId,
      station_id: 'SN59500',
      observed_at: timestamp,
      air_temperature: 10,
      relative_humidity: null,
      air_pressure: null,
      precipitation_amount: null,
      wind_speed: null,
      wind_gust: null,
      wind_direction: null,
      snow_depth: null,
      source: 'FROST_SN59500',
      quality_code: '0',
      retrieved_at: timestamp,
    });
    db.saveForecastRun(
      {
        id: 'run-delete',
        location_id: locationId,
        source: 'MET_LOCATIONFORECAST_2_0',
        retrieved_at: timestamp,
        created_at: timestamp,
      },
      [
        {
          id: 'forecast-delete',
          forecast_run_id: 'run-delete',
          valid_at: timestamp,
          lead_time_hours: 1,
          temperature: 11,
          feels_like: 10,
          precipitation: 0,
          precipitation_probability: null,
          wind_speed: 2,
          wind_gust: 3,
          wind_direction: 180,
          humidity: 70,
          pressure: 1010,
          cloud_fraction: 50,
          symbol_code: 'partlycloudy_day',
          source_type: 'WEATHER_MODEL',
        },
      ]
    );
    db.saveDailySummary({
      id: 'daily-delete',
      location_id: locationId,
      date: '2026-08-20',
      temperature_min: 8,
      temperature_max: 12,
      temperature_avg: 10,
      precipitation_total: 0,
      precipitation_max_hour: 0,
      wind_avg: 2,
      wind_max: 3,
      wind_gust_max: 4,
      wind_dominant_direction: 180,
      pressure_min: 1008,
      pressure_max: 1012,
      pressure_avg: 1010,
      humidity_min: 60,
      humidity_max: 80,
      humidity_avg: 70,
      rain_hours: 0,
      frost_hours: 0,
      dominant_symbol: 'partlycloudy_day',
    });
    db.saveMonthlySummary({
      id: 'monthly-delete',
      location_id: locationId,
      year: 2026,
      month: 8,
      temperature_avg: 10,
      temperature_min: 8,
      temperature_max: 12,
      precipitation_total: 0,
      rainy_days: 0,
      max_daily_precipitation: 0,
      max_wind_gust: 4,
      warmest_day: '2026-08-20',
      coldest_day: '2026-08-20',
      wettest_day: null,
    });
    db.setCacheEntry({
      key: `met_lf_${locationId}`,
      url: 'https://api.met.no/weatherapi/locationforecast/2.0/compact',
      data_json: '{}',
      updated_at: timestamp,
    });
    db.setCacheEntry({
      key: `met_lf_${locationId}_62.79_6.92_unknown`,
      url: 'https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=62.79&lon=6.92',
      data_json: '{}',
      updated_at: timestamp,
    });
    db.saveCalibrationProfile({
      location_id: locationId,
      is_enabled: true,
      reference_benchmark: 'locationforecast',
      offsets: {
        temp_offset: 1,
        humidity_offset: 0,
        pressure_offset: 0,
        wind_multiplier: 1,
        precip_multiplier: 1,
      },
      last_calibrated_at: timestamp,
      auto_calibration_notes: null,
    });

    db.deleteLocation(locationId);

    expect(db.getLocation(locationId)).toBeUndefined();
    expect(db.getStationMappings(locationId)).toEqual([]);
    expect(db.getObservations(locationId)).toEqual([]);
    expect(db.getForecastRuns(locationId)).toEqual([]);
    expect(db.getAllForecastValues(locationId)).toEqual([]);
    expect(db.getDailySummaries(locationId)).toEqual([]);
    expect(db.getMonthlySummaries(locationId)).toEqual([]);
    expect(db.getCacheEntry(`met_lf_${locationId}`)).toBeUndefined();
    expect(db.getCacheEntry(`met_lf_${locationId}_62.79_6.92_unknown`)).toBeUndefined();
    expect(db.getCalibrationProfile(locationId).is_enabled).toBe(false);
  });

  it('clears coordinate-specific forecast caches on move without deleting the location', () => {
    useFreshDatabaseFile();
    const db = getDb();
    const locationId = 'loc_move_cache';
    const timestamp = '2026-08-20T10:00:00.000Z';
    db.saveLocation({
      id: locationId,
      name: 'Flyttbart sted',
      latitude: 62.79,
      longitude: 6.92,
      altitude: null,
      timezone: 'Europe/Oslo',
      is_active: 1,
      created_at: timestamp,
      updated_at: timestamp,
    });
    const movedCacheKey = `met_lf_${locationId}_62.79_6.92_unknown`;
    const similarLocationCacheKey = `met_lf_${locationId}_other_62.79_6.92_unknown`;
    db.setCacheEntry({
      key: movedCacheKey,
      url: 'https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=62.79&lon=6.92',
      data_json: '{}',
      updated_at: timestamp,
    });
    db.setCacheEntry({
      key: similarLocationCacheKey,
      url: 'https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=62.79&lon=6.92',
      data_json: '{}',
      updated_at: timestamp,
    });

    db.clearLocationWeatherData(locationId);

    expect(db.getLocation(locationId)).toBeDefined();
    expect(db.getCacheEntry(movedCacheKey)).toBeUndefined();
    expect(db.getCacheEntry(similarLocationCacheKey)).toBeDefined();
  });
});
