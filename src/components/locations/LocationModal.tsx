'use client';

import React, { useState, useEffect, useRef } from 'react';
import { X, Plus, MapPin, Search, Navigation, Check, Trash2, Radio } from 'lucide-react';
import { LocationRecord } from '@/types/weather';
import {
  getCurrentGpsPosition,
  reverseGeocodeCoords,
  syncGpsLocationToServer,
  GPS_LOCATION_ID,
} from '@/lib/locationGps';
import {
  getLocalSavedLocations,
  saveLocalLocation,
  deleteLocalLocation,
  syncSavedLocationsWithServer,
  setActiveLocationId,
} from '@/lib/savedLocationsStorage';
import { primeOneYearHistoryCache } from '@/lib/weatherHistoryStorage';
import { useAccessibleDialog } from '../common/useAccessibleDialog';

interface LocationModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentLocationId: string;
  onSelectLocation: (id: string) => void;
  onLocationCreatedOrDeleted: (activeLocationId?: string) => void;
}

export const LocationModal: React.FC<LocationModalProps> = ({
  isOpen,
  onClose,
  currentLocationId,
  onSelectLocation,
  onLocationCreatedOrDeleted,
}) => {
  const [locations, setLocations] = useState<LocationRecord[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLocatingGps, setIsLocatingGps] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);

  // Form State
  const [name, setName] = useState('');
  const [lat, setLat] = useState('');
  const [lon, setLon] = useState('');
  const [alt, setAlt] = useState('');
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const locationsRequestRef = useRef(0);
  const gpsOperationRef = useRef(0);
  const createRequestRef = useRef(0);
  const dialogRef = useAccessibleDialog<HTMLDivElement>(isOpen, onClose);

  useEffect(() => {
    if (isOpen) {
      setLocations(getLocalSavedLocations());
      fetchLocations();
      setGpsError(null);
      setCreateError(null);
      setLocationError(null);
    } else {
      gpsOperationRef.current += 1;
      createRequestRef.current += 1;
      searchAbortRef.current?.abort();
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    }
    return () => {
      gpsOperationRef.current += 1;
      createRequestRef.current += 1;
      searchAbortRef.current?.abort();
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [isOpen]);

  const fetchLocations = async () => {
    const requestId = ++locationsRequestRef.current;
    try {
      const synced = await syncSavedLocationsWithServer();
      if (requestId === locationsRequestRef.current) setLocations(synced);
    } catch (e) {
      console.error(e);
      if (requestId === locationsRequestRef.current) setLocations(getLocalSavedLocations());
    }
  };

  const handleSearch = (q: string) => {
    setSearchQuery(q);
    setCreateError(null);
    searchAbortRef.current?.abort();
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    const normalizedQuery = q.trim();
    if (normalizedQuery.length < 3) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }
    setSearchResults([]);
    setIsSearching(true);
    searchDebounceRef.current = setTimeout(async () => {
      const controller = new AbortController();
      searchAbortRef.current = controller;
      try {
        const res = await fetch(`/api/geocoding?q=${encodeURIComponent(normalizedQuery)}`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(data?.error || 'Stedsøket svarte med en feil.');
        }
        if (!controller.signal.aborted && searchAbortRef.current === controller) {
          setSearchResults(Array.isArray(data) ? data : []);
        }
      } catch (e) {
        if (controller.signal.aborted) return;
        console.error(e);
        setCreateError('Kunne ikke søke etter steder akkurat nå.');
      } finally {
        if (searchAbortRef.current === controller) setIsSearching(false);
      }
    }, 500);
  };

  const selectSearchResult = (item: any) => {
    setName(item.name);
    setLat(item.lat.toString());
    setLon(item.lon.toString());
    setAlt(item.alt !== null && item.alt !== undefined ? item.alt.toString() : '');
    setAddress(item.address || '');
    setSearchResults([]);
    setSearchQuery('');
    setCreateError(null);
  };

  // Quick 1-tap GPS locator from list
  const handleQuickGpsJump = async () => {
    const operationId = ++gpsOperationRef.current;
    setIsLocatingGps(true);
    setGpsError(null);
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
      saveLocalLocation(loc);
      setActiveLocationId(loc.id);
      await fetchLocations();
      onSelectLocation(loc.id);
      onLocationCreatedOrDeleted(loc.id);
      onClose();
    } catch (err: any) {
      if (operationId === gpsOperationRef.current) {
        setGpsError(err.message || 'Kunne ikke hente GPS-posisjon.');
      }
    } finally {
      if (operationId === gpsOperationRef.current) setIsLocatingGps(false);
    }
  };

  const handleUseGpsInForm = async () => {
    const operationId = ++gpsOperationRef.current;
    setIsLocatingGps(true);
    setGpsError(null);
    setCreateError(null);
    try {
      const coords = await getCurrentGpsPosition(10000);
      if (operationId !== gpsOperationRef.current) return;
      setLat(coords.latitude.toFixed(4));
      setLon(coords.longitude.toFixed(4));
      setAlt(coords.altitude !== null && coords.altitude !== undefined ? coords.altitude.toString() : '');

      const geo = await reverseGeocodeCoords(coords.latitude, coords.longitude);
      if (operationId !== gpsOperationRef.current) return;
      setName(geo.name || 'Min posisjon');
      setAddress(geo.address || 'GPS-posisjon');
    } catch (err: any) {
      if (operationId === gpsOperationRef.current) {
        setGpsError(`Kunne ikke hente GPS-posisjon: ${err.message || 'ukjent feil'}`);
      }
    } finally {
      if (operationId === gpsOperationRef.current) setIsLocatingGps(false);
    }
  };

  const handleSaveLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    const requestId = ++createRequestRef.current;
    setLoading(true);
    setCreateError(null);

    const parsedLat = parseFloat(lat.toString().replace(',', '.').trim());
    const parsedLon = parseFloat(lon.toString().replace(',', '.').trim());
    const normalizedAlt = alt.toString().replace(',', '.').trim();
    const parsedAlt = normalizedAlt === '' ? null : parseFloat(normalizedAlt);

    if (!name.trim()) {
      setCreateError('Oppgi et navn på stedet.');
      setLoading(false);
      return;
    }
    if (isNaN(parsedLat) || isNaN(parsedLon) || parsedLat < -90 || parsedLat > 90 || parsedLon < -180 || parsedLon > 180) {
      setCreateError('Ugyldige koordinater. Vennligst oppgi gyldig breddegrad og lengdegrad som tall.');
      setLoading(false);
      return;
    }
    if (parsedAlt !== null && Number.isNaN(parsedAlt)) {
      setCreateError('Ugyldig høyde. La feltet stå tomt dersom høyden er ukjent.');
      setLoading(false);
      return;
    }

    const newLocPayload = {
      name: name.trim(),
      latitude: parsedLat,
      longitude: parsedLon,
      altitude: parsedAlt,
      address,
    };

    try {
      const res = await fetch('/api/locations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newLocPayload),
      });

      if (res.ok) {
        const newLoc: LocationRecord = await res.json();
        if (requestId !== createRequestRef.current) return;
        // Persist locally in PWA / Browser storage immediately
        saveLocalLocation(newLoc);
        setActiveLocationId(newLoc.id);
        // Start a real Frost backfill as soon as the user saves a searched area.
        // The response is kept locally so the first history visit is immediate.
        void primeOneYearHistoryCache(newLoc.id).catch(() => undefined);

        setIsCreating(false);
        setName('');
        setAddress('');
        await fetchLocations();
        onSelectLocation(newLoc.id);
        onLocationCreatedOrDeleted(newLoc.id);
      } else {
        const errJson = await res.json().catch(() => null);
        if (requestId === createRequestRef.current) {
          setCreateError(errJson?.error || 'Kunne ikke lagre stedet på serveren.');
        }
      }
    } catch (e: any) {
      if (requestId === createRequestRef.current) {
        setCreateError(e.message || 'Nettverksfeil ved lagring av sted.');
      }
    } finally {
      if (requestId === createRequestRef.current) setLoading(false);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (locations.length <= 1) {
      alert('Du må ha minst én værstasjon.');
      return;
    }
    if (!confirm('Er du sikker på at du vil slette denne værstasjonen?')) return;

    setLocationError(null);
    try {
      const response = await fetch(`/api/locations?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || 'Kunne ikke slette stedet.');
      }
    } catch (e) {
      setLocationError(e instanceof Error ? e.message : 'Kunne ikke slette stedet.');
      return;
    }

    const remainingLocs = deleteLocalLocation(id);
    setLocations(remainingLocs);

    if (id === currentLocationId) {
      const nextLoc = remainingLocs[0];
      if (nextLoc) {
        setActiveLocationId(nextLoc.id);
        onSelectLocation(nextLoc.id);
      }
    }
    onLocationCreatedOrDeleted(id === currentLocationId ? remainingLocs[0]?.id : currentLocationId);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="locations-dialog-title"
        tabIndex={-1}
        className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/80">
          <div className="flex items-center gap-2">
            <MapPin className="w-5 h-5 text-sky-400" />
            <h2 id="locations-dialog-title" className="text-lg font-semibold text-white">Mine Værstasjoner & Posisjon</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Lukk stedsvelger"
            className="text-slate-400 hover:text-white p-2.5 min-h-11 min-w-11 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 max-h-[75vh] overflow-y-auto space-y-4">
          {!isCreating ? (
            <>
              {/* Quick GPS Location Card */}
              <div className="bg-gradient-to-r from-sky-950/60 to-indigo-950/60 border border-sky-600/40 rounded-2xl p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sky-300 font-semibold text-xs">
                    <Navigation className="w-4 h-4 text-sky-400 animate-pulse" />
                    <span>Nåværende GPS-posisjon</span>
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono">Kun ved aktiv bruk</span>
                </div>
                <p className="text-[11px] text-slate-300">
                  Hent og vis lokale værdata, nedbørsradar og solbue for der du er akkurat nå.
                </p>
                <button
                  type="button"
                  disabled={isLocatingGps}
                  onClick={handleQuickGpsJump}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold shadow-md transition disabled:opacity-50"
                >
                  {isLocatingGps ? (
                    <>
                      <Radio className="w-4 h-4 animate-spin" />
                      <span>Finner posisjon og oppdaterer værdata...</span>
                    </>
                  ) : (
                    <>
                      <Navigation className="w-3.5 h-3.5" />
                      <span>Bruk min GPS-posisjon nå</span>
                    </>
                  )}
                </button>
                {gpsError && (
                  <p role="alert" className="text-[11px] text-rose-300 bg-rose-950/60 border border-rose-800/40 rounded-lg p-2">
                    {gpsError}
                  </p>
                )}
              </div>

              {locationError && (
                <p role="alert" className="rounded-lg border border-rose-800/50 bg-rose-950/50 p-3 text-xs text-rose-200">
                  {locationError}
                </p>
              )}

              <div className="space-y-2 pt-1">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block px-1">
                  Lagrede steder ({locations.length})
                </span>
                {locations.map((loc) => {
                  const isSelected = loc.id === currentLocationId;
                  const isGpsLoc = loc.id === GPS_LOCATION_ID || loc.name.includes('GPS') || loc.name.includes('Min posisjon');

                  return (
                    <div
                      key={loc.id}
                      role="button"
                      tabIndex={0}
                      aria-current={isSelected ? 'true' : undefined}
                      onClick={() => {
                        onSelectLocation(loc.id);
                        onClose();
                      }}
                      onKeyDown={(event) => {
                        if (event.target !== event.currentTarget) return;
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          onSelectLocation(loc.id);
                          onClose();
                        }
                      }}
                      className={`flex items-center justify-between p-4 rounded-xl cursor-pointer transition border ${
                        isSelected
                          ? 'bg-sky-950/40 border-sky-500/60 shadow-lg shadow-sky-950/50'
                          : 'bg-slate-800/50 border-slate-700/60 hover:bg-slate-800 hover:border-slate-600'
                      }`}
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        <div
                          className={`p-2.5 rounded-lg shrink-0 ${
                            isSelected ? 'bg-sky-500/20 text-sky-400' : 'bg-slate-700/50 text-slate-400'
                          }`}
                        >
                          {isGpsLoc ? <Navigation className="w-5 h-5" /> : <MapPin className="w-5 h-5" />}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-white text-base truncate">{loc.name}</span>
                            {isGpsLoc && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                GPS
                              </span>
                            )}
                            {isSelected && (
                              <span className="text-xs px-2 py-0.5 rounded bg-sky-500/20 text-sky-400 border border-sky-500/30 flex items-center gap-1 shrink-0">
                                <Check className="w-3 h-3" /> Aktiv
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-400 mt-0.5">
                            {loc.latitude.toFixed(4)}°N, {loc.longitude.toFixed(4)}°Ø •{' '}
                            {loc.altitude === null || loc.altitude === undefined ? 'Ukjent høyde' : `${loc.altitude} moh.`}
                          </p>
                          {loc.address && <p className="text-xs text-slate-500 mt-0.5 truncate">{loc.address}</p>}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {locations.length > 1 && !isGpsLoc && (
                           <button
                             type="button"
                             onClick={(e) => handleDelete(loc.id, e)}
                             aria-label={`Slett ${loc.name}`}
                            className="min-h-11 min-w-11 text-slate-500 hover:text-rose-400 p-2 rounded-lg hover:bg-slate-800 transition"
                            title="Slett værstasjon"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
                {locations.length === 0 && (
                  <p role="status" className="rounded-xl border border-dashed border-slate-700 p-4 text-center text-xs text-slate-400">
                    Ingen lagrede steder. Legg til et fast sted eller bruk GPS-posisjonen din.
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={() => setIsCreating(true)}
                className="min-h-11 w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-750 border border-slate-700 text-white font-medium shadow-md transition"
              >
                <Plus className="w-5 h-5 text-sky-400" /> Legg til nytt fast sted
              </button>
            </>
          ) : (
            <form onSubmit={handleSaveLocation} className="space-y-4">
              <div className="relative">
                <label htmlFor="location-search" className="block text-xs font-medium text-slate-300 mb-1">
                  Søk etter sted i Norge eller skriv inn manuelt
                </label>
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    id="location-search"
                    type="text"
                    value={searchQuery}
                    onChange={(e) => handleSearch(e.target.value)}
                    placeholder="F.eks. Aukra, Trysil, Geilo, Bergen..."
                    className="min-h-11 w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
                  />
                </div>

                {isSearching && (
                  <p role="status" className="mt-2 text-[11px] text-sky-300">
                    Søker etter steder…
                  </p>
                )}
                {!isSearching && searchQuery.trim().length >= 3 && searchResults.length === 0 && !createError && (
                  <p role="status" className="mt-2 text-[11px] text-slate-400">
                    Ingen treff. Prøv et mer presist stedsnavn eller skriv inn koordinatene manuelt.
                  </p>
                )}

                {searchResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 z-20 mt-1 bg-slate-800 border border-slate-700 rounded-xl shadow-xl max-h-48 overflow-y-auto divide-y divide-slate-700/50">
                    {searchResults.map((item, idx) => (
                      <button
                        type="button"
                        key={idx}
                        onClick={() => selectSearchResult(item)}
                    className="min-h-11 w-full p-3 hover:bg-slate-700 cursor-pointer text-left text-xs transition"
                      >
                        <span className="font-semibold text-white block">{item.name}</span>
                        <span className="text-slate-400 block truncate">{item.address}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  disabled={isLocatingGps}
                  onClick={handleUseGpsInForm}
                  className="flex min-h-11 items-center gap-1.5 text-xs text-sky-400 hover:text-sky-300 bg-sky-950/40 border border-sky-800/50 px-2.5 py-2 rounded-lg transition"
                >
                  <Navigation className={`w-3.5 h-3.5 ${isLocatingGps ? 'animate-spin' : ''}`} />
                  <span>{isLocatingGps ? 'Henter posisjon...' : 'Fyll ut med min GPS-posisjon'}</span>
                </button>
              </div>

              <div>
                <label htmlFor="location-name" className="block text-xs font-medium text-slate-300 mb-1">Stedsnavn</label>
                <input
                  id="location-name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="F.eks. Hjemme – Aukra, Hytta, Prosjekt E39"
                  className="min-h-11 w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-500"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label htmlFor="location-latitude" className="block text-xs font-medium text-slate-300 mb-1">Breddegrad (N)</label>
                  <input
                    id="location-latitude"
                    type="number"
                    step="0.0001"
                    required
                    value={lat}
                    onChange={(e) => setLat(e.target.value)}
                    className="min-h-11 w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div>
                  <label htmlFor="location-longitude" className="block text-xs font-medium text-slate-300 mb-1">Lengdegrad (Ø)</label>
                  <input
                    id="location-longitude"
                    type="number"
                    step="0.0001"
                    required
                    value={lon}
                    onChange={(e) => setLon(e.target.value)}
                    className="min-h-11 w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div>
                  <label htmlFor="location-altitude" className="block text-xs font-medium text-slate-300 mb-1">Høyde (moh.)</label>
                  <input
                    id="location-altitude"
                    type="number"
                    step="1"
                    value={alt}
                    onChange={(e) => setAlt(e.target.value)}
                    className="min-h-11 w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-500"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="location-address" className="block text-xs font-medium text-slate-300 mb-1">Adresse / Beskrivelse (valgfritt)</label>
                <input
                  id="location-address"
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="F.eks. Aukra kommune, Møre og Romsdal"
                  className="min-h-11 w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-500"
                />
              </div>

              {createError && (
                <div role="alert" className="p-3 bg-rose-950/70 border border-rose-800/80 rounded-xl text-rose-300 text-xs flex items-center gap-2">
                  <span className="font-semibold">{createError}</span>
                </div>
              )}

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsCreating(false);
                    setCreateError(null);
                  }}
                  className="min-h-11 w-1/2 py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium transition"
                >
                  Avbryt
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="min-h-11 w-1/2 py-2.5 px-4 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-sm font-medium transition flex items-center justify-center gap-2 shadow-lg"
                >
                  {loading ? 'Oppretter...' : 'Lagre sted'}
                </button>
              </div>
            </form>
          )}

          <p className="text-center text-[10px] leading-relaxed text-slate-500">
            Stedssøk leveres av{' '}
            <a
              href="https://open-meteo.com/en/docs/geocoding-api"
              target="_blank"
              rel="noreferrer"
              className="underline decoration-slate-600 underline-offset-2 hover:text-slate-300"
            >
              Open-Meteo / GeoNames
            </a>
            . GPS-adresser kan bruke © OpenStreetMap-bidragsytere.
          </p>
        </div>
      </div>
    </div>
  );
};
