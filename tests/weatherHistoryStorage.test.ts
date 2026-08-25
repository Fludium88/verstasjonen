import { describe, expect, it } from 'vitest';
import { isWeatherHistoryCacheFresh } from '../src/lib/weatherHistoryStorage';

describe('weather history browser cache freshness', () => {
  const now = Date.parse('2026-08-25T12:00:00.000Z');

  it('keeps a preloaded three-month payload for six hours', () => {
    expect(isWeatherHistoryCacheFresh('2026-08-25T07:00:00.000Z', '3m', now)).toBe(true);
    expect(isWeatherHistoryCacheFresh('2026-08-25T05:00:00.000Z', '3m', now)).toBe(false);
  });

  it('refreshes the current-day view more frequently', () => {
    expect(isWeatherHistoryCacheFresh('2026-08-25T11:50:00.000Z', '24h', now)).toBe(true);
    expect(isWeatherHistoryCacheFresh('2026-08-25T11:40:00.000Z', '24h', now)).toBe(false);
  });
});
