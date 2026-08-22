export interface MetAlertItem {
  id: string;
  event: string; // e.g. "wind", "rain", "snow", "gale", "flood", "icing"
  event_name_no: string; // e.g. "Kraftige vindkast", "Mye regn", "Snøfokk"
  severity: 'YELLOW' | 'ORANGE' | 'RED';
  severity_label: string; // e.g. "Gult nivå (Moderat)", "Oransje nivå (Betydelig)", "Rødt nivå (Ekstremt)"
  area: string;
  description: string;
  consequences: string;
  instruction: string;
  start_time: string; // ISO
  end_time: string; // ISO
  awareness_type?: string;
  source: 'MET_CAP';
}

export interface CustomAlertConfig {
  enabled: boolean;
  windGustLimitMs: number;
  windSpeedLimitMs: number;
  frostLimitC: number;
  heavyRainHourLimitMm: number;
  pressureDropLimitHpa: number;
  browserNotificationsEnabled: boolean;
}

export const DEFAULT_ALERT_CONFIG: CustomAlertConfig = {
  enabled: true,
  windGustLimitMs: 18.0,
  windSpeedLimitMs: 12.0,
  frostLimitC: 0.0,
  heavyRainHourLimitMm: 8.0,
  pressureDropLimitHpa: 3.0,
  browserNotificationsEnabled: false,
};

export interface ThresholdAlarm {
  id: string;
  type: 'WIND_GUST' | 'STRONG_WIND' | 'FROST' | 'HEAVY_RAIN' | 'PRESSURE_DROP';
  severity: 'YELLOW' | 'ORANGE' | 'RED';
  title: string;
  message: string;
  current_value: number;
  threshold_value: number;
  unit: string;
  triggered_at: string;
}
