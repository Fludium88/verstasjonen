'use client';

import React from 'react';
import { HourlyAstronomyPoint } from '@/types/astronomy';
import { MoonPhaseIcon } from './MoonPhaseIcon';
import { Sun, Moon, Compass, Play, RotateCcw, Cloud, Droplets, Thermometer } from 'lucide-react';

interface TimeSliderAndCompassProps {
  hourlyPoints: HourlyAstronomyPoint[];
  selectedMinutes: number;
  onTimeChange: (minutes: number) => void;
  isToday: boolean;
  sunriseTime?: string | null;
  sunsetTime?: string | null;
  solarNoonTime?: string | null;
}

export const TimeSliderAndCompass: React.FC<TimeSliderAndCompassProps> = ({
  hourlyPoints,
  selectedMinutes,
  onTimeChange,
  isToday,
  sunriseTime,
  sunsetTime,
  solarNoonTime,
}) => {
  // Find point corresponding to current selected minutes
  const stepIndex = Math.min(
    hourlyPoints.length - 1,
    Math.max(0, Math.round(selectedMinutes / 15))
  );
  const currentPoint = hourlyPoints[stepIndex] || hourlyPoints[0];

  const now = new Date();
  const currentActualMinutes = now.getHours() * 60 + now.getMinutes();

  const handleResetToNow = () => {
    onTimeChange(currentActualMinutes);
  };

  // Polar Compass Coordinates Calculation
  // Compass radius
  const compassRadius = 110;
  const cx = 135;
  const cy = 135;

  // Convert Azimuth (0=N, 90=E, 180=S, 270=W) & Altitude (-90 to +90) into SVG (x, y)
  const getObjectCoordinates = (azimuth: number, altitude: number) => {
    // 0 deg Azimuth is top (cy - r), 90 is right (cx + r), 180 is bottom (cy + r), 270 is left (cx - r)
    const angleRad = ((azimuth - 90) * Math.PI) / 180;
    // Normalized distance from center (90 deg altitude = center, 0 deg altitude = compassRadius, <0 is slightly outside)
    const normalizedDist =
      altitude >= 0
        ? ((90 - altitude) / 90) * compassRadius
        : compassRadius + Math.min(18, (Math.abs(altitude) / 30) * 16);

    const x = cx + normalizedDist * Math.cos(angleRad);
    const y = cy + normalizedDist * Math.sin(angleRad);
    return { x, y, isAbove: altitude > 0 };
  };

  if (!currentPoint) {
    return (
      <div role="status" className="rounded-2xl border border-slate-800/80 bg-slate-900/70 p-6 text-center text-sm text-slate-400">
        Ingen timepunkter for sol- og månebanen er tilgjengelige for denne datoen.
      </div>
    );
  }

  const sunPos = getObjectCoordinates(currentPoint.sunAltitude, currentPoint.sunAzimuth);
  const moonPos = getObjectCoordinates(currentPoint.moonAltitude, currentPoint.moonAzimuth);

  return (
    <div className="bg-slate-900/70 border border-slate-800/80 rounded-2xl p-4 sm:p-6 shadow-xl backdrop-blur-sm space-y-6">
      {/* Header with Slider Controls */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
              <Compass className="w-5 h-5 text-sky-400" />
              <span>Tidskontroll & beregnet retning (azimut)</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Dra slideren for å simulere solens og månens posisjon og himmelstatus gjennom døgnet
            </p>
          </div>

          {/* Quick presets */}
          <div className="flex items-center gap-1.5 flex-wrap text-xs">
            {isToday && (
              <button
                type="button"
                onClick={handleResetToNow}
                className="min-h-11 px-2.5 py-2 rounded-lg bg-sky-600/30 hover:bg-sky-600/50 border border-sky-500/40 text-sky-300 font-medium transition flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Nå ({String(now.getHours()).padStart(2, '0')}:{String(now.getMinutes()).padStart(2, '0')})</span>
              </button>
            )}
            {solarNoonTime && (
              <button
                type="button"
                onClick={() => {
                  const [h, m] = solarNoonTime.split(':').map(Number);
                  if (!isNaN(h) && !isNaN(m)) onTimeChange(h * 60 + m);
                }}
                className="min-h-11 px-2 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
              >
                Solmiddag ({solarNoonTime})
              </button>
            )}
          </div>
        </div>

        {/* The Time Slider Bar */}
        <div className="space-y-1.5 pt-2">
          <div className="relative">
            <input
              type="range"
              aria-label="Velg klokkeslett for sol- og måneposisjon"
              min={0}
              max={1440}
              step={15}
              value={selectedMinutes}
              onChange={(e) => onTimeChange(Number(e.target.value))}
              className="w-full h-2.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
            />
          </div>
          <div className="flex justify-between text-[11px] font-mono text-slate-400 px-1">
            <span>00:00</span>
            <span>04:00</span>
            <span>08:00</span>
            <span>12:00</span>
            <span>16:00</span>
            <span>20:00</span>
            <span>24:00</span>
          </div>
        </div>
      </div>

      {/* Main Grid: Compass + Live Telemetry Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
        {/* Left: 2D Polar Compass Visualizer (5 cols) */}
        <div className="lg:col-span-5 flex flex-col items-center justify-center p-3 bg-slate-950/60 rounded-2xl border border-slate-800/80">
          <div className="text-center mb-1">
            <span className="text-xs font-semibold text-slate-300">Horisontkompass & Himmelhvelv</span>
            <span className="text-[10px] text-slate-400 block">Senter = Zenit (90° rett opp), Ytterring = Horisont (0°)</span>
          </div>

          <svg
            width="270"
            height="270"
            viewBox="0 0 270 270"
            className="select-none drop-shadow-md"
          >
            <defs>
              <radialGradient id="compass-bg" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#0f172a" stopOpacity="0.9" />
                <stop offset="85%" stopColor="#020617" stopOpacity="0.95" />
                <stop offset="100%" stopColor="#020617" stopOpacity="1" />
              </radialGradient>
            </defs>

            {/* Compass Disk Background */}
            <circle cx={cx} cy={cy} r={compassRadius} fill="url(#compass-bg)" stroke="#334155" strokeWidth="1.5" />

            {/* Altitude rings */}
            <circle cx={cx} cy={cy} r={(compassRadius * 2) / 3} fill="none" stroke="#1e293b" strokeDasharray="3 3" />
            <circle cx={cx} cy={cy} r={compassRadius / 3} fill="none" stroke="#1e293b" strokeDasharray="3 3" />
            <text x={cx + 3} y={cy - (compassRadius * 2) / 3 + 10} fill="#475569" fontSize="9" fontFamily="monospace">
              30°
            </text>
            <text x={cx + 3} y={cy - compassRadius / 3 + 10} fill="#475569" fontSize="9" fontFamily="monospace">
              60°
            </text>

            {/* Cardinal Crosshairs */}
            <line x1={cx} y1={cy - compassRadius} x2={cx} y2={cy + compassRadius} stroke="#334155" strokeWidth="1" />
            <line x1={cx - compassRadius} y1={cy} x2={cx + compassRadius} y2={cy} stroke="#334155" strokeWidth="1" />

            {/* Cardinal Letters */}
            <text x={cx} y={cy - compassRadius - 6} fill="#38bdf8" fontSize="12" fontWeight="bold" textAnchor="middle">
              N
            </text>
            <text x={cx + compassRadius + 10} y={cy + 4} fill="#94a3b8" fontSize="11" fontWeight="bold" textAnchor="middle">
              Ø
            </text>
            <text x={cx} y={cy + compassRadius + 14} fill="#94a3b8" fontSize="11" fontWeight="bold" textAnchor="middle">
              S
            </text>
            <text x={cx - compassRadius - 10} y={cy + 4} fill="#94a3b8" fontSize="11" fontWeight="bold" textAnchor="middle">
              V
            </text>

            {/* Center Cross / Zenith */}
            <circle cx={cx} cy={cy} r="2" fill="#64748b" />

            {/* Sun Indicator */}
            {sunPos.isAbove ? (
              <g className="transition-all duration-300">
                <line x1={cx} y1={cy} x2={sunPos.x} y2={sunPos.y} stroke="#f59e0b" strokeWidth="1.5" strokeOpacity="0.4" strokeDasharray="2 2" />
                <circle cx={sunPos.x} cy={sunPos.y} r="12" fill="#f59e0b" fillOpacity="0.2" className="animate-pulse" />
                <circle cx={sunPos.x} cy={sunPos.y} r="8" fill="#fbbf24" stroke="#ffffff" strokeWidth="1.5" />
                <text x={sunPos.x} y={sunPos.y + 3.5} fill="#78350f" fontSize="10" fontWeight="bold" textAnchor="middle">
                  ☀
                </text>
              </g>
            ) : (
              /* Sun below horizon (placed on outer rim with dimmed style) */
              <g opacity="0.45">
                <circle cx={sunPos.x} cy={sunPos.y} r="6" fill="#78350f" stroke="#f59e0b" strokeWidth="1" />
                <text x={sunPos.x} y={sunPos.y + 3} fill="#f59e0b" fontSize="8" textAnchor="middle">
                  ☀
                </text>
              </g>
            )}

            {/* Moon Indicator */}
            {moonPos.isAbove ? (
              <g className="transition-all duration-300">
                <line x1={cx} y1={cy} x2={moonPos.x} y2={moonPos.y} stroke="#38bdf8" strokeWidth="1.5" strokeOpacity="0.4" strokeDasharray="2 2" />
                <circle cx={moonPos.x} cy={moonPos.y} r="11" fill="#38bdf8" fillOpacity="0.2" />
                <circle cx={moonPos.x} cy={moonPos.y} r="7" fill="#bae6fd" stroke="#ffffff" strokeWidth="1.5" />
                <text x={moonPos.x} y={moonPos.y + 3} fill="#0369a1" fontSize="9" fontWeight="bold" textAnchor="middle">
                  ☾
                </text>
              </g>
            ) : (
              /* Moon below horizon */
              <g opacity="0.45">
                <circle cx={moonPos.x} cy={moonPos.y} r="6" fill="#0f172a" stroke="#38bdf8" strokeWidth="1" />
                <text x={moonPos.x} y={moonPos.y + 2.5} fill="#38bdf8" fontSize="7" textAnchor="middle">
                  ☾
                </text>
              </g>
            )}
          </svg>

          <div className="flex items-center gap-4 text-[11px] mt-2 text-slate-400">
            <span className="flex items-center gap-1 text-amber-300">
              <span className="w-2 h-2 rounded-full bg-amber-400" /> Sol ({currentPoint.sunAltitude}°)
            </span>
            <span className="flex items-center gap-1 text-sky-300">
              <span className="w-2 h-2 rounded-full bg-sky-400" /> Måne ({currentPoint.moonAltitude}°)
            </span>
          </div>
        </div>

        {/* Right: Detailed Instant Values (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          {/* Time & Sky Condition Banner */}
          <div className="flex items-center justify-between p-3.5 bg-slate-950/70 border border-slate-800 rounded-xl">
            <div>
              <span className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">Valgt tidspunkt</span>
              <div className="text-2xl font-bold font-mono text-white flex items-baseline gap-2">
                <span>Kl. {currentPoint.displayTime}</span>
              </div>
            </div>
            <div className="text-right">
              <span className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold block mb-0.5">
                Himmelkategori
              </span>
              <span
                className={`inline-block px-3 py-1 rounded-lg text-xs font-bold ${
                  currentPoint.skyCondition === 'DAG'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    : currentPoint.skyCondition === 'NATT'
                    ? 'bg-indigo-950/80 text-indigo-300 border border-indigo-800/40'
                    : 'bg-orange-500/20 text-orange-300 border border-orange-500/30'
                }`}
              >
                {currentPoint.skyConditionLabel}
              </span>
            </div>
          </div>

          {/* Cards for Sol & Måne Live Values */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Sun Card */}
            <div className="p-3.5 rounded-xl bg-gradient-to-b from-amber-500/10 to-slate-900/60 border border-amber-500/20 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-400">
                    <Sun className="w-4 h-4" />
                  </div>
                  <span className="font-bold text-white text-sm">Solen</span>
                </div>
                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                    currentPoint.sunAltitude >= 0
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {currentPoint.sunAltitude >= 0 ? 'Over horisonten' : 'Under horisonten'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                <div>
                  <span className="text-slate-400 text-[11px] block">Høyde</span>
                  <span className="font-mono font-bold text-amber-300 text-base">
                    {currentPoint.sunAltitude > 0 ? `+${currentPoint.sunAltitude}°` : `${currentPoint.sunAltitude}°`}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 text-[11px] block">Azimut & Retning</span>
                  <span className="font-mono font-bold text-slate-200 text-base">
                    {currentPoint.sunAzimuth}° <span className="text-sky-400 font-sans text-xs">{currentPoint.sunDirection}</span>
                  </span>
                </div>
              </div>
            </div>

            {/* Moon Card */}
            <div className="p-3.5 rounded-xl bg-gradient-to-b from-sky-500/10 to-slate-900/60 border border-sky-500/20 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-sky-500/20 text-sky-400">
                    <Moon className="w-4 h-4" />
                  </div>
                  <span className="font-bold text-white text-sm">Månen</span>
                </div>
                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                    currentPoint.moonAltitude >= 0
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {currentPoint.moonAltitude >= 0 ? 'Over horisonten' : 'Under horisonten'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                <div>
                  <span className="text-slate-400 text-[11px] block">Høyde</span>
                  <span className="font-mono font-bold text-sky-300 text-base">
                    {currentPoint.moonAltitude > 0 ? `+${currentPoint.moonAltitude}°` : `${currentPoint.moonAltitude}°`}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 text-[11px] block">Azimut & Retning</span>
                  <span className="font-mono font-bold text-slate-200 text-base">
                    {currentPoint.moonAzimuth}° <span className="text-sky-400 font-sans text-xs">{currentPoint.moonDirection}</span>
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Weather Overlay at this specific time */}
          {(currentPoint.temperature != null || currentPoint.cloudCoverPct != null || currentPoint.precipitationMm != null) && (
            <div className="p-3 bg-slate-950/60 border border-slate-800/80 rounded-xl flex items-center justify-between text-xs">
              <span className="text-slate-400 font-medium">Værforhold kl. {currentPoint.displayTime}:</span>
              <div className="flex items-center gap-4 text-slate-200 font-medium">
                {currentPoint.temperature != null && (
                  <div className="flex items-center gap-1">
                    <Thermometer className="w-3.5 h-3.5 text-orange-400" />
                    <span>{currentPoint.temperature > 0 ? `+${currentPoint.temperature}°C` : `${currentPoint.temperature}°C`}</span>
                  </div>
                )}
                {currentPoint.cloudCoverPct != null && (
                  <div className="flex items-center gap-1">
                    <Cloud className="w-3.5 h-3.5 text-slate-400" />
                    <span>{currentPoint.cloudCoverPct} % skyer</span>
                  </div>
                )}
                {currentPoint.precipitationMm != null && (
                  <div className="flex items-center gap-1">
                    <Droplets className="w-3.5 h-3.5 text-sky-400" />
                    <span>{currentPoint.precipitationMm} mm nedbør</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
