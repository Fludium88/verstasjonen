import { getDb } from '@/lib/db';
import { WEATHER_CONFIG } from '@/lib/weatherConfig';
import { LocationRecord, Observation, WeatherStation } from '@/types/weather';
import { WeatherStationResolver } from '../station-resolver/stationResolver';
import { AggregationService } from '../aggregation/aggregationService';
import { calculateHaversineDistanceKm } from '@/lib/weatherUtils';

type FrostPageResult = { status: number; data: unknown[]; complete: boolean };
const FROST_NEAREST_STATION_COUNT = 500;
const FROST_CAPABILITY_BATCH_SIZE = 100;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasAcceptableQuality(observation: unknown): observation is Record<string, unknown> {
  if (!isRecord(observation)) return false;
  if (observation.qualityCode === undefined || observation.qualityCode === null) return true;
  const quality =
    typeof observation.qualityCode === 'number'
      ? observation.qualityCode
      : typeof observation.qualityCode === 'string' && observation.qualityCode.trim() !== ''
        ? Number(observation.qualityCode)
        : Number.NaN;
  return Number.isInteger(quality) && quality >= 0 && quality <= 4;
}

type FrostCapability =
  | 'air_temperature'
  | 'precipitation_amount'
  | 'wind_speed'
  | 'wind_speed_of_gust'
  | 'wind_from_direction'
  | 'relative_humidity'
  | 'air_pressure_at_sea_level'
  | 'surface_snow_thickness';

const FROST_ELEMENT_PREFERENCES: Record<FrostCapability, string[]> = {
  air_temperature: ['air_temperature', 'mean(air_temperature PT1H)'],
  precipitation_amount: [
    'sum(precipitation_amount PT1H)',
    'precipitation_amount',
    'sum(precipitation_amount P1D)',
  ],
  wind_speed: ['wind_speed', 'mean(wind_speed PT1H)'],
  wind_speed_of_gust: [
    'max(wind_speed_of_gust PT10M)',
    'max(wind_speed_of_gust PT1H)',
    'wind_speed_of_gust',
  ],
  wind_from_direction: ['wind_from_direction'],
  relative_humidity: ['relative_humidity', 'mean(relative_humidity PT1H)'],
  air_pressure_at_sea_level: [
    'air_pressure_at_sea_level',
    'mean(air_pressure_at_sea_level PT1H)',
    'air_pressure_at_sea_level_qnh',
    'mean(air_pressure_at_sea_level_qnh PT1H)',
    'surface_air_pressure',
    'mean(surface_air_pressure PT1H)',
  ],
  surface_snow_thickness: ['surface_snow_thickness'],
};

export function preferredFrostElementId(
  elementIds: Iterable<string>,
  capability: FrostCapability
): string | undefined {
  const available = new Set(elementIds);
  return FROST_ELEMENT_PREFERENCES[capability].find((elementId) => available.has(elementId));
}

export function classifyFrostElementIds(elementIds: Iterable<string>): string[] {
  return (Object.keys(FROST_ELEMENT_PREFERENCES) as FrostCapability[]).filter((capability) =>
    Boolean(preferredFrostElementId(elementIds, capability))
  );
}

