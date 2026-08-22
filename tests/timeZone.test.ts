import { describe, expect, it } from 'vitest';
import { getLocalDateKey, getLocalDayBounds } from '@/services/time/timeZone';

describe('location time-zone day boundaries', () => {
  it('uses the location date rather than the UTC date', () => {
    expect(getLocalDateKey('2026-08-21T22:30:00Z', 'Europe/Oslo')).toBe('2026-08-22');
  });

  it('creates a 23-hour day when daylight saving starts', () => {
    const bounds = getLocalDayBounds('2026-03-29', 'Europe/Oslo');
    expect(bounds.startUtc.toISOString()).toBe('2026-03-28T23:00:00.000Z');
    expect(bounds.endUtc.toISOString()).toBe('2026-03-29T22:00:00.000Z');
    expect(bounds.durationMinutes).toBe(23 * 60);
  });

  it('creates a 25-hour day when daylight saving ends', () => {
    const bounds = getLocalDayBounds('2026-10-25', 'Europe/Oslo');
    expect(bounds.startUtc.toISOString()).toBe('2026-10-24T22:00:00.000Z');
    expect(bounds.endUtc.toISOString()).toBe('2026-10-25T23:00:00.000Z');
    expect(bounds.durationMinutes).toBe(25 * 60);
  });
});
