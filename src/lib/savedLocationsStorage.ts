import { LocationRecord } from '@/types/weather';
import { WEATHER_CONFIG } from './weatherConfig';

export const STORAGE_KEYS = {
  SAVED_LOCATIONS: 'vaerstasjonen_saved_locations_v3',
  ACTIVE_LOCATION_ID: 'vaerstasjonen_loc_id',
  DEFAULT_LOCATION_ID: 'vaerstasjonen_default_loc_id',
  DELETED_LOCATION_IDS: 'vaerstasjonen_deleted_loc_ids_v3',
} as const;

export const DEFAULT_AUKRA_LOCATION: LocationRecord = {
  id: WEATHER_CONFIG.defaultLocation.id,
  name: WEATHER_CONFIG.defaultLocation.name,
  latitude: WEATHER_CONFIG.defaultLocation.latitude,
  longitude: WEATHER_CONFIG.defaultLocation.longitude,
  altitude: WEATHER_CONFIG.defaultLocation.altitude,
  address: WEATHER_CONFIG.defaultLocation.address,
  timezone: WEATHER_CONFIG.defaultLocation.timezone,
  is_active: 1,
  // Client-side offline seed has no authoritative persistence timestamps.
  // The server assigns real timestamps if it ever has to create this record.
  created_at: '',
  updated_at: '',
};

/**
 * Reads user-saved locations directly from localStorage (synchronous & instant for PWA offline startup).
 */
export function getLocalSavedLocations(): LocationRecord[] {
  if (typeof localStorage === 'undefined') {
    return [DEFAULT_AUKRA_LOCATION];
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SAVED_LOCATIONS);
    if (!raw) {
      return [DEFAULT_AUKRA_LOCATION];
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      // Ensure default Aukra is present if user hasn't explicitly removed it
      const deletedIds = getDeletedLocationIds();
      const hasAukra = parsed.some((l) => l.id === DEFAULT_AUKRA_LOCATION.id);
      if (!hasAukra && !deletedIds.has(DEFAULT_AUKRA_LOCATION.id)) {
        return [DEFAULT_AUKRA_LOCATION, ...parsed];
      }
      return parsed;
    }
  } catch (err) {
    console.warn('Failed to parse saved locations from localStorage:', err);
  }

  return [DEFAULT_AUKRA_LOCATION];
}

/**
 * Saves or updates a location in localStorage.
 */
export function saveLocalLocation(loc: LocationRecord): LocationRecord[] {
  if (typeof localStorage === 'undefined') {
    return [loc];
  }

  const current = getLocalSavedLocations();
  const deletedIds = getDeletedLocationIds();

  // If re-adding a previously deleted location, remove from deleted blacklist
  if (deletedIds.has(loc.id)) {
    deletedIds.delete(loc.id);
    saveDeletedLocationIds(deletedIds);
  }

  const idx = current.findIndex((l) => l.id === loc.id);
  let updated: LocationRecord[];

  if (idx >= 0) {
    updated = [...current];
    updated[idx] = { ...updated[idx], ...loc, updated_at: new Date().toISOString() };
  } else {
    updated = [...current, loc];
  }

  try {
    localStorage.setItem(STORAGE_KEYS.SAVED_LOCATIONS, JSON.stringify(updated));
  } catch (err) {
    console.error('Failed to save location to localStorage:', err);
  }

  return updated;
}

/**
 * Stores the entire array of locations in localStorage.
 */
export function saveLocalLocationsList(locations: LocationRecord[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEYS.SAVED_LOCATIONS, JSON.stringify(locations));
  } catch (err) {
    console.error('Failed to save locations list to localStorage:', err);
  }
}

/**
 * Deletes a location from localStorage and records the deletion.
 */
export function deleteLocalLocation(id: string): LocationRecord[] {
  if (typeof localStorage === 'undefined') {
    return [DEFAULT_AUKRA_LOCATION];
  }

  const deletedIds = getDeletedLocationIds();
  deletedIds.add(id);
  saveDeletedLocationIds(deletedIds);

  const current = getLocalSavedLocations();
  const filtered = current.filter((l) => l.id !== id);
  const result = filtered.length > 0 ? filtered : [DEFAULT_AUKRA_LOCATION];

  try {
    localStorage.setItem(STORAGE_KEYS.SAVED_LOCATIONS, JSON.stringify(result));
  } catch (err) {
    console.error('Failed to delete location from localStorage:', err);
  }

  return result;
}

