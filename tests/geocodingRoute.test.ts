import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/geocoding/route';

afterEach(() => vi.restoreAllMocks());

describe('deploy-friendly location search', () => {
  it('maps Norwegian Open-Meteo geocoding results without requiring a browser API key', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [
            {
              name: 'Volda',
              latitude: 62.1468,
              longitude: 6.0741,
              country_code: 'NO',
              country: 'Norge',
              admin1: 'Møre og Romsdal',
              admin2: 'Volda',
            },
          ],
        }),
        { status: 200 }
      )
    );

    const response = await GET(
      new NextRequest('https://weather.example/api/geocoding?q=Volda', {
        headers: { 'x-forwarded-for': '192.0.2.201' },
      })
    );
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(String(fetchMock.mock.calls[0][0])).toContain('geocoding-api.open-meteo.com');
    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Volda',
          lat: 62.1468,
          lon: 6.0741,
          geocoding_source: 'Open-Meteo / GeoNames',
        }),
      ])
    );
  });
});
