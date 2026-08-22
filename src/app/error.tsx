'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Uventet applikasjonsfeil', error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white p-4">
      <div className="text-center max-w-md">
        <h1 className="text-2xl font-bold mb-2">Noe gikk galt</h1>
        <p className="text-slate-400 text-sm mb-4">
          En uventet feil oppstod. Prøv på nytt; ingen lagrede data blir slettet.
        </p>
        <button
          type="button"
          onClick={() => reset()}
          className="min-h-11 px-4 py-2 bg-sky-600 hover:bg-sky-500 rounded-xl text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-sky-400"
        >
          Prøv igjen
        </button>
      </div>
    </div>
  );
}
