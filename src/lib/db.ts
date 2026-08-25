import fs from 'fs';
import path from 'path';
import { WEATHER_CONFIG } from './weatherConfig';
import {
  LocationRecord,
  WeatherStation,
  StationElementMapping,
  Observation,
  ForecastRun,
  ForecastValue,
  DailyWeatherSummary,
  MonthlyWeatherSummary,
} from '@/types/weather';
import { LocationCalibrationProfile } from '@/types/calibration';

const VERIFIED_FROST_STATION_MIGRATION_KEY = 'migration_verified_frost_stations_v1';

export interface ApiCacheEntry {
  key: string;
  url: string;
  etag?: string | null;
  last_modified?: string | null;
  expires_at?: string | null;
  data_json: string;
  updated_at: string;
}

export interface VaerstasjonenDatabaseData {
  locations: LocationRecord[];
  weather_stations: WeatherStation[];
  station_element_mapping: StationElementMapping[];
  observations: Observation[];
  forecast_runs: ForecastRun[];
  forecast_values: ForecastValue[];
  daily_weather_summary: DailyWeatherSummary[];
  monthly_weather_summary: MonthlyWeatherSummary[];
  api_cache_entries: ApiCacheEntry[];
  app_settings: Record<string, string>;
  calibration_profiles?: Record<string, LocationCalibrationProfile>;
}

function createEmptyDatabase(): VaerstasjonenDatabaseData {
  return {
    locations: [],
    weather_stations: [],
    station_element_mapping: [],
    observations: [],
    forecast_runs: [],
    forecast_values: [],
    daily_weather_summary: [],
    monthly_weather_summary: [],
    api_cache_entries: [],
    // A new database never contained the removed hardcoded catalog. Mark it
    // migrated immediately so a live Frost discovery made before the first
    // restart cannot be mistaken for legacy seeded metadata.
    app_settings: { [VERIFIED_FROST_STATION_MIGRATION_KEY]: 'complete' },
    calibration_profiles: {},
  };
}

function resolveDatabaseFile(): string {
  const explicitFile = process.env.VAERSTASJONEN_DB_FILE?.trim();
  if (explicitFile) return path.resolve(explicitFile);

  if (process.env.NODE_ENV === 'test' || process.env.VITEST) {
    throw new Error(
      'Tests must set VAERSTASJONEN_DB_FILE; refusing to use the application database'
    );
  }

  const explicitDataDir = process.env.VAERSTASJONEN_DATA_DIR?.trim();
  const dataDir = explicitDataDir
    ? path.resolve(explicitDataDir)
    : path.join(process.cwd(), 'data');
  return path.join(dataDir, 'vaerstasjonen_db.json');
}

const LEGACY_SEEDED_STATION_IDS = new Set([
  'SN59500',
  'SN62520',
  'SN62480',
  'SN62450',
  'SN62600',
  'SN62700',
  'SN61060',
  'SN62295',
  'SN62270',
  'SN62290',
  'SN62260',
  'SN61062',
  'SN61064',
  'SN59800',
  'SN59700',
  'SN65130',
  'SN65330',
  'SN64330',
  'SN64335',
  'SN64242',
  'SN65060',
  'SN64300',
  'SN64510',
  'SN65145',
  'SN62980',
  'SN68010',
  'SN69100',
  'SN10380',
  'SN24650',
  'SN07350',
  'SN18700',
  'SN50540',
  'SN44560',
  'SN39040',
  'SN82290',
  'SN90450',
  'SN98550',
  'SN99840',
]);

