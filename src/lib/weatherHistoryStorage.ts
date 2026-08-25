const HISTORY_CACHE_PREFIX = 'verstasjonen_history_v1';
const HISTORY_PARAMETERS = ['temperature', 'precipitation', 'wind', 'pressure', 'humidity'] as const;

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

export function clearCachedWeatherHistory(locationId: string): void {
  if (typeof localStorage === 'undefined') return;
  const encodedPrefix = [HISTORY_CACHE_PREFIX, locationId].map(encodeURIComponent).join(':');
  try {
    for (let index = localStorage.length - 1; index >= 0; index--) {
      const key = localStorage.key(index);
      if (key?.startsWith(`${encodedPrefix}:`)) localStorage.removeItem(key);
    }
  } catch {
    // The server remains authoritative if browser storage is unavailable.
  }
}

export function isWeatherHistoryCacheFresh(cachedAt: string, range: string, now = Date.now()): boolean {
  const timestamp = Date.parse(cachedAt);
  if (!Number.isFinite(timestamp)) return false;
  const maxAgeMs = range === '24h' ? 15 * 60_000 : range === '7d' ? 60 * 60_000 : 6 * 60 * 60_000;
  return now - timestamp <= maxAgeMs;
}

export async function primeThreeMonthHistoryCache(locationId: string): Promise<void> {
  const parameter = 'temperature';
  const range = '3m';
  const existing = getCachedWeatherHistory(locationId, parameter, range);
  if (existing && isWeatherHistoryCacheFresh(existing.cachedAt, range)) return;

  const response = await fetch(
    `/api/weather/history?locationId=${encodeURIComponent(locationId)}&parameter=${parameter}&range=${range}`,
    { cache: 'no-store' }
  );
  if (!response.ok) return;
  const payload = await response.json();
  for (const historyParameter of HISTORY_PARAMETERS) {
    cacheWeatherHistory(locationId, historyParameter, range, payload);
  }
}
