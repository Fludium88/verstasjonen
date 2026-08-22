import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../src/app/api/auth/route';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('personal access login route', () => {
  it('sets a secure HttpOnly SameSite cookie after a valid login', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('APP_ACCESS_TOKEN', 'a-strong-personal-token');
    const response = await POST(
      new NextRequest('https://weather.example/api/auth', {
        method: 'POST',
        headers: {
          host: 'weather.example',
          origin: 'https://weather.example',
          'content-type': 'application/json',
          'x-forwarded-for': '192.0.2.123',
        },
        body: JSON.stringify({ token: 'a-strong-personal-token' }),
      })
    );

    expect(response.status).toBe(200);
    const cookie = response.headers.get('set-cookie') || '';
    expect(cookie).toContain('vaerstasjonen_access=');
    expect(cookie.toLowerCase()).toContain('httponly');
    expect(cookie.toLowerCase()).toContain('samesite=lax');
    expect(cookie.toLowerCase()).toContain('secure');
    expect(cookie).not.toContain('a-strong-personal-token');
  });

  it('rejects login requests from a foreign origin', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('APP_ACCESS_TOKEN', 'a-strong-personal-token');
    const response = await POST(
      new NextRequest('https://weather.example/api/auth', {
        method: 'POST',
        headers: {
          host: 'weather.example',
          origin: 'https://evil.example',
          'sec-fetch-site': 'cross-site',
          'content-type': 'application/json',
          'x-forwarded-for': '198.51.100.123',
        },
        body: JSON.stringify({ token: 'a-strong-personal-token' }),
      })
    );
    expect(response.status).toBe(403);
  });
});

