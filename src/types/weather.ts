export type WeatherDataSourceType =
  | 'MÅLT'
  | 'ESTIMERT'
  | 'PROGNOSE'
  | 'SIMULERT'
  | 'BLANDET'
  | 'UKJENT';

export interface CurrentElementProvenance {
  source_type: 'MÅLT' | 'ESTIMERT' | 'PROGNOSE' | 'UKJENT';
  observed_at: string | null;
  station_id?: string;
  source_label: string;
}

export interface LocationRecord {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  altitude: number | null;
  address?: string | null;
  timezone: string;
  is_active: number; // 1 or 0
  created_at: string;
  updated_at: string;
}

export interface WeatherStation {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  altitude: number | null;
  distance_km?: number;
  elements_supported: string[];
  frost_element_ids?: string[];
  last_observed_at?: string | null;
  quality_rating?: number;
  source_type?: string;
}

export interface StationElementMapping {
  location_id: string;
  element: 'temperature' | 'precipitation' | 'wind' | 'pressure' | 'humidity' | 'snow';
  station_id: string;
  station_name?: string;
  distance_km?: number;
  station_altitude?: number | null;
}

export interface Observation {
  id: string;
  location_id: string;
  station_id: string;
  observed_at: string; // ISO UTC
  air_temperature: number | null;
  relative_humidity: number | null;
  air_pressure: number | null;
  precipitation_amount: number | null; // null = missing, 0 = no rain
  wind_speed: number | null;
  wind_gust: number | null;
  wind_direction: number | null;
  snow_depth: number | null;
  source: string;
  quality_code: string | null;
  retrieved_at: string;
  element_sources?: Partial<
    Record<
      | 'air_temperature'
      | 'relative_humidity'
      | 'air_pressure'
      | 'precipitation_amount'
      | 'wind_speed'
      | 'wind_gust'
      | 'wind_direction'
      | 'snow_depth',
      string
    >
  >;
}

export interface ForecastRun {
  id: string;
  location_id: string;
  source: string;
  model_run?: string | null;
  retrieved_at: string;
  expires_at?: string | null;
  created_at: string;
  latitude?: number;
  longitude?: number;
  altitude?: number;
}

export interface ForecastValue {
  id: string;
  forecast_run_id: string;
  valid_at: string; // ISO UTC
  lead_time_hours: number;
  temperature: number | null;
  feels_like: number | null;
  precipitation: number | null;
  precipitation_probability: number | null;
  wind_speed: number | null;
  wind_gust: number | null;
  wind_direction: number | null;
  humidity: number | null;
  pressure: number | null;
  cloud_fraction: number | null;
  symbol_code: string | null;
  source_type: 'RADAR_NOWCAST' | 'WEATHER_MODEL';
  precipitation_period_hours?: number;
}

export interface DailyWeatherSummary {
  id: string;
  location_id: string;
  date: string; // YYYY-MM-DD
  temperature_min: number | null;
  temperature_max: number | null;
  temperature_avg: number | null;
  precipitation_total: number | null;
  precipitation_max_hour: number | null;
  wind_avg: number | null;
  wind_max: number | null;
  wind_gust_max: number | null;
  wind_dominant_direction: number | null;
  pressure_min: number | null;
  pressure_max: number | null;
  pressure_avg: number | null;
  humidity_min: number | null;
  humidity_max: number | null;
  humidity_avg: number | null;
  rain_hours: number | null;
  frost_hours: number | null;
  dominant_symbol: string | null;
  precipitation_coverage_hours?: number;
  temperature_coverage_hours?: number;
  wind_coverage_hours?: number;
  is_partial?: boolean;
}

export interface MonthlyWeatherSummary {
  id: string;
  location_id: string;
  year: number;
  month: number; // 1-12
  temperature_avg: number | null;
  temperature_min: number | null;
  temperature_max: number | null;
  precipitation_total: number | null;
  rainy_days: number | null;
  max_daily_precipitation: number | null;
  precipitation_coverage_days?: number;
  expected_coverage_days?: number;
  is_partial?: boolean;
  wind_avg?: number | null;
  wind_max?: number | null;
  max_wind_gust: number | null;
  wind_dominant_direction?: number | null;
  wind_dominant_cardinal?: string | null;
  warmest_day: string | null;
  coldest_day: string | null;
  wettest_day: string | null;
}

