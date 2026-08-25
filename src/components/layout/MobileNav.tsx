'use client';

import React from 'react';
import {
  LayoutDashboard,
  CalendarDays,
  History,
  Target,
  Radio,
  SunMoon,
  MapPin,
} from 'lucide-react';
import { NavTab } from './Sidebar';

interface MobileNavProps {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  onOpenSettings?: () => void;
}

export const MobileNav: React.FC<MobileNavProps> = ({ activeTab, onTabChange }) => {
  const tabs: { id: NavTab; label: string; icon: React.FC<{ className?: string }> }[] = [
    { id: 'dashboard', label: 'Oversikt', icon: LayoutDashboard },
    { id: 'locations', label: 'Steder', icon: MapPin },
    { id: 'forecast', label: 'Prognose', icon: CalendarDays },
    { id: 'history', label: 'Historikk', icon: History },
    { id: 'astronomy', label: 'Sol/måne', icon: SunMoon },
    { id: 'accuracy', label: 'Treff', icon: Target },
    { id: 'sources', label: 'Kilder', icon: Radio },
  ];

  return (
    <nav aria-label="Mobilnavigasjon" className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#070b16]/95 backdrop-blur-2xl border-t border-slate-800/90 px-1 pt-1 pb-[calc(env(safe-area-inset-bottom,0px)+0.35rem)] shadow-2xl shadow-black">
      <div className="flex w-full items-stretch overflow-x-auto overscroll-x-contain">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`flex min-h-12 min-w-[68px] flex-1 flex-col items-center justify-center py-1.5 px-1 rounded-xl transition-all duration-150 active:scale-95 ${
                isActive
                  ? 'text-sky-400 font-bold bg-sky-500/10 border border-sky-500/25 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Icon className={`w-4 h-4 mb-0.5 ${isActive ? 'text-sky-400 scale-110' : 'text-slate-400'}`} />
              <span className="text-[10px] leading-tight tracking-tight whitespace-nowrap">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
