'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSafeLocalReturnPath } from '@/lib/accessPolicy';

export default function AccessPage() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [nextPath, setNextPath] = useState('/');
  const [configurationMissing, setConfigurationMissing] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [checkingAccess, setCheckingAccess] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams(window.location.search);
    const requestedNext = params.get('next') || '/';
    const safeNextPath = getSafeLocalReturnPath(requestedNext, window.location.origin);
    setNextPath(safeNextPath);
    setConfigurationMissing(params.get('reason') === 'configuration');

    void fetch('/api/auth', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => (response.ok ? response.json() : null))
      .then((status) => {
        if (!status || controller.signal.aborted) return;
        if (status.misconfigured === true) {
          setConfigurationMissing(true);
          return;
        }
        if (status.accessRequired !== true) {
          router.replace(safeNextPath);
        }
      })
      .catch((fetchError) => {
        if (!(fetchError instanceof DOMException && fetchError.name === 'AbortError')) {
          setError('Kunne ikke kontrollere tilgangsoppsettet. Prøv igjen.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setCheckingAccess(false);
      });

    return () => controller.abort();
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(result.error || 'Tilgang ble avvist');
        return;
      }
      window.location.assign(nextPath);
    } catch {
      setError('Kunne ikke kontakte appen. Prøv igjen.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-10 bg-[#070b16] text-slate-100">
      <section
        aria-labelledby="access-title"
        className="w-full max-w-md rounded-2xl border border-slate-700/80 bg-slate-900/90 p-6 shadow-2xl"
      >
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-sky-400">
          Værstasjonen
        </p>
        <h1 id="access-title" className="text-2xl font-bold">
          Personlig tilgang
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-300">
          Skriv inn tilgangsnøkkelen for denne private testinstallasjonen.
        </p>

        {configurationMissing && (
          <p role="alert" className="mt-4 rounded-lg border border-amber-700/60 bg-amber-950/50 p-3 text-sm text-amber-200">
            Deployen mangler en sikker <code>APP_ACCESS_TOKEN</code> på minst 16 tegn.
          </p>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="access-token" className="mb-1.5 block text-sm font-medium text-slate-200">
              Tilgangsnøkkel
            </label>
            <input
              id="access-token"
              name="access-token"
              type="password"
              autoComplete="current-password"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              required
              minLength={16}
              className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-3 text-base outline-none ring-sky-500 transition focus:ring-2"
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-rose-300">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={checkingAccess || submitting || token.length < 16 || configurationMissing}
            className="w-full rounded-lg bg-sky-600 px-4 py-3 font-semibold text-white transition hover:bg-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {checkingAccess ? 'Kontrollerer tilgang…' : submitting ? 'Kontrollerer…' : 'Åpne appen'}
          </button>
        </form>
      </section>
    </main>
  );
}
