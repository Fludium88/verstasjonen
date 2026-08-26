'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  CalendarDays,
  CloudRain,
  Radio,
  Wind,
  Droplets,
  Clock,
  Compass,
  Layers,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from 'recharts';
import { WeatherIcon } from '../common/WeatherIcon';
import { formatNorwegianNumber } from '@/lib/weatherUtils';
import { isViewDataCacheFresh, readViewDataCache, writeViewDataCache } from '@/lib/viewDataCache';

interface ForecastViewProps {
  locationId: string;
  locationCacheKey: string;
}

// Keep the last usable forecast across browser restarts, but refresh it silently
// often enough that an open app does not present a day-old forecast as current.
const FORECAST_CACHE_REFRESH_AFTER_MS = 30 * 60_000;
const FORECAST_CACHE_RETENTION_MS = 24 * 60 * 60_000;

export const ForecastView: React.FC<ForecastViewProps> = ({ locationId, locationCacheKey }) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestAbortRef = useRef<AbortController | null>(null);

  const fetchForecast = useCallback(async (background = false) => {
    requestAbortRef.current?.abort();
    const controller = new AbortController();
    requestAbortRef.current = controller;
    if (!background) setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/weather/forecast?locationId=${encodeURIComponent(locationId)}`, {
        cache: 'no-store',
        signal: controller.signal,
      });
      if (res.ok) {
        const json = await res.json();
        if (!Array.isArray(json?.hourly) || json.hourly.length === 0) {
          throw new Error('MET returnerte ingen fremtidige prognosepunkter for dette stedet.');
        }
        if (!controller.signal.aborted) {
          setData(json);
          writeViewDataCache('forecast', locationCacheKey, json);
        }
      } else {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.error || 'Kunne ikke hente værprognoser fra tilgjengelige kilder.');
      }
    } catch (e: any) {
      if (controller.signal.aborted) return;
      console.error(e);
      setError(e.message || 'Nettverksfeil ved henting av prognosedata.');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [locationId, locationCacheKey]);

  useEffect(() => {
    const cached = readViewDataCache<any>('forecast', locationCacheKey, FORECAST_CACHE_RETENTION_MS);
    if (cached) {
      setData(cached.value);
      setLoading(false);
      setError(null);
      if (!isViewDataCacheFresh(cached, FORECAST_CACHE_REFRESH_AFTER_MS)) void fetchForecast(true);
    } else {
      setData(null);
      void fetchForecast();
    }
    return () => requestAbortRef.current?.abort();
  }, [fetchForecast, locationCacheKey]);

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center py-28 text-slate-400 space-y-3">
        <Clock className="w-7 h-7 animate-spin text-sky-400" />
        <span className="text-sm font-medium">Laster værprognoser fra tilgjengelige kilder...</span>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="met-glass-card rounded-2xl p-8 border border-rose-800/60 max-w-lg mx-auto text-center space-y-4 my-12">
        <AlertCircle className="w-10 h-10 text-rose-400 mx-auto" />
        <h2 className="text-lg font-bold text-white">Kunne ikke laste prognosedata</h2>
        <p className="text-xs text-slate-300">{error}</p>
        <button
          type="button"
          onClick={() => void fetchForecast()}
          className="inline-flex min-h-11 items-center gap-2 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold transition shadow-lg"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Prøv på nytt
        </button>
      </div>
    );
  }

  const {
    hourly = [],
    accumulation = {},
    daily = [],
    radar_available = false,
    forecast_run: forecastRun = null,
    location,
  } = data || {};
  const formatMetric = (value: number | null | undefined, suffix = '', decimals = 1) =>
    typeof value === 'number' && Number.isFinite(value)
      ? `${formatNorwegianNumber(value, decimals)}${suffix}`
      : 'Ikke tilgjengelig';
  const formatLocalDateTime = (value: string | null | undefined) => {
    if (!value) return 'ukjent tidspunkt';
    const timestamp = Date.parse(value);
    if (!Number.isFinite(timestamp)) return value;
    return new Intl.DateTimeFormat('nb-NO', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(timestamp));
  };
  const formatAge = (value: string | null | undefined) => {
    if (!value) return 'ukjent alder';
    const timestamp = Date.parse(value);
    if (!Number.isFinite(timestamp)) return 'ukjent alder';
    const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
    if (minutes < 2) return 'nettopp';
    if (minutes < 60) return `${minutes} min siden`;
    const hours = Math.floor(minutes / 60);
    if (hours < 48) return `${hours} t siden`;
    return `${Math.floor(hours / 24)} døgn siden`;
  };

  return (
    <div className="space-y-8 pb-12">
      {/* Header Info */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-800">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <CalendarDays className="w-6 h-6 text-sky-400" /> Prognose – {location?.name || 'sted ikke tilgjengelig'}
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            {forecastRun?.source_label || 'Ingen aktiv prognosekilde'}
            {radar_available ? ' · MET radarbasert Nowcast tilgjengelig' : ''}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {radar_available && (
            <span className="text-xs px-2.5 py-1 rounded-lg bg-sky-950/80 text-sky-400 border border-sky-600/40 flex items-center gap-1.5 font-medium">
              <Radio className="w-3.5 h-3.5 animate-pulse text-sky-400" /> Radar Nowcast aktiv
            </span>
          )}
        </div>
      </div>

      {error && data && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-800/60 bg-rose-950/30 px-4 py-3 text-xs text-rose-100">
          <span>{error} Eksisterende prognosevisning er beholdt.</span>
          <button
            type="button"
            onClick={() => void fetchForecast()}
            className="min-h-11 rounded-lg border border-rose-700 bg-rose-900/40 px-3 py-2 font-bold text-white"
          >
            Prøv på nytt
          </button>
        </div>
      )}

      {forecastRun?.is_delayed ? (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-amber-600/50 bg-amber-950/30 px-4 py-3 text-sm text-amber-100">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
          <div>
            <p className="font-bold">Prognosegrunnlaget er forsinket</p>
            <p className="mt-0.5 text-xs leading-relaxed text-amber-100/80">
              Sist hentet {formatLocalDateTime(forecastRun.retrieved_at)} ({formatAge(forecastRun.retrieved_at)}).
              Prognosen kan være eldre enn normalt og bør vurderes deretter.
            </p>
          </div>
        </div>
      ) : forecastRun ? (
        <p role="status" className="text-xs text-slate-400">
          Prognose hentet {formatLocalDateTime(forecastRun.retrieved_at)} ({formatAge(forecastRun.retrieved_at)})
          {forecastRun.model_run ? ` • Modellkjøring ${formatLocalDateTime(forecastRun.model_run)}` : ''}.
        </p>
      ) : (
        <p role="status" className="rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-3 text-xs text-slate-400">
          Ingen prognosekjøring er tilgjengelig. Manglende verdier vises som «Ikke tilgjengelig».
        </p>
      )}

      {/* 48-Hour Expected Precipitation Section */}
      <div className="met-glass-card rounded-2xl p-6 border border-slate-800/90 shadow-xl space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <CloudRain className="w-5 h-5 text-cyan-400" /> Forventet nedbør neste 48 timer
            </h2>
            <p className="text-xs text-slate-400">
              Akkumulerte nedbørsmengder fra aktiv prognosemodell, eventuelt supplert med MET radarnowcast
            </p>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1.5 text-sky-400">
              <span className="w-3 h-3 rounded bg-sky-400 inline-block" /> Radarbasert korttidsvarsel
            </span>
            <span className="flex items-center gap-1.5 text-blue-500">
              <span className="w-3 h-3 rounded bg-blue-600 inline-block" /> {forecastRun?.source_label || 'Værmodell'}
            </span>
          </div>
        </div>

        {/* Accumulation Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4">
            <span className="text-xs text-slate-400 block mb-1">Neste 6 timer</span>
            <span className="text-2xl font-bold text-white font-mono">{formatMetric(accumulation.next_6h_mm, ' mm')}</span>
          </div>
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4">
            <span className="text-xs text-slate-400 block mb-1">Neste 12 timer</span>
            <span className="text-2xl font-bold text-white font-mono">{formatMetric(accumulation.next_12h_mm, ' mm')}</span>
          </div>
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4">
            <span className="text-xs text-slate-400 block mb-1">Neste 24 timer</span>
            <span className="text-2xl font-bold text-cyan-300 font-mono">{formatMetric(accumulation.next_24h_mm, ' mm')}</span>
          </div>
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4">
            <span className="text-xs text-slate-400 block mb-1">Neste 48 timer</span>
            <span className="text-2xl font-bold text-cyan-400 font-mono">{formatMetric(accumulation.next_48h_mm, ' mm')}</span>
          </div>
        </div>

        {/* 48h Hourly Bar Chart */}
        {hourly.length > 0 ? <div className="h-64 w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={hourly} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="time_display" stroke="#64748b" tick={{ fontSize: 11 }} />
              <YAxis stroke="#64748b" tick={{ fontSize: 11 }} />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const d = payload[0].payload;
                    return (
                      <div className="bg-slate-900 border border-slate-700 p-3 rounded-xl shadow-xl text-xs space-y-1">
                        <p className="font-semibold text-white">
                          {d.date_display} kl. {d.time_display}
                        </p>
                        <p className="text-cyan-400 font-mono">
                          Nedbør: <span className="font-bold">{d.precipitation} mm</span>
                        </p>
                        <p className="text-slate-400">Kilde: {d.source_badge}</p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Bar dataKey="precipitation" radius={[4, 4, 0, 0]}>
                {hourly.map((entry: any, index: number) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={entry.precipitation_source_type === 'RADAR_NOWCAST' ? '#38bdf8' : '#2563eb'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div> : <p className="py-10 text-center text-sm text-slate-400">Ingen timeprognose er tilgjengelig.</p>}
      </div>

      {/* Hourly Detail Table */}
      <div className="met-glass-card rounded-2xl p-6 border border-slate-800/90 shadow-xl space-y-4">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <Clock className="w-5 h-5 text-sky-400" /> Neste timer – Detaljert timevarsel
        </h2>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-900/80 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
              <tr>
                <th className="py-3 px-3">Tid</th>
                <th className="py-3 px-3">Vær</th>
                <th className="py-3 px-3">Temp</th>
                <th className="py-3 px-3">Føles som</th>
                <th className="py-3 px-3">Nedbør</th>
                <th className="py-3 px-3">Sannsynlighet</th>
                <th className="py-3 px-3">Vind</th>
                <th className="py-3 px-3">Kast</th>
                <th className="py-3 px-3">Kilde</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {hourly.slice(0, 24).map((row: any, idx: number) => (
                <tr key={idx} className="hover:bg-slate-800/40 transition">
                  <td className="py-3 px-3 font-semibold text-white">{row.time_display}</td>
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-2 font-sans">
                      <WeatherIcon symbolCode={row.symbol_code} size={20} />
                      <span className="hidden sm:inline text-xs text-slate-300">{row.weather_text}</span>
                    </div>
                  </td>
                  <td className="py-3 px-3 font-bold text-white">{formatMetric(row.temperature, ' °C')}</td>
                  <td className="py-3 px-3 text-slate-400">{formatMetric(row.feels_like, ' °C')}</td>
                  <td className="py-3 px-3 font-semibold text-cyan-400">
                    {formatMetric(row.precipitation, ' mm')}
                  </td>
                  <td className="py-3 px-3 text-slate-400">
                    {row.precipitation_probability !== null ? `${row.precipitation_probability} %` : '–'}
                  </td>
                  <td className="py-3 px-3 text-sky-300">
                    {formatMetric(row.wind_speed, ' m/s')} {row.wind_cardinal ? `(${row.wind_cardinal})` : ''}
                  </td>
                  <td className="py-3 px-3 text-amber-300">{formatMetric(row.wind_gust, ' m/s')}</td>
                  <td className="py-3 px-3 font-sans">
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded ${
                        row.source_type === 'MIXED'
                          ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {row.source_badge || (row.source_type === 'MIXED' ? 'Modell + radar' : 'Værmodell')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {hourly.length === 0 && <p className="py-8 text-center text-sm text-slate-400">Ingen timeprognose er tilgjengelig.</p>}
        </div>
      </div>

      {/* 10-Day Long-Term Forecast Cards */}
      <div className="met-glass-card rounded-2xl p-6 border border-slate-800/90 shadow-xl space-y-4">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <Layers className="w-5 h-5 text-amber-400" /> Langtidsvarsel – Neste 10 dager
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
          {daily.map((day: any, idx: number) => (
            <div
              key={idx}
              className="bg-slate-900/70 border border-slate-800 hover:border-slate-700 p-4 rounded-xl flex flex-col justify-between space-y-3 transition"
            >
              <div>
                <span className="text-xs uppercase tracking-wider font-semibold text-sky-400 block capitalize">
                  {day.day_name}
                </span>
                <span className="text-[11px] text-slate-400 block">{day.date_formatted}</span>
              </div>

              <div className="flex items-center justify-between py-1">
                <WeatherIcon symbolCode={day.symbol_code} size={32} />
                <div className="text-right">
                  <span className="text-lg font-bold text-white font-mono block">
                    {formatMetric(day.temp_max, '°')}
                  </span>
                  <span className="text-xs text-cyan-300 font-mono block">
                    {formatMetric(day.temp_min, '°')}
                  </span>
                </div>
              </div>

              <div className="text-[11px] text-slate-300 truncate font-medium">{day.weather_text}</div>

              <div className="border-t border-slate-800/80 pt-2 text-[11px] flex items-center justify-between text-slate-400 font-mono">
                <span className="flex items-center gap-1 text-cyan-400">
                  <CloudRain className="w-3 h-3" /> {formatMetric(day.precip_total, ' mm')}
                </span>
                <span className="flex items-center gap-1 text-slate-400">
                  <Wind className="w-3 h-3" /> {formatMetric(day.wind_max, ' m/s')}
                </span>
              </div>
            </div>
          ))}
        </div>
        {daily.length === 0 && <p className="py-8 text-center text-sm text-slate-400">Ingen langtidsprognose er tilgjengelig.</p>}
      </div>
    </div>
  );
};
