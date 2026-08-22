'use client';

import React, { useState } from 'react';
import {
  AlertTriangle,
  Flame,
  Wind,
  Droplets,
  ThermometerSnowflake,
  TrendingDown,
  ChevronDown,
  ChevronUp,
  Settings,
  ShieldAlert,
} from 'lucide-react';
import { MetAlertItem, ThresholdAlarm } from '@/types/alerts';

interface AlertsBannerProps {
  metAlerts: MetAlertItem[];
  thresholdAlarms: ThresholdAlarm[];
  onOpenAlertSettings: () => void;
}

export const AlertsBanner: React.FC<AlertsBannerProps> = ({
  metAlerts,
  thresholdAlarms,
  onOpenAlertSettings,
}) => {
  const [expanded, setExpanded] = useState(false);

  const totalCount = metAlerts.length + thresholdAlarms.length;
  if (totalCount === 0) return null;

  // Determine highest severity
  const hasRed =
    metAlerts.some((a) => a.severity === 'RED') ||
    thresholdAlarms.some((a) => a.severity === 'RED');
  const hasOrange =
    metAlerts.some((a) => a.severity === 'ORANGE') ||
    thresholdAlarms.some((a) => a.severity === 'ORANGE');

  const themeClass = hasRed
    ? 'bg-rose-950/60 border-rose-600/60 text-rose-200'
    : hasOrange
    ? 'bg-amber-950/60 border-amber-600/60 text-amber-200'
    : 'bg-amber-950/40 border-amber-500/40 text-amber-200';

  const badgeClass = hasRed
    ? 'bg-rose-500 text-white shadow-rose-500/50'
    : hasOrange
    ? 'bg-orange-500 text-white shadow-orange-500/50'
    : 'bg-amber-500 text-slate-950 shadow-amber-500/50';

  const topTitle = hasRed
    ? 'Rødt farevarsel (Ekstremvær)'
    : hasOrange
    ? 'Oransje farevarsel (Betydelig fare)'
    : 'Gult farevarsel / Væralarm';

  return (
    <div className={`rounded-2xl border p-4 shadow-xl backdrop-blur-md transition ${themeClass}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 shadow-lg ${badgeClass}`}>
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-xs sm:text-sm font-bold tracking-tight text-white">{topTitle}</h3>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-900/80 border border-slate-700 font-mono font-bold text-slate-300">
                {totalCount} {totalCount === 1 ? 'aktivt varsel' : 'aktive varsler'}
              </span>
            </div>
            <p className="text-xs text-slate-300 truncate mt-0.5">
              {metAlerts[0]?.event_name_no || thresholdAlarms[0]?.title || 'Se detaljer'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onOpenAlertSettings}
            className="p-1.5 rounded-lg bg-slate-900/60 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/60 transition"
            title="Konfigurer alarmer og terskler"
          >
            <Settings className="w-4 h-4" />
          </button>
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 py-1.5 px-3 rounded-lg bg-slate-900/60 hover:bg-slate-800 text-xs font-semibold text-white border border-slate-700/60 transition"
          >
            <span>{expanded ? 'Skjul' : 'Vis varsler'}</span>
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Expanded Alert Details */}
      {expanded && (
        <div className="mt-4 pt-4 border-t border-slate-800/80 space-y-3">
          {/* 1. Official MET Warnings */}
          {metAlerts.map((alert) => (
            <div
              key={alert.id}
              className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs space-y-2"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldAlert
                    className={`w-4 h-4 ${
                      alert.severity === 'RED'
                        ? 'text-rose-400'
                        : alert.severity === 'ORANGE'
                        ? 'text-orange-400'
                        : 'text-amber-400'
                    }`}
                  />
                  <span className="font-bold text-white text-xs sm:text-sm">{alert.event_name_no}</span>
                </div>
                <span className="text-[10px] text-slate-400 font-mono">
                  {alert.area} · MET CAP
                </span>
              </div>

              <p className="text-slate-300 leading-relaxed">{alert.description}</p>

              {alert.consequences && (
                <div className="bg-slate-950/60 rounded-lg p-2.5 border border-slate-800/60 text-[11px] text-amber-300/90">
                  <span className="font-bold">Konsekvenser: </span>
                  {alert.consequences}
                </div>
              )}

              {alert.instruction && (
                <div className="bg-slate-950/60 rounded-lg p-2.5 border border-slate-800/60 text-[11px] text-sky-300/90">
                  <span className="font-bold">Anbefaling: </span>
                  {alert.instruction}
                </div>
              )}
            </div>
          ))}

          {/* 2. Custom Threshold Alarms */}
          {thresholdAlarms.map((alarm) => {
            const Icon =
              alarm.type === 'WIND_GUST' || alarm.type === 'STRONG_WIND'
                ? Wind
                : alarm.type === 'FROST'
                ? ThermometerSnowflake
                : alarm.type === 'HEAVY_RAIN'
                ? Droplets
                : TrendingDown;

            return (
              <div
                key={alarm.id}
                className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs flex items-start gap-3"
              >
                <div className="w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0 mt-0.5">
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 space-y-0.5">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-white text-xs">{alarm.title}</h4>
                    <span className="text-[10px] text-amber-400 font-mono font-semibold">
                      Egendefinert alarm
                    </span>
                  </div>
                  <p className="text-slate-300 text-[11px] leading-relaxed">{alarm.message}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
