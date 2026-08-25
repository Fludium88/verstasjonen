import { describe, expect, it } from 'vitest';
import packageJson from '../package.json';

describe('Cloud Run deployment contract', () => {
  it('lets Next.js read the injected PORT instead of hardcoding a local port', () => {
    expect(packageJson.scripts.start).toBe('next start');
  });
});
