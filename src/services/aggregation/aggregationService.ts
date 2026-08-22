import { getDb } from '@/lib/db';
import { DailyWeatherSummary, MonthlyWeatherSummary, RainEvent, Observation } from '@/types/weather';
import { calculateCircularMeanDegrees, getWindDirectionCardinal8 } from '@/lib/weatherUtils';
import { getLocalDateKey, getLocalDayBounds } from '@/services/time/timeZone';
import {
  hourlyValuesForElement,
  hourlyObservationsForElement,
  measuredForElement,
  measuredObservations,
} from '@/services/observations/observationQuality';

export class AggregationService {
  /**
   * Computes and persists daily weather summaries from raw observations
   */
  static computeDailySummaries(locationId: string): DailyWeatherSummary[] {
    const db = getDb();
    const observations = measuredObservations(db.getObservations(locationId));
    if (observations.length === 0) return [];

    const timezone = db.getLocation(locationId)?.timezone || 'Europe/Oslo';
    const stationMappings = new Map(
      db.getStationMappings(locationId).map((mapping) => [mapping.element, mapping.station_id])
    );

    // Group observations by the configured location's civil day, including DST.
    const dateGroups = new Map<string, Observation[]>();
    for (const obs of observations) {
      const dateStr = getLocalDateKey(obs.observed_at, timezone);
      if (!dateStr) continue;
      if (!dateGroups.has(dateStr)) {
        dateGroups.set(dateStr, []);
      }
      dateGroups.get(dateStr)!.push(obs);
    }

    const summaries: DailyWeatherSummary[] = [];
    for (const [date, obsList] of dateGroups.entries()) {
      const values = <K extends 'air_temperature' | 'wind_speed' | 'wind_gust' | 'air_pressure' | 'relative_humidity'>(
        field: K,
        mapping: 'temperature' | 'precipitation' | 'wind' | 'pressure' | 'humidity' | 'snow'
      ) => hourlyValuesForElement(obsList, field, stationMappings.get(mapping));
      const { startUtc, endUtc } = getLocalDayBounds(date, timezone);
      const expectedHours = (endUtc.getTime() - startUtc.getTime()) / (60 * 60 * 1000);
      const minimumHours = Math.ceil(expectedHours * 0.7);
      const temps = values('air_temperature', 'temperature');
      const precips = hourlyValuesForElement(
        obsList,
        'precipitation_amount',
        stationMappings.get('precipitation')
      ).map((precipitation) => Math.max(0, precipitation));
      const winds = values('wind_speed', 'wind');
      const gusts = values('wind_gust', 'wind');
      const pressures = values('air_pressure', 'pressure');
      const humidities = values('relative_humidity', 'humidity');
      const temperatureCoverageIsSufficient = temps.length >= minimumHours;
      const precipitationCoverageIsSufficient = precips.length >= minimumHours;
      const windCoverageHours = Math.max(winds.length, gusts.length);
      const windCoverageIsSufficient = windCoverageHours >= minimumHours;
      const pressureCoverageIsSufficient = pressures.length >= minimumHours;
      const humidityCoverageIsSufficient = humidities.length >= minimumHours;
      const tempMin = temperatureCoverageIsSufficient ? Math.min(...temps) : null;
      const tempMax = temperatureCoverageIsSufficient ? Math.max(...temps) : null;
      const tempAvg = temperatureCoverageIsSufficient ? Math.round((temps.reduce((a, b) => a + b, 0) / temps.length) * 10) / 10 : null;

      // Strict NULL check: If all precipitation entries are null (missing sensors), sum is null
      const precipTotal =
        precipitationCoverageIsSufficient ? Math.round(precips.reduce((a, b) => a + b, 0) * 10) / 10 : null;
      const precipMaxHour = precipitationCoverageIsSufficient ? Math.max(...precips) : null;

      const windAvg = windCoverageIsSufficient && winds.length > 0 ? Math.round((winds.reduce((a, b) => a + b, 0) / winds.length) * 10) / 10 : null;
      const windMax = windCoverageIsSufficient && winds.length > 0 ? Math.max(...winds) : null;
      const windGustMax = windCoverageIsSufficient && gusts.length > 0 ? Math.max(...gusts) : null;

      // Circular mean for dominant wind direction (weighted by wind speed)
      const validDirObs = measuredForElement(
        obsList,
        'wind_direction',
        stationMappings.get('wind')
      );
      const windDominantDir = windCoverageIsSufficient
        ? calculateCircularMeanDegrees(
            validDirObs.map((o) => o.wind_direction),
            validDirObs.map((o) => o.wind_speed ?? 1)
          )
        : null;

      const pressMin = pressureCoverageIsSufficient ? Math.min(...pressures) : null;
      const pressMax = pressureCoverageIsSufficient ? Math.max(...pressures) : null;
      const pressAvg = pressureCoverageIsSufficient ? Math.round((pressures.reduce((a, b) => a + b, 0) / pressures.length) * 10) / 10 : null;

      const humMin = humidityCoverageIsSufficient ? Math.min(...humidities) : null;
      const humMax = humidityCoverageIsSufficient ? Math.max(...humidities) : null;
      const humAvg = humidityCoverageIsSufficient ? Math.round((humidities.reduce((a, b) => a + b, 0) / humidities.length) * 10) / 10 : null;

      const rainHours = precipitationCoverageIsSufficient ? precips.filter((p) => p > 0.0).length : null;
      const frostHours = temperatureCoverageIsSufficient ? temps.filter((t) => t < 0.0).length : null;

      let dominantSymbol: string | null = null;
      if (precipTotal !== null && precipTotal > 10) dominantSymbol = 'heavyrain';
      else if (precipTotal !== null && precipTotal > 1.0) dominantSymbol = 'rain';

      const summary: DailyWeatherSummary = {
        id: `daily_${locationId}_${date}`,
        location_id: locationId,
        date,
        temperature_min: tempMin,
        temperature_max: tempMax,
        temperature_avg: tempAvg,
        precipitation_total: precipTotal,
        precipitation_max_hour: precipMaxHour,
        wind_avg: windAvg,
        wind_max: windMax,
        wind_gust_max: windGustMax,
        wind_dominant_direction: windDominantDir,
        pressure_min: pressMin,
        pressure_max: pressMax,
        pressure_avg: pressAvg,
        humidity_min: humMin,
        humidity_max: humMax,
        humidity_avg: humAvg,
        rain_hours: rainHours,
        frost_hours: frostHours,
        dominant_symbol: dominantSymbol,
        precipitation_coverage_hours: precips.length,
        temperature_coverage_hours: temps.length,
        wind_coverage_hours: windCoverageHours,
        is_partial:
          !temperatureCoverageIsSufficient ||
          !precipitationCoverageIsSufficient ||
          !windCoverageIsSufficient,
      };

      summaries.push(summary);
    }

    summaries.sort((a, b) => a.date.localeCompare(b.date));
    db.replaceDailySummariesForLocation(locationId, summaries);

    // Also trigger monthly recalculation
    this.computeMonthlySummaries(locationId);

    return summaries;
  }

