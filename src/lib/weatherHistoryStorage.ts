const HISTORY_CACHE_PREFIX = 'verstasjonen_history_v1';

export interface CachedWeatherHistory<T = unknown> {
  cachedAt: string;
  payload: T;
}

function cacheKey(locationId: string, parameter: string, range: string, rangeKey = ''): string {
  return [HISTORY_CACHE_PREFIX, locationId, parameter, range, rangeKey].map(encodeURIComponent).join(':');
}

export function getCachedWeatherHistory<T = unknown>(
  locationId: string,
  parameter: string,
  range: string,
  rangeKey = ''
): CachedWeatherHistory<T> | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(cacheKey(locationId, parameter, range, rangeKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedWeatherHistory<T>;
    if (!parsed?.cachedAt || parsed.payload === undefined) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function cacheWeatherHistory<T>(
  locationId: string,
  parameter: string,
  range: string,
  payload: T,
  rangeKey = ''
): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(
      cacheKey(locationId, parameter, range, rangeKey),
      JSON.stringify({ cachedAt: new Date().toISOString(), payload })
    );
  } catch {
    // History remains available from the API if browser storage is full or disabled.
  }
}

export async function primeOneYearHistoryCache(locationId: string): Promise<void> {
  const parameter = 'temperature';
  const range = '1y';
  const response = await fetch(
    `/api/weather/history?locationId=${encodeURIComponent(locationId)}&parameter=${parameter}&range=${range}`,
    { cache: 'no-store' }
  );
  if (!response.ok) return;
  cacheWeatherHistory(locationId, parameter, range, await response.json());
}
