'use client';

import React, { useMemo } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
  ReferenceArea,
} from 'recharts';
import { HourlyAstronomyPoint } from '@/types/astronomy';
import { Sun, Moon, Cloud, Droplets, Clock } from 'lucide-react';

interface SunMoonElevationChartProps {
  data: HourlyAstronomyPoint[];
  isToday: boolean;
  selectedTimeMinutes?: number;
  onTimeSelect?: (minutes: number) => void;
}

export const SunMoonElevationChart: React.FC<SunMoonElevationChartProps> = ({
  data,
  isToday,
  selectedTimeMinutes,
  onTimeSelect,
}) => {
  // Current time marker calculation
  const now = new Date();
  const currentDisplayTime = `${String(now.getHours()).padStart(2, '0')}:${String(
    Math.floor(now.getMinutes() / 15) * 15
  ).padStart(2, '0')}`;

  // Find y-axis domain dynamically (min -60 or -90, max +70 or +90)
  const { minY, maxY } = useMemo(() => {
    let min = -30;
    let max = 60;
    for (const d of data) {
      if (d.sunAltitude < min) min = Math.floor(d.sunAltitude / 10) * 10;
      if (d.moonAltitude < min) min = Math.floor(d.moonAltitude / 10) * 10;
      if (d.sunAltitude > max) max = Math.ceil(d.sunAltitude / 10) * 10;
      if (d.moonAltitude > max) max = Math.ceil(d.moonAltitude / 10) * 10;
    }
    return {
      minY: Math.max(-90, Math.min(-30, min - 5)),
      maxY: Math.min(90, Math.max(45, max + 5)),
    };
  }, [data]);

  // Group continuous sky segments for background color bands
  const skySegments = useMemo(() => {
    if (!data || data.length === 0) return [];
    const segments: { start: string; end: string; condition: string; label: string; color: string }[] = [];
    let current = {
      start: data[0].displayTime,
      end: data[0].displayTime,
      condition: data[0].skyCondition,
      label: data[0].skyConditionLabel,
    };

    const getColor = (cond: string) => {
      switch (cond) {
        case 'DAG':
          return 'rgba(245, 158, 11, 0.08)'; // warm sunny glow
        case 'BORGERLIG_SKUMRING':
          return 'rgba(249, 115, 22, 0.12)'; // sunset orange glow
        case 'NAUTISK_SKUMRING':
          return 'rgba(99, 102, 241, 0.14)'; // deep indigo dusk
        case 'ASTRONOMISK_SKUMRING':
          return 'rgba(30, 27, 75, 0.35)'; // navy twilight
        case 'NATT':
        default:
          return 'rgba(15, 23, 42, 0.45)'; // deep night slate
      }
    };

    for (let i = 1; i < data.length; i++) {
      const pt = data[i];
      if (pt.skyCondition !== current.condition) {
        segments.push({
          ...current,
          end: pt.displayTime,
          color: getColor(current.condition),
        });
        current = {
          start: pt.displayTime,
          end: pt.displayTime,
          condition: pt.skyCondition,
          label: pt.skyConditionLabel,
        };
      } else {
        current.end = pt.displayTime;
      }
    }
    segments.push({
      ...current,
      color: getColor(current.condition),
    });

    return segments;
  }, [data]);

  const renderTooltip = ({ active, payload }: any) => {
    if (!active || !payload || !payload.length) return null;
    const pt: HourlyAstronomyPoint = payload[0].payload;

    return (
      <div className="bg-slate-900/95 backdrop-blur-md border border-slate-700/80 rounded-xl p-3.5 shadow-2xl text-xs space-y-2.5 min-w-[210px] z-50">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
          <div className="flex items-center gap-1.5 font-bold text-white text-sm">
            <Clock className="w-3.5 h-3.5 text-sky-400" />
            <span>Kl. {pt.displayTime}</span>
          </div>
          <span
            className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
              pt.skyCondition === 'DAG'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                : pt.skyCondition === 'NATT'
                ? 'bg-indigo-950/60 text-indigo-300 border border-indigo-800/40'
                : 'bg-orange-500/20 text-orange-300 border border-orange-500/30'
            }`}
          >
            {pt.skyConditionLabel}
          </span>
        </div>

        {/* Sun Row */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-amber-400 font-semibold">
            <Sun className="w-4 h-4 text-amber-400 shrink-0" />
            <span>Sol</span>
          </div>
          <div className="text-right">
            <span className={`font-mono font-bold ${pt.sunAltitude >= 0 ? 'text-amber-300' : 'text-slate-400'}`}>
              {pt.sunAltitude > 0 ? `+${pt.sunAltitude}°` : `${pt.sunAltitude}°`}
            </span>
            <span className="text-slate-400 text-[11px] ml-2">
              {pt.sunAzimuth}° {pt.sunDirection}
            </span>
          </div>
        </div>

        {/* Moon Row */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sky-300 font-semibold">
            <Moon className="w-4 h-4 text-sky-300 shrink-0" />
            <span>Måne</span>
          </div>
          <div className="text-right">
            <span className={`font-mono font-bold ${pt.moonAltitude >= 0 ? 'text-sky-300' : 'text-slate-400'}`}>
              {pt.moonAltitude > 0 ? `+${pt.moonAltitude}°` : `${pt.moonAltitude}°`}
            </span>
            <span className="text-slate-400 text-[11px] ml-2">
              {pt.moonAzimuth}° {pt.moonDirection}
            </span>
          </div>
        </div>

        {/* Moon illumination */}
        <div className="flex items-center justify-between text-[11px] text-slate-300 pt-1 border-t border-slate-800/60">
          <span className="text-slate-400">Månebelysning:</span>
          <span className="font-semibold text-slate-200">{pt.moonIlluminationPct} %</span>
        </div>

        {/* Weather if available */}
        {(pt.cloudCoverPct != null || pt.temperature != null || pt.precipitationMm != null) && (
          <div className="pt-1.5 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-300">
            {pt.temperature != null && (
              <span className="font-medium text-slate-200">{pt.temperature > 0 ? `+${pt.temperature}°` : `${pt.temperature}°`}</span>
            )}
            {pt.cloudCoverPct != null && (
              <div className="flex items-center gap-1 text-slate-400">
                <Cloud className="w-3 h-3 text-slate-400" />
                <span>{pt.cloudCoverPct} % skyer</span>
              </div>
            )}
            {pt.precipitationMm != null && pt.precipitationMm > 0 && (
              <div className="flex items-center gap-1 text-sky-400">
                <Droplets className="w-3 h-3" />
                <span>{pt.precipitationMm} mm</span>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  if (data.length === 0) {
    return (
      <div role="status" className="rounded-2xl border border-slate-800/80 bg-slate-900/70 p-6 text-center text-sm text-slate-400">
        Ingen punkter for sol- og månehøyde er tilgjengelige for denne datoen.
      </div>
    );
  }

  const selectedDisplayTime = selectedTimeMinutes === undefined
    ? null
    : `${String(Math.floor(selectedTimeMinutes / 60)).padStart(2, '0')}:${String(selectedTimeMinutes % 60).padStart(2, '0')}`;

  return (
    <div className="bg-slate-900/70 border border-slate-800/80 rounded-2xl p-4 sm:p-6 shadow-xl backdrop-blur-sm">
      {/* Header with Title & Legend */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
            <span>Dagsgraf – Sol og måne over horisonten</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Astronomisk høyde i grader (–90° til +90°) gjennom døgnet (00:00 → 24:00)
          </p>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 text-xs font-medium">
          <div className="flex items-center gap-2">
            <span className="w-3.5 h-1 rounded-full bg-gradient-to-r from-amber-400 to-amber-500 shadow-sm shadow-amber-500/50" />
            <span className="text-amber-300 font-semibold flex items-center gap-1">
              <Sun className="w-3.5 h-3.5 text-amber-400" /> Sol
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3.5 h-1 rounded-full bg-gradient-to-r from-sky-400 to-cyan-300 shadow-sm shadow-sky-400/50" />
            <span className="text-sky-300 font-semibold flex items-center gap-1">
              <Moon className="w-3.5 h-3.5 text-sky-300" /> Måne
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-slate-400">
            <span className="w-3.5 h-0.5 border-b border-emerald-400/80 border-dashed" />
            <span className="text-[11px] text-emerald-400/90 font-mono">0° Horisont</span>
          </div>
        </div>
      </div>

      {/* Sky Conditions Indicator Bar */}
      <div className="mb-2">
        <div className="w-full h-4 rounded-lg overflow-hidden flex border border-slate-800/80 bg-slate-950/60 text-[9px] font-semibold text-center select-none">
          {skySegments.map((seg, idx) => (
            <div
              key={idx}
              style={{
                backgroundColor: seg.color,
                flex: 1,
              }}
              title={`${seg.label} (${seg.start} - ${seg.end})`}
              className="flex items-center justify-center truncate px-1 text-slate-300 border-r border-slate-800/50 last:border-none"
            >
              <span className="hidden sm:inline opacity-80">{seg.label.toUpperCase()}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Chart Canvas */}
      <div className="w-full h-[320px] sm:h-[380px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            margin={{ top: 15, right: 10, left: -10, bottom: 5 }}
            onClick={(e: any) => {
              if (e && e.activePayload && e.activePayload.length && onTimeSelect) {
                onTimeSelect(e.activePayload[0].payload.minutesFromMidnight);
              }
            }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} opacity={0.7} />

            {/* Below Horizon Darkened Zone */}
            <ReferenceArea
              y1={minY}
              y2={0}
              fill="#020617"
              fillOpacity={0.55}
            />

            {/* Above Horizon Subtle Daylight Zone */}
            <ReferenceArea
              y1={0}
              y2={maxY}
              fill="#0f172a"
              fillOpacity={0.25}
            />

            {/* 0° Prominent Horizon Reference Line */}
            <ReferenceLine
              y={0}
              stroke="#10b981"
              strokeDasharray="4 4"
              strokeWidth={1.5}
              label={{
                value: '0° Horisont',
                position: 'insideBottomRight',
                fill: '#34d399',
                fontSize: 10,
                fontWeight: 600,
              }}
            />

            {/* "NÅ" Marker if Today */}
            {isToday && (
              <ReferenceLine
                x={currentDisplayTime}
                stroke="#38bdf8"
                strokeWidth={2}
                strokeDasharray="3 3"
                label={{
                  value: 'NÅ',
                  position: 'top',
                  fill: '#38bdf8',
                  fontSize: 10,
                  fontWeight: 700,
                }}
              />
            )}

            {selectedDisplayTime && (
              <ReferenceLine
                x={selectedDisplayTime}
                stroke="#f8fafc"
                strokeWidth={1}
                strokeOpacity={0.65}
                label={{ value: 'VALGT', position: 'insideTopLeft', fill: '#cbd5e1', fontSize: 9 }}
              />
            )}

            <XAxis
              dataKey="displayTime"
              stroke="#64748b"
              fontSize={11}
              tickLine={false}
              axisLine={{ stroke: '#334155' }}
              interval={12} // Shows every 3 hours (12 * 15min = 3 hours: 00:00, 03:00, 06:00...)
            />

            <YAxis
              domain={[minY, maxY]}
              stroke="#64748b"
              fontSize={11}
              tickLine={false}
              axisLine={{ stroke: '#334155' }}
              tickFormatter={(v) => `${v > 0 ? '+' : ''}${v}°`}
            />

            <Tooltip content={renderTooltip} />

            {/* Sun Elevation Line */}
            <Line
              type="monotone"
              dataKey="sunAltitude"
              name="Solhøyde"
              stroke="#f59e0b"
              strokeWidth={3}
              dot={false}
              activeDot={{ r: 6, fill: '#fbbf24', stroke: '#fff', strokeWidth: 2 }}
              isAnimationActive={false}
            />

            {/* Moon Elevation Line */}
            <Line
              type="monotone"
              dataKey="moonAltitude"
              name="Månehøyde"
              stroke="#38bdf8"
              strokeWidth={2.5}
              strokeDasharray="5 3"
              dot={false}
              activeDot={{ r: 5, fill: '#38bdf8', stroke: '#fff', strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Footer Guidance */}
      <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400">
        <span>Kombinerer solens og månens bane i samme koordinatsystem for direkte sammenligning.</span>
        <span className="hidden sm:inline text-slate-500">Klikk på grafen for å velge tidspunkt</span>
      </div>
    </div>
  );
};
