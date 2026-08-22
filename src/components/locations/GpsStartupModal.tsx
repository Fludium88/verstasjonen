'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  Navigation,
  ShieldCheck,
  Camera,
  MapPin,
  CheckCircle2,
  AlertTriangle,
  Radio,
  ArrowRight,
} from 'lucide-react';
import {
  getCurrentGpsPosition,
  reverseGeocodeCoords,
  syncGpsLocationToServer,
  setGpsStartupEnabled,
  setGpsPromptShown,
} from '@/lib/locationGps';
import { useAccessibleDialog } from '../common/useAccessibleDialog';

interface GpsStartupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGpsLocationResolved: (locationId: string) => void;
  defaultLocationName?: string;
}

export const GpsStartupModal: React.FC<GpsStartupModalProps> = ({
  isOpen,
  onClose,
  onGpsLocationResolved,
  defaultLocationName = 'valgt standardsted',
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const operationRef = useRef(0);
  const isOpenRef = useRef(isOpen);
  isOpenRef.current = isOpen;
  const dialogRef = useAccessibleDialog<HTMLDivElement>(isOpen, onClose);

  useEffect(() => {
    if (!isOpen) operationRef.current += 1;
  }, [isOpen]);

  if (!isOpen) return null;

  const handleAllowGps = async () => {
    const operationId = ++operationRef.current;
    setIsLoading(true);
    setErrorMessage(null);
    setStatusMessage('Forespør posisjonstilgang fra nettleseren...');

    try {
      // 1. Fetch GPS coordinates (foreground only)
      setStatusMessage('Finner din GPS-posisjon...');
      const coords = await getCurrentGpsPosition(12000);
      if (!isOpenRef.current || operationId !== operationRef.current) return;

      // 2. Reverse geocode coordinates to place name
      setStatusMessage('Henter stedsnavn og nærområde...');
      const geo = await reverseGeocodeCoords(coords.latitude, coords.longitude);
      if (!isOpenRef.current || operationId !== operationRef.current) return;

      // 3. Sync to server database
      setStatusMessage('Lagrer posisjonen og henter tilgjengelige værdata...');
      const loc = await syncGpsLocationToServer(
        { latitude: coords.latitude, longitude: coords.longitude, altitude: coords.altitude },
        geo.name,
        geo.address
      );
      if (!isOpenRef.current || operationId !== operationRef.current) return;

      // 4. Save preferences
      setGpsStartupEnabled(true);
      setGpsPromptShown(true);

      setStatusMessage(`Fantastisk! Værdata konfigurert for ${geo.name}.`);
      onGpsLocationResolved(loc.id);
      onClose();
    } catch (err: any) {
      console.warn('GPS startup failed:', err);
      setErrorMessage(err.message || 'Kunne ikke hente posisjon. Sjekk at posisjonstilgang er tillatt.');
      setIsLoading(false);
      setStatusMessage(null);
    }
  };

  const handleDeclineGps = () => {
    operationRef.current += 1;
    setGpsStartupEnabled(false);
    setGpsPromptShown(true);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="gps-startup-title"
        tabIndex={-1}
        className="bg-slate-900 border border-slate-700/80 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200"
      >
        {/* Header with gradient icon */}
        <div className="relative p-6 pb-4 bg-gradient-to-b from-sky-950/60 to-transparent border-b border-slate-800/80">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-sky-900/50 shrink-0">
              <Navigation className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h2 id="gps-startup-title" className="text-lg font-bold text-white tracking-wide">
                Hent lokale værdata for din posisjon
              </h2>
              <p className="text-xs text-sky-300 font-medium">
                Værstasjonen – Digital telemetri & prognose
              </p>
            </div>
          </div>
        </div>

        {/* Content body */}
        <div className="p-6 space-y-5">
          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
            For å hente oppdaterte værdata, nedbørsvarsel, MET-farevarsler og sol-/månebane for stedet der du befinner deg, ber appen om tilgang til posisjonen din.
          </p>

          {/* Privacy & Foreground-only promise card */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Kun ved aktiv bruk – Strengt personvern</span>
            </div>

            <ul className="space-y-2 text-[11px] sm:text-xs text-slate-400">
              <li className="flex items-start gap-2">
                <MapPin className="w-3.5 h-3.5 text-sky-400 shrink-0 mt-0.5" />
                <span>
                  <strong className="text-slate-200">GPS:</strong> Brukes utelukkende når du aktivt åpner eller bruker appen for å tilpasse værdata. Ingen bakgrunnssporing.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Camera className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                <span>
                  <strong className="text-slate-200">Kamera:</strong> Brukes kun i Augmented Reality (AR)-himmelkuppelen for å vise sol/måne i linsen. Bildestrøm forblir lokalt på enheten og stoppes umiddelbart ved lukking.
                </span>
              </li>
            </ul>
          </div>

          {/* Status / Loading / Error Banner */}
          {isLoading && (
            <div role="status" aria-live="polite" className="p-3.5 rounded-xl bg-sky-950/80 border border-sky-600/50 text-xs text-sky-200 flex items-center gap-2.5 animate-in fade-in duration-150">
              <Radio className="w-4 h-4 text-sky-400 animate-spin shrink-0" />
              <span className="font-medium">{statusMessage || 'Behandler...'}</span>
            </div>
          )}

          {errorMessage && (
            <div role="alert" className="p-3.5 rounded-xl bg-rose-950/80 border border-rose-600/50 text-xs text-rose-200 flex items-start gap-2.5 animate-in fade-in duration-150">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <span className="font-semibold block">Tilgangsavvisning eller feil</span>
                <span className="text-[11px] text-rose-300 leading-normal">{errorMessage}</span>
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="space-y-2.5 pt-2">
            <button
              type="button"
              disabled={isLoading}
              onClick={handleAllowGps}
              className="w-full flex items-center justify-center gap-2.5 py-3.5 px-5 rounded-2xl bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white font-bold text-sm shadow-xl shadow-sky-950/60 transition disabled:opacity-50 active:scale-[0.99]"
            >
              <Navigation className="w-4 h-4" />
              <span>{isLoading ? 'Henter posisjon...' : 'Tillat og bruk min posisjon (Kun ved bruk)'}</span>
              {!isLoading && <ArrowRight className="w-4 h-4 ml-0.5" />}
            </button>

            <button
              type="button"
              disabled={isLoading}
              onClick={handleDeclineGps}
              className="w-full py-3 px-4 rounded-2xl bg-slate-800/80 hover:bg-slate-800 text-slate-400 hover:text-slate-200 text-xs font-medium border border-slate-700/60 transition"
            >
              Bruk standard sted ({defaultLocationName}) / Velg manuelt
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
