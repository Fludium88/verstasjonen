import { getDb } from '@/lib/db';
import { DashboardPayload } from '@/types/weather';
import { CustomAlertConfig, DEFAULT_ALERT_CONFIG, ThresholdAlarm } from '@/types/alerts';

export { DEFAULT_ALERT_CONFIG };
export type { CustomAlertConfig, ThresholdAlarm };

const CONFIG_LIMITS = {
  windGustLimitMs: [1, 100],
  windSpeedLimitMs: [1, 75],
  frostLimitC: [-50, 20],
  heavyRainHourLimitMm: [0.1, 200],
  pressureDropLimitHpa: [0.1, 50],
} as const;

function validateConfigPatch(value: unknown): Partial<CustomAlertConfig> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Varselinnstillinger må være et objekt.');
  }
  const input = value as Record<string, unknown>;
  const allowed = new Set([
    'enabled',
    'windGustLimitMs',
    'windSpeedLimitMs',
    'frostLimitC',
    'heavyRainHourLimitMm',
    'pressureDropLimitHpa',
    'browserNotificationsEnabled',
  ]);
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) throw new Error(`Ukjent varselinnstilling: ${key}`);
  }
  const output: Partial<CustomAlertConfig> = {};
  for (const key of ['enabled', 'browserNotificationsEnabled'] as const) {
    if (key in input) {
      if (typeof input[key] !== 'boolean') throw new Error(`${key} må være true eller false.`);
      output[key] = input[key];
    }
  }
  for (const key of Object.keys(CONFIG_LIMITS) as Array<keyof typeof CONFIG_LIMITS>) {
    if (!(key in input)) continue;
    const raw = input[key];
    const [min, max] = CONFIG_LIMITS[key];
    if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < min || raw > max) {
      throw new Error(`${key} må være et endelig tall mellom ${min} og ${max}.`);
    }
    output[key] = raw;
  }
  return output;
}

export class ThresholdAlertsEngine {
  /**
   * Loads user custom alert configuration
   */
  static getAlertConfig(): CustomAlertConfig {
    const db = getDb();
    const saved = db.getSetting('custom_alert_config');
    if (saved) {
      try {
        return { ...DEFAULT_ALERT_CONFIG, ...validateConfigPatch(JSON.parse(saved)) };
      } catch {
        // fallback
      }
    }
    return DEFAULT_ALERT_CONFIG;
  }

  /**
   * Saves user custom alert configuration
   */
  static saveAlertConfig(config: Partial<CustomAlertConfig>): CustomAlertConfig {
    const db = getDb();
    const current = this.getAlertConfig();
    const updated: CustomAlertConfig = { ...current, ...validateConfigPatch(config) };
    db.setSetting('custom_alert_config', JSON.stringify(updated));
    db.flush();
    return updated;
  }

