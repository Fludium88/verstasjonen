'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  History,
  Thermometer,
  CloudRain,
  Wind,
  Gauge,
  Droplets,
  Calendar,
  Compass,
  Trophy,
  ArrowRight,
  X,
  Clock,
  Layers,
  RefreshCw,
  SlidersHorizontal,
  CalendarRange,
  ChevronRight,
  Sparkles,
  Info,
  Check,
  MoveHorizontal,
  BarChart3,
  TrendingUp,
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
import { WeatherIcon } from '../common/WeatherIcon';
import { useAccessibleDialog } from '../common/useAccessibleDialog';
import {
  formatNorwegianNumber,
  getTemperatureDomain,
  formatNorwegianDate,
  formatNorwegianTime,
  getWindDirectionCardinal8,
  getWindDirectionFullName,
  getWindDirectionArrowUnicode,
  calculateCircularMeanDegrees,
  getBeaufort,
} from '@/lib/weatherUtils';

interface HistoryViewProps {
  locationId: string;
  initialRange?: string;
}

type ParameterType = 'temperature' | 'precipitation' | 'wind' | 'pressure' | 'humidity';
type RangeType = '24h' | '7d' | '30d' | '3m' | '1y' | '2y' | 'all' | 'calendar' | 'custom';
type ResolutionMode = 'auto' | 'weekly' | 'monthly' | 'daily';

const isRangeType = (value?: string): value is RangeType =>
  Boolean(value && ['24h', '7d', '30d', '3m', '1y', '2y', 'all', 'calendar', 'custom'].includes(value));

