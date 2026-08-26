import { NextRequest, NextResponse } from 'next/server';
import { WEATHER_CONFIG } from '@/lib/weatherConfig';
import {
  checkRateLimit,
  createRateLimitExceededResponse,
  getAnonymizedClientIp,
  sanitizeString,
  validateCoordinates,
} from '@/lib/security';

export const dynamic = 'force-dynamic';

const POPULAR_LOCATIONS = [
  { name: 'Aukra', lat: 62.7905, lon: 6.9208, alt: null, address: 'Aukra kommune, Møre og Romsdal' },
  { name: 'Molde', lat: 62.7375, lon: 7.1591, alt: null, address: 'Molde kommune, Møre og Romsdal' },
  { name: 'Ålesund', lat: 62.4722, lon: 6.1549, alt: null, address: 'Ålesund kommune, Møre og Romsdal' },
  { name: 'Kristiansund', lat: 63.1105, lon: 7.7279, alt: null, address: 'Kristiansund, Møre og Romsdal' },
  { name: 'Oslo', lat: 59.9139, lon: 10.7522, alt: null, address: 'Oslo' },
  { name: 'Bergen', lat: 60.3913, lon: 5.3221, alt: null, address: 'Bergen, Vestland' },
  { name: 'Trondheim', lat: 63.4305, lon: 10.3951, alt: null, address: 'Trondheim, Trøndelag' },
  { name: 'Stavanger', lat: 58.9700, lon: 5.7331, alt: null, address: 'Stavanger, Rogaland' },
  { name: 'Tromsø', lat: 69.6492, lon: 18.9553, alt: null, address: 'Tromsø, Troms' },
  { name: 'Bodø', lat: 67.2804, lon: 14.4049, alt: null, address: 'Bodø, Nordland' },
  { name: 'Kristiansand', lat: 58.1467, lon: 7.9956, alt: null, address: 'Kristiansand, Agder' },
  { name: 'Trysil', lat: 61.3142, lon: 12.2636, alt: null, address: 'Trysil, Innlandet' },
  { name: 'Hemsedal', lat: 60.8617, lon: 8.5528, alt: null, address: 'Hemsedal, Buskerud' },
  { name: 'Geilo', lat: 60.5336, lon: 8.2057, alt: null, address: 'Hol, Buskerud' },
  { name: 'Svolvær (Lofoten)', lat: 68.2343, lon: 14.5682, alt: null, address: 'Vågan, Nordland' },
];

function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
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
  return R * c;
}

