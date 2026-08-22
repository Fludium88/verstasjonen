'use client';

import React, { useState, useEffect } from 'react';
import { Target, Clock, HelpCircle, BarChart3, RefreshCw, AlertTriangle } from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  ReferenceLine,
} from 'recharts';
import { ForecastAccuracyItem } from '@/types/weather';
import { formatNorwegianNumber, getTemperatureDomain, formatNorwegianDate } from '@/lib/weatherUtils';

interface ForecastAccuracyViewProps {
  locationId: string;
}

interface AccuracyPair {
  valid_at: string;
  lead_time_hours: number;
  temp_forecast: number | null;
  temp_observed: number | null;
  precip_forecast: number | null;
  precip_observed: number | null;
}

const formatAvailable = (value: number | null | undefined, digits = 1) =>
  value === null || value === undefined || !Number.isFinite(value)
    ? 'Ikke tilgjengelig'
    : formatNorwegianNumber(value, digits);

export const ForecastAccuracyView: React.FC<ForecastAccuracyViewProps> = ({ locationId }) => {
  const [metrics, setMetrics] = useState<ForecastAccuracyItem[]>([]);
  const [recentPairs, setRecentPairs] = useState<AccuracyPair[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [selectedLeadTime, setSelectedLeadTime] = useState<number>(24);

  useEffect(() => {
    const controller = new AbortController();
    const fetchAccuracy = async () => {
      setLoading(true);
      setError(null);
      setMetrics([]);
      setRecentPairs([]);
      try {
        const res = await fetch(`/api/weather/accuracy?locationId=${encodeURIComponent(locationId)}`, {
          signal: controller.signal,
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || 'Kunne ikke hente treffsikkerhetsdata.');
        }
        const json = await res.json();
        if (!controller.signal.aborted) {
          setMetrics(Array.isArray(json.metrics) ? json.metrics : []);
          setRecentPairs(Array.isArray(json.recentPairs) ? json.recentPairs : []);
        }
      } catch (caught) {
        if (!controller.signal.aborted) {
          setError(caught instanceof Error ? caught.message : 'Kunne ikke hente treffsikkerhetsdata.');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void fetchAccuracy();
    return () => controller.abort();
  }, [locationId, reloadKey]);

  const activeMetric = metrics.find((m) => m.lead_time_hours === selectedLeadTime);

  const chartData = (recentPairs || []).map((p) => {
    const dt = new Date(p.valid_at);
    return {
      time: formatNorwegianDate(dt, { day: 'numeric', month: 'short' }),
      temp_forecast: p.temp_forecast,
      temp_observed: p.temp_observed,
      precip_forecast: p.precip_forecast,
      precip_observed: p.precip_observed,
    };
  });

  // Calculate well-proportioned temperature Y-axis domain for comparison chart
  const tempAccuracyDomain = React.useMemo(() => {
    const vals = (chartData || [])
      .flatMap((d) => [d.temp_forecast, d.temp_observed])
      .filter((v): v is number => typeof v === 'number' && !isNaN(v));

    if (vals.length === 0) return [0, 20];
    return getTemperatureDomain(Math.min(...vals), Math.max(...vals), 8);
  }, [chartData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-400">
        <Clock className="w-6 h-6 animate-spin text-sky-400 mr-2" />
        <span>Beregner treffsikkerhet mot lagrede prognosesnapshots...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div role="alert" className="mx-auto my-16 max-w-lg rounded-2xl border border-rose-500/40 bg-rose-950/30 p-6 text-center">
        <AlertTriangle className="mx-auto h-7 w-7 text-rose-300" aria-hidden="true" />
        <p className="mt-3 text-sm font-semibold text-rose-100">Treffsikkerhetsdata kunne ikke lastes</p>
        <p className="mt-1 text-xs text-rose-200/80">{error}</p>
        <button
          type="button"
          onClick={() => setReloadKey((value) => value + 1)}
          className="mx-auto mt-4 flex min-h-11 items-center justify-center gap-2 rounded-xl border border-rose-400/40 bg-rose-900/50 px-4 py-2 text-xs font-semibold text-white"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" /> Prøv igjen
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-800">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <Target className="w-6 h-6 text-sky-400" /> Treffsikkerhet – Varsel vs Faktisk Vær
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Automatisk statistisk verifikasjon basert på lagrede prognosesnapshots mot faktiske observasjoner
          </p>
        </div>

        {/* Lead time switcher */}
        <div className="flex max-w-full items-center gap-1 overflow-x-auto bg-slate-900/90 p-1 rounded-xl border border-slate-800 self-start sm:self-auto">
          {[1, 6, 12, 24, 48].map((hours) => (
            <button
              type="button"
              key={hours}
              onClick={() => setSelectedLeadTime(hours)}
              aria-pressed={selectedLeadTime === hours}
              className={`min-h-11 min-w-11 px-3 py-2 rounded-lg text-xs font-semibold transition ${
                selectedLeadTime === hours
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              +{hours}t
            </button>
          ))}
        </div>
      </div>

      {metrics.length === 0 && (
        <div role="status" className="rounded-xl border border-slate-700 bg-slate-900/60 p-4 text-sm text-slate-300">
          Det finnes ennå ingen verifiserte prognoser for dette stedet. Statistikken vises når en tidligere prognose kan sammenlignes med en faktisk måling.
        </div>
      )}

      {/* Selected Lead-Time Performance Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Temperatur MAE */}
        <div className="met-glass-card rounded-2xl p-5 border border-slate-800/90 shadow-xl space-y-2">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              Temperaturfeil (MAE)
            </span>
            <span className="text-xs px-2 py-0.5 rounded bg-sky-500/20 text-sky-400 font-mono">
              +{selectedLeadTime}t varsel
            </span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-bold text-white font-mono">
              {activeMetric?.temp_mae == null ? 'Ikke tilgjengelig' : `±${formatAvailable(activeMetric.temp_mae, 1)}`}
            </span>
            {activeMetric?.temp_mae != null && <span className="text-sm text-slate-400">°C</span>}
          </div>
          <p className="text-xs text-slate-400">
            Gjennomsnittlig avvik mellom varslet og observert temperatur.
          </p>
        </div>

        {/* Nedbør Varslet vs Observert */}
        <div className="met-glass-card rounded-2xl p-5 border border-slate-800/90 shadow-xl space-y-2">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              Nedbør: Varslet vs Faktisk
            </span>
            <span className="text-xs px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-400 font-mono">
              Siste 30 d
            </span>
          </div>
          <div className="flex items-baseline gap-2 font-mono">
            <div>
              <span className="text-xs text-slate-400 block">Varslet:</span>
              <span className="text-2xl font-bold text-sky-300">
                {activeMetric?.precip_forecast_sum == null
                  ? 'Ikke tilgjengelig'
                  : `${formatAvailable(activeMetric.precip_forecast_sum, 1)} mm`}
              </span>
            </div>
            <span className="text-xl text-slate-600 font-light">/</span>
            <div>
              <span className="text-xs text-slate-400 block">Faktisk:</span>
              <span className="text-2xl font-bold text-cyan-400">
                {activeMetric?.precip_observed_sum == null
                  ? 'Ikke tilgjengelig'
                  : `${formatAvailable(activeMetric.precip_observed_sum, 1)} mm`}
              </span>
            </div>
          </div>
          <p className="text-xs text-slate-400">
            {activeMetric?.precip_mae == null
              ? 'Nedbørs-MAE er ikke tilgjengelig ennå.'
              : `Nedbørs-MAE: ±${formatAvailable(activeMetric.precip_mae, 1)} mm per hendelse.`}
          </p>
        </div>

        {/* Vind MAE */}
        <div className="met-glass-card rounded-2xl p-5 border border-slate-800/90 shadow-xl space-y-2">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              Vindstyrke-avvik (MAE)
            </span>
            <span className="text-xs px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 font-mono">
              Middelvind
            </span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-bold text-white font-mono">
              {formatAvailable(activeMetric?.wind_mae, 1)}
            </span>
            {activeMetric?.wind_mae != null && <span className="text-sm text-slate-400">m/s</span>}
          </div>
          <p className="text-xs text-slate-400">
            Gjennomsnittlig differanse på varslet vs målt vindstyrke.
          </p>
        </div>
      </div>

      {/* Comparison Chart: Forecast vs Actual Curves */}
      <div className="met-glass-card rounded-2xl p-6 border border-slate-800/90 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-sky-400" />
              Temperatur: Varslet 24 timer i forveien (Blå) mot Observert måling (Grønn)
            </h3>
            <p className="text-xs text-slate-400">
              Viser hvor tett værprognosen fulgte den faktiske temperaturutviklingen
            </p>
          </div>
        </div>

        {chartData.length > 0 ? <div className="h-72 w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="time" stroke="#64748b" tick={{ fontSize: 11 }} />
              <YAxis
                stroke="#64748b"
                tick={{ fontSize: 11 }}
                domain={tempAccuracyDomain}
                tickFormatter={(v) => `${v}°`}
              />
              {tempAccuracyDomain[0] <= 0 && tempAccuracyDomain[1] >= 0 && (
                <ReferenceLine y={0} stroke="#38bdf8" strokeDasharray="3 3" strokeOpacity={0.4} />
              )}
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const d = payload[0].payload;
                    return (
                      <div className="bg-slate-900 border border-slate-700 p-3 rounded-xl shadow-xl text-xs space-y-1 font-mono">
                        <p className="font-semibold text-white font-sans">{d.time}</p>
                        <p className="text-sky-400">Varsel (+24t): {d.temp_forecast == null ? 'Ikke tilgjengelig' : `${formatAvailable(d.temp_forecast, 1)} °C`}</p>
                        <p className="text-emerald-400">Faktisk målt: {d.temp_observed == null ? 'Ikke tilgjengelig' : `${formatAvailable(d.temp_observed, 1)} °C`}</p>
                        {d.temp_forecast != null && d.temp_observed != null && (
                          <p className="text-slate-300">
                            Avvik: {formatAvailable(Math.abs(d.temp_forecast - d.temp_observed), 1)} °C
                          </p>
                        )}
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Legend
                verticalAlign="top"
                height={36}
                formatter={(val) => (
                  <span className="text-xs text-slate-300">
                    {val === 'temp_forecast' ? 'Varslet temperatur' : 'Faktisk målt temperatur'}
                  </span>
                )}
              />
              <Line
                name="temp_forecast"
                type="monotone"
                dataKey="temp_forecast"
                stroke="#38bdf8"
                strokeWidth={2}
                dot={false}
              />
              <Line
                name="temp_observed"
                type="monotone"
                dataKey="temp_observed"
                stroke="#10b981"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div> : (
          <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-slate-700 text-center text-sm text-slate-400">
            Ingen verifiserte temperaturpar er tilgjengelige ennå.
          </div>
        )}
      </div>

      {/* Snapshot Database Information Card */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 flex items-start gap-4 text-xs text-slate-400">
        <div className="p-2 rounded-xl bg-sky-500/10 text-sky-400 shrink-0">
          <HelpCircle className="w-5 h-5" />
        </div>
        <div className="space-y-1">
          <h4 className="font-bold text-slate-200 text-sm">Hvordan fungerer treffsikkerhetsanalysen?</h4>
          <p className="leading-relaxed">
            Hver gang Værstasjonen henter en ny værmelding fra MET Norway, lagres hele prognosen som et uforanderlig
            snapshot i databasen. Når det aktuelle tidspunktet er passert og målestasjonsdata foreligger, kobles
            prognosen mot den faktiske observasjonen. Dette gjør at du over tid kan se nøyaktig hvor presise 24- og
            48-timersvarslene er for ditt spesifikke sted.
          </p>
        </div>
      </div>
    </div>
  );
};
