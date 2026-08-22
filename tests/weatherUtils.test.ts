import { describe, it, expect } from 'vitest';
import {
  calculateFeelsLike,
  calculateDewPoint,
  getWindDirectionCardinal8,
  getWindDirectionCardinal16,
  getBeaufort,
  evaluatePressureTrend,
  calculateHaversineDistanceKm,
  roundMetCoord,
  formatWeatherSymbolName,
} from '@/lib/weatherUtils';

describe('Weather Utilities & Meteorological Formulas', () => {
  it('calculates feels-like temperature using wind chill when cold & windy', () => {
    // 5°C with 10 m/s wind
    const chill = calculateFeelsLike(5, 10, 80);
    expect(chill).toBeLessThan(5);
    expect(chill).toBeCloseTo(-0.4, 0.2);
  });

  it('does not invent missing wind or humidity for feels-like values', () => {
    expect(calculateFeelsLike(5, null, 80)).toBeNull();
    expect(calculateFeelsLike(28, 2, null)).toBeNull();
    expect(calculateFeelsLike(15, null, null)).toBe(15);
  });

  it('calculates feels-like temperature during warm humid weather', () => {
    const at = calculateFeelsLike(28, 2, 75);
    expect(at).toBeGreaterThan(28);
  });

  it('handles null inputs in feels-like safely', () => {
    expect(calculateFeelsLike(null, 5, 50)).toBeNull();
  });

  it('calculates dew point temperature', () => {
    const dp = calculateDewPoint(15, 60);
    expect(dp).toBeCloseTo(7.3, 0.5);
  });

  it('converts degrees to Norwegian 8-sector cardinal wind direction', () => {
    expect(getWindDirectionCardinal8(0)).toBe('N');
    expect(getWindDirectionCardinal8(45)).toBe('NØ');
    expect(getWindDirectionCardinal8(90)).toBe('Ø');
    expect(getWindDirectionCardinal8(135)).toBe('SØ');
    expect(getWindDirectionCardinal8(180)).toBe('S');
    expect(getWindDirectionCardinal8(225)).toBe('SV');
    expect(getWindDirectionCardinal8(270)).toBe('V');
    expect(getWindDirectionCardinal8(315)).toBe('NV');
    expect(getWindDirectionCardinal8(360)).toBe('N');
  });

  it('converts degrees to 16-sector cardinal wind direction', () => {
    expect(getWindDirectionCardinal16(22.5)).toBe('NNØ');
    expect(getWindDirectionCardinal16(202.5)).toBe('SSV');
  });

  it('maps wind speed to Norwegian Beaufort scale', () => {
    expect(getBeaufort(0.1).name).toBe('Stille');
    expect(getBeaufort(7.2).name).toBe('Laber bris');
    expect(getBeaufort(12.5).name).toBe('Liten kuling');
    expect(getBeaufort(19.0).name).toBe('Sterk kuling');
    expect(getBeaufort(22.0).name).toBe('Liten storm');
    expect(getBeaufort(33.0).name).toBe('Orkan');
  });

  it('evaluates pressure trend correctly based on central thresholds', () => {
    expect(evaluatePressureTrend(-4.3).trend).toBe('STEEPLY_FALLING');
    expect(evaluatePressureTrend(-4.3).label).toBe('Kraftig fallende');

    expect(evaluatePressureTrend(-1.8).trend).toBe('FALLING');
    expect(evaluatePressureTrend(-1.8).label).toBe('Fallende');

    expect(evaluatePressureTrend(0.2).trend).toBe('STEADY');
    expect(evaluatePressureTrend(0.2).label).toBe('Stabilt');

    expect(evaluatePressureTrend(1.5).trend).toBe('RISING');
    expect(evaluatePressureTrend(1.5).label).toBe('Stigende');

    expect(evaluatePressureTrend(3.5).trend).toBe('STEEPLY_RISING');
    expect(evaluatePressureTrend(3.5).label).toBe('Kraftig stigende');
    expect(evaluatePressureTrend(null)).toEqual({ trend: 'UNKNOWN', label: 'Ikke tilgjengelig' });
  });

  it('calculates Haversine distance accurately', () => {
    // Aukra (62.7905, 6.9208) to Molde (62.7375, 7.1591)
    const dist = calculateHaversineDistanceKm(62.7905, 6.9208, 62.7375, 7.1591);
    expect(dist).toBeGreaterThan(12);
    expect(dist).toBeLessThan(18);
  });

  it('rounds coordinates to MET recommended 4 decimals', () => {
    expect(roundMetCoord(62.79051234)).toBe(62.7905);
    expect(roundMetCoord(6.92089999)).toBe(6.9209);
  });

  it('formats weather symbols to Norwegian descriptions', () => {
    expect(formatWeatherSymbolName('rain')).toBe('Regn');
    expect(formatWeatherSymbolName('heavyrain_day')).toBe('Kraftig regn');
    expect(formatWeatherSymbolName('partlycloudy_night')).toBe('Delvis skyet');
  });
});
