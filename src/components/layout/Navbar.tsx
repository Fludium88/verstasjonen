'use client';

import React from 'react';
import {
  CloudSun,
  LayoutDashboard,
  CalendarDays,
  History,
  Target,
  Radio,
  Settings,
  ChevronDown,
  MapPin,
  SunMoon,
} from 'lucide-react';
import { LocationRecord } from '@/types/weather';

export type NavTab = 'dashboard' | 'forecast' | 'history' | 'astronomy' | 'accuracy' | 'sources';

interface NavbarProps {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  currentLocation: LocationRecord | null;
  onOpenLocationModal: () => void;
  onOpenSettingsModal: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  onTabChange,
  currentLocation,
  onOpenLocationModal,
  onOpenSettingsModal,
}) => {
  const tabs: { id: NavTab; label: string; icon: React.FC<{ className?: string }> }[] = [
    { id: 'dashboard', label: 'Oversikt', icon: LayoutDashboard },
    { id: 'forecast', label: 'Prognose', icon: CalendarDays },
    { id: 'history', label: 'Historikk', icon: History },
    { id: 'astronomy', label: 'Sol & måne', icon: SunMoon },
    { id: 'accuracy', label: 'Treffsikkerhet', icon: Target },
    { id: 'sources', label: 'Datakilder', icon: Radio },
  ];

  return (
    <header className="sticky top-0 z-40 bg-slate-950/80 backdrop-blur-md border-b border-slate-800/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand Logo & Name */}
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-tr from-sky-600 to-cyan-500 shadow-md shadow-sky-900/30 text-white">
              <CloudSun className="w-5 h-5" />
            </div>
            <div>
              <span className="text-base font-bold tracking-tight text-white flex items-center gap-1.5">
                VÆRSTASJONEN
                <span className="text-[10px] uppercase font-mono px-1.5 py-0.2 rounded bg-sky-500/20 text-sky-400 border border-sky-500/30">
                  Virtual
                </span>
              </span>
              <p className="text-[10px] text-slate-400 hidden sm:block">Digital meteorologisk telemetri</p>
            </div>
          </div>

          {/* Desktop Navigation Links */}
          <nav aria-label="Hovednavigasjon" className="hidden md:flex items-center gap-1 bg-slate-900/90 p-1 rounded-xl border border-slate-800">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  type="button"
                  key={tab.id}
                  onClick={() => onTabChange(tab.id)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`flex min-h-11 items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium transition duration-150 ${
                    isActive
                      ? 'bg-sky-600 text-white shadow-sm shadow-sky-900/50'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </nav>

          {/* Right Actions: Location Switcher & Settings */}
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onOpenLocationModal}
              className="flex min-h-11 items-center gap-2 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-xs font-medium text-slate-200 transition shadow-sm"
              aria-label={`Bytt sted. Valgt sted: ${currentLocation?.name || 'ingen'}`}
            >
              <MapPin className="w-3.5 h-3.5 text-sky-400" />
              <span className="font-semibold max-w-[120px] truncate">{currentLocation?.name || 'Sted ikke valgt'}</span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>

            <button
              type="button"
              onClick={onOpenSettingsModal}
              className="min-h-11 min-w-11 p-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-slate-400 hover:text-white transition"
              title="Innstillinger og Frost API"
              aria-label="Åpne innstillinger"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
