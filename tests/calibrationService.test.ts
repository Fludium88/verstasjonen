import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CalibrationService } from '../src/services/calibration/calibrationService';
import { getDb } from '../src/lib/db';
import { LocationCalibrationProfile } from '../src/types/calibration';

describe('CalibrationService & Cross-Source Sensor Calibration', () => {
  const testLocId = 'loc_calibration_test';

  beforeEach(() => {
    const db = getDb();
    db.saveLocation({
      id: testLocId,
      name: 'Kalibrering Teststed',
      latitude: 62.7905,
      longitude: 6.9208,
      altitude: 18,
      timezone: 'Europe/Oslo',
      is_active: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  });

  it('correctly applies sensor calibration offsets and multipliers', () => {
    const raw = {
      temperature: 12.0,
      humidity: 80,
      pressure: 1000.0,
      wind_speed: 10.0,
      wind_gust: 15.0,
      precipitation: 4.0,
    };

    const offsets = {
      temp_offset: 1.5, // +1.5 °C
      humidity_offset: -5, // -5 %
      pressure_offset: 2.2, // +2.2 hPa
      wind_multiplier: 1.1, // +10%
      precip_multiplier: 1.05, // +5%
    };

    // When disabled, raw values should be untouched
    const disabledResult = CalibrationService.applyCalibration(raw, offsets, false);
    expect(disabledResult.temperature).toBe(12.0);
    expect(disabledResult.humidity).toBe(80);
    expect(disabledResult.pressure).toBe(1000.0);
    expect(disabledResult.wind_speed).toBe(10.0);
    expect(disabledResult.wind_gust).toBe(15.0);
    expect(disabledResult.precipitation).toBe(4.0);

    // When enabled, offsets and multipliers must be accurately applied
    const enabledResult = CalibrationService.applyCalibration(raw, offsets, true);
    expect(enabledResult.temperature).toBe(13.5);
    expect(enabledResult.humidity).toBe(75);
    expect(enabledResult.pressure).toBe(1002.2);
    expect(enabledResult.wind_speed).toBe(11.0);
    expect(enabledResult.wind_gust).toBe(16.5);
    expect(enabledResult.precipitation).toBe(4.2);
  });

  it('generates multi-source calibration payload comparing station, Yr and Open-Meteo', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    const payload = await CalibrationService.getCalibrationPayload(testLocId);

    expect(payload.location.id).toBe(testLocId);
    expect(payload.raw_station_values).toBeDefined();
    expect(payload.comparisons.length).toBeGreaterThanOrEqual(3);

    const stationSrc = payload.comparisons.find((c) => c.source_id === 'frost_station');
    const yrSrc = payload.comparisons.find((c) => c.source_id === 'locationforecast');
    const openMeteoSrc = payload.comparisons.find((c) => c.source_id === 'open_meteo');

    expect(stationSrc).toBeDefined();
    expect(yrSrc).toBeDefined();
    expect(openMeteoSrc).toBeDefined();

    expect(payload.raw_station_values.temperature).toBeNull();
    expect(stationSrc?.delta_temp).toBeNull();
    expect(yrSrc?.delta_temp).toBeNull();
    expect(openMeteoSrc?.temperature).toBeNull();
    expect(payload.comparisons.find((c) => c.source_id === 'custom_sensor')?.temperature).toBeNull();
    fetchMock.mockRestore();
  });

  it('refuses auto-calibration when no simultaneous valid pairs exist', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    await expect(CalibrationService.autoCalibrate(testLocId, 'locationforecast')).rejects.toThrow(
      'ingen samtidige gyldige målepar'
    );
    expect(getDb().getCalibrationProfile(testLocId).is_enabled).toBe(false);
    fetchMock.mockRestore();
  });

  it('resets calibration profile back to default 0-offsets', () => {
    const reset = CalibrationService.resetProfile(testLocId);
    expect(reset.is_enabled).toBe(false);
    expect(reset.offsets.temp_offset).toBe(0.0);
    expect(reset.offsets.humidity_offset).toBe(0);
    expect(reset.offsets.pressure_offset).toBe(0.0);
    expect(reset.offsets.wind_multiplier).toBe(1.0);
    expect(reset.offsets.precip_multiplier).toBe(1.0);
  });
});
