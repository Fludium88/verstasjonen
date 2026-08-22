import { describe, it, expect } from 'vitest';
import { WeatherStationResolver } from '../src/services/station-resolver/stationResolver';
import { ForecastVerificationService } from '../src/services/forecast-verification/forecastVerificationService';
import { getDb } from '../src/lib/db';

describe('WeatherStationResolver & Multi-source evaluation', () => {
  it('resolves optimal stations per element for Aukra location', () => {
    const db = getDb();
    const aukraLoc = {
      id: 'loc_aukra_test',
      name: 'Aukra Test',
      latitude: 62.7905,
      longitude: 6.9208,
      altitude: 18,
      timezone: 'Europe/Oslo',
      is_active: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    db.saveLocation(aukraLoc);
    db.saveStation({
      id: 'SN59500',
      name: 'Eksplisitt teststasjon',
      latitude: 62.79,
      longitude: 6.92,
      altitude: 18,
      elements_supported: [
        'air_temperature',
        'precipitation_amount',
        'wind_speed',
        'wind_speed_of_gust',
        'wind_from_direction',
        'relative_humidity',
        'air_pressure_at_sea_level',
        'surface_snow_thickness',
      ],
      source_type: 'FROST',
    });
    for (const element of ['temperature', 'precipitation', 'wind', 'pressure', 'humidity', 'snow'] as const) {
      db.setStationMapping({
        location_id: aukraLoc.id,
        element,
        station_id: 'SN59500',
      });
    }

    const recommendations = WeatherStationResolver.resolveStationsForLocation(aukraLoc);
    expect(recommendations.length).toBeGreaterThanOrEqual(5);

    const tempRec = recommendations.find((r) => r.element === 'temperature');
    const windRec = recommendations.find((r) => r.element === 'wind');

    expect(tempRec).toBeDefined();
    expect(tempRec?.bestStation).toBeDefined();

    expect(windRec).toBeDefined();
    // Regional wind stations around Aukra (Aukra SN59500, Nyhamna SN62520, Ona II, Molde, etc.)
    expect(windRec?.bestStation).not.toBeNull();
    expect(['SN59500', 'SN62520', 'SN59700', 'SN59800', 'SN62290', 'SN62270', 'SN62480', 'SN62295']).toContain(windRec?.bestStation?.id);
  });
});

describe('ForecastVerificationService & MAE metrics', () => {
  it('evaluates MAE metrics across multiple lead times', () => {
    const db = getDb();
    const locId = 'loc_test_verif';

    db.saveLocation({
      id: locId,
      name: 'Verif Location',
      latitude: 62.79,
      longitude: 6.92,
      altitude: 18,
      timezone: 'Europe/Oslo',
      is_active: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const accuracy = ForecastVerificationService.evaluateAccuracy(locId, [1, 6, 12, 24, 48]);
    expect(accuracy.metrics.length).toBe(5);

    const m24 = accuracy.metrics.find((m) => m.lead_time_hours === 24);
    expect(m24).toBeDefined();
    expect(m24?.temp_mae).toBeNull();
    expect(m24?.wind_mae).toBeNull();
    expect(m24?.data_points).toBe(0);
    expect(accuracy.availability.retained_forecast_runs).toBe(0);
  });
});