export type PressureTrend =
  | 'STEEPLY_RISING'
  | 'RISING'
  | 'STEADY'
  | 'FALLING'
  | 'STEEPLY_FALLING'
  | 'UNKNOWN';

export interface PressureAnalysis {
  current_hpa: number | null;
  diff_3h: number | null;
  diff_24h: number | null;
  trend: PressureTrend;
  trend_label: string;
  min_24h: number | null;
  max_24h: number | null;
}

export interface RainEvent {
  start_at: string;
  end_at: string;
  duration_hours: number;
  total_mm: number;
  max_intensity_mm_per_hour: number;
}

export interface ForecastAccuracyItem {
  lead_time_hours: number; // 1, 6, 12, 24, 48
  temp_mae: number | null;
  temp_bias: number | null;
  precip_forecast_sum: number | null;
  precip_observed_sum: number | null;
  precip_mae: number | null;
  wind_mae: number | null;
  data_points: number;
  temp_points?: number;
  precip_points?: number;
  wind_points?: number;
}

export interface ElementSourceDetail {
  element: string;
  label: string;
  station_id: string;
  station_name: string;
  distance_km: number | null;
  altitude_moh: number | null;
  source_type: WeatherDataSourceType;
  completeness_pct: number;
  last_observed_at: string | null;
  is_stale?: boolean;
}

export interface DashboardPayload {
  location: LocationRecord;
  current: {
    temperature: number | null;
    feels_like: number | null;
    weather_text: string;
    symbol_code: string | null;
    source_type: WeatherDataSourceType;
    source_label: string;
    element_provenance: {
      temperature: CurrentElementProvenance;
      wind: CurrentElementProvenance;
      gust: CurrentElementProvenance;
      direction: CurrentElementProvenance;
      pressure: CurrentElementProvenance;
      humidity: CurrentElementProvenance;
      precipitation: CurrentElementProvenance;
      snow: CurrentElementProvenance;
    };
    station_name?: string;
    station_distance_km?: number;
    station_altitude?: number | null;
    updated_at: string;
    is_delayed: boolean;
    precipitation_last_hour: number | null;
    precipitation_today: number | null;
    precipitation_last_24h: number | null;
    wind_speed: number | null;
    wind_gust: number | null;
    wind_direction: number | null;
    wind_direction_cardinal: string;
    beaufort_label: string;
    temp_min_today: number | null;
    temp_max_today: number | null;
    pressure: PressureAnalysis;
    humidity: number | null;
    dew_point: number | null;
    snow_depth: number | null;
    new_snow_24h: number | null;
    calibration_active?: boolean;
    calibration_offsets?: {
      temp: number;
      hum: number;
      press: number;
      wind: number;
      precip: number;
    };
  };
  hourly_history_24h: {
    time: string; // ISO
    display_time: string; // e.g. "14:00"
    temperature: number | null;
    temp_avg?: number | null;
    temp_min?: number | null;
    temp_max?: number | null;
    precipitation: number | null;
    wind_speed: number | null;
    wind_gust: number | null;
    wind_direction: number | null;
    pressure: number | null;
    humidity: number | null;
    symbol_code?: string;
    source_type: WeatherDataSourceType;
  }[];
  forecast_next_24h: {
    time: string;
    display_time: string;
    temperature: number | null;
    precipitation: number | null;
    precipitation_prob: number | null;
    precipitation_period_hours?: number;
    wind_speed: number | null;
    wind_gust: number | null;
    wind_direction: number | null;
    symbol_code: string | null;
    is_radar_nowcast: boolean;
    source_label: string;
  }[];
  sources: ElementSourceDetail[];
  records?: {
    highest_temp?: { value: number; date: string } | null;
    lowest_temp?: { value: number; date: string } | null;
    wettest_day?: { value: number; date: string } | null;
    strongest_wind_gust?: { value: number; date: string } | null;
  };
  wind_rose_7d?: { sector: string; frequency_pct: number; avg_speed_ms: number | null; count: number }[];
  sun_times?: { sunrise: string; sunset: string };
}
