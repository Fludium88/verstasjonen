import * as Astronomy from 'astronomy-engine';
import {
  CelestialPosition,
  MoonIlluminationData,
  TwilightTimes,
  DarknessDurations,
  DayAstronomySummary,
  HourlyAstronomyPoint,
  MonthMoonDay,
  UpcomingMoonPhase,
  YearlySunAnalysisData,
  YearlySunAnalysisPoint,
  AstronomyWeatherCorrelation,
  MoonPhaseName,
  SkyConditionCategory,
  CelestialArcPoint,
  SkyArcData,
  AROrientationSensorSource,
} from '@/types/astronomy';
import { ForecastValue } from '@/types/weather';
import {
  addLocalDateDays,
  getLocalDateKey,
  getLocalDayBounds as getZonedDayBounds,
  normalizeTimeZone,
  zonedDateTimeToUtc,
} from '@/services/time/timeZone';

export class AstronomyService {
  /**
   * Converts azimuth degrees (0-360) into 16-point Norwegian cardinal direction
   */
  static getCardinalDirection(azimuth: number): string {
    const norm = ((azimuth % 360) + 360) % 360;
    const directions = [
      'N',
      'NNØ',
      'NØ',
      'ØNØ',
      'Ø',
      'ØSØ',
      'SØ',
      'SSØ',
      'S',
      'SSV',
      'SV',
      'VSV',
      'V',
      'VNV',
      'NV',
      'NNV',
    ];
    const index = Math.round(norm / 22.5) % 16;
    return directions[index];
  }

  /**
   * Determines moon phase name and details from phase angle (0-360)
   */
  static getMoonPhaseDetails(phaseAngle: number): { name: MoonPhaseName; ageDays: number } {
    const norm = ((phaseAngle % 360) + 360) % 360;
    const synodicDays = 29.530588853;
    const ageDays = Number(((norm / 360) * synodicDays).toFixed(1));

    let name: MoonPhaseName;
    if (norm >= 337.5 || norm < 22.5) {
      name = 'Nymåne';
    } else if (norm >= 22.5 && norm < 67.5) {
      name = 'Tiltagende sigd';
    } else if (norm >= 67.5 && norm < 112.5) {
      name = 'Første kvarter';
    } else if (norm >= 112.5 && norm < 157.5) {
      name = 'Tiltagende måne';
    } else if (norm >= 157.5 && norm < 202.5) {
      name = 'Fullmåne';
    } else if (norm >= 202.5 && norm < 247.5) {
      name = 'Avtagende måne';
    } else if (norm >= 247.5 && norm < 292.5) {
      name = 'Siste kvarter';
    } else {
      name = 'Avtagende sigd';
    }

    return { name, ageDays };
  }

