import { describe, expect, it } from 'vitest';
import {
  classifyFrostElementIds,
  preferredFrostElementId,
} from '../src/services/frost/frostService';

describe('Frost station element discovery', () => {
  it('recognizes active hourly aggregates as usable weather sensors', () => {
    expect(
      classifyFrostElementIds([
        'mean(air_temperature PT1H)',
        'mean(wind_speed PT1H)',
        'mean(relative_humidity PT1H)',
        'mean(air_pressure_at_sea_level PT1H)',
      ])
    ).toEqual([
      'air_temperature',
      'wind_speed',
      'relative_humidity',
      'air_pressure_at_sea_level',
    ]);
  });

  it('prefers hourly precipitation and exact temperature when both are available', () => {
    expect(
      preferredFrostElementId(
        ['sum(precipitation_amount P1D)', 'sum(precipitation_amount PT1H)'],
        'precipitation_amount'
      )
    ).toBe('sum(precipitation_amount PT1H)');
    expect(
      preferredFrostElementId(
        ['mean(air_temperature PT1H)', 'air_temperature'],
        'air_temperature'
      )
    ).toBe('air_temperature');
  });

  it('does not misclassify minimum or maximum temperature series as current temperature', () => {
    expect(classifyFrostElementIds(['min(air_temperature PT1H)', 'max(air_temperature P1D)'])).toEqual([]);
  });
});
