'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Radio,
  MapPin,
  CheckCircle2,
  ShieldCheck,
  Clock,
  ExternalLink,
  Settings2,
  Sliders,
  Search,
  RefreshCw,
  Thermometer,
  CloudRain,
  Wind,
  Gauge,
  Droplets,
  Snowflake,
  Layers,
  Sparkles,
  Info,
  ChevronRight,
  Database,
  Satellite,
  Check,
} from 'lucide-react';
import { WeatherStation } from '@/types/weather';

type StationWithDistance = WeatherStation & { distance_km: number; score?: number };

interface StationRecommendationPayload {
  element: string;
  label: string;
  bestStation: StationWithDistance | null;
  availableStations?: StationWithDistance[];
}

interface DataSourcesViewProps {
  locationId: string;
  onRefresh: () => void;
  onNavigateToCalibration?: () => void;
}

export const DataSourcesView: React.FC<DataSourcesViewProps> = ({
  locationId,
  onRefresh,
  onNavigateToCalibration,
}) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [discovering, setDiscovering] = useState(false);
  const [savingMapping, setSavingMapping] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'near' | 'temp' | 'wind' | 'rain' | 'pressure'>('all');
  const [error, setError] = useState<string | null>(null);
  const requestAbortRef = useRef<AbortController | null>(null);
  const mappingAbortRef = useRef<AbortController | null>(null);
  const locationIdRef = useRef(locationId);
  locationIdRef.current = locationId;

  useEffect(() => {
    setData(null);
    void fetchStations();
    return () => {
      requestAbortRef.current?.abort();
      mappingAbortRef.current?.abort();
    };
  }, [locationId]);

  const fetchStations = async (discover = false) => {
    requestAbortRef.current?.abort();
    const controller = new AbortController();
    requestAbortRef.current = controller;
    const requestedLocationId = locationId;
    if (discover) {
      setDiscovering(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const url = `/api/weather/stations?locationId=${locationId}${discover ? '&discover=true' : ''}`;
      const res = await fetch(url, { cache: 'no-store', signal: controller.signal });
      if (res.ok) {
        const json = await res.json();
        if (!controller.signal.aborted && requestedLocationId === locationIdRef.current) setData(json);
      } else {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || 'Kunne ikke hente datakilder.');
      }
    } catch (e: any) {
      if (controller.signal.aborted) return;
      console.error('Failed to fetch weather stations:', e);
      setError(e?.message || 'Kunne ikke hente datakilder.');
    } finally {
      if (!controller.signal.aborted && requestedLocationId === locationIdRef.current) {
        setLoading(false);
        setDiscovering(false);
      }
    }
  };

  const handleStationChange = async (element: string, stationId: string) => {
    mappingAbortRef.current?.abort();
    const controller = new AbortController();
    mappingAbortRef.current = controller;
    const requestedLocationId = locationId;
    setSavingMapping(element);
    setError(null);
    try {
      const res = await fetch('/api/weather/stations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locationId, element, stationId }),
        signal: controller.signal,
      });
      if (res.ok && !controller.signal.aborted && requestedLocationId === locationIdRef.current) {
        await fetchStations();
        onRefresh();
      } else if (!res.ok && !controller.signal.aborted && requestedLocationId === locationIdRef.current) {
        const body = await res.json().catch(() => null);
        setError(body?.error || 'Kunne ikke oppdatere målestasjonsvalget.');
      }
    } catch (e: any) {
      if (controller.signal.aborted) return;
      console.error('Failed to update station mapping:', e);
      if (requestedLocationId === locationIdRef.current) {
        setError(e?.message || 'Nettverksfeil ved oppdatering av målestasjonsvalget.');
      }
    } finally {
      if (mappingAbortRef.current === controller) setSavingMapping(null);
    }
  };

  const {
    location,
    recommendations = [] as StationRecommendationPayload[],
    allStations = [] as WeatherStation[],
    frostConfigured = false,
  } = data || {};
  const formatDistance = (value: number | null | undefined) =>
    typeof value === 'number' && Number.isFinite(value) ? `${value} km` : 'Ikke tilgjengelig';
  const formatAltitude = (value: number | null | undefined) =>
    typeof value === 'number' && Number.isFinite(value) ? `${value} moh.` : 'Ukjent høyde';

  // Filter stations for the catalog view
  const filteredStations = (() => {
    if (!allStations) return [];
    return allStations.filter((st: WeatherStation & { distance_km?: number }) => {
      // Text search
      const q = searchQuery.toLowerCase().trim();
      const matchesText =
        !q ||
        st.name.toLowerCase().includes(q) ||
        st.id.toLowerCase().includes(q) ||
        (st.elements_supported && st.elements_supported.some((e) => e.toLowerCase().includes(q)));

      if (!matchesText) return false;

      // Filter chips
      if (selectedFilter === 'near') {
        return (st.distance_km ?? 999) <= 30;
      }
      if (selectedFilter === 'temp') {
        return st.elements_supported?.includes('air_temperature');
      }
      if (selectedFilter === 'wind') {
        return st.elements_supported?.includes('wind_speed');
      }
      if (selectedFilter === 'rain') {
        return st.elements_supported?.includes('precipitation_amount');
      }
      if (selectedFilter === 'pressure') {
        return st.elements_supported?.includes('air_pressure_at_sea_level');
      }

      return true;
    });
  })();

  const getElementIcon = (elementKey: string) => {
    switch (elementKey) {
      case 'temperature':
        return <Thermometer className="w-4 h-4 text-amber-400" />;
      case 'precipitation':
        return <CloudRain className="w-4 h-4 text-blue-400" />;
      case 'wind':
        return <Wind className="w-4 h-4 text-teal-400" />;
      case 'pressure':
        return <Gauge className="w-4 h-4 text-purple-400" />;
      case 'humidity':
        return <Droplets className="w-4 h-4 text-cyan-400" />;
      case 'snow':
        return <Snowflake className="w-4 h-4 text-sky-300" />;
      default:
        return <Radio className="w-4 h-4 text-sky-400" />;
    }
  };

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-slate-400 space-y-3">
        <Clock className="w-8 h-8 animate-spin text-sky-400" />
        <span className="text-sm font-medium">Henter målestasjoner og kildekonfigurasjon...</span>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="mx-auto my-16 max-w-lg rounded-2xl border border-rose-800/60 bg-rose-950/30 p-7 text-center">
        <Info className="mx-auto h-8 w-8 text-rose-400" />
        <p role="alert" className="mt-3 text-sm text-slate-200">{error}</p>
        <button type="button" onClick={() => fetchStations()} className="mt-4 min-h-11 rounded-xl bg-sky-600 px-4 py-2 text-sm font-bold text-white">
          Prøv på nytt
        </button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-8 pb-12">
      {/* 1. Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
              <Radio className="w-6 h-6 text-sky-400" /> Datakilder & Målestasjonsnettverk
            </h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Oversikt over meteorologiske kilder og målere som leverer data for{' '}
            <strong className="text-white">{location?.name || 'Sted ikke tilgjengelig'}</strong>{' '}
            {typeof location?.latitude === 'number' && typeof location?.longitude === 'number'
              ? `(${location.latitude.toFixed(3)}°N, ${location.longitude.toFixed(3)}°E)`
              : '(koordinater ikke tilgjengelig)'}
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto flex-wrap">
          <button
            type="button"
            onClick={() => fetchStations(true)}
            disabled={discovering}
            className="px-3 py-1.5 rounded-xl bg-sky-600/20 hover:bg-sky-600 text-sky-300 hover:text-white border border-sky-500/40 text-xs font-semibold flex items-center gap-1.5 transition shadow-sm disabled:opacity-50"
            title="Søk etter aktive MET Frost-målestasjoner rundt denne posisjonen"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${discovering ? 'animate-spin' : ''}`} />
            <span>{discovering ? 'Søker Frost API...' : 'Søk stasjoner'}</span>
          </button>

          {onNavigateToCalibration && (
            <button
              type="button"
              onClick={onNavigateToCalibration}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition shadow-sm"
            >
              <Sliders className="w-3.5 h-3.5 text-sky-400" />
              <span>Sensorkalibrering</span>
            </button>
          )}

          <span className="text-xs px-3 py-1.5 rounded-xl bg-slate-800 text-slate-300 border border-slate-700 flex items-center gap-1.5 font-medium">
            <CheckCircle2 className="w-3.5 h-3.5" /> Kildeoversikt lastet
          </span>
        </div>
      </div>

      {/* 2. Pipeline Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-[#0e1628] border border-slate-800/90 rounded-2xl p-4 shadow-lg flex flex-col justify-between space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Prognosemodell</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 font-semibold border border-emerald-500/30">
              MET
            </span>
          </div>
          <div>
            <div className="text-sm font-bold text-white flex items-center gap-1.5">
              <Satellite className="w-4 h-4 text-sky-400" /> Locationforecast 2.0
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">MET Norway / MEPS & IFS</p>
          </div>
          <p className="text-[10px] text-slate-500 pt-1 border-t border-slate-800/80">
            Høyoppløselig numerisk modell for eksakte koordinater
          </p>
        </div>

        <div className="bg-[#0e1628] border border-slate-800/90 rounded-2xl p-4 shadow-lg flex flex-col justify-between space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Nedbørsradar</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 font-semibold border border-emerald-500/30">
              VED TILGJENGELIGHET
            </span>
          </div>
          <div>
            <div className="text-sm font-bold text-white flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-amber-400" /> Nowcast 2.0
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">MET Radar 0–2 timer</p>
          </div>
          <p className="text-[10px] text-slate-500 pt-1 border-t border-slate-800/80">
            Oppdaterte nedbørsradardata med 5-minutters oppløsning
          </p>
        </div>

        <div className="bg-[#0e1628] border border-slate-800/90 rounded-2xl p-4 shadow-lg flex flex-col justify-between space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Målenettverk</span>
            <span
              className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${
                frostConfigured
                  ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                  : 'bg-sky-500/15 text-sky-300 border-sky-500/30'
              }`}
            >
              {frostConfigured ? 'FROST API KONFIGURERT' : 'OFFISIELL KATALOG'}
            </span>
          </div>
          <div>
            <div className="text-sm font-bold text-white flex items-center gap-1.5">
              <Database className="w-4 h-4 text-emerald-400" /> MET Frost Observasjoner
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">{allStations.length} stasjoner registrert</p>
          </div>
          <p className="text-[10px] text-slate-500 pt-1 border-t border-slate-800/80">
            Nasjonalt nettverk av offisielle målestasjoner
          </p>
        </div>

        <div className="bg-[#0e1628] border border-slate-800/90 rounded-2xl p-4 shadow-lg flex flex-col justify-between space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Parameter-ruting</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 font-semibold border border-emerald-500/30">
              AUTOMATISK VALG
            </span>
          </div>
          <div>
            <div className="text-sm font-bold text-white flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-purple-400" /> Virtual Station Resolver
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">Avstand + Høyde + Kvalitet</p>
          </div>
          <p className="text-[10px] text-slate-500 pt-1 border-t border-slate-800/80">
            Velger den mest representative måleren per sensor når målinger er tilgjengelige
          </p>
        </div>
      </div>

      {/* 3. Section: Valgte målestasjoner per værelement */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-sky-400" /> Valgte målestasjoner per værelement
          </h2>
          <span className="text-xs text-slate-400">
            Automatisk kildevalg for {location?.name || 'sted ikke tilgjengelig'}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {recommendations.map((rec: StationRecommendationPayload) => {
            const best = rec.bestStation;
            return (
              <div
                key={rec.element}
                className="met-glass-card rounded-2xl p-5 border border-slate-800/90 shadow-xl space-y-3.5 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
                    <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                      {getElementIcon(rec.element)}
                      {rec.label}
                    </span>
                    <span
                      className={`text-[11px] px-2 py-0.5 rounded border font-semibold ${
                        best
                          ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                          : 'bg-slate-800 text-slate-300 border-slate-700'
                      }`}
                    >
                      {best ? 'MÅLESTASJON VALGT' : 'INGEN MÅLING'}
                    </span>
                  </div>

                  {best ? (
                    <div className="space-y-1 pt-3">
                      <div className="flex flex-wrap items-center justify-between gap-1">
                        <span className="text-base font-bold text-sky-300">{best.name}</span>
                        <span className="text-[11px] text-slate-400 font-mono">{best.id}</span>
                      </div>
                      <p className="text-xs text-slate-300">
                        Avstand: <strong className="text-white font-mono">{formatDistance(best.distance_km)}</strong> •
                        Høyde: <strong className="text-white font-mono">{formatAltitude(best.altitude)}</strong>
                      </p>
                    </div>
                  ) : (
                    <p className="pt-3 text-xs leading-relaxed text-slate-400">
                      Ingen egnet målestasjon er tilgjengelig for dette værelementet. Verdien vises ikke som målt før
                      en faktisk målekilde foreligger.
                    </p>
                  )}
                </div>

                {/* Switcher selector */}
                <div className="pt-2.5 border-t border-slate-800/60">
                  <label className="block text-[11px] text-slate-400 mb-1 font-medium">
                    Overstyr valgt målestasjon:
                  </label>
                  <select
                    value={best?.id ?? ''}
                    onChange={(e) => handleStationChange(rec.element, e.target.value)}
                    disabled={savingMapping === rec.element || !rec.availableStations?.length}
                    className="w-full min-h-11 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500 font-mono disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {!best && <option value="">Ingen målestasjon valgt</option>}
                    {rec.availableStations?.map((st) => (
                      <option key={st.id} value={st.id}>
                        {st.name} ({formatDistance(st.distance_km)}, {formatAltitude(st.altitude)})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            );
          })}
          {recommendations.length === 0 && (
            <p className="md:col-span-2 lg:col-span-3 rounded-2xl border border-slate-800 bg-slate-900/50 p-6 text-center text-sm text-slate-400">
              Ingen målestasjonsanbefalinger er tilgjengelige for dette stedet.
            </p>
          )}
        </div>
      </div>

      {/* 4. Section: Komplett Målestasjonskatalog */}
      <div className="met-glass-card rounded-2xl p-6 border border-slate-800/90 shadow-xl space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Database className="w-5 h-5 text-emerald-400" /> Målestasjonskatalog ({allStations.length} målere)
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Alle registrerte målestasjoner med beregnet avstand til {location?.name}
            </p>
          </div>

          {/* Search bar */}
          <label className="relative min-w-[240px]" htmlFor="station-search">
            <span className="sr-only">Søk i målestasjonskatalogen</span>
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              id="station-search"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Søk på stasjonsnavn, ID, sensor..."
              className="w-full min-h-11 pl-9 pr-4 py-2 bg-slate-900 border border-slate-700/80 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 transition"
            />
          </label>
        </div>

        {/* Filter Chips */}
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <button
            type="button"
            onClick={() => setSelectedFilter('all')}
            className={`px-3 py-1 rounded-lg border transition ${
              selectedFilter === 'all'
                ? 'bg-sky-600 text-white border-sky-500'
                : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:text-white'
            }`}
          >
            Alle ({allStations.length})
          </button>
          <button
            type="button"
            onClick={() => setSelectedFilter('near')}
            className={`px-3 py-1 rounded-lg border transition ${
              selectedFilter === 'near'
                ? 'bg-sky-600 text-white border-sky-500'
                : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:text-white'
            }`}
          >
            Nærområde (&le; 30 km)
          </button>
          <button
            type="button"
            onClick={() => setSelectedFilter('temp')}
            className={`px-3 py-1 rounded-lg border transition ${
              selectedFilter === 'temp'
                ? 'bg-sky-600 text-white border-sky-500'
                : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:text-white'
            }`}
          >
            Temperatur
          </button>
          <button
            type="button"
            onClick={() => setSelectedFilter('wind')}
            className={`px-3 py-1 rounded-lg border transition ${
              selectedFilter === 'wind'
                ? 'bg-sky-600 text-white border-sky-500'
                : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:text-white'
            }`}
          >
            Vind
          </button>
          <button
            type="button"
            onClick={() => setSelectedFilter('rain')}
            className={`px-3 py-1 rounded-lg border transition ${
              selectedFilter === 'rain'
                ? 'bg-sky-600 text-white border-sky-500'
                : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:text-white'
            }`}
          >
            Nedbør
          </button>
          <button
            type="button"
            onClick={() => setSelectedFilter('pressure')}
            className={`px-3 py-1 rounded-lg border transition ${
              selectedFilter === 'pressure'
                ? 'bg-sky-600 text-white border-sky-500'
                : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:text-white'
            }`}
          >
            Lufttrykk
          </button>
        </div>

        {/* Stations Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                <th className="py-3 px-3">Målestasjon & ID</th>
                <th className="py-3 px-3">Avstand</th>
                <th className="py-3 px-3">Høyde</th>
                <th className="py-3 px-3">Støttede sensorer</th>
                <th className="py-3 px-3">Kilde & Kvalitet</th>
                <th className="py-3 px-3 text-right">Bruk stasjon</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredStations.map((st: WeatherStation & { distance_km?: number }) => {
                const isNearby = (st.distance_km ?? 999) <= 25;
                const isSelectedForAny = recommendations.some((r: any) => r.bestStation?.id === st.id);

                return (
                  <tr
                    key={st.id}
                    className={`hover:bg-slate-800/40 transition group ${
                      isSelectedForAny ? 'bg-sky-950/20' : ''
                    }`}
                  >
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2">
                        <div>
                          <div className="font-bold text-white flex items-center gap-1.5">
                            {st.name}
                            {isSelectedForAny && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 font-semibold border border-sky-500/30">
                                I BRUK
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-400 font-mono">{st.id}</div>
                        </div>
                      </div>
                    </td>

                    <td className="py-3 px-3 font-mono font-medium">
                      <span
                        className={
                          st.distance_km !== undefined && st.distance_km <= 10
                            ? 'text-emerald-400 font-bold'
                            : isNearby
                            ? 'text-sky-300'
                            : 'text-slate-400'
                        }
                      >
                        {formatDistance(st.distance_km)}
                      </span>
                    </td>

                    <td className="py-3 px-3 font-mono text-slate-300">{formatAltitude(st.altitude)}</td>

                    <td className="py-3 px-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {st.elements_supported?.includes('air_temperature') && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 font-medium">
                            Temp
                          </span>
                        )}
                        {st.elements_supported?.includes('precipitation_amount') && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-300 border border-blue-500/30 font-medium">
                            Nedbør
                          </span>
                        )}
                        {st.elements_supported?.includes('wind_speed') && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-teal-500/15 text-teal-300 border border-teal-500/30 font-medium">
                            Vind
                          </span>
                        )}
                        {st.elements_supported?.includes('air_pressure_at_sea_level') && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-300 border border-purple-500/30 font-medium">
                            Trykk
                          </span>
                        )}
                        {st.elements_supported?.includes('relative_humidity') && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 font-medium">
                            Fukt
                          </span>
                        )}
                        {st.elements_supported?.includes('surface_snow_thickness') && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-300/15 text-sky-200 border border-sky-300/30 font-medium">
                            Snø
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="py-3 px-3">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 font-mono">
                          {st.source_type || 'Ukjent kilde'}
                        </span>
                        <span className="text-[10px] text-emerald-400 font-mono">
                          {typeof st.quality_rating === 'number'
                            ? `${Math.round(st.quality_rating * 100)}%`
                            : 'Ikke tilgjengelig'}
                        </span>
                      </div>
                    </td>

                    <td className="py-3 px-3 text-right">
                      <div className="relative inline-block">
                        <select
                          value=""
                          onChange={(e) => {
                            if (e.target.value) {
                              handleStationChange(e.target.value, st.id);
                            }
                          }}
                          disabled={Boolean(savingMapping)}
                          className="min-h-11 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700 rounded-lg px-2.5 py-1 text-[11px] font-medium transition cursor-pointer focus:outline-none focus:border-sky-500"
                        >
                          <option value="">Tilordne sensor...</option>
                          {st.elements_supported?.includes('air_temperature') && (
                            <option value="temperature">Bruk til Temperatur</option>
                          )}
                          {st.elements_supported?.includes('precipitation_amount') && (
                            <option value="precipitation">Bruk til Nedbør</option>
                          )}
                          {st.elements_supported?.includes('wind_speed') && (
                            <option value="wind">Bruk til Vind</option>
                          )}
                          {st.elements_supported?.includes('air_pressure_at_sea_level') && (
                            <option value="pressure">Bruk til Lufttrykk</option>
                          )}
                          {st.elements_supported?.includes('relative_humidity') && (
                            <option value="humidity">Bruk til Luftfuktighet</option>
                          )}
                          {st.elements_supported?.includes('surface_snow_thickness') && (
                            <option value="snow">Bruk til Snødybde</option>
                          )}
                        </select>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {filteredStations.length === 0 && (
            <div className="py-8 text-center text-slate-400 text-xs">
              Ingen målestasjoner matchet søkekriteriene dine.
            </div>
          )}
        </div>
      </div>

      {/* 5. Attribution & Compliance */}
      <div className="met-glass-card rounded-2xl p-6 border border-slate-800/90 shadow-xl space-y-3">
        <div className="flex items-center gap-2 text-white font-semibold text-sm">
          <ShieldCheck className="w-5 h-5 text-emerald-400" />
          Kildekreditering & Offisielle Vilkår (Meteorologisk institutt)
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">
          Værprognoser leveres av <strong>Meteorologisk institutt (MET Norway)</strong> via Locationforecast 2.0 og
          Nowcast 2.0. Historiske observasjoner og målestasjonsdata leveres av MET Norway via{' '}
          <strong>Frost API</strong> (frost.met.no). Dataene er tilgjengeliggjort under Norsk lisens for offentlige
          data (NLOD) og Creative Commons 4.0 BY.
        </p>
        <p className="text-[11px] text-slate-500">
          Denne applikasjonen er en uavhengig virtuell værstasjon og er ikke en offisiell Yr- eller MET-tjeneste.
        </p>
      </div>
    </div>
  );
};
