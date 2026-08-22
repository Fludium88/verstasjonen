'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Sidebar, NavTab } from '@/components/layout/Sidebar';
import { MobileNav } from '@/components/layout/MobileNav';
import { MobileHeader } from '@/components/layout/MobileHeader';
import { WeatherDashboard } from '@/components/dashboard/WeatherDashboard';
import { LocationsOverviewView } from '@/components/locations/LocationsOverviewView';
import { ForecastView } from '@/components/forecast/ForecastView';
import { HistoryView } from '@/components/history/HistoryView';
import { ForecastAccuracyView } from '@/components/accuracy/ForecastAccuracyView';
import { ConstructionModeView } from '@/components/construction/ConstructionModeView';
import { AstronomyView } from '@/components/astronomy/AstronomyView';
import { DataSourcesView } from '@/components/sources/DataSourcesView';
import { CalibrationView } from '@/components/calibration/CalibrationView';
import { LocationModal } from '@/components/locations/LocationModal';
import { GpsStartupModal } from '@/components/locations/GpsStartupModal';
import { SettingsModal } from '@/components/settings/SettingsModal';
import { AlertSettingsModal } from '@/components/alerts/AlertSettingsModal';
import { DashboardPayload, LocationRecord } from '@/types/weather';
import { MetAlertItem, ThresholdAlarm } from '@/types/alerts';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { RefreshCw, Navigation, AlertCircle } from 'lucide-react';
import {
  isGpsStartupEnabled,
  hasGpsPromptBeenShown,
  getCurrentGpsPosition,
  reverseGeocodeCoords,
  syncGpsLocationToServer,
} from '@/lib/locationGps';
import {
  getLocalSavedLocations,
  getActiveLocationId,
  getDefaultLocationId,
  setActiveLocationId,
  saveLocalLocation,
  syncSavedLocationsWithServer,
} from '@/lib/savedLocationsStorage';

const VALID_TABS: readonly NavTab[] = [
  'dashboard',
  'locations',
  'forecast',
  'history',
  'astronomy',
  'accuracy',
  'construction',
  'sources',
  'calibration',
  'settings',
];

