import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import packageJson from '../package.json';

describe('Cloud Run deployment contract', () => {
  const nextConfigSource = readFileSync(
    new URL('../next.config.mjs', import.meta.url),
    'utf8'
  );

  it('lets Next.js read the injected PORT instead of hardcoding a local port', () => {
    expect(packageJson.scripts.start).toBe('next start');
  });

  it('produces a self-contained server bundle for Cloud Run', () => {
    expect(nextConfigSource).toContain('output: "standalone"');
  });

  it('allows the app-specific AI Studio preview to load Next.js dev assets', () => {
    expect(nextConfigSource).toContain(
      'ais-dev-wsy5bkvq727uf3do3n5qmd-102152835313.europe-west2.run.app'
    );
  });

  it('does not ship the retired personal access gate', () => {
    const removedPaths = [
      '../src/proxy.ts',
      '../src/app/access/page.tsx',
      '../src/app/api/auth/route.ts',
      '../src/lib/accessPolicy.ts',
    ];

    for (const removedPath of removedPaths) {
      expect(existsSync(new URL(removedPath, import.meta.url))).toBe(false);
    }

    const envExample = readFileSync(
      new URL('../.env.example', import.meta.url),
      'utf8'
    );
    expect(envExample).not.toContain('APP_ACCESS_TOKEN');
  });
});