/**
 * Gets set of IDs explicitly deleted by the user on this device.
 */
export function getDeletedLocationIds(): Set<string> {
  if (typeof localStorage === 'undefined') {
    return new Set();
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.DELETED_LOCATION_IDS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return new Set(parsed);
      }
    }
  } catch {
    // ignore
  }
  return new Set();
}

function saveDeletedLocationIds(set: Set<string>): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEYS.DELETED_LOCATION_IDS, JSON.stringify(Array.from(set)));
  } catch {
    // ignore
  }
}

/**
 * Gets currently active location ID from localStorage, with validation.
 */
export function getActiveLocationId(): string {
  if (typeof localStorage === 'undefined') {
    return DEFAULT_AUKRA_LOCATION.id;
  }
  const saved = localStorage.getItem(STORAGE_KEYS.ACTIVE_LOCATION_ID);
  if (saved && saved.trim() !== '') {
    return saved.trim();
  }
  return DEFAULT_AUKRA_LOCATION.id;
}

/**
 * Persists currently active location ID to localStorage.
 */
export function setActiveLocationId(id: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEYS.ACTIVE_LOCATION_ID, id);
  } catch {
    // ignore
  }
}

/**
 * Gets default/starred location ID.
 */
export function getDefaultLocationId(): string {
  if (typeof localStorage === 'undefined') {
    return DEFAULT_AUKRA_LOCATION.id;
  }
  const saved = localStorage.getItem(STORAGE_KEYS.DEFAULT_LOCATION_ID);
  if (saved && saved.trim() !== '') {
    return saved.trim();
  }
  return DEFAULT_AUKRA_LOCATION.id;
}

/**
 * Persists default/starred location ID.
 */
export function setDefaultLocationId(id: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEYS.DEFAULT_LOCATION_ID, id);
  } catch {
    // ignore
  }
}

/**
 * Synchronizes client-side localStorage locations bidirectionally with the server.
 * 1. Restores any locally saved custom locations to the server if missing (e.g. after server container restarts).
 * 2. Merges new server locations into client storage.
 * 3. Returns the unified, up-to-date LocationRecord array.
 */
export async function syncSavedLocationsWithServer(): Promise<LocationRecord[]> {
  const localList = getLocalSavedLocations();
  const deletedIds = getDeletedLocationIds();

  try {
    const res = await fetch('/api/locations', {
      headers: { 'Cache-Control': 'no-cache' },
      signal: AbortSignal.timeout(6000),
    });

    if (res.ok) {
      const serverList: LocationRecord[] = await res.json();
      const serverIdMap = new Map(serverList.map((l) => [l.id, l]));

      // 1. If the server has a location that was deleted locally on this device, delete on server
      for (const serverLoc of serverList) {
        if (deletedIds.has(serverLoc.id)) {
          try {
            await fetch(`/api/locations?id=${encodeURIComponent(serverLoc.id)}`, { method: 'DELETE' });
            serverIdMap.delete(serverLoc.id);
          } catch {
            // ignore
          }
        }
      }

      // 2. If client has local custom locations not yet on server (e.g. fresh container / ephemeral reset),
      // push them to the server so telemetry and forecasts are generated for them.
      for (const loc of localList) {
        if (!serverIdMap.has(loc.id) && !deletedIds.has(loc.id)) {
          try {
            const pushRes = await fetch('/api/locations', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(loc),
            });
            if (pushRes.ok) {
              const created: LocationRecord = await pushRes.json();
              serverIdMap.set(created.id, created);
            }
          } catch (pushErr) {
            console.warn(`Could not sync location ${loc.name} to server:`, pushErr);
          }
        }
      }

      // 3. Build unified combined list
      const combinedMap = new Map<string, LocationRecord>();

      // Put server entries
      for (const [id, loc] of serverIdMap.entries()) {
        if (!deletedIds.has(id)) {
          combinedMap.set(id, loc);
        }
      }

      // Add any remaining local entries
      for (const loc of localList) {
        if (!deletedIds.has(loc.id) && !combinedMap.has(loc.id)) {
          combinedMap.set(loc.id, loc);
        }
      }

      const finalList = Array.from(combinedMap.values());
      if (finalList.length > 0) {
        saveLocalLocationsList(finalList);
        return finalList;
      }
    }
  } catch (netErr) {
    console.warn('Network sync for saved locations failed, using local offline copy:', netErr);
  }

  return localList;
}