export default function Home() {
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [currentLocationId, setCurrentLocationId] = useState<string>('');
  const [savedLocations, setSavedLocations] = useState<LocationRecord[]>([]);
  const [dashboardData, setDashboardData] = useState<DashboardPayload | null>(null);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [historyInitialRange, setHistoryInitialRange] = useState<string>('30d');
  const [metAlerts, setMetAlerts] = useState<MetAlertItem[]>([]);
  const [thresholdAlarms, setThresholdAlarms] = useState<ThresholdAlarm[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isBackgroundRefreshing, setIsBackgroundRefreshing] = useState<boolean>(false);
  const [isLocationModalOpen, setIsLocationModalOpen] = useState<boolean>(false);
  const [isGpsStartupModalOpen, setIsGpsStartupModalOpen] = useState<boolean>(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState<boolean>(false);
  const [isAlertSettingsOpen, setIsAlertSettingsOpen] = useState<boolean>(false);
  const [gpsToast, setGpsToast] = useState<string | null>(null);

  const lastFetchTimeRef = useRef<number>(Date.now());
  const prevAlarmsCountRef = useRef<number>(0);
  const currentLocationIdRef = useRef<string>(currentLocationId);
  const dashboardAbortRef = useRef<AbortController | null>(null);
  const dashboardRequestRef = useRef(0);
  const alertsAbortRef = useRef<AbortController | null>(null);
  const alertsRequestRef = useRef(0);
  const locationsRequestRef = useRef(0);
  const gpsRequestRef = useRef(0);
  currentLocationIdRef.current = currentLocationId;

  const fetchLocationsList = useCallback(async () => {
    const requestId = ++locationsRequestRef.current;
    try {
      const synced = await syncSavedLocationsWithServer();
      if (requestId === locationsRequestRef.current) setSavedLocations(synced);
    } catch (e) {
      console.error('Failed to load locations:', e);
      if (requestId === locationsRequestRef.current) setSavedLocations(getLocalSavedLocations());
    }
  }, []);

  const fetchAlerts = useCallback(async (locId?: string) => {
    const targetId = locId || currentLocationIdRef.current;
    if (!targetId) {
      setMetAlerts([]);
      setThresholdAlarms([]);
      return;
    }
    alertsAbortRef.current?.abort();
    const controller = new AbortController();
    alertsAbortRef.current = controller;
    const requestId = ++alertsRequestRef.current;
    try {
      const res = await fetch(`/api/weather/alerts?locationId=${encodeURIComponent(targetId)}`, {
        cache: 'no-store',
        signal: controller.signal,
      });
      if (res.ok) {
        const json = await res.json();
        if (
          controller.signal.aborted ||
          requestId !== alertsRequestRef.current ||
          targetId !== currentLocationIdRef.current
        ) {
          return;
        }
        const alerts: MetAlertItem[] = json.met_alerts || [];
        const alarms: ThresholdAlarm[] = json.threshold_alarms || [];
        setMetAlerts(alerts);
        setThresholdAlarms(alarms);

        // Trigger browser notification if new alarms appeared and allowed
        const totalNow = alerts.length + alarms.length;
        if (
          totalNow > prevAlarmsCountRef.current &&
          typeof window !== 'undefined' &&
          'Notification' in window &&
          Notification.permission === 'granted'
        ) {
          const topMsg = alerts[0]?.event_name_no || alarms[0]?.title || 'Væralarm aktiv';
          new Notification('Værstasjonen – Farevarsel / Alarm', {
            body: topMsg,
            icon: '/icons/icon.svg',
          });
        }
        prevAlarmsCountRef.current = totalNow;
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      console.warn('Failed to fetch alerts:', err);
    }
  }, []);

  const fetchDashboardData = useCallback(async (locId?: string, isSilent = false) => {
    const targetId = locId || currentLocationIdRef.current;
    if (!targetId) {
      if (!isSilent) {
        setLoading(false);
        setDashboardError('Velg eller legg til et sted før værdata kan hentes.');
      }
      return;
    }
    dashboardAbortRef.current?.abort();
    const controller = new AbortController();
    dashboardAbortRef.current = controller;
    const requestId = ++dashboardRequestRef.current;
    if (isSilent) {
      setIsBackgroundRefreshing(true);
    } else {
      setLoading(true);
    }
    setDashboardError(null);
    try {
      const res = await fetch(`/api/weather/dashboard?locationId=${encodeURIComponent(targetId)}`, {
        cache: 'no-store',
        signal: controller.signal,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || `Værdata kunne ikke hentes (${res.status}).`);
      }
      const json: DashboardPayload = await res.json();
      if (
        controller.signal.aborted ||
        requestId !== dashboardRequestRef.current ||
        targetId !== currentLocationIdRef.current
      ) {
        return;
      }
      setDashboardData(json);
      lastFetchTimeRef.current = Date.now();
      if (json.location?.id) {
        setCurrentLocationId(json.location.id);
        currentLocationIdRef.current = json.location.id;
        setActiveLocationId(json.location.id);
      }
      void fetchAlerts(json.location?.id || targetId);
      void fetchLocationsList();
    } catch (err: any) {
      if (controller.signal.aborted || requestId !== dashboardRequestRef.current) return;
      console.error('Failed to load dashboard data:', err);
      setDashboardError(err?.message || 'Kunne ikke hente værdata.');
    } finally {
      if (requestId === dashboardRequestRef.current) {
        setLoading(false);
        setIsBackgroundRefreshing(false);
      }
    }
  }, [fetchAlerts, fetchLocationsList]);

  // GPS Position Refresh (strictly when requested)
  const refreshGpsPosition = useCallback(async (showToast = true) => {
    const requestId = ++gpsRequestRef.current;
    if (showToast) {
      setGpsToast('📍 Finner din GPS-posisjon og oppdaterer værdata...');
    }
    try {
      const coords = await getCurrentGpsPosition(10000);
      if (requestId !== gpsRequestRef.current) return;
      const geo = await reverseGeocodeCoords(coords.latitude, coords.longitude);
      if (requestId !== gpsRequestRef.current) return;
      const loc = await syncGpsLocationToServer(
        { latitude: coords.latitude, longitude: coords.longitude, altitude: coords.altitude },
        geo.name,
        geo.address
      );
      if (requestId !== gpsRequestRef.current) return;

      setCurrentLocationId(loc.id);
      currentLocationIdRef.current = loc.id;
      saveLocalLocation(loc);
      setActiveLocationId(loc.id);
      await fetchDashboardData(loc.id);
      await fetchLocationsList();

      if (showToast) {
        setGpsToast(`✅ Posisjon oppdatert til ${geo.name}`);
        setTimeout(() => setGpsToast(null), 3500);
      }
    } catch (err: any) {
      if (requestId !== gpsRequestRef.current) return;
      console.warn('GPS refresh error:', err);
      if (showToast) {
        setGpsToast(`⚠️ ${err.message || 'Kunne ikke hente GPS-posisjon.'}`);
        setTimeout(() => setGpsToast(null), 4000);
      }
    }
  }, [fetchDashboardData, fetchLocationsList]);

  // Initial Startup Lifecycle: run EXACTLY ONCE on mount
  useEffect(() => {
    // Check url search params for PWA shortcut routing
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const tabParam = urlParams.get('tab') as NavTab | null;
      if (tabParam === 'settings') {
        setIsSettingsModalOpen(true);
      } else if (tabParam && VALID_TABS.includes(tabParam)) {
        setActiveTab(tabParam);
      } else if (tabParam) {
        setActiveTab('dashboard');
        urlParams.delete('tab');
        const query = urlParams.toString();
        window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
      }
    }

    const initLocationAndWeather = async () => {
      const preferredDefaultId = getDefaultLocationId();
      const previousActiveId = getActiveLocationId();
      const isAutoGps = isGpsStartupEnabled();
      const hasBeenPrompted = hasGpsPromptBeenShown();

      let syncedLocations: LocationRecord[];
      try {
        syncedLocations = await syncSavedLocationsWithServer();
      } catch (error) {
        console.warn('Kunne ikke synkronisere lagrede steder ved oppstart:', error);
        syncedLocations = getLocalSavedLocations();
      }
      setSavedLocations(syncedLocations);

      const initialLoc =
        syncedLocations.find((location) => location.id === preferredDefaultId)?.id ||
        syncedLocations.find((location) => location.id === previousActiveId)?.id ||
        syncedLocations[0]?.id;

      if (!initialLoc) {
        setLoading(false);
        setDashboardError('Ingen gyldige steder er tilgjengelige. Legg til et sted for å hente værdata.');
        return;
      }

      // 1. Instantly load active location weather
      setCurrentLocationId(initialLoc);
      currentLocationIdRef.current = initialLoc;
      setActiveLocationId(initialLoc);
      void fetchDashboardData(initialLoc);

      // 2. ONLY run startup GPS if user explicitly enabled auto GPS on startup, OR on very first visit
      if (isAutoGps) {
        refreshGpsPosition(false).catch((e) => {
          console.warn('Silent startup GPS refresh fallback:', e);
        });
      } else if (!hasBeenPrompted) {
        setIsGpsStartupModalOpen(true);
      }
    };

    initLocationAndWeather();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Autorefresh Interval & Tab Visibility Handling
  useEffect(() => {
    const checkAndRefresh = () => {
      const intervalMinsStr = localStorage.getItem('vaerstasjonen_autorefresh_mins');
      const intervalMins = intervalMinsStr !== null ? parseInt(intervalMinsStr, 10) : 60;
      if (intervalMins <= 0) return; // Disabled

      const elapsedMs = Date.now() - lastFetchTimeRef.current;
      if (elapsedMs >= intervalMins * 60 * 1000) {
        fetchDashboardData(undefined, true);
      }
    };

    // Check periodically every 30 seconds
    const intervalTimer = setInterval(checkAndRefresh, 30 * 1000);

    // Refresh when user returns to tab if more than 15 minutes have passed
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const intervalMinsStr = localStorage.getItem('vaerstasjonen_autorefresh_mins');
        const intervalMins = intervalMinsStr !== null ? parseInt(intervalMinsStr, 10) : 60;
        if (!Number.isFinite(intervalMins) || intervalMins <= 0) return;
        const elapsedMs = Date.now() - lastFetchTimeRef.current;
        if (elapsedMs >= intervalMins * 60 * 1000) {
          void fetchDashboardData(undefined, true);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(intervalTimer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchDashboardData]);

  useEffect(() => {
    return () => {
      dashboardAbortRef.current?.abort();
      alertsAbortRef.current?.abort();
      gpsRequestRef.current += 1;
    };
  }, []);

  const handleSelectLocation = (id: string) => {
    if (!id) return;
    gpsRequestRef.current += 1;
    setCurrentLocationId(id);
    currentLocationIdRef.current = id;
    setActiveLocationId(id);
    setDashboardData(null);
    setDashboardError(null);
    setMetAlerts([]);
    setThresholdAlarms([]);
    setLoading(true);
    void fetchDashboardData(id);
  };

  const currentLocationRecord = dashboardData?.location || savedLocations.find((l) => l.id === currentLocationId);

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-[#070b16] text-slate-100 flex flex-col md:flex-row antialiased">
      {/* Left Sidebar on Desktop */}
      <div className="hidden md:block shrink-0 sticky top-0 h-screen">
        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          onOpenSettings={() => setIsSettingsModalOpen(true)}
          onOpenAlerts={() => setIsAlertSettingsOpen(true)}
          activeAlertsCount={metAlerts.length + thresholdAlarms.length}
        />
      </div>

      {/* Main Column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile Top Header (with Location switcher, PWA installer, Alerts, GPS and Refresh) */}
        <MobileHeader
          currentLocation={currentLocationRecord}
          onOpenLocationModal={() => setIsLocationModalOpen(true)}
          onOpenAlertsModal={() => setIsAlertSettingsOpen(true)}
          onOpenSettingsModal={() => setIsSettingsModalOpen(true)}
          onRefresh={() => fetchDashboardData(currentLocationId)}
          onGpsRefresh={() => refreshGpsPosition(true)}
          isRefreshing={loading || isBackgroundRefreshing}
          activeAlertsCount={metAlerts.length + thresholdAlarms.length}
        />

        {/* GPS Toast Notification */}
        {gpsToast && (
          <div role="status" aria-live="polite" className="sticky top-14 md:top-3 z-40 max-w-md mx-auto px-4 py-2 bg-slate-900/95 border border-sky-500/60 rounded-2xl shadow-xl backdrop-blur-md flex items-center gap-2.5 text-xs text-sky-200 animate-in slide-in-from-top duration-200">
            <Navigation className="w-4 h-4 text-sky-400 shrink-0" />
            <span className="flex-1 font-medium">{gpsToast}</span>
          </div>
        )}

        {/* Main Content Area */}
        <main className="flex-1 max-w-[1400px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-28 md:pb-8">
          {loading && !currentLocationId && activeTab !== 'locations' ? (
            <div className="flex flex-col items-center justify-center py-32 text-slate-400 space-y-3">
              <RefreshCw className="w-8 h-8 animate-spin text-sky-400" />
              <p className="text-sm font-medium">Henter værdata og tilgjengelige målinger...</p>
            </div>
          ) : activeTab === 'dashboard' && loading && !dashboardData ? (
            <div className="flex flex-col items-center justify-center py-32 text-slate-400 space-y-3">
              <RefreshCw className="w-8 h-8 animate-spin text-sky-400" />
              <p className="text-sm font-medium">Henter værdata og tilgjengelige målinger...</p>
            </div>
          ) : activeTab === 'dashboard' && dashboardError && !dashboardData ? (
            <div className="mx-auto my-16 max-w-lg rounded-2xl border border-rose-800/60 bg-rose-950/30 p-7 text-center">
              <AlertCircle className="mx-auto mb-3 h-8 w-8 text-rose-400" />
              <h1 className="text-lg font-bold text-white">Kunne ikke hente værdata</h1>
              <p className="mt-2 text-sm text-slate-300" role="alert">{dashboardError}</p>
              <button
                type="button"
                onClick={() => fetchDashboardData(currentLocationId)}
                className="mt-5 min-h-11 rounded-xl bg-sky-600 px-4 py-2 text-sm font-bold text-white hover:bg-sky-500"
              >
                Prøv på nytt
              </button>
            </div>
          ) : !currentLocationId && activeTab !== 'locations' ? (
            <div className="mx-auto my-16 max-w-lg rounded-2xl border border-slate-700 bg-slate-900/50 p-7 text-center">
              <AlertCircle className="mx-auto mb-3 h-8 w-8 text-sky-400" aria-hidden="true" />
              <h1 className="text-lg font-bold text-white">Velg et sted</h1>
              <p className="mt-2 text-sm text-slate-300">Legg til eller velg et sted før denne visningen kan hente data.</p>
              <button
                type="button"
                onClick={() => setIsLocationModalOpen(true)}
                className="mt-5 min-h-11 rounded-xl bg-sky-600 px-4 py-2 text-sm font-bold text-white hover:bg-sky-500"
              >
                Åpne stedsvelger
              </button>
            </div>
          ) : (
            <>
              {activeTab === 'dashboard' && dashboardData && (
                <WeatherDashboard
                  data={dashboardData}
                  isBackgroundRefreshing={isBackgroundRefreshing}
                  metAlerts={metAlerts}
                  thresholdAlarms={thresholdAlarms}
                  savedLocations={savedLocations}
                  onQuickSelectLocation={handleSelectLocation}
                  onOpenAlertSettings={() => setIsAlertSettingsOpen(true)}
                  onRefresh={() => fetchDashboardData(currentLocationId)}
                  onOpenLocationModal={() => setIsLocationModalOpen(true)}
                  onNavigateToForecast={() => setActiveTab('forecast')}
                  onNavigateToHistory={(range) => {
                    setHistoryInitialRange(range || '30d');
                    setActiveTab('history');
                  }}
                  onNavigateToAstronomy={() => setActiveTab('astronomy')}
                  onNavigateToCalibration={() => setActiveTab('calibration')}
                />
              )}

              {activeTab === 'locations' && (
                <LocationsOverviewView
                  currentLocationId={currentLocationId}
                  onSelectLocation={handleSelectLocation}
                  onNavigateToDashboard={() => setActiveTab('dashboard')}
                />
              )}

              {activeTab === 'forecast' && (
                <ForecastView locationId={currentLocationId} />
              )}

              {activeTab === 'history' && (
                <HistoryView locationId={currentLocationId} initialRange={historyInitialRange} />
              )}

              {activeTab === 'accuracy' && (
                <ForecastAccuracyView locationId={currentLocationId} />
              )}

              {activeTab === 'construction' && (
                <ConstructionModeView locationId={currentLocationId} />
              )}

              {activeTab === 'astronomy' && (
                <AstronomyView locationId={currentLocationId} />
              )}

              {activeTab === 'sources' && (
                <DataSourcesView
                  locationId={currentLocationId}
                  onRefresh={() => fetchDashboardData(currentLocationId)}
                  onNavigateToCalibration={() => setActiveTab('calibration')}
                />
              )}

              {activeTab === 'calibration' && (
                <CalibrationView
                  locationId={currentLocationId}
                  onRefreshDashboard={() => fetchDashboardData(currentLocationId, true)}
                />
              )}
            </>
          )}
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <MobileNav
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onOpenSettings={() => setIsSettingsModalOpen(true)}
      />

      {/* Startup GPS Permission Modal */}
      <GpsStartupModal
        isOpen={isGpsStartupModalOpen}
        onClose={() => setIsGpsStartupModalOpen(false)}
        onGpsLocationResolved={(locId) => {
          setCurrentLocationId(locId);
          currentLocationIdRef.current = locId;
          setActiveLocationId(locId);
          setDashboardData(null);
          void fetchDashboardData(locId);
        }}
        defaultLocationName={currentLocationRecord?.name || 'valgt standardsted'}
      />

      {/* Modals */}
      <LocationModal
        isOpen={isLocationModalOpen}
        onClose={() => {
          setIsLocationModalOpen(false);
          fetchLocationsList();
        }}
        currentLocationId={currentLocationId}
        onSelectLocation={handleSelectLocation}
        onLocationCreatedOrDeleted={() => {
          void fetchLocationsList();
        }}
      />

      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        onRefreshData={(locationId) => fetchDashboardData(locationId || currentLocationId)}
        onLocationSelected={handleSelectLocation}
        onNavigateToCalibration={() => setActiveTab('calibration')}
      />

      <AlertSettingsModal
        isOpen={isAlertSettingsOpen}
        onClose={() => setIsAlertSettingsOpen(false)}
        onAlertsUpdated={() => fetchAlerts(currentLocationId)}
      />
    </div>
    </ErrorBoundary>
  );
}
