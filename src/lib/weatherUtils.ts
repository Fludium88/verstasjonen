/**
 * Central Meteorological Utilities & Algorithms for Værstasjonen
 */

/**
 * Calculates Wind Chill (JAG/TI formula, used by MET Norway & Environment Canada)
 * Valid for T <= 10 degC and V >= 4.8 km/h (1.33 m/s)
 * Formula: 13.12 + 0.6215*T - 11.37*(V^0.16) + 0.3965*T*(V^0.16) where V is in km/h
 */
export function calculateWindChill(tempC: number, windSpeedMs: number): number {
  if (tempC > 10 || windSpeedMs < 1.33) {
    return tempC;
  }
  const vKmh = windSpeedMs * 3.6;
  const v016 = Math.pow(vKmh, 0.16);
  const chill = 13.12 + 0.6215 * tempC - 11.37 * v016 + 0.3965 * tempC * v016;
  return Math.round(chill * 10) / 10;
}

/**
 * Calculates Heat Index / Australian Apparent Temperature for warm temperatures
 * Used when T >= 20 degC and relative humidity >= 40%
 */
export function calculateHeatIndex(tempC: number, humidityPct: number): number {
  if (tempC < 20 || humidityPct < 40) {
    return tempC;
  }
  const e = (humidityPct / 100) * 6.105 * Math.exp((17.27 * tempC) / (237.7 + tempC));
  const apparent = tempC + 0.33 * e - 4.0;
  return Math.round(apparent * 10) / 10;
}

/**
 * Unified Feels Like temperature calculator
 */
export function calculateFeelsLike(
  tempC: number | null | undefined,
  windSpeedMs: number | null | undefined,
  humidityPct: number | null | undefined
): number | null {
  if (tempC === null || tempC === undefined) return null;

  if (tempC <= 10) {
    return windSpeedMs === null || windSpeedMs === undefined
      ? null
      : calculateWindChill(tempC, windSpeedMs);
  }
  if (tempC >= 20) {
    return humidityPct === null || humidityPct === undefined
      ? null
      : calculateHeatIndex(tempC, humidityPct);
  }
  return Math.round(tempC * 10) / 10;
}

/**
 * Calculates Dew Point using Magnus-Tetens approximation
 */
export function calculateDewPoint(
  tempC: number | null | undefined,
  humidityPct: number | null | undefined
): number | null {
  if (tempC === null || tempC === undefined || humidityPct === null || humidityPct === undefined) {
    return null;
  }
  if (humidityPct <= 0) return null;

  const a = 17.27;
  const b = 237.7;
  const alpha = (a * tempC) / (b + tempC) + Math.log(humidityPct / 100);
  const dewPoint = (b * alpha) / (a - alpha);
  return Math.round(dewPoint * 10) / 10;
}

/**
 * Converts wind direction in degrees (0-360) to 8-sector Norwegian cardinal abbreviation
 */
export function getWindDirectionCardinal8(degrees: number | null | undefined): string {
  if (degrees === null || degrees === undefined || isNaN(degrees)) return '–';
  const norm = ((degrees % 360) + 360) % 360;
  const sectors = ['N', 'NØ', 'Ø', 'SØ', 'S', 'SV', 'V', 'NV'];
  const index = Math.round(norm / 45) % 8;
  return sectors[index];
}

/**
 * Converts wind direction in degrees (0-360) to full Norwegian descriptive direction name
 */
export function getWindDirectionFullName(degrees: number | null | undefined): string {
  if (degrees === null || degrees === undefined || isNaN(degrees)) return 'Ukjent retning';
  const norm = ((degrees % 360) + 360) % 360;
  const sectors = [
    'Nord (N)',
    'Nordøst (NØ)',
    'Øst (Ø)',
    'Sørøst (SØ)',
    'Sør (S)',
    'Sørvest (SV)',
    'Vest (V)',
    'Nordvest (NV)',
  ];
  const index = Math.round(norm / 45) % 8;
  return sectors[index];
}

/**
 * Returns a Unicode arrow pointing in the direction the wind is blowing towards (downwind).
 * Meteorological wind direction is given as "wind coming FROM" (e.g. 180° = S, blowing Northward).
 * Downwind angle = (deg + 180) % 360.
 */
export function getWindDirectionArrowUnicode(degrees: number | null | undefined): string {
  if (degrees === null || degrees === undefined || isNaN(degrees)) return '•';
  const norm = ((degrees % 360) + 360) % 360;
  // Meteorological wind: 0° (North wind) blows South (↓), 180° (South wind) blows North (↑)
  const arrows = ['↓', '↙', '←', '↖', '↑', '↗', '→', '↘'];
  const index = Math.round(norm / 45) % 8;
  return arrows[index];
}

