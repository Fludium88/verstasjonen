import { afterEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '@/lib/db';
import { MetForecastService } from '@/services/met/metForecastService';

afterEach(() => vi.restoreAllMocks());

describe('MET forecast provenance', () => {
  it('stores forecasts separately, preserves zero precipitation, and omits unknown altitude', async () => {
    const db = getDb();
    const locationId = 'loc_met_provenance';
    db.saveLocation({
      id: locationId,
      name: 'Test',
      latitude: 62.1,
      longitude: 7.1,
      altitude: null,
      timezone: 'Europe/Oslo',
      is_active: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          properties: {
            meta: { updated_at: '2026-08-22T10:00:00Z' },
            timeseries: [
              {
                time: '2026-08-22T11:00:00Z',
                data: {
                  instant: {
                    details: {
                      air_temperature: 12,
                      wind_speed: 4,
                      relative_humidity: 75,
                      air_pressure_at_sea_level: 1012,
                    },
                  },
                  next_1_hours: {
                    summary: { symbol_code: 'clearsky_day' },
                    details: { precipitation_amount: 0 },
                  },
                },
              },
            ],
          },
        }),
        { status: 200, headers: { etag: 'test-etag' } }
      )
    );

    const result = await MetForecastService.fetchAndLogForecast(locationId, 62.1, 7.1, null);
    expect(result.values[0].precipitation).toBe(0);
    expect(result.values[0].precipitation_period_hours).toBe(1);
    expect(db.getObservations(locationId)).toHaveLength(0);
    expect(result.run.altitude).toBeUndefined();
    expect(String(fetchMock.mock.calls[0][0])).not.toContain('altitude=');
  });

  it('uses the Nowcast one-hour amount instead of treating instantaneous rate as a total', async () => {
    const validAt = new Date().toISOString();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          properties: {
            timeseries: [
              {
                time: validAt,
                data: {
                  instant: { details: { precipitation_rate: 99 } },
                  next_1_hours: {
                    summary: { symbol_code: 'rain' },
                    details: { precipitation_amount: 0.4 },
                  },
                },
              },
            ],
          },
        }),
        { status: 200 }
      )
    );

    const result = await MetForecastService.fetchNowcast(62.1, 7.1, null);
    expect(result.available).toBe(true);
    expect(result.precipitationAmount1h).toBe(0.4);
    expect(result.symbol).toBe('rain');
  });
});
