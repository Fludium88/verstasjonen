'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  ShieldAlert,
  Bell,
  BellRing,
  Wind,
  ThermometerSnowflake,
  Droplets,
  TrendingDown,
  CheckCircle,
  Save,
} from 'lucide-react';
import { CustomAlertConfig, DEFAULT_ALERT_CONFIG } from '@/types/alerts';
import { useAccessibleDialog } from '../common/useAccessibleDialog';

interface AlertSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAlertsUpdated: () => void;
}

export const AlertSettingsModal: React.FC<AlertSettingsModalProps> = ({
  isOpen,
  onClose,
  onAlertsUpdated,
}) => {
  const [config, setConfig] = useState<CustomAlertConfig>(DEFAULT_ALERT_CONFIG);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const dialogRef = useAccessibleDialog<HTMLDivElement>(isOpen, onClose);

  useEffect(() => {
    const controller = new AbortController();
    if (isOpen) {
      fetchConfig(controller.signal);
      if (typeof window !== 'undefined' && 'Notification' in window) {
        setNotificationPermission(Notification.permission);
      }
    }
    return () => controller.abort();
  }, [isOpen]);

  const fetchConfig = async (signal?: AbortSignal) => {
    try {
      const res = await fetch('/api/weather/alerts', { cache: 'no-store', signal });
      if (res.ok) {
        const data = await res.json();
        if (data.config) {
          setConfig(data.config);
        }
      }
    } catch (e) {
      if (signal?.aborted) return;
      console.error('Failed to load alert config:', e);
      setMessage('Kunne ikke hente varselinnstillingene.');
    }
  };

  const handleRequestNotificationPermission = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      alert('Nettleseren din støtter ikke nettleservarsler.');
      return;
    }

    try {
      const perm = await Notification.requestPermission();
      setNotificationPermission(perm);
      if (perm === 'granted') {
        setConfig((prev) => ({ ...prev, browserNotificationsEnabled: true }));
        new Notification('Værstasjonen – Varsler aktivert', {
          body: 'Du vil nå motta varsler ved overskridelse av dine valgte værgrenser.',
          icon: '/icons/icon.svg',
        });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch('/api/weather/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });

      if (res.ok) {
        setMessage('Væralarmer og grenseverdier er lagret!');
        onAlertsUpdated();
        setTimeout(() => {
          setMessage(null);
        }, 3000);
      } else {
        const body = await res.json().catch(() => null);
        setMessage(body?.error || 'Kunne ikke lagre varselinnstillingene.');
      }
    } catch (e) {
      setMessage('Feil ved lagring av innstillinger');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="alerts-dialog-title"
        tabIndex={-1}
        className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/80">
          <div className="flex items-center gap-2.5">
            <ShieldAlert className="w-5 h-5 text-amber-400" />
            <h2 id="alerts-dialog-title" className="text-lg font-semibold text-white">Varsler & Terskelalarmer</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Lukk varselinnstillinger"
            className="text-slate-400 hover:text-white p-2.5 min-h-11 min-w-11 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSave} className="p-6 space-y-5 max-h-[80vh] overflow-y-auto text-xs">
          {message && (
            <div role="status" aria-live="polite" className="p-3 bg-slate-800 border border-slate-600 rounded-xl text-slate-200 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{message}</span>
            </div>
          )}

          {/* Master Toggle */}
          <div className="flex items-center justify-between p-3.5 bg-slate-800/60 border border-slate-700/60 rounded-xl">
            <div>
              <div className="font-bold text-white text-xs">Aktiver egne væralarmer</div>
              <div className="text-[11px] text-slate-400">Overvåk målinger mot dine egne grenser</div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={config.enabled}
                onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500"></div>
            </label>
          </div>

          {/* Browser Push Notifications */}
          <div className="p-3.5 bg-slate-800/40 border border-slate-700/50 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-200 font-semibold">
                <Bell className="w-4 h-4 text-sky-400" />
                <span>Nettleservarsling mens appen er åpen</span>
              </div>
              <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                {notificationPermission === 'granted' ? 'Tillatt' : 'Ikke aktivert'}
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Appen sjekker varsler mens den er åpen og kan da vise et popup-varsel i nettleseren. Dette er ikke bakgrunns-push når appen er lukket.
            </p>
            {notificationPermission !== 'granted' && (
              <button
                type="button"
                onClick={handleRequestNotificationPermission}
                className="w-full mt-1 py-1.5 px-3 bg-sky-600 hover:bg-sky-500 text-white rounded-lg font-semibold flex items-center justify-center gap-1.5 transition"
              >
                <BellRing className="w-3.5 h-3.5" />
                <span>Aktiver nettleservarsler nå</span>
              </button>
            )}
          </div>

          {/* Threshold Inputs */}
          <div className="space-y-3.5 pt-1">
            <h3 className="font-bold text-slate-300 uppercase tracking-wider text-[11px]">
              Terskelgrenser for automatisk varsling
            </h3>

            {/* 1. Wind Gust */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-slate-300">
                <div className="flex items-center gap-1.5">
                  <Wind className="w-3.5 h-3.5 text-sky-400" />
                  <span>Vindkast-terskel</span>
                </div>
                <span className="font-mono font-bold text-white text-xs">{config.windGustLimitMs} m/s</span>
              </div>
              <input
                type="range"
                min="10"
                max="35"
                step="1"
                value={config.windGustLimitMs}
                onChange={(e) => setConfig({ ...config, windGustLimitMs: parseFloat(e.target.value) })}
                className="w-full accent-amber-500 bg-slate-800 rounded-lg cursor-pointer"
              />
            </div>

            {/* 2. Mean Wind */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-slate-300">
                <div className="flex items-center gap-1.5">
                  <Wind className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Middelvind-terskel</span>
                </div>
                <span className="font-mono font-bold text-white text-xs">{config.windSpeedLimitMs} m/s</span>
              </div>
              <input
                type="range"
                min="8"
                max="25"
                step="1"
                value={config.windSpeedLimitMs}
                onChange={(e) => setConfig({ ...config, windSpeedLimitMs: parseFloat(e.target.value) })}
                className="w-full accent-cyan-500 bg-slate-800 rounded-lg cursor-pointer"
              />
            </div>

            {/* 3. Frost / Freezing */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-slate-300">
                <div className="flex items-center gap-1.5">
                  <ThermometerSnowflake className="w-3.5 h-3.5 text-sky-300" />
                  <span>Frost- / Isingsgrense</span>
                </div>
                <span className="font-mono font-bold text-white text-xs">{config.frostLimitC} °C</span>
              </div>
              <input
                type="range"
                min="-10"
                max="3"
                step="0.5"
                value={config.frostLimitC}
                onChange={(e) => setConfig({ ...config, frostLimitC: parseFloat(e.target.value) })}
                className="w-full accent-sky-400 bg-slate-800 rounded-lg cursor-pointer"
              />
            </div>

            {/* 4. Heavy Rain */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-slate-300">
                <div className="flex items-center gap-1.5">
                  <Droplets className="w-3.5 h-3.5 text-blue-400" />
                  <span>Kraftig regn (timegrense)</span>
                </div>
                <span className="font-mono font-bold text-white text-xs">{config.heavyRainHourLimitMm} mm/t</span>
              </div>
              <input
                type="range"
                min="3"
                max="25"
                step="1"
                value={config.heavyRainHourLimitMm}
                onChange={(e) => setConfig({ ...config, heavyRainHourLimitMm: parseFloat(e.target.value) })}
                className="w-full accent-blue-500 bg-slate-800 rounded-lg cursor-pointer"
              />
            </div>

            {/* 5. Rapid Pressure Drop */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-slate-300">
                <div className="flex items-center gap-1.5">
                  <TrendingDown className="w-3.5 h-3.5 text-rose-400" />
                  <span>Kraftig barometerfall (3 timer)</span>
                </div>
                <span className="font-mono font-bold text-white text-xs">{config.pressureDropLimitHpa} hPa / 3t</span>
              </div>
              <input
                type="range"
                min="1.5"
                max="8"
                step="0.5"
                value={config.pressureDropLimitHpa}
                onChange={(e) => setConfig({ ...config, pressureDropLimitHpa: parseFloat(e.target.value) })}
                className="w-full accent-rose-500 bg-slate-800 rounded-lg cursor-pointer"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold shadow-lg shadow-amber-950/50 transition disabled:opacity-50 mt-4"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'Lagrer innstillinger...' : 'Lagre alarmgrenser'}</span>
          </button>
        </form>
      </div>
    </div>
  );
};