const toLocalDateValue = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const HistoryView: React.FC<HistoryViewProps> = ({ locationId, initialRange }) => {
  const [parameter, setParameter] = useState<ParameterType>('temperature');
  const [range, setRange] = useState<RangeType>(() => (isRangeType(initialRange) ? initialRange : '30d'));
  const [resolutionOverride, setResolutionOverride] = useState<ResolutionMode>('auto');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customRangeError, setCustomRangeError] = useState<string | null>(null);
  const [customRangeRevision, setCustomRangeRevision] = useState(0);

  // Custom date range state
  const [showCustomRangeModal, setShowCustomRangeModal] = useState(false);
  const [customFromDate, setCustomFromDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return toLocalDateValue(d);
  });
  const [customToDate, setCustomToDate] = useState(() => {
    return toLocalDateValue(new Date());
  });

  // Day Explorer modal
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [dayDetails, setDayDetails] = useState<any>(null);
  const [loadingDay, setLoadingDay] = useState(false);
  const [dayError, setDayError] = useState<string | null>(null);

  const rangeScrollRef = useRef<HTMLDivElement>(null);
  const chartScrollContainerRef = useRef<HTMLDivElement>(null);
  const historyAbortRef = useRef<AbortController | null>(null);
  const dayAbortRef = useRef<AbortController | null>(null);
  const closeCustomRange = () => {
    setCustomRangeError(null);
    setShowCustomRangeModal(false);
  };
  const closeDayDetails = () => {
    dayAbortRef.current?.abort();
    setSelectedDate(null);
    setDayDetails(null);
    setDayError(null);
  };
  const customDialogRef = useAccessibleDialog<HTMLDivElement>(showCustomRangeModal, closeCustomRange);
  const dayDialogRef = useAccessibleDialog<HTMLDivElement>(Boolean(selectedDate), closeDayDetails);

  useEffect(() => {
    if (!isRangeType(initialRange)) return;
    setRange(initialRange);
    if (initialRange === 'custom') setShowCustomRangeModal(true);
  }, [initialRange]);

  // Reset resolution override when range changes so auto-resolution takes effect
  useEffect(() => {
    setResolutionOverride('auto');
  }, [range]);

  useEffect(() => {
    setData(null);
    void fetchHistory();
    return () => historyAbortRef.current?.abort();
  }, [locationId, parameter, range, customRangeRevision]);

  const fetchHistory = async (isManualRefresh = false) => {
    historyAbortRef.current?.abort();
    const controller = new AbortController();
    historyAbortRef.current = controller;
    if (isManualRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      let url = `/api/weather/history?locationId=${locationId}&parameter=${parameter}&range=${range}`;
      if (range === 'custom') {
        url += `&fromDate=${customFromDate}&toDate=${customToDate}`;
      }
      const res = await fetch(url, { cache: 'no-store', signal: controller.signal });
      if (res.ok) {
        const json = await res.json();
        if (!controller.signal.aborted && historyAbortRef.current === controller) setData(json);
      } else {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || 'Kunne ikke hente værhistorikken.');
      }
    } catch (e: any) {
      if (controller.signal.aborted) return;
      console.error('Kunne ikke laste historikk:', e);
      setError(e?.message || 'Kunne ikke hente værhistorikken.');
    } finally {
      if (historyAbortRef.current === controller) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  };

  const handleApplyCustomRange = () => {
    if (!customFromDate || !customToDate || customFromDate > customToDate) {
      setCustomRangeError('Velg et gyldig datointervall der fra-dato er før eller lik til-dato.');
      return;
    }
    setCustomRangeError(null);
    setShowCustomRangeModal(false);
    setRange('custom');
    setCustomRangeRevision((value) => value + 1);
  };

  const handleOpenDay = async (dateStr: string) => {
    dayAbortRef.current?.abort();
    const controller = new AbortController();
    dayAbortRef.current = controller;
    setSelectedDate(dateStr);
    setDayDetails(null);
    setDayError(null);
    setLoadingDay(true);
    try {
      const res = await fetch(`/api/weather/history?locationId=${locationId}&date=${dateStr}`, {
        cache: 'no-store',
        signal: controller.signal,
      });
      if (res.ok) {
        const json = await res.json();
        if (!controller.signal.aborted && dayAbortRef.current === controller) setDayDetails(json);
      } else {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || 'Kunne ikke hente dagsdetaljene.');
      }
    } catch (e: any) {
      if (controller.signal.aborted) return;
      console.error(e);
      setDayError(e?.message || 'Kunne ikke hente dagsdetaljene.');
    } finally {
      if (dayAbortRef.current === controller) setLoadingDay(false);
    }
  };

  const parameters: { id: ParameterType; label: string; icon: React.FC<{ className?: string }> }[] = [
    { id: 'temperature', label: 'Temperatur', icon: Thermometer },
    { id: 'precipitation', label: 'Nedbør', icon: CloudRain },
    { id: 'wind', label: 'Vind', icon: Wind },
    { id: 'pressure', label: 'Trykk', icon: Gauge },
    { id: 'humidity', label: 'Fuktighet', icon: Droplets },
  ];

  const ranges: { id: RangeType; label: string; shortLabel: string; description: string }[] = [
    { id: '24h', label: '24 timer', shortLabel: '24T', description: 'Siste 24 timer (time for time)' },
    { id: '7d', label: '7 dager', shortLabel: '7D', description: 'Siste 7 dager (døgnobservasjoner)' },
    { id: '30d', label: '30 dager', shortLabel: '30D', description: 'Siste 30 dager (døgnobservasjoner)' },
    { id: '3m', label: '3 måneder', shortLabel: '3M', description: 'Siste 3 måneder (sesongvariasjon)' },
    { id: '1y', label: '1 år', shortLabel: '1Å', description: 'Siste 365 dager (årsutvikling)' },
    { id: '2y', label: '2 år', shortLabel: '2Å', description: 'Siste 2 år (flerårig sammenligning)' },
    { id: 'all', label: 'Alt', shortLabel: 'ALT', description: 'Hele den historiske databasen' },
    { id: 'calendar', label: 'Måned', shortLabel: 'Måned', description: 'Månedsoversikter og klimasammenligning' },
  ];

  const currentRangeObj = ranges.find((r) => r.id === range) || {
    id: 'custom' as RangeType,
    label: 'Egendefinert',
    shortLabel: 'Valgt',
    description: `Egendefinert: ${customFromDate} til ${customToDate}`,
  };

  const { points = [], stats = {}, wind_rose = [], rain_events = [], records = {}, monthly = [] } = data || {};
  const formatMetric = (value: number | null | undefined, suffix = '', decimals = 1) =>
    typeof value === 'number' && Number.isFinite(value)
      ? `${formatNorwegianNumber(value, decimals)}${suffix}`
      : 'Ikke tilgjengelig';
  const pressureValues = (points || [])
    .map((point: any) => point.pressure_avg ?? point.pressure)
    .filter((value: unknown): value is number => typeof value === 'number' && Number.isFinite(value));
  const humidityValues = (points || [])
    .map((point: any) => point.humidity_avg ?? point.humidity)
    .filter((value: unknown): value is number => typeof value === 'number' && Number.isFinite(value));
  const pressureSummary = {
    avg: pressureValues.length ? pressureValues.reduce((sum: number, value: number) => sum + value, 0) / pressureValues.length : null,
    min: pressureValues.length ? Math.min(...pressureValues) : null,
    max: pressureValues.length ? Math.max(...pressureValues) : null,
  };
  const humiditySummary = {
    avg: humidityValues.length ? humidityValues.reduce((sum: number, value: number) => sum + value, 0) / humidityValues.length : null,
    min: humidityValues.length ? Math.min(...humidityValues) : null,
    max: humidityValues.length ? Math.max(...humidityValues) : null,
    saturated: humidityValues.length ? humidityValues.filter((value: number) => value >= 99.5).length : null,
  };
  const hasPeriodData = range === 'calendar' ? monthly.length > 0 : points.length > 0;

  // Determine effective resolution mode for long-period optimization
  const effectiveResolution = useMemo<ResolutionMode>(() => {
    if (range === '24h') return 'daily';
    if (resolutionOverride !== 'auto') return resolutionOverride;

    const count = points ? points.length : 0;
    if (range === '1y' || range === '2y' || range === 'all') {
      return 'weekly'; // Default to weekly for 1-2 years so mobile chart is smooth and legible
    }
    if (range === '3m' || count > 60) {
      return 'weekly';
    }
    return 'daily';
  }, [range, resolutionOverride, points]);

  // Aggregation helpers for long timeframes
  const aggregatedChartPoints = useMemo(() => {
    if (!points || points.length === 0) return [];
    if (range === '24h' || effectiveResolution === 'daily') {
      return points;
    }

    if (effectiveResolution === 'monthly') {
      const monthMap = new Map<string, any[]>();
      points.forEach((p: any) => {
        if (!p.date) return;
        const key = p.date.substring(0, 7); // YYYY-MM
        if (!monthMap.has(key)) monthMap.set(key, []);
        monthMap.get(key)!.push(p);
      });

      const result: any[] = [];
      monthMap.forEach((chunk, key) => {
        const [yearStr, monthStr] = key.split('-');
        const dt = new Date(parseInt(yearStr, 10), parseInt(monthStr, 10) - 1, 1);
        const label = formatNorwegianDate(dt, { month: 'short' });
        const fullLabel = formatNorwegianDate(dt, { month: 'long', year: 'numeric' });

        const validTempsAvg: number[] = chunk.map((d) => d.temp_avg).filter((t: any): t is number => typeof t === 'number' && !isNaN(t));
        const validTempsMin: number[] = chunk.map((d) => d.temp_min).filter((t: any): t is number => typeof t === 'number' && !isNaN(t));
        const validTempsMax: number[] = chunk.map((d) => d.temp_max).filter((t: any): t is number => typeof t === 'number' && !isNaN(t));
        const validPrecips: number[] = chunk.map((d) => d.precip_total).filter((p: any): p is number => typeof p === 'number' && !isNaN(p));
        const validWinds: number[] = chunk.map((d) => d.wind_avg).filter((w: any): w is number => typeof w === 'number' && !isNaN(w));
        const validGusts: number[] = chunk.map((d) => d.wind_gust_max).filter((g: any): g is number => typeof g === 'number' && !isNaN(g));
        const validPressures: number[] = chunk.map((d) => d.pressure_avg).filter((p: any): p is number => typeof p === 'number' && !isNaN(p));
        const validHumidities: number[] = chunk.map((d) => d.humidity_avg).filter((h: any): h is number => typeof h === 'number' && !isNaN(h));
        const validDirEntries = chunk.filter(
          (d) => typeof d.wind_dominant_direction === 'number' && !isNaN(d.wind_dominant_direction),
        );
        const validDirs: number[] = validDirEntries.map((d) => d.wind_dominant_direction);

        const monthDominantDir = calculateCircularMeanDegrees(
          validDirs,
          validDirEntries.map((d) => d.wind_avg),
        );

        result.push({
          isMonthly: true,
          date: `${key}-01`,
          firstDayDate: chunk[0].date,
          label,
          fullLabel,
          temp_avg: validTempsAvg.length
            ? Math.round((validTempsAvg.reduce((a: number, b: number) => a + b, 0) / validTempsAvg.length) * 10) / 10
            : null,
          temp_min: validTempsMin.length ? Math.min(...validTempsMin) : null,
          temp_max: validTempsMax.length ? Math.max(...validTempsMax) : null,
          precip_total: validPrecips.length ? Math.round(validPrecips.reduce((a: number, b: number) => a + b, 0) * 10) / 10 : null,
          precip_days: validPrecips.length
            ? chunk.filter((d) => typeof d.precip_total === 'number' && d.precip_total >= 0.1).length
            : null,
          precip_max_day: validPrecips.length ? Math.max(...validPrecips) : null,
          wind_avg: validWinds.length
            ? Math.round((validWinds.reduce((a: number, b: number) => a + b, 0) / validWinds.length) * 10) / 10
            : null,
          wind_max: validWinds.length ? Math.max(...validWinds) : null,
          wind_gust_max: validGusts.length ? Math.max(...validGusts) : null,
          wind_dominant_direction: monthDominantDir,
          wind_dominant_cardinal: getWindDirectionCardinal8(monthDominantDir),
          wind_dominant_arrow: getWindDirectionArrowUnicode(monthDominantDir),
          wind_dominant_name: getWindDirectionFullName(monthDominantDir),
          pressure_avg: validPressures.length
            ? Math.round(validPressures.reduce((a: number, b: number) => a + b, 0) / validPressures.length)
            : null,
          humidity_avg: validHumidities.length
            ? Math.round(validHumidities.reduce((a: number, b: number) => a + b, 0) / validHumidities.length)
            : null,
          daysCount: chunk.length,
        });
      });
      return result;
    }

    if (effectiveResolution === 'weekly') {
      const weeks: any[] = [];
      const chunkSize = 7;
      for (let i = 0; i < points.length; i += chunkSize) {
        const chunk = points.slice(i, i + chunkSize);
        const startDate = chunk[0].date;
        const endDate = chunk[chunk.length - 1].date;
        const startDt = new Date(startDate);
        const endDt = new Date(endDate);

        const validTempsAvg: number[] = chunk.map((d: any) => d.temp_avg).filter((t: any): t is number => typeof t === 'number' && !isNaN(t));
        const validTempsMin: number[] = chunk.map((d: any) => d.temp_min).filter((t: any): t is number => typeof t === 'number' && !isNaN(t));
        const validTempsMax: number[] = chunk.map((d: any) => d.temp_max).filter((t: any): t is number => typeof t === 'number' && !isNaN(t));
        const validPrecips: number[] = chunk.map((d: any) => d.precip_total).filter((p: any): p is number => typeof p === 'number' && !isNaN(p));
        const validWinds: number[] = chunk.map((d: any) => d.wind_avg).filter((w: any): w is number => typeof w === 'number' && !isNaN(w));
        const validGusts: number[] = chunk.map((d: any) => d.wind_gust_max).filter((g: any): g is number => typeof g === 'number' && !isNaN(g));
        const validPressures: number[] = chunk.map((d: any) => d.pressure_avg).filter((p: any): p is number => typeof p === 'number' && !isNaN(p));
        const validHumidities: number[] = chunk.map((d: any) => d.humidity_avg).filter((h: any): h is number => typeof h === 'number' && !isNaN(h));
        const validDirEntries = chunk.filter(
          (d: any) => typeof d.wind_dominant_direction === 'number' && !isNaN(d.wind_dominant_direction),
        );
        const validDirs: number[] = validDirEntries.map((d: any) => d.wind_dominant_direction);

        const weekDominantDir = calculateCircularMeanDegrees(
          validDirs,
          validDirEntries.map((d: any) => d.wind_avg),
        );

        // Short X-axis label (e.g. "12. aug" or "Jan")
        const label = formatNorwegianDate(startDt, { day: 'numeric', month: 'short' });
        const fullLabel = `${formatNorwegianDate(startDt, { day: 'numeric', month: 'short' })} – ${formatNorwegianDate(endDt, { day: 'numeric', month: 'short' })}`;

        weeks.push({
          isWeekly: true,
          date: startDate,
          firstDayDate: chunk[0].date,
          label,
          fullLabel,
          temp_avg: validTempsAvg.length
            ? Math.round((validTempsAvg.reduce((a: number, b: number) => a + b, 0) / validTempsAvg.length) * 10) / 10
            : null,
          temp_min: validTempsMin.length ? Math.min(...validTempsMin) : null,
          temp_max: validTempsMax.length ? Math.max(...validTempsMax) : null,
          precip_total: validPrecips.length ? Math.round(validPrecips.reduce((a: number, b: number) => a + b, 0) * 10) / 10 : null,
          precip_days: validPrecips.length
            ? chunk.filter((d: any) => typeof d.precip_total === 'number' && d.precip_total >= 0.1).length
            : null,
          precip_max_day: validPrecips.length ? Math.max(...validPrecips) : null,
          wind_avg: validWinds.length
            ? Math.round((validWinds.reduce((a: number, b: number) => a + b, 0) / validWinds.length) * 10) / 10
            : null,
          wind_max: validWinds.length ? Math.max(...validWinds) : null,
          wind_gust_max: validGusts.length ? Math.max(...validGusts) : null,
          wind_dominant_direction: weekDominantDir,
          wind_dominant_cardinal: getWindDirectionCardinal8(weekDominantDir),
          wind_dominant_arrow: getWindDirectionArrowUnicode(weekDominantDir),
          wind_dominant_name: getWindDirectionFullName(weekDominantDir),
          pressure_avg: validPressures.length
            ? Math.round(validPressures.reduce((a: number, b: number) => a + b, 0) / validPressures.length)
            : null,
          humidity_avg: validHumidities.length
            ? Math.round(validHumidities.reduce((a: number, b: number) => a + b, 0) / validHumidities.length)
            : null,
          daysCount: chunk.length,
        });
      }
      return weeks;
    }

    return points;
  }, [points, range, effectiveResolution]);

  // Calculate well-proportioned temperature Y-axis domain for historical analysis
  const tempHistoryDomain = useMemo(() => {
    const vals = (aggregatedChartPoints || [])
      .flatMap((d: any) => [d.temp_min, d.temp_avg, d.temp_max, d.temperature])
      .filter((v: any): v is number => typeof v === 'number' && !isNaN(v));

    if (vals.length === 0) return [0, 20];
    return getTemperatureDomain(Math.min(...vals), Math.max(...vals), 6);
  }, [aggregatedChartPoints]);

  // Check whether we need a scrollable container when full daily resolution is chosen for long ranges
  const isLargeDailySet = effectiveResolution === 'daily' && points && points.length > 40;
  const chartScrollWidth = isLargeDailySet ? Math.max(720, points.length * 6) : '100%';

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center py-28 text-slate-400 space-y-3">
        <Clock className="w-8 h-8 animate-spin text-sky-400" />
        <span className="text-sm font-medium">Laster inn meteorologisk værhistorikk...</span>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="mx-auto my-16 max-w-lg rounded-2xl border border-rose-800/60 bg-rose-950/30 p-7 text-center">
        <Info className="mx-auto h-8 w-8 text-rose-400" />
        <p role="alert" className="mt-3 text-sm text-slate-200">{error}</p>
        <button type="button" onClick={() => fetchHistory(true)} className="mt-4 min-h-11 rounded-xl bg-sky-600 px-4 py-2 text-sm font-bold text-white">
          Prøv på nytt
        </button>
      </div>
    );
  }

  const showResolutionControls =
    range !== '24h' && range !== '7d' && range !== 'calendar' && points && points.length >= 35;

  return (
    <div className="space-y-6 sm:space-y-8 pb-16">
      {/* Header & Controls */}
      <div className="space-y-4 pb-3 border-b border-slate-800/80">
        {/* Title row with Refresh & Custom buttons */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-2">
              <History className="w-5 h-5 sm:w-6 sm:h-6 text-sky-400 shrink-0" />
              <span>Værhistorikk & Analyse</span>
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Aggregerte observasjoner og historiske meteorologiske hendelser
            </p>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => setShowCustomRangeModal(true)}
              title="Velg egendefinert datointervall"
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-semibold transition ${
                range === 'custom'
                  ? 'bg-sky-600 text-white border-sky-500 shadow-sm shadow-sky-600/30'
                  : 'bg-slate-900/90 text-slate-300 border-slate-800 hover:text-white hover:bg-slate-800'
              }`}
            >
              <CalendarRange className="w-3.5 h-3.5 text-sky-400" />
              <span className="hidden min-[360px]:inline">Dato</span>
            </button>

            <button
              onClick={() => fetchHistory(true)}
              disabled={refreshing}
              title="Oppdater historikkdata fra serveren"
              className="p-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-sky-400 transition shadow-sm active:scale-95"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-sky-400' : ''}`} />
            </button>
          </div>
        </div>

        {/* Period Selector - Mobile-friendly horizontal pill scroller */}
        <div className="space-y-2">
          <div className="relative">
            {/* Scrollable pill track */}
            <div
              ref={rangeScrollRef}
              className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1 px-0.5 scroll-smooth"
            >
              {ranges.map((r) => {
                const isActive = range === r.id;
                return (
                  <button
                    key={r.id}
                    onClick={() => setRange(r.id)}
                    className={`shrink-0 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all duration-150 flex items-center gap-1.5 ${
                      isActive
                        ? 'bg-sky-600 text-white shadow-md shadow-sky-950/40 ring-1 ring-sky-400/50 scale-[1.02]'
                        : 'bg-slate-900/80 text-slate-300 hover:text-white hover:bg-slate-800 border border-slate-800/80'
                    }`}
                  >
                    {r.id === 'calendar' && <Calendar className="w-3.5 h-3.5" />}
                    <span>{r.shortLabel}</span>
                  </button>
                );
              })}

              {range === 'custom' && (
                <button
                  onClick={() => setShowCustomRangeModal(true)}
                  className="shrink-0 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-sky-600 text-white shadow-md ring-1 ring-sky-400/50 flex items-center gap-1.5"
                >
                  <CalendarRange className="w-3.5 h-3.5" />
                  <span>Egendefinert</span>
                </button>
              )}
            </div>
          </div>

          {/* Active Period Granularity Subtitle */}
          <div className="flex items-center justify-between text-[11px] text-slate-400 px-1">
            <span className="flex items-center gap-1.5 truncate">
              <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />
              <span className="text-slate-300 font-medium">{currentRangeObj.description}</span>
            </span>
            {points && points.length > 0 && range !== 'calendar' && (
              <span className="shrink-0 font-mono text-[10px] text-slate-500 bg-slate-900/80 px-2 py-0.5 rounded-md border border-slate-800/60 ml-2">
                {points.length} {range === '24h' ? 'timer' : 'dager'}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Parameter Selector (Temperatur, Nedbør, Vind, Trykk, Fuktighet) */}
      <div className="relative">
        <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar py-1 px-0.5">
          {parameters.map((p) => {
            const Icon = p.icon;
            const isActive = parameter === p.id;
            return (
              <button
                key={p.id}
                onClick={() => setParameter(p.id)}
                className={`shrink-0 flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-xl text-xs font-semibold border transition-all duration-150 ${
                  isActive
                    ? 'bg-sky-950/70 border-sky-500/90 text-sky-200 shadow-md shadow-sky-950/50 scale-[1.01]'
                    : 'bg-slate-900/70 border-slate-800/80 text-slate-400 hover:bg-slate-800/80 hover:text-slate-200'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${isActive ? 'text-sky-400' : 'text-slate-400'}`} />
                <span>{p.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {error && data && <p role="alert" className="rounded-xl border border-rose-800/60 bg-rose-950/30 p-3 text-sm text-rose-200">{error}</p>}

      {!hasPeriodData ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 px-6 py-16 text-center">
          <History className="mx-auto h-8 w-8 text-slate-500" />
          <h2 className="mt-3 text-base font-bold text-white">Ingen observasjoner i perioden</h2>
          <p className="mt-1 text-sm text-slate-400">Velg en annen periode eller oppdater når nye målinger er tilgjengelige.</p>
        </div>
      ) : range !== 'calendar' ? (
        <>
          {/* Summary Stat Cards for Active Parameter - Fully mobile responsive 2x2 grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3.5">
            {parameter === 'temperature' && (
              <>
                <div className="bg-slate-900/80 border border-slate-800/90 rounded-2xl p-3.5 sm:p-4 shadow-sm hover:border-slate-700 transition">
                  <span className="text-[11px] sm:text-xs text-slate-400 block mb-1">Gjennomsnitt</span>
                  <span className="text-xl sm:text-2xl font-bold text-white font-mono tabular-nums">
                    {formatMetric(stats.temp_avg, ' °C')}
                  </span>
                </div>
                <div className="bg-slate-900/80 border border-slate-800/90 rounded-2xl p-3.5 sm:p-4 shadow-sm hover:border-slate-700 transition">
                  <span className="text-[11px] sm:text-xs text-slate-400 block mb-1">Laveste (Min)</span>
                  <span className="text-xl sm:text-2xl font-bold text-cyan-400 font-mono tabular-nums">
                    {formatMetric(stats.temp_min, ' °C')}
                  </span>
                </div>
                <div className="bg-slate-900/80 border border-slate-800/90 rounded-2xl p-3.5 sm:p-4 shadow-sm hover:border-slate-700 transition">
                  <span className="text-[11px] sm:text-xs text-slate-400 block mb-1">Høyeste (Maks)</span>
                  <span className="text-xl sm:text-2xl font-bold text-amber-400 font-mono tabular-nums">
                    {formatMetric(stats.temp_max, ' °C')}
                  </span>
                </div>
                <div className="bg-slate-900/80 border border-slate-800/90 rounded-2xl p-3.5 sm:p-4 shadow-sm hover:border-slate-700 transition">
                  <span className="text-[11px] sm:text-xs text-slate-400 block mb-1">Temperaturspenn</span>
                  <span className="text-xl sm:text-2xl font-bold text-slate-200 font-mono tabular-nums">
                    {typeof stats.temp_max === 'number' && typeof stats.temp_min === 'number'
                      ? formatMetric(stats.temp_max - stats.temp_min, ' °C')
                      : 'Ikke tilgjengelig'}
                  </span>
                </div>
              </>
            )}

            {parameter === 'precipitation' && (
              <>
                <div className="bg-slate-900/80 border border-slate-800/90 rounded-2xl p-3.5 sm:p-4 shadow-sm hover:border-slate-700 transition">
                  <span className="text-[11px] sm:text-xs text-slate-400 block mb-1">Total nedbør</span>
                  <span className="text-xl sm:text-2xl font-bold text-cyan-400 font-mono tabular-nums">
                    {formatMetric(stats.precip_total, ' mm')}
                  </span>
                </div>
                <div className="bg-slate-900/80 border border-slate-800/90 rounded-2xl p-3.5 sm:p-4 shadow-sm hover:border-slate-700 transition">
                  <span className="text-[11px] sm:text-xs text-slate-400 block mb-1">Dager m/ nedbør</span>
                  <span className="text-xl sm:text-2xl font-bold text-white font-mono tabular-nums">
                    {formatMetric(stats.precip_rainy_days, '', 0)}
                  </span>
                </div>
                <div className="bg-slate-900/80 border border-slate-800/90 rounded-2xl p-3.5 sm:p-4 shadow-sm hover:border-slate-700 transition">
                  <span className="text-[11px] sm:text-xs text-slate-400 block mb-1">Største døgn</span>
                  <span className="text-xl sm:text-2xl font-bold text-blue-400 font-mono tabular-nums">
                    {formatMetric(stats.precip_max_day, ' mm')}
                  </span>
                </div>
                <div className="bg-slate-900/80 border border-slate-800/90 rounded-2xl p-3.5 sm:p-4 shadow-sm hover:border-slate-700 transition">
                  <span className="text-[11px] sm:text-xs text-slate-400 block mb-1">Maks time</span>
                  <span className="text-xl sm:text-2xl font-bold text-indigo-300 font-mono tabular-nums">
                    {formatMetric(stats.precip_max_hour ?? stats.precip_max_event, ' mm')}
                  </span>
                </div>
              </>
            )}

            {parameter === 'wind' && (
              <>
                <div className="bg-slate-900/80 border border-slate-800/90 rounded-2xl p-3.5 sm:p-4 shadow-sm hover:border-slate-700 transition">
                  <span className="text-[11px] sm:text-xs text-slate-400 block mb-1">Gjennomsnittsvind</span>
                  <span className="text-xl sm:text-2xl font-bold text-white font-mono tabular-nums block">
                    {formatMetric(stats.wind_avg, ' m/s')}
                  </span>
                  <span className="text-[10px] text-sky-400 font-medium block mt-0.5">
                    {typeof stats.wind_avg === 'number' ? getBeaufort(stats.wind_avg).name : 'Ikke tilgjengelig'}
                  </span>
                </div>
                <div className="bg-slate-900/80 border border-slate-800/90 rounded-2xl p-3.5 sm:p-4 shadow-sm hover:border-slate-700 transition">
                  <span className="text-[11px] sm:text-xs text-slate-400 block mb-1">Maks middelvind</span>
                  <span className="text-xl sm:text-2xl font-bold text-sky-400 font-mono tabular-nums block">
                    {formatMetric(stats.wind_max, ' m/s')}
                  </span>
                  <span className="text-[10px] text-slate-400 font-medium block mt-0.5">
                    {typeof stats.wind_max === 'number' ? getBeaufort(stats.wind_max).name : 'Ikke tilgjengelig'}
                  </span>
                </div>
                <div className="bg-slate-900/80 border border-slate-800/90 rounded-2xl p-3.5 sm:p-4 shadow-sm hover:border-slate-700 transition">
                  <span className="text-[11px] sm:text-xs text-slate-400 block mb-1">Maks vindkast</span>
                  <span className="text-xl sm:text-2xl font-bold text-amber-400 font-mono tabular-nums block">
                    {formatMetric(stats.wind_gust_max, ' m/s')}
                  </span>
                  <span className="text-[10px] text-amber-400/80 font-medium block mt-0.5">
                    Toppkast i perioden
                  </span>
                </div>
                <div className="bg-slate-900/80 border border-slate-800/90 rounded-2xl p-3.5 sm:p-4 shadow-sm hover:border-slate-700 transition">
                  <span className="text-[11px] sm:text-xs text-slate-400 block mb-1">Dominerende retning</span>
                  <div className="flex items-center gap-2">
                    <div
                      className="w-7 h-7 rounded-lg bg-sky-950 border border-sky-600/40 flex items-center justify-center text-sky-300 font-bold text-sm shrink-0 shadow-inner"
                      title={stats.wind_dominant_name || 'Dominerende vindretning'}
                    >
                      {typeof stats.wind_dominant_direction === 'number' ? (
                        <span
                          className="inline-block transition-transform duration-300"
                          style={{ transform: `rotate(${(stats.wind_dominant_direction + 180) % 360}deg)` }}
                        >
                          ↑
                        </span>
                      ) : <span>–</span>}
                    </div>
                    <div>
                      <span className="text-lg sm:text-xl font-bold text-sky-300 font-mono block leading-tight">
                        {stats.wind_dominant_cardinal || 'Ikke tilgjengelig'}{' '}
                        {typeof stats.wind_dominant_direction === 'number' && <span className="text-xs text-slate-400 font-normal">({stats.wind_dominant_direction}°)</span>}
                      </span>
                    </div>
                  </div>
                  <span className="text-[10px] text-slate-400 font-medium block mt-0.5 truncate">
                    {stats.wind_dominant_name || getWindDirectionFullName(stats.wind_dominant_direction) || 'Ikke tilgjengelig'}
                  </span>
                </div>
              </>
            )}

            {parameter === 'pressure' && (
              <>
                <div className="bg-slate-900/80 border border-slate-800/90 rounded-2xl p-3.5 sm:p-4 shadow-sm hover:border-slate-700 transition">
                  <span className="text-[11px] sm:text-xs text-slate-400 block mb-1">Gjennomsnitt</span>
                  <span className="text-xl sm:text-2xl font-bold text-white font-mono tabular-nums">{formatMetric(pressureSummary.avg, ' hPa', 0)}</span>
                </div>
                <div className="bg-slate-900/80 border border-slate-800/90 rounded-2xl p-3.5 sm:p-4 shadow-sm hover:border-slate-700 transition">
                  <span className="text-[11px] sm:text-xs text-slate-400 block mb-1">Laveste trykk</span>
                  <span className="text-xl sm:text-2xl font-bold text-rose-400 font-mono tabular-nums">{formatMetric(pressureSummary.min, ' hPa', 0)}</span>
                </div>
                <div className="bg-slate-900/80 border border-slate-800/90 rounded-2xl p-3.5 sm:p-4 shadow-sm hover:border-slate-700 transition">
                  <span className="text-[11px] sm:text-xs text-slate-400 block mb-1">Høyeste trykk</span>
                  <span className="text-xl sm:text-2xl font-bold text-sky-400 font-mono tabular-nums">{formatMetric(pressureSummary.max, ' hPa', 0)}</span>
                </div>
                <div className="bg-slate-900/80 border border-slate-800/90 rounded-2xl p-3.5 sm:p-4 shadow-sm hover:border-slate-700 transition">
                  <span className="text-[11px] sm:text-xs text-slate-400 block mb-1">Variasjon</span>
                  <span className="text-xl sm:text-2xl font-bold text-slate-300 font-mono tabular-nums">
                    {pressureSummary.min !== null && pressureSummary.max !== null
                      ? formatMetric(pressureSummary.max - pressureSummary.min, ' hPa', 0)
                      : 'Ikke tilgjengelig'}
                  </span>
                </div>
              </>
            )}

            {parameter === 'humidity' && (
              <>
                <div className="bg-slate-900/80 border border-slate-800/90 rounded-2xl p-3.5 sm:p-4 shadow-sm hover:border-slate-700 transition">
                  <span className="text-[11px] sm:text-xs text-slate-400 block mb-1">Gjennomsnitt</span>
                  <span className="text-xl sm:text-2xl font-bold text-white font-mono tabular-nums">{formatMetric(humiditySummary.avg, ' %', 0)}</span>
                </div>
                <div className="bg-slate-900/80 border border-slate-800/90 rounded-2xl p-3.5 sm:p-4 shadow-sm hover:border-slate-700 transition">
                  <span className="text-[11px] sm:text-xs text-slate-400 block mb-1">Minimum</span>
                  <span className="text-xl sm:text-2xl font-bold text-amber-300 font-mono tabular-nums">{formatMetric(humiditySummary.min, ' %', 0)}</span>
                </div>
                <div className="bg-slate-900/80 border border-slate-800/90 rounded-2xl p-3.5 sm:p-4 shadow-sm hover:border-slate-700 transition">
                  <span className="text-[11px] sm:text-xs text-slate-400 block mb-1">Maksimum</span>
                  <span className="text-xl sm:text-2xl font-bold text-blue-400 font-mono tabular-nums">{formatMetric(humiditySummary.max, ' %', 0)}</span>
                </div>
                <div className="bg-slate-900/80 border border-slate-800/90 rounded-2xl p-3.5 sm:p-4 shadow-sm hover:border-slate-700 transition">
                  <span className="text-[11px] sm:text-xs text-slate-400 block mb-1">Mettet luft (100%)</span>
                  <span className="text-xl sm:text-2xl font-bold text-slate-300 font-mono tabular-nums">{formatMetric(humiditySummary.saturated, ' datapunkter', 0)}</span>
                </div>
              </>
            )}
          </div>

          {/* Main Visualizer Chart Card with Smart Long-period Mobile Optimizations */}
          <div className="met-glass-card rounded-2xl p-4 sm:p-6 border border-slate-800/90 shadow-xl space-y-3.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div>
                <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                  <span>
                    {parameter === 'temperature' && 'Temperaturutvikling (Maks, Snitt, Min)'}
                    {parameter === 'precipitation' &&
                      (effectiveResolution === 'weekly'
                        ? 'Ukesnedbør (mm)'
                        : effectiveResolution === 'monthly'
                        ? 'Månedsnedbør (mm)'
                        : 'Døgnnedbør (mm)')}
                    {parameter === 'wind' && 'Vindstyrke og vindkast'}
                    {parameter === 'pressure' && 'Lufttrykk (hPa)'}
                    {parameter === 'humidity' && 'Relativ luftfuktighet (%)'}
                  </span>
                </h3>
                <p className="text-[11px] text-slate-400">
                  {effectiveResolution === 'weekly'
                    ? 'Ukentlige samlinger for tydelig årstrend på mobil. Trykk på en uke for detaljer.'
                    : effectiveResolution === 'monthly'
                    ? 'Månedlige samlinger for sesongoversikt. Trykk på en søyle for detaljer.'
                    : 'Daglige observasjoner. Trykk på et punkt for 24-timers dagsutdrag.'}
                </p>
              </div>

              {/* Resolution Controls for Long Periods (1 year, 2 years, 3 months, all) */}
              {showResolutionControls && (
                <div className="flex items-center gap-1 bg-slate-900/90 p-1 rounded-xl border border-slate-800 shrink-0 self-start sm:self-auto">
                  <span className="text-[10px] uppercase font-bold text-slate-400 px-2 hidden sm:inline">
                    Oppløsning:
                  </span>
                  <button
                    type="button"
                    onClick={() => setResolutionOverride('weekly')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                      effectiveResolution === 'weekly'
                        ? 'bg-sky-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800'
                    }`}
                  >
                    Uke
                  </button>
                  <button
                    type="button"
                    onClick={() => setResolutionOverride('monthly')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                      effectiveResolution === 'monthly'
                        ? 'bg-sky-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800'
                    }`}
                  >
                    Måned
                  </button>
                  <button
                    type="button"
                    onClick={() => setResolutionOverride('daily')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                      effectiveResolution === 'daily'
                        ? 'bg-sky-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800'
                    }`}
                  >
                    Døgn
                  </button>
                </div>
              )}
            </div>

            {/* Scroll indicator if daily view on long period is active */}
            {isLargeDailySet && (
              <div className="flex items-center justify-between text-[11px] text-sky-400/90 bg-sky-950/40 border border-sky-800/40 px-3 py-1.5 rounded-xl animate-in fade-in">
                <span className="flex items-center gap-1.5 font-medium">
                  <MoveHorizontal className="w-3.5 h-3.5 shrink-0 animate-pulse" />
                  <span>Sveip mot høyre/venstre for å bla gjennom alle {points.length} døgn</span>
                </span>
                <button
                  onClick={() => setResolutionOverride('weekly')}
                  className="underline text-[10px] text-white hover:text-sky-300 font-bold shrink-0 ml-2"
                >
                  Bytt til ukesvisning
                </button>
              </div>
            )}

            {/* Chart Container (with horizontal swipe if dense daily is active) */}
            <div
              ref={chartScrollContainerRef}
              className={`w-full ${isLargeDailySet ? 'overflow-x-auto no-scrollbar pb-2 pt-1' : 'pt-2'}`}
            >
              <div
                style={{ width: chartScrollWidth, height: 280 }}
                className="h-64 sm:h-80 relative transition-all duration-200"
              >
                <ResponsiveContainer width="100%" height="100%">
                  {parameter === 'precipitation' ? (
                    <BarChart
                      data={aggregatedChartPoints}
                      margin={{ top: 10, right: 8, left: -20, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis
                        dataKey="label"
                        stroke="#64748b"
                        tick={{ fontSize: 10 }}
                        interval={
                          effectiveResolution === 'weekly'
                            ? Math.ceil(aggregatedChartPoints.length / 10)
                            : effectiveResolution === 'monthly'
                            ? 0
                            : 'preserveStartEnd'
                        }
                      />
                      <YAxis
                        stroke="#64748b"
                        tick={{ fontSize: 10 }}
                        domain={[0, 'auto']}
                        allowDataOverflow={false}
                        tickFormatter={(v) => `${v}`}
                      />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const d = payload[0].payload;
                            const precipDisplay =
                              d.precip_total !== null && d.precip_total !== undefined
                                ? `${formatNorwegianNumber(Math.max(0, d.precip_total), 1)} mm`
                                : 'Ingen måling';
                            return (
                              <div
                                onClick={() => (d.firstDayDate || d.date) && handleOpenDay(d.firstDayDate || d.date)}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault();
                                    const targetDate = d.firstDayDate || d.date;
                                    if (targetDate) handleOpenDay(targetDate);
                                  }
                                }}
                                role="button"
                                tabIndex={0}
                                className="bg-slate-900/95 backdrop-blur border border-slate-700 p-3 rounded-xl shadow-xl text-xs space-y-1.5 cursor-pointer select-none max-w-xs"
                              >
                                <p className="font-bold text-white border-b border-slate-800 pb-1">
                                  {d.fullLabel || d.label || d.date}
                                </p>
                                <div className="space-y-0.5">
                                  <p className="text-cyan-400 font-mono">
                                    Total nedbør: <span className="font-bold text-white">{precipDisplay}</span>
                                  </p>
                                  {(d.isWeekly || d.isMonthly) && typeof d.precip_days === 'number' && (
                                    <p className="text-slate-300 font-mono text-[11px]">
                                      Regndager: <span className="font-bold text-white">{d.precip_days}</span> av{' '}
                                      {typeof d.daysCount === 'number' ? `${d.daysCount} dager` : 'Antall dager ikke tilgjengelig'}
                                    </p>
                                  )}
                                  {(d.isWeekly || d.isMonthly) && d.precip_max_day > 0 && (
                                    <p className="text-blue-300 font-mono text-[11px]">
                                      Våteste døgn: <span className="font-bold">{formatNorwegianNumber(d.precip_max_day, 1)} mm</span>
                                    </p>
                                  )}
                                </div>
                                <span className="text-[10px] text-sky-400 underline block pt-0.5">
                                  Trykk for detaljert dagsutdrag →
                                </span>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Bar
                        dataKey="precip_total"
                        fill="#0284c7"
                        radius={[4, 4, 0, 0]}
                        onClick={(e: any) => {
                          const targetDate = e?.firstDayDate || e?.date;
                          if (targetDate) handleOpenDay(targetDate);
                        }}
                      />
                    </BarChart>
                  ) : parameter === 'temperature' ? (
                    <AreaChart
                      data={aggregatedChartPoints}
                      margin={{ top: 10, right: 8, left: -20, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient id="tempAreaGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.35} />
                          <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.08} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis
                        dataKey="label"
                        stroke="#64748b"
                        tick={{ fontSize: 10 }}
                        interval={
                          effectiveResolution === 'weekly'
                            ? Math.ceil(aggregatedChartPoints.length / 10)
                            : effectiveResolution === 'monthly'
                            ? 0
                            : 'preserveStartEnd'
                        }
                      />
                      <YAxis
                        stroke="#64748b"
                        tick={{ fontSize: 10 }}
                        domain={tempHistoryDomain}
                        tickFormatter={(v) => `${v}°`}
                      />
                      {tempHistoryDomain[0] <= 0 && tempHistoryDomain[1] >= 0 && (
                        <ReferenceLine y={0} stroke="#38bdf8" strokeDasharray="3 3" strokeOpacity={0.4} />
                      )}
                      <Tooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const d = payload[0].payload;
                            return (
                              <div
                                onClick={() => (d.firstDayDate || d.date) && handleOpenDay(d.firstDayDate || d.date)}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault();
                                    const targetDate = d.firstDayDate || d.date;
                                    if (targetDate) handleOpenDay(targetDate);
                                  }
                                }}
                                role="button"
                                tabIndex={0}
                                className="bg-slate-900/95 backdrop-blur border border-slate-700 p-3 rounded-xl shadow-xl text-xs space-y-1.5 cursor-pointer select-none max-w-xs"
                              >
                                <p className="font-bold text-white border-b border-slate-800 pb-1">
                                  {d.fullLabel || d.label || d.date}
                                </p>
                                <div className="space-y-0.5 font-mono">
                                  <p className="text-amber-400">
                                    Høyeste:{' '}
                                    <span className="font-bold text-white">
                                      {formatMetric(d.temp_max, ' °C')}
                                    </span>
                                  </p>
                                  <p className="text-slate-200">
                                    Gjennomsnitt:{' '}
                                    <span className="font-bold text-white">
                                      {formatMetric(d.temp_avg, ' °C')}
                                    </span>
                                  </p>
                                  <p className="text-cyan-300">
                                    Laveste:{' '}
                                    <span className="font-bold text-white">
                                      {formatMetric(d.temp_min, ' °C')}
                                    </span>
                                  </p>
                                  {typeof d.temp_max === 'number' && typeof d.temp_min === 'number' && (
                                    <p className="text-slate-400 text-[11px] pt-0.5">
                                      Spenn: {formatNorwegianNumber(Math.round((d.temp_max - d.temp_min) * 10) / 10, 1)}{' '}
                                      °C
                                    </p>
                                  )}
                                </div>
                                <span className="text-[10px] text-sky-400 underline block pt-0.5">
                                  Trykk for detaljert dagsutdrag →
                                </span>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="temp_max"
                        stroke="#f59e0b"
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#tempAreaGrad)"
                        connectNulls={true}
                      />
                      <Line
                        type="monotone"
                        dataKey="temp_avg"
                        stroke="#ffffff"
                        strokeWidth={2}
                        dot={effectiveResolution === 'monthly'}
                        connectNulls={true}
                      />
                      <Line
                        type="monotone"
                        dataKey="temp_min"
                        stroke="#38bdf8"
                        strokeWidth={2}
                        dot={false}
                        connectNulls={true}
                      />
                    </AreaChart>
                  ) : parameter === 'wind' ? (
                    <LineChart
                      data={aggregatedChartPoints}
                      margin={{ top: 10, right: 8, left: -20, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis
                        dataKey="label"
                        stroke="#64748b"
                        tick={{ fontSize: 10 }}
                        interval={
                          effectiveResolution === 'weekly'
                            ? Math.ceil(aggregatedChartPoints.length / 10)
                            : effectiveResolution === 'monthly'
                            ? 0
                            : 'preserveStartEnd'
                        }
                      />
                      <YAxis stroke="#64748b" tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}`} />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const d = payload[0].payload;
                            const beaufort = getBeaufort(d.wind_avg);
                            return (
                              <div className="bg-slate-900/95 backdrop-blur border border-slate-700 p-3 rounded-xl shadow-xl text-xs space-y-1.5 min-w-[200px]">
                                <p className="font-bold text-white border-b border-slate-800 pb-1 flex items-center justify-between">
                                  <span>{d.fullLabel || d.label}</span>
                                  {d.isMonthly ? (
                                    <span className="text-[10px] text-sky-400 bg-sky-950/60 px-1.5 py-0.5 rounded border border-sky-800/50">Måned</span>
                                  ) : d.isWeekly ? (
                                    <span className="text-[10px] text-sky-400 bg-sky-950/60 px-1.5 py-0.5 rounded border border-sky-800/50">Uke</span>
                                  ) : null}
                                </p>
                                <div className="space-y-1 font-mono">
                                  <p className="text-sky-300 flex items-center justify-between">
                                    <span className="text-slate-400">Middelvind:</span>
                                    <span className="font-bold text-white">
                                      {formatNorwegianNumber(d.wind_avg, 1)} m/s
                                    </span>
                                  </p>
                                  {beaufort?.name && (
                                    <p className="text-[11px] text-sky-400/90 italic flex justify-end font-sans">
                                      {beaufort.name} (styrke {beaufort.scale})
                                    </p>
                                  )}
                                  <p className="text-amber-400 flex items-center justify-between">
                                    <span className="text-slate-400">Maks vindkast:</span>
                                    <span className="font-bold text-white">
                                      {formatNorwegianNumber(d.wind_gust_max, 1)} m/s
                                    </span>
                                  </p>
                                  {(d.wind_dominant_cardinal || typeof d.wind_dominant_direction === 'number') && (
                                    <div className="pt-1.5 border-t border-slate-800/80 flex items-center justify-between text-sky-300 font-sans">
                                      <span className="text-slate-400 text-[11px]">Dominerende vind:</span>
                                      <span className="font-bold flex items-center gap-1.5 text-white">
                                        {typeof d.wind_dominant_direction === 'number' && (
                                          <span
                                            className="inline-block text-sky-400 font-bold transition-transform"
                                            style={{
                                              transform: `rotate(${(d.wind_dominant_direction + 180) % 360}deg)`,
                                            }}
                                          >
                                            ↑
                                          </span>
                                        )}
                                        <span>
                                          {d.wind_dominant_cardinal || getWindDirectionCardinal8(d.wind_dominant_direction)}{' '}
                                          {d.wind_dominant_direction !== null && d.wind_dominant_direction !== undefined ? `(${d.wind_dominant_direction}°)` : ''}
                                        </span>
                                      </span>
                                    </div>
                                  )}
                                  {d.wind_dominant_name && (
                                    <p className="text-[10px] text-slate-400 text-right font-sans">
                                      {d.wind_dominant_name}
                                    </p>
                                  )}
                                </div>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="wind_avg"
                        stroke="#38bdf8"
                        strokeWidth={2.5}
                        dot={effectiveResolution === 'monthly'}
                        connectNulls={true}
                      />
                      <Line
                        type="monotone"
                        dataKey="wind_gust_max"
                        stroke="#f59e0b"
                        strokeWidth={1.5}
                        strokeDasharray="4 4"
                        dot={false}
                        connectNulls={true}
                      />
                    </LineChart>
                  ) : (
                    <LineChart
                      data={aggregatedChartPoints}
                      margin={{ top: 10, right: 8, left: -20, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis
                        dataKey="label"
                        stroke="#64748b"
                        tick={{ fontSize: 10 }}
                        interval={
                          effectiveResolution === 'weekly'
                            ? Math.ceil(aggregatedChartPoints.length / 10)
                            : effectiveResolution === 'monthly'
                            ? 0
                            : 'preserveStartEnd'
                        }
                      />
                      <YAxis stroke="#64748b" tick={{ fontSize: 10 }} domain={['dataMin - 5', 'dataMax + 5']} />
                      <Tooltip />
                      <Line
                        type="monotone"
                        dataKey={parameter === 'pressure' ? 'pressure_avg' : 'humidity_avg'}
                        stroke="#818cf8"
                        strokeWidth={2.5}
                        dot={effectiveResolution === 'monthly'}
                        connectNulls={true}
                      />
                    </LineChart>
                  )}
                </ResponsiveContainer>
              </div>
            </div>

            {/* Mini Legend for Temp & Wind Charts */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-800/80 text-[11px] text-slate-400">
              {parameter === 'temperature' && (
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                    <span>Maksimum</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-white border border-slate-600" />
                    <span>Snittkurve</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-sky-400" />
                    <span>Minimum</span>
                  </span>
                </div>
              )}
              {parameter === 'wind' && (
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-sky-400" />
                    <span>Middelvind</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-0.5 bg-amber-400" />
                    <span>Maks kast</span>
                  </span>
                </div>
              )}
              {parameter === 'precipitation' && (
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded bg-sky-600" />
                  <span>
                    {effectiveResolution === 'weekly'
                      ? 'Total ukesnedbør'
                      : effectiveResolution === 'monthly'
                      ? 'Total månedsnedbør'
                      : 'Døgnnedbør'}
                  </span>
                </div>
              )}

              <span className="text-[10px] text-slate-500 font-mono">
                {aggregatedChartPoints.length} målepunkter
              </span>
            </div>

            {/* Dominerende Vindretning - Tidslinjebånd (kun ved parameter === 'wind') */}
            {parameter === 'wind' && aggregatedChartPoints.length > 0 && (
              <div className="pt-3 border-t border-slate-800/80 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
                    <Compass className="w-4 h-4 text-sky-400" />
                    <span>
                      Dominerende vindretning{' '}
                      <span className="text-sky-400 font-normal">
                        ({effectiveResolution === 'weekly' ? 'per uke' : effectiveResolution === 'monthly' ? 'per måned' : 'per døgn'})
                      </span>
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-400">
                    Trykk på en periode for detaljer
                  </span>
                </div>

                {/* Horizontally scrollable strip of directional badges */}
                <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
                  {aggregatedChartPoints.map((pt: any, idx: number) => {
                    const dir = pt.wind_dominant_direction;
                    const cardinal = pt.wind_dominant_cardinal || getWindDirectionCardinal8(dir) || '–';
                    const speed = pt.wind_avg;
                    return (
                      <button
                        type="button"
                        key={idx}
                        onClick={() => {
                          const targetDate = pt.firstDayDate || pt.date;
                          if (targetDate) handleOpenDay(targetDate);
                        }}
                        className="shrink-0 flex min-h-11 flex-col items-center justify-center p-2 rounded-xl bg-slate-900/90 border border-slate-800 hover:border-sky-500/60 hover:bg-slate-800/80 transition-all text-center min-w-[72px] group"
                      >
                        <span className="text-[10px] text-slate-400 font-medium group-hover:text-sky-300 transition">
                          {pt.label}
                        </span>

                        <div className="my-1.5 w-8 h-8 rounded-full bg-slate-800 border border-slate-700/80 group-hover:border-sky-500/70 flex items-center justify-center text-sky-400 shadow-inner">
                          {dir !== null && dir !== undefined ? (
                            <span
                              className="text-base font-bold transition-transform duration-300"
                              style={{
                                transform: `rotate(${(dir + 180) % 360}deg)`,
                              }}
                              title={`${cardinal} (${dir}°)`}
                            >
                              ↑
                            </span>
                          ) : (
                            <span className="text-xs text-slate-500">–</span>
                          )}
                        </div>

                        <span className="text-[11px] font-bold text-white font-mono leading-none">
                          {cardinal}
                        </span>
                        {dir !== null && dir !== undefined && (
                          <span className="text-[9px] text-slate-400 font-mono">
                            {dir}°
                          </span>
                        )}
                        {speed !== null && speed !== undefined && (
                          <span className="text-[10px] text-sky-300 font-mono mt-0.5 font-semibold">
                            {formatNorwegianNumber(speed, 1)} m/s
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Vindrose & Regnhendelser / Dominerende vindretning tabell Section */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6">
            {/* Vindrose */}
            <div className="lg:col-span-6 met-glass-card rounded-2xl p-4 sm:p-6 border border-slate-800/90 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                  <Compass className="w-4 h-4 sm:w-5 sm:h-5 text-sky-400" />
                  <span>Vindrose – Retningsfordeling</span>
                </h3>
                <span className="text-[11px] text-slate-400 font-mono">8 sektorer</span>
              </div>

              <div className="grid grid-cols-4 gap-2 pt-1">
                {wind_rose.map((w: any, idx: number) => (
                  <div
                    key={idx}
                    className="bg-slate-900/80 border border-slate-800/80 p-2.5 sm:p-3 rounded-xl text-center space-y-0.5 hover:border-slate-700 transition"
                  >
                    <span className="text-xs sm:text-sm font-bold text-sky-400 font-mono block">{w.sector}</span>
                    <span className="text-xs font-semibold text-white font-mono block">{w.frequency_pct} %</span>
                    <span className="text-[10px] text-slate-400 font-mono block">{w.avg_speed_ms} m/s</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Høyre kolonne: Enten Dominerende vindretningstabell (når parameter === 'wind') eller Regnhendelser */}
            {parameter === 'wind' ? (
              <div className="lg:col-span-6 met-glass-card rounded-2xl p-4 sm:p-6 border border-slate-800/90 shadow-xl space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                    <Wind className="w-4 h-4 sm:w-5 sm:h-5 text-sky-400" />
                    <span>
                      Dominerende vind per{' '}
                      {effectiveResolution === 'weekly'
                        ? 'uke'
                        : effectiveResolution === 'monthly'
                        ? 'måned'
                        : 'døgn'}
                    </span>
                  </h3>
                  <span className="text-[11px] text-slate-400">
                    {aggregatedChartPoints.length} perioder
                  </span>
                </div>

                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {aggregatedChartPoints.map((pt: any, idx: number) => {
                    const dir = pt.wind_dominant_direction;
                    const cardinal = pt.wind_dominant_cardinal || getWindDirectionCardinal8(dir) || '–';
                    const beaufort = getBeaufort(pt.wind_avg);
                    const targetDate = pt.firstDayDate || pt.date;

                    return (
                      <div
                        key={idx}
                        onClick={() => targetDate && handleOpenDay(targetDate)}
                        onKeyDown={(event) => {
                          if (targetDate && (event.key === 'Enter' || event.key === ' ')) {
                            event.preventDefault();
                            handleOpenDay(targetDate);
                          }
                        }}
                        role="button"
                        tabIndex={0}
                        aria-label={`Vis detaljer for ${pt.fullLabel || pt.label}`}
                        className="p-3 bg-slate-900/80 border border-slate-800 rounded-xl flex items-center justify-between text-xs hover:border-sky-500/50 hover:bg-slate-800/60 transition cursor-pointer group"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 group-hover:border-sky-500/70 flex items-center justify-center text-sky-400 shrink-0">
                            {dir !== null && dir !== undefined ? (
                              <span
                                className="font-bold text-sm transition-transform"
                                style={{
                                  transform: `rotate(${(dir + 180) % 360}deg)`,
                                }}
                              >
                                ↑
                              </span>
                            ) : (
                              <span className="text-xs text-slate-500">–</span>
                            )}
                          </div>
                          <div>
                            <span className="font-semibold text-white group-hover:text-sky-300 transition block">
                              {pt.fullLabel || pt.label}
                            </span>
                            <span className="text-[11px] text-slate-400 font-mono">
                              Retning: <span className="font-bold text-sky-300">{cardinal} ({dir !== null && dir !== undefined ? `${dir}°` : '–'})</span>
                              {pt.wind_dominant_name && ` • ${pt.wind_dominant_name}`}
                            </span>
                          </div>
                        </div>

                        <div className="text-right font-mono">
                          <span className="font-bold text-white block">
                            {formatMetric(pt.wind_avg, ' m/s')}
                          </span>
                          <span className="text-[10px] text-amber-400">
                            Kast: {formatMetric(pt.wind_gust_max, ' m/s')}
                          </span>
                          {beaufort?.name && (
                            <span className="text-[10px] text-slate-400 block font-sans">
                              {beaufort.name}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              /* Regnhendelser */
              <div className="lg:col-span-6 met-glass-card rounded-2xl p-4 sm:p-6 border border-slate-800/90 shadow-xl space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                    <CloudRain className="w-4 h-4 sm:w-5 sm:h-5 text-cyan-400" />
                    <span>Registrerte regnhendelser</span>
                  </h3>
                  <span className="text-[11px] text-slate-400">Intensitet</span>
                </div>

                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {rain_events.length > 0 ? (
                    rain_events.map((evt: any, idx: number) => {
                      const startDt = new Date(evt.start_at);
                      const endDt = new Date(evt.end_at);
                      return (
                        <div
                          key={idx}
                          className="p-3 bg-slate-900/80 border border-slate-800 rounded-xl flex items-center justify-between text-xs hover:border-slate-700 transition"
                        >
                          <div>
                            <span className="font-semibold text-white block">
                              {formatNorwegianDate(startDt, { day: 'numeric', month: 'short' })}{' '}
                              {formatNorwegianTime(startDt, { hour: '2-digit', minute: '2-digit' })} –{' '}
                              {formatNorwegianTime(endDt, { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            <span className="text-slate-400 text-[11px]">Varighet: {evt.duration_hours} timer</span>
                          </div>
                          <div className="text-right font-mono">
                            <span className="font-bold text-cyan-400 block">{evt.total_mm} mm</span>
                            <span className="text-[10px] text-slate-400">Maks: {evt.max_intensity_mm_per_hour} mm/t</span>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-xs text-slate-400 py-4 text-center">
                      Ingen sammenhengende regnhendelser registrert i denne perioden.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Rekorder (All-time extremes) */}
          <div className="met-glass-card rounded-2xl p-4 sm:p-6 border border-slate-800/90 shadow-xl space-y-4">
            <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
              <Trophy className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400" />
              <span>Historiske Rekorder</span>
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3.5">
              <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5">
                <span className="text-[11px] text-slate-400 block mb-1">Høyeste temperatur</span>
                <span className="text-lg sm:text-xl font-bold text-amber-400 font-mono block">
                  {formatMetric(records.highestTemp?.val, ' °C')}
                </span>
                <span className="text-[10px] text-slate-500">{records.highestTemp?.date || 'Dato ikke tilgjengelig'}</span>
              </div>
              <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5">
                <span className="text-[11px] text-slate-400 block mb-1">Laveste temperatur</span>
                <span className="text-lg sm:text-xl font-bold text-cyan-400 font-mono block">
                  {formatMetric(records.lowestTemp?.val, ' °C')}
                </span>
                <span className="text-[10px] text-slate-500">{records.lowestTemp?.date || 'Dato ikke tilgjengelig'}</span>
              </div>
              <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5">
                <span className="text-[11px] text-slate-400 block mb-1">Våteste døgn</span>
                <span className="text-lg sm:text-xl font-bold text-blue-400 font-mono block">
                  {formatMetric(records.wettestDay?.val, ' mm')}
                </span>
                <span className="text-[10px] text-slate-500">{records.wettestDay?.date || 'Dato ikke tilgjengelig'}</span>
              </div>
              <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5">
                <span className="text-[11px] text-slate-400 block mb-1">Sterkeste vindkast</span>
                <span className="text-lg sm:text-xl font-bold text-amber-300 font-mono block">
                  {formatMetric(records.highestGust?.val, ' m/s')}
                </span>
                <span className="text-[10px] text-slate-500">{records.highestGust?.date || 'Dato ikke tilgjengelig'}</span>
              </div>
            </div>
          </div>
        </>
      ) : (
        /* Måneds- og kalenderutforsker */
        <div className="space-y-6">
          <div className="met-glass-card rounded-2xl p-4 sm:p-6 border border-slate-800/90 shadow-xl space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Calendar className="w-5 h-5 text-sky-400" /> Månedsoversikter
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4">
              {monthly.map((m: any, idx: number) => {
                const monthNames = [
                  '',
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
                return (
                  <div
                    key={idx}
                    className="bg-slate-900/80 border border-slate-800 p-4 sm:p-5 rounded-2xl space-y-3 hover:border-slate-700 transition"
                  >
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                      <span className="font-bold text-white text-base">
                        {monthNames[m.month]} {m.year}
                      </span>
                      <span className="text-xs text-sky-400 font-mono font-semibold">
                        Snitt: {formatMetric(m.temperature_avg, ' °C')}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-slate-400 block">Total nedbør:</span>
                        <span className="font-bold text-cyan-400 font-mono">{formatMetric(m.precipitation_total, ' mm')}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Regndager:</span>
                        <span className="font-bold text-white font-mono">{formatMetric(m.rainy_days, ' dager', 0)}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Maks temp:</span>
                        <span className="font-semibold text-amber-400 font-mono">{formatMetric(m.temperature_max, ' °C')}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Min temp:</span>
                        <span className="font-semibold text-cyan-300 font-mono">{formatMetric(m.temperature_min, ' °C')}</span>
                      </div>
                    </div>

                    {/* Dominerende vindretning for måneden */}
                    <div className="bg-slate-950/60 rounded-xl p-2.5 border border-slate-800/80 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-md bg-slate-800 flex items-center justify-center text-sky-400 text-xs shrink-0">
                          {m.wind_dominant_direction !== null && m.wind_dominant_direction !== undefined ? (
                            <span
                              className="font-bold inline-block"
                              style={{
                                transform: `rotate(${((m.wind_dominant_direction ?? 0) + 180) % 360}deg)`,
                              }}
                            >
                              ↑
                            </span>
                          ) : (
                            <Compass className="w-3.5 h-3.5" />
                          )}
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block">Dominerende vind</span>
                          <span className="font-bold text-white font-mono">
                            {m.wind_dominant_cardinal || getWindDirectionCardinal8(m.wind_dominant_direction) || 'Ikke tilgjengelig'}
                            {m.wind_dominant_direction !== null && m.wind_dominant_direction !== undefined ? ` (${m.wind_dominant_direction}°)` : ''}
                          </span>
                        </div>
                      </div>
                      <div className="text-right font-mono">
                        <span className="text-[10px] text-slate-400 block">Snitt / Kast</span>
                        <span className="font-semibold text-sky-300">
                          {m.wind_avg !== null && m.wind_avg !== undefined
                            ? `${formatNorwegianNumber(m.wind_avg, 1)} m/s${typeof m.max_wind_gust === 'number' ? ` / ${formatNorwegianNumber(m.max_wind_gust, 1)} m/s` : ''}`
                            : 'Ikke tilgjengelig'}
                        </span>
                      </div>
                    </div>

                    {m.wettest_day && (
                      <div className="text-[11px] text-slate-400 border-t border-slate-800/80 pt-2">
                        Våteste dag: <span className="text-slate-300 font-mono">{m.wettest_day}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Custom Date Interval Modal */}
      {showCustomRangeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div
            ref={customDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="custom-range-title"
            tabIndex={-1}
            className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl space-y-4 p-5 sm:p-6"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <CalendarRange className="w-5 h-5 text-sky-400" />
                <h3 id="custom-range-title" className="text-base font-bold text-white">Velg tidsperiode</h3>
              </div>
              <button
                type="button"
                onClick={closeCustomRange}
                aria-label="Lukk datointervall"
                className="text-slate-400 hover:text-white p-2.5 min-h-11 min-w-11 rounded-lg hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Preset Buttons */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Hurtigvalg</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const d = new Date();
                    d.setDate(d.getDate() - 14);
                    setCustomFromDate(toLocalDateValue(d));
                    setCustomToDate(toLocalDateValue(new Date()));
                  }}
                  className="px-3 py-2 rounded-xl bg-slate-800/70 hover:bg-slate-800 border border-slate-700/60 text-xs font-medium text-slate-200 text-left transition"
                >
                  Siste 14 dager
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const now = new Date();
                    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
                    setCustomFromDate(toLocalDateValue(firstDay));
                    setCustomToDate(toLocalDateValue(now));
                  }}
                  className="px-3 py-2 rounded-xl bg-slate-800/70 hover:bg-slate-800 border border-slate-700/60 text-xs font-medium text-slate-200 text-left transition"
                >
                  Denne måneden
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const now = new Date();
                    const prevFirst = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                    const prevLast = new Date(now.getFullYear(), now.getMonth(), 0);
                    setCustomFromDate(toLocalDateValue(prevFirst));
                    setCustomToDate(toLocalDateValue(prevLast));
                  }}
                  className="px-3 py-2 rounded-xl bg-slate-800/70 hover:bg-slate-800 border border-slate-700/60 text-xs font-medium text-slate-200 text-left transition"
                >
                  Forrige måned
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const now = new Date();
                    const jan1 = new Date(now.getFullYear(), 0, 1);
                    setCustomFromDate(toLocalDateValue(jan1));
                    setCustomToDate(toLocalDateValue(now));
                  }}
                  className="px-3 py-2 rounded-xl bg-slate-800/70 hover:bg-slate-800 border border-slate-700/60 text-xs font-medium text-slate-200 text-left transition"
                >
                  Hittil i år
                </button>
              </div>
            </div>

            {/* From & To Date Pickers */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="space-y-1">
                <label htmlFor="custom-range-from" className="text-xs text-slate-400 font-medium">Fra dato</label>
                <input
                  id="custom-range-from"
                  type="date"
                  value={customFromDate}
                  onChange={(e) => setCustomFromDate(e.target.value)}
                  className="w-full bg-slate-800/90 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-sky-500"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="custom-range-to" className="text-xs text-slate-400 font-medium">Til dato</label>
                <input
                  id="custom-range-to"
                  type="date"
                  value={customToDate}
                  onChange={(e) => setCustomToDate(e.target.value)}
                  className="w-full bg-slate-800/90 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-sky-500"
                />
              </div>
            </div>

            {customRangeError && <p role="alert" className="rounded-xl border border-rose-800/60 bg-rose-950/40 p-3 text-xs text-rose-200">{customRangeError}</p>}

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={closeCustomRange}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 transition"
              >
                Avbryt
              </button>
              <button
                type="button"
                onClick={handleApplyCustomRange}
                className="px-5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-xs font-bold text-white shadow-md shadow-sky-600/30 transition flex items-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Bruk periode</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Day Explorer Drill-down Modal - Mobile Optimized */}
      {selectedDate && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in duration-200">
          <div
            ref={dayDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="day-details-title"
            tabIndex={-1}
            className="bg-slate-900 border border-slate-700 rounded-t-2xl sm:rounded-2xl w-full max-w-2xl max-h-[90vh] sm:max-h-[85vh] overflow-hidden shadow-2xl flex flex-col animate-in slide-in-from-bottom duration-200"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-900/90 shrink-0">
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-sky-400" />
                <div>
                  <h2 id="day-details-title" className="text-base font-bold text-white">Dagsutdrag</h2>
                  <p className="text-[11px] text-slate-400">
                    {formatNorwegianDate(new Date(selectedDate), { dateStyle: 'full' })}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeDayDetails}
                aria-label="Lukk dagsutdrag"
                className="text-slate-400 hover:text-white p-2.5 min-h-11 min-w-11 rounded-xl hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-4 sm:p-6 overflow-y-auto space-y-4">
              {loadingDay ? (
                <div className="py-16 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
                  <Clock className="w-6 h-6 animate-spin text-sky-400" />
                  <span className="text-xs">Laster 24-timers detaljer...</span>
                </div>
              ) : dayError ? (
                <div className="py-12 text-center">
                  <p role="alert" className="text-sm text-rose-300">{dayError}</p>
                  <button type="button" onClick={() => handleOpenDay(selectedDate)} className="mt-4 min-h-11 rounded-xl bg-sky-600 px-4 py-2 text-sm font-bold text-white">Prøv på nytt</button>
                </div>
              ) : dayDetails ? (
                <>
                  {dayDetails.summary && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700/60">
                        <span className="text-[10px] sm:text-[11px] text-slate-400 block">Min / Snitt / Maks</span>
                        <span className="text-xs sm:text-sm font-bold text-white font-mono">
                          {formatMetric(dayDetails.summary.temperature_min, '°')} /{' '}
                          {formatMetric(dayDetails.summary.temperature_avg, '°')} /{' '}
                          {formatMetric(dayDetails.summary.temperature_max, '°')}
                        </span>
                      </div>
                      <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700/60">
                        <span className="text-[10px] sm:text-[11px] text-slate-400 block">Døgnnedbør</span>
                        <span className="text-xs sm:text-sm font-bold text-cyan-400 font-mono">
                          {formatMetric(dayDetails.summary.precipitation_total, ' mm')}
                        </span>
                      </div>
                      <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700/60">
                        <span className="text-[10px] sm:text-[11px] text-slate-400 block">Vind & Dom. retning</span>
                        <span className="text-xs sm:text-sm font-bold text-sky-300 font-mono block">
                          {formatMetric(dayDetails.summary.wind_avg, ' m/s')} /{' '}
                          {formatMetric(dayDetails.summary.wind_gust_max, ' m/s')}
                        </span>
                        {(dayDetails.summary.wind_dominant_cardinal || typeof dayDetails.summary.wind_dominant_direction === 'number') && (
                          <span className="text-[10px] text-slate-300 font-mono flex items-center gap-1 mt-0.5">
                            {typeof dayDetails.summary.wind_dominant_direction === 'number' && (
                              <span
                                className="text-sky-400 font-bold inline-block"
                                style={{
                                  transform: `rotate(${(dayDetails.summary.wind_dominant_direction + 180) % 360}deg)`,
                                }}
                              >
                                ↑
                              </span>
                            )}
                            <span>
                              {dayDetails.summary.wind_dominant_cardinal || getWindDirectionCardinal8(dayDetails.summary.wind_dominant_direction)}
                              {dayDetails.summary.wind_dominant_direction !== null && dayDetails.summary.wind_dominant_direction !== undefined ? ` (${dayDetails.summary.wind_dominant_direction}°)` : ''}
                            </span>
                          </span>
                        )}
                      </div>
                      <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700/60">
                        <span className="text-[10px] sm:text-[11px] text-slate-400 block">Lufttrykk</span>
                        <span className="text-xs sm:text-sm font-bold text-slate-200 font-mono">
                          {dayDetails.summary.pressure_min !== null && dayDetails.summary.pressure_max !== null
                            ? `${formatNorwegianNumber(dayDetails.summary.pressure_min, 0)}–${formatNorwegianNumber(dayDetails.summary.pressure_max, 0)} hPa`
                            : 'Ikke tilgjengelig'}
                        </span>
                      </div>
                    </div>
                  )}

                  <h4 className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider pt-1">
                    Timesobservasjoner gjennom døgnet
                  </h4>

                  <div className="overflow-x-auto rounded-xl border border-slate-800">
                    <table className="w-full text-left text-xs text-slate-300 font-mono">
                      <thead className="bg-slate-800/80 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-700">
                        <tr>
                          <th className="py-2.5 px-3">Kl.</th>
                          <th className="py-2.5 px-3">Temp</th>
                          <th className="py-2.5 px-3">Nedbør</th>
                          <th className="py-2.5 px-3">Vind</th>
                          <th className="py-2.5 px-3">Retning</th>
                          <th className="py-2.5 px-3">Kast</th>
                          <th className="py-2.5 px-3">Trykk</th>
                          <th className="py-2.5 px-3">Fukt</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/80">
                        {dayDetails.hourly?.map((h: any, idx: number) => (
                          <tr key={idx} className="hover:bg-slate-800/40">
                            <td className="py-2 px-3 font-semibold text-white">{h.hour_display}</td>
                            <td className="py-2 px-3 font-bold text-amber-300">
                              {formatMetric(h.temperature, ' °C')}
                            </td>
                            <td className="py-2 px-3 text-cyan-400 font-semibold">
                              {h.precipitation !== null && h.precipitation !== undefined
                                ? `${formatNorwegianNumber(h.precipitation, 1)} mm`
                                : 'Ikke tilgjengelig'}
                            </td>
                            <td className="py-2 px-3 text-sky-300">
                              {formatMetric(h.wind_speed, ' m/s')}
                            </td>
                            <td className="py-2 px-3 text-sky-200">
                              <span className="flex items-center gap-1">
                                {h.wind_direction !== null && h.wind_direction !== undefined && (
                                  <span
                                    className="text-sky-400 font-bold inline-block"
                                    style={{
                                      transform: `rotate(${(h.wind_direction + 180) % 360}deg)`,
                                    }}
                                  >
                                    ↑
                                  </span>
                                )}
                                <span>{h.wind_cardinal || (h.wind_direction !== null ? getWindDirectionCardinal8(h.wind_direction) : 'Ikke tilgjengelig')}</span>
                                {h.wind_direction !== null && h.wind_direction !== undefined && (
                                  <span className="text-[10px] text-slate-400">({h.wind_direction}°)</span>
                                )}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-amber-400">
                              {formatMetric(h.wind_gust, ' m/s')}
                            </td>
                            <td className="py-2 px-3 text-slate-300">{formatMetric(h.pressure, ' hPa', 0)}</td>
                            <td className="py-2 px-3 text-blue-300">{formatMetric(h.humidity, ' %', 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : null}
            </div>

            {/* Modal Bottom Action for Mobile */}
            <div className="p-3 border-t border-slate-800 bg-slate-900 flex justify-end shrink-0 sm:hidden">
              <button
                type="button"
                onClick={closeDayDetails}
                className="w-full py-2.5 rounded-xl bg-slate-800 text-xs font-bold text-white hover:bg-slate-700 transition"
              >
                Lukk dagsutdrag
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
