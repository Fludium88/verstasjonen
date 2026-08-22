'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Sliders,
  CheckCircle2,
  RefreshCw,
  Sparkles,
  AlertTriangle,
  RotateCcw,
  ShieldCheck,
  Radio,
  Thermometer,
  Droplets,
  Gauge,
  Wind,
  CloudRain,
  Layers,
  Info,
  ExternalLink,
} from 'lucide-react';
import {
  BenchmarkSourceType,
  CalibrationPayload,
  LocationCalibrationProfile,
  SensorCalibrationOffsets,
} from '@/types/calibration';
import { formatNorwegianNumber } from '@/lib/weatherUtils';

interface CalibrationViewProps {
  locationId: string;
  onRefreshDashboard?: () => void;
}

export const CalibrationView: React.FC<CalibrationViewProps> = ({
  locationId,
  onRefreshDashboard,
}) => {
  const [data, setData] = useState<CalibrationPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [autoCalibrating, setAutoCalibrating] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const requestAbortRef = useRef<AbortController | null>(null);
  const locationIdRef = useRef(locationId);
  locationIdRef.current = locationId;

  // Editable state
  const [isEnabled, setIsEnabled] = useState(false);
  const [selectedBenchmark, setSelectedBenchmark] = useState<BenchmarkSourceType>('locationforecast');
  const [offsets, setOffsets] = useState<SensorCalibrationOffsets>({
    temp_offset: 0.0,
    humidity_offset: 0,
    pressure_offset: 0.0,
    wind_multiplier: 1.0,
    precip_multiplier: 1.0,
  });

  useEffect(() => {
    setData(null);
    void fetchCalibrationData();
    return () => requestAbortRef.current?.abort();
  }, [locationId]);

  const fetchCalibrationData = async () => {
    requestAbortRef.current?.abort();
    const controller = new AbortController();
    requestAbortRef.current = controller;
    const requestedLocationId = locationId;
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/weather/calibration?locationId=${locationId}`, {
        cache: 'no-store',
        signal: controller.signal,
      });
      if (res.ok) {
        const json: CalibrationPayload = await res.json();
        if (controller.signal.aborted || requestedLocationId !== locationIdRef.current) return;
        setData(json);
        setIsEnabled(json.profile.is_enabled);
        setSelectedBenchmark(json.profile.reference_benchmark || 'locationforecast');
        setOffsets(json.profile.offsets);
      } else {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || 'Kunne ikke hente kalibreringsdata.');
      }
    } catch (err: any) {
      if (controller.signal.aborted) return;
      console.error('Failed to load calibration data:', err);
      setLoadError(err?.message || 'Kunne ikke hente kalibreringsdata.');
    } finally {
      if (!controller.signal.aborted && requestedLocationId === locationIdRef.current) setLoading(false);
    }
  };

  const handleOffsetChange = (field: keyof SensorCalibrationOffsets, value: number) => {
    setOffsets((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      const profile: LocationCalibrationProfile = {
        location_id: locationId,
        is_enabled: isEnabled,
        reference_benchmark: selectedBenchmark,
        offsets,
        last_calibrated_at: new Date().toISOString(),
      };

      const res = await fetch('/api/weather/calibration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save',
          locationId,
          profile,
        }),
      });

      if (res.ok) {
        const json = await res.json();
        setData(json.payload);
        setFeedback({
          type: 'success',
          message: 'Kalibreringsprofilen er lagret. Visninger av justerte måleverdier er oppdatert.',
        });
        onRefreshDashboard?.();
      } else {
        setFeedback({ type: 'error', message: 'Kunne ikke lagre kalibrering' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Nettverksfeil ved lagring' });
    } finally {
      setSaving(false);
    }
  };

  const handleAutoCalibrate = async (benchmark: BenchmarkSourceType) => {
    setAutoCalibrating(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/weather/calibration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'auto_calibrate',
          locationId,
          benchmarkSource: benchmark,
        }),
      });

      if (res.ok) {
        const json = await res.json();
        const payload: CalibrationPayload = json.payload;
        setData(payload);
        setIsEnabled(true);
        setSelectedBenchmark(benchmark);
        setOffsets(payload.profile.offsets);
        setFeedback({
          type: 'success',
          message: `Automatisk krysskalibrert mot ${
            benchmark === 'locationforecast'
              ? 'MET Locationforecast (Yr)'
              : benchmark === 'open_meteo'
              ? 'Open-Meteo Global Modell'
              : 'Valgt referanse'
          }!`,
        });
        onRefreshDashboard?.();
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Feil ved automatisk kalibrering' });
    } finally {
      setAutoCalibrating(false);
    }
  };

  const handleReset = async () => {
    setResetting(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/weather/calibration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reset',
          locationId,
        }),
      });

      if (res.ok) {
        const json = await res.json();
        const payload: CalibrationPayload = json.payload;
        setData(payload);
        setIsEnabled(false);
        setOffsets(payload.profile.offsets);
        setFeedback({
          type: 'info',
          message: 'Kalibrering er nullstilt til standardprofilen (ukalibrerte måleverdier).',
        });
        onRefreshDashboard?.();
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Feil ved nullstilling' });
    } finally {
      setResetting(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-400 space-y-3">
        <RefreshCw className="w-6 h-6 animate-spin text-sky-400 mr-2" />
        <span>Henter tilgjengelig kildesammenligning og kalibreringsprofil...</span>
      </div>
    );
  }

  if (loadError && !data) {
    return (
      <div className="mx-auto my-16 max-w-lg rounded-2xl border border-rose-800/60 bg-rose-950/30 p-7 text-center">
        <AlertTriangle className="mx-auto h-8 w-8 text-rose-400" />
        <p role="alert" className="mt-3 text-sm text-slate-200">{loadError}</p>
        <button type="button" onClick={() => fetchCalibrationData()} className="mt-4 min-h-11 rounded-xl bg-sky-600 px-4 py-2 text-sm font-bold text-white">
          Prøv på nytt
        </button>
      </div>
    );
  }

  if (!data) return null;

  const raw = data.raw_station_values;
  const formatMetric = (value: number | null | undefined, suffix = '', decimals = 1) =>
    typeof value === 'number' && Number.isFinite(value)
      ? `${formatNorwegianNumber(value, decimals)}${suffix}`
      : 'Ikke tilgjengelig';

  // Live preview calculation based on active edited slider values
  const previewTemp = raw.temperature !== null ? Math.round((raw.temperature + offsets.temp_offset) * 10) / 10 : null;
  const previewHum = raw.humidity !== null ? Math.min(100, Math.max(0, Math.round(raw.humidity + offsets.humidity_offset))) : null;
  const previewPress = raw.pressure !== null ? Math.round((raw.pressure + offsets.pressure_offset) * 10) / 10 : null;
  const previewWind = raw.wind_speed !== null ? Math.round(raw.wind_speed * offsets.wind_multiplier * 10) / 10 : null;
  const previewPrecip = raw.precipitation !== null ? Math.round(raw.precipitation * offsets.precip_multiplier * 10) / 10 : null;

  return (
    <div className="space-y-8 pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-800">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <Sliders className="w-6 h-6 text-sky-400" /> Sensorkalibrering & Kryssanalyse
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Sammenlign {data.location.name} mot alternative kilder og juster sensor-offsets for mikroklima
          </p>
        </div>

        {/* Master Toggle */}
        <div className="flex items-center gap-3 self-start sm:self-auto bg-slate-900/90 border border-slate-800 p-1.5 px-3 rounded-2xl shadow-md">
          <span className="text-xs font-semibold text-slate-300">Kalibrering:</span>
          <button
            type="button"
            onClick={() => setIsEnabled(!isEnabled)}
            aria-pressed={isEnabled}
            className={`px-3 py-1 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
              isEnabled
                ? 'bg-emerald-500 text-white shadow-md shadow-emerald-950/50'
                : 'bg-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${isEnabled ? 'bg-white animate-pulse' : 'bg-slate-500'}`} />
            {isEnabled ? 'AKTIV' : 'AVSLÅTT'}
          </button>
        </div>
      </div>

      {/* Status Feedback Banner */}
      {feedback && (
        <div
          role={feedback.type === 'error' ? 'alert' : 'status'}
          aria-live="polite"
          className={`p-4 rounded-2xl text-xs flex items-center gap-3 shadow-lg ${
            feedback.type === 'success'
              ? 'bg-emerald-950/80 border border-emerald-600/60 text-emerald-200'
              : feedback.type === 'error'
              ? 'bg-rose-950/80 border border-rose-600/60 text-rose-200'
              : 'bg-sky-950/80 border border-sky-600/60 text-sky-200'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          ) : feedback.type === 'error' ? (
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
          ) : (
            <Info className="w-5 h-5 text-sky-400 shrink-0" />
          )}
          <span className="font-medium">{feedback.message}</span>
        </div>
      )}

      {/* 1. REAL-TIME CROSS-SOURCE COMPARISON TABLE & CARDS */}
      <div className="met-glass-card rounded-2xl p-6 border border-slate-800/90 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Layers className="w-5 h-5 text-sky-400" /> Sammenligning mot tilgjengelige kilder
            </h2>
            <p className="text-xs text-slate-400">
              Målinger fra Meteorologisk institutt (MET Norway), Yr Locationforecast og Open-Meteo
            </p>
          </div>

          <button
            type="button"
            onClick={fetchCalibrationData}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs text-slate-300 transition"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Oppdater kilder</span>
          </button>
        </div>

        {/* Responsive Table / Card Grid */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300 min-w-[620px]">
            <thead className="bg-slate-900/90 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
              <tr>
                <th className="py-3 px-3.5">Datakilde</th>
                <th className="py-3 px-3">Type</th>
                <th className="py-3 px-3 text-right">Temperatur</th>
                <th className="py-3 px-3 text-right">Fuktighet</th>
                <th className="py-3 px-3 text-right">Lufttrykk</th>
                <th className="py-3 px-3 text-right">Vind</th>
                <th className="py-3 px-3 text-center">Handling</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {data.comparisons.map((c, idx) => {
                const isPrimary = c.source_id === 'frost_station';
                return (
                  <tr
                    key={idx}
                    className={`transition ${
                      isPrimary
                        ? 'bg-slate-900/60 font-semibold'
                        : 'hover:bg-slate-800/40'
                    }`}
                  >
                    <td className="py-3.5 px-3.5 font-sans">
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            isPrimary
                              ? 'bg-emerald-400'
                              : c.source_id === 'locationforecast'
                              ? 'bg-sky-400'
                              : c.source_id === 'open_meteo'
                              ? 'bg-purple-400'
                              : 'bg-amber-400'
                          }`}
                        />
                        <span className="font-bold text-white text-xs">{c.source_name}</span>
                      </div>
                      <span className="text-[10px] text-slate-500 font-mono ml-4 block">
                        Oppdatert {c.last_updated}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-sans">
                      <span className="text-[11px] text-slate-400">{c.source_type_label}</span>
                    </td>
                    <td className="py-3 px-3 text-right">
                      <span className="text-white font-bold">{formatMetric(c.temperature, ' °C')}</span>
                      {!isPrimary && c.delta_temp !== null && c.delta_temp !== 0 && (
                        <span
                          className={`text-[10px] block ${
                            c.delta_temp > 0 ? 'text-amber-400' : 'text-sky-400'
                          }`}
                        >
                          ({c.delta_temp > 0 ? `+${formatNorwegianNumber(c.delta_temp, 1)}` : formatNorwegianNumber(c.delta_temp, 1)})
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <span className="text-white font-bold">{formatMetric(c.humidity, ' %', 0)}</span>
                      {!isPrimary && c.delta_humidity !== null && c.delta_humidity !== 0 && (
                        <span className="text-[10px] text-slate-400 block">
                          ({c.delta_humidity > 0 ? `+${c.delta_humidity}` : c.delta_humidity}%)
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <span className="text-white font-bold">
                        {formatMetric(c.pressure, ' hPa', 0)}
                      </span>
                      {!isPrimary && c.delta_pressure !== null && c.delta_pressure !== 0 && (
                        <span className="text-[10px] text-slate-400 block">
                          ({c.delta_pressure > 0 ? `+${formatNorwegianNumber(c.delta_pressure, 1)}` : formatNorwegianNumber(c.delta_pressure, 1)})
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <span className="text-white font-bold">
                        {formatMetric(c.wind_speed, ' m/s')}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-center font-sans">
                      {!isPrimary && (
                        <button
                          type="button"
                          onClick={() => handleAutoCalibrate(c.source_id)}
                          disabled={autoCalibrating}
                          className="px-2.5 py-1 rounded-lg bg-sky-600/30 hover:bg-sky-600 text-sky-300 hover:text-white border border-sky-500/40 text-[11px] font-semibold transition"
                        >
                          Bruk som referanse
                        </button>
                      )}
                      {isPrimary && (
                        <span className="text-[10px] text-emerald-400 font-semibold uppercase">
                          Hovedkilde
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 2. AUTO-CALIBRATION QUICK ACTIONS */}
      <div className="bg-gradient-to-r from-sky-950/70 via-indigo-950/70 to-slate-900/80 border border-sky-600/40 rounded-2xl p-6 shadow-xl space-y-3">
        <div className="flex items-center gap-2 text-white font-bold text-base">
          <Sparkles className="w-5 h-5 text-sky-400" />
          1-Klikks Automatisk Krysskalibrering (Auto-Bias Correction)
        </div>
        <p className="text-xs text-slate-300 leading-relaxed max-w-3xl">
          Automatisk kalibrering beregner avviket (bias) mellom den lokale målestasjonen og den valgte
          meteorologiske referansemodellen, og setter optimale korreksjonsfaktorer automatisk.
        </p>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <button
            type="button"
            onClick={() => handleAutoCalibrate('locationforecast')}
            disabled={autoCalibrating}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold shadow-lg shadow-sky-950/50 transition active:scale-95 disabled:opacity-50"
          >
            <Sparkles className="w-4 h-4" />
            <span>Autokalibrer mot Yr Locationforecast</span>
          </button>

          <button
            type="button"
            onClick={() => handleAutoCalibrate('open_meteo')}
            disabled={autoCalibrating}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-purple-600/80 hover:bg-purple-600 text-white text-xs font-bold shadow-lg shadow-purple-950/50 transition active:scale-95 disabled:opacity-50"
          >
            <Sparkles className="w-4 h-4" />
            <span>Autokalibrer mot Open-Meteo (Global modell)</span>
          </button>

          <button
            type="button"
            onClick={handleReset}
            disabled={resetting}
            className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 transition"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Nullstill til standard</span>
          </button>
        </div>
      </div>

      {/* 3. SENSOR CALIBRATION SLIDERS & LIVE PREVIEW */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Sliders & Controls */}
        <div className="lg:col-span-7 bg-[#0e1628] border border-slate-800/90 rounded-2xl p-6 shadow-xl space-y-6">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Sliders className="w-5 h-5 text-sky-400" /> Manuell Sensorkalibrering
            </h3>
            <span className="text-xs text-slate-400 font-mono">Offsets & Multiplikatorer</span>
          </div>

          {/* Temperature Slider */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-200 flex items-center gap-2">
                <Thermometer className="w-4 h-4 text-amber-400" /> Temperatur Justering (°C)
              </label>
              <div className="flex items-center gap-1">
                <span className="text-xs font-mono font-bold text-amber-300 px-2 py-0.5 rounded bg-amber-500/20 border border-amber-500/30">
                  {offsets.temp_offset > 0 ? `+${formatNorwegianNumber(offsets.temp_offset, 1)}` : formatNorwegianNumber(offsets.temp_offset, 1)} °C
                </span>
              </div>
            </div>
            <input
              type="range"
              min="-5.0"
              max="5.0"
              step="0.1"
              value={offsets.temp_offset}
              onChange={(e) => handleOffsetChange('temp_offset', parseFloat(e.target.value))}
              className="w-full accent-amber-400 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-slate-500 font-mono">
              <span>-5.0 °C (Kaldere)</span>
              <span>0.0 °C (Uendret)</span>
              <span>+5.0 °C (Varmere)</span>
            </div>
          </div>

          {/* Humidity Slider */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-200 flex items-center gap-2">
                <Droplets className="w-4 h-4 text-blue-400" /> Relativ Luftfuktighet Justering (%)
              </label>
              <div className="flex items-center gap-1">
                <span className="text-xs font-mono font-bold text-blue-300 px-2 py-0.5 rounded bg-blue-500/20 border border-blue-500/30">
                  {offsets.humidity_offset > 0 ? `+${offsets.humidity_offset}` : offsets.humidity_offset} %
                </span>
              </div>
            </div>
            <input
              type="range"
              min="-20"
              max="20"
              step="1"
              value={offsets.humidity_offset}
              onChange={(e) => handleOffsetChange('humidity_offset', parseInt(e.target.value, 10))}
              className="w-full accent-blue-400 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-slate-500 font-mono">
              <span>-20 %</span>
              <span>0 %</span>
              <span>+20 %</span>
            </div>
          </div>

          {/* Air Pressure Slider */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-200 flex items-center gap-2">
                <Gauge className="w-4 h-4 text-emerald-400" /> Lufttrykk / Barometer Kalibrering (hPa)
              </label>
              <div className="flex items-center gap-1">
                <span className="text-xs font-mono font-bold text-emerald-300 px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/30">
                  {offsets.pressure_offset > 0 ? `+${formatNorwegianNumber(offsets.pressure_offset, 1)}` : formatNorwegianNumber(offsets.pressure_offset, 1)} hPa
                </span>
              </div>
            </div>
            <input
              type="range"
              min="-15.0"
              max="15.0"
              step="0.1"
              value={offsets.pressure_offset}
              onChange={(e) => handleOffsetChange('pressure_offset', parseFloat(e.target.value))}
              className="w-full accent-emerald-400 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-slate-500 font-mono">
              <span>-15.0 hPa</span>
              <span>0.0 hPa</span>
              <span>+15.0 hPa</span>
            </div>
          </div>

          {/* Wind Multiplier Slider */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-200 flex items-center gap-2">
                <Wind className="w-4 h-4 text-sky-400" /> Vindhastighet / Terrengfaktor (x)
              </label>
              <span className="text-xs font-mono font-bold text-sky-300 px-2 py-0.5 rounded bg-sky-500/20 border border-sky-500/30">
                {formatNorwegianNumber(offsets.wind_multiplier, 2)}x ({offsets.wind_multiplier >= 1.0 ? `+${Math.round((offsets.wind_multiplier - 1) * 100)}%` : `${Math.round((offsets.wind_multiplier - 1) * 100)}%`})
              </span>
            </div>
            <input
              type="range"
              min="0.50"
              max="2.00"
              step="0.05"
              value={offsets.wind_multiplier}
              onChange={(e) => handleOffsetChange('wind_multiplier', parseFloat(e.target.value))}
              className="w-full accent-sky-400 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-slate-500 font-mono">
              <span>0.50x (Skjermet)</span>
              <span>1.00x (Standard)</span>
              <span>2.00x (Vindutsatt)</span>
            </div>
          </div>

          {/* Precipitation Multiplier */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-200 flex items-center gap-2">
                <CloudRain className="w-4 h-4 text-cyan-400" /> Nedbørskorreksjon (x)
              </label>
              <span className="text-xs font-mono font-bold text-cyan-300 px-2 py-0.5 rounded bg-cyan-500/20 border border-cyan-500/30">
                {formatNorwegianNumber(offsets.precip_multiplier, 2)}x
              </span>
            </div>
            <input
              type="range"
              min="0.50"
              max="2.00"
              step="0.05"
              value={offsets.precip_multiplier}
              onChange={(e) => handleOffsetChange('precip_multiplier', parseFloat(e.target.value))}
              className="w-full accent-cyan-400 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-slate-500 font-mono">
              <span>0.50x</span>
              <span>1.00x</span>
              <span>2.00x</span>
            </div>
          </div>

          {/* Save Profile Button */}
          <div className="pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="w-full py-3 px-4 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold shadow-lg shadow-sky-950/50 transition flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{saving ? 'Lagrer kalibrering...' : 'Lagre kalibreringsprofil nå'}</span>
            </button>
          </div>
        </div>

        {/* Right Column: Live Telemetry Preview & Scientific Explanations */}
        <div className="lg:col-span-5 space-y-6">
          {/* Live Preview Card */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Forhåndsvisning av Kalibrert Telemetri
              </h3>
              <span
                className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold ${
                  isEnabled ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-400'
                }`}
              >
                {isEnabled ? 'AKTIV I APP' : 'DEAKTIVERT'}
              </span>
            </div>

            <div className="space-y-3 font-mono text-xs">
              <div className="bg-slate-800/60 p-3 rounded-xl flex items-center justify-between">
                <span className="text-slate-400 font-sans flex items-center gap-2">
                  <Thermometer className="w-4 h-4 text-amber-400" /> Temperatur:
                </span>
                <div className="text-right">
                  <span className="text-white font-bold text-sm">
                    {formatMetric(previewTemp, ' °C')}
                  </span>
                  <span className="text-[10px] text-slate-400 block font-normal">
                    Rå: {formatMetric(raw.temperature, ' °C')}
                  </span>
                </div>
              </div>

              <div className="bg-slate-800/60 p-3 rounded-xl flex items-center justify-between">
                <span className="text-slate-400 font-sans flex items-center gap-2">
                  <Droplets className="w-4 h-4 text-blue-400" /> Fuktighet:
                </span>
                <div className="text-right">
                  <span className="text-white font-bold text-sm">{formatMetric(previewHum, ' %', 0)}</span>
                  <span className="text-[10px] text-slate-400 block font-normal">
                    Rå: {formatMetric(raw.humidity, ' %', 0)}
                  </span>
                </div>
              </div>

              <div className="bg-slate-800/60 p-3 rounded-xl flex items-center justify-between">
                <span className="text-slate-400 font-sans flex items-center gap-2">
                  <Gauge className="w-4 h-4 text-emerald-400" /> Lufttrykk:
                </span>
                <div className="text-right">
                  <span className="text-white font-bold text-sm">
                    {formatMetric(previewPress, ' hPa', 0)}
                  </span>
                  <span className="text-[10px] text-slate-400 block font-normal">
                    Rå: {formatMetric(raw.pressure, ' hPa', 0)}
                  </span>
                </div>
              </div>

              <div className="bg-slate-800/60 p-3 rounded-xl flex items-center justify-between">
                <span className="text-slate-400 font-sans flex items-center gap-2">
                  <Wind className="w-4 h-4 text-sky-400" /> Vindhastighet:
                </span>
                <div className="text-right">
                  <span className="text-white font-bold text-sm">
                    {formatMetric(previewWind, ' m/s')}
                  </span>
                  <span className="text-[10px] text-slate-400 block font-normal">
                    Rå: {formatMetric(raw.wind_speed, ' m/s')}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Calibration Knowledge / Guidance */}
          <div className="met-glass-card rounded-2xl p-5 border border-slate-800/90 text-xs text-slate-300 space-y-2.5 leading-relaxed">
            <div className="flex items-center gap-2 font-bold text-white">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              Når bør du kalibrere værstasjonen?
            </div>
            <p>
              • <strong>Høydeforskjell (Moh):</strong> Hvis din plassering er høyere eller lavere enn den
              nærmeste målestasjonen, vil temperaturen normalt falle med ca. 0,65 °C per 100 høydemeter.
            </p>
            <p>
              • <strong>Kyst- vs. Innlandseffekt:</strong> Nærhet til fjord/kyst kan gi mildere vintre og
              kjøligere somre enn stasjoner noen kilometer lenger inn i landet.
            </p>
            <p>
              • <strong>Vindskjerming:</strong> Målestasjoner på flyplasser måler i åpent lende (10 m høyde).
              I hager og boligområder reduseres vindstyrken av trær og bygninger.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
