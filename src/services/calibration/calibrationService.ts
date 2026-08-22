import { getDb } from '@/lib/db';
import { WEATHER_CONFIG } from '@/lib/weatherConfig';
import { formatNorwegianTime } from '@/lib/weatherUtils';
import { isFreshMeasuredObservation, latestMeasuredWithElement } from '@/services/observations/observationQuality';
import { MetForecastService } from '@/services/met/metForecastService';
import {
  BenchmarkSourceType,
  CalibrationPayload,
  CalibrationSourceComparison,
  LocationCalibrationProfile,
  SensorCalibrationOffsets,
} from '@/types/calibration';

type BenchmarkValues = {
  temperature: number | null;
  humidity: number | null;
  pressure: number | null;
  wind_speed: number | null;
  precipitation: number | null;
};

const EMPTY_VALUES: BenchmarkValues = {
  temperature: null,
  humidity: null,
  pressure: null,
  wind_speed: null,
  precipitation: null,
};

function finiteOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function rounded(value: number | null, digits = 1): number | null {
  if (value === null) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function difference(reference: number | null, raw: number | null): number | null {
  return reference === null || raw === null ? null : rounded(reference - raw);
}

function safeMultiplier(reference: number | null, raw: number | null): number {
  if (reference === null || raw === null || raw <= 0) return 1;
  const ratio = reference / raw;
  return Number.isFinite(ratio) && ratio >= 0.1 && ratio <= 10 ? Math.round(ratio * 100) / 100 : 1;
}

function buildSuggestedOffsets(
  raw: BenchmarkValues,
  benchmark: CalibrationSourceComparison
): SensorCalibrationOffsets {
  return {
    temp_offset: difference(benchmark.temperature, raw.temperature) ?? 0,
    humidity_offset: difference(benchmark.humidity, raw.humidity) ?? 0,
    pressure_offset: difference(benchmark.pressure, raw.pressure) ?? 0,
    wind_multiplier: safeMultiplier(benchmark.wind_speed, raw.wind_speed),
    precip_multiplier: safeMultiplier(benchmark.precipitation, raw.precipitation),
  };
}

export class CalibrationService {
  public static async fetchOpenMeteoBenchmark(lat: number, lon: number): Promise<BenchmarkValues> {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return { ...EMPTY_VALUES };
    try {
      const params = new URLSearchParams({
        latitude: String(lat),
        longitude: String(lon),
        current: 'temperature_2m,relative_humidity_2m,pressure_msl,wind_speed_10m,precipitation',
        wind_speed_unit: 'ms',
        timezone: 'UTC',
      });
      const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`, {
        headers: { 'User-Agent': WEATHER_CONFIG.defaultUserAgent },
        next: { revalidate: 300 },
        signal: AbortSignal.timeout(8000),
      });

      if (!res.ok) return { ...EMPTY_VALUES };
      const json = await res.json();
      const current = json.current || {};
      const units = json.current_units || {};
      const windUnitIsMs = !units.wind_speed_10m || units.wind_speed_10m === 'm/s';
      const pressureUnitIsHpa = !units.pressure_msl || ['hPa', 'mb'].includes(units.pressure_msl);

      return {
        temperature: rounded(finiteOrNull(current.temperature_2m)),
        humidity: rounded(finiteOrNull(current.relative_humidity_2m), 0),
        pressure: pressureUnitIsHpa ? rounded(finiteOrNull(current.pressure_msl)) : null,
        wind_speed: windUnitIsMs ? rounded(finiteOrNull(current.wind_speed_10m)) : null,
        precipitation: rounded(finiteOrNull(current.precipitation)),
      };
    } catch (err) {
      console.warn('Open-Meteo benchmark fetch error:', err);
      return { ...EMPTY_VALUES };
    }
  }

  public static applyCalibration(
    raw: BenchmarkValues & { wind_gust?: number | null },
    offsets: SensorCalibrationOffsets,
    isEnabled = true
  ) {
    if (!isEnabled) {
      return { ...raw, wind_gust: raw.wind_gust ?? null };
    }

    const tempOffset = Number.isFinite(offsets.temp_offset) && Math.abs(offsets.temp_offset) <= 15 ? offsets.temp_offset : 0;
    const humidityOffset = Number.isFinite(offsets.humidity_offset) && Math.abs(offsets.humidity_offset) <= 50 ? offsets.humidity_offset : 0;
    const pressureOffset = Number.isFinite(offsets.pressure_offset) && Math.abs(offsets.pressure_offset) <= 50 ? offsets.pressure_offset : 0;
    const windMultiplier = Number.isFinite(offsets.wind_multiplier) && offsets.wind_multiplier >= 0.1 && offsets.wind_multiplier <= 5 ? offsets.wind_multiplier : 1;
    const precipMultiplier = Number.isFinite(offsets.precip_multiplier) && offsets.precip_multiplier >= 0.1 && offsets.precip_multiplier <= 10 ? offsets.precip_multiplier : 1;

    return {
      temperature: raw.temperature === null ? null : rounded(Math.min(60, Math.max(-100, raw.temperature + tempOffset))),
      humidity: raw.humidity === null ? null : rounded(Math.min(100, Math.max(0, raw.humidity + humidityOffset)), 0),
      pressure: raw.pressure === null ? null : rounded(Math.min(1100, Math.max(800, raw.pressure + pressureOffset))),
      wind_speed: raw.wind_speed === null ? null : rounded(Math.max(0, raw.wind_speed * windMultiplier)),
      wind_gust: raw.wind_gust == null ? null : rounded(Math.max(0, raw.wind_gust * windMultiplier)),
      precipitation: raw.precipitation === null ? null : rounded(Math.max(0, raw.precipitation * precipMultiplier)),
    };
  }

  public static async getCalibrationPayload(locationId: string): Promise<CalibrationPayload> {
    const db = getDb();
    const location = db.getLocation(locationId);
    if (!location) throw new Error('Location not found');

    const now = new Date();
    const timezone = location.timezone || 'Europe/Oslo';
    const profile = db.getCalibrationProfile(location.id);
    const observations = db.getObservations(location.id);
    const stationMappings = new Map(
      db.getStationMappings(location.id).map((mapping) => [mapping.element, mapping.station_id])
    );
    const tempObs = latestMeasuredWithElement(observations, 'air_temperature', stationMappings.get('temperature'));
    const humObs = latestMeasuredWithElement(observations, 'relative_humidity', stationMappings.get('humidity'));
    const pressObs = latestMeasuredWithElement(observations, 'air_pressure', stationMappings.get('pressure'));
    const windObs = latestMeasuredWithElement(observations, 'wind_speed', stationMappings.get('wind'));
    const precipObs = latestMeasuredWithElement(observations, 'precipitation_amount', stationMappings.get('precipitation'));
    const maxAgeMs = 2 * 60 * 60 * 1000;

    const rawStationValues = {
      station_name: tempObs ? db.getStation(tempObs.station_id)?.name || tempObs.station_id : 'Ingen fersk målestasjon',
      station_id: tempObs?.station_id || 'UNAVAILABLE',
      temperature: isFreshMeasuredObservation(tempObs, now, maxAgeMs) ? tempObs.air_temperature : null,
      humidity: isFreshMeasuredObservation(humObs, now, maxAgeMs) ? humObs.relative_humidity : null,
      pressure: isFreshMeasuredObservation(pressObs, now, maxAgeMs) ? pressObs.air_pressure : null,
      wind_speed: isFreshMeasuredObservation(windObs, now, maxAgeMs) ? windObs.wind_speed : null,
      precipitation: isFreshMeasuredObservation(precipObs, now, maxAgeMs) ? precipObs.precipitation_amount : null,
    };

    try {
      await MetForecastService.fetchAndLogForecast(
        location.id,
        location.latitude,
        location.longitude,
        location.altitude
      );
    } catch (error) {
      console.warn('MET benchmark refresh failed:', error);
    }

    const latestRun = db.getLatestForecastRun(location.id);
    const runIsFresh = latestRun && now.getTime() - new Date(latestRun.retrieved_at).getTime() <= 6 * 60 * 60 * 1000;
    const forecasts = runIsFresh ? db.getForecastValuesForRun(latestRun.id) : [];
    const yrForecast = [...forecasts]
      .filter((forecast) => Math.abs(new Date(forecast.valid_at).getTime() - now.getTime()) <= 90 * 60 * 1000)
      .sort(
        (a, b) =>
          Math.abs(new Date(a.valid_at).getTime() - now.getTime()) -
          Math.abs(new Date(b.valid_at).getTime() - now.getTime())
      )[0];
    const yrValues: BenchmarkValues = yrForecast
      ? {
          temperature: yrForecast.temperature,
          humidity: yrForecast.humidity,
          pressure: yrForecast.pressure,
          wind_speed: yrForecast.wind_speed,
          precipitation: yrForecast.precipitation,
        }
      : { ...EMPTY_VALUES };
    const openMeteoValues = await this.fetchOpenMeteoBenchmark(location.latitude, location.longitude);
    const customSensorValues = { ...EMPTY_VALUES };
    const nowFormatted = formatNorwegianTime(now, {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: timezone,
    });
    const rawValues: BenchmarkValues = rawStationValues;

    const comparison = (
      source_id: BenchmarkSourceType,
      source_name: string,
      source_type_label: string,
      values: BenchmarkValues,
      lastUpdated: string
    ): CalibrationSourceComparison => ({
      source_id,
      source_name,
      source_type_label,
      ...values,
      delta_temp: difference(values.temperature, rawValues.temperature),
      delta_humidity: difference(values.humidity, rawValues.humidity),
      delta_pressure: difference(values.pressure, rawValues.pressure),
      delta_wind: difference(values.wind_speed, rawValues.wind_speed),
      delta_precip: difference(values.precipitation, rawValues.precipitation),
      last_updated: lastUpdated,
    });

    const stationUpdated = tempObs
      ? formatNorwegianTime(tempObs.observed_at, { hour: '2-digit', minute: '2-digit', timeZone: timezone })
      : 'Ingen data';
    const comparisons: CalibrationSourceComparison[] = [
      comparison(
        'frost_station',
        `MET målestasjon (${rawStationValues.station_name})`,
        'Offisiell bakkestasjon',
        rawValues,
        stationUpdated
      ),
      comparison(
        'locationforecast',
        'MET Locationforecast 2.0 (Yr)',
        'Numerisk værmodell',
        yrValues,
        latestRun ? formatNorwegianTime(latestRun.retrieved_at, { hour: '2-digit', minute: '2-digit', timeZone: timezone }) : 'Ingen data'
      ),
      comparison(
        'open_meteo',
        'Open-Meteo',
        'Global numerisk referanse',
        openMeteoValues,
        Object.values(openMeteoValues).some((value) => value !== null) ? nowFormatted : 'Ingen data'
      ),
      comparison(
        'custom_sensor',
        profile.custom_sensor_name || 'Lokal referansesensor',
        'Ikke tilkoblet',
        customSensorValues,
        'Ingen data'
      ),
    ];

    const chosenBenchmark =
      comparisons.find((item) => item.source_id === profile.reference_benchmark) || comparisons[1];
    const suggestedOffsets = buildSuggestedOffsets(rawValues, chosenBenchmark);

    return {
      location: {
        id: location.id,
        name: location.name,
        latitude: location.latitude,
        longitude: location.longitude,
        altitude: location.altitude,
      },
      profile,
      raw_station_values: rawStationValues,
      calibrated_values: this.applyCalibration(rawValues, profile.offsets, profile.is_enabled),
      comparisons,
      suggested_offsets: suggestedOffsets,
    };
  }

  public static saveProfile(profile: LocationCalibrationProfile): LocationCalibrationProfile {
    const db = getDb();
    const updated: LocationCalibrationProfile = { ...profile, last_calibrated_at: new Date().toISOString() };
    db.saveCalibrationProfile(updated);
    db.flush();
    return updated;
  }

  public static async autoCalibrate(
    locationId: string,
    benchmarkSource: BenchmarkSourceType
  ): Promise<CalibrationPayload> {
    const payload = await this.getCalibrationPayload(locationId);
    const chosenBenchmark = payload.comparisons.find((item) => item.source_id === benchmarkSource);
    if (!chosenBenchmark) throw new Error('Ukjent kalibreringskilde');

    const raw: BenchmarkValues = payload.raw_station_values;
    const comparableCount = [
      [raw.temperature, chosenBenchmark.temperature],
      [raw.humidity, chosenBenchmark.humidity],
      [raw.pressure, chosenBenchmark.pressure],
      [raw.wind_speed, chosenBenchmark.wind_speed],
      [raw.precipitation, chosenBenchmark.precipitation],
    ].filter(([a, b]) => a !== null && b !== null).length;
    if (comparableCount === 0) {
      throw new Error(`Kan ikke kalibrere mot ${chosenBenchmark.source_name}: ingen samtidige gyldige målepar.`);
    }

    const newOffsets = buildSuggestedOffsets(raw, chosenBenchmark);
    const updatedProfile: LocationCalibrationProfile = {
      location_id: locationId,
      is_enabled: true,
      reference_benchmark: benchmarkSource,
      offsets: newOffsets,
      last_calibrated_at: new Date().toISOString(),
      auto_calibration_notes: `Automatisk krysskalibrert mot ${chosenBenchmark.source_name} med ${comparableCount} sammenlignbare felt`,
    };
    this.saveProfile(updatedProfile);
    return this.getCalibrationPayload(locationId);
  }

  public static resetProfile(locationId: string): LocationCalibrationProfile {
    return getDb().resetCalibrationProfile(locationId);
  }
}
