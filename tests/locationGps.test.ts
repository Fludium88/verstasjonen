import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  isGpsStartupEnabled,
  setGpsStartupEnabled,
  hasGpsPromptBeenShown,
  setGpsPromptShown,
  GPS_STORAGE_KEYS,
  GPS_LOCATION_ID,
  GPS_LOCATION_ID_PREFIX,
  getGpsLocationId,
  getCurrentGpsPosition,
} from '../src/lib/locationGps';
import { getDb } from '../src/lib/db';
import { LocationRecord } from '../src/types/weather';

describe('GPS Location Management & Foreground Safety', () => {
  let localStorageMock: Record<string, string> = {};

  beforeEach(() => {
    localStorageMock = {};
    global.localStorage = {
      getItem: vi.fn((key: string) => localStorageMock[key] ?? null),
      setItem: vi.fn((key: string, value: string) => {
        localStorageMock[key] = value;
      }),
      removeItem: vi.fn((key: string) => {
        delete localStorageMock[key];
      }),
      clear: vi.fn(() => {
        localStorageMock = {};
      }),
      length: 0,
      key: vi.fn(() => null),
    };
  });

  it('manages GPS startup state in localStorage correctly', () => {
    expect(isGpsStartupEnabled()).toBe(false);

    setGpsStartupEnabled(true);
    expect(isGpsStartupEnabled()).toBe(true);
    expect(localStorage.setItem).toHaveBeenCalledWith(GPS_STORAGE_KEYS.AUTO_STARTUP, 'true');

    setGpsStartupEnabled(false);
    expect(isGpsStartupEnabled()).toBe(false);
    expect(localStorage.setItem).toHaveBeenCalledWith(GPS_STORAGE_KEYS.AUTO_STARTUP, 'false');
  });

  it('tracks whether startup GPS prompt has been shown to user', () => {
    setGpsPromptShown(false);
    expect(hasGpsPromptBeenShown()).toBe(false);

    setGpsPromptShown(true);
    expect(hasGpsPromptBeenShown()).toBe(true);
    expect(localStorage.setItem).toHaveBeenCalledWith(GPS_STORAGE_KEYS.PROMPTED, '2');

    localStorageMock[GPS_STORAGE_KEYS.PROMPTED] = 'true';
    expect(hasGpsPromptBeenShown()).toBe(false);
  });

  it('uses one stable GPS location ID per browser device', () => {
    const first = getGpsLocationId();
    const second = getGpsLocationId();
    expect(first).toBe(second);
    expect(first.startsWith(GPS_LOCATION_ID_PREFIX)).toBe(true);
    expect(first).not.toBe(GPS_LOCATION_ID);
  });

  it('rejects positioning if document is in background (foreground safety)', async () => {
    const mockGeolocation = {
      getCurrentPosition: vi.fn((success, _error) => {
        success({
          coords: { latitude: 59.9139, longitude: 10.7522, altitude: 25, accuracy: 10 },
        });
      }),
    };

    Object.defineProperty(global, 'navigator', {
      value: { geolocation: mockGeolocation },
      writable: true,
      configurable: true,
    });

    Object.defineProperty(global, 'document', {
      value: { visibilityState: 'hidden' },
      writable: true,
      configurable: true,
    });

    await expect(getCurrentGpsPosition(5000)).rejects.toThrow(
      'Posisjonering kan kun utføres når appen er aktiv i forgrunnen.'
    );
  });

  it('fetches coordinates accurately when active in foreground', async () => {
    const mockGeolocation = {
      getCurrentPosition: vi.fn((success, _error) => {
        success({
          coords: { latitude: 62.7905, longitude: 6.9208, altitude: 18, accuracy: 5 },
        });
      }),
    };

    Object.defineProperty(global, 'navigator', {
      value: { geolocation: mockGeolocation },
      writable: true,
      configurable: true,
    });

    Object.defineProperty(global, 'document', {
      value: { visibilityState: 'visible' },
      writable: true,
      configurable: true,
    });

    const result = await getCurrentGpsPosition(5000);
    expect(result.latitude).toBe(62.7905);
    expect(result.longitude).toBe(6.9208);
    expect(result.altitude).toBe(18);
    expect(result.accuracy).toBe(5);
  });

  it('keeps unknown GPS altitude as null instead of inventing elevation', async () => {
    Object.defineProperty(global, 'navigator', {
      value: {
        geolocation: {
          getCurrentPosition: vi.fn((success) =>
            success({
              coords: { latitude: 62.7905, longitude: 6.9208, altitude: null, accuracy: 5 },
            })
          ),
        },
      },
      writable: true,
      configurable: true,
    });
    Object.defineProperty(global, 'document', {
      value: { visibilityState: 'visible' },
      writable: true,
      configurable: true,
    });

    await expect(getCurrentGpsPosition(5000)).resolves.toMatchObject({ altitude: null });
  });

  it('does not present cached coordinates as a fresh GPS measurement', async () => {
    localStorage.setItem(GPS_STORAGE_KEYS.LAST_KNOWN_LAT, '59.9139');
    localStorage.setItem(GPS_STORAGE_KEYS.LAST_KNOWN_LON, '10.7522');
    Object.defineProperty(global, 'navigator', {
      value: {
        geolocation: {
          getCurrentPosition: vi.fn((_success, error) => error({ code: 3 })),
        },
      },
      writable: true,
      configurable: true,
    });
    Object.defineProperty(global, 'document', {
      value: { visibilityState: 'visible' },
      writable: true,
      configurable: true,
    });

    await expect(getCurrentGpsPosition(5000)).rejects.toThrow(
      'Posisjoneringen tok for lang tid'
    );
  });

  it('keeps unknown GPS accuracy as null instead of inventing metres', async () => {
    Object.defineProperty(global, 'navigator', {
      value: {
        geolocation: {
          getCurrentPosition: vi.fn((success) =>
            success({
              coords: {
                latitude: 62.7905,
                longitude: 6.9208,
                altitude: null,
                accuracy: Number.NaN,
              },
            })
          ),
        },
      },
      writable: true,
      configurable: true,
    });
    Object.defineProperty(global, 'document', {
      value: { visibilityState: 'visible' },
      writable: true,
      configurable: true,
    });

    await expect(getCurrentGpsPosition(5000)).resolves.toMatchObject({ accuracy: null });
  });

  it('supports upserting GPS location with ID loc_gps_current in database', () => {
    const db = getDb();
    const gpsLoc: LocationRecord = {
      id: GPS_LOCATION_ID,
      name: 'Min posisjon (Oslo)',
      latitude: 59.9139,
      longitude: 10.7522,
      altitude: 25,
      address: 'Oslo sentrum',
      timezone: 'Europe/Oslo',
      is_active: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    db.saveLocation(gpsLoc);
    const retrieved = db.getLocation(GPS_LOCATION_ID);

    expect(retrieved).toBeDefined();
    expect(retrieved?.id).toBe(GPS_LOCATION_ID);
    expect(retrieved?.name).toBe('Min posisjon (Oslo)');
    expect(retrieved?.latitude).toBe(59.9139);

    // Update coordinates in place without duplication
    const updatedGpsLoc: LocationRecord = {
      ...gpsLoc,
      name: 'Min posisjon (Bergen)',
      latitude: 60.3913,
      longitude: 5.3221,
    };
    db.saveLocation(updatedGpsLoc);

    const updatedRetrieved = db.getLocation(GPS_LOCATION_ID);
    expect(updatedRetrieved?.name).toBe('Min posisjon (Bergen)');
    expect(updatedRetrieved?.latitude).toBe(60.3913);

    const allGpsLocs = db.getLocations().filter((l) => l.id === GPS_LOCATION_ID);
    expect(allGpsLocs.length).toBe(1); // Single instance maintained
  });
});