/**
 * Calculates circular mean (vector average) of a set of angles in degrees (0-360),
 * optionally weighted by wind speed or magnitude.
 * Correctly handles the 0° / 360° boundary.
 */
export function calculateCircularMeanDegrees(
  angles: (number | null | undefined)[],
  weights?: (number | null | undefined)[]
): number | null {
  if (!angles || angles.length === 0) return null;

  let sinSum = 0;
  let cosSum = 0;
  let totalWeight = 0;

  for (let i = 0; i < angles.length; i++) {
    const deg = angles[i];
    if (deg === null || deg === undefined || isNaN(deg)) continue;

    const w = weights && weights[i] !== null && weights[i] !== undefined && !isNaN(weights[i]!)
      ? Math.max(0.1, weights[i]!)
      : 1;

    const rad = (deg * Math.PI) / 180;
    sinSum += w * Math.sin(rad);
    cosSum += w * Math.cos(rad);
    totalWeight += w;
  }

  if (totalWeight === 0) return null;

  let avgRad = Math.atan2(sinSum, cosSum);
  if (avgRad < 0) avgRad += 2 * Math.PI;

  const avgDeg = Math.round((avgRad * 180) / Math.PI) % 360;
  return avgDeg;
}

/**
 * Converts wind direction in degrees (0-360) to 16-sector Norwegian cardinal abbreviation
 */
export function getWindDirectionCardinal16(degrees: number | null | undefined): string {
  if (degrees === null || degrees === undefined || isNaN(degrees)) return '–';
  const norm = ((degrees % 360) + 360) % 360;
  const sectors = ['N', 'NNØ', 'NØ', 'ØNØ', 'Ø', 'ØSØ', 'SØ', 'SSØ', 'S', 'SSV', 'SV', 'VSV', 'V', 'VNV', 'NV', 'NNV'];
  const index = Math.round(norm / 22.5) % 16;
  return sectors[index];
}

/**
 * Calculates Beaufort scale number and Norwegian descriptive name from wind speed (m/s)
 */
export function getBeaufort(windSpeedMs: number | null | undefined): { scale: number; name: string } {
  if (windSpeedMs === null || windSpeedMs === undefined || isNaN(windSpeedMs) || windSpeedMs < 0.2) {
    return { scale: 0, name: 'Stille' };
  }
  const v = windSpeedMs;
  if (v <= 1.5) return { scale: 1, name: 'Flau vind' };
  if (v <= 3.3) return { scale: 2, name: 'Svak vind' };
  if (v <= 5.4) return { scale: 3, name: 'Lett bris' };
  if (v <= 7.9) return { scale: 4, name: 'Laber bris' };
  if (v <= 10.7) return { scale: 5, name: 'Frisk bris' };
  if (v <= 13.8) return { scale: 6, name: 'Liten kuling' };
  if (v <= 17.1) return { scale: 7, name: 'Stiv kuling' };
  if (v <= 20.7) return { scale: 8, name: 'Sterk kuling' };
  if (v <= 24.4) return { scale: 9, name: 'Liten storm' };
  if (v <= 28.4) return { scale: 10, name: 'Full storm' };
  if (v <= 32.6) return { scale: 11, name: 'Sterk storm' };
  return { scale: 12, name: 'Orkan' };
}

/**
 * Evaluates pressure trend from 3-hour pressure delta in hPa
 */
export function evaluatePressureTrend(diff3hHpa: number | null | undefined): {
  trend: 'STEEPLY_RISING' | 'RISING' | 'STEADY' | 'FALLING' | 'STEEPLY_FALLING' | 'UNKNOWN';
  label: string;
} {
  if (diff3hHpa === null || diff3hHpa === undefined) {
    return { trend: 'UNKNOWN', label: 'Ikke tilgjengelig' };
  }
  if (diff3hHpa >= 3.0) return { trend: 'STEEPLY_RISING', label: 'Kraftig stigende' };
  if (diff3hHpa >= 1.0) return { trend: 'RISING', label: 'Stigende' };
  if (diff3hHpa <= -3.0) return { trend: 'STEEPLY_FALLING', label: 'Kraftig fallende' };
  if (diff3hHpa <= -1.0) return { trend: 'FALLING', label: 'Fallende' };
  return { trend: 'STEADY', label: 'Stabilt' };
}

/**
 * Calculates Haversine distance in kilometers between two GPS coordinates
 */