  /**
   * Computes monthly aggregates from daily summaries
   */
  static computeMonthlySummaries(locationId: string): MonthlyWeatherSummary[] {
    const db = getDb();
    const dailyList = db.getDailySummaries(locationId);
    if (dailyList.length === 0) return [];

    const monthGroups = new Map<string, DailyWeatherSummary[]>();
    for (const d of dailyList) {
      const ym = d.date.substring(0, 7); // YYYY-MM
      if (!monthGroups.has(ym)) {
        monthGroups.set(ym, []);
      }
      monthGroups.get(ym)!.push(d);
    }

    const summaries: MonthlyWeatherSummary[] = [];

    for (const [ym, days] of monthGroups.entries()) {
      const [yearStr, monthStr] = ym.split('-');
      const year = parseInt(yearStr, 10);
      const month = parseInt(monthStr, 10);

      const tempsAvg = days.map((d) => d.temperature_avg).filter((t): t is number => t !== null);
      const tempsMin = days.map((d) => d.temperature_min).filter((t): t is number => t !== null);
      const tempsMax = days.map((d) => d.temperature_max).filter((t): t is number => t !== null);
      const precips = days.map((d) => d.precipitation_total).filter((p): p is number => p !== null);
      const winds = days.map((d) => d.wind_avg).filter((w): w is number => w !== null);
      const windMaxes = days.map((d) => d.wind_max).filter((w): w is number => w !== null);
      const gusts = days.map((d) => d.wind_gust_max).filter((g): g is number => g !== null);

      const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
      const [currentYearString, currentMonthString, currentDayString] = getLocalDateKey(
        new Date(),
        db.getLocation(locationId)?.timezone || 'Europe/Oslo'
      ).split('-');
      const currentYear = Number(currentYearString);
      const currentMonth = Number(currentMonthString);
      const expectedCoverageDays =
        year === currentYear && month === currentMonth ? Number(currentDayString) : daysInMonth;
      const minimumCoverageDays = Math.ceil(expectedCoverageDays * 0.7);
      const precipitationCoverageIsSufficient = precips.length >= minimumCoverageDays;
      const temperatureCoverageIsSufficient = tempsAvg.length >= minimumCoverageDays;
      const windCoverageIsSufficient = winds.length >= minimumCoverageDays;

      const tempAvg = temperatureCoverageIsSufficient ? Math.round((tempsAvg.reduce((a, b) => a + b, 0) / tempsAvg.length) * 10) / 10 : null;
      const tempMin = temperatureCoverageIsSufficient && tempsMin.length > 0 ? Math.min(...tempsMin) : null;
      const tempMax = temperatureCoverageIsSufficient && tempsMax.length > 0 ? Math.max(...tempsMax) : null;
      const precipTotal = precipitationCoverageIsSufficient ? Math.round(precips.reduce((a, b) => a + b, 0) * 10) / 10 : null;

      const windAvg = windCoverageIsSufficient ? Math.round((winds.reduce((a, b) => a + b, 0) / winds.length) * 10) / 10 : null;
      const windMax = windCoverageIsSufficient && windMaxes.length > 0 ? Math.max(...windMaxes) : null;
      const maxWindGust = windCoverageIsSufficient && gusts.length > 0 ? Math.max(...gusts) : null;

      // Circular mean of daily dominant wind directions (weighted by wind_avg)
      const validDaysDir = days.filter((d) => d.wind_dominant_direction !== null && !isNaN(d.wind_dominant_direction));
      const monthDominantDir = windCoverageIsSufficient
        ? calculateCircularMeanDegrees(
            validDaysDir.map((d) => d.wind_dominant_direction),
            validDaysDir.map((d) => d.wind_avg ?? 1)
          )
        : null;
      const monthDominantCardinal = getWindDirectionCardinal8(monthDominantDir);

      const rainyDays = days.filter((d) => (d.precipitation_total ?? 0) >= 0.1).length;
      const maxDailyPrecip = precips.length > 0 ? Math.max(...precips) : null;

      let warmestDay: string | null = null;
      let coldestDay: string | null = null;
      let wettestDay: string | null = null;

      if (tempMax !== null) {
        const d = days.find((x) => x.temperature_max === tempMax);
        if (d) warmestDay = `${d.date} (${tempMax} °C)`;
      }
      if (tempMin !== null) {
        const d = days.find((x) => x.temperature_min === tempMin);
        if (d) coldestDay = `${d.date} (${tempMin} °C)`;
      }
      if (precipitationCoverageIsSufficient && maxDailyPrecip !== null && maxDailyPrecip > 0) {
        const d = days.find((x) => x.precipitation_total === maxDailyPrecip);
        if (d) wettestDay = `${d.date} (${maxDailyPrecip} mm)`;
      }

      const summary: MonthlyWeatherSummary = {
        id: `monthly_${locationId}_${year}_${month}`,
        location_id: locationId,
        year,
        month,
        temperature_avg: tempAvg,
        temperature_min: tempMin,
        temperature_max: tempMax,
        precipitation_total: precipTotal,
        rainy_days: precipitationCoverageIsSufficient ? rainyDays : null,
        max_daily_precipitation: precipitationCoverageIsSufficient ? maxDailyPrecip : null,
        precipitation_coverage_days: precips.length,
        expected_coverage_days: expectedCoverageDays,
        is_partial:
          precips.length < expectedCoverageDays ||
          tempsAvg.length < expectedCoverageDays ||
          winds.length < expectedCoverageDays,
        wind_avg: windAvg,
        wind_max: windMax,
        max_wind_gust: maxWindGust,
        wind_dominant_direction: monthDominantDir,
        wind_dominant_cardinal: monthDominantCardinal,
        warmest_day: warmestDay,
        coldest_day: coldestDay,
        wettest_day: wettestDay,
      };

      summaries.push(summary);
    }

    summaries.sort((a, b) => (a.year !== b.year ? a.year - b.year : a.month - b.month));
    db.replaceMonthlySummariesForLocation(locationId, summaries);

    return summaries;
  }

