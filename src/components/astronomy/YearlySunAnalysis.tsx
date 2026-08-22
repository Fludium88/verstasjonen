'use client';

import React, { useState } from 'react';
import { YearlySunAnalysisData } from '@/types/astronomy';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';
import { Sun, Calendar, Sparkles, Clock, Compass } from 'lucide-react';

interface YearlySunAnalysisProps {
  yearlyData: YearlySunAnalysisData;
}

export const YearlySunAnalysis: React.FC<YearlySunAnalysisProps> = ({ yearlyData }) => {
  const [activeTab, setActiveTab] = useState<'daylight' | 'elevation'>('daylight');

  // Find today's item
  const todayPoint = yearlyData.points.find((p) => p.isToday);

  return (
    <div className="bg-slate-900/70 border border-slate-800/80 rounded-2xl p-4 sm:p-6 shadow-xl backdrop-blur-sm space-y-6">
      {/* Header & Toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
            <Sun className="w-5 h-5 text-amber-400" />
            <span>Årsvisning for Solen ({yearlyData.year})</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Sesongvariasjon i dagslengde, maksimal solhøyde, solverv og jevndøgn
          </p>
        </div>

        {/* Tab Toggle */}
        <div className="flex items-center bg-slate-950/80 border border-slate-800 rounded-xl p-1 shrink-0">
          <button
            onClick={() => setActiveTab('daylight')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              activeTab === 'daylight'
                ? 'bg-amber-600 text-white shadow-sm shadow-amber-900/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Dagslengde (timer)
          </button>
          <button
            onClick={() => setActiveTab('elevation')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              activeTab === 'elevation'
                ? 'bg-amber-600 text-white shadow-sm shadow-amber-900/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Maks solhøyde (grader)
          </button>
        </div>
      </div>

      {/* Key Annual Metrics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1">
          <span className="text-amber-400 text-[11px] font-semibold flex items-center gap-1">
            <Sparkles className="w-3 h-3" /> Sommersolverv
          </span>
          <div className="font-bold text-white text-sm">
            {yearlyData.seasons.summerSolstice.displayDate}
          </div>
          <span className="text-slate-400 text-[11px] block">
            Lengste dag: {yearlyData.longestDay.formatted}
          </span>
        </div>

        <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1">
          <span className="text-sky-400 text-[11px] font-semibold flex items-center gap-1">
            <Sparkles className="w-3 h-3" /> Vintersolverv
          </span>
          <div className="font-bold text-white text-sm">
            {yearlyData.seasons.winterSolstice.displayDate}
          </div>
          <span className="text-slate-400 text-[11px] block">
            Korteste dag: {yearlyData.shortestDay.formatted}
          </span>
        </div>

        <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1">
          <span className="text-emerald-400 text-[11px] font-semibold">Vårjevndøgn</span>
          <div className="font-bold text-white text-sm">
            {yearlyData.seasons.springEquinox.displayDate}
          </div>
          <span className="text-slate-400 text-[11px] block">
            Kl. {yearlyData.seasons.springEquinox.displayTime}
          </span>
        </div>

        <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1">
          <span className="text-orange-400 text-[11px] font-semibold">Høstjevndøgn</span>
          <div className="font-bold text-white text-sm">
            {yearlyData.seasons.autumnEquinox.displayDate}
          </div>
          <span className="text-slate-400 text-[11px] block">
            Kl. {yearlyData.seasons.autumnEquinox.displayTime}
          </span>
        </div>
      </div>

      {/* Main Annual Chart */}
      <div className="w-full h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={yearlyData.points} margin={{ top: 10, right: 10, left: -15, bottom: 5 }}>
            <defs>
              <linearGradient id="daylightGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.45} />
                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="elevationGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f97316" stopOpacity={0.45} />
                <stop offset="95%" stopColor="#f97316" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />

            <XAxis
              dataKey="displayDate"
              stroke="#64748b"
              fontSize={11}
              interval={25} // show nicely spaced date labels
            />

            <YAxis
              stroke="#64748b"
              fontSize={11}
              domain={activeTab === 'daylight' ? [0, 'dataMax + 1'] : [0, 'dataMax + 5']}
              tickFormatter={(v) => (activeTab === 'daylight' ? `${v} t` : `${v}°`)}
            />

            {/* Today Reference Line */}
            {todayPoint && (
              <ReferenceLine
                x={todayPoint.displayDate}
                stroke="#38bdf8"
                strokeWidth={2}
                strokeDasharray="3 3"
                label={{
                  value: 'I dag',
                  position: 'top',
                  fill: '#38bdf8',
                  fontSize: 10,
                  fontWeight: 700,
                }}
              />
            )}

            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload || !payload.length) return null;
                const p = payload[0].payload;
                return (
                  <div className="bg-slate-900 border border-slate-700 rounded-xl p-3 shadow-xl text-xs space-y-1.5">
                    <div className="font-bold text-white flex items-center justify-between gap-3">
                      <span>{p.displayDate} {yearlyData.year}</span>
                      {p.solsticeEquinoxLabel && (
                        <span className="text-amber-400 font-semibold">{p.solsticeEquinoxLabel}</span>
                      )}
                    </div>
                    <div className="text-slate-300">
                      Dagslengde: <span className="font-bold text-amber-300 font-mono">{p.daylightFormatted}</span>
                    </div>
                    <div className="text-slate-300">
                      Maks solhøyde: <span className="font-bold text-orange-300 font-mono">+{p.maxSunAltitude}°</span>
                    </div>
                  </div>
                );
              }}
            />

            {activeTab === 'daylight' ? (
              <Area
                type="monotone"
                dataKey="daylightHours"
                name="Dagslengde (timer)"
                stroke="#f59e0b"
                strokeWidth={2.5}
                fill="url(#daylightGrad)"
                dot={false}
                activeDot={{ r: 5, fill: '#fbbf24', stroke: '#fff', strokeWidth: 2 }}
              />
            ) : (
              <Area
                type="monotone"
                dataKey="maxSunAltitude"
                name="Maks solhøyde (grader)"
                stroke="#f97316"
                strokeWidth={2.5}
                fill="url(#elevationGrad)"
                dot={false}
                activeDot={{ r: 5, fill: '#fb923c', stroke: '#fff', strokeWidth: 2 }}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
