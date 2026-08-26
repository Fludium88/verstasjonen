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

  it('does not contact MET again before the cached response expires', async () => {
    const db = getDb();
    const locationId = 'loc_met_expires';
    const validAt = new Date(Date.now() + 60 * 60_000).toISOString();
    db.saveLocation({
      id: locationId,
      name: 'Expires test',
      latitude: 59.91,
      longitude: 10.75,
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
            meta: { updated_at: new Date().toISOString() },
            timeseries: [
              {
                time: validAt,
                data: {
                  instant: { details: { air_temperature: 10, wind_speed: 2 } },
                  next_1_hours: {
                    summary: { symbol_code: 'cloudy' },
                    details: { precipitation_amount: 0 },
                  },
                },
              },
            ],
          },
        }),
        {
          status: 200,
          headers: {
            expires: new Date(Date.now() + 30 * 60_000).toUTCString(),
            etag: 'expires-test',
          },
        }
      )
    );

    const first = await MetForecastService.fetchAndLogForecast(locationId, 59.91, 10.75, null);
    const second = await MetForecastService.fetchAndLogForecast(locationId, 59.91, 10.75, null);

    expect(first.fromCache).toBe(false);
    expect(second.fromCache).toBe(true);
    expect(second.isDelayed).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fails without contacting another provider when MET and its cache are unavailable', async () => {
    const db = getDb();
    const locationId = 'loc_met_offline';
    db.saveLocation({
      id: locationId,
      name: 'Fallback test',
      latitude: 60.39,
      longitude: 5.32,
      altitude: 15,
      timezone: 'Europe/Oslo',
      is_active: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('MET offline'));

    await expect(
      MetForecastService.fetchAndLogForecast(locationId, 60.39, 5.32, 15)
    ).rejects.toThrow('MET API offline');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
