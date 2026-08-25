import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createAccessSessionToken } from '../src/lib/security';
import { proxy } from '../src/proxy';
import { getSafeLocalReturnPath } from '../src/lib/accessPolicy';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('personal deployment access proxy', () => {
  it('allows only normalized same-origin return paths', () => {
    const origin = 'https://weather.example';
    expect(getSafeLocalReturnPath('/?tab=forecast#hourly', origin)).toBe(
      '/?tab=forecast#hourly'
    );
    expect(getSafeLocalReturnPath('//evil.example', origin)).toBe('/');
    expect(getSafeLocalReturnPath('/%5C%5Cevil.example', origin)).toBe('/');
    expect(getSafeLocalReturnPath('/%2F%2Fevil.example', origin)).toBe('/');
    expect(getSafeLocalReturnPath('/safe\\evil', origin)).toBe('/');
  });

  it('keeps AI Studio/remote test deployments open when access is not configured', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('APP_ACCESS_TOKEN', '');
    const response = await proxy(
      new NextRequest('https://weather.example/api/weather/dashboard')
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });

  it('fails closed when a non-empty access token is too short', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('APP_ACCESS_TOKEN', 'short');
    const response = await proxy(
      new NextRequest('https://weather.example/api/weather/dashboard')
    );
    expect(response.status).toBe(503);
  });

  it('redirects unauthenticated pages to the access screen', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('APP_ACCESS_TOKEN', 'a-strong-personal-token');
    const response = await proxy(
      new NextRequest('https://weather.example/?tab=forecast')
    );
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toContain('/access?next=');
  });

  it('accepts the derived HttpOnly-session value', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('APP_ACCESS_TOKEN', 'a-strong-personal-token');
    const session = createAccessSessionToken('a-strong-personal-token');
    const response = await proxy(
      new NextRequest('https://weather.example/api/weather/dashboard', {
        headers: { cookie: `vaerstasjonen_access=${session}` },
      })
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });
});