export function calculateHaversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

/**
 * Formats Norwegian number string (e.g. 12.4 -> "12,4")
 */
export function formatNorwegianNumber(val: number | null | undefined, decimals: number = 1): string {
  if (val === null || val === undefined || isNaN(val)) return '–';
  return val.toFixed(decimals).replace('.', ',');
}

/**
 * Maps MET symbol codes to Norwegian descriptive labels
 */
export function formatWeatherSymbolName(symbolCode?: string | null): string {
  if (!symbolCode) return 'Ukjent';
  const clean = symbolCode.replace(/_(day|night|polartwilight)$/, '');
  const map: Record<string, string> = {
    clearsky: 'Klarvær',
    fair: 'Lettskyet',
    partlycloudy: 'Delvis skyet',
    cloudy: 'Skyet',
    rainshowers: 'Regnbyger',
    rainshowersandthunder: 'Regnbyger og torden',
    sleetshowers: 'Sluddbyger',
    snowshowers: 'Snøbyger',
    rain: 'Regn',
    heavyrain: 'Kraftig regn',
    heavyrainandthunder: 'Kraftig regn og torden',
    sleet: 'Sludd',
    snow: 'Snø',
    heavysnow: 'Kraftig snø',
    fog: 'Tåke',
    lightrainshowers: 'Lette regnbyger',
    heavyrainshowers: 'Kraftige regnbyger',
    lightsleetshowers: 'Lette sluddbyger',
    heavysleetshowers: 'Kraftige sluddbyger',
    lightsnowshowers: 'Lette snøbyger',
    heavysnowshowers: 'Kraftige snøbyger',
    lightrain: 'Lett regn',
    lightsleet: 'Lett sludd',
    heavysleet: 'Kraftig sludd',
    lightsnow: 'Lett snø',
  };
  return map[clean] || 'Skyet';
}

/**
 * Rounds coordinate to MET recommended precision (4 decimals)
 */
export function roundMetCoord(val: number): number {
  return Math.round(val * 10000) / 10000;
}

/**
 * Calculates a well-scaled Y-axis domain [min, max] for temperature charts.
 * Prevents small fluctuations (0.1 - 0.5 °C) from looking like massive swings
 * by enforcing a minimum span (default 8°C) and rounding bounds to clean integer intervals.
 */
export function getTemperatureDomain(
  dataMin: number,
  dataMax: number,
  minSpan: number = 8
): [number, number] {
  if (dataMin === undefined || dataMax === undefined || isNaN(dataMin) || isNaN(dataMax)) {
    return [0, 20];
  }

  const currentSpan = Math.abs(dataMax - dataMin);
  const mid = (dataMin + dataMax) / 2;

  // We want at least minSpan degrees displayed on the Y-axis.
  // If the actual span is wider, add at least 1.5°C padding on each side.
  const targetSpan = Math.max(currentSpan + 3, minSpan);

  const low = mid - targetSpan / 2;
  const high = mid + targetSpan / 2;

  // Round bounds to clean integer intervals (step = 2 for spans <= 20, step = 5 for large spans)
  const step = targetSpan > 20 ? 5 : 2;
  let roundedMin = Math.floor(low / step) * step;
  let roundedMax = Math.ceil(high / step) * step;

  // Ensure span is at least minSpan
  if (roundedMax - roundedMin < minSpan) {
    const diff = minSpan - (roundedMax - roundedMin);
    roundedMin -= Math.ceil(diff / 2 / step) * step;
    roundedMax += Math.floor(diff / 2 / step) * step;
  }

  return [roundedMin, roundedMax];
}

/**
 * Resamples measured observations into exactly 24 hourly buckets.
 * Missing measurements remain null and are never filled with model or synthetic values.
 */
export const NORWAY_TIMEZONE = 'Europe/Oslo';

/**
 * Format time in Norwegian locale strictly pinned to Europe/Oslo timezone
 */
export function formatNorwegianTime(
  date: Date | string | number,
  options?: Intl.DateTimeFormatOptions
): string {
  if (!date) return '';
  const d = typeof date === 'object' ? date : new Date(date);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('nb-NO', {
    timeZone: NORWAY_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    ...options,
  });
}

/**
 * Format date in Norwegian locale strictly pinned to Europe/Oslo timezone
 */
export function formatNorwegianDate(
  date: Date | string | number,
  options?: Intl.DateTimeFormatOptions
): string {
  if (!date) return '';
  const d = typeof date === 'object' ? date : new Date(date);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('nb-NO', {
    timeZone: NORWAY_TIMEZONE,
    ...options,
  });
}

