import { LocationRecord } from '@/types/weather';

export const GPS_STORAGE_KEYS = {
  AUTO_STARTUP: 'vaerstasjonen_gps_auto_startup',
  PROMPTED: 'vaerstasjonen_gps_prompted',
  LAST_KNOWN_LAT: 'vaerstasjonen_gps_lat',
  LAST_KNOWN_LON: 'vaerstasjonen_gps_lon',
  DEVICE_ID: 'vaerstasjonen_gps_device_id',
  CURRENT_LOC_ID: 'vaerstasjonen_loc_id',
} as const;

/** Legacy ID retained for recognizing locations saved by older builds. */
export const GPS_LOCATION_ID = 'loc_gps_current';
export const GPS_LOCATION_ID_PREFIX = 'loc_gps_';
let ephemeralGpsLocationId: string | null = null;

export interface GpsPositionResult {
  latitude: number;
  longitude: number;
  altitude: number | null;
  accuracy: number | null;
}

export interface ReverseGeocodeResult {
  name: string;
  fullName: string;
  lat: number;
  lon: number;
  alt: number | null;
  address: string;
  isGpsResolved?: boolean;
}

/**
 * Checks if geolocation is supported in the current environment
 */
export function isGeolocationSupported(): boolean {
  return typeof navigator !== 'undefined' && 'geolocation' in navigator;
}

/**
 * Checks the browser's current permission status for Geolocation
 */
export async function checkGeolocationPermission(): Promise<'granted' | 'prompt' | 'denied' | 'unsupported'> {
  if (!isGeolocationSupported()) return 'unsupported';

  try {
    if (typeof navigator.permissions !== 'undefined' && navigator.permissions.query) {
      const status = await navigator.permissions.query({ name: 'geolocation' });
      return status.state; // 'granted' | 'prompt' | 'denied'
    }
  } catch {
    // Some browsers might throw or not support querying geolocation permission
  }

  // If permission query is not supported, return 'prompt' as default
  return 'prompt';
}

/**
 * Internal helper to run a single geolocation request with specific options
 */
function queryPositionOnce(options: PositionOptions): Promise<GpsPositionResult> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords: GpsPositionResult = {
          latitude: Number(pos.coords.latitude.toFixed(4)),
          longitude: Number(pos.coords.longitude.toFixed(4)),
          altitude: pos.coords.altitude == null ? null : Math.round(pos.coords.altitude),
          accuracy: Number.isFinite(pos.coords.accuracy)
            ? Math.round(pos.coords.accuracy)
            : null,
        };

        resolve(coords);
      },
      (err) => {
        reject(err);
      },
      options
    );
  });
}

function geolocationDeniedMessage(): string {
  const embedded =
    typeof window !== 'undefined' && window.top !== null && window.top !== window.self;
  return embedded
    ? 'Posisjonstilgang ble blokkert i den innebygde forhåndsvisningen. Åpne appen i en egen fane eller bruk den publiserte adressen, og tillat posisjon der.'
    : 'Posisjonstilgang ble avslått. Du kan aktivere dette i nettleserens innstillinger.';
}

/**
 * Retrieves the current GPS position with high responsiveness.
 * Strictly operates in foreground ("kun ved aktiv bruk av appen").
 * Tries fast high-accuracy first, then immediately falls back to network/standard accuracy if needed.
 */
export async function getCurrentGpsPosition(timeoutMs = 6000): Promise<GpsPositionResult> {
  if (!isGeolocationSupported()) {
    throw new Error('Posisjonstjenester (GPS) er ikke støttet i denne nettleseren.');
  }

  // Ensure document is active in foreground
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
    throw new Error('Posisjonering kan kun utføres når appen er aktiv i forgrunnen.');
  }

  // Older builds stored exact coordinates for a fallback that could be
  // mistaken for a live fix. Remove those legacy values; saved locations are
  // retained separately and remain unchanged if live positioning fails.
  try {
    localStorage.removeItem(GPS_STORAGE_KEYS.LAST_KNOWN_LAT);
    localStorage.removeItem(GPS_STORAGE_KEYS.LAST_KNOWN_LON);
  } catch {
    // localStorage may be unavailable in privacy-restricted browsers.
  }

  // Tier 1: Try high accuracy with a quick 3.5s timeout
  try {
    const highAccResult = await queryPositionOnce({
      enableHighAccuracy: true,
      timeout: Math.min(3500, timeoutMs),
      maximumAge: 120000,
    });
    return highAccResult;
  } catch (err: any) {
    // If permission was explicitly denied, fail immediately without retrying
    if (err && err.code === 1) {
      throw new Error(geolocationDeniedMessage());
    }
  }

  // Tier 2: Fallback to fast standard accuracy (IP / Wi-Fi / Cell)
  try {
    const standardResult = await queryPositionOnce({
      enableHighAccuracy: false,
      timeout: 3000,
      maximumAge: 300000,
    });
    return standardResult;
  } catch (err: any) {
    let msg = 'GPS-posisjon er for øyeblikket utilgjengelig.';
    if (err && err.code === 1) {
      msg = geolocationDeniedMessage();
    } else if (err && err.code === 3) {
      msg = 'Posisjoneringen tok for lang tid (tidsavbrudd).';
    }
    throw new Error(msg);
  }
}

