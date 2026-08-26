export type BenchmarkSourceType = 'frost_station' | 'locationforecast' | 'custom_sensor';

export interface SensorCalibrationOffsets {
  temp_offset: number; // in deg C (e.g. +0.5 or -1.2)
  humidity_offset: number; // in % (e.g. +2 or -5)
  pressure_offset: number; // in hPa (e.g. +1.5 or -2.0)
  wind_multiplier: number; // factor (e.g. 1.05 = +5%)
  precip_multiplier: number; // factor (e.g. 1.10 = +10%)
}

export interface CalibrationSourceComparison {
  source_id: BenchmarkSourceType;
  source_name: string;
  source_type_label: string; // "Offisiell målestasjon", "Yr numerisk modell", "Bruker-referanse"
  temperature: number | null;
  humidity: number | null;
  pressure: number | null;
  wind_speed: number | null;
  precipitation: number | null;
  delta_temp: number | null; // compared to primary station
  delta_humidity: number | null;
  delta_pressure: number | null;
  delta_wind: number | null;
  delta_precip: number | null;
  last_updated: string;
}

export interface LocationCalibrationProfile {
  location_id: string;
  is_enabled: boolean;
  reference_benchmark: BenchmarkSourceType;
  custom_sensor_name?: string;
  offsets: SensorCalibrationOffsets;
  last_calibrated_at: string | null;
  auto_calibration_notes?: string | null;
}

export interface CalibrationPayload {
  location: {
    id: string;
    name: string;
    latitude: number;
    longitude: number;
    altitude: number | null;
  };
  profile: LocationCalibrationProfile;
  raw_station_values: {
    station_name: string;
    station_id: string;
    temperature: number | null;
    humidity: number | null;
    pressure: number | null;
    wind_speed: number | null;
    precipitation: number | null;
  };
  calibrated_values: {
    temperature: number | null;
    humidity: number | null;
    pressure: number | null;
    wind_speed: number | null;
    precipitation: number | null;
  };
  comparisons: CalibrationSourceComparison[];
  suggested_offsets: SensorCalibrationOffsets;
}