function normalizeDatabaseData(parsed: unknown): VaerstasjonenDatabaseData {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Database root must be a JSON object');
  }

  const source = parsed as Record<string, unknown>;
  const array = <T>(key: string): T[] => {
    const value = source[key];
    if (value === undefined) return [];
    if (!Array.isArray(value)) throw new Error(`Database field ${key} must be an array`);
    return value as T[];
  };

  const rawSettings = source.app_settings;
  if (
    rawSettings !== undefined &&
    (!rawSettings || typeof rawSettings !== 'object' || Array.isArray(rawSettings))
  ) {
    throw new Error('Database field app_settings must be an object');
  }
  const appSettings = Object.fromEntries(
    Object.entries((rawSettings || {}) as Record<string, unknown>).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string'
    )
  );

  let weatherStations = array<WeatherStation>('weather_stations');
  let stationElementMappings = array<StationElementMapping>('station_element_mapping');
  if (appSettings[VERIFIED_FROST_STATION_MIGRATION_KEY] !== 'complete') {
    const originalStationCount = weatherStations.length;
    const originalMappingCount = stationElementMappings.length;
    weatherStations = weatherStations.filter(
      (station) => !LEGACY_SEEDED_STATION_IDS.has(station.id)
    );
    stationElementMappings = stationElementMappings.filter(
      (mapping) => !LEGACY_SEEDED_STATION_IDS.has(mapping.station_id)
    );
    appSettings[VERIFIED_FROST_STATION_MIGRATION_KEY] = 'complete';

    const removedCount =
      originalStationCount - weatherStations.length +
      originalMappingCount - stationElementMappings.length;
    if (removedCount > 0) {
      console.warn(
        `Removed ${removedCount} legacy seeded station records; Frost discovery will repopulate verified metadata`
      );
    }
  }

  const rawProfiles = source.calibration_profiles;
  if (
    rawProfiles !== undefined &&
    (!rawProfiles || typeof rawProfiles !== 'object' || Array.isArray(rawProfiles))
  ) {
    throw new Error('Database field calibration_profiles must be an object');
  }

  const observations = array<Observation>('observations');
  const nonMeasurementMarkers = [
    'FORECAST',
    'LOCATIONFORECAST',
    'WEATHER_MODEL',
    'HISTORICAL_ESTIMATE',
    'SYNTHETIC',
    'SIMULATED',
    'SIMULERT',
    'GENERATED',
  ];
  const removedLocationIds = new Set<string>();
  const measuredOnlyObservations = observations.filter((observation) => {
    const sourceName = String(observation.source || '').toUpperCase();
    const isModelOrSynthetic = nonMeasurementMarkers.some((marker) =>
      sourceName.includes(marker)
    );
    if (isModelOrSynthetic) removedLocationIds.add(observation.location_id);
    return !isModelOrSynthetic;
  });

  if (measuredOnlyObservations.length !== observations.length) {
    console.warn(
      `Removed ${observations.length - measuredOnlyObservations.length} model/synthetic observations from persisted measurement history`
    );
  }

  return {
    locations: array<LocationRecord>('locations'),
    weather_stations: weatherStations,
    station_element_mapping: stationElementMappings,
    observations: measuredOnlyObservations,
    forecast_runs: array<ForecastRun>('forecast_runs'),
    forecast_values: array<ForecastValue>('forecast_values'),
    // Existing aggregates may contain values derived from the removed rows.
    // Fail closed by invalidating them; the aggregation service rebuilds from
    // the remaining measured observations.
    daily_weather_summary: array<DailyWeatherSummary>('daily_weather_summary').filter(
      (summary) => !removedLocationIds.has(summary.location_id)
    ),
    monthly_weather_summary: array<MonthlyWeatherSummary>('monthly_weather_summary').filter(
      (summary) => !removedLocationIds.has(summary.location_id)
    ),
    api_cache_entries: array<ApiCacheEntry>('api_cache_entries'),
    app_settings: appSettings,
    calibration_profiles: (rawProfiles || {}) as Record<string, LocationCalibrationProfile>,
  };
}

class DatabaseEngine {
  private data: VaerstasjonenDatabaseData;
  private readonly dbFile: string;
  private readonly dataDir: string;
  private saveTimeout: NodeJS.Timeout | null = null;
  // In-memory index for fast O(1) observation operations: key -> index in this.data.observations
  private obsIndex: Map<string, number> = new Map();
  // In-memory index for daily summaries: key -> index in this.data.daily_weather_summary
  private dailyIndex: Map<string, number> = new Map();
  // In-memory index for monthly summaries: key -> index in this.data.monthly_weather_summary
  private monthlyIndex: Map<string, number> = new Map();

  constructor() {
    this.dbFile = resolveDatabaseFile();
    this.dataDir = path.dirname(this.dbFile);
    this.ensureDataDir();
    this.data = this.loadData();
    this.rebuildIndices();
    this.seedDefaults();
  }

  private ensureDataDir() {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }

