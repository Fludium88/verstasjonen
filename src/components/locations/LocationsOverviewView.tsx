'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  MapPin,
  Plus,
  Trash2,
  Check,
  Star,
  ExternalLink,
  Navigation,
  RefreshCw,
  Compass,
  Thermometer,
  Wind,
  Droplets,
} from 'lucide-react';
import { LocationRecord, DashboardPayload, WeatherDataSourceType } from '@/types/weather';
import { WeatherIcon } from '../common/WeatherIcon';
import { formatNorwegianNumber } from '@/lib/weatherUtils';
import { LocationModal } from './LocationModal';
import {
  getLocalSavedLocations,
  deleteLocalLocation,
  syncSavedLocationsWithServer,
  getDefaultLocationId,
  setDefaultLocationId,
  setActiveLocationId,
} from '@/lib/savedLocationsStorage';

interface LocationCardData {
  location: LocationRecord;
  temp: number | null;
  feelsLike: number | null;
  windSpeed: number | null;
  precipitation: number | null;
  symbol: string | null;
  weatherText: string | null;
  sourceType: WeatherDataSourceType | null;
  stationName?: string;
  isDefault: boolean;
}

interface LocationsOverviewViewProps {
  currentLocationId: string;
  onSelectLocation: (id: string) => void;
  onNavigateToDashboard: () => void;
}