export async function GET(req: NextRequest) {
  const clientIp = getAnonymizedClientIp(req);
  const rate = checkRateLimit(`geocoding_${clientIp}`, 20, 60000);
  if (!rate.success) {
    return createRateLimitExceededResponse(rate.reset);
  }

  const { searchParams } = new URL(req.url);
  const rawQ = searchParams.get('q');
  const q = rawQ ? sanitizeString(rawQ, 100) : '';
  const latStr = searchParams.get('lat');
  const lonStr = searchParams.get('lon');

  // 1. Reverse Geocoding (if lat & lon provided)
  if (latStr && lonStr) {
    const coordCheck = validateCoordinates(latStr, lonStr);
    if (!coordCheck.valid) {
      return NextResponse.json({ error: coordCheck.error }, { status: 400 });
    }

    const lat = coordCheck.latitude!;
    const lon = coordCheck.longitude!;

    try {
      const reverseUrl = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&addressdetails=1&zoom=14`;
      const res = await fetch(reverseUrl, {
        headers: {
          'User-Agent': WEATHER_CONFIG.geocodingUserAgent,
          'Accept-Language': 'nb-NO,no,en',
        },
        signal: AbortSignal.timeout(4000),
      });

      if (res.ok) {
        const data = await res.json();
        if (data && data.address) {
          const addr = data.address;
          const primaryName =
            addr.suburb ||
            addr.village ||
            addr.town ||
            addr.city ||
            addr.municipality ||
            addr.county ||
            data.name ||
            'Min posisjon';

          const districtOrCounty = addr.municipality || addr.county || '';
          const fullName = districtOrCounty && districtOrCounty !== primaryName
            ? `${primaryName}, ${districtOrCounty}`
            : primaryName;

          return NextResponse.json({
            name: primaryName,
            fullName,
            lat,
            lon,
            alt: null,
            address: data.display_name || `${lat.toFixed(4)}°N, ${lon.toFixed(4)}°Ø`,
            isGpsResolved: true,
          });
        }
      }
    } catch (err) {
      console.warn('Nominatim reverse geocoding failed/timeout:', err);
    }

    // Fallback: find closest popular location or format nicely
    let closest = POPULAR_LOCATIONS[0];
    let minDistance = calculateDistanceKm(lat, lon, closest.lat, closest.lon);

    for (const loc of POPULAR_LOCATIONS) {
      const d = calculateDistanceKm(lat, lon, loc.lat, loc.lon);
      if (d < minDistance) {
        minDistance = d;
        closest = loc;
      }
    }

    const placeName = minDistance < 15 ? closest.name : `Posisjon (${lat.toFixed(2)}°N, ${lon.toFixed(2)}°Ø)`;
    return NextResponse.json({
      name: placeName,
      fullName: minDistance < 15 ? `Nær ${closest.name}` : placeName,
      lat,
      lon,
      alt: null,
      address: `GPS-koordinater: ${lat.toFixed(4)}°N, ${lon.toFixed(4)}°Ø`,
      isGpsResolved: true,
    });
  }

  // 2. Default popular locations if no query
  if (!q) {
    return NextResponse.json(POPULAR_LOCATIONS);
  }

  // 3. Search query: Check local list first
  const localMatches = POPULAR_LOCATIONS.filter(
    (loc) =>
      loc.name.toLowerCase().includes(q.toLowerCase()) ||
      loc.address.toLowerCase().includes(q.toLowerCase())
  );

  // 4. Search Kartverket's official national place-name registry.
  // Reverse geocoding above remains an explicit, low-frequency GPS action.
  try {
    const params = new URLSearchParams({
      sok: `${q}*`,
      treffPerSide: '8',
      side: '1',
    });
    const url = `https://api.kartverket.no/stedsnavn/v1/sted?${params.toString()}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(3500),
    });

    if (res.ok) {
      const externalPayload: unknown = await res.json();
      const externalRecord =
        externalPayload && typeof externalPayload === 'object' && !Array.isArray(externalPayload)
          ? (externalPayload as Record<string, unknown>)
          : {};
      const externalData = Array.isArray(externalRecord.navn)
        ? externalRecord.navn
        : [];
      const mapped = externalData.flatMap((rawItem) => {
        if (!rawItem || typeof rawItem !== 'object' || Array.isArray(rawItem)) return [];
        const item = rawItem as Record<string, unknown>;
        const point =
          item.representasjonspunkt && typeof item.representasjonspunkt === 'object'
            ? (item.representasjonspunkt as Record<string, unknown>)
            : {};
        const coordinateCheck = validateCoordinates(point.nord, point['øst']);
        if (!coordinateCheck.valid) return [];

        const text = (value: unknown): string =>
          typeof value === 'string' ? sanitizeString(value, 120) : '';
        const names = Array.isArray(item.stedsnavn) ? item.stedsnavn : [];
        const preferredName = names.find((candidate) => {
          if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return false;
          const record = candidate as Record<string, unknown>;
          return record.skrivemåtestatus === 'godkjent og prioritert';
        }) || names[0];
        const shortName = preferredName && typeof preferredName === 'object'
          ? text((preferredName as Record<string, unknown>)['skrivemåte'])
          : '';
        if (!shortName) return [];
        const municipalities = Array.isArray(item.kommuner) ? item.kommuner : [];
        const counties = Array.isArray(item.fylker) ? item.fylker : [];
        const firstMunicipality = municipalities[0] && typeof municipalities[0] === 'object'
          ? text((municipalities[0] as Record<string, unknown>).kommunenavn)
          : '';
        const firstCounty = counties[0] && typeof counties[0] === 'object'
          ? text((counties[0] as Record<string, unknown>).fylkesnavn)
          : '';
        const addressParts = [
          firstMunicipality,
          firstCounty,
        ].filter((part, index, parts) =>
          Boolean(part) &&
          part.toLocaleLowerCase('nb-NO') !== shortName.toLocaleLowerCase('nb-NO') &&
          parts.indexOf(part) === index
        );
        const fullName = [shortName, ...addressParts].join(', ');

        return [{
          name: shortName,
          fullName,
          lat: coordinateCheck.latitude!,
          lon: coordinateCheck.longitude!,
          alt: null,
          address: fullName,
          geocoding_source: 'Kartverket SSR',
        }];
      });

      // Merge results avoiding duplicate names
      const seen = new Set<string>();
      const combined = [...localMatches, ...mapped].filter((item) => {
        const key = `${item.name.toLowerCase()}_${item.lat.toFixed(2)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      return NextResponse.json(combined.slice(0, 10));
    }
  } catch (err) {
    console.warn('Geocoding search API failed/timed out, using local fallback:', err);
  }

  return NextResponse.json(localMatches);
}