/**
 * Reverse geocodes coordinates to a Norwegian city/municipality name and address
 */
export async function reverseGeocodeCoords(lat: number, lon: number): Promise<ReverseGeocodeResult> {
  try {
    const res = await fetch(`/api/geocoding?lat=${lat}&lon=${lon}`);
    if (res.ok) {
      const data = await res.json();
      return data;
    }
  } catch (err) {
    console.warn('Failed reverse geocoding:', err);
  }

  return {
    name: 'Min posisjon',
    fullName: `Min posisjon (${lat.toFixed(2)}°N, ${lon.toFixed(2)}°Ø)`,
    lat,
    lon,
    alt: null,
    address: `GPS: ${lat.toFixed(4)}°N, ${lon.toFixed(4)}°Ø`,
    isGpsResolved: true,
  };
}

/**
 * Returns a stable per-browser ID so phone and desktop GPS updates never
 * overwrite each other in the shared personal deployment.
 */
export function getGpsLocationId(): string {
  if (typeof localStorage === 'undefined') return GPS_LOCATION_ID;

  try {
    const existing = localStorage.getItem(GPS_STORAGE_KEYS.DEVICE_ID);
    if (existing && /^[a-z0-9_-]{8,40}$/i.test(existing)) {
      return `${GPS_LOCATION_ID_PREFIX}${existing}`;
    }

    const generated =
      typeof globalThis.crypto !== 'undefined' && 'randomUUID' in globalThis.crypto
        ? globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 20)
        : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
    localStorage.setItem(GPS_STORAGE_KEYS.DEVICE_ID, generated);
    return `${GPS_LOCATION_ID_PREFIX}${generated}`;
  } catch {
    // Storage-restricted browsers still get a collision-resistant session ID.
    if (!ephemeralGpsLocationId) {
      ephemeralGpsLocationId = `${GPS_LOCATION_ID_PREFIX}${Math.random().toString(36).slice(2, 14)}`;
    }
    return ephemeralGpsLocationId;
  }
}

/**
 * Upserts this browser's GPS location into the server database so forecasts,
 * station mappings and telemetry are computed without cross-device overwrite.
 */
export async function syncGpsLocationToServer(
  coords: { latitude: number; longitude: number; altitude?: number | null },
  placeName?: string,
  address?: string
): Promise<LocationRecord> {
  const displayName = placeName && placeName !== 'Min posisjon'
    ? `Min posisjon (${placeName})`
    : 'Min posisjon (GPS)';

  const res = await fetch('/api/locations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: getGpsLocationId(),
      name: displayName,
      latitude: coords.latitude,
      longitude: coords.longitude,
      altitude: coords.altitude ?? null,
      address: address || `GPS: ${coords.latitude}°N, ${coords.longitude}°Ø`,
      timezone: 'Europe/Oslo',
    }),
  });

  if (!res.ok) {
    const errJson = await res.json().catch(() => ({}));
    throw new Error(errJson.error || errJson.details || 'Kunne ikke oppdatere GPS på serveren');
  }

  const loc: LocationRecord = await res.json();
  return loc;
}

/**
 * Check if the user has enabled auto-GPS on startup
 */
export function isGpsStartupEnabled(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem(GPS_STORAGE_KEYS.AUTO_STARTUP) === 'true';
  } catch {
    return false;
  }
}

/**
 * Save user's preference for auto-GPS on startup
 */
export function setGpsStartupEnabled(enabled: boolean): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(GPS_STORAGE_KEYS.AUTO_STARTUP, enabled ? 'true' : 'false');
  } catch {
    // ignore
  }
}

/**
 * Check if the startup GPS prompt modal has ever been shown to the user
 */
export function hasGpsPromptBeenShown(): boolean {
  if (typeof localStorage === 'undefined') return true;
  try {
    return localStorage.getItem(GPS_STORAGE_KEYS.PROMPTED) === 'true';
  } catch {
    return true;
  }
}

/**
 * Mark the startup GPS prompt modal as having been handled
 */
export function setGpsPromptShown(shown = true): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(GPS_STORAGE_KEYS.PROMPTED, shown ? 'true' : 'false');
  } catch {
    // ignore
  }
}