/**
 * Format date and time in Norwegian locale strictly pinned to Europe/Oslo timezone
 */
export function formatNorwegianDateTime(
  date: Date | string | number,
  options?: Intl.DateTimeFormatOptions
): string {
  if (!date) return '';
  const d = typeof date === 'object' ? date : new Date(date);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('nb-NO', {
    timeZone: NORWAY_TIMEZONE,
    ...options,
  });
}

export function bin24HoursObservations(
  pastObs: any[],
  now: Date = new Date(),
  _currentTemp?: number | null,
  _currentPressure?: number | null,
  _currentHumidity?: number | null,
  _forecastValues?: any[],
  preferredElementStations?: Partial<Record<string, string | undefined>>
) {
  const buckets: {
    time: string;
    display_time: string;
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
    source_type: 'MÅLT' | 'UKJENT';
  }[] = [];

  // Align with exact current hour in UTC milliseconds
  const currentHourMs = Math.floor(now.getTime() / (60 * 60 * 1000)) * (60 * 60 * 1000);

  for (let i = 23; i >= 0; i--) {
    const slotStart = new Date(currentHourMs - i * 60 * 60 * 1000);
    const slotEnd = new Date(slotStart.getTime() + 60 * 60 * 1000);

    const slotIso = slotStart.toISOString();
    const hoursStr = formatNorwegianTime(slotStart, { hour: '2-digit', minute: '2-digit' });

    // Find observations matching this 1-hour slot
    const matchingObs = pastObs.filter((o) => {
      const t = new Date(o.observed_at).getTime();
      const source = String(o.source || '').toUpperCase();
      const isModelOrSynthetic = [
        'FORECAST',
        'LOCATIONFORECAST',
        'WEATHER_MODEL',
        'HISTORICAL_ESTIMATE',
        'SYNTHETIC',
        'SIMULATED',
        'SIMULERT',
        'GENERATED',
      ].some((marker) => source.includes(marker));
      return Boolean(source) && !isModelOrSynthetic && t >= slotStart.getTime() && t < slotEnd.getTime();
    });

    const valuesFor = (field: string): number[] => {
      const candidates = matchingObs.filter(
        (observation) => typeof observation[field] === 'number' && Number.isFinite(observation[field])
      );
      const preferredStation = preferredElementStations?.[field];
      const preferred = preferredStation
        ? candidates.filter(
            (observation) =>
              observation.station_id === preferredStation ||
              observation.element_sources?.[field] === preferredStation
          )
        : [];
      return (preferred.length > 0 ? preferred : candidates).map((observation) => observation[field]);
    };
    const temps = valuesFor('air_temperature');
    const precips = valuesFor('precipitation_amount');
    const winds = valuesFor('wind_speed');
    const gusts = valuesFor('wind_gust');
    const pressures = valuesFor('air_pressure');
    const humidities = valuesFor('relative_humidity');
    const directions = valuesFor('wind_direction');

    const tempAvg = temps.length > 0 ? Math.round((temps.reduce((a, b) => a + b, 0) / temps.length) * 10) / 10 : null;
    const tempMin = temps.length > 0 ? Math.round(Math.min(...temps) * 10) / 10 : null;
    const tempMax = temps.length > 0 ? Math.round(Math.max(...temps) * 10) / 10 : null;
    const pressAvg = pressures.length > 0 ? Math.round((pressures.reduce((a, b) => a + b, 0) / pressures.length) * 10) / 10 : null;
    const humAvg = humidities.length > 0 ? Math.round((humidities.reduce((a, b) => a + b, 0) / humidities.length) * 10) / 10 : null;
    const precipTotal = precips.length > 0 ? Math.round(Math.max(...precips) * 10) / 10 : null;
    const windAvg = winds.length > 0 ? Math.round((winds.reduce((a, b) => a + b, 0) / winds.length) * 10) / 10 : null;
    const windGustMax = gusts.length > 0 ? Math.max(...gusts) : null;
    const dirAvg = calculateCircularMeanDegrees(directions);

    buckets.push({
      time: slotIso,
      display_time: hoursStr,
      temperature: tempAvg,
      temp_avg: tempAvg,
      temp_min: tempMin,
      temp_max: tempMax,
      precipitation: precipTotal,
      wind_speed: windAvg,
      wind_gust: windGustMax,
      wind_direction: dirAvg,
      pressure: pressAvg,
      humidity: humAvg,
      source_type: matchingObs.length > 0 ? 'MÅLT' : 'UKJENT',
    });
  }

  return buckets;
}
