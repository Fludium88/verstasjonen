import { describe, it, expect } from 'vitest';
import { ThresholdAlertsEngine, CustomAlertConfig } from '../src/services/alerts/thresholdAlertsEngine';
import { DashboardPayload } from '../src/types/weather';

describe('ThresholdAlertsEngine', () => {
  const customConfig: CustomAlertConfig = {
    enabled: true,
    windGustLimitMs: 18.0,
    windSpeedLimitMs: 12.0,
    frostLimitC: 0.0,
    heavyRainHourLimitMm: 8.0,
    pressureDropLimitHpa: 3.0,
    browserNotificationsEnabled: false,
  };

  const createMockPayload = (overrides: Partial<DashboardPayload['current']>): DashboardPayload => ({
    location: {
      id: 'loc_aukra',
      name: 'Aukra',
      latitude: 62.79,
      longitude: 6.92,
      altitude: 18,
      timezone: 'Europe/Oslo',
      is_active: 1,
      created_at: '',
      updated_at: '',
    },
    current: {
      temperature: 12.0,
      feels_like: 11.0,
      weather_text: 'Lettskyet',
      symbol_code: 'fair',
      source_type: 'MÅLT',
      source_label: 'Målt ved Aukra',
      element_provenance: Object.fromEntries(
        ['temperature', 'wind', 'gust', 'direction', 'pressure', 'humidity', 'precipitation', 'snow'].map(
          (element) => [
            element,
            {
              source_type: 'MÅLT',
              observed_at: '2026-08-22T10:00:00Z',
              station_id: 'SN_TEST',
              source_label: 'Målt ved teststasjon',
            },
          ]
        )
      ) as DashboardPayload['current']['element_provenance'],
      updated_at: '12:00',
      is_delayed: false,
      precipitation_last_hour: 0.0,
      precipitation_today: 0.0,
      precipitation_last_24h: 0.0,
      wind_speed: 6.0,
      wind_gust: 8.5,
      wind_direction: 220,
      wind_direction_cardinal: 'SV',
      beaufort_label: 'Laber bris',
      temp_min_today: 8.0,
      temp_max_today: 14.0,
      pressure: {
        current_hpa: 1010,
        diff_3h: -0.5,
        diff_24h: -2.0,
        trend: 'STEADY',
        trend_label: 'Stabilt',
        min_24h: 1008,
        max_24h: 1015,
      },
      humidity: 80,
      dew_point: 8.0,
      snow_depth: null,
      new_snow_24h: null,
      ...overrides,
    },
    hourly_history_24h: [],
    forecast_next_24h: [],
    sources: [],
    records: {
      highest_temp: { value: 30, date: '2025-07-01' },
      lowest_temp: { value: -10, date: '2025-01-01' },
      wettest_day: { value: 50, date: '2025-09-01' },
      strongest_wind_gust: { value: 30, date: '2025-03-01' },
    },
    wind_rose_7d: [],
    sun_times: { sunrise: '05:00', sunset: '22:00' },
  });

  it('triggers WIND_GUST alarm when gust exceeds threshold', () => {
    const payload = createMockPayload({ wind_gust: 22.5 });
    const alarms = ThresholdAlertsEngine.evaluateAlarms(payload, customConfig);

    expect(alarms.some((a) => a.type === 'WIND_GUST')).toBe(true);
    const gustAlarm = alarms.find((a) => a.type === 'WIND_GUST');
    expect(gustAlarm?.current_value).toBe(22.5);
    expect(gustAlarm?.severity).toBe('ORANGE');
  });

  it('triggers FROST alarm when temperature is below or equal to 0.0 °C', () => {
    const payload = createMockPayload({ temperature: -2.1 });
    const alarms = ThresholdAlertsEngine.evaluateAlarms(payload, customConfig);

    expect(alarms.some((a) => a.type === 'FROST')).toBe(true);
    const frostAlarm = alarms.find((a) => a.type === 'FROST');
    expect(frostAlarm?.current_value).toBe(-2.1);
  });

  it('triggers PRESSURE_DROP alarm on rapid 3h drop >= 3.0 hPa', () => {
    const payload = createMockPayload({
      pressure: {
        current_hpa: 998,
        diff_3h: -3.8,
        diff_24h: -12.0,
        trend: 'STEEPLY_FALLING',
        trend_label: 'Kraftig fallende',
        min_24h: 998,
        max_24h: 1015,
      },
    });
    const alarms = ThresholdAlertsEngine.evaluateAlarms(payload, customConfig);

    expect(alarms.some((a) => a.type === 'PRESSURE_DROP')).toBe(true);
  });

  it('returns empty array when alerts are disabled', () => {
    const payload = createMockPayload({ wind_gust: 35.0, temperature: -15.0 });
    const alarms = ThresholdAlertsEngine.evaluateAlarms(payload, { ...customConfig, enabled: false });

    expect(alarms).toEqual([]);
  });

  it('rejects unknown, non-finite and out-of-range alert settings', () => {
    expect(() => ThresholdAlertsEngine.saveAlertConfig({ windSpeedLimitMs: Number.NaN })).toThrow();
    expect(() => ThresholdAlertsEngine.saveAlertConfig({ frostLimitC: -100 })).toThrow();
    expect(() => ThresholdAlertsEngine.saveAlertConfig({ arbitrary: 1 } as any)).toThrow();
    expect(() => ThresholdAlertsEngine.saveAlertConfig({ enabled: 'yes' } as any)).toThrow();
  });
});
