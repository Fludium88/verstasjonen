'use client';

import React from 'react';
import {
  CloudSun,
  MapPin,
  RefreshCw,
  ShieldAlert,
  Settings,
  ChevronDown,
  Navigation,
} from 'lucide-react';
import { LocationRecord } from '@/types/weather';
import { PwaInstallPrompt } from '../pwa/PwaInstallPrompt';
import { isGpsLocationId } from '@/lib/locationGps';

interface MobileHeaderProps {
  currentLocation?: LocationRecord | null;
  onOpenLocationModal: () => void;
  onOpenAlertsModal?: () => void;
  onOpenSettingsModal: () => void;
  onRefresh: () => void;
  onGpsRefresh?: () => void;
  isRefreshing?: boolean;
  activeAlertsCount?: number;
}

export const MobileHeader: React.FC<MobileHeaderProps> = ({
  currentLocation,
  onOpenLocationModal,
  onOpenAlertsModal,
  onOpenSettingsModal,
  onRefresh,
  onGpsRefresh,
  isRefreshing = false,
  activeAlertsCount = 0,
}) => {
  const isGpsActive =
    isGpsLocationId(currentLocation?.id) ||
    (currentLocation?.name && (currentLocation.name.includes('GPS') || currentLocation.name.includes('Min posisjon')));

  return (
    <header className="md:hidden sticky top-0 z-30 bg-[#070b16]/95 backdrop-blur-lg border-b border-slate-800/80 px-2 sm:px-4 py-2">
      <div className="flex items-center justify-between gap-1.5">
        {/* Brand & Location Switcher */}
        <div className="flex items-center gap-2 min-w-0">
          <div className="hidden min-[380px]:flex w-9 h-9 rounded-xl bg-gradient-to-tr from-sky-600 to-indigo-600 items-center justify-center text-white shadow-md shrink-0">
            <CloudSun className="w-4 h-4" />
          </div>

          <button
            type="button"
            onClick={onOpenLocationModal}
            aria-label={`Bytt sted. Valgt sted: ${currentLocation?.name || 'ingen'}`}
            className={`flex min-h-11 min-w-0 items-center gap-1.5 px-2 py-1 rounded-xl text-left active:bg-slate-800 transition border ${
              isGpsActive
                ? 'bg-sky-950/70 border-sky-600/60 text-sky-200'
                : 'bg-slate-900/90 border-slate-700/80 text-white'
            }`}
          >
            {isGpsActive ? (
              <Navigation className="w-3.5 h-3.5 text-sky-400 shrink-0" />
            ) : (
              <MapPin className="w-3.5 h-3.5 text-sky-400 shrink-0" />
            )}
            <span className="text-xs font-bold truncate max-w-[82px] min-[380px]:max-w-[110px]">
              {currentLocation?.name || 'Sted ikke valgt'}
            </span>
            <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" />
          </button>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* PWA Install Button on Mobile */}
          <div className="hidden sm:block"><PwaInstallPrompt variant="compact" /></div>

          {/* Quick GPS Refresh Button if GPS active */}
          {isGpsActive && onGpsRefresh && (
            <button
              type="button"
              onClick={onGpsRefresh}
              className="min-h-10 min-w-10 p-2 rounded-xl bg-sky-950/60 border border-sky-800/60 text-sky-400 hover:text-white transition"
              aria-label="Oppdater GPS-posisjon"
            >
              <Navigation className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Farevarsler / Alarmer */}
          {onOpenAlertsModal && (
            <button
              type="button"
              onClick={onOpenAlertsModal}
              className="relative min-h-10 min-w-10 p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition"
              aria-label={`Farevarsler og alarmer${activeAlertsCount > 0 ? `, ${activeAlertsCount} aktive` : ''}`}
            >
              <ShieldAlert className={`w-4 h-4 ${activeAlertsCount > 0 ? 'text-amber-400' : 'text-slate-400'}`} />
              {activeAlertsCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-500 text-black text-[9px] font-extrabold flex items-center justify-center">
                  {activeAlertsCount}
                </span>
              )}
            </button>
          )}

          {/* Quick Refresh */}
          <button
            type="button"
            onClick={onRefresh}
            className="min-h-10 min-w-10 p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition"
            aria-label="Oppdater målinger"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-sky-400' : ''}`} />
          </button>

          {/* Settings */}
          <button
            type="button"
            onClick={onOpenSettingsModal}
            className="min-h-10 min-w-10 p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition"
            aria-label="Innstillinger"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
