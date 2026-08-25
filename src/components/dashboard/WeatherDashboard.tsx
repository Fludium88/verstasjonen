'use client';

import React, { useState } from 'react';
import {
  MapPin,
  RefreshCw,
  Droplets,
  Wind,
  Gauge,
  Thermometer,
  CloudRain,
  Snowflake,
  Sun,
  Moon,
  Clock,
  ArrowRight,
  TrendingDown,
  TrendingUp,
  Minus,
  Compass,
  ChevronDown,
  Plus,
  Sliders,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Area,
  AreaChart,
  ReferenceLine,
} from 'recharts';
import { DashboardPayload, LocationRecord, WeatherDataSourceType } from '@/types/weather';
import { WeatherIcon } from '../common/WeatherIcon';
import { formatNorwegianNumber, getTemperatureDomain, formatNorwegianDate } from '@/lib/weatherUtils';
import { AlertsBanner } from '../alerts/AlertsBanner';
import { MetAlertItem, ThresholdAlarm } from '@/types/alerts';

interface WeatherDashboardProps {
  data: DashboardPayload;
  isBackgroundRefreshing?: boolean;
  metAlerts?: MetAlertItem[];
  thresholdAlarms?: ThresholdAlarm[];
  savedLocations?: LocationRecord[];
  onQuickSelectLocation?: (id: string) => void;
  onOpenAlertSettings?: () => void;
  onRefresh: () => void | Promise<void>;
  onOpenLocationModal: () => void;
  onNavigateToForecast: () => void;
  onNavigateToHistory: (range?: string) => void;
  onNavigateToAstronomy?: () => void;
  onNavigateToCalibration?: () => void;
}

const SOURCE_BADGE: Record<WeatherDataSourceType, { label: string; className: string; dotClassName: string }> = {
  MÅLT: {
    label: 'MÅLT',
    className: 'border-emerald-500/40 bg-emerald-500/20 text-emerald-300',
    dotClassName: 'bg-emerald-400',
  },
  ESTIMERT: {
    label: 'JUSTERT MÅLING',
    className: 'border-indigo-500/40 bg-indigo-500/20 text-indigo-200',
    dotClassName: 'bg-indigo-400',
  },
  PROGNOSE: {
    label: 'PROGNOSE',
    className: 'border-sky-500/40 bg-sky-500/20 text-sky-300',
    dotClassName: 'bg-sky-400',
  },
  BLANDET: {
    label: 'BLANDEDE KILDER',
    className: 'border-violet-500/40 bg-violet-500/20 text-violet-200',
    dotClassName: 'bg-violet-400',
  },
  SIMULERT: {
    label: 'SIMULERT',
    className: 'border-amber-500/40 bg-amber-500/20 text-amber-200',
    dotClassName: 'bg-amber-400',
  },
  UKJENT: {
    label: 'UKJENT KILDE',
    className: 'border-slate-600 bg-slate-700/40 text-slate-300',
    dotClassName: 'bg-slate-400',
  },
};

