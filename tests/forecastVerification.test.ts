import { describe, expect, it } from 'vitest';
import { calculateForecastVerification } from '@/services/forecast-verification/forecastVerificationService';
import { ForecastRun, ForecastValue, Observation } from '@/types/weather';

const run: ForecastRun = {
  id: 'run-24h',
  location_id: 'loc',
  source: 'MET_LOCATIONFORECAST_2_0',
  retrieved_at: '2026-08-19T00:00:00Z',
  created_at: '2026-08-19T00:00:00Z',
};

const forecast: ForecastValue = {
  id: 'forecast',
  forecast_run_id: run.id,
  valid_at: '2026-08-20T00:00:00Z',
  lead_time_hours: 24,
  temperature: 10,
  feels_like: 10,
  precipitation: 2,
  precipitation_probability: 50,
  precipitation_period_hours: 1,
  wind_speed: 5,
  wind_gust: 8,
  wind_direction: 180,
  humidity: 80,
  pressure: 1010,
  cloud_fraction: 50,
  symbol_code: 'rain',
  source_type: 'WEATHER_MODEL',
};

function observation(id: string, time: string, source: string, temperature: number, rain: number): Observation {
  return {
    id,
    location_id: 'loc',
    station_id: 'SN1',
    observed_at: time,
    air_temperature: temperature,
    relative_humidity: 80,
    air_pressure: 1010,
    precipitation_amount: rain,
    wind_speed: 7,
    wind_gust: 9,
    wind_direction: 180,
    snow_depth: null,
    source,
    quality_code: '0',
    retrieved_at: time,
  };
}

describe('forecast verification', () => {
  it('matches retained forecasts to real observations and excludes model/synthetic rows', () => {
    const result = calculateForecastVerification(
      [
        observation('synthetic', '2026-08-20T00:00:00Z', 'HISTORICAL_ESTIMATE', 99, 99),
        observation('instant', '2026-08-20T00:20:00Z', 'FROST_SN1', 11, 0),
        observation('rain-end', '2026-08-20T01:00:00Z', 'FROST_SN1', 11, 3),
      ],
      [forecast],
      [run],
      [24],
      new Date('2026-08-20T02:00:00Z')
    );

    expect(result.metrics[0]).toMatchObject({
      temp_mae: 1,
      temp_bias: -1,
      wind_mae: 2,
      precip_mae: 1,
      precip_forecast_sum: 2,
      precip_observed_sum: 3,
      data_points: 1,
    });
    expect(result.recentPairs).toHaveLength(1);
    expect(result.availability.retained_forecast_runs).toBe(1);
  });

  it('returns null metrics instead of statistical-looking fallback values', () => {
    const result = calculateForecastVerification([], [forecast], [run], [24]);
    expect(result.metrics[0]).toMatchObject({
      temp_mae: null,
      temp_bias: null,
      precip_mae: null,
      wind_mae: null,
      data_points: 0,
    });
  });

  it('keeps non-MET runs out of MET accuracy statistics', () => {
    const externalRun: ForecastRun = {
      ...run,
      id: 'run-external',
      source: 'OTHER_PROVIDER',
    };
    const externalForecast: ForecastValue = {
      ...forecast,
      id: 'forecast-external',
      forecast_run_id: externalRun.id,
      temperature: 99,
    };
    const result = calculateForecastVerification(
      [observation('actual', '2026-08-20T00:20:00Z', 'FROST_SN1', 11, 3)],
      [forecast, externalForecast],
      [run, externalRun],
      [24],
      new Date('2026-08-21T00:00:00Z')
    );

    expect(result.metrics[0].temp_mae).toBe(1);
    expect(result.recentPairs).toHaveLength(1);
    expect(result.availability.retained_forecast_runs).toBe(1);
    expect(result.availability.note).toContain('bare MET Locationforecast');
  });
});