  /**
   * Evaluates active telemetry and upcoming forecast against threshold limits
   */
  static evaluateAlarms(
    payload: DashboardPayload,
    config: CustomAlertConfig = this.getAlertConfig()
  ): ThresholdAlarm[] {
    if (!config.enabled) return [];

    const alarms: ThresholdAlarm[] = [];
    const nowIso = new Date().toISOString();
    const current = payload.current;
    const sourceFor = (element: keyof DashboardPayload['current']['element_provenance']) =>
      current.element_provenance?.[element]?.source_type ?? current.source_type;
    const isUsable = (element: keyof DashboardPayload['current']['element_provenance']) => {
      const source = sourceFor(element);
      return source !== 'UKJENT' && !(source === 'PROGNOSE' && current.is_delayed);
    };
    const qualifierFor = (element: keyof DashboardPayload['current']['element_provenance']) => {
      const source = sourceFor(element);
      return source === 'MÅLT'
        ? 'målt'
        : source === 'ESTIMERT'
          ? 'modelljustert fra måling'
          : source === 'PROGNOSE'
            ? 'forventet'
            : 'oppgitt';
    };
    const alarmId = (type: string) => `alarm_${payload.location.id}_${type}`;

    // 1. Wind Gust Alarm
    const gust = current.wind_gust;
    if (isUsable('gust') && gust !== null && gust !== undefined && gust >= config.windGustLimitMs) {
      const isRed = gust >= config.windGustLimitMs + 8;
      const isOrange = gust >= config.windGustLimitMs + 4;
      alarms.push({
        id: alarmId('gust'),
        type: 'WIND_GUST',
        severity: isRed ? 'RED' : isOrange ? 'ORANGE' : 'YELLOW',
        title: 'Kraftige vindkast registrert',
        message: `Vindkast er ${qualifierFor('gust')} til ${gust.toFixed(1)} m/s og overstiger grensen på ${config.windGustLimitMs} m/s.`,
        current_value: gust,
        threshold_value: config.windGustLimitMs,
        unit: 'm/s',
        triggered_at: nowIso,
      });
    }

    // 2. Strong Mean Wind Alarm
    if (
      isUsable('wind') &&
      current.wind_speed !== null &&
      current.wind_speed !== undefined &&
      current.wind_speed >= config.windSpeedLimitMs
    ) {
      alarms.push({
        id: alarmId('wind'),
        type: 'STRONG_WIND',
        severity: current.wind_speed >= 17.2 ? 'ORANGE' : 'YELLOW',
        title: 'Sterk middelvind',
        message: `Middelvinden er ${qualifierFor('wind')} til ${current.wind_speed.toFixed(1)} m/s (terskel: ${config.windSpeedLimitMs} m/s).`,
        current_value: current.wind_speed,
        threshold_value: config.windSpeedLimitMs,
        unit: 'm/s',
        triggered_at: nowIso,
      });
    }

    // 3. Frost / Sub-zero Temperature Alarm
    if (
      isUsable('temperature') &&
      current.temperature !== null &&
      current.temperature !== undefined &&
      current.temperature <= config.frostLimitC
    ) {
      alarms.push({
        id: alarmId('frost'),
        type: 'FROST',
        severity: current.temperature <= -5.0 ? 'ORANGE' : 'YELLOW',
        title: 'Frost / Minusgrader',
        message: `Temperaturen er ${qualifierFor('temperature')} til ${current.temperature.toFixed(1)} °C. Fare for glatte veier og ising.`,
        current_value: current.temperature,
        threshold_value: config.frostLimitC,
        unit: '°C',
        triggered_at: nowIso,
      });
    }

    // 4. Heavy Rain Alarm (Last hour or next hour)
    const forecastPrecip = payload.forecast_next_24h?.[0]?.precipitation;
    const forecastPeriod = payload.forecast_next_24h?.[0]?.precipitation_period_hours ?? 1;
    const forecastRainRate =
      forecastPrecip === null || forecastPrecip === undefined || forecastPeriod <= 0
        ? null
        : forecastPrecip / forecastPeriod;
    const rainCandidates = [current.precipitation_last_hour, forecastRainRate].filter(
      (value): value is number => value !== null && value !== undefined && Number.isFinite(value)
    );
    const rain = rainCandidates.length > 0 ? Math.max(...rainCandidates) : null;
    const rainQualifier =
      forecastRainRate !== null &&
      (current.precipitation_last_hour === null || forecastRainRate >= current.precipitation_last_hour)
        ? 'forventet'
        : qualifierFor('precipitation');
    if (rain !== null && rain !== undefined && rain >= config.heavyRainHourLimitMm) {
      alarms.push({
        id: alarmId('rain'),
        type: 'HEAVY_RAIN',
        severity: rain >= 15.0 ? 'RED' : rain >= 10.0 ? 'ORANGE' : 'YELLOW',
        title: 'Kraftig nedbør / styrtregn',
        message: `Nedbørsintensiteten er ${rainQualifier} til ${rain.toFixed(1)} mm/time og overstiger grensen på ${config.heavyRainHourLimitMm} mm/t.`,
        current_value: rain,
        threshold_value: config.heavyRainHourLimitMm,
        unit: 'mm/t',
        triggered_at: nowIso,
      });
    }

    // 5. Rapid Pressure Drop Alarm (Barometric gale warning)
    const diff3h = current.pressure.diff_3h;
    if (isUsable('pressure') && diff3h !== null && diff3h !== undefined && diff3h <= -config.pressureDropLimitHpa) {
      alarms.push({
        id: alarmId('pressure'),
        type: 'PRESSURE_DROP',
        severity: diff3h <= -5.0 ? 'RED' : 'ORANGE',
        title: 'Kraftig barometerfall (Uvær i anmarsj)',
        message: `Lufttrykket har falt med ${Math.abs(diff3h).toFixed(1)} hPa de siste 3 timene. Varsler rask værendring.`,
        current_value: Math.abs(diff3h),
        threshold_value: config.pressureDropLimitHpa,
        unit: 'hPa/3t',
        triggered_at: nowIso,
      });
    }

    return alarms;
  }
}