  private rebuildIndices() {
    this.obsIndex.clear();
    for (let i = 0; i < this.data.observations.length; i++) {
      const o = this.data.observations[i];
      const key = `${o.location_id}_${o.observed_at}`;
      this.obsIndex.set(key, i);
    }

    this.dailyIndex.clear();
    for (let i = 0; i < this.data.daily_weather_summary.length; i++) {
      const d = this.data.daily_weather_summary[i];
      const key = `${d.location_id}_${d.date}`;
      this.dailyIndex.set(key, i);
    }

    this.monthlyIndex.clear();
    for (let i = 0; i < this.data.monthly_weather_summary.length; i++) {
      const m = this.data.monthly_weather_summary[i];
      const key = `${m.location_id}_${m.year}_${m.month}`;
      this.monthlyIndex.set(key, i);
    }
  }

  private loadData(): VaerstasjonenDatabaseData {
    if (fs.existsSync(this.dbFile)) {
      try {
        const raw = fs.readFileSync(this.dbFile, 'utf-8');
        return normalizeDatabaseData(JSON.parse(raw));
      } catch (err) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupFile = `${this.dbFile}.corrupt-${timestamp}`;
        try {
          // Move, never overwrite: the damaged bytes remain available for recovery.
          fs.renameSync(this.dbFile, backupFile);
        } catch (backupError) {
          throw new Error(
            `Database is corrupt and could not be preserved as a backup: ${String(backupError)}`,
            { cause: err }
          );
        }
        console.error(`Database was corrupt and has been preserved at ${backupFile}:`, err);
      }
    }