const SourceBadge = ({
  type,
  sourceLabel,
  compact = false,
}: {
  type: WeatherDataSourceType;
  sourceLabel?: string;
  compact?: boolean;
}) => {
  const meta = SOURCE_BADGE[type] ?? SOURCE_BADGE.UKJENT;
  const displayedLabel = compact ? meta.label : sourceLabel || meta.label;
  return (
    <span
      className={`${compact ? 'px-1.5 py-0.5 text-[9px]' : 'px-3 py-1 text-[11px]'} inline-flex items-center gap-1.5 rounded-full border font-bold uppercase tracking-wider ${meta.className}`}
      title={sourceLabel || meta.label}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dotClassName}`} aria-hidden="true" />
      {displayedLabel}
    </span>
  );
};

const combineSourceTypes = (types: WeatherDataSourceType[]): WeatherDataSourceType => {
  const distinct = [...new Set(types)];
  return distinct.length === 1 ? distinct[0] : 'BLANDET';
};

export const WeatherDashboard: React.FC<WeatherDashboardProps> = ({
  data,
  isBackgroundRefreshing = false,
  metAlerts = [],
  thresholdAlarms = [],
  savedLocations = [],
  onQuickSelectLocation,
  onOpenAlertSettings = () => {},
  onRefresh,
  onOpenLocationModal,
  onNavigateToForecast,
  onNavigateToHistory,
  onNavigateToAstronomy,
  onNavigateToCalibration,
}) => {
  const [selectedRange, setSelectedRange] = useState('24 timer');
  const [refreshing, setRefreshing] = useState(false);

  const handleRefreshClick = async () => {
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };

  const { location, current, hourly_history_24h, forecast_next_24h, records, wind_rose_7d, sun_times } = data;
  const provenance = current.element_provenance;
  const windSourceType = combineSourceTypes([
    provenance.wind.source_type,
    provenance.gust.source_type,
    provenance.direction.source_type,
  ]);
  const hasTemperatureHistory = hourly_history_24h.some((point) =>
    [point.temp_min, point.temp_avg, point.temp_max, point.temperature].some(
      (value) => typeof value === 'number' && Number.isFinite(value),
    ),
  );
  const hasPrecipitationHistory = hourly_history_24h.some(
    (point) => typeof point.precipitation === 'number' && Number.isFinite(point.precipitation),
  );
  const hasPressureHistory = hourly_history_24h.some(
    (point) => typeof point.pressure === 'number' && Number.isFinite(point.pressure),
  );
  const hasHumidityHistory = hourly_history_24h.some(
    (point) => typeof point.humidity === 'number' && Number.isFinite(point.humidity),
  );

  const ranges = [
    '24 timer',
    '7 dager',
    '30 dager',
    '3 måneder',
    '12 måneder',
    'År',
    'Hele perioden',
    'Egendefinert',
  ];

  const formatMetric = (value: number | null | undefined, suffix = '', decimals = 1) =>
    typeof value === 'number' && Number.isFinite(value)
      ? `${formatNorwegianNumber(value, decimals)}${suffix}`
      : 'Ikke tilgjengelig';

  // Helper for wind arrow
  const getWindArrow = (dir?: number | null) => {
    if (dir === null || dir === undefined) return '–';
    if (dir >= 337.5 || dir < 22.5) return '↑';
    if (dir >= 22.5 && dir < 67.5) return '↗';
    if (dir >= 67.5 && dir < 112.5) return '→';
    if (dir >= 112.5 && dir < 157.5) return '↘';
    if (dir >= 157.5 && dir < 202.5) return '↓';
    if (dir >= 202.5 && dir < 247.5) return '↙';
    if (dir >= 247.5 && dir < 292.5) return '←';
    return '↖';
  };

  // Format today's date in Norwegian (e.g. "Mandag 17. august")
  const todayDateFormatted = formatNorwegianDate(new Date(), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  const todayCapitalized =
    todayDateFormatted.charAt(0).toUpperCase() + todayDateFormatted.slice(1);

  // Top 5 next hours
  const next5Hours = (forecast_next_24h || []).slice(0, 5);
  const dominantWindSector = React.useMemo(() => {
    if (!wind_rose_7d?.length) return null;
    return wind_rose_7d.reduce((best, item) =>
      item.frequency_pct > best.frequency_pct ? item : best
    );
  }, [wind_rose_7d]);
  const dominantWindDegrees = dominantWindSector
    ? ({ N: 0, NØ: 45, Ø: 90, SØ: 135, S: 180, SV: 225, V: 270, NV: 315 } as Record<string, number>)[
        dominantWindSector.sector
      ]
    : undefined;

  // Calculate well-proportioned temperature Y-axis domain to prevent tiny fluctuations looking like huge swings
  const tempDomain = React.useMemo(() => {
    const vals = (hourly_history_24h || [])
      .flatMap((d) => [d.temp_min, d.temp_avg, d.temp_max, d.temperature])
      .filter((v): v is number => typeof v === 'number' && !isNaN(v));

    if (vals.length === 0) return [0, 20];
    return getTemperatureDomain(Math.min(...vals), Math.max(...vals), 8);
  }, [hourly_history_24h]);

  // Select a photographic weather theme from the current MET symbol, with a safe cloudy fallback.
  const getLandscapeImage = (symbol?: string | null) => {
    const normalizedSymbol = (symbol || '').toLowerCase();
    if (normalizedSymbol.includes('snow')) return '/images/weather-landscapes/snow.png';
    if (
      normalizedSymbol.includes('rain') ||
      normalizedSymbol.includes('sleet') ||
      normalizedSymbol.includes('drizzle')
    ) {
      return '/images/weather-landscapes/rain.png';
    }
    if (
      normalizedSymbol.includes('clearsky') ||
      normalizedSymbol.includes('fair') ||
      normalizedSymbol.includes('sun')
    ) {
      return '/images/weather-landscapes/sun.png';
    }
    return '/images/weather-landscapes/cloudy.png';
  };
  const landscapeImage = getLandscapeImage(current.symbol_code);

  return (
    <div className="space-y-6 pb-12">
      {/* 1. TOP HEADER BAR */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Location title with dropdown */}
        <button
          type="button"
          onClick={onOpenLocationModal}
          className="flex min-h-11 items-center gap-3 text-left group hover:opacity-90 transition"
        >
          <div className="w-9 h-9 rounded-xl bg-slate-800/80 border border-slate-700 flex items-center justify-center text-sky-400 group-hover:border-sky-500 transition">
            <MapPin className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-extrabold text-white tracking-tight">{location.name}</h1>
              <ChevronDown className="w-4 h-4 text-slate-400 group-hover:text-sky-400 transition" />
            </div>
            <p className="text-xs text-slate-400 font-mono">
              {location.latitude.toFixed(1)}° N · {location.longitude.toFixed(1)}° E ·{' '}
              {location.altitude === null || location.altitude === undefined ? 'Ukjent høyde' : `${location.altitude} moh.`}
            </p>
          </div>
        </button>

        {/* Timestamp, Live Indicator & Refresh Button */}
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 sm:gap-3">
          <span>{todayCapitalized}</span>
          <span>·</span>
          <span>Sist oppdatert {current.updated_at}</span>
          <button
            type="button"
            onClick={handleRefreshClick}
            className="min-h-11 min-w-11 p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/80 transition shadow-sm"
            title="Oppdater værdata nå"
            aria-label="Oppdater værdata nå"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing || isBackgroundRefreshing ? 'animate-spin text-sky-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* Quick Switcher for Saved Locations */}
      {savedLocations && savedLocations.length > 1 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider shrink-0 mr-1 flex items-center gap-1">
            <Compass className="w-3 h-3 text-sky-400" /> Mine steder:
          </span>
          {savedLocations.map((loc) => {
            const isActive = loc.id === location.id;
            return (
              <button
                type="button"
                key={loc.id}
                onClick={() => onQuickSelectLocation?.(loc.id)}
                aria-current={isActive ? 'true' : undefined}
                className={`min-h-11 px-3 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition flex items-center gap-1.5 ${
                  isActive
                    ? 'bg-sky-600 text-white shadow-sm shadow-sky-900/50 border border-sky-500'
                    : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700/80 hover:text-white'
                }`}
              >
                <MapPin className={`w-3 h-3 ${isActive ? 'text-white' : 'text-sky-400'}`} />
                <span>{loc.name}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={onOpenLocationModal}
            className="min-h-11 px-2.5 py-2 rounded-full text-xs font-medium bg-slate-900/60 hover:bg-slate-800 text-slate-400 hover:text-sky-300 border border-dashed border-slate-700 transition flex items-center gap-1 shrink-0"
          >
            <Plus className="w-3 h-3" />
            <span>Nytt</span>
          </button>
        </div>
      )}

      {/* ACTIVE MET FAREVARSLER & CUSTOM THRESHOLD ALARMS BANNER */}
      <AlertsBanner
        metAlerts={metAlerts}
        thresholdAlarms={thresholdAlarms}
        onOpenAlertSettings={onOpenAlertSettings}
      />

      {/* 2. HERO & 3x2 TELEMETRY GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Hero Card (Atmospheric Landscape Backdrop) */}
        <div className="lg:col-span-5 relative rounded-2xl overflow-hidden border border-slate-800/90 shadow-2xl min-h-[230px] flex flex-col justify-between p-6 bg-[#080e1e] group">
          {/* Authentic Norwegian landscape photographic background */}
          <div
            className="absolute inset-0 bg-cover bg-center transition-all duration-700 ease-out group-hover:scale-105"
            style={{
              backgroundImage: `url(${landscapeImage})`,
            }}
          />

          {/* Atmospheric dark gradient overlays for high legibility */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#070b16] via-[#070b16]/75 to-[#070b16]/40" />
          <div className="absolute inset-0 bg-sky-950/20 mix-blend-color" />

          <div className="relative z-10 flex items-start justify-between">
            <div>
              <div className="text-5xl md:text-6xl font-black text-white tracking-tight font-mono">
                {typeof current.temperature === 'number' ? formatNorwegianNumber(current.temperature, 1) : 'Ikke tilgjengelig'}
                {typeof current.temperature === 'number' && <span className="text-3xl md:text-4xl text-slate-300 font-sans ml-1">°C</span>}
              </div>
              <div className="mt-3 space-y-1">
                <p className="text-sm font-semibold text-slate-200">
                  Føles som {formatMetric(current.feels_like, ' °C')} ·{' '}
                  <span className="text-sky-300">{current.weather_text || 'Værbeskrivelse ikke tilgjengelig'}</span>
                </p>
              </div>
            </div>

            <div className="w-20 h-20 flex items-center justify-center filter drop-shadow-xl">
              <WeatherIcon symbolCode={current.symbol_code} className="w-16 h-16" />
            </div>
          </div>

          <div className="relative z-10 pt-4 flex items-center justify-between">
            <div className="flex items-center gap-2.5 flex-wrap">
              <SourceBadge type={current.source_type} sourceLabel={current.source_label} />
              {(current.source_type === 'MÅLT' || current.source_type === 'ESTIMERT') && current.station_name && (
                <span className="text-[11px] text-slate-300 font-medium">
                  {current.station_name}{' '}
                  {typeof current.station_distance_km === 'number' ? `(${current.station_distance_km} km unna)` : ''}
                </span>
              )}
              {current.calibration_active && (
                <button
                  type="button"
                  onClick={onNavigateToCalibration}
                  className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-indigo-500/25 text-indigo-300 border border-indigo-500/40 hover:bg-indigo-500/40 transition flex items-center gap-1 shadow-sm"
                  title="Kalibrering er aktiv for denne stasjonen. Trykk for å justere."
                >
                  <Sliders className="w-3 h-3" />
                  <span>
                    Kalibrert
                    {current.calibration_offsets?.temp
                      ? ` (${current.calibration_offsets.temp > 0 ? `+${formatNorwegianNumber(current.calibration_offsets.temp, 1)}` : formatNorwegianNumber(current.calibration_offsets.temp, 1)}°)`
                      : ''}
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Right 3x2 Telemetry Cards */}
        <div className="lg:col-span-7 grid grid-cols-2 sm:grid-cols-3 gap-3.5">
          {/* Card 1: Nedbør */}
          <div className="bg-[#0e1628] border border-slate-800/80 rounded-2xl p-4 flex flex-col justify-between shadow-lg">
            <div className="flex flex-wrap items-center justify-between gap-1 text-sky-400">
              <span className="flex items-center gap-2"><Droplets className="w-4 h-4 text-sky-400" /><span className="text-xs font-semibold text-slate-300">Nedbør</span></span>
              <SourceBadge type={provenance.precipitation.source_type} sourceLabel={provenance.precipitation.source_label} compact />
            </div>
            <div className="space-y-1.5 pt-2 text-xs">
              <div className="flex justify-between items-center text-slate-400">
                <span>Siste time</span>
                <span className="font-mono font-bold text-white">
                  {formatMetric(current.precipitation_last_hour, ' mm')}
                </span>
              </div>
              <div className="flex justify-between items-center text-slate-400">
                <span>I dag</span>
                <span className="font-mono font-bold text-white">
                  {formatMetric(current.precipitation_today, ' mm')}
                </span>
              </div>
              <div className="flex justify-between items-center text-slate-400">
                <span>Siste 24 t</span>
                <span className="font-mono font-bold text-sky-400">
                  {formatMetric(current.precipitation_last_24h, ' mm')}
                </span>
              </div>
            </div>
          </div>

          {/* Card 2: Vind */}
          <div className="bg-[#0e1628] border border-slate-800/80 rounded-2xl p-4 flex flex-col justify-between shadow-lg">
            <div className="flex flex-wrap items-center justify-between gap-1 text-sky-400">
              <span className="flex items-center gap-2"><Wind className="w-4 h-4 text-sky-400" /><span className="text-xs font-semibold text-slate-300">Vind</span></span>
              <SourceBadge type={windSourceType} compact />
            </div>
            <div className="pt-2">
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-bold text-white font-mono">
                   {typeof current.wind_speed === 'number' ? formatNorwegianNumber(current.wind_speed, 1) : 'Ikke tilgjengelig'}
                </span>
                {typeof current.wind_speed === 'number' && <span className="text-xs text-slate-400 font-medium">m/s</span>}
              </div>
              <div className="flex items-center gap-1 text-xs font-semibold text-slate-200 mt-0.5">
                <span>{current.wind_direction_cardinal || 'Retning ikke tilgjengelig'}</span>
                <span>{getWindArrow(current.wind_direction)}</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1 font-mono">
                Kast {formatMetric(current.wind_gust, ' m/s')}
              </p>
            </div>
          </div>

          {/* Card 3: Temperatur Min / Maks */}
          <div className="bg-[#0e1628] border border-slate-800/80 rounded-2xl p-4 flex flex-col justify-between shadow-lg">
            <div className="flex flex-wrap items-center justify-between gap-1 text-amber-400">
              <span className="flex items-center gap-2"><Thermometer className="w-4 h-4 text-amber-400" /><span className="text-xs font-semibold text-slate-300">Temperatur</span></span>
              <SourceBadge type={provenance.temperature.source_type} sourceLabel={provenance.temperature.source_label} compact />
            </div>
            <div className="pt-2">
              <div className="flex justify-between items-baseline text-xs mb-2">
                <div className="text-slate-400">
                  Min <span className="font-mono font-bold text-sky-400">{formatMetric(current.temp_min_today, ' °C')}</span>
                </div>
                <div className="text-slate-400">
                  Maks <span className="font-mono font-bold text-amber-400">{formatMetric(current.temp_max_today, ' °C')}</span>
                </div>
              </div>
              {/* Horizontal gradient indicator */}
              <div className="w-full h-1.5 rounded-full bg-gradient-to-r from-sky-400 via-amber-400 to-rose-500 shadow-inner" />
            </div>
          </div>

          {/* Card 4: Lufttrykk */}
          <div className="bg-[#0e1628] border border-slate-800/80 rounded-2xl p-4 flex flex-col justify-between shadow-lg">
            <div className="flex flex-wrap items-center justify-between gap-1 text-sky-400">
              <span className="flex items-center gap-2"><Gauge className="w-4 h-4 text-sky-400" /><span className="text-xs font-semibold text-slate-300">Lufttrykk</span></span>
              <SourceBadge type={provenance.pressure.source_type} sourceLabel={provenance.pressure.source_label} compact />
            </div>
            <div className="pt-2">
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold text-white font-mono">
                  {typeof current.pressure?.current_hpa === 'number' ? Math.round(current.pressure.current_hpa) : 'Ikke tilgjengelig'}
                </span>
                {typeof current.pressure?.current_hpa === 'number' && <span className="text-xs text-slate-400 font-medium">hPa</span>}
              </div>
              <div className="flex items-center gap-1 text-xs text-rose-400 font-semibold mt-1">
                {typeof current.pressure?.diff_3h === 'number' && current.pressure.diff_3h < 0 ? (
                  <TrendingDown className="w-3.5 h-3.5 text-rose-400" />
                ) : typeof current.pressure?.diff_3h === 'number' && current.pressure.diff_3h > 0 ? (
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Minus className="w-3.5 h-3.5 text-slate-400" />
                )}
                <span className={typeof current.pressure?.diff_3h !== 'number' ? 'text-slate-400' : current.pressure.diff_3h < 0 ? 'text-rose-400' : current.pressure.diff_3h > 0 ? 'text-emerald-400' : 'text-slate-300'}>
                  {current.pressure?.trend_label || 'Trend ikke tilgjengelig'}
                </span>
              </div>
            </div>
          </div>

          {/* Card 5: Luftfuktighet */}
          <div className="bg-[#0e1628] border border-slate-800/80 rounded-2xl p-4 flex flex-col justify-between shadow-lg">
            <div className="flex flex-wrap items-center justify-between gap-1 text-blue-400">
              <span className="flex items-center gap-2"><Droplets className="w-4 h-4 text-blue-400" /><span className="text-xs font-semibold text-slate-300">Luftfuktighet</span></span>
              <SourceBadge type={provenance.humidity.source_type} sourceLabel={provenance.humidity.source_label} compact />
            </div>
            <div className="pt-2">
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold text-white font-mono">
                  {typeof current.humidity === 'number' ? Math.round(current.humidity) : 'Ikke tilgjengelig'}
                </span>
                {typeof current.humidity === 'number' && <span className="text-xs text-slate-400 font-medium">%</span>}
              </div>
            </div>
          </div>

          {/* Card 6: Snø */}
          <div className="bg-[#0e1628] border border-slate-800/80 rounded-2xl p-4 flex flex-col justify-between shadow-lg">
            <div className="flex flex-wrap items-center justify-between gap-1 text-sky-200">
              <span className="flex items-center gap-2"><Snowflake className="w-4 h-4 text-sky-200" /><span className="text-xs font-semibold text-slate-300">Snø</span></span>
              <SourceBadge type={provenance.snow.source_type} sourceLabel={provenance.snow.source_label} compact />
            </div>
            <div className="pt-1.5 space-y-1 text-xs">
              <div className="flex justify-between items-center text-slate-400">
                <span>Snødybde</span>
                <span className="font-mono font-bold text-white">{formatMetric(current.snow_depth, ' cm')}</span>
              </div>
              <div className="flex justify-between items-center text-slate-400">
                <span>Nysnø siste døgn</span>
                <span className="font-mono font-bold text-white">{formatMetric(current.new_snow_24h, ' cm')}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. TIME RANGE NAVIGATION BAR & SUN WIDGET */}
      <div className="bg-[#0c1427] border border-slate-800/80 rounded-2xl p-2.5 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-lg">
        {/* Pill range selectors */}
        <div className="flex items-center gap-1 overflow-x-auto w-full sm:w-auto py-1 scrollbar-none">
          {ranges.map((r) => {
            const isActive = selectedRange === r;
            return (
              <button
                type="button"
                key={r}
                onClick={() => {
                  setSelectedRange(r);
                  if (r !== '24 timer') {
                    const rangeMap: Record<string, string> = {
                      '7 dager': '7d',
                      '30 dager': '30d',
                      '3 måneder': '3m',
                      '12 måneder': '1y',
                      'År': '2y',
                      'Hele perioden': 'all',
                      Egendefinert: 'custom',
                    };
                    onNavigateToHistory(rangeMap[r] || '30d');
                  }
                }}
                aria-pressed={isActive}
                className={`min-h-11 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
                  isActive
                    ? 'bg-sky-600 text-white shadow-md shadow-sky-900/40'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                {r}
              </button>
            );
          })}
        </div>

        {/* Sunrise / Sunset widget */}
        <button
          type="button"
          onClick={onNavigateToAstronomy}
          className="flex min-h-11 items-center gap-4 text-xs font-mono text-slate-300 shrink-0 px-3 py-2 rounded-xl bg-slate-900/60 hover:bg-slate-800 border border-slate-800 transition cursor-pointer"
          title="Se full Sol & måne side"
        >
          <div className="flex items-center gap-1.5 text-amber-400">
            <Sun className="w-4 h-4 text-amber-400" />
            <span>{sun_times?.sunrise || 'Ikke tilgjengelig'}</span>
          </div>
          <div className="flex items-center gap-1.5 text-indigo-300">
            <Moon className="w-4 h-4 text-indigo-300" />
            <span>{sun_times?.sunset || 'Ikke tilgjengelig'}</span>
          </div>
        </button>
      </div>

      {/* 4. MIDDLE 3-COLUMN SECTION */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Col 1: Multi-line Temperature Chart (Min, Snitt, Maks) */}
        <div className="lg:col-span-5 bg-[#0e1628] border border-slate-800/90 rounded-2xl p-5 shadow-xl flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Thermometer className="w-4 h-4 text-amber-400" />
              <h3 className="text-sm font-bold text-white">Temperatur siste 24 timer</h3>
            </div>
            {/* Legend: Min, Snitt, Maks */}
            <div className="flex items-center gap-2.5 text-[11px] font-medium">
              <span className="flex items-center gap-1 text-sky-400">
                <span className="w-2 h-2 rounded-full bg-sky-400" /> Min
              </span>
              <span className="flex items-center gap-1 text-white">
                <span className="w-2 h-2 rounded-full bg-white" /> Snitt
              </span>
              <span className="flex items-center gap-1 text-rose-400">
                <span className="w-2 h-2 rounded-full bg-rose-500" /> Maks
              </span>
            </div>
          </div>

          {hasTemperatureHistory ? <div className="h-56 w-full pt-1">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={hourly_history_24h} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="tempAreaRedGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="display_time" stroke="#64748b" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis
                  stroke="#64748b"
                  tick={{ fontSize: 10 }}
                  domain={tempDomain}
                  tickFormatter={(v) => `${v}°`}
                />
                {tempDomain[0] <= 0 && tempDomain[1] >= 0 && (
                  <ReferenceLine y={0} stroke="#38bdf8" strokeDasharray="3 3" strokeOpacity={0.4} />
                )}
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const d = payload[0].payload;
                      const hasSpread = d.temp_min != null && d.temp_max != null && d.temp_min !== d.temp_max;
                      return (
                        <div className="bg-[#090f1d] border border-slate-700 p-3 rounded-xl shadow-2xl text-xs space-y-1 font-mono">
                          <p className="font-bold text-white font-sans">Kl. {d.display_time}</p>
                          {hasSpread ? (
                            <>
                              <p className="text-rose-400">Maks: {formatMetric(d.temp_max, ' °C')}</p>
                              <p className="text-white">Snitt: {formatMetric(d.temp_avg ?? d.temperature, ' °C')}</p>
                              <p className="text-sky-400">Min: {formatMetric(d.temp_min, ' °C')}</p>
                            </>
                          ) : (
                            <p className="text-white font-bold">
                              Temperatur: {formatMetric(d.temperature ?? d.temp_avg, ' °C')}
                            </p>
                          )}
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="temp_max"
                  stroke="#ef4444"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#tempAreaRedGrad)"
                  connectNulls={true}
                />
                <Line type="monotone" dataKey="temp_avg" stroke="#ffffff" strokeWidth={2} dot={false} connectNulls={true} />
                <Line type="monotone" dataKey="temp_min" stroke="#38bdf8" strokeWidth={2} dot={false} connectNulls={true} />
              </AreaChart>
            </ResponsiveContainer>
          </div> : (
            <div className="flex h-56 items-center justify-center rounded-xl border border-dashed border-slate-700 px-4 text-center text-xs text-slate-400">
              Ingen temperaturmålinger er tilgjengelige for de siste 24 timene.
            </div>
          )}
        </div>

        {/* Col 2: 24h Precipitation Bar Chart */}
        <div className="lg:col-span-4 bg-[#0e1628] border border-slate-800/90 rounded-2xl p-5 shadow-xl flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <CloudRain className="w-4 h-4 text-cyan-400" />
              <h3 className="text-sm font-bold text-white">Nedbør siste 24 timer</h3>
            </div>
            <span className="text-xs text-sky-400 font-mono font-bold">
              {formatMetric(current.precipitation_last_24h, ' mm')}
            </span>
          </div>

          {hasPrecipitationHistory ? <div className="h-56 w-full pt-1">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourly_history_24h} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="display_time" stroke="#64748b" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis stroke="#64748b" tick={{ fontSize: 10 }} domain={[0, 'auto']} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const d = payload[0].payload;
                      return (
                        <div className="bg-[#090f1d] border border-slate-700 p-2.5 rounded-xl shadow-xl text-xs font-mono">
                          <p className="font-semibold text-white font-sans">Kl. {d.display_time}</p>
                          <p className="text-cyan-400">Nedbør: {formatMetric(d.precipitation, ' mm')}</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar dataKey="precipitation" fill="#0284c7" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div> : (
            <div className="flex h-56 items-center justify-center rounded-xl border border-dashed border-slate-700 px-4 text-center text-xs text-slate-400">
              Ingen nedbørsmålinger er tilgjengelige for de siste 24 timene.
            </div>
          )}
        </div>

        {/* Col 3: Next 24 Hours Forecast List */}
        <div className="lg:col-span-3 bg-[#0e1628] border border-slate-800/90 rounded-2xl p-5 shadow-xl flex flex-col justify-between">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4 text-sky-400" />
            <h3 className="text-sm font-bold text-white">Neste 24 timer</h3>
          </div>

          <div className="space-y-2 text-xs">
            {next5Hours.map((f, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between py-1.5 border-b border-slate-800/60 last:border-0"
              >
                <span className="font-mono text-slate-300 font-semibold w-11">{f.display_time}</span>
                <WeatherIcon symbolCode={f.symbol_code} className="w-4 h-4 shrink-0" />
                <span className="font-mono font-bold text-white min-w-9 text-right">{formatMetric(f.temperature, '°', 0)}</span>
                <span className="font-mono text-cyan-300 w-14 text-right">
                  {formatMetric(f.precipitation, ' mm')}
                </span>
                <div className="flex items-center justify-end gap-1 font-mono text-slate-300 w-14 text-right">
                  <span>{formatMetric(f.wind_speed, ' m/s', 0)}</span>
                  <span className="text-slate-400 text-[10px]">{getWindArrow(f.wind_direction)}</span>
                </div>
              </div>
            ))}
            {next5Hours.length === 0 && (
              <p role="status" className="rounded-xl border border-dashed border-slate-700 p-4 text-center text-slate-400">
                Ingen fremoverskuende prognose er tilgjengelig.
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={onNavigateToForecast}
            className="min-h-11 w-full mt-3 py-2.5 px-3 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-sky-400 hover:text-sky-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition border border-slate-700/60"
          >
            <span>Se full prognose</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 5. BOTTOM 4-CARD GRID (Vindrose, Lufttrykk, Fuktighet, Rekorder) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Vindrose (siste 7 dager) */}
        <div className="bg-[#0e1628] border border-slate-800/80 rounded-2xl p-4.5 shadow-xl flex flex-col justify-between">
          <div className="flex items-center gap-2 mb-2">
            <Compass className="w-4 h-4 text-sky-400" />
            <h4 className="text-xs font-bold text-slate-200">Vindrose (siste 7 dager)</h4>
          </div>

          <div className="flex items-center justify-between gap-2 pt-1">
            {/* Visual Polar Compass */}
            <div className="relative w-24 h-24 rounded-full border border-slate-700 bg-slate-900/80 flex items-center justify-center shrink-0">
              <span className="absolute top-1 text-[9px] font-bold text-slate-400">N</span>
              <span className="absolute right-1 text-[9px] font-bold text-slate-400">Ø</span>
              <span className="absolute bottom-1 text-[9px] font-bold text-slate-400">S</span>
              <span className="absolute left-1 text-[9px] font-bold text-slate-400">V</span>
              {dominantWindDegrees !== undefined ? (
                <span
                  aria-label={`Dominerende vind fra ${dominantWindSector?.sector}`}
                  className="inline-block text-4xl font-black text-cyan-300 drop-shadow"
                  style={{ transform: `rotate(${dominantWindDegrees + 180}deg)` }}
                >
                  ↑
                </span>
              ) : (
                <span className="px-3 text-center text-[10px] text-slate-500">Ikke tilgjengelig</span>
              )}
            </div>

            {/* Sektorer tabell */}
            <div className="space-y-1 text-[11px] font-mono flex-1">
              {(wind_rose_7d || [])
                .slice(0, 6)
                .map((s, idx) => (
                  <div key={idx} className="flex justify-between text-slate-400">
                    <span className="font-semibold text-slate-300">{s.sector}</span>
                    <span className="text-white">{s.frequency_pct}%</span>
                  </div>
                ))}
              {!wind_rose_7d?.length && <p className="text-slate-500">Ikke tilgjengelig</p>}
            </div>
          </div>
        </div>

        {/* Card 2: Lufttrykk (siste 24 t) */}
        <div className="bg-[#0e1628] border border-slate-800/80 rounded-2xl p-4.5 shadow-xl flex flex-col justify-between">
          <div className="flex items-center gap-2 mb-1">
            <Gauge className="w-4 h-4 text-emerald-400" />
            <h4 className="text-xs font-bold text-slate-200">Lufttrykk (siste 24 t)</h4>
          </div>

          {hasPressureHistory ? <div className="h-28 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={hourly_history_24h} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                <YAxis stroke="#475569" tick={{ fontSize: 9 }} domain={['dataMin - 2', 'dataMax + 2']} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="bg-[#090f1d] border border-slate-700 p-1.5 rounded-lg text-[10px] text-emerald-300 font-mono">
                          {formatMetric(payload[0].payload.pressure, ' hPa', 0)}
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Line type="monotone" dataKey="pressure" stroke="#10b981" strokeWidth={2} dot={false} connectNulls={true} />
              </LineChart>
            </ResponsiveContainer>
          </div> : (
            <div className="flex h-28 items-center justify-center text-center text-xs text-slate-500">Ikke tilgjengelig</div>
          )}
        </div>

        {/* Card 3: Fuktighet (siste 24 t) */}
        <div className="bg-[#0e1628] border border-slate-800/80 rounded-2xl p-4.5 shadow-xl flex flex-col justify-between">
          <div className="flex items-center gap-2 mb-1">
            <Droplets className="w-4 h-4 text-blue-400" />
            <h4 className="text-xs font-bold text-slate-200">Fuktighet (siste 24 t)</h4>
          </div>

          {hasHumidityHistory ? <div className="h-28 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={hourly_history_24h} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                <YAxis stroke="#475569" tick={{ fontSize: 9 }} domain={[60, 100]} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="bg-[#090f1d] border border-slate-700 p-1.5 rounded-lg text-[10px] text-sky-300 font-mono">
                          {formatMetric(payload[0].payload.humidity, ' %', 0)}
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Line type="monotone" dataKey="humidity" stroke="#38bdf8" strokeWidth={2} dot={false} connectNulls={true} />
              </LineChart>
            </ResponsiveContainer>
          </div> : (
            <div className="flex h-28 items-center justify-center text-center text-xs text-slate-500">Ikke tilgjengelig</div>
          )}
        </div>

        {/* Card 4: Rekorder (Aukra) */}
        <div className="bg-[#0e1628] border border-slate-800/80 rounded-2xl p-4.5 shadow-xl flex flex-col justify-between">
          <div className="flex items-center gap-2 mb-2">
            <Thermometer className="w-4 h-4 text-amber-400" />
            <h4 className="text-xs font-bold text-slate-200">Rekorder ({location.name})</h4>
          </div>

          <div className="space-y-1.5 text-xs">
            <div className="flex items-center justify-between text-slate-300">
              <span className="flex items-center gap-1 text-amber-400">
                <Thermometer className="w-3.5 h-3.5 text-amber-400 shrink-0" /> Høyeste temperatur
              </span>
              <span className="font-mono text-white font-bold">
                {formatMetric(records?.highest_temp?.value, ' °C')}{' '}
                {records?.highest_temp?.date && <span className="text-[10px] text-slate-500 font-normal">({records.highest_temp.date})</span>}
              </span>
            </div>

            <div className="flex items-center justify-between text-slate-300">
              <span className="flex items-center gap-1 text-sky-300">
                <Snowflake className="w-3.5 h-3.5 text-sky-300 shrink-0" /> Laveste temperatur
              </span>
              <span className="font-mono text-white font-bold">
                {formatMetric(records?.lowest_temp?.value, ' °C')}{' '}
                {records?.lowest_temp?.date && <span className="text-[10px] text-slate-500 font-normal">({records.lowest_temp.date})</span>}
              </span>
            </div>

            <div className="flex items-center justify-between text-slate-300">
              <span className="flex items-center gap-1 text-cyan-400">
                <CloudRain className="w-3.5 h-3.5 text-cyan-400 shrink-0" /> Våteste døgn
              </span>
              <span className="font-mono text-white font-bold">
                {formatMetric(records?.wettest_day?.value, ' mm')}{' '}
                {records?.wettest_day?.date && <span className="text-[10px] text-slate-500 font-normal">({records.wettest_day.date})</span>}
              </span>
            </div>

            <div className="flex items-center justify-between text-slate-300">
              <span className="flex items-center gap-1 text-indigo-300">
                <Wind className="w-3.5 h-3.5 text-indigo-300 shrink-0" /> Sterkeste vindkast
              </span>
              <span className="font-mono text-white font-bold">
                {formatMetric(records?.strongest_wind_gust?.value, ' m/s')}{' '}
                {records?.strongest_wind_gust?.date && <span className="text-[10px] text-slate-500 font-normal">({records.strongest_wind_gust.date})</span>}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 6. FOOTER */}
      <footer className="pt-6 border-t border-slate-800/60 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
        <p>Kilde: MET Norway / Frost API · Ikke en offisiell Yr-tjeneste</p>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400" /> Målt data
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-sky-400" /> Prognose
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-purple-400" /> Nowcast
          </span>
        </div>
      </footer>
    </div>
  );
};
