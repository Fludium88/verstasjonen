import { describe, it, expect, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import {
  checkRateLimit,
  validateCoordinates,
  validateCalibrationOffsets,
  validateCsrfOrigin,
  maskSecret,
  sanitizeString,
} from '../src/lib/security';

describe('Cybersecurity & Access Control Tests', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should enforce strict coordinate boundaries', () => {
    // Valid coordinates
    expect(validateCoordinates(59.91, 10.75, 23).valid).toBe(true);
    expect(validateCoordinates('62.7905', '6.9208', '18').valid).toBe(true);

    // Invalid latitudes
    expect(validateCoordinates(95, 10).valid).toBe(false);
    expect(validateCoordinates(-91, 10).valid).toBe(false);
    expect(validateCoordinates('abc', 10).valid).toBe(false);
    expect(validateCoordinates('62.79junk', 10).valid).toBe(false);

    // Invalid longitudes
    expect(validateCoordinates(60, 185).valid).toBe(false);
    expect(validateCoordinates(60, -181).valid).toBe(false);

    // Invalid altitude
    expect(validateCoordinates(60, 10, -600).valid).toBe(false);
    expect(validateCoordinates(60, 10, 10000).valid).toBe(false);
  });

  it('should sanitize input strings against XSS and control characters', () => {
    const malicious = '<script>alert("xss")</script>Oslo\nSentrum';
    const cleaned = sanitizeString(malicious, 50);
    expect(cleaned).not.toContain('<');
    expect(cleaned).not.toContain('>');
    expect(cleaned).not.toContain('\n');
    expect(cleaned).toBe('scriptalert(xss)/scriptOsloSentrum');
  });

  it('should validate and clamp calibration offsets safely', () => {
    const validOffsets = {
      temp_offset: 1.5,
      humidity_offset: -5,
      pressure_offset: 2.1,
      wind_multiplier: 1.1,
      precip_multiplier: 0.95,
    };
    const res = validateCalibrationOffsets(validOffsets);
    expect(res.valid).toBe(true);
    expect(res.cleaned?.temp_offset).toBe(1.5);

    // Out of bounds temperature
    const dangerousTemp = { ...validOffsets, temp_offset: 50 };
    expect(validateCalibrationOffsets(dangerousTemp).valid).toBe(false);

    // Out of bounds wind multiplier
    const dangerousWind = { ...validOffsets, wind_multiplier: 15.0 };
    expect(validateCalibrationOffsets(dangerousWind).valid).toBe(false);
  });

  it('should securely mask API secrets and client keys', () => {
    const rawKey = '13b5ccec-aea0-4179-8d28-84e49f9b7108';
    const masked = maskSecret(rawKey, 4, 4);
    expect(masked.startsWith('13b5')).toBe(true);
    expect(masked.endsWith('7108')).toBe(true);
    expect(masked).toContain('••••');
    expect(masked).not.toBe(rawKey);

    // Empty or short
    expect(maskSecret('')).toBe('');
    expect(maskSecret('abc')).toBe('••••••••••••');
  });

  it('should enforce token-bucket rate limiting', () => {
    const key = `test_ip_${Date.now()}`;
    const limit = 3;

    // 1st request
    const r1 = checkRateLimit(key, limit, 60000);
    expect(r1.success).toBe(true);
    expect(r1.remaining).toBe(2);

    // 2nd request
    const r2 = checkRateLimit(key, limit, 60000);
    expect(r2.success).toBe(true);
    expect(r2.remaining).toBe(1);

    // 3rd request
    const r3 = checkRateLimit(key, limit, 60000);
    expect(r3.success).toBe(true);
    expect(r3.remaining).toBe(0);

    // 4th request (should be blocked)
    const r4 = checkRateLimit(key, limit, 60000);
    expect(r4.success).toBe(false);
    expect(r4.remaining).toBe(0);
  });

  it('rejects foreign and malformed CSRF origins while accepting the exact host', () => {
    const sameOrigin = new NextRequest('https://weather.example/api/settings', {
      method: 'POST',
      headers: {
        host: 'weather.example',
        origin: 'https://weather.example',
        'sec-fetch-site': 'same-origin',
      },
    });
    expect(validateCsrfOrigin(sameOrigin, '/api/settings').valid).toBe(true);

    const cloudRunSameOrigin = new NextRequest('http://internal:8080/api/settings', {
      method: 'POST',
      headers: {
        host: 'weather.example',
        origin: 'https://weather.example',
        'x-forwarded-proto': 'https',
        'sec-fetch-site': 'same-origin',
      },
    });
    expect(validateCsrfOrigin(cloudRunSameOrigin, '/api/settings').valid).toBe(true);

    const foreignOrigin = new NextRequest('https://weather.example/api/settings', {
      method: 'POST',
      headers: {
        host: 'weather.example',
        origin: 'https://evil.example',
        'sec-fetch-site': 'cross-site',
      },
    });
    expect(validateCsrfOrigin(foreignOrigin, '/api/settings').valid).toBe(false);

    const malformedOrigin = new NextRequest('https://weather.example/api/settings', {
      method: 'POST',
      headers: { host: 'weather.example', origin: 'not a URL' },
    });
    expect(validateCsrfOrigin(malformedOrigin, '/api/settings').valid).toBe(false);

    const spoofedForwardedHost = new NextRequest('https://weather.example/api/settings', {
      method: 'POST',
      headers: {
        host: 'weather.example',
        origin: 'https://evil.example',
        'x-forwarded-host': 'evil.example',
      },
    });
    expect(validateCsrfOrigin(spoofedForwardedHost, '/api/settings').valid).toBe(false);

    const wrongScheme = new NextRequest('https://weather.example/api/settings', {
      method: 'POST',
      headers: {
        host: 'weather.example',
        origin: 'http://weather.example',
      },
    });
    expect(validateCsrfOrigin(wrongScheme, '/api/settings').valid).toBe(false);
  });

});