async function fetchFrostPages(
  initialUrl: string,
  authHeader: string,
  timeoutMs: number
): Promise<FrostPageResult> {
  const allowedOrigin = new URL(WEATHER_CONFIG.frost.baseUrl).origin;
  const visited = new Set<string>();
  const data: unknown[] = [];
  let nextUrl: string | null = initialUrl;
  for (let page = 0; nextUrl && page < 20; page++) {
    const parsedUrl: URL = new URL(String(nextUrl), initialUrl);
    if (parsedUrl.origin !== allowedOrigin || visited.has(parsedUrl.href)) {
      return { status: 502, data, complete: false };
    }
    visited.add(parsedUrl.href);
    const res = await fetch(parsedUrl.href, {
      headers: {
        Authorization: authHeader,
        'User-Agent': WEATHER_CONFIG.defaultUserAgent,
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return { status: res.status, data, complete: false };
    const json: unknown = await res.json();
    if (!isRecord(json) || !Array.isArray(json.data)) {
      return { status: 502, data, complete: false };
    }
    data.push(...json.data);
    const nextLink = typeof json.nextLink === 'string' && json.nextLink.trim() ? json.nextLink : null;
    nextUrl = nextLink ? new URL(nextLink, parsedUrl).href : null;
    if (!nextUrl) return { status: 200, data, complete: true };
  }
  return { status: 200, data, complete: nextUrl === null };
}

export class FrostService {
  /**
   * Retrieves configured Frost Client ID from environment or app settings
   */
  static getFrostClientId(): string | undefined {
    const db = getDb();
    const storedSetting = db.getSetting('frost_client_id');
    if (storedSetting && storedSetting.trim() !== '') {
      return storedSetting.trim();
    }
    const envKey = process.env.FROST_CLIENT_ID;
    if (envKey && envKey.trim() !== '') {
      return envKey.trim();
    }
    return undefined;
  }

  /**
   * Saves Frost Client ID
   */
  static setFrostClientId(clientId: string): void {
    const db = getDb();
    db.setSetting('frost_client_id', clientId.trim());
  }

  /**
   * Validates whether a Frost Client ID is accepted by frost.met.no
   */
  static async validateFrostClientId(clientId: string): Promise<{ valid: boolean; message: string }> {
    if (!clientId || clientId.trim() === '') {
      return { valid: false, message: 'Ingen Client ID oppgitt' };
    }
    const authHeader = `Basic ${Buffer.from(`${clientId.trim()}:`).toString('base64')}`;
    const url = `${WEATHER_CONFIG.frost.sourcesEndpoint}?geometry=nearest(POINT(10.75%2059.91))&validtime=now&nearestmaxcount=1`;
    try {
      const res = await fetch(url, {
        headers: {
          Authorization: authHeader,
          'User-Agent': WEATHER_CONFIG.defaultUserAgent,
        },
        signal: AbortSignal.timeout(8000),
      });
      if (res.status === 401) {
        return {
          valid: false,
          message: 'Ugyldig eller uautorisert Frost Client ID (401). Opprett en gratis ID på frost.met.no',
        };
      }
      if (!res.ok) {
        return { valid: false, message: `Frost API svarte med status ${res.status}` };
      }
      return { valid: true, message: 'Client ID er gyldig og autorisert hos MET Frost' };
    } catch (err: any) {
      return { valid: false, message: err.message || 'Nettverksfeil ved validering mot Frost API' };
    }
  }

  /**
   * Dynamically discovers nearest active stations and their supported elements from Frost API
   */
  static async discoverActiveStations(location: LocationRecord): Promise<WeatherStation[]> {
    const clientId = this.getFrostClientId();
    if (!clientId) return [];

    const authHeader = `Basic ${Buffer.from(`${clientId}:`).toString('base64')}`;
    const sourceParams = new URLSearchParams({
      geometry: `nearest(POINT(${location.longitude} ${location.latitude}))`,
      validtime: 'now',
      types: 'SensorSystem',
      nearestmaxcount: String(FROST_NEAREST_STATION_COUNT),
    });
    const url = `${WEATHER_CONFIG.frost.sourcesEndpoint}?${sourceParams.toString()}`;

    try {
      const res = await fetch(url, {
        headers: {
          Authorization: authHeader,
          'User-Agent': WEATHER_CONFIG.defaultUserAgent,
        },
        signal: AbortSignal.timeout(12000),
      });

      if (!res.ok) {
        if (res.status === 401) {
          // Graceful fallback without noisy errors
          return [];
        }
        console.warn(`Frost sources lookup notice: ${res.status} ${res.statusText}`);
        return [];
      }

      const json = await res.json();
      const dataItems = json.data || [];
      if (dataItems.length === 0) return [];

      const stationIds = dataItems
        .map((item: unknown) => isRecord(item) && typeof item.id === 'string' ? item.id : '')
        .filter(Boolean);

      // Query available time series to know exact active sensors for each station
      const stationCapabilities = new Map<string, Set<string>>();
      try {
        for (let offset = 0; offset < stationIds.length; offset += FROST_CAPABILITY_BATCH_SIZE) {
          const stationBatch = stationIds.slice(offset, offset + FROST_CAPABILITY_BATCH_SIZE);
          const tsParams = new URLSearchParams({ sources: stationBatch.join(',') });
          const tsUrl = `${WEATHER_CONFIG.frost.baseUrl}/observations/availableTimeSeries/v0.jsonld?${tsParams.toString()}`;
          const tsResult = await fetchFrostPages(tsUrl, authHeader, 15000);

          if (tsResult.status === 401) return [];
          if (tsResult.status !== 200 || !tsResult.complete) {
            console.warn(`Frost capability lookup incomplete for station batch ${offset / FROST_CAPABILITY_BATCH_SIZE + 1}`);
            continue;
          }

          const now = Date.now();
          for (const value of tsResult.data) {
            if (!isRecord(value)) continue;
            const sourceId = typeof value.sourceId === 'string' ? value.sourceId : '';
            const elementId = typeof value.elementId === 'string' ? value.elementId : '';
            const validToMs = typeof value.validTo === 'string' ? Date.parse(value.validTo) : Number.NaN;
            if (sourceId && elementId && (!Number.isFinite(validToMs) || validToMs >= now)) {
              const stId = sourceId.split(':')[0];
              if (!stationCapabilities.has(stId)) stationCapabilities.set(stId, new Set());
              stationCapabilities.get(stId)!.add(elementId);
            }
          }
        }
      } catch {
        // Keep source metadata visible even when capability discovery is unavailable.
      }

      const stations: WeatherStation[] = [];
      const db = getDb();

      for (const rawItem of dataItems) {
        if (!isRecord(rawItem) || typeof rawItem.id !== 'string') continue;
        const item = rawItem;
        const stationId = String(item.id);
        const caps = stationCapabilities.get(stationId) || new Set<string>();
        const elementsSupported = classifyFrostElementIds(caps);

        const geometry = isRecord(item.geometry) ? item.geometry : null;
        const coordinates = geometry && Array.isArray(geometry.coordinates) ? geometry.coordinates : [];
        const stationLatitude = Number(coordinates[1]);
        const stationLongitude = Number(coordinates[0]);
        const safeLatitude = Number.isFinite(stationLatitude) ? stationLatitude : location.latitude;
        const safeLongitude = Number.isFinite(stationLongitude) ? stationLongitude : location.longitude;
        const stationAltitude = Number(item.masl);

        const st: WeatherStation = {
          id: stationId,
          name:
            typeof item.name === 'string' && item.name
              ? item.name
              : typeof item.shortName === 'string' && item.shortName
                ? item.shortName
                : stationId,
          latitude: safeLatitude,
          longitude: safeLongitude,
          altitude: Number.isFinite(stationAltitude) ? stationAltitude : null,
          distance_km: Math.round(
            calculateHaversineDistanceKm(
              location.latitude,
              location.longitude,
              safeLatitude,
              safeLongitude
            ) * 10
          ) / 10,
          elements_supported: elementsSupported,
          frost_element_ids: [...caps],
          source_type: 'FROST',
        };

        stations.push(st);
        db.saveStation(st);
      }

      return stations;
    } catch (err) {
      console.warn('Could not dynamically discover Frost stations:', err);
    }

    return [];
  }

  /**
   * Backfills historical observations for a location (e.g. 30, 90, 365 days)
   */
  static async backfillLocationObservations(
    location: LocationRecord,
    days: number = 365
  ): Promise<{ count: number; source: string; details?: string }> {
    const db = getDb();
    const clientId = this.getFrostClientId();

    let discoveredStations: WeatherStation[] = [];
    if (clientId) {
      discoveredStations = await this.discoverActiveStations(location);
    }

    const recommendations = WeatherStationResolver.resolveStationsForLocation(location);

    const tempStation = recommendations.find((r) => r.element === 'temperature')?.bestStation;
    const windStation = recommendations.find((r) => r.element === 'wind')?.bestStation;
    const rainStation = recommendations.find((r) => r.element === 'precipitation')?.bestStation;
    const pressureStation = recommendations.find((r) => r.element === 'pressure')?.bestStation;
    const humidityStation = recommendations.find((r) => r.element === 'humidity')?.bestStation;
    const snowStation = recommendations.find((r) => r.element === 'snow')?.bestStation;

    if (clientId) {
      try {
        const stationElements = new Map<string, Set<string>>();
        const assign = (station: WeatherStation | null | undefined, element: string) => {
          if (!station) return;
          if (!stationElements.has(station.id)) stationElements.set(station.id, new Set());
          stationElements.get(station.id)!.add(element);
        };
        assign(tempStation, 'temperature');
        assign(rainStation, 'precipitation');
        assign(windStation, 'wind');
        assign(pressureStation, 'pressure');
        assign(humidityStation, 'humidity');
        assign(snowStation, 'snow');
        const stationById = new Map(
          [...recommendations.flatMap((recommendation) => recommendation.availableStations), ...discoveredStations]
            .map((station) => [station.id, station] as const)
        );
        const stationsToQuery = [...stationElements.keys()]
          .map((stationId) => stationById.get(stationId))
          .filter((station): station is WeatherStation & { distance_km: number; score: number } => Boolean(station));

        // Deduplicate stations by ID
        const uniqueStations = Array.from(new Map(stationsToQuery.map((s) => [s.id, s])).values());

        const result = await this.fetchLiveFrostObservationsForStations(
          location,
          uniqueStations,
          days,
          clientId,
          stationElements
        );

        if (result.length > 0) {
          db.saveObservationsBatch(result);
          AggregationService.computeDailySummaries(location.id);
          AggregationService.computeMonthlySummaries(location.id);
          db.flush();

          const stationNames = uniqueStations.map((s) => s.name).slice(0, 3).join(', ');
          return {
            count: result.length,
            source: 'FROST_API_LIVE',
            details: `Hentet ${result.length} timeobservasjoner fra MET Frost API (${stationNames}) for ${days} dager`,
          };
        }
      } catch (err: any) {
        console.warn('Frost API fetch encountered error:', err);
      }
    }

    return {
      count: 0,
      source: clientId ? 'FROST_UNAVAILABLE' : 'FROST_NOT_CONFIGURED',
      details: clientId
        ? 'Frost returnerte ingen gyldige observasjoner. Eksisterende data er beholdt uendret.'
        : 'Frost Client ID mangler. Ingen syntetiske observasjoner ble opprettet.',
    };
  }

  /**
   * Fetches observations from Frost API per-station with station-specific supported elements
   */
  private static async fetchLiveFrostObservationsForStations(
    location: LocationRecord,
    stations: WeatherStation[],
    totalDays: number,
    clientId: string,
    stationElements: Map<string, Set<string>>
  ): Promise<Observation[]> {
    const authHeader = `Basic ${Buffer.from(`${clientId}:`).toString('base64')}`;
    const now = new Date();
    const nowIso = now.toISOString();

    const chunkSizeDays = 90;
    const totalChunks = Math.ceil(totalDays / chunkSizeDays);

    // Timestamp (ISO) -> Partial Observation
    const timeMap = new Map<string, Partial<Observation>>();

    for (const st of stations) {
      // Determine exact elements to query for this specific station
      const elementsToFetch: string[] = [];
      const supported = new Set(st.elements_supported || []);
      const exactFrostElements = st.frost_element_ids?.length
        ? st.frost_element_ids
        : [...supported].flatMap((capability) =>
            capability in FROST_ELEMENT_PREFERENCES
              ? [FROST_ELEMENT_PREFERENCES[capability as FrostCapability][0]]
              : []
          );
      const assigned = stationElements.get(st.id) || new Set<string>();

      const addPreferred = (assignedElement: string, capability: FrostCapability) => {
        if (!assigned.has(assignedElement) || !supported.has(capability)) return;
        const exact = preferredFrostElementId(exactFrostElements, capability);
        if (exact) elementsToFetch.push(exact);
      };
      addPreferred('temperature', 'air_temperature');
      addPreferred('humidity', 'relative_humidity');
      addPreferred('precipitation', 'precipitation_amount');
      addPreferred('wind', 'wind_speed');
      addPreferred('wind', 'wind_speed_of_gust');
      addPreferred('wind', 'wind_from_direction');
      addPreferred('pressure', 'air_pressure_at_sea_level');
      addPreferred('snow', 'surface_snow_thickness');

      if (elementsToFetch.length === 0) continue;

      for (let c = 0; c < totalChunks; c++) {
        const chunkEnd = new Date(now.getTime() - c * chunkSizeDays * 24 * 60 * 60 * 1000);
        const chunkStart = new Date(
          Math.max(
            now.getTime() - totalDays * 24 * 60 * 60 * 1000,
            chunkEnd.getTime() - chunkSizeDays * 24 * 60 * 60 * 1000
          )
        );

        // Include full current day for the latest chunk by extending end date +1 day
        const effectiveEnd = c === 0 ? new Date(chunkEnd.getTime() + 24 * 60 * 60 * 1000) : chunkEnd;
        const timeRange = `${chunkStart.toISOString().split('T')[0]}/${effectiveEnd.toISOString().split('T')[0]}`;
        const params = new URLSearchParams({
          sources: st.id,
          referencetime: timeRange,
          elements: elementsToFetch.join(','),
          timeoffsets: 'default',
          levels: 'default',
          qualities: '0,1,2,3,4',
        });
        const url = `${WEATHER_CONFIG.frost.observationsEndpoint}?${params.toString()}`;

        try {
          const result = await fetchFrostPages(url, authHeader, 15000);

          if (result.status === 200) {
            const dataItems = result.data;

            for (const item of dataItems) {
              if (!isRecord(item)) continue;
              const observedAt = item.referenceTime;
              if (typeof observedAt !== 'string' || !Number.isFinite(new Date(observedAt).getTime())) continue;
              if (!timeMap.has(observedAt)) {
                timeMap.set(observedAt, {
                  id: `obs_${location.id}_${observedAt}`,
                  location_id: location.id,
                  station_id: st.id,
                  observed_at: observedAt,
                  air_temperature: null,
                  relative_humidity: null,
                  air_pressure: null,
                  precipitation_amount: null,
                  wind_speed: null,
                  wind_gust: null,
                  wind_direction: null,
                  snow_depth: null,
                  source: `FROST_${st.id}`,
                  quality_code: null,
                  retrieved_at: nowIso,
                  element_sources: {},
                });
              }

              const current = timeMap.get(observedAt)!;

              const itemObservations = Array.isArray(item.observations) ? item.observations : [];
              for (const obs of itemObservations) {
                if (hasAcceptableQuality(obs) && typeof obs.value === 'number' && Number.isFinite(obs.value)) {
                  const elementId = typeof obs.elementId === 'string' ? obs.elementId : '';
                  if (obs.qualityCode !== undefined && obs.qualityCode !== null) {
                    current.quality_code = String(obs.qualityCode);
                  }
                  if (classifyFrostElementIds([elementId]).includes('air_temperature') && current.air_temperature === null) {
                    current.air_temperature = obs.value;
                    current.element_sources!.air_temperature = st.id;
                  }
                  if (classifyFrostElementIds([elementId]).includes('relative_humidity') && current.relative_humidity === null) {
                    current.relative_humidity = obs.value;
                    current.element_sources!.relative_humidity = st.id;
                  }
                  if (
                    classifyFrostElementIds([elementId]).includes('air_pressure_at_sea_level') &&
                    current.air_pressure === null
                  ) {
                    current.air_pressure = obs.value;
                    current.element_sources!.air_pressure = st.id;
                  }
                  if (
                    classifyFrostElementIds([elementId]).includes('precipitation_amount') &&
                    current.precipitation_amount === null
                  ) {
                    // Precipitation is physically strictly non-negative (clamp sensor noise/tare errors)
                    current.precipitation_amount = Math.max(0, obs.value);
                    current.element_sources!.precipitation_amount = st.id;
                  }
                  if (classifyFrostElementIds([elementId]).includes('wind_speed') && current.wind_speed === null) {
                    current.wind_speed = obs.value;
                    current.element_sources!.wind_speed = st.id;
                  }
                  if (
                    classifyFrostElementIds([elementId]).includes('wind_speed_of_gust') &&
                    current.wind_gust === null
                  ) {
                    current.wind_gust = obs.value;
                    current.element_sources!.wind_gust = st.id;
                  }
                  if (elementId === 'wind_from_direction' && current.wind_direction === null) {
                    current.wind_direction = obs.value;
                    current.element_sources!.wind_direction = st.id;
                  }
                  if (elementId === 'surface_snow_thickness' && current.snow_depth === null) {
                    current.snow_depth = Math.max(0, obs.value);
                    current.element_sources!.snow_depth = st.id;
                  }
                }
              }
            }
          } else if (result.status === 401) {
            // Unauthenticated Frost API key, stop further calls and fallback
            return [];
          } else if (result.status === 412) {
            // Try fetching single elements if a combined element list had one unsupported parameter
            await this.fetchIndividualElementsFallback(
              location,
              st.id,
              elementsToFetch,
              timeRange,
              authHeader,
              timeMap,
              nowIso
            );
          }
        } catch {
          // Graceful handling of network timeouts/chunks
        }
      }
    }

    const mergedList: Observation[] = Array.from(timeMap.values()).map((o) => ({
      id: o.id!,
      location_id: o.location_id!,
      station_id: o.station_id || stations[0]?.id || 'SN62295',
      observed_at: o.observed_at!,
      air_temperature: o.air_temperature ?? null,
      relative_humidity: o.relative_humidity ?? null,
      air_pressure: o.air_pressure ?? null,
      precipitation_amount: o.precipitation_amount ?? null,
      wind_speed: o.wind_speed ?? null,
      wind_gust: o.wind_gust ?? null,
      wind_direction: o.wind_direction ?? null,
      snow_depth: o.snow_depth ?? null,
      source: o.source || 'FROST',
      quality_code: o.quality_code ?? null,
      retrieved_at: nowIso,
      element_sources: o.element_sources || {},
    }));

    return mergedList.sort((a, b) => a.observed_at.localeCompare(b.observed_at));
  }

  /**
   * Fallback to query element-by-element when multi-element queries return 412
   */
  private static async fetchIndividualElementsFallback(
    location: LocationRecord,
    stationId: string,
    elements: string[],
    timeRange: string,
    authHeader: string,
    timeMap: Map<string, Partial<Observation>>,
    nowIso: string
  ): Promise<void> {
    for (const elem of elements) {
      try {
        const params = new URLSearchParams({
          sources: stationId,
          referencetime: timeRange,
          elements: elem,
          timeoffsets: 'default',
          levels: 'default',
          qualities: '0,1,2,3,4',
        });
        const url = `${WEATHER_CONFIG.frost.observationsEndpoint}?${params.toString()}`;
        const result = await fetchFrostPages(url, authHeader, 8000);

        if (result.status === 200) {
          for (const item of result.data) {
            if (!isRecord(item) || typeof item.referenceTime !== 'string') continue;
            const observedAt = item.referenceTime;
            if (!Number.isFinite(Date.parse(observedAt))) continue;
            if (!timeMap.has(observedAt)) {
              timeMap.set(observedAt, {
                id: `obs_${location.id}_${observedAt}`,
                location_id: location.id,
                station_id: stationId,
                observed_at: observedAt,
                air_temperature: null,
                relative_humidity: null,
                air_pressure: null,
                precipitation_amount: null,
                wind_speed: null,
                wind_gust: null,
                wind_direction: null,
                snow_depth: null,
                source: `FROST_${stationId}`,
                quality_code: null,
                retrieved_at: nowIso,
                element_sources: {},
              });
            }
            const current = timeMap.get(observedAt)!;
            const itemObservations = Array.isArray(item.observations) ? item.observations : [];
            for (const obs of itemObservations) {
              if (hasAcceptableQuality(obs) && typeof obs.value === 'number' && Number.isFinite(obs.value)) {
                const elementId = typeof obs.elementId === 'string' ? obs.elementId : '';
                if (obs.qualityCode !== undefined && obs.qualityCode !== null) {
                  current.quality_code = String(obs.qualityCode);
                }
                if (classifyFrostElementIds([elementId]).includes('air_temperature')) {
                  current.air_temperature = obs.value;
                  current.element_sources!.air_temperature = stationId;
                }
                if (classifyFrostElementIds([elementId]).includes('relative_humidity')) {
                  current.relative_humidity = obs.value;
                  current.element_sources!.relative_humidity = stationId;
                }
                if (classifyFrostElementIds([elementId]).includes('precipitation_amount')) {
                  current.precipitation_amount = Math.max(0, obs.value);
                  current.element_sources!.precipitation_amount = stationId;
                }
                if (classifyFrostElementIds([elementId]).includes('wind_speed')) {
                  current.wind_speed = obs.value;
                  current.element_sources!.wind_speed = stationId;
                }
                if (classifyFrostElementIds([elementId]).includes('wind_speed_of_gust')) {
                  current.wind_gust = obs.value;
                  current.element_sources!.wind_gust = stationId;
                }
                if (elementId === 'wind_from_direction') {
                  current.wind_direction = obs.value;
                  current.element_sources!.wind_direction = stationId;
                }
                if (classifyFrostElementIds([elementId]).includes('air_pressure_at_sea_level')) {
                  current.air_pressure = obs.value;
                  current.element_sources!.air_pressure = stationId;
                }
                if (elementId === 'surface_snow_thickness') {
                  current.snow_depth = Math.max(0, obs.value);
                  current.element_sources!.snow_depth = stationId;
                }
              }
            }
          }
        }
      } catch {
        // Ignore single element failure
      }
    }
  }

}
