import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/geocoding/route';

afterEach(() => vi.restoreAllMocks());

describe('deploy-friendly location search', () => {
  it('maps official Kartverket place-name results without requiring an API key', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          navn: [
            {
              representasjonspunkt: { nord: 62.1468, øst: 6.0741 },
              stedsnavn: [{ skrivemåte: 'Volda', skrivemåtestatus: 'godkjent og prioritert' }],
              kommuner: [{ kommunenavn: 'Volda' }],
              fylker: [{ fylkesnavn: 'Møre og Romsdal' }],
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
    expect(String(fetchMock.mock.calls[0][0])).toContain('api.kartverket.no/stedsnavn/v1/sted');
    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Volda',
          lat: 62.1468,
          lon: 6.0741,
          geocoding_source: 'Kartverket SSR',
        }),
      ])
    );
  });
});
