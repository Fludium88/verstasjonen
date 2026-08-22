import { describe, expect, it } from 'vitest';
import { bin24HoursObservations } from '@/lib/weatherUtils';

describe('history gap handling', () => {
  it('keeps empty hours unknown even when current/model fallback arguments are supplied', () => {
    const buckets = bin24HoursObservations(
      [],
      new Date('2026-08-22T12:30:00Z'),
      20,
      1013,
      80,
      [{ valid_at: '2026-08-22T12:00:00Z', temperature: 20 }]
    );
    expect(buckets).toHaveLength(24);
    expect(buckets.every((bucket) => bucket.source_type === 'UKJENT')).toBe(true);
    expect(buckets.every((bucket) => bucket.temperature === null)).toBe(true);
    expect(buckets.every((bucket) => bucket.precipitation === null)).toBe(true);
    expect(buckets.every((bucket) => bucket.wind_speed === null)).toBe(true);
  });
});