  /**
   * Detects and calculates contiguous rain events (useful for civil engineering and construction analysis)
   */
  static getRainEvents(locationId: string, limit: number = 6): RainEvent[] {
    const db = getDb();
    const precipStationId = db
      .getStationMappings(locationId)
      .find((mapping) => mapping.element === 'precipitation')?.station_id;
    const obs = hourlyObservationsForElement(
      measuredObservations(db.getObservations(locationId)),
      'precipitation_amount',
      precipStationId
    );
    const events: RainEvent[] = [];

    let currentEvent: {
      start: string;
      end: string;
      total: number;
      maxRate: number;
      hours: number;
      lastTimestampMs: number;
    } | null = null;

    const finishCurrentEvent = () => {
      if (!currentEvent) return;
      if (currentEvent.hours >= 2 || currentEvent.total >= 2.0) {
        events.push({
          start_at: currentEvent.start,
          end_at: currentEvent.end,
          duration_hours: currentEvent.hours,
          total_mm: Math.round(currentEvent.total * 10) / 10,
          max_intensity_mm_per_hour: Math.round(currentEvent.maxRate * 10) / 10,
        });
      }
      currentEvent = null;
    };

    for (const o of obs) {
      const rain = o.precipitation_amount ?? 0;
      const timestampMs = new Date(o.observed_at).getTime();
      if (
        currentEvent &&
        (!Number.isFinite(timestampMs) || timestampMs - currentEvent.lastTimestampMs > 90 * 60 * 1000)
      ) {
        finishCurrentEvent();
      }
      if (rain > 0.0) {
        if (!currentEvent) {
          currentEvent = {
            start: o.observed_at,
            end: o.observed_at,
            total: rain,
            maxRate: rain,
            hours: 1,
            lastTimestampMs: timestampMs,
          };
        } else {
          currentEvent.end = o.observed_at;
          currentEvent.total += rain;
          currentEvent.maxRate = Math.max(currentEvent.maxRate, rain);
          currentEvent.hours += 1;
          currentEvent.lastTimestampMs = timestampMs;
        }
      } else {
        finishCurrentEvent();
      }
    }

    finishCurrentEvent();

    return events.sort((a, b) => b.start_at.localeCompare(a.start_at)).slice(0, limit);
  }

  /**
   * Retrieves all-time records for a location
   */
  static getAllTimeRecords(locationId: string) {
    const db = getDb();
    const dailies = db.getDailySummaries(locationId);

    let highestTemp: { val: number; date: string } | null = null;
    let lowestTemp: { val: number; date: string } | null = null;
    let wettestDay: { val: number; date: string } | null = null;
    let highestGust: { val: number; date: string } | null = null;

    for (const d of dailies) {
      if (d.temperature_max !== null && (!highestTemp || d.temperature_max > highestTemp.val)) {
        highestTemp = { val: d.temperature_max, date: d.date };
      }
      if (d.temperature_min !== null && (!lowestTemp || d.temperature_min < lowestTemp.val)) {
        lowestTemp = { val: d.temperature_min, date: d.date };
      }
      if (d.precipitation_total !== null && (!wettestDay || d.precipitation_total > wettestDay.val)) {
        wettestDay = { val: d.precipitation_total, date: d.date };
      }
      if (d.wind_gust_max !== null && (!highestGust || d.wind_gust_max > highestGust.val)) {
        highestGust = { val: d.wind_gust_max, date: d.date };
      }
    }

    return {
      highestTemp,
      lowestTemp,
      wettestDay,
      highestGust,
    };
  }
}
