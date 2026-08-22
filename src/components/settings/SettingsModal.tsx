'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Key,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  ExternalLink,
  Sliders,
  Download,
  Smartphone,
  Navigation,
  Clock,
  LogOut,
  Settings as SettingsIcon,
} from 'lucide-react';
import { PwaInstallModal } from '../pwa/PwaInstallModal';
import { usePwaInstall } from '@/lib/pwaInstall';
import { useAccessibleDialog } from '../common/useAccessibleDialog';
import {
  isGpsStartupEnabled,
  setGpsStartupEnabled,
  getCurrentGpsPosition,
  reverseGeocodeCoords,
  syncGpsLocationToServer,
} from '@/lib/locationGps';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRefreshData: (locationId?: string) => void;
  onNavigateToCalibration?: () => void;
  onLocationSelected?: (locationId: string) => void;
}

interface StatusFeedback {
  type: 'success' | 'error' | 'info';
  text: string;
  details?: string;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onRefreshData,
  onNavigateToCalibration,
  onLocationSelected,
}) => {
  const { isInstalled } = usePwaInstall();
  const [isPwaModalOpen, setIsPwaModalOpen] = useState(false);
  const [frostClientId, setFrostClientId] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [autoRefreshInterval, setAutoRefreshInterval] = useState<number>(60);
  const [gpsStartup, setGpsStartup] = useState<boolean>(false);
  const [isGpsLocating, setIsGpsLocating] = useState<boolean>(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<StatusFeedback | null>(null);
  const gpsOperationRef = useRef(0);
  const dialogRef = useAccessibleDialog<HTMLDivElement>(isOpen && !isPwaModalOpen, onClose);

  useEffect(() => {
    const controller = new AbortController();
    if (isOpen) {
      fetchSettings(controller.signal);
      const savedInterval = localStorage.getItem('vaerstasjonen_autorefresh_mins');
      if (savedInterval !== null) {
        setAutoRefreshInterval(parseInt(savedInterval, 10));
      }
      setGpsStartup(isGpsStartupEnabled());
    }
    return () => {
      controller.abort();
      gpsOperationRef.current += 1;
    };
  }, [isOpen]);

  const fetchSettings = async (signal?: AbortSignal) => {
    try {
      const res = await fetch('/api/settings', { signal });
      if (res.ok) {
        const data = await res.json();
        setHasKey(data.has_frost_key);
        setFrostClientId(data.frost_client_id || '');
      }
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) {
        console.error(e);
      }
    }
  };

  const handleToggleGpsStartup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const checked = e.target.checked;
    setGpsStartup(checked);
    setGpsStartupEnabled(checked);
    setFeedback({
      type: 'info',
      text: checked
        ? 'GPS er aktivert ved oppstart.'
        : 'GPS ved oppstart er deaktivert. Forrige lagrede sted benyttes.',
    });
  };

  const handleTestGpsNow = async () => {
    const operationId = ++gpsOperationRef.current;
    setIsGpsLocating(true);
    setFeedback(null);
    try {
      const coords = await getCurrentGpsPosition(10000);
      if (operationId !== gpsOperationRef.current) return;
      const geo = await reverseGeocodeCoords(coords.latitude, coords.longitude);
      if (operationId !== gpsOperationRef.current) return;
      const loc = await syncGpsLocationToServer(
        { latitude: coords.latitude, longitude: coords.longitude, altitude: coords.altitude },
        geo.name,
        geo.address
      );
      if (operationId !== gpsOperationRef.current) return;

      setFeedback({
        type: 'success',
        text: `Posisjon oppdatert til ${geo.name}.`,
        details: geo.address,
      });

      if (onLocationSelected) {
        onLocationSelected(loc.id);
      } else {
        onRefreshData(loc.id);
      }
    } catch (err: any) {
      if (operationId === gpsOperationRef.current) {
        setFeedback({
          type: 'error',
          text: err.message || 'Kunne ikke hente posisjon.',
        });
      }
    } finally {
      if (operationId === gpsOperationRef.current) setIsGpsLocating(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setFeedback(null);
    try {
      const trimmed = frostClientId.trim();

      if (trimmed && !trimmed.includes('•')) {
        const valRes = await fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'validate_frost', frost_client_id: trimmed }),
        });
        const valJson = await valRes.json();
        if (valJson.validation && !valJson.validation.valid) {
          setFeedback({
            type: 'error',
            text: valJson.validation.message,
          });
          setLoading(false);
          return;
        }
      }

      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ frost_client_id: trimmed }),
      });
      if (res.ok) {
        setFeedback({
          type: 'success',
          text: trimmed ? 'Innstillinger lagret!' : 'Nøkkel fjernet.',
        });
        fetchSettings();
      } else {
        const errJson = await res.json().catch(() => ({}));
        setFeedback({
          type: 'error',
          text: errJson.error || 'Feil ved lagring',
        });
      }
    } catch (e: any) {
      setFeedback({
        type: 'error',
        text: e.message || 'Nettverksfeil ved lagring',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAutoRefreshChange = (mins: number) => {
    setAutoRefreshInterval(mins);
    localStorage.setItem('vaerstasjonen_autorefresh_mins', mins.toString());
    setFeedback({
      type: 'info',
      text:
        mins === 0
          ? 'Automatisk oppdatering er deaktivert.'
          : `Automatisk oppdatering er satt til hvert ${mins}. minutt.`,
    });
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);
    setFeedback(null);
    try {
      const response = await fetch('/api/auth', { method: 'DELETE' });
      if (!response.ok) {
        throw new Error('Kunne ikke fjerne tilgangscookien.');
      }
      window.location.assign('/access');
    } catch (error) {
      setFeedback({
        type: 'error',
        text: error instanceof Error ? error.message : 'Kunne ikke logge ut.',
      });
      setIsLoggingOut(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-dialog-title"
        tabIndex={-1}
        className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200 flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/90">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-400">
              <SettingsIcon className="w-5 h-5" />
            </div>
            <div>
              <h2 id="settings-dialog-title" className="text-base font-bold text-white leading-tight">Innstillinger</h2>
              <p className="text-[11px] text-slate-400">Brukervalg og posisjonstilpasning</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Lukk innstillinger"
            className="text-slate-400 hover:text-white p-2.5 min-h-11 min-w-11 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto flex-1 text-slate-200">
          {feedback && (
            <div
              role="status"
              aria-live="polite"
              className={`p-3 rounded-xl text-xs flex items-start gap-2.5 leading-relaxed ${
                feedback.type === 'error'
                  ? 'bg-rose-950/80 border border-rose-600/50 text-rose-300'
                  : feedback.type === 'success'
                  ? 'bg-emerald-950/80 border border-emerald-600/50 text-emerald-300'
                  : 'bg-sky-950/80 border border-sky-600/50 text-sky-300'
              }`}
            >
              {feedback.type === 'error' ? (
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              ) : (
                <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              )}
              <div className="space-y-1">
                <div className="font-medium">{feedback.text}</div>
                {feedback.details && (
                  <div className="text-[11px] opacity-80 leading-normal">
                    {feedback.details}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Sensorkalibrering */}
          {onNavigateToCalibration && (
            <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5 text-white text-xs font-bold">
                  <div className="w-7 h-7 rounded-lg bg-sky-500/20 border border-sky-400/30 flex items-center justify-center text-sky-400">
                    <Sliders className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-white">Sensorkalibrering</div>
                    <div className="text-[10px] text-slate-400 font-normal">Finjuster temperatur, vind og trykk</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onNavigateToCalibration();
                  }}
                  className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold transition flex items-center gap-1.5 active:scale-95"
                >
                  <Sliders className="w-3.5 h-3.5" />
                  <span>Åpne</span>
                </button>
              </div>
            </div>
          )}

          {/* GPS Section */}
          <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-200 text-xs font-semibold">
                <Navigation className="w-4 h-4 text-sky-400" />
                <span>Posisjon</span>
              </div>
            </div>

            <div className="space-y-2 text-[11px] text-slate-400 leading-relaxed">
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900/60 border border-slate-750">
                <label htmlFor="gps-startup-toggle" className="text-slate-300 cursor-pointer font-medium">
                  Hent min posisjon automatisk ved oppstart
                </label>
                <input
                  id="gps-startup-toggle"
                  type="checkbox"
                  checked={gpsStartup}
                  onChange={handleToggleGpsStartup}
                  className="w-4 h-4 rounded accent-sky-500 cursor-pointer"
                />
              </div>

              <button
                type="button"
                disabled={isGpsLocating}
                onClick={handleTestGpsNow}
                className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-sky-600/30 hover:bg-sky-600 text-sky-200 hover:text-white border border-sky-500/40 text-xs font-semibold transition"
              >
                <Navigation className={`w-3.5 h-3.5 ${isGpsLocating ? 'animate-spin' : ''}`} />
                <span>{isGpsLocating ? 'Henter posisjon...' : 'Oppdater til min posisjon nå'}</span>
              </button>
            </div>
          </div>

          {/* Autorefresh Setting */}
          <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-200 text-xs font-semibold">
                <Clock className="w-4 h-4 text-sky-400" />
                <span>Automatisk oppdatering</span>
              </div>
              <span className="text-[11px] text-sky-400 font-mono font-medium">
                {autoRefreshInterval === 0 ? 'Av' : `Hver ${autoRefreshInterval}. min`}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-1.5 pt-1">
              {[
                { mins: 15, label: '15 min' },
                { mins: 30, label: '30 min' },
                { mins: 60, label: '1 time' },
                { mins: 0, label: 'Av' },
              ].map((opt) => (
                <button
                  key={opt.mins}
                  type="button"
                  onClick={() => handleAutoRefreshChange(opt.mins)}
                  className={`py-1.5 px-2 rounded-lg text-xs font-medium border transition ${
                    autoRefreshInterval === opt.mins
                      ? 'bg-sky-600 text-white border-sky-500 shadow-sm'
                      : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-750'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* PWA Section */}
          <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-white text-xs font-bold">
                <Smartphone className="w-4 h-4 text-sky-400" />
                <span>Web-app (PWA)</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsPwaModalOpen(true)}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-sky-600/30 hover:bg-sky-600 text-sky-200 hover:text-white border border-sky-500/40 text-xs font-semibold transition"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isInstalled ? 'Vis app-informasjon' : 'Installer app på hjemskjerm'}</span>
            </button>
          </div>

          {/* Frost Client ID (Valgfri) */}
          <form onSubmit={handleSave} className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-4 space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="frost-client-id" className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                  <Key className="w-3.5 h-3.5 text-amber-400" /> MET Frost Client ID (Valgfritt)
                </label>
                <a
                  href="https://frost.met.no"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-sky-400 hover:text-sky-300 flex items-center gap-1"
                >
                  frost.met.no <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <input
                id="frost-client-id"
                type="text"
                value={frostClientId}
                onChange={(e) => setFrostClientId(e.target.value)}
                placeholder="F.eks. 13b5ccec-aea0-4179-8d28-84e49f9b7108"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 font-mono"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition"
            >
              {loading ? 'Lagrer...' : 'Lagre'}
            </button>
          </form>

          <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-4 space-y-3">
            <div>
              <div className="text-xs font-semibold text-slate-200">Tilgang</div>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                Logg ut fjerner bare tilgangscookien i denne nettleseren. Lagrede steder og GPS-valg på enheten slettes ikke.
              </p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-rose-500/40 bg-rose-950/40 px-4 py-2 text-xs font-semibold text-rose-200 transition hover:bg-rose-900/50 disabled:cursor-wait disabled:opacity-60"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              <span>{isLoggingOut ? 'Logger ut…' : 'Logg ut'}</span>
            </button>
          </div>
        </div>
      </div>

      <PwaInstallModal isOpen={isPwaModalOpen} onClose={() => setIsPwaModalOpen(false)} />
    </div>
  );
};