  /**
   * Helper to format a Date into local HH:mm string
   */
  static formatLocalTime(date: Date | null | undefined, timezone: string): string | null {
    if (!date || isNaN(date.getTime())) return null;
    return new Intl.DateTimeFormat('nb-NO', {
      timeZone: normalizeTimeZone(timezone),
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(date);
  }

  /**
   * Helper to format a Date into Norwegian date string (e.g. "18. august")
   */
  static formatNorwegianDate(date: Date | null | undefined, timezone: string, includeYear = false): string {
    if (!date || isNaN(date.getTime())) return '';
    const options: Intl.DateTimeFormatOptions = {
      timeZone: normalizeTimeZone(timezone),
      day: 'numeric',
      month: 'long',
    };
    if (includeYear) options.year = 'numeric';
    return new Intl.DateTimeFormat('nb-NO', options).format(date);
  }

  /**
   * Parses YYYY-MM-DD into a local midnight Date in target timezone
   */
  static getLocalDayBounds(dateStr: string, timezone: string): { startUtc: Date; endUtc: Date } {
    const { startUtc, endUtc } = getZonedDayBounds(dateStr, timezone);
    return { startUtc, endUtc };
  }

  /**
   * Calculates Sun Position at a specific instant
   */
  static calculateSunPosition(
    lat: number,
    lon: number,
    altitudeMoh: number,
    date: Date
  ): CelestialPosition {
    const obs = new Astronomy.Observer(lat, lon, altitudeMoh);
    const sunEq = Astronomy.Equator(Astronomy.Body.Sun, date, obs, true, true);
    const sunHor = Astronomy.Horizon(date, obs, sunEq.ra, sunEq.dec, 'normal');

    const altitude = Number(sunHor.altitude.toFixed(1));
    const azimuth = Number(sunHor.azimuth.toFixed(1));
    const cardinalDirection = this.getCardinalDirection(azimuth);
    const isAboveHorizon = altitude > -0.833; // Standard atmospheric refraction horizon

    return { altitude, azimuth, cardinalDirection, isAboveHorizon };
  }

  /**
   * Calculates Moon Position and Illumination at a specific instant
   */
  static calculateMoonPosition(
    lat: number,
    lon: number,
    altitudeMoh: number,
    date: Date
  ): { position: CelestialPosition; illumination: MoonIlluminationData } {
    const obs = new Astronomy.Observer(lat, lon, altitudeMoh);
    const moonEq = Astronomy.Equator(Astronomy.Body.Moon, date, obs, true, true);
    const moonHor = Astronomy.Horizon(date, obs, moonEq.ra, moonEq.dec, 'normal');

    const altitude = Number(moonHor.altitude.toFixed(1));
    const azimuth = Number(moonHor.azimuth.toFixed(1));
    const cardinalDirection = this.getCardinalDirection(azimuth);
    const isAboveHorizon = altitude > -0.583;

    const illum = Astronomy.Illumination(Astronomy.Body.Moon, date);
    const phaseAngle = Astronomy.MoonPhase(date);
    const { name: phaseName, ageDays: moonAgeDays } = this.getMoonPhaseDetails(phaseAngle);

    const fraction = Number(illum.phase_fraction.toFixed(3));
    const percentage = Math.round(illum.phase_fraction * 100);

    return {
      position: { altitude, azimuth, cardinalDirection, isAboveHorizon },
      illumination: {
        fraction,
        percentage,
        phaseAngle: Number(phaseAngle.toFixed(1)),
        phaseName,
        moonAgeDays,
      },
    };
  }

  /**
   * Helper to search for an event within local day bounds (00:00 to 24:00)
   */
  private static findEventInDay(
    searchFn: (start: Date, windowDays: number) => Astronomy.AstroTime | null,
    startUtc: Date,
    endUtc: Date
  ): Date | null {
    // Search within window
    const windowDays = (endUtc.getTime() - startUtc.getTime()) / (24 * 3600 * 1000);
    const event = searchFn(startUtc, windowDays + 0.1);
    if (!event) return null;
    const d = event.date;
    if (d.getTime() >= startUtc.getTime() - 60000 && d.getTime() <= endUtc.getTime() + 60000) {
      return d;
    }
    return null;
  }

  /**
   * Calculates complete day summary for sun and moon
   */
  static calculateDaySummary(
    lat: number,
    lon: number,
    altitudeMoh: number,
    dateStr: string,
    timezone = 'Europe/Oslo'
  ): DayAstronomySummary {
    const obs = new Astronomy.Observer(lat, lon, altitudeMoh);
    const { startUtc, endUtc } = this.getLocalDayBounds(dateStr, timezone);
    const now = new Date();

    // 1. Solar Events
    const sunriseDate = this.findEventInDay(
      (s, w) => Astronomy.SearchRiseSet(Astronomy.Body.Sun, obs, +1, s, w),
      startUtc,
      endUtc
    );
    const sunsetDate = this.findEventInDay(
      (s, w) => Astronomy.SearchRiseSet(Astronomy.Body.Sun, obs, -1, s, w),
      startUtc,
      endUtc
    );
    const solarNoonTime = Astronomy.SearchHourAngle(Astronomy.Body.Sun, obs, 0, startUtc, 1.1);
    const solarNoonDate = solarNoonTime ? solarNoonTime.time.date : null;

    // Solar noon altitude
    let maxSunAltitude = 0;
    if (solarNoonDate) {
      const eq = Astronomy.Equator(Astronomy.Body.Sun, solarNoonDate, obs, true, true);
      const hor = Astronomy.Horizon(solarNoonDate, obs, eq.ra, eq.dec, 'normal');
      maxSunAltitude = Number(hor.altitude.toFixed(1));
    } else {
      const midDay = new Date((startUtc.getTime() + endUtc.getTime()) / 2);
      const eq = Astronomy.Equator(Astronomy.Body.Sun, midDay, obs, true, true);
      const hor = Astronomy.Horizon(midDay, obs, eq.ra, eq.dec, 'normal');
      maxSunAltitude = Number(hor.altitude.toFixed(1));
    }

    // Twilight
    const civilDawnDate = this.findEventInDay(
      (s, w) => Astronomy.SearchAltitude(Astronomy.Body.Sun, obs, +1, s, w, -6),
      startUtc,
      endUtc
    );
    const civilDuskDate = this.findEventInDay(
      (s, w) => Astronomy.SearchAltitude(Astronomy.Body.Sun, obs, -1, s, w, -6),
      startUtc,
      endUtc
    );
    const nauticalDawnDate = this.findEventInDay(
      (s, w) => Astronomy.SearchAltitude(Astronomy.Body.Sun, obs, +1, s, w, -12),
      startUtc,
      endUtc
    );
    const nauticalDuskDate = this.findEventInDay(
      (s, w) => Astronomy.SearchAltitude(Astronomy.Body.Sun, obs, -1, s, w, -12),
      startUtc,
      endUtc
    );
    const astroDawnDate = this.findEventInDay(
      (s, w) => Astronomy.SearchAltitude(Astronomy.Body.Sun, obs, +1, s, w, -18),
      startUtc,
      endUtc
    );
    const astroDuskDate = this.findEventInDay(
      (s, w) => Astronomy.SearchAltitude(Astronomy.Body.Sun, obs, -1, s, w, -18),
      startUtc,
      endUtc
    );

    // Polar day / night check
    let isPolarDay = false;
    let isPolarNight = false;
    let polarDayNote: string | undefined;

    if (!sunriseDate && !sunsetDate) {
      if (maxSunAltitude >= -0.833) {
        isPolarDay = true;
        polarDayNote = 'Midnattssol – Solen går ikke ned denne dagen';
      } else {
        isPolarNight = true;
        polarDayNote = 'Mørketid – Solen står ikke opp denne dagen';
      }
    }

    // Day length
    let dayLengthMinutes = 0;
    if (isPolarDay) {
      dayLengthMinutes = 24 * 60;
    } else if (isPolarNight) {
      dayLengthMinutes = 0;
    } else if (sunriseDate && sunsetDate) {
      const diffMs = sunsetDate.getTime() - sunriseDate.getTime();
      dayLengthMinutes = Math.max(0, Math.round(diffMs / 60000));
    } else if (sunriseDate && !sunsetDate) {
      dayLengthMinutes = Math.round((endUtc.getTime() - sunriseDate.getTime()) / 60000);
    } else if (!sunriseDate && sunsetDate) {
      dayLengthMinutes = Math.round((sunsetDate.getTime() - startUtc.getTime()) / 60000);
    }

    const dlHours = Math.floor(dayLengthMinutes / 60);
    const dlMins = dayLengthMinutes % 60;
    const dayLengthFormatted = isPolarDay
      ? '24 t 00 min'
      : isPolarNight
      ? '0 t 00 min'
      : `${dlHours} t ${dlMins} min`;

    // Yesterday's day length for comparison
    const yesterdayStr = addLocalDateDays(dateStr, -1);
    const yesterdaySum = this.calculateBasicDayLength(lat, lon, altitudeMoh, yesterdayStr, timezone);
    const diffMinsTotal = dayLengthMinutes - yesterdaySum;
    const diffSecTotal = Math.round((diffMinsTotal % 1) * 60);
    const diffAbsMin = Math.floor(Math.abs(diffMinsTotal));
    const diffAbsSec = Math.abs(diffSecTotal);
    const sign = diffMinsTotal >= 0 ? '+' : '−';
    const dayLengthDiffYesterdayFormatted =
      diffMinsTotal === 0
        ? 'Ingen endring'
        : `${sign}${diffAbsMin} min ${diffAbsSec} sek`;

    // Darkness breakdown sampling (every 5 min)
    let below0 = 0;
    let below6 = 0;
    let below12 = 0;
    let below18 = 0;
    const stepMin = 5;
    const dayDurationMinutes = Math.round((endUtc.getTime() - startUtc.getTime()) / 60000);
    const steps = Math.ceil(dayDurationMinutes / stepMin);
    for (let i = 0; i < steps; i++) {
      const t = new Date(startUtc.getTime() + i * stepMin * 60000);
      const sunEq = Astronomy.Equator(Astronomy.Body.Sun, t, obs, true, true);
      const sunHor = Astronomy.Horizon(t, obs, sunEq.ra, sunEq.dec, 'normal');
      const alt = sunHor.altitude;
      if (alt < -0.833) below0 += stepMin;
      if (alt < -6) below6 += stepMin;
      if (alt < -12) below12 += stepMin;
      if (alt < -18) below18 += stepMin;
    }

    const darkness: DarknessDurations = {
      sunBelowHorizonMinutes: below0,
      sunBelowCivilMinutes: below6,
      sunBelowNauticalMinutes: below12,
      sunBelowAstronomicalMinutes: below18,
    };

    // Current Sun Position
    const currentSun = this.calculateSunPosition(lat, lon, altitudeMoh, now);

    // 2. Moon Events
    const moonriseDate = this.findEventInDay(
      (s, w) => Astronomy.SearchRiseSet(Astronomy.Body.Moon, obs, +1, s, w),
      startUtc,
      endUtc
    );
    const moonsetDate = this.findEventInDay(
      (s, w) => Astronomy.SearchRiseSet(Astronomy.Body.Moon, obs, -1, s, w),
      startUtc,
      endUtc
    );

    const moonTransitTime = Astronomy.SearchHourAngle(Astronomy.Body.Moon, obs, 0, startUtc, 1.1);
    const moonTransitDate = moonTransitTime ? moonTransitTime.time.date : null;

    let moonMaxAlt = 0;
    let moonAzimuthAtCulmination = 180;
    if (moonTransitDate) {
      const eq = Astronomy.Equator(Astronomy.Body.Moon, moonTransitDate, obs, true, true);
      const hor = Astronomy.Horizon(moonTransitDate, obs, eq.ra, eq.dec, 'normal');
      moonMaxAlt = Number(hor.altitude.toFixed(1));
      moonAzimuthAtCulmination = Number(hor.azimuth.toFixed(1));
    } else {
      // Find peak altitude in this 24h day
      let peak = -90;
      let peakAz = 180;
      for (let i = 0; i < 48; i++) {
        const t = new Date(startUtc.getTime() + i * 30 * 60000);
        const eq = Astronomy.Equator(Astronomy.Body.Moon, t, obs, true, true);
        const hor = Astronomy.Horizon(t, obs, eq.ra, eq.dec, 'normal');
        if (hor.altitude > peak) {
          peak = hor.altitude;
          peakAz = hor.azimuth;
        }
      }
      moonMaxAlt = Number(peak.toFixed(1));
      moonAzimuthAtCulmination = Number(peakAz.toFixed(1));
    }

    // Always above or below horizon check
    const isMoonAlwaysAbove = !moonriseDate && !moonsetDate && moonMaxAlt > 0;
    const isMoonAlwaysBelow = !moonriseDate && !moonsetDate && moonMaxAlt <= 0;

    // Current Moon Position & Illumination (at noon of chosen date if viewing other date, else now)
    const targetDateForIllum = dateStr === getLocalDateKey(now, timezone) ? now : new Date((startUtc.getTime() + endUtc.getTime()) / 2);
    const currentMoon = this.calculateMoonPosition(lat, lon, altitudeMoh, now);
    const dayMoon = this.calculateMoonPosition(lat, lon, altitudeMoh, targetDateForIllum);

    // Next Full Moon and New Moon search
    let nextFullMoon = '';
    let nextNewMoon = '';
    try {
      let mq = Astronomy.SearchMoonQuarter(startUtc);
      for (let i = 0; i < 8; i++) {
        if (mq.quarter === 2 && !nextFullMoon) {
          nextFullMoon = this.formatNorwegianDate(mq.time.date, timezone);
        }
        if (mq.quarter === 0 && !nextNewMoon) {
          nextNewMoon = this.formatNorwegianDate(mq.time.date, timezone);
        }
        if (nextFullMoon && nextNewMoon) break;
        mq = Astronomy.NextMoonQuarter(mq);
      }
    } catch {
      nextFullMoon = 'Ukjent';
      nextNewMoon = 'Ukjent';
    }

    // Night Moon Conditions Interval
    let moonIntervalOverHorizon = 'Under horisonten';
    if (isMoonAlwaysAbove) {
      moonIntervalOverHorizon = 'Over horisonten hele døgnet';
    } else if (isMoonAlwaysBelow) {
      moonIntervalOverHorizon = 'Under horisonten hele døgnet';
    } else if (moonriseDate && moonsetDate) {
      moonIntervalOverHorizon = `${this.formatLocalTime(moonriseDate, timezone)}–${this.formatLocalTime(moonsetDate, timezone)}`;
    } else if (moonriseDate) {
      moonIntervalOverHorizon = `Fra ${this.formatLocalTime(moonriseDate, timezone)}`;
    } else if (moonsetDate) {
      moonIntervalOverHorizon = `Til ${this.formatLocalTime(moonsetDate, timezone)}`;
    }

    // Darkest moonless period
    let darkestMoonlessWindow = 'Ingen mørk periode';
    if (civilDuskDate && civilDawnDate) {
      if (isMoonAlwaysBelow) {
        darkestMoonlessWindow = `${this.formatLocalTime(civilDuskDate, timezone)}–${this.formatLocalTime(civilDawnDate, timezone)}`;
      } else if (moonsetDate && moonsetDate.getTime() > civilDuskDate.getTime() && moonsetDate.getTime() < civilDawnDate.getTime()) {
        darkestMoonlessWindow = `${this.formatLocalTime(moonsetDate, timezone)}–${this.formatLocalTime(civilDawnDate, timezone)}`;
      } else if (moonriseDate && moonriseDate.getTime() > civilDuskDate.getTime() && moonriseDate.getTime() < civilDawnDate.getTime()) {
        darkestMoonlessWindow = `${this.formatLocalTime(civilDuskDate, timezone)}–${this.formatLocalTime(moonriseDate, timezone)}`;
      }
    }

    return {
      date: dateStr,
      latitude: lat,
      longitude: lon,
      altitudeMoh,
      timezone,
      sun: {
        sunrise: isPolarDay ? 'Midnattssol' : isPolarNight ? 'Mørketid' : this.formatLocalTime(sunriseDate, timezone),
        sunset: isPolarDay ? 'Går ikke ned' : isPolarNight ? 'Står ikke opp' : this.formatLocalTime(sunsetDate, timezone),
        solarNoon: this.formatLocalTime(solarNoonDate, timezone),
        dayLengthMinutes,
        dayLengthFormatted,
        dayLengthDiffYesterdayMinutes: diffMinsTotal,
        dayLengthDiffYesterdayFormatted,
        currentAltitude: currentSun.altitude,
        currentAzimuth: currentSun.azimuth,
        currentDirection: currentSun.cardinalDirection,
        maxAltitude: maxSunAltitude,
        twilight: {
          astronomicalDawn: this.formatLocalTime(astroDawnDate, timezone),
          nauticalDawn: this.formatLocalTime(nauticalDawnDate, timezone),
          civilDawn: this.formatLocalTime(civilDawnDate, timezone),
          sunrise: this.formatLocalTime(sunriseDate, timezone),
          solarNoon: this.formatLocalTime(solarNoonDate, timezone),
          maxSunAltitude,
          sunset: this.formatLocalTime(sunsetDate, timezone),
          civilDusk: this.formatLocalTime(civilDuskDate, timezone),
          nauticalDusk: this.formatLocalTime(nauticalDuskDate, timezone),
          astronomicalDusk: this.formatLocalTime(astroDuskDate, timezone),
          isPolarDay,
          isPolarNight,
          noTrueNight: darkness.sunBelowAstronomicalMinutes === 0,
          polarDayNote,
        },
        darkness,
      },
      moon: {
        moonrise: isMoonAlwaysAbove ? 'Over horisonten' : isMoonAlwaysBelow ? 'Under horisonten' : this.formatLocalTime(moonriseDate, timezone),
        moonset: isMoonAlwaysAbove ? 'Går ikke ned' : isMoonAlwaysBelow ? 'Står ikke opp' : this.formatLocalTime(moonsetDate, timezone),
        moonTransit: this.formatLocalTime(moonTransitDate, timezone),
        maxAltitude: moonMaxAlt,
        azimuthAtCulmination: moonAzimuthAtCulmination,
        directionAtCulmination: this.getCardinalDirection(moonAzimuthAtCulmination),
        currentAltitude: currentMoon.position.altitude,
        currentAzimuth: currentMoon.position.azimuth,
        currentDirection: currentMoon.position.cardinalDirection,
        illumination: dayMoon.illumination,
        isAlwaysAboveHorizon: isMoonAlwaysAbove,
        isAlwaysBelowHorizon: isMoonAlwaysBelow,
        nextFullMoonDate: nextFullMoon,
        nextNewMoonDate: nextNewMoon,
      },
      nightConditions: {
        moonIlluminationPct: dayMoon.illumination.percentage,
        moonIntervalOverHorizon,
        maxNightMoonAltitude: moonMaxAlt,
        darkestMoonlessWindow,
      },
    };
  }

  /**
   * Helper for quick daylength calculation
   */
  private static calculateBasicDayLength(
    lat: number,
    lon: number,
    altitudeMoh: number,
    dateStr: string,
    timezone: string
  ): number {
    const obs = new Astronomy.Observer(lat, lon, altitudeMoh);
    const { startUtc, endUtc } = this.getLocalDayBounds(dateStr, timezone);
    const sunrise = this.findEventInDay((s, w) => Astronomy.SearchRiseSet(Astronomy.Body.Sun, obs, +1, s, w), startUtc, endUtc);
    const sunset = this.findEventInDay((s, w) => Astronomy.SearchRiseSet(Astronomy.Body.Sun, obs, -1, s, w), startUtc, endUtc);

    if (!sunrise && !sunset) {
      const midDay = new Date((startUtc.getTime() + endUtc.getTime()) / 2);
      const eq = Astronomy.Equator(Astronomy.Body.Sun, midDay, obs, true, true);
      const hor = Astronomy.Horizon(midDay, obs, eq.ra, eq.dec, 'normal');
      return hor.altitude >= -0.833 ? 1440 : 0;
    }
    if (sunrise && sunset) {
      return Math.round((sunset.getTime() - sunrise.getTime()) / 60000);
    }
    if (sunrise) return Math.round((endUtc.getTime() - sunrise.getTime()) / 60000);
    if (sunset) return Math.round((sunset.getTime() - startUtc.getTime()) / 60000);
    return 0;
  }

  /**
   * Calculates 24h curve sampled at 15-minute intervals (97 points from 00:00 to 24:00)
   */
  static calculate24hCurve(
    lat: number,
    lon: number,
    altitudeMoh: number,
    dateStr: string,
    timezone = 'Europe/Oslo',
    forecastValues: ForecastValue[] = []
  ): HourlyAstronomyPoint[] {
    const obs = new Astronomy.Observer(lat, lon, altitudeMoh);
    const { startUtc, endUtc } = this.getLocalDayBounds(dateStr, timezone);

    // Map forecast values by ISO time
    const forecastMap = new Map<string, ForecastValue>();
    for (const fv of forecastValues) {
      const key = fv.valid_at.substring(0, 13); // YYYY-MM-DDTHH
      forecastMap.set(key, fv);
    }

    const points: HourlyAstronomyPoint[] = [];
    const totalSteps = Math.round((endUtc.getTime() - startUtc.getTime()) / (15 * 60000));

    for (let i = 0; i <= totalSteps; i++) {
      const minutesFromMidnight = i * 15;
      const t = new Date(startUtc.getTime() + minutesFromMidnight * 60000);

      // Local display time (e.g. "00:00", "14:30")
      const displayTime = i === totalSteps
        ? '24:00'
        : this.formatLocalTime(t, timezone) || '';

      // Sun
      const sunEq = Astronomy.Equator(Astronomy.Body.Sun, t, obs, true, true);
      const sunHor = Astronomy.Horizon(t, obs, sunEq.ra, sunEq.dec, 'normal');
      const sunAlt = Number(sunHor.altitude.toFixed(1));
      const sunAz = Number(sunHor.azimuth.toFixed(1));
      const sunDir = this.getCardinalDirection(sunAz);

      // Moon
      const moonEq = Astronomy.Equator(Astronomy.Body.Moon, t, obs, true, true);
      const moonHor = Astronomy.Horizon(t, obs, moonEq.ra, moonEq.dec, 'normal');
      const moonAlt = Number(moonHor.altitude.toFixed(1));
      const moonAz = Number(moonHor.azimuth.toFixed(1));
      const moonDir = this.getCardinalDirection(moonAz);

      const illum = Astronomy.Illumination(Astronomy.Body.Moon, t);
      const moonIllumPct = Math.round(illum.phase_fraction * 100);

      // Sky category based on sun altitude
      let skyCondition: SkyConditionCategory = 'NATT';
      let skyConditionLabel = 'Natt';
      if (sunAlt >= 0) {
        skyCondition = 'DAG';
        skyConditionLabel = 'Dag';
      } else if (sunAlt >= -6) {
        skyCondition = 'BORGERLIG_SKUMRING';
        skyConditionLabel = 'Borgerlig skumring';
      } else if (sunAlt >= -12) {
        skyCondition = 'NAUTISK_SKUMRING';
        skyConditionLabel = 'Nautisk skumring';
      } else if (sunAlt >= -18) {
        skyCondition = 'ASTRONOMISK_SKUMRING';
        skyConditionLabel = 'Astronomisk skumring';
      }

      // Weather match
      const isoHour = t.toISOString().substring(0, 13);
      const matchW = forecastMap.get(isoHour);

      points.push({
        time: t.toISOString(),
        displayTime,
        minutesFromMidnight,
        sunAltitude: sunAlt,
        sunAzimuth: sunAz,
        sunDirection: sunDir,
        isSunAboveHorizon: sunAlt > -0.833,
        moonAltitude: moonAlt,
        moonAzimuth: moonAz,
        moonDirection: moonDir,
        isMoonAboveHorizon: moonAlt > -0.583,
        moonIlluminationPct: moonIllumPct,
        skyCondition,
        skyConditionLabel,
        temperature: matchW?.temperature ?? null,
        cloudCoverPct: matchW?.cloud_fraction != null ? Math.round(matchW.cloud_fraction) : null,
        precipitationMm: matchW?.precipitation ?? null,
        symbolCode: matchW?.symbol_code ?? null,
      });
    }

    return points;
  }

  /**
   * Calculates monthly moon data for all days in year-month
   */
  static calculateMonthMoonData(
    lat: number,
    lon: number,
    altitudeMoh: number,
    year: number,
    month: number, // 1 to 12
    timezone = 'Europe/Oslo'
  ): MonthMoonDay[] {
    const obs = new Astronomy.Observer(lat, lon, altitudeMoh);
    const daysInMonth = new Date(year, month, 0).getDate();
    const todayStr = getLocalDateKey(new Date(), timezone);
    const monthDays: MonthMoonDay[] = [];

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const { startUtc, endUtc } = this.getLocalDayBounds(dateStr, timezone);
      const midDay = new Date((startUtc.getTime() + endUtc.getTime()) / 2);

      // Day of week (0=Sun, 1=Mon, ..., 6=Sat)
      const dayOfWeek = new Date(Date.UTC(year, month - 1, day)).getUTCDay();

      // Moon Illumination & Phase at local noon
      const illum = Astronomy.Illumination(Astronomy.Body.Moon, midDay);
      const phaseAngle = Astronomy.MoonPhase(midDay);
      const { name: phaseName, ageDays: moonAgeDays } = this.getMoonPhaseDetails(phaseAngle);

      // Rise / Set / Transit
      const moonriseDate = this.findEventInDay(
        (s, w) => Astronomy.SearchRiseSet(Astronomy.Body.Moon, obs, +1, s, w),
        startUtc,
        endUtc
      );
      const moonsetDate = this.findEventInDay(
        (s, w) => Astronomy.SearchRiseSet(Astronomy.Body.Moon, obs, -1, s, w),
        startUtc,
        endUtc
      );
      const moonTransitTime = Astronomy.SearchHourAngle(Astronomy.Body.Moon, obs, 0, startUtc, 1.1);
      const moonTransitDate = moonTransitTime ? moonTransitTime.time.date : null;

      let maxAltitude = 0;
      let azCulm = 180;
      if (moonTransitDate) {
        const eq = Astronomy.Equator(Astronomy.Body.Moon, moonTransitDate, obs, true, true);
        const hor = Astronomy.Horizon(moonTransitDate, obs, eq.ra, eq.dec, 'normal');
        maxAltitude = Number(hor.altitude.toFixed(1));
        azCulm = Number(hor.azimuth.toFixed(1));
      } else {
        // Sample highest altitude
        let peak = -90;
        let peakAz = 180;
        for (let i = 0; i < 24; i++) {
          const t = new Date(startUtc.getTime() + i * 60 * 60000);
          const eq = Astronomy.Equator(Astronomy.Body.Moon, t, obs, true, true);
          const hor = Astronomy.Horizon(t, obs, eq.ra, eq.dec, 'normal');
          if (hor.altitude > peak) {
            peak = hor.altitude;
            peakAz = hor.azimuth;
          }
        }
        maxAltitude = Number(peak.toFixed(1));
        azCulm = Number(peakAz.toFixed(1));
      }

      const isAlwaysAbove = !moonriseDate && !moonsetDate && maxAltitude > 0;
      const isAlwaysBelow = !moonriseDate && !moonsetDate && maxAltitude <= 0;

      monthDays.push({
        date: dateStr,
        dayNumber: day,
        dayOfWeek,
        phaseName,
        phaseAngle: Number(phaseAngle.toFixed(1)),
        illuminationFraction: Number(illum.phase_fraction.toFixed(3)),
        illuminationPct: Math.round(illum.phase_fraction * 100),
        moonAgeDays,
        moonrise: isAlwaysAbove ? 'Over horisonten' : isAlwaysBelow ? 'Under horisonten' : this.formatLocalTime(moonriseDate, timezone),
        moonset: isAlwaysAbove ? 'Går ikke ned' : isAlwaysBelow ? 'Står ikke opp' : this.formatLocalTime(moonsetDate, timezone),
        culminationTime: this.formatLocalTime(moonTransitDate, timezone),
        maxAltitude,
        azimuthAtCulmination: azCulm,
        directionAtCulmination: this.getCardinalDirection(azCulm),
        isAlwaysAboveHorizon: isAlwaysAbove,
        isAlwaysBelowHorizon: isAlwaysBelow,
        isCurrentDay: dateStr === todayStr,
      });
    }

    return monthDays;
  }

  /**
   * Calculates next 4 upcoming moon phases with exact times
   */
  static calculateUpcomingPhases(startDate: Date, timezone = 'Europe/Oslo'): UpcomingMoonPhase[] {
    const upcoming: UpcomingMoonPhase[] = [];
    const quarterNames: Record<number, MoonPhaseName> = {
      0: 'Nymåne',
      1: 'Første kvarter',
      2: 'Fullmåne',
      3: 'Siste kvarter',
    };

    try {
      let mq = Astronomy.SearchMoonQuarter(startDate);
      for (let i = 0; i < 4; i++) {
        const qIndex = mq.quarter;
        const qDate = mq.time.date;
        upcoming.push({
          quarterIndex: qIndex,
          phaseName: quarterNames[qIndex] || 'Fullmåne',
          date: qDate.toISOString(),
          displayDate: this.formatNorwegianDate(qDate, timezone, true),
          displayTime: this.formatLocalTime(qDate, timezone) || '',
        });
        mq = Astronomy.NextMoonQuarter(mq);
      }
    } catch (err) {
      console.error('Failed to calculate upcoming moon phases:', err);
    }

    return upcoming;
  }

  /**
   * Calculates full yearly sun analysis: daylight hours, max solar elevation, solstices, and equinoxes
   */
  static calculateYearlySunData(
    lat: number,
    lon: number,
    altitudeMoh: number,
    year: number,
    timezone = 'Europe/Oslo'
  ): YearlySunAnalysisData {
    const obs = new Astronomy.Observer(lat, lon, altitudeMoh);
    const seasons = Astronomy.Seasons(year);
    const todayStr = getLocalDateKey(new Date(), timezone);

    const marEqDate = seasons.mar_equinox.date;
    const junSolDate = seasons.jun_solstice.date;
    const sepEqDate = seasons.sep_equinox.date;
    const decSolDate = seasons.dec_solstice.date;

    const marEqStr = getLocalDateKey(marEqDate, timezone);
    const junSolStr = getLocalDateKey(junSolDate, timezone);
    const sepEqStr = getLocalDateKey(sepEqDate, timezone);
    const decSolStr = getLocalDateKey(decSolDate, timezone);

    const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    const totalDays = isLeap ? 366 : 365;

    const points: YearlySunAnalysisPoint[] = [];
    let longestDay = { date: '', displayDate: '', hours: -1, formatted: '' };
    let shortestDay = { date: '', displayDate: '', hours: 999, formatted: '' };
    let maxAltAnnual = { date: '', displayDate: '', altitude: -90 };
    let minAltAnnual = { date: '', displayDate: '', altitude: 90 };

    // Sample every 2-3 days or full year (sampling every 2 days gives ~182 points, fast and crisp for charts)
    for (let dayOfYear = 1; dayOfYear <= totalDays; dayOfYear += 2) {
      const d = new Date(Date.UTC(year, 0, dayOfYear));
      const dateStr = d.toISOString().substring(0, 10);
      const { startUtc, endUtc } = this.getLocalDayBounds(dateStr, timezone);
      const midDay = new Date((startUtc.getTime() + endUtc.getTime()) / 2);

      // Daylight
      const dayLengthMin = this.calculateBasicDayLength(lat, lon, altitudeMoh, dateStr, timezone);
      const daylightHours = Number((dayLengthMin / 60).toFixed(2));
      const dlHours = Math.floor(dayLengthMin / 60);
      const dlMins = dayLengthMin % 60;
      const daylightFormatted = `${dlHours} t ${dlMins} min`;

      // Solar noon altitude
      const noonTime = Astronomy.SearchHourAngle(Astronomy.Body.Sun, obs, 0, startUtc, 1.1);
      const noonDate = noonTime ? noonTime.time.date : midDay;
      const eq = Astronomy.Equator(Astronomy.Body.Sun, noonDate, obs, true, true);
      const hor = Astronomy.Horizon(noonDate, obs, eq.ra, eq.dec, 'normal');
      const maxAlt = Number(hor.altitude.toFixed(1));

      const displayDate = this.formatNorwegianDate(midDay, timezone, false);
      const isToday = dateStr === todayStr;

      let isSolsticeOrEquinox: YearlySunAnalysisPoint['isSolsticeOrEquinox'] = null;
      let solsticeEquinoxLabel: string | undefined;

      if (dateStr === marEqStr || Math.abs(d.getTime() - marEqDate.getTime()) < 86400000) {
        isSolsticeOrEquinox = 'MAR_EQUINOX';
        solsticeEquinoxLabel = 'Vårjevndøgn';
      } else if (dateStr === junSolStr || Math.abs(d.getTime() - junSolDate.getTime()) < 86400000) {
        isSolsticeOrEquinox = 'JUN_SOLSTICE';
        solsticeEquinoxLabel = 'Sommersolverv';
      } else if (dateStr === sepEqStr || Math.abs(d.getTime() - sepEqDate.getTime()) < 86400000) {
        isSolsticeOrEquinox = 'SEP_EQUINOX';
        solsticeEquinoxLabel = 'Høstjevndøgn';
      } else if (dateStr === decSolStr || Math.abs(d.getTime() - decSolDate.getTime()) < 86400000) {
        isSolsticeOrEquinox = 'DEC_SOLSTICE';
        solsticeEquinoxLabel = 'Vintersolverv';
      }

      if (daylightHours > longestDay.hours) {
        longestDay = { date: dateStr, displayDate, hours: daylightHours, formatted: daylightFormatted };
      }
      if (daylightHours < shortestDay.hours) {
        shortestDay = { date: dateStr, displayDate, hours: daylightHours, formatted: daylightFormatted };
      }
      if (maxAlt > maxAltAnnual.altitude) {
        maxAltAnnual = { date: dateStr, displayDate, altitude: maxAlt };
      }
      if (maxAlt < minAltAnnual.altitude) {
        minAltAnnual = { date: dateStr, displayDate, altitude: maxAlt };
      }

      points.push({
        date: dateStr,
        dayOfYear,
        displayDate,
        daylightHours,
        daylightFormatted,
        maxSunAltitude: maxAlt,
        isToday,
        isSolsticeOrEquinox,
        solsticeEquinoxLabel,
      });
    }

    return {
      year,
      points,
      longestDay,
      shortestDay,
      maxSunAltitudeAnnual: maxAltAnnual,
      minSunAltitudeAnnual: minAltAnnual,
      seasons: {
        springEquinox: {
          date: marEqDate.toISOString(),
          displayDate: this.formatNorwegianDate(marEqDate, timezone, true),
          displayTime: this.formatLocalTime(marEqDate, timezone) || '',
        },
        summerSolstice: {
          date: junSolDate.toISOString(),
          displayDate: this.formatNorwegianDate(junSolDate, timezone, true),
          displayTime: this.formatLocalTime(junSolDate, timezone) || '',
        },
        autumnEquinox: {
          date: sepEqDate.toISOString(),
          displayDate: this.formatNorwegianDate(sepEqDate, timezone, true),
          displayTime: this.formatLocalTime(sepEqDate, timezone) || '',
        },
        winterSolstice: {
          date: decSolDate.toISOString(),
          displayDate: this.formatNorwegianDate(decSolDate, timezone, true),
          displayTime: this.formatLocalTime(decSolDate, timezone) || '',
        },
      },
    };
  }

  /**
   * Correlates astronomy data with weather forecast values for night moon and sun observations
   */
  static correlateWeather(
    daySummary: DayAstronomySummary,
    forecastValues: ForecastValue[] = []
  ): AstronomyWeatherCorrelation {
    const closestForecast = (target: Date | null, toleranceMinutes = 90): ForecastValue | undefined => {
      if (!target) return undefined;
      return [...forecastValues]
        .filter(
          (forecast) =>
            Math.abs(new Date(forecast.valid_at).getTime() - target.getTime()) <= toleranceMinutes * 60000
        )
        .sort(
          (a, b) =>
            Math.abs(new Date(a.valid_at).getTime() - target.getTime()) -
            Math.abs(new Date(b.valid_at).getTime() - target.getTime())
        )[0];
    };
    const { startUtc, endUtc } = this.getLocalDayBounds(daySummary.date, daySummary.timezone);
    const observer = new Astronomy.Observer(
      daySummary.latitude,
      daySummary.longitude,
      daySummary.altitudeMoh
    );
    const tonightInstant = zonedDateTimeToUtc(daySummary.date, daySummary.timezone, 23);
    const tonightForecast = closestForecast(tonightInstant);
    const cloudCoverTonight = tonightForecast?.cloud_fraction != null ? Math.round(tonightForecast.cloud_fraction) : null;
    const precipTonight = tonightForecast?.precipitation ?? null;

    const moonIllum = daySummary.moon.illumination.percentage;
    const moonAlt = this.calculateMoonPosition(
      daySummary.latitude,
      daySummary.longitude,
      daySummary.altitudeMoh,
      tonightInstant
    ).position.altitude;

    let obsRating: AstronomyWeatherCorrelation['tonightObservation']['observationRating'] = 'UNKNOWN';
    let ratingBadge = 'Værprognose mangler';
    let description = `Månen er ${moonIllum} % belyst og står ${moonAlt}° over horisonten kl. 23:00 lokal tid.`;

    if (moonAlt <= 0) {
      obsRating = 'POOR';
      ratingBadge = 'Månen under horisonten';
      description = 'Månen er under horisonten kl. 23:00 lokal tid.';
    } else if (cloudCoverTonight != null) {
      if (precipTonight !== null && precipTonight > 0.5) {
        obsRating = 'POOR';
        ratingBadge = 'Dårlige observasjonsforhold';
        description = `Nedbør forventet (${precipTonight} mm) og skyet himmel. Månen vil være skjult.`;
      } else if (cloudCoverTonight < 25 && moonAlt > 10) {
        obsRating = 'EXCELLENT';
        ratingBadge = 'Gode observasjonsforhold';
        description = `Klar himmel (${cloudCoverTonight} % skydekke) og månen står gunstig til (${moonAlt}°).`;
      } else if (cloudCoverTonight < 60) {
        obsRating = 'GOOD';
        ratingBadge = 'Gode observasjonsforhold';
        description = `Delvis skyet (${cloudCoverTonight} % skydekke). Gode sjanser for måneobservasjon.`;
      } else if (cloudCoverTonight >= 85) {
        obsRating = 'POOR';
        ratingBadge = 'Tett skydekke';
        description = `Månen er synlig astronomisk (${moonIllum} % belyst), men skydekke forventes å være ${cloudCoverTonight} %.`;
      } else {
        obsRating = 'MODERATE';
        ratingBadge = 'Varierende observasjonsforhold';
        description = `Skydekke på ca ${cloudCoverTonight} %. Månen kan tidvis skimtes mellom skyene.`;
      }
    }

    const sunriseDate = this.findEventInDay(
      (start, window) => Astronomy.SearchRiseSet(Astronomy.Body.Sun, observer, +1, start, window),
      startUtc,
      endUtc
    );
    const sunsetDate = this.findEventInDay(
      (start, window) => Astronomy.SearchRiseSet(Astronomy.Body.Sun, observer, -1, start, window),
      startUtc,
      endUtc
    );
    const sunriseFv = closestForecast(sunriseDate);
    const sunsetFv = closestForecast(sunsetDate);

    const cloudSunrise = sunriseFv?.cloud_fraction != null ? Math.round(sunriseFv.cloud_fraction) : null;
    const precipSunrise = sunriseFv?.precipitation ?? null;
    const cloudSunset = sunsetFv?.cloud_fraction != null ? Math.round(sunsetFv.cloud_fraction) : null;
    const precipSunset = sunsetFv?.precipitation ?? null;

    let sunSummary = sunriseFv || sunsetFv
      ? 'Værmodellen har data nær minst ett av soltidspunktene.'
      : 'Ingen værprognose kan matches med soloppgang eller solnedgang denne dagen.';
    if (cloudSunrise != null && cloudSunrise < 30) {
      sunSummary = `Flotte forhold ved soloppgang (${daySummary.sun.sunrise}) med kun ${cloudSunrise} % skydekke.`;
    } else if (cloudSunset != null && cloudSunset < 30) {
      sunSummary = `Gode sjanser for gyllen solnedgang (${daySummary.sun.sunset}) med lite skyer (${cloudSunset} %).`;
    }

    const goldenHourInterval = (morning: boolean): string | null => {
      const direction = morning ? +1 : -1;
      const firstAltitude = morning ? -4 : 6;
      const secondAltitude = morning ? 6 : -4;
      const first = this.findEventInDay(
        (start, window) =>
          Astronomy.SearchAltitude(Astronomy.Body.Sun, observer, direction, start, window, firstAltitude),
        startUtc,
        endUtc
      );
      const second = this.findEventInDay(
        (start, window) =>
          Astronomy.SearchAltitude(Astronomy.Body.Sun, observer, direction, start, window, secondAltitude),
        startUtc,
        endUtc
      );
      return first && second
        ? `${this.formatLocalTime(first, daySummary.timezone)}–${this.formatLocalTime(second, daySummary.timezone)}`
        : null;
    };

    return {
      tonightObservation: {
        hasForecast: Boolean(tonightForecast),
        moonIlluminationPct: moonIllum,
        moonrise: daySummary.moon.moonrise,
        moonAltitudeTonight: moonAlt,
        cloudCoverTonightPct: cloudCoverTonight,
        precipitationTonightMm: precipTonight,
        observationRating: obsRating,
        ratingBadge,
        description,
      },
      sunObservation: {
        hasForecast: Boolean(sunriseFv || sunsetFv),
        sunrise: daySummary.sun.sunrise,
        cloudCoverSunrisePct: cloudSunrise,
        precipSunriseMm: precipSunrise,
        sunset: daySummary.sun.sunset,
        cloudCoverSunsetPct: cloudSunset,
        precipSunsetMm: precipSunset,
        sunriseGoldenHour: goldenHourInterval(true),
        sunsetGoldenHour: goldenHourInterval(false),
        summaryText: sunSummary,
      },
    };
  }

  /**
   * Generates a dense trajectory arc of celestial positions (e.g. at 10-minute intervals)
   */
  static calculateCelestialArc(
    body: Astronomy.Body.Sun | Astronomy.Body.Moon,
    lat: number,
    lon: number,
    altitudeMoh: number,
    dateStr: string,
    timezone = 'Europe/Oslo',
    stepMinutes = 10
  ): CelestialArcPoint[] {
    const { startUtc, endUtc } = this.getLocalDayBounds(dateStr, timezone);
    const obs = new Astronomy.Observer(lat, lon, altitudeMoh);
    const points: CelestialArcPoint[] = [];

    const isSun = body === Astronomy.Body.Sun;
    const horizonCutoff = isSun ? -0.833 : -0.583;

    const dayDurationMinutes = Math.round((endUtc.getTime() - startUtc.getTime()) / 60000);
    for (let minutes = 0; minutes <= dayDurationMinutes; minutes += stepMinutes) {
      const pointUtc = new Date(startUtc.getTime() + minutes * 60 * 1000);
      const eq = Astronomy.Equator(body, pointUtc, obs, true, true);
      const hor = Astronomy.Horizon(pointUtc, obs, eq.ra, eq.dec, 'normal');

      const altitude = Number(hor.altitude.toFixed(2));
      const azimuth = Number(hor.azimuth.toFixed(2));
      const isAboveHorizon = altitude > horizonCutoff;

      const displayTime = this.formatLocalTime(pointUtc, timezone) || '';

      points.push({
        time: pointUtc.toISOString(),
        minutesFromMidnight: minutes,
        displayTime,
        altitude,
        azimuth,
        isAboveHorizon,
      });
    }

    return points;
  }

  /**
   * Generates all celestial sky arcs including sun, moon, and yearly solstice reference arcs
   */
  static calculateSkyArcs(
    lat: number,
    lon: number,
    altitudeMoh: number,
    dateStr: string,
    timezone = 'Europe/Oslo'
  ): SkyArcData {
    const sunArc = this.calculateCelestialArc(
      Astronomy.Body.Sun,
      lat,
      lon,
      altitudeMoh,
      dateStr,
      timezone,
      10
    );

    const moonArc = this.calculateCelestialArc(
      Astronomy.Body.Moon,
      lat,
      lon,
      altitudeMoh,
      dateStr,
      timezone,
      10
    );

    const year = Number(dateStr.substring(0, 4)) || new Date().getFullYear();
    const seasons = Astronomy.Seasons(year);
    const summerSolsticeDate = getLocalDateKey(seasons.jun_solstice.date, timezone);
    const winterSolsticeDate = getLocalDateKey(seasons.dec_solstice.date, timezone);

    const summerSolsticeSunArc = this.calculateCelestialArc(
      Astronomy.Body.Sun,
      lat,
      lon,
      altitudeMoh,
      summerSolsticeDate,
      timezone,
      15
    );

    const winterSolsticeSunArc = this.calculateCelestialArc(
      Astronomy.Body.Sun,
      lat,
      lon,
      altitudeMoh,
      winterSolsticeDate,
      timezone,
      15
    );

    return {
      date: dateStr,
      latitude: lat,
      longitude: lon,
      sunArc,
      moonArc,
      summerSolsticeSunArc,
      winterSolsticeSunArc,
    };
  }

  /**
   * 3D Spherical to 2D Screen projection for Augmented Reality camera view
   * Converts target (Azimuth, Altitude) to Screen (x, y) based on camera orientation
   */
  static projectCelestialToScreen(
    targetAzimuth: number,
    targetAltitude: number,
    cameraHeading: number,
    cameraPitch: number,
    cameraRoll: number,
    fovH: number,
    screenWidth: number,
    screenHeight: number
  ): { x: number; y: number; isVisible: boolean; inFront: boolean; angleFromCenterDeg: number } {
    const toRad = Math.PI / 180;
    const toDeg = 180 / Math.PI;

    const azRad = targetAzimuth * toRad;
    const altRad = targetAltitude * toRad;
    const headingRad = cameraHeading * toRad;
    const pitchRad = cameraPitch * toRad;
    const rollRad = cameraRoll * toRad;

    // 1. Convert celestial spherical coords to World coordinates (X=East, Y=North, Z=Zenith)
    const wx = Math.cos(altRad) * Math.sin(azRad);
    const wy = Math.cos(altRad) * Math.cos(azRad);
    const wz = Math.sin(altRad);

    // 2. Rotate around Up-axis (Z) by -cameraHeading
    const x1 = Math.sin(azRad - headingRad) * Math.cos(altRad);
    const y1 = Math.cos(azRad - headingRad) * Math.cos(altRad);
    const z1 = wz;

    // 3. Rotate around camera Pitch axis (tilt up/down)
    // Looking up (pitch > 0) elevates the view
    const camX = x1;
    const camY = -y1 * Math.sin(pitchRad) + z1 * Math.cos(pitchRad);
    const camZ = y1 * Math.cos(pitchRad) + z1 * Math.sin(pitchRad);

    // 4. Rotate around camera Roll axis (if device tilted sideways)
    let finalX = camX;
    let finalY = camY;
    if (cameraRoll !== 0) {
      finalX = camX * Math.cos(rollRad) - camY * Math.sin(rollRad);
      finalY = camX * Math.sin(rollRad) + camY * Math.cos(rollRad);
    }
    const finalZ = camZ;

    // Check if point is in front of camera
    const inFront = finalZ > 0.01;

    // Angular distance from camera optical axis (center of screen)
    const angleFromCenterRad = Math.atan2(Math.hypot(finalX, finalY), Math.max(0.001, finalZ));
    const angleFromCenterDeg = angleFromCenterRad * toDeg;

    // Focal length calculation based on horizontal FOV
    const fovHRad = (fovH || 65) * toRad;
    const focalLengthX = screenWidth / 2 / Math.tan(fovHRad / 2);
    // Maintain square pixels
    const focalLengthY = focalLengthX;

    // Screen coordinates (Center is screenWidth/2, screenHeight/2)
    const screenX = screenWidth / 2 + (finalX / Math.max(0.001, finalZ)) * focalLengthX;
    const screenY = screenHeight / 2 - (finalY / Math.max(0.001, finalZ)) * focalLengthY;

    // Visible within canvas margins
    const margin = 80;
    const isVisible =
      inFront &&
      screenX >= -margin &&
      screenX <= screenWidth + margin &&
      screenY >= -margin &&
      screenY <= screenHeight + margin;

    return {
      x: screenX,
      y: screenY,
      isVisible,
      inFront,
      angleFromCenterDeg,
    };
  }

  /**
   * Converts DeviceOrientationEvent (W3C or iOS) into Earth-relative Camera Heading, Pitch, and Roll
   */
  private static computeCameraRollFromEuler(
    alpha: number,
    beta: number,
    gamma: number,
    screenAngle = 0
  ): number {
    const toRad = Math.PI / 180;
    const toDeg = 180 / Math.PI;
    const a = alpha * toRad;
    const b = beta * toRad;
    const g = gamma * toRad;
    const theta = screenAngle * toRad;

    const cameraForward = {
      x: -Math.sin(a) * Math.sin(b) * Math.cos(g) - Math.cos(a) * Math.sin(g),
      y: Math.cos(a) * Math.sin(b) * Math.cos(g) - Math.sin(a) * Math.sin(g),
      z: -Math.cos(b) * Math.cos(g),
    };
    const horizontalMagnitude = Math.hypot(cameraForward.x, cameraForward.y);
    if (horizontalMagnitude < 1e-4) return 0;

    const deviceRight = {
      x: Math.cos(a) * Math.cos(g) - Math.sin(a) * Math.sin(b) * Math.sin(g),
      y: Math.sin(a) * Math.cos(g) + Math.cos(a) * Math.sin(b) * Math.sin(g),
      z: -Math.cos(b) * Math.sin(g),
    };
    const deviceTop = {
      x: -Math.sin(a) * Math.cos(b),
      y: Math.cos(a) * Math.cos(b),
      z: Math.sin(b),
    };
    const displayRight = {
      x: Math.cos(theta) * deviceRight.x - Math.sin(theta) * deviceTop.x,
      y: Math.cos(theta) * deviceRight.y - Math.sin(theta) * deviceTop.y,
      z: Math.cos(theta) * deviceRight.z - Math.sin(theta) * deviceTop.z,
    };

    // A level camera facing the same azimuth has right=(forward × up) and
    // up=(right × forward). Compare the physical viewport-right vector with
    // those axes instead of treating intrinsic Euler gamma as camera roll.
    const levelRight = {
      x: cameraForward.y / horizontalMagnitude,
      y: -cameraForward.x / horizontalMagnitude,
      z: 0,
    };
    const levelUp = {
      x: levelRight.y * cameraForward.z,
      y: -levelRight.x * cameraForward.z,
      z: levelRight.x * cameraForward.y - levelRight.y * cameraForward.x,
    };
    const dotRight = displayRight.x * levelRight.x + displayRight.y * levelRight.y;
    const dotUp = displayRight.x * levelUp.x + displayRight.y * levelUp.y + displayRight.z * levelUp.z;
    const roll = Math.atan2(-dotUp, dotRight) * toDeg;
    return ((roll + 540) % 360) - 180;
  }

  static computeIosCameraOrientation(
    event: {
      alpha?: number | null;
      beta?: number | null;
      gamma?: number | null;
      webkitCompassHeading?: number;
    },
    northOffsetDegrees: number | null = null,
    screenAngle = 0
  ): {
    orientation: { heading: number; pitch: number; roll: number };
    relativeCameraHeading: number;
    measuredNorthOffset: number | null;
    northAnchorObservable: boolean;
  } {
    const alpha = typeof event.alpha === 'number' && Number.isFinite(event.alpha) ? event.alpha : 0;
    const beta = typeof event.beta === 'number' && Number.isFinite(event.beta) ? event.beta : 90;
    const gamma = typeof event.gamma === 'number' && Number.isFinite(event.gamma) ? event.gamma : 0;
    const toRad = Math.PI / 180;
    const toDeg = 180 / Math.PI;
    const a = alpha * toRad;
    const b = beta * toRad;
    const g = gamma * toRad;

    // W3C Z-X'-Y'' attitude applied to the rear-camera vector (0, 0, -1).
    // This gives the optical axis, rather than the physical top of the phone.
    const cameraX = -Math.sin(a) * Math.sin(b) * Math.cos(g) - Math.cos(a) * Math.sin(g);
    const cameraY = Math.cos(a) * Math.sin(b) * Math.cos(g) - Math.sin(a) * Math.sin(g);
    const cameraZ = -Math.cos(b) * Math.cos(g);
    const relativeCameraHeading = (Math.atan2(cameraX, cameraY) * toDeg + 360) % 360;

    // webkitCompassHeading is tied to the portrait top-axis. That axis has no
    // useful horizontal projection when an upright phone is aimed at the
    // horizon, so only measure a north offset while it is sufficiently tilted.
    const topX = -Math.cos(b) * Math.sin(a);
    const topY = Math.cos(a) * Math.cos(b);
    const topHorizontalMagnitude = Math.hypot(topX, topY);
    const northAnchorObservable = topHorizontalMagnitude >= 0.3;
    const compassHeading = event.webkitCompassHeading;
    let measuredNorthOffset: number | null = null;
    if (
      northAnchorObservable &&
      typeof compassHeading === 'number' &&
      Number.isFinite(compassHeading) &&
      compassHeading >= 0 &&
      compassHeading < 360
    ) {
      const topHeading = (Math.atan2(topX, topY) * toDeg + 360) % 360;
      measuredNorthOffset = this.computeShortestAngleDelta(compassHeading, topHeading);
    }

    const resolvedNorthOffset = typeof northOffsetDegrees === 'number' && Number.isFinite(northOffsetDegrees)
      ? northOffsetDegrees
      : measuredNorthOffset;
    const heading = resolvedNorthOffset === null
      ? relativeCameraHeading
      : (relativeCameraHeading + resolvedNorthOffset + 360) % 360;
    const pitch = Math.asin(Math.max(-1, Math.min(1, cameraZ))) * toDeg;

    return {
      orientation: {
        heading: Number(heading.toFixed(1)) || 0,
        pitch: Number(pitch.toFixed(1)) || 0,
        roll: Number(this.computeCameraRollFromEuler(alpha, beta, gamma, screenAngle).toFixed(1)) || 0,
      },
      relativeCameraHeading,
      measuredNorthOffset,
      northAnchorObservable,
    };
  }

  static computeDeviceOrientation(
    event: {
      alpha?: number | null;
      beta?: number | null;
      gamma?: number | null;
      webkitCompassHeading?: number;
      webkitCompassAccuracy?: number;
      absolute?: boolean;
    },
    screenAngle = 0
  ): { heading: number; pitch: number; roll: number } {
    let heading = 180;
    let pitch = 0;
    let roll = 0;

    const toRad = Math.PI / 180;
    const toDeg = 180 / Math.PI;

    // 1. On iOS, fuse the Euler camera vector with the observable compass
    // top-axis. Stateful callers should retain the returned north offset via
    // computeIosCameraOrientation while the phone is nearly upright.
    if (typeof event.webkitCompassHeading === 'number' && event.webkitCompassHeading >= 0) {
      const ios = this.computeIosCameraOrientation(event, null, screenAngle);
      heading = ios.orientation.heading;
      pitch = ios.orientation.pitch;
      roll = ios.orientation.roll;
    } else {
      // 2. Standard W3C Euler angles (Android Chrome / browsers)
      const alpha = event.alpha ?? 0;
      const beta = event.beta ?? 90;
      const gamma = event.gamma ?? 0;

      const a = alpha * toRad;
      const b = beta * toRad;
      const g = gamma * toRad;

      // 3D vector pointing out of the back camera: v_cam = (0, 0, -1) in device frame
      // Transformed to Earth horizontal coordinates (X=East, Y=North, Z=Zenith)
      const vx = -Math.sin(a) * Math.sin(b) * Math.cos(g) - Math.cos(a) * Math.sin(g);
      const vy = Math.cos(a) * Math.sin(b) * Math.cos(g) - Math.sin(a) * Math.sin(g);
      const vz = -Math.cos(b) * Math.cos(g);

      // Camera azimuth (Heading): 0=North, 90=East, 180=South, 270=West
      heading = (Math.atan2(vx, vy) * toDeg + 360) % 360;

      // Camera elevation (Pitch): -90 (down) to +90 (up)
      pitch = Math.asin(Math.max(-1, Math.min(1, vz))) * toDeg;
      roll = this.computeCameraRollFromEuler(alpha, beta, gamma, screenAngle);
    }

    // screenAngle affects only which physical device axis is horizontal in the
    // viewport. It is used for roll above, never added to camera azimuth.

    const finalHeading = Number(heading.toFixed(1)) || 0;
    const finalPitch = Number(pitch.toFixed(1)) || 0;
    const finalRoll = Number(roll.toFixed(1)) || 0;

    return {
      heading: (finalHeading + 360) % 360,
      pitch: finalPitch + 0,
      roll: finalRoll + 0,
    };
  }

  /**
   * Computes the calibration delta when aiming the crosshair directly at the Sun or Moon
   */
  static computeCelestialCalibrationOffset(
    targetAzimuth: number,
    targetAltitude: number,
    rawHeading: number,
    rawPitch: number
  ): { headingOffset: number; pitchOffset: number } {
    let headingDiff = targetAzimuth - rawHeading;
    // Normalize to -180..+180
    headingDiff = ((headingDiff % 360) + 540) % 360 - 180;

    let pitchDiff = targetAltitude - rawPitch;
    pitchDiff = Math.max(-60, Math.min(60, pitchDiff));

    const finalHeadingOffset = Number(headingDiff.toFixed(1)) || 0;
    const finalPitchOffset = Number(pitchDiff.toFixed(1)) || 0;

    return {
      headingOffset: finalHeadingOffset + 0,
      pitchOffset: finalPitchOffset + 0,
    };
  }

  /**
   * Computes the shortest circular angular difference (-180 to +180) from `current` to `target`
   */
  static computeShortestAngleDelta(target: number, current: number): number {
    let diff = (target - current) % 360;
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;
    return diff;
  }

  /**
   * Identifies the coordinate source behind a browser orientation event.
   * The event name is kept separate from event.absolute because some Android
   * browsers expose both streams at once.
   */
  static classifyOrientationSensorSource(
    event: {
      alpha?: number | null;
      beta?: number | null;
      gamma?: number | null;
      webkitCompassHeading?: number;
      absolute?: boolean;
    },
    eventType = 'deviceorientation'
  ): AROrientationSensorSource {
    if (
      typeof event.webkitCompassHeading === 'number' &&
      Number.isFinite(event.webkitCompassHeading) &&
      event.webkitCompassHeading >= 0 &&
      event.webkitCompassHeading < 360 &&
      typeof event.alpha === 'number' &&
      Number.isFinite(event.alpha) &&
      typeof event.beta === 'number' &&
      Number.isFinite(event.beta) &&
      typeof event.gamma === 'number' &&
      Number.isFinite(event.gamma)
    ) {
      return 'ios';
    }

    const hasEulerAngles = [event.alpha, event.beta, event.gamma].every(
      (value) => typeof value === 'number' && Number.isFinite(value)
    );
    if (!hasEulerAngles) return 'none';
    if (
      (event.alpha as number) < 0 ||
      (event.alpha as number) >= 360 ||
      (event.beta as number) < -180 ||
      (event.beta as number) > 180 ||
      (event.gamma as number) < -90 ||
      (event.gamma as number) > 90
    ) {
      return 'none';
    }

    if (eventType === 'deviceorientationabsolute') return 'absolute-event';
    if (event.absolute === true) return 'absolute';
    return 'relative';
  }

  static getOrientationSensorSourcePriority(source: AROrientationSensorSource): number {
    const priority: Record<AROrientationSensorSource, number> = {
      none: 0,
      relative: 1,
      absolute: 2,
      'absolute-event': 3,
      ios: 4,
    };
    return priority[source];
  }

  /**
   * Keeps one validated sensor coordinate system active for the whole AR
   * session. A different north source can only enter a controlled warm-up
   * after the active stream has been silent for several seconds; a relative
   * frame can never replace north-referenced data.
   */
  static shouldAcceptOrientationSensorSource(
    active: AROrientationSensorSource,
    incoming: AROrientationSensorSource,
    millisecondsSinceActiveSample: number,
    staleAfterMs = 5000
  ): boolean {
    if (incoming === 'none') return false;
    if (active === 'none' || active === incoming) return true;

    const isNorthReferenced = (source: AROrientationSensorSource) =>
      source === 'ios' || source === 'absolute-event' || source === 'absolute';

    // A relative stream may be upgraded once an absolute stream arrives.
    if (!isNorthReferenced(active) && isNorthReferenced(incoming)) return true;
    if (isNorthReferenced(active) && isNorthReferenced(incoming)) {
      return millisecondsSinceActiveSample >= staleAfterMs;
    }
    return false;
  }

  /**
   * Robustly combines a short sample window. Angles are unwrapped around the
   * previous value before a trimmed mean is calculated, so 359/0 is handled
   * correctly and a single magnetic spike cannot move the AR overlay.
   */
  static computeRobustOrientationSample(
    samples: Array<{ heading: number; pitch: number; roll: number; timestampMs?: number }>,
    previous?: { heading: number; pitch: number; roll: number }
  ): { heading: number; pitch: number; roll: number } {
    const allValid = samples.slice(-5).filter((sample) =>
      [sample.heading, sample.pitch, sample.roll].every(Number.isFinite)
    );

    if (allValid.length === 0) {
      return previous ?? { heading: 180, pitch: 0, roll: 0 };
    }

    // Build a fresh count-based cluster. This retains 1 Hz samples for spike
    // rejection, but never lets minute-old readings outvote a real new pose.
    let valid = allValid;
    const allTimestamped = allValid.every(
      (sample) => typeof sample.timestampMs === 'number' && Number.isFinite(sample.timestampMs)
    );
    if (allTimestamped) {
      const freshCluster = [allValid[allValid.length - 1]];
      for (let index = allValid.length - 2; index >= 0; index -= 1) {
        const newerTimestamp = freshCluster[0].timestampMs as number;
        const timestamp = allValid[index].timestampMs as number;
        const gap = newerTimestamp - timestamp;
        if (gap < 0 || gap > 1500) break;
        freshCluster.unshift(allValid[index]);
      }

      const startsAfterStaleGap = freshCluster.length < allValid.length;
      if (startsAfterStaleGap && freshCluster.length === 1 && previous) {
        return previous;
      }
      if (startsAfterStaleGap && freshCluster.length === 2 && previous) {
        const [first, second] = freshCluster;
        const pairIsConsistent =
          Math.abs(this.computeShortestAngleDelta(first.heading, second.heading)) < 5 &&
          Math.abs(first.pitch - second.pitch) < 5 &&
          Math.abs(this.computeShortestAngleDelta(first.roll, second.roll)) < 8;
        if (!pairIsConsistent) return previous;
      }
      valid = freshCluster;
    }

    const trimmedMean = (values: number[]): number => {
      const sorted = [...values].sort((a, b) => a - b);
      const trimmed = sorted.length >= 3 ? sorted.slice(1, -1) : sorted;
      return trimmed.reduce((sum, value) => sum + value, 0) / trimmed.length;
    };

    const headingReference = previous?.heading ?? valid[valid.length - 1].heading;
    const unwrappedHeadings = valid.map(
      (sample) => headingReference + this.computeShortestAngleDelta(sample.heading, headingReference)
    );
    const heading = ((trimmedMean(unwrappedHeadings) % 360) + 360) % 360;

    const pitch = Math.max(-89.9, Math.min(89.9, trimmedMean(valid.map((sample) => sample.pitch))));

    const rollReference = previous?.roll ?? valid[valid.length - 1].roll;
    const unwrappedRolls = valid.map(
      (sample) => rollReference + this.computeShortestAngleDelta(sample.roll, rollReference)
    );
    const roll = ((trimmedMean(unwrappedRolls) + 540) % 360) - 180;

    return { heading, pitch, roll };
  }

  static areOrientationSamplesConsistent(
    samples: Array<{ heading: number; pitch: number; roll: number }>,
    headingTolerance = 3,
    pitchTolerance = 3,
    rollTolerance = 5
  ): boolean {
    if (samples.length < 2) return false;
    const robust = this.computeRobustOrientationSample(samples);
    return samples.every((sample) =>
      Math.abs(this.computeShortestAngleDelta(sample.heading, robust.heading)) < headingTolerance &&
      Math.abs(sample.pitch - robust.pitch) < pitchTolerance &&
      Math.abs(this.computeShortestAngleDelta(sample.roll, robust.roll)) < rollTolerance
    );
  }

  /**
   * Continuous soft deadband function for magnetic and accelerometer interference suppression.
   * Completely deadbands sub-threshold jitter while avoiding hard discontinuous steps when movement starts.
   */
  static applySoftDeadband(delta: number, deadband: number): number {
    const abs = Math.abs(delta);
    if (deadband <= 0) return delta;
    if (abs <= deadband) {
      // A true stationary lock: repeated RAF frames must not slowly pull the
      // overlay toward the same noisy magnetometer sample.
      return 0;
    }
    // Continuous curve above the stationary region. Subtracting the whole
    // deadband avoids a visible step exactly when tracking unlocks.
    const sign = Math.sign(delta);
    return sign * (abs - deadband);
  }

  /**
   * Allows one final, deliberate snap after a real movement has settled. The
   * hard deadband otherwise leaves the filtered pose parked at its outer edge.
   * Requiring a tight multi-sample cluster prevents stationary sensor noise
   * from repeatedly moving the anchor.
   */
  static shouldSnapSettledOrientation(
    samples: Array<{ heading: number; pitch: number; roll: number; timestampMs?: number }>,
    wasMoving: boolean,
    isStable: boolean,
    stableForMs: number,
    deadbandDegrees: number
  ): boolean {
    if (!wasMoving || !isStable || stableForMs < 250 || samples.length < 3) return false;
    type OrientationSample = {
      heading: number;
      pitch: number;
      roll: number;
      timestampMs?: number;
    };
    const recentSamples: OrientationSample[] = samples.slice(-24);
    let stabilitySamples: OrientationSample[] = recentSamples;
    const timestamped = recentSamples.every(
      (sample) => typeof sample.timestampMs === 'number' && Number.isFinite(sample.timestampMs)
    );
    if (timestamped) {
      const latestTimestamp = recentSamples[recentSamples.length - 1].timestampMs;
      if (typeof latestTimestamp !== 'number') return false;
      const withinOneSecond: OrientationSample[] = recentSamples.filter(
        (sample) => (sample.timestampMs as number) >= latestTimestamp - 1000
      );
      stabilitySamples = withinOneSecond.length >= 3
        ? withinOneSecond
        : stabilitySamples.slice(-3);
      const first = stabilitySamples[0];
      const last = stabilitySamples[stabilitySamples.length - 1];
      const firstTimestamp = first.timestampMs;
      const lastTimestamp = last.timestampMs;
      if (typeof firstTimestamp !== 'number' || typeof lastTimestamp !== 'number') return false;
      const durationMs = lastTimestamp - firstTimestamp;
      if (durationMs < 150) return false;
      const endpointSpeed = Math.hypot(
        this.computeShortestAngleDelta(last.heading, first.heading),
        last.pitch - first.pitch,
        this.computeShortestAngleDelta(last.roll, first.roll)
      ) / durationMs * 1000;
      if (endpointSpeed > 0.75) return false;
    }
    const scale = Math.max(0.5, deadbandDegrees);
    return this.areOrientationSamplesConsistent(
      stabilitySamples,
      Math.max(0.7, scale * 0.6),
      Math.max(0.6, scale * 0.5),
      Math.max(0.8, scale * 0.65)
    );
  }

  static hasDeliberateOrientationMovement(
    anchor: { heading: number; pitch: number; roll: number },
    current: { heading: number; pitch: number; roll: number },
    deadbandDegrees: number
  ): boolean {
    const displacement = Math.hypot(
      this.computeShortestAngleDelta(current.heading, anchor.heading),
      current.pitch - anchor.pitch,
      this.computeShortestAngleDelta(current.roll, anchor.roll)
    );
    return displacement >= Math.max(3, deadbandDegrees * 2);
  }

  /**
   * Filters and stabilizes orientation across frames to eliminate sensor interference, magnetic oscillation, and hand tremors.
   */
  static filterOrientationStep(
    current: { heading: number; pitch: number; roll: number },
    target: { heading: number; pitch: number; roll: number },
    filterLevel: 'ultra' | 'high' | 'medium' | 'off' = 'high',
    customDeadband?: number,
    deltaTimeMs = 1000 / 60
  ): {
    heading: number;
    pitch: number;
    roll: number;
    isStable: boolean;
    angularSpeedDeg: number;
  } {
    if (filterLevel === 'off') {
      const dH = this.computeShortestAngleDelta(target.heading, current.heading);
      const dP = target.pitch - current.pitch;
      const dR = target.roll - current.roll;
      const angularSpeed = Math.hypot(dH, dP, dR);
      return {
        heading: (target.heading % 360 + 360) % 360,
        pitch: target.pitch,
        roll: target.roll,
        isStable: angularSpeed < 0.5,
        angularSpeedDeg: angularSpeed,
      };
    }

    const dHeading = this.computeShortestAngleDelta(target.heading, current.heading);
    const dPitch = target.pitch - current.pitch;
    const dRoll = target.roll - current.roll;

    const absDH = Math.abs(dHeading);
    const absDP = Math.abs(dPitch);
    const absDR = Math.abs(dRoll);
    const rawTotalDelta = Math.hypot(absDH, absDP, absDR);

    // Configuration according to filter level
    let defaultDeadband = 1.5;
    let baseAlpha = 0.04;
    let panAlphaMax = 0.40;

    if (filterLevel === 'ultra') {
      defaultDeadband = 2.2;
      baseAlpha = 0.02;
      panAlphaMax = 0.28;
    } else if (filterLevel === 'medium') {
      defaultDeadband = 0.7;
      baseAlpha = 0.09;
      panAlphaMax = 0.55;
    }

    const deadbandH = customDeadband !== undefined ? customDeadband : defaultDeadband;
    const deadbandP = (customDeadband !== undefined ? customDeadband : defaultDeadband) * 0.8;
    const deadbandR = (customDeadband !== undefined ? customDeadband : defaultDeadband) * 0.9;

    const stepH = this.applySoftDeadband(dHeading, deadbandH);
    const stepP = this.applySoftDeadband(dPitch, deadbandP);
    const stepR = this.applySoftDeadband(dRoll, deadbandR);

    // Dynamic adaptive damping gain based on movement velocity
    // When aiming/stationary: heavy filtering (baseAlpha)
    // When panning fast (> 4 deg): responsive tracking (panAlphaMax)
    let alphaH = baseAlpha;
    if (absDH > 6.0) alphaH = panAlphaMax;
    else if (absDH > 2.0) alphaH = baseAlpha + (panAlphaMax - baseAlpha) * 0.55;
    else if (absDH > deadbandH * 1.5) alphaH = baseAlpha + (panAlphaMax - baseAlpha) * 0.25;

    let alphaP = baseAlpha;
    if (absDP > 6.0) alphaP = panAlphaMax;
    else if (absDP > 2.0) alphaP = baseAlpha + (panAlphaMax - baseAlpha) * 0.55;
    else if (absDP > deadbandP * 1.5) alphaP = baseAlpha + (panAlphaMax - baseAlpha) * 0.25;

    let alphaR = baseAlpha;
    if (absDR > 6.0) alphaR = panAlphaMax;
    else if (absDR > 2.0) alphaR = baseAlpha + (panAlphaMax - baseAlpha) * 0.55;

    // Convert the old 60 Hz gain into a time-based gain. This gives comparable
    // damping on 30, 60 and 120 Hz displays and after short dropped frames.
    const frameScale = Math.max(0.25, Math.min(3, deltaTimeMs / (1000 / 60)));
    const timeAdjustedAlpha = (alpha: number) => 1 - Math.pow(1 - alpha, frameScale);

    const newHeading = ((current.heading + stepH * timeAdjustedAlpha(alphaH)) % 360 + 360) % 360;
    const newPitch = Math.max(-89.9, Math.min(89.9, current.pitch + stepP * timeAdjustedAlpha(alphaP)));
    const newRoll = Math.max(-180, Math.min(180, current.roll + stepR * timeAdjustedAlpha(alphaR)));

    const isStable =
      absDH < deadbandH * 1.2 &&
      absDP < deadbandP * 1.2 &&
      absDR < deadbandR * 1.2;

    return {
      heading: newHeading,
      pitch: newPitch,
      roll: newRoll,
      isStable,
      angularSpeedDeg: rawTotalDelta,
    };
  }

  /**
   * Applies display hysteresis to integer angle readouts so that the numbers don't bounce/flicker
   * back and forth (e.g. 184° <-> 185°) when hovering near a rounding boundary.
   */
  static updateDegreeWithHysteresis(
    currentFloatAngle: number,
    currentDisplayDegree: number,
    threshold = 0.70,
    circular = true
  ): number {
    const diff = circular
      ? this.computeShortestAngleDelta(currentFloatAngle, currentDisplayDegree)
      : currentFloatAngle - currentDisplayDegree;
    if (Math.abs(diff) >= threshold) {
      const rounded = Math.round(currentFloatAngle);
      return circular ? ((rounded % 360) + 360) % 360 : rounded;
    }
    return currentDisplayDegree;
  }
}
