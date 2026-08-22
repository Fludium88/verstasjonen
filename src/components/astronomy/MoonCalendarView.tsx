'use client';

import React, { useState } from 'react';
import { MonthMoonDay } from '@/types/astronomy';
import { MoonPhaseIcon } from './MoonPhaseIcon';
import { useAccessibleDialog } from '../common/useAccessibleDialog';
import {
  Calendar as CalendarIcon,
  LineChart as ChartIcon,
  Table as TableIcon,
  ChevronLeft,
  ChevronRight,
  Compass,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  Sparkles,
  X,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';

interface MoonCalendarViewProps {
  monthDays: MonthMoonDay[];
  currentYear: number;
  currentMonth: number;
  onMonthChange: (year: number, month: number) => void;
  onSelectDate: (dateStr: string) => void;
  selectedDateStr: string;
}

type ViewMode = 'calendar' | 'altitude' | 'table';

export const MoonCalendarView: React.FC<MoonCalendarViewProps> = ({
  monthDays,
  currentYear,
  currentMonth,
  onMonthChange,
  onSelectDate,
  selectedDateStr,
}) => {
  const [viewMode, setViewMode] = useState<ViewMode>('calendar');
  const [activeDetailDay, setActiveDetailDay] = useState<MonthMoonDay | null>(null);
  const detailDialogRef = useAccessibleDialog<HTMLDivElement>(
    Boolean(activeDetailDay),
    () => setActiveDetailDay(null),
  );

  const monthNamesNorwegian = [
    'Januar',
    'Februar',
    'Mars',
    'April',
    'Mai',
    'Juni',
    'Juli',
    'August',
    'September',
    'Oktober',
    'November',
    'Desember',
  ];

  const currentMonthName = monthNamesNorwegian[currentMonth - 1] || 'Ukjent måned';

  const handlePrevMonth = () => {
    if (currentMonth === 1) {
      onMonthChange(currentYear - 1, 12);
    } else {
      onMonthChange(currentYear, currentMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 12) {
      onMonthChange(currentYear + 1, 1);
    } else {
      onMonthChange(currentYear, currentMonth + 1);
    }
  };

  // Calendar weekday grid calculation (Norwegian week: Mon=0 .. Sun=6)
  // Get day of week for 1st of month: 0=Sun in JS Date, so (day + 6) % 7 gives Mon=0, Sun=6
  const firstDayOfMonth = new Date(currentYear, currentMonth - 1, 1).getDay();
  const leadingBlankDays = (firstDayOfMonth + 6) % 7;

  const weekdays = ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn'];

  return (
    <div className="bg-slate-900/70 border border-slate-800/80 rounded-2xl p-4 sm:p-6 shadow-xl backdrop-blur-sm space-y-5">
      {/* Top Header: Title, Month Navigator & View Mode Toggle */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
            <span>Månekalender & Månedsanalyse</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Belysningsgrad, månefaser og maksimal høyde per natt
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Month Switcher */}
          <div className="flex items-center bg-slate-950/80 border border-slate-800 rounded-xl p-1 shadow-inner">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="min-h-11 min-w-11 p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              aria-label="Forrige måned"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-3 text-xs font-bold text-slate-100 min-w-[110px] text-center">
              {currentMonthName} {currentYear}
            </span>
            <button
              type="button"
              onClick={handleNextMonth}
              className="min-h-11 min-w-11 p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              aria-label="Neste måned"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center bg-slate-950/80 border border-slate-800 rounded-xl p-1">
            <button
              type="button"
              onClick={() => setViewMode('calendar')}
              aria-pressed={viewMode === 'calendar'}
              className={`flex min-h-11 items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition ${
                viewMode === 'calendar'
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <CalendarIcon className="w-3.5 h-3.5" />
              <span>Kalender</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('altitude')}
              aria-pressed={viewMode === 'altitude'}
              className={`flex min-h-11 items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition ${
                viewMode === 'altitude'
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <ChartIcon className="w-3.5 h-3.5" />
              <span>Månehøyde</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              aria-pressed={viewMode === 'table'}
              className={`flex min-h-11 items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition ${
                viewMode === 'table'
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <TableIcon className="w-3.5 h-3.5" />
              <span>Tabell</span>
            </button>
          </div>
        </div>
      </div>

      {/* VIEW 1: CALENDAR GRID */}
      {viewMode === 'calendar' && (
        <div className="overflow-x-auto pb-1">
          <div className="min-w-[520px] space-y-2">
          {/* Weekday Headers */}
          <div className="grid grid-cols-7 gap-1.5 text-center text-xs font-semibold text-slate-400 pb-1">
            {weekdays.map((w, idx) => (
              <div key={idx} className="py-1">
                {w}
              </div>
            ))}
          </div>

          {/* Calendar Grid Cells */}
          <div className="grid grid-cols-7 gap-1.5">
            {/* Blank leading slots */}
            {Array.from({ length: leadingBlankDays }).map((_, i) => (
              <div
                key={`blank-${i}`}
                className="aspect-square sm:aspect-[1.1] rounded-xl bg-slate-950/20 border border-dashed border-slate-900"
              />
            ))}

            {/* Days in month */}
            {monthDays.map((day) => {
              const isSelected = day.date === selectedDateStr;
              return (
                <button
                  type="button"
                  key={day.date}
                  onClick={() => setActiveDetailDay(day)}
                  aria-label={`${day.dayNumber}. ${currentMonthName}: ${day.phaseName}, ${day.illuminationPct} prosent belyst`}
                  className={`aspect-square sm:aspect-[1.1] rounded-xl p-1.5 flex flex-col items-center justify-between transition-all group relative border ${
                    isSelected
                      ? 'bg-sky-950/60 border-sky-500 shadow-md shadow-sky-900/40 ring-1 ring-sky-500'
                      : day.isCurrentDay
                      ? 'bg-slate-800/80 border-sky-400/80'
                      : 'bg-slate-950/60 border-slate-800/80 hover:bg-slate-800/60 hover:border-slate-700'
                  }`}
                >
                  {/* Top Day Number */}
                  <div className="w-full flex items-center justify-between text-[11px] font-bold">
                    <span
                      className={`${
                        day.isCurrentDay
                          ? 'text-sky-400 font-extrabold'
                          : isSelected
                          ? 'text-sky-200'
                          : 'text-slate-300'
                      }`}
                    >
                      {day.dayNumber}
                    </span>
                    {day.isCurrentDay && (
                      <span className="w-1.5 h-1.5 rounded-full bg-sky-400" title="I dag" />
                    )}
                  </div>

                  {/* Moon Graphic */}
                  <div className="my-auto py-0.5">
                    <MoonPhaseIcon
                      fraction={day.illuminationFraction}
                      phaseAngle={day.phaseAngle}
                      size={28}
                    />
                  </div>

                  {/* Bottom Illumination % */}
                  <div className="text-[10px] font-mono text-slate-400 group-hover:text-slate-200">
                    {day.illuminationPct} %
                  </div>
                </button>
              );
            })}
          </div>
          {monthDays.length === 0 && <p className="py-10 text-center text-sm text-slate-400">Ingen månedata er tilgjengelige.</p>}
          </div>
        </div>
      )}

      {/* VIEW 2: MONTHLY ALTITUDE CHART */}
      {viewMode === 'altitude' && (
        <div className="space-y-4">
          <div className="text-xs text-slate-400">
            Viser maksimal månehøyde over horisonten for hver natt i {currentMonthName} {currentYear}. Høyere topper betyr bedre lys og sikt.
          </div>

          <div className="w-full h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthDays} margin={{ top: 10, right: 10, left: -15, bottom: 5 }}>
                <defs>
                  <linearGradient id="moonAltGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="dayNumber" stroke="#64748b" fontSize={11} />
                <YAxis
                  stroke="#64748b"
                  fontSize={11}
                  tickFormatter={(v) => `${v > 0 ? '+' : ''}${v}°`}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload || !payload.length) return null;
                    const d: MonthMoonDay = payload[0].payload;
                    return (
                      <div className="bg-slate-900 border border-slate-700 rounded-xl p-3 shadow-xl text-xs space-y-1.5">
                        <div className="font-bold text-white flex items-center justify-between gap-3">
                          <span>{d.dayNumber}. {currentMonthName}</span>
                          <span className="text-sky-400">{d.phaseName} ({d.illuminationPct} %)</span>
                        </div>
                        <div className="text-slate-300">
                          Maks høyde: <span className="font-bold text-sky-300 font-mono">+{d.maxAltitude}°</span>
                        </div>
                        <div className="text-slate-400 text-[11px]">
                          Kulminasjon: {d.culminationTime || '–'} ({d.directionAtCulmination})
                        </div>
                        <div className="text-slate-400 text-[11px]">
                          Opp: {d.moonrise || '–'} | Ned: {d.moonset || '–'}
                        </div>
                      </div>
                    );
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="maxAltitude"
                  name="Maks månehøyde"
                  stroke="#38bdf8"
                  strokeWidth={2.5}
                  fill="url(#moonAltGrad)"
                  dot={{ r: 3, fill: '#38bdf8' }}
                  activeDot={{ r: 6, fill: '#fff', stroke: '#38bdf8', strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* VIEW 3: TABLE */}
      {viewMode === 'table' && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 font-semibold bg-slate-950/40">
                <th className="py-2.5 px-3">Dato</th>
                <th className="py-2.5 px-3">Fase & Belysning</th>
                <th className="py-2.5 px-3">Maks høyde</th>
                <th className="py-2.5 px-3">Kulminasjon</th>
                <th className="py-2.5 px-3">Måneoppgang</th>
                <th className="py-2.5 px-3">Månenedgang</th>
                <th className="py-2.5 px-3">Retning</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-medium text-slate-200">
              {monthDays.map((d) => (
                <tr
                  key={d.date}
                  onClick={() => setActiveDetailDay(d)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setActiveDetailDay(d);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  aria-label={`Vis detaljer for ${d.dayNumber}. ${currentMonthName}`}
                  className={`hover:bg-slate-800/50 cursor-pointer transition ${
                    d.date === selectedDateStr ? 'bg-sky-950/40' : ''
                  }`}
                >
                  <td className="py-2 px-3 font-semibold text-white">
                    {d.dayNumber}. {currentMonthName}
                  </td>
                  <td className="py-2 px-3">
                    <div className="flex items-center gap-2">
                      <MoonPhaseIcon
                        fraction={d.illuminationFraction}
                        phaseAngle={d.phaseAngle}
                        size={18}
                        showGlow={false}
                      />
                      <span>{d.phaseName} ({d.illuminationPct} %)</span>
                    </div>
                  </td>
                  <td className="py-2 px-3 font-mono font-bold text-sky-300">
                    +{d.maxAltitude}°
                  </td>
                  <td className="py-2 px-3 font-mono text-slate-300">
                    {d.culminationTime || '–'}
                  </td>
                  <td className="py-2 px-3 font-mono text-slate-400">
                    {d.moonrise || '–'}
                  </td>
                  <td className="py-2 px-3 font-mono text-slate-400">
                    {d.moonset || '–'}
                  </td>
                  <td className="py-2 px-3 text-slate-300">
                    {d.directionAtCulmination} ({d.azimuthAtCulmination}°)
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* DAY DETAIL MODAL / DRAWER */}
      {activeDetailDay && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div
            ref={detailDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="moon-detail-title"
            className="bg-slate-900 border border-slate-700/80 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-3">
                <MoonPhaseIcon
                  fraction={activeDetailDay.illuminationFraction}
                  phaseAngle={activeDetailDay.phaseAngle}
                  size={42}
                />
                <div>
                  <h3 id="moon-detail-title" className="text-base font-bold text-white">
                    {activeDetailDay.dayNumber}. {currentMonthName} {currentYear}
                  </h3>
                  <span className="text-xs text-sky-400 font-semibold">
                    {activeDetailDay.phaseName} • {activeDetailDay.illuminationPct} % belyst
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveDetailDay(null)}
                className="min-h-11 min-w-11 p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
                aria-label="Lukk månedetaljer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1">
                <span className="text-slate-400 block text-[11px]">Månealder</span>
                <span className="font-mono font-bold text-white text-sm">
                  {activeDetailDay.moonAgeDays} dager
                </span>
              </div>

              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1">
                <span className="text-slate-400 block text-[11px]">Maks høyde (kulminasjon)</span>
                <span className="font-mono font-bold text-sky-300 text-sm">
                  +{activeDetailDay.maxAltitude}° ({activeDetailDay.directionAtCulmination})
                </span>
              </div>

              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1">
                <div className="flex items-center gap-1 text-slate-400 text-[11px]">
                  <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Måneoppgang</span>
                </div>
                <span className="font-mono font-bold text-white text-sm">
                  {activeDetailDay.moonrise || 'Ingen oppgang'}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1">
                <div className="flex items-center gap-1 text-slate-400 text-[11px]">
                  <ArrowDownRight className="w-3.5 h-3.5 text-rose-400" />
                  <span>Månenedgang</span>
                </div>
                <span className="font-mono font-bold text-white text-sm">
                  {activeDetailDay.moonset || 'Ingen nedgang'}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1 col-span-2">
                <div className="flex items-center gap-1 text-slate-400 text-[11px]">
                  <Clock className="w-3.5 h-3.5 text-sky-400" />
                  <span>Høyeste punkt på himmelen</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-white text-sm">
                    Kl. {activeDetailDay.culminationTime || '–'}
                  </span>
                  <span className="text-slate-400 text-xs">
                    Azimut: {activeDetailDay.azimuthAtCulmination}° {activeDetailDay.directionAtCulmination}
                  </span>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  onSelectDate(activeDetailDay.date);
                  setActiveDetailDay(null);
                }}
                className="flex-1 min-h-11 py-2.5 px-4 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-semibold text-xs shadow-md shadow-sky-900/40 transition"
              >
                Vis full 24h dagsgraf for denne datoen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
