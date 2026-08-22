import { describe, it, expect } from 'vitest';
import { AstronomyService } from '@/services/astronomy/astronomyService';
import { ForecastValue } from '@/types/weather';

describe('AstronomyService - Astronomical Calculations', () => {
  const aukraLat = 62.7885;
  const aukraLon = 6.9152;
  const aukraAlt = 12;

  const tromsoLat = 69.6537;
  const tromsoLon = 18.9372;
  const tromsoAlt = 100;

  it('converts degrees to Norwegian 16-point cardinal compass directions', () => {
    expect(AstronomyService.getCardinalDirection(0)).toBe('N');
    expect(AstronomyService.getCardinalDirection(45)).toBe('NØ');
    expect(AstronomyService.getCardinalDirection(90)).toBe('Ø');
    expect(AstronomyService.getCardinalDirection(135)).toBe('SØ');
    expect(AstronomyService.getCardinalDirection(180)).toBe('S');
    expect(AstronomyService.getCardinalDirection(225)).toBe('SV');
    expect(AstronomyService.getCardinalDirection(270)).toBe('V');
    expect(AstronomyService.getCardinalDirection(315)).toBe('NV');
    expect(AstronomyService.getCardinalDirection(360)).toBe('N');
    expect(AstronomyService.getCardinalDirection(218)).toBe('SV');
    expect(AstronomyService.getCardinalDirection(126)).toBe('SØ');
  });

  it('classifies moon phase names and calculates synodic moon age', () => {
    const newMoon = AstronomyService.getMoonPhaseDetails(0);
    expect(newMoon.name).toBe('Nymåne');
    expect(newMoon.ageDays).toBeCloseTo(0, 0.5);

    const firstQtr = AstronomyService.getMoonPhaseDetails(90);
    expect(firstQtr.name).toBe('Første kvarter');
    expect(firstQtr.ageDays).toBeCloseTo(7.4, 0.5);

    const fullMoon = AstronomyService.getMoonPhaseDetails(180);
    expect(fullMoon.name).toBe('Fullmåne');
    expect(fullMoon.ageDays).toBeCloseTo(14.8, 0.5);

    const lastQtr = AstronomyService.getMoonPhaseDetails(270);
    expect(lastQtr.name).toBe('Siste kvarter');
    expect(lastQtr.ageDays).toBeCloseTo(22.1, 0.5);

    const waxingGibbous = AstronomyService.getMoonPhaseDetails(140);
    expect(waxingGibbous.name).toBe('Tiltagende måne');
  });

  it('calculates sun position (altitude & azimuth) with topocentric accuracy', () => {
    // 18. August 2026 at 12:00 UTC (14:00 local time) in Aukra
    const date = new Date('2026-08-18T12:00:00Z');
    const pos = AstronomyService.calculateSunPosition(aukraLat, aukraLon, aukraAlt, date);

    expect(pos.altitude).toBeGreaterThan(20);
    expect(pos.altitude).toBeLessThan(60);
    expect(pos.azimuth).toBeGreaterThan(150);
    expect(pos.azimuth).toBeLessThan(220);
    expect(pos.isAboveHorizon).toBe(true);
  });

  it('calculates moon position, illumination fraction, and phase angle', () => {
    const date = new Date('2026-08-18T12:00:00Z');
    const moon = AstronomyService.calculateMoonPosition(aukraLat, aukraLon, aukraAlt, date);

    expect(moon.illumination.fraction).toBeGreaterThanOrEqual(0);
    expect(moon.illumination.fraction).toBeLessThanOrEqual(1);
    expect(moon.illumination.percentage).toBeGreaterThanOrEqual(0);
    expect(moon.illumination.percentage).toBeLessThanOrEqual(100);
    expect(typeof moon.illumination.phaseName).toBe('string');
    expect(moon.position.azimuth).toBeGreaterThanOrEqual(0);
    expect(moon.position.azimuth).toBeLessThan(360);
  });

  it('calculates day summary with sunrise, sunset, solar noon, twilight and darkness', () => {
    const summary = AstronomyService.calculateDaySummary(
      aukraLat,
      aukraLon,
      aukraAlt,
      '2026-08-18',
      'Europe/Oslo'
    );

    expect(summary.date).toBe('2026-08-18');
    expect(summary.sun.sunrise).toBeTruthy();
    expect(summary.sun.sunset).toBeTruthy();
    expect(summary.sun.solarNoon).toBeTruthy();
    expect(summary.sun.dayLengthMinutes).toBeGreaterThan(800); // ~15+ hours
    expect(summary.sun.maxAltitude).toBeGreaterThan(30);

    // Twilight
    expect(summary.sun.twilight.civilDawn).toBeTruthy();
    expect(summary.sun.twilight.civilDusk).toBeTruthy();

    // Darkness
    expect(summary.sun.darkness.sunBelowHorizonMinutes).toBeGreaterThan(0);

    // Moon
    expect(summary.moon.illumination).toBeDefined();
    expect(summary.moon.maxAltitude).toBeDefined();
  });

  it('correctly handles midnight sun (polar day) for northern latitudes', () => {
    // Tromsø on summer solstice (21. June 2026)
    const summary = AstronomyService.calculateDaySummary(
      tromsoLat,
      tromsoLon,
      tromsoAlt,
      '2026-06-21',
      'Europe/Oslo'
    );

    expect(summary.sun.twilight.isPolarDay).toBe(true);
    expect(summary.sun.sunrise).toBe('Midnattssol');
    expect(summary.sun.sunset).toBe('Går ikke ned');
    expect(summary.sun.dayLengthMinutes).toBe(1440);
    expect(summary.sun.dayLengthFormatted).toBe('24 t 00 min');
  });

  it('correctly handles polar night (mørketid) for northern latitudes', () => {
    // Tromsø on winter solstice (21. December 2026)
    const summary = AstronomyService.calculateDaySummary(
      tromsoLat,
      tromsoLon,
      tromsoAlt,
      '2026-12-21',
      'Europe/Oslo'
    );

    expect(summary.sun.twilight.isPolarNight).toBe(true);
    expect(summary.sun.sunrise).toBe('Mørketid');
    expect(summary.sun.sunset).toBe('Står ikke opp');
    expect(summary.sun.dayLengthMinutes).toBe(0);
    expect(summary.sun.dayLengthFormatted).toBe('0 t 00 min');
  });

  it('generates 24-hour curve sampled at 15-minute intervals (97 points from 00:00 to 24:00)', () => {
    const curve = AstronomyService.calculate24hCurve(
      aukraLat,
      aukraLon,
      aukraAlt,
      '2026-08-18',
      'Europe/Oslo'
    );

    expect(curve.length).toBe(97);
    expect(curve[0].displayTime).toBe('00:00');
    expect(curve[curve.length - 1].displayTime).toBe('24:00');
    expect(curve.every((pt) => typeof pt.sunAltitude === 'number')).toBe(true);
    expect(curve.every((pt) => typeof pt.moonAltitude === 'number')).toBe(true);
    expect(curve.every((pt) => typeof pt.skyCondition === 'string')).toBe(true);
  });

  it('calculates full monthly moon data (all days of month)', () => {
    const monthDays = AstronomyService.calculateMonthMoonData(
      aukraLat,
      aukraLon,
      aukraAlt,
      2026,
      8,
      'Europe/Oslo'
    );

    expect(monthDays.length).toBe(31);
    expect(monthDays[0].dayNumber).toBe(1);
    expect(monthDays[30].dayNumber).toBe(31);
    expect(monthDays.every((d) => d.illuminationPct >= 0 && d.illuminationPct <= 100)).toBe(true);
    expect(monthDays.every((d) => typeof d.phaseName === 'string')).toBe(true);
  });

  it('calculates upcoming 4 moon quarters with exact timestamps', () => {
    const upcoming = AstronomyService.calculateUpcomingPhases(new Date('2026-08-18T00:00:00Z'));

    expect(upcoming.length).toBe(4);
    expect(upcoming.map((u) => u.quarterIndex)).toEqual([1, 2, 3, 0]);
    expect(upcoming.every((u) => u.displayDate.length > 0)).toBe(true);
  });

  it('calculates yearly sun analysis with solstices, equinoxes, and daylight curve', () => {
    const yearly = AstronomyService.calculateYearlySunData(
      aukraLat,
      aukraLon,
      aukraAlt,
      2026,
      'Europe/Oslo'
    );

    expect(yearly.year).toBe(2026);
    expect(yearly.points.length).toBeGreaterThan(150);
    expect(yearly.longestDay.hours).toBeGreaterThan(yearly.shortestDay.hours);
    expect(yearly.maxSunAltitudeAnnual.altitude).toBeGreaterThan(yearly.minSunAltitudeAnnual.altitude);
    expect(yearly.seasons.summerSolstice.displayDate).toBeTruthy();
    expect(yearly.seasons.winterSolstice.displayDate).toBeTruthy();
    expect(yearly.seasons.springEquinox.displayDate).toBeTruthy();
    expect(yearly.seasons.autumnEquinox.displayDate).toBeTruthy();
  });

  it('correlates astronomy with weather forecast values for night moon observation advice', () => {
    const summary = AstronomyService.calculateDaySummary(
      aukraLat,
      aukraLon,
      aukraAlt,
      '2026-08-18',
      'Europe/Oslo'
    );

    const mockForecast: ForecastValue[] = [
      {
        id: 'fv1',
        forecast_run_id: 'fr1',
        valid_at: '2026-08-18T04:00:00Z',
        lead_time_hours: 4,
        temperature: 14,
        feels_like: 13,
        precipitation: 0,
        precipitation_probability: 10,
        wind_speed: 3,
        wind_gust: 5,
        wind_direction: 180,
        humidity: 75,
        pressure: 1015,
        cloud_fraction: 15,
        symbol_code: 'clearsky_day',
        source_type: 'WEATHER_MODEL',
      },
      {
        id: 'fv2',
        forecast_run_id: 'fr1',
        valid_at: '2026-08-18T21:00:00Z',
        lead_time_hours: 21,
        temperature: 11,
        feels_like: 10,
        precipitation: 0,
        precipitation_probability: 5,
        wind_speed: 2,
        wind_gust: 4,
        wind_direction: 200,
        humidity: 80,
        pressure: 1016,
        cloud_fraction: 18,
        symbol_code: 'clearsky_night',
        source_type: 'WEATHER_MODEL',
      },
    ];

    const corr = AstronomyService.correlateWeather(summary, mockForecast);
    expect(corr.tonightObservation.hasForecast).toBe(true);
    expect(corr.tonightObservation.cloudCoverTonightPct).toBe(18);
    expect(corr.tonightObservation.observationRating).not.toBe('UNKNOWN');
  });
});
