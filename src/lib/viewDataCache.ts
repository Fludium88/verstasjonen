'use client';

interface ViewDataCacheEntry<T> {
  savedAt: number;
  value: T;
}

const memoryCache = new Map<string, ViewDataCacheEntry<unknown>>();
const STORAGE_PREFIX = 'vaerstasjonen:view-cache:v1:';

const getStorageKey = (scope: string, key: string) => `${STORAGE_PREFIX}${scope}:${key}`;

export function readViewDataCache<T>(
  scope: string,
  key: string,
  maxRetentionMs?: number
): ViewDataCacheEntry<T> | null {
  const storageKey = getStorageKey(scope, key);
  const memoryEntry = memoryCache.get(storageKey) as ViewDataCacheEntry<T> | undefined;
  if (memoryEntry) {
    if (maxRetentionMs === undefined || Date.now() - memoryEntry.savedAt < maxRetentionMs) return memoryEntry;
    memoryCache.delete(storageKey);
    if (typeof window !== 'undefined') window.localStorage.removeItem(storageKey);
    return null;
  }

  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ViewDataCacheEntry<T>;
    if (!Number.isFinite(parsed?.savedAt) || parsed?.value === undefined) return null;
    if (maxRetentionMs !== undefined && Date.now() - parsed.savedAt >= maxRetentionMs) {
      window.localStorage.removeItem(storageKey);
      return null;
    }
    memoryCache.set(storageKey, parsed);
    return parsed;
  } catch {
    return null;
  }
}

export function writeViewDataCache<T>(scope: string, key: string, value: T): void {
  const storageKey = getStorageKey(scope, key);
  const entry: ViewDataCacheEntry<T> = { savedAt: Date.now(), value };
  memoryCache.set(storageKey, entry);
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(entry));
  } catch {
    // A large station catalogue may exceed browser storage. The in-memory cache still works.
  }
}

export function isViewDataCacheFresh(entry: ViewDataCacheEntry<unknown>, maxAgeMs: number): boolean {
  return Date.now() - entry.savedAt < maxAgeMs;
}
