'use client';

import React, { useState, useEffect } from 'react';
import { HardHat, CloudRain, Snowflake, Wind, ShieldAlert, CheckCircle, Clock, AlertTriangle, RefreshCw } from 'lucide-react';
import { ConstructionMetrics } from '@/types/weather';
import { formatNorwegianNumber } from '@/lib/weatherUtils';

interface ConstructionModeViewProps {
  locationId: string;
}

export const ConstructionModeView: React.FC<ConstructionModeViewProps> = ({ locationId }) => {
  const [data, setData] = useState<ConstructionMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryRevision, setRetryRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    fetchConstruction(controller.signal);
    return () => controller.abort();
  }, [locationId, retryRevision]);

  const fetchConstruction = async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/weather/construction?locationId=${locationId}`, {
        cache: 'no-store',
        signal,
      });
      if (res.ok) {
        const json = await res.json();
        if (!signal?.aborted) setData(json);
      } else {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || 'Kunne ikke hente anleggsdata.');
      }
    } catch (e: any) {
      if (signal?.aborted) return;
      console.error(e);
      setError(e?.message || 'Kunne ikke hente anleggsdata.');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-400">
        <Clock className="w-6 h-6 animate-spin text-sky-400 mr-2" />
        <span>Henter værgrunnlag for anleggsarbeid...</span>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="mx-auto my-16 max-w-lg rounded-2xl border border-rose-800/60 bg-rose-950/30 p-7 text-center">
        <AlertTriangle className="mx-auto h-8 w-8 text-rose-400" />
        <p role="alert" className="mt-3 text-sm text-slate-200">{error}</p>
        <button type="button" onClick={() => setRetryRevision((revision) => revision + 1)} className="mt-4 min-h-11 rounded-xl bg-sky-600 px-4 py-2 text-sm font-bold text-white">
          <RefreshCw className="mr-2 inline h-4 w-4" />Prøv på nytt
        </button>
      </div>
    );
  }

  if (!data) return null;

  const formatMetric = (value: number | null | undefined, suffix: string, decimals = 1) =>
    typeof value === 'number' && Number.isFinite(value)
      ? `${formatNorwegianNumber(value, decimals)}${suffix}`
      : 'Ikke tilgjengelig';

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'OPTIMAL':
        return (
          <span className="text-xs px-3 py-1 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5 font-bold">
            <CheckCircle className="w-3.5 h-3.5" /> Optimalt
          </span>
        );
      case 'ACCEPTABLE':
        return (
          <span className="text-xs px-3 py-1 rounded-lg bg-sky-500/20 text-sky-400 border border-sky-500/30 flex items-center gap-1.5 font-bold">
            <CheckCircle className="w-3.5 h-3.5" /> Akseptabelt
          </span>
        );
      case 'CAUTION':
        return (
          <span className="text-xs px-3 py-1 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-1.5 font-bold">
            <AlertTriangle className="w-3.5 h-3.5" /> Forsiktighet påkrevd
          </span>
        );
      case 'PROHIBITED':
        return (
          <span className="text-xs px-3 py-1 rounded-lg bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center gap-1.5 font-bold">
            <ShieldAlert className="w-3.5 h-3.5" /> Frarådes / Tiltak kreves
          </span>
        );
      default:
        return (
          <span className="text-xs px-3 py-1 rounded-lg bg-slate-700/50 text-slate-300 border border-slate-600 flex items-center gap-1.5 font-bold">
            <ShieldAlert className="w-3.5 h-3.5" /> Ikke tilgjengelig
          </span>
        );
    }
  };

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-800">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <HardHat className="w-6 h-6 text-amber-400" /> Bygg & Anleggsmodus – {data.location_name}
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Meteorologisk beslutningsgrunnlag for grunnarbeid, betong, kranløft og asfaltering
          </p>
        </div>

        <span className="text-xs text-slate-400 bg-slate-900 border border-slate-800 px-3 py-1 rounded-xl self-start sm:self-auto">
          Værgrunnlag for anlegg
        </span>
      </div>

      {/* Concrete & Asphalt Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Betongstøp status */}
        <div className="met-glass-card rounded-2xl p-6 border border-slate-800/90 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-white">Betongstøp & Herding</h3>
            {getStatusBadge(data.concrete_pouring_status)}
          </div>
          <p className="text-xs text-slate-300 leading-relaxed bg-slate-900/80 p-3 rounded-xl border border-slate-800">
            {data.concrete_notes}
          </p>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800">
              <span className="text-slate-400 block mb-0.5">Nåværende temperatur:</span>
              <span className="font-bold text-white font-mono">{formatMetric(data.current_temp, ' °C')}</span>
            </div>
            <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800">
              <span className="text-slate-400 block mb-0.5">Frosttimer siste 7d:</span>
              <span className="font-bold text-cyan-400 font-mono">{formatMetric(data.frost_hours_7d, ' timer', 0)}</span>
            </div>
          </div>
        </div>

        {/* Asfaltering status */}
        <div className="met-glass-card rounded-2xl p-6 border border-slate-800/90 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-white">Asfaltering & Vearbeid</h3>
            {getStatusBadge(data.asphalt_laying_status)}
          </div>
          <p className="text-xs text-slate-300 leading-relaxed bg-slate-900/80 p-3 rounded-xl border border-slate-800">
            {data.asphalt_notes}
          </p>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800">
              <span className="text-slate-400 block mb-0.5">Nedbør siste 24t:</span>
              <span className="font-bold text-cyan-400 font-mono">{formatMetric(data.rain_24h_mm, ' mm')}</span>
            </div>
            <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800">
              <span className="text-slate-400 block mb-0.5">Maks kast siste 24t:</span>
              <span className="font-bold text-amber-300 font-mono">
                {formatMetric(data.wind_gust_max_24h, ' m/s')}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Critical Construction Thresholds Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        {/* Nedbør akkumulering */}
        <div className="met-glass-card rounded-2xl p-5 border border-slate-800/90 shadow-xl space-y-3">
          <div className="flex items-center justify-between text-slate-300 font-semibold text-xs">
            <span>Akkumulert nedbør</span>
            <CloudRain className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">Siste 24 timer</span>
              <span className="font-mono font-bold text-white">{formatMetric(data.rain_24h_mm, ' mm')}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">Siste 72 timer</span>
              <span className="font-mono font-bold text-cyan-300">{formatMetric(data.rain_72h_mm, ' mm')}</span>
            </div>
            <div className="flex justify-between text-xs border-t border-slate-800 pt-1.5">
              <span className="text-slate-400">Siste 7 dager</span>
              <span className="font-mono font-bold text-cyan-400">{formatMetric(data.rain_7d_mm, ' mm')}</span>
            </div>
          </div>
        </div>

        {/* Frost & Kulde */}
        <div className="met-glass-card rounded-2xl p-5 border border-slate-800/90 shadow-xl space-y-3">
          <div className="flex items-center justify-between text-slate-300 font-semibold text-xs">
            <span>Frost og kuldegrader</span>
            <Snowflake className="w-4 h-4 text-sky-300" />
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">Frosttimer (7 dager)</span>
              <span className="font-mono font-bold text-white">{formatMetric(data.frost_hours_7d, ' timer', 0)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">Frostdøgn (30 dager)</span>
              <span className="font-mono font-bold text-sky-300">{formatMetric(data.frost_days_30d, ' dager', 0)}</span>
            </div>
            <div className="flex justify-between text-xs border-t border-slate-800 pt-1.5">
              <span className="text-slate-400">Nåværende frost</span>
              <span
                className={`font-mono font-bold ${
                  data.is_below_freezing === null
                    ? 'text-slate-400'
                    : data.is_below_freezing
                    ? 'text-rose-400'
                    : 'text-emerald-400'
                }`}
              >
                {data.is_below_freezing === null
                  ? 'Ikke tilgjengelig'
                  : data.is_below_freezing
                  ? 'Ja (< 0 °C)'
                  : 'Nei (plussgrader)'}
              </span>
            </div>
          </div>
        </div>

        {/* Vind & Kranarbeid */}
        <div className="met-glass-card rounded-2xl p-5 border border-slate-800/90 shadow-xl space-y-3">
          <div className="flex items-center justify-between text-slate-300 font-semibold text-xs">
            <span>Kran og vindgrenser</span>
            <Wind className="w-4 h-4 text-amber-400" />
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">Maks kast (24t)</span>
              <span className="font-mono font-bold text-amber-300">{formatMetric(data.wind_gust_max_24h, ' m/s')}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">Timer med vind &gt; 15 m/s</span>
              <span className="font-mono font-bold text-white">{formatMetric(data.wind_above_15ms_hours, ' timer', 0)}</span>
            </div>
            <div className="flex justify-between text-xs border-t border-slate-800 pt-1.5">
              <span className="text-slate-400">Kranstatus (&gt; 14 m/s)</span>
              <span
                className={`font-mono font-bold ${
                  data.wind_gust_max_24h === null
                    ? 'text-slate-400'
                    : data.wind_gust_max_24h >= 14
                    ? 'text-amber-400'
                    : 'text-emerald-400'
                }`}
              >
                {data.wind_gust_max_24h === null
                  ? 'Ikke tilgjengelig'
                  : data.wind_gust_max_24h >= 14
                  ? 'Vindkast over grense'
                  : 'Under valgt grense'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
