'use client';

import React from 'react';
import {
  Home,
  Calendar,
  LineChart,
  BarChart3,
  HardHat,
  Radio,
  Settings,
  CloudSun,
  SunMoon,
  ShieldAlert,
  MapPin,
  Sliders,
} from 'lucide-react';
import { PwaInstallPrompt } from '../pwa/PwaInstallPrompt';

export type NavTab =
  | 'dashboard'
  | 'locations'
  | 'forecast'
  | 'history'
  | 'astronomy'
  | 'accuracy'
  | 'construction'
  | 'sources'
  | 'calibration'
  | 'settings';

interface SidebarProps {
  activeTab: NavTab;
  setActiveTab: (tab: NavTab) => void;
  onOpenSettings: () => void;
  onOpenAlerts?: () => void;
  activeAlertsCount?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  onOpenSettings,
  onOpenAlerts,
  activeAlertsCount = 0,
}) => {
  const navItems = [
    { id: 'dashboard' as NavTab, label: 'Oversikt', icon: Home },
    { id: 'locations' as NavTab, label: 'Mine steder', icon: MapPin },
    { id: 'forecast' as NavTab, label: 'Prognose', icon: Calendar },
    { id: 'history' as NavTab, label: 'Historikk', icon: LineChart },
    { id: 'astronomy' as NavTab, label: 'Sol & måne', icon: SunMoon },
    { id: 'accuracy' as NavTab, label: 'Analyse', icon: BarChart3 },
    { id: 'construction' as NavTab, label: 'Anlegg', icon: HardHat },
    { id: 'sources' as NavTab, label: 'Datakilder', icon: Radio },
    { id: 'calibration' as NavTab, label: 'Kalibrering', icon: Sliders },
  ];

  return (
    <aside className="w-60 bg-[#080d1a] border-r border-slate-800/80 flex flex-col shrink-0 min-h-screen select-none justify-between">
      <div>
        {/* Brand Header */}
        <div className="p-6 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-sky-900/30">
            <CloudSun className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-white tracking-wide">Værstasjonen</h1>
            <span className="text-[10px] text-sky-400 font-mono font-medium">Digital telemetri</span>
          </div>
        </div>

        {/* Navigation Items */}
        <nav aria-label="Hovednavigasjon" className="px-3 py-2 space-y-1.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all duration-150 ${
                  isActive
                    ? 'bg-sky-600 text-white shadow-md shadow-sky-900/40'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                <span>{item.label}</span>
              </button>
            );
          })}

          {/* Varsler / Alarmer Button */}
          {onOpenAlerts && (
            <button
              onClick={onOpenAlerts}
              className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 transition group"
            >
              <div className="flex items-center gap-3">
                <ShieldAlert className="w-4 h-4 text-amber-400 group-hover:scale-110 transition" />
                <span>Varsler & Alarmer</span>
              </div>
              {activeAlertsCount > 0 && (
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping shadow-sm" />
              )}
            </button>
          )}
        </nav>
      </div>

      {/* Bottom section: PWA install prompt & Settings */}
      <div className="p-3 border-t border-slate-800/60 space-y-2">
        <PwaInstallPrompt />

        <button
          onClick={onOpenSettings}
          className="w-full flex items-center gap-3 px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 transition"
        >
          <Settings className="w-4 h-4 text-slate-400" />
          <span>Innstillinger</span>
        </button>
      </div>
    </aside>
  );
};