export const LocationsOverviewView: React.FC<LocationsOverviewViewProps> = ({
  currentLocationId,
  onSelectLocation,
  onNavigateToDashboard,
}) => {
  const [locations, setLocations] = useState<LocationRecord[]>([]);
  const [cardsData, setCardsData] = useState<Record<string, LocationCardData>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [defaultLocId, setDefaultLocId] = useState<string>('');
  const weatherAbortRef = useRef<AbortController | null>(null);
  const locationsRequestRef = useRef(0);

  useEffect(() => {
    const defaultId = getDefaultLocationId();
    setDefaultLocId(defaultId);
    const localLocs = getLocalSavedLocations();
    setLocations(localLocs);
    void fetchMiniWeatherForLocations(localLocs);
    void fetchLocations();
    return () => weatherAbortRef.current?.abort();
  }, []);

  const fetchLocations = async () => {
    const requestId = ++locationsRequestRef.current;
    setLoading(true);
    try {
      const synced = await syncSavedLocationsWithServer();
      if (requestId !== locationsRequestRef.current) return;
      setLocations(synced);
      await fetchMiniWeatherForLocations(synced);
    } catch (e) {
      console.error(e);
      if (requestId !== locationsRequestRef.current) return;
      const fallback = getLocalSavedLocations();
      setLocations(fallback);
      await fetchMiniWeatherForLocations(fallback);
    } finally {
      if (requestId === locationsRequestRef.current) setLoading(false);
    }
  };

  const fetchMiniWeatherForLocations = async (locs: LocationRecord[]) => {
    weatherAbortRef.current?.abort();
    const controller = new AbortController();
    weatherAbortRef.current = controller;
    const dataMap: Record<string, LocationCardData> = {};
    const defaultId = getDefaultLocationId();

    await Promise.all(
      locs.map(async (loc) => {
        try {
          const res = await fetch(`/api/weather/dashboard?locationId=${encodeURIComponent(loc.id)}`, {
            cache: 'no-store',
            signal: controller.signal,
          });
          if (res.ok) {
            const json: DashboardPayload = await res.json();
            dataMap[loc.id] = {
              location: loc,
              temp: json.current.temperature,
              feelsLike: json.current.feels_like,
              windSpeed: json.current.wind_speed,
              precipitation: json.current.precipitation_last_hour,
              symbol: json.current.symbol_code,
              weatherText: json.current.weather_text || null,
              sourceType: json.current.source_type || null,
              stationName: json.current.station_name,
              isDefault: loc.id === defaultId,
            };
          }
        } catch (e) {
          if (!controller.signal.aborted) console.warn(`Could not load weather for location ${loc.id}:`, e);
        }
      })
    );

    if (!controller.signal.aborted && weatherAbortRef.current === controller) setCardsData(dataMap);
  };

  const handleSetAsDefault = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDefaultLocId(id);
    setDefaultLocationId(id);
    setCardsData((prev) => {
      const updated = { ...prev };
      Object.keys(updated).forEach((k) => {
        updated[k] = { ...updated[k], isDefault: k === id };
      });
      return updated;
    });
  };

  const handleDeleteLocation = async (id: string, name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (locations.length <= 1) {
      alert('Du må beholde minst ett registrert sted.');
      return;
    }
    if (!confirm(`Er du sikker på at du vil slette «${name}»?`)) return;

    setError(null);
    try {
      const response = await fetch(`/api/locations?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || 'Kunne ikke slette stedet.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kunne ikke slette stedet.');
      return;
    }

    const remaining = deleteLocalLocation(id);
    setLocations(remaining);
    setCardsData((previous) => {
      const updated = { ...previous };
      delete updated[id];
      return updated;
    });

    if (currentLocationId === id && remaining.length > 0) {
      setActiveLocationId(remaining[0].id);
      onSelectLocation(remaining[0].id);
    }
    fetchLocations();
  };

  const handleCardClick = (id: string) => {
    setActiveLocationId(id);
    onSelectLocation(id);
    onNavigateToDashboard();
  };

  const formatMetric = (value: number | null | undefined, suffix = '', decimals = 1) =>
    typeof value === 'number' && Number.isFinite(value)
      ? `${formatNorwegianNumber(value, decimals)}${suffix}`
      : 'Ikke tilgjengelig';

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/60 border border-slate-800 p-6 rounded-2xl shadow-xl">
        <div>
          <div className="flex items-center gap-2.5 text-sky-400 font-semibold text-xs tracking-wider uppercase mb-1">
            <Compass className="w-4 h-4" />
            <span>Lokasjonsadministrasjon</span>
          </div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">Mine Steder</h1>
          <p className="text-xs text-slate-400 mt-1 max-w-xl">
             Her kan du lagre flere steder og hente oppdaterte værdata for hjemme, hytta, anlegg eller jobb.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="flex min-h-11 items-center gap-2 py-2.5 px-4 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs shadow-lg shadow-sky-950/50 transition"
          >
            <Plus className="w-4 h-4" />
            <span>Legg til nytt sted</span>
          </button>
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-xl border border-rose-800/50 bg-rose-950/40 p-4 text-sm text-rose-200">
          {error}
        </p>
      )}

      {/* Grid of Location Cards */}
      {loading && Object.keys(cardsData).length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-slate-400 space-y-3">
          <RefreshCw className="w-7 h-7 animate-spin text-sky-400" />
          <p className="text-xs font-medium">Henter værdata for dine steder...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {locations.map((loc) => {
            const card = cardsData[loc.id];
            const isSelected = currentLocationId === loc.id;
            const isDefault = defaultLocId === loc.id;

            return (
              <div
                key={loc.id}
                role="button"
                tabIndex={0}
                aria-current={isSelected ? 'true' : undefined}
                onClick={() => handleCardClick(loc.id)}
                onKeyDown={(event) => {
                  if (event.target !== event.currentTarget) return;
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    handleCardClick(loc.id);
                  }
                }}
                className={`relative group rounded-2xl border p-5 cursor-pointer transition-all duration-200 shadow-xl overflow-hidden flex flex-col justify-between min-h-[220px] ${
                  isSelected
                    ? 'bg-[#0b152d] border-sky-500 ring-2 ring-sky-500/30'
                    : 'bg-[#090e1d] border-slate-800/90 hover:border-slate-700 hover:bg-[#0c1428]'
                }`}
              >
                {/* Top bar of card */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-extrabold text-white truncate group-hover:text-sky-300 transition">
                        {loc.name}
                      </h3>
                      {isSelected && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-500 text-white font-bold shrink-0">
                          Aktiv
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                      {loc.latitude.toFixed(2)}° N · {loc.longitude.toFixed(2)}° E ·{' '}
                      {loc.altitude === null || loc.altitude === undefined ? 'Ukjent høyde' : `${loc.altitude} moh.`}
                    </p>
                  </div>

                  {/* Actions (Set Default, Delete) */}
                  <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => handleSetAsDefault(loc.id, e)}
                        title={isDefault ? 'Standard startsted' : 'Sett som standard startsted'}
                        aria-label={isDefault ? `${loc.name} er standard startsted` : `Sett ${loc.name} som standard startsted`}
                        className={`min-h-11 min-w-11 p-2 rounded-lg border transition ${
                        isDefault
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                          : 'bg-slate-800/60 text-slate-400 hover:text-amber-300 border-slate-700/60'
                      }`}
                    >
                      <Star className={`w-3.5 h-3.5 ${isDefault ? 'fill-amber-400 text-amber-400' : ''}`} />
                    </button>

                    {locations.length > 1 && (
                        <button
                          type="button"
                          onClick={(e) => handleDeleteLocation(loc.id, loc.name, e)}
                          title="Slett dette stedet"
                          aria-label={`Slett ${loc.name}`}
                          className="min-h-11 min-w-11 p-2 rounded-lg bg-slate-800/60 hover:bg-rose-950/80 text-slate-400 hover:text-rose-300 border border-slate-700/60 hover:border-rose-600/40 transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Weather Content */}
                {card ? (
                  <div className="my-4 flex items-center justify-between">
                    <div>
                      <div className="text-4xl font-extrabold text-white font-mono tracking-tight">
                        {formatMetric(card.temp, ' °C')}
                      </div>
                      <p className="text-xs text-slate-300 font-medium mt-1">
                        Føles som {formatMetric(card.feelsLike, ' °C')} ·{' '}
                        <span className="text-sky-300">{card.weatherText || 'Værbeskrivelse ikke tilgjengelig'}</span>
                      </p>
                    </div>

                    <div className="w-14 h-14 flex items-center justify-center">
                      <WeatherIcon symbolCode={card.symbol} className="w-12 h-12" />
                    </div>
                  </div>
                ) : (
                  <div className="my-6 text-xs text-slate-500 italic">Værdata ikke tilgjengelig</div>
                )}

                {/* Bottom metadata */}
                <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-3 text-slate-400">
                    <div className="flex items-center gap-1" title="Vindstyrke">
                      <Wind className="w-3.5 h-3.5 text-sky-400" />
                      <span className="font-mono">{formatMetric(card?.windSpeed, ' m/s')}</span>
                    </div>
                    <div className="flex items-center gap-1" title="Nedbør siste time">
                      <Droplets className="w-3.5 h-3.5 text-blue-400" />
                      <span className="font-mono">{formatMetric(card?.precipitation, ' mm')}</span>
                    </div>
                  </div>

                  <span
                    className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                      card?.sourceType === 'MÅLT'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : card?.sourceType === 'ESTIMERT'
                        ? 'bg-indigo-500/20 text-indigo-200 border border-indigo-500/30'
                        : card?.sourceType === 'PROGNOSE'
                        ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                        : card?.sourceType === 'BLANDET'
                        ? 'bg-violet-500/20 text-violet-200 border border-violet-500/30'
                        : 'bg-slate-700/50 text-slate-300 border border-slate-600'
                    }`}
                  >
                    {card?.sourceType === 'ESTIMERT' ? 'JUSTERT MÅLING' : card?.sourceType || 'UKJENT'}
                  </span>
                </div>
              </div>
            );
          })}
          {locations.length === 0 && (
            <div role="status" className="col-span-full rounded-2xl border border-dashed border-slate-700 p-8 text-center text-sm text-slate-400">
              Ingen lagrede steder. Bruk «Legg til nytt sted» for å komme i gang.
            </div>
          )}
        </div>
      )}

      {/* Modal for adding/searching new place */}
      <LocationModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        currentLocationId={currentLocationId}
        onSelectLocation={(id) => {
          onSelectLocation(id);
          fetchLocations();
        }}
        onLocationCreatedOrDeleted={() => fetchLocations()}
      />
    </div>
  );
};