    return createEmptyDatabase();
  }

  public flush() {
    this.ensureDataDir();
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }

    const uniqueSuffix = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const tempFile = `${this.dbFile}.tmp-${uniqueSuffix}`;
    let fileDescriptor: number | null = null;
    try {
      fileDescriptor = fs.openSync(tempFile, 'wx', 0o600);
      fs.writeFileSync(fileDescriptor, JSON.stringify(this.data), 'utf-8');
      fs.fsyncSync(fileDescriptor);
      fs.closeSync(fileDescriptor);
      fileDescriptor = null;
      fs.renameSync(tempFile, this.dbFile);
    } catch (error) {
      if (fileDescriptor !== null) {
        try {
          fs.closeSync(fileDescriptor);
        } catch {
          // Preserve the original error.
        }
      }
      try {
        if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
      } catch {
        // A uniquely named orphan temp file is safe and can be removed later.
      }
      throw error;
    }
  }

  private scheduleSave() {
    if (this.saveTimeout) clearTimeout(this.saveTimeout);
    this.saveTimeout = setTimeout(() => {
      try {
        this.flush();
      } catch (error) {
        console.error('Failed to persist weather database:', error);
      }
    }, 150);
  }

  public disposeWithoutSaving(): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }
  }

  private seedDefaults() {
    const nowIso = new Date().toISOString();

    // 1. Seed Default Location: Aukra
    const hasAukra = this.data.locations.some((l) => l.id === WEATHER_CONFIG.defaultLocation.id);
    if (!hasAukra) {
      this.data.locations.push({
        id: WEATHER_CONFIG.defaultLocation.id,
        name: WEATHER_CONFIG.defaultLocation.name,
        latitude: WEATHER_CONFIG.defaultLocation.latitude,
        longitude: WEATHER_CONFIG.defaultLocation.longitude,
        altitude: WEATHER_CONFIG.defaultLocation.altitude,
        address: WEATHER_CONFIG.defaultLocation.address,
        timezone: WEATHER_CONFIG.defaultLocation.timezone,
        is_active: 1,
        created_at: nowIso,
        updated_at: nowIso,
      });
    }

    // Stations are populated exclusively from verified live Frost discovery.

    // Constructor-time seeds/migrations must reach disk before a serverless
    // request can be frozen or the process exits.
    this.flush();
  }

  // --- Location Operations ---
  public getLocations(): LocationRecord[] {
    return this.data.locations;
  }

  public getLocation(id: string): LocationRecord | undefined {
    return this.data.locations.find((l) => l.id === id);
  }

  public hasHistoricalData(locationId: string): boolean {
    const obsCount = this.data.observations.filter((o) => o.location_id === locationId).length;
    const dailyCount = this.data.daily_weather_summary.filter((d) => d.location_id === locationId).length;
    return obsCount >= 24 && dailyCount >= 1;
  }

  public saveLocation(loc: LocationRecord): void {
    const idx = this.data.locations.findIndex((l) => l.id === loc.id);
    if (idx >= 0) {
      this.data.locations[idx] = { ...loc, updated_at: new Date().toISOString() };
    } else {
      this.data.locations.push(loc);
    }
    this.scheduleSave();
  }

  private removeLocationOwnedWeatherData(id: string): void {
    const location = this.data.locations.find((item) => item.id === id);
    const deletedForecastRunIds = new Set(
      this.data.forecast_runs
        .filter((run) => run.location_id === id)
        .map((run) => run.id)
    );
    this.data.station_element_mapping = this.data.station_element_mapping.filter(
      (mapping) => mapping.location_id !== id
    );
    this.data.observations = this.data.observations.filter((o) => o.location_id !== id);
    this.data.forecast_runs = this.data.forecast_runs.filter((f) => f.location_id !== id);
    this.data.forecast_values = this.data.forecast_values.filter(
      (value) => !deletedForecastRunIds.has(value.forecast_run_id)
    );
    this.data.daily_weather_summary = this.data.daily_weather_summary.filter((d) => d.location_id !== id);
    this.data.monthly_weather_summary = this.data.monthly_weather_summary.filter((m) => m.location_id !== id);
    const alertCacheKey = location
      ? `metalerts_${location.latitude.toFixed(2)}_${location.longitude.toFixed(2)}`
      : null;
    const forecastCachePrefix = `met_lf_${id}_`;
    this.data.api_cache_entries = this.data.api_cache_entries.filter(
      (entry) => {
        const forecastSuffix = entry.key.startsWith(forecastCachePrefix)
          ? entry.key.slice(forecastCachePrefix.length)
          : '';
        const belongsToLocation =
          entry.key === `met_lf_${id}` ||
          (forecastSuffix !== '' && forecastSuffix.split('_').length === 3);
        return !belongsToLocation && entry.key !== alertCacheKey;
      }
    );
    if (this.data.calibration_profiles) {
      delete this.data.calibration_profiles[id];
    }
    this.rebuildIndices();
  }

  public clearLocationWeatherData(id: string): void {
    this.removeLocationOwnedWeatherData(id);
    this.scheduleSave();
  }

  public clearLocationMeasuredHistory(id: string): void {
    this.data.observations = this.data.observations.filter((observation) => observation.location_id !== id);
    this.data.daily_weather_summary = this.data.daily_weather_summary.filter((summary) => summary.location_id !== id);
    this.data.monthly_weather_summary = this.data.monthly_weather_summary.filter((summary) => summary.location_id !== id);
    this.rebuildIndices();
    this.scheduleSave();
  }

  public deleteLocation(id: string): void {
    this.removeLocationOwnedWeatherData(id);
    this.data.locations = this.data.locations.filter((l) => l.id !== id);
    this.scheduleSave();
  }

  // --- Weather Stations Operations ---
  public getStations(): WeatherStation[] {
    return this.data.weather_stations;
  }

  public getStation(id: string): WeatherStation | undefined {
    return this.data.weather_stations.find((s) => s.id === id);
  }

  public saveStation(station: WeatherStation): void {
    const idx = this.data.weather_stations.findIndex((s) => s.id === station.id);
    if (idx >= 0) {
      this.data.weather_stations[idx] = station;
    } else {
      this.data.weather_stations.push(station);
    }
    this.scheduleSave();
  }

  // --- Station Element Mapping ---
  public getStationMappings(locationId: string): StationElementMapping[] {
    return this.data.station_element_mapping.filter((m) => m.location_id === locationId);
  }

  public setStationMapping(mapping: StationElementMapping): void {
    const idx = this.data.station_element_mapping.findIndex(
      (m) => m.location_id === mapping.location_id && m.element === mapping.element
    );
    if (idx >= 0) {
      this.data.station_element_mapping[idx] = mapping;
    } else {
      this.data.station_element_mapping.push(mapping);
    }
    this.scheduleSave();
  }

  // --- Observation Operations ---
  public getObservations(locationId: string, fromDate?: string, toDate?: string): Observation[] {
    return this.data.observations
      .filter((o) => {
        if (o.location_id !== locationId) return false;
        if (fromDate && o.observed_at < fromDate) return false;
        if (toDate && o.observed_at > toDate) return false;
        return true;
      })
      .sort((a, b) => a.observed_at.localeCompare(b.observed_at));
  }

  public getLatestObservation(locationId: string): Observation | undefined {
    const list = this.getObservations(locationId);
    return list.length > 0 ? list[list.length - 1] : undefined;
  }

  public getLatestObservationWithElement(
    locationId: string,
    element:
      | 'air_temperature'
      | 'precipitation_amount'
      | 'wind_speed'
      | 'wind_gust'
      | 'wind_direction'
      | 'relative_humidity'
      | 'air_pressure'
      | 'snow_depth'
  ): Observation | undefined {
    const list = this.getObservations(locationId);
    for (let i = list.length - 1; i >= 0; i--) {
      const val = list[i][element];
      if (val !== null && val !== undefined && !isNaN(val as number)) {
        return list[i];
      }
    }
    return undefined;
  }

  public saveObservation(obs: Observation): void {
    const key = `${obs.location_id}_${obs.observed_at}`;
    const existingIdx = this.obsIndex.get(key);
    if (existingIdx !== undefined && existingIdx < this.data.observations.length) {
      this.data.observations[existingIdx] = obs;
    } else {
      const newIdx = this.data.observations.length;
      this.data.observations.push(obs);
      this.obsIndex.set(key, newIdx);
    }
    this.scheduleSave();
  }

  public saveObservationsBatch(batch: Observation[]): void {
    for (const obs of batch) {
      const key = `${obs.location_id}_${obs.observed_at}`;
      const existingIdx = this.obsIndex.get(key);
      if (existingIdx !== undefined && existingIdx < this.data.observations.length) {
        this.data.observations[existingIdx] = obs;
      } else {
        const newIdx = this.data.observations.length;
        this.data.observations.push(obs);
        this.obsIndex.set(key, newIdx);
      }
    }
    this.scheduleSave();
  }

  // --- Forecast Runs & Values (Snapshot Logging) ---
  public saveForecastRun(run: ForecastRun, values: ForecastValue[]): void {
    this.data.forecast_runs.push(run);
    for (const v of values) {
      this.data.forecast_values.push(v);
    }

    // Retain enough hourly snapshots to verify all supported lead times, including +48h.
    const maximumRunsPerLocation = 192;
    const runsForLoc = this.data.forecast_runs
      .filter((r) => r.location_id === run.location_id)
      .sort((a, b) => b.retrieved_at.localeCompare(a.retrieved_at));

    if (runsForLoc.length > maximumRunsPerLocation) {
      const keepIds = new Set(runsForLoc.slice(0, maximumRunsPerLocation).map((r) => r.id));
      this.data.forecast_runs = this.data.forecast_runs.filter(
        (r) => r.location_id !== run.location_id || keepIds.has(r.id)
      );
      const allActiveRunIds = new Set(this.data.forecast_runs.map((r) => r.id));
      this.data.forecast_values = this.data.forecast_values.filter((v) =>
        allActiveRunIds.has(v.forecast_run_id)
      );
    }

    this.scheduleSave();
  }

  public getLatestForecastRun(locationId: string): ForecastRun | undefined {
    const runs = this.data.forecast_runs
      .filter((r) => r.location_id === locationId)
      .sort((a, b) => b.retrieved_at.localeCompare(a.retrieved_at));
    return runs[0];
  }

  public getForecastValuesForRun(runId: string): ForecastValue[] {
    return this.data.forecast_values
      .filter((v) => v.forecast_run_id === runId)
      .sort((a, b) => a.valid_at.localeCompare(b.valid_at));
  }

  public getForecastRuns(locationId: string): ForecastRun[] {
    return this.data.forecast_runs.filter((r) => r.location_id === locationId);
  }

  public getAllForecastValues(locationId?: string): ForecastValue[] {
    if (!locationId) return this.data.forecast_values;
    const runIds = new Set(this.data.forecast_runs.filter((r) => r.location_id === locationId).map((r) => r.id));
    return this.data.forecast_values.filter((v) => runIds.has(v.forecast_run_id));
  }

  // --- Daily & Monthly Summary Operations ---
  public getDailySummaries(locationId: string, fromDate?: string, toDate?: string): DailyWeatherSummary[] {
    return this.data.daily_weather_summary
      .filter((d) => {
        if (d.location_id !== locationId) return false;
        if (fromDate && d.date < fromDate) return false;
        if (toDate && d.date > toDate) return false;
        return true;
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  public saveDailySummary(summary: DailyWeatherSummary): void {
    const key = `${summary.location_id}_${summary.date}`;
    const existingIdx = this.dailyIndex.get(key);
    if (existingIdx !== undefined && existingIdx < this.data.daily_weather_summary.length) {
      this.data.daily_weather_summary[existingIdx] = summary;
    } else {
      const newIdx = this.data.daily_weather_summary.length;
      this.data.daily_weather_summary.push(summary);
      this.dailyIndex.set(key, newIdx);
    }
    this.scheduleSave();
  }

  public saveDailySummariesBatch(summaries: DailyWeatherSummary[]): void {
    for (const summary of summaries) {
      const key = `${summary.location_id}_${summary.date}`;
      const existingIdx = this.dailyIndex.get(key);
      if (existingIdx !== undefined && existingIdx < this.data.daily_weather_summary.length) {
        this.data.daily_weather_summary[existingIdx] = summary;
      } else {
        const newIdx = this.data.daily_weather_summary.length;
        this.data.daily_weather_summary.push(summary);
        this.dailyIndex.set(key, newIdx);
      }
    }
    this.scheduleSave();
  }

  public replaceDailySummariesForLocation(
    locationId: string,
    summaries: DailyWeatherSummary[]
  ): void {
    if (summaries.some((summary) => summary.location_id !== locationId)) {
      throw new Error('All daily summaries must belong to the requested location');
    }
    this.data.daily_weather_summary = [
      ...this.data.daily_weather_summary.filter((summary) => summary.location_id !== locationId),
      ...summaries,
    ];
    this.rebuildIndices();
    this.scheduleSave();
  }

  public getMonthlySummaries(locationId: string, year?: number): MonthlyWeatherSummary[] {
    return this.data.monthly_weather_summary
      .filter((m) => {
        if (m.location_id !== locationId) return false;
        if (year !== undefined && m.year !== year) return false;
        return true;
      })
      .sort((a, b) => (a.year !== b.year ? a.year - b.year : a.month - b.month));
  }

  public saveMonthlySummary(summary: MonthlyWeatherSummary): void {
    const key = `${summary.location_id}_${summary.year}_${summary.month}`;
    const existingIdx = this.monthlyIndex.get(key);
    if (existingIdx !== undefined && existingIdx < this.data.monthly_weather_summary.length) {
      this.data.monthly_weather_summary[existingIdx] = summary;
    } else {
      const newIdx = this.data.monthly_weather_summary.length;
      this.data.monthly_weather_summary.push(summary);
      this.monthlyIndex.set(key, newIdx);
    }
    this.scheduleSave();
  }

  public saveMonthlySummariesBatch(summaries: MonthlyWeatherSummary[]): void {
    for (const summary of summaries) {
      const key = `${summary.location_id}_${summary.year}_${summary.month}`;
      const existingIdx = this.monthlyIndex.get(key);
      if (existingIdx !== undefined && existingIdx < this.data.monthly_weather_summary.length) {
        this.data.monthly_weather_summary[existingIdx] = summary;
      } else {
        const newIdx = this.data.monthly_weather_summary.length;
        this.data.monthly_weather_summary.push(summary);
        this.monthlyIndex.set(key, newIdx);
      }
    }
    this.scheduleSave();
  }

  public replaceMonthlySummariesForLocation(
    locationId: string,
    summaries: MonthlyWeatherSummary[]
  ): void {
    if (summaries.some((summary) => summary.location_id !== locationId)) {
      throw new Error('All monthly summaries must belong to the requested location');
    }
    this.data.monthly_weather_summary = [
      ...this.data.monthly_weather_summary.filter((summary) => summary.location_id !== locationId),
      ...summaries,
    ];
    this.rebuildIndices();
    this.scheduleSave();
  }

  // --- API Cache Entries ---
  public getCacheEntry(key: string): ApiCacheEntry | undefined {
    return this.data.api_cache_entries.find((c) => c.key === key);
  }

  public setCacheEntry(entry: ApiCacheEntry): void {
    const idx = this.data.api_cache_entries.findIndex((c) => c.key === entry.key);
    if (idx >= 0) {
      this.data.api_cache_entries[idx] = entry;
    } else {
      this.data.api_cache_entries.push(entry);
    }
    this.scheduleSave();
  }

  // --- Settings ---
  public getSetting(key: string): string | undefined {
    return this.data.app_settings[key];
  }

  public setSetting(key: string, value: string): void {
    this.data.app_settings[key] = value;
    this.scheduleSave();
  }

  // --- Calibration Profiles ---
  public getCalibrationProfile(locationId: string): LocationCalibrationProfile {
    if (!this.data.calibration_profiles) {
      this.data.calibration_profiles = {};
    }
    const existing = this.data.calibration_profiles[locationId];
    if (existing) {
      return existing;
    }
    const defaultProfile: LocationCalibrationProfile = {
      location_id: locationId,
      is_enabled: false,
      reference_benchmark: 'locationforecast',
      offsets: {
        temp_offset: 0.0,
        humidity_offset: 0,
        pressure_offset: 0.0,
        wind_multiplier: 1.0,
        precip_multiplier: 1.0,
      },
      last_calibrated_at: null,
      auto_calibration_notes: null,
    };
    return defaultProfile;
  }

  public saveCalibrationProfile(profile: LocationCalibrationProfile): void {
    if (!this.data.calibration_profiles) {
      this.data.calibration_profiles = {};
    }
    this.data.calibration_profiles[profile.location_id] = profile;
    this.scheduleSave();
  }

  public resetCalibrationProfile(locationId: string): LocationCalibrationProfile {
    const defaultProfile: LocationCalibrationProfile = {
      location_id: locationId,
      is_enabled: false,
      reference_benchmark: 'locationforecast',
      offsets: {
        temp_offset: 0.0,
        humidity_offset: 0,
        pressure_offset: 0.0,
        wind_multiplier: 1.0,
        precip_multiplier: 1.0,
      },
      last_calibrated_at: null,
      auto_calibration_notes: 'Tilbakestilt til standardprofil uten justeringer',
    };
    this.saveCalibrationProfile(defaultProfile);
    return defaultProfile;
  }

  // --- Database Optimization / Deduplication ---
  public optimizeDatabase(): { obsPruned: number; finalObsCount: number } {
    const initialObsCount = this.data.observations.length;
    const uniqueObsMap = new Map<string, Observation>();

    // Keep the most complete observation per location & timestamp
    for (const o of this.data.observations) {
      const key = `${o.location_id}_${o.observed_at}`;
      const existing = uniqueObsMap.get(key);
      if (!existing) {
        uniqueObsMap.set(key, o);
      } else {
        // Merge fields if existing has nulls
        uniqueObsMap.set(key, {
          ...existing,
          air_temperature: existing.air_temperature ?? o.air_temperature,
          relative_humidity: existing.relative_humidity ?? o.relative_humidity,
          air_pressure: existing.air_pressure ?? o.air_pressure,
          precipitation_amount: existing.precipitation_amount ?? o.precipitation_amount,
          wind_speed: existing.wind_speed ?? o.wind_speed,
          wind_gust: existing.wind_gust ?? o.wind_gust,
          wind_direction: existing.wind_direction ?? o.wind_direction,
          snow_depth: existing.snow_depth ?? o.snow_depth,
          source: existing.source.startsWith('FROST') ? existing.source : o.source,
        });
      }
    }

    this.data.observations = Array.from(uniqueObsMap.values()).sort((a, b) =>
      a.observed_at.localeCompare(b.observed_at)
    );
    this.rebuildIndices();
    this.flush();

    return {
      obsPruned: initialObsCount - this.data.observations.length,
      finalObsCount: this.data.observations.length,
    };
  }
}

// Global Singleton
let dbInstance: DatabaseEngine | null = null;

export function getDb(): DatabaseEngine {
  if (!dbInstance) {
    dbInstance = new DatabaseEngine();
  }
  return dbInstance;
}

/** Test-only lifecycle hook used by the isolated Vitest setup. */
export function resetDbForTests(): void {
  if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
    throw new Error('resetDbForTests may only be used by tests');
  }
  dbInstance?.disposeWithoutSaving();
  dbInstance = null;
}
