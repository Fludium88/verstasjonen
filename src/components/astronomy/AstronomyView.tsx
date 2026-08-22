'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { AstronomyPayload } from '@/types/astronomy';
import { MoonPhaseIcon } from './MoonPhaseIcon';
import { SunMoonElevationChart } from './SunMoonElevationChart';
import { TimeSliderAndCompass } from './TimeSliderAndCompass';
import { MoonCalendarView } from './MoonCalendarView';
import { YearlySunAnalysis } from './YearlySunAnalysis';
import { SunMoonARModal } from './SunMoonARModal';
import {
  Sun,
  Moon,
  Clock,
  Calendar,
  Compass,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Sparkles,
  Eye,
  Camera,
  MapPin,
  Cloud,
  Droplets,
  Layers,
  Info,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';

interface AstronomyViewProps {
  locationId: string;
}

const toLocalDateValue = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const AstronomyView: React.FC<AstronomyViewProps> = ({ locationId }) => {
  const [data, setData] = useState<AstronomyPayload | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    return toLocalDateValue(new Date());
  });
  const [selectedYear, setSelectedYear] = useState<number>(() => new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(() => new Date().getMonth() + 1);
  const [isARModalOpen, setIsARModalOpen] = useState<boolean>(false);
  const [retryRevision, setRetryRevision] = useState(0);

  // Time slider state (minutes from 00:00, e.g. now)
  const [sliderMinutes, setSliderMinutes] = useState<number>(() => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  });

  const fetchAstronomyData = useCallback(
    async (dateStr: string, year: number, month: number, signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/astronomy?locationId=${locationId}&date=${dateStr}&year=${year}&month=${month}`,
          { cache: 'no-store', signal }
        );
        if (res.ok) {
          const json: AstronomyPayload = await res.json();
          if (!signal?.aborted) setData(json);
        } else {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error || 'Kunne ikke hente astronomidata.');
        }
      } catch (err: any) {
        if (signal?.aborted) return;
        console.error('Failed to load astronomy data:', err);
        setError(err?.message || 'Kunne ikke hente astronomidata.');
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [locationId]
  );

  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    void fetchAstronomyData(selectedDate, selectedYear, selectedMonth, controller.signal);
    return () => controller.abort();
  }, [fetchAstronomyData, selectedDate, selectedYear, selectedMonth, retryRevision]);

  const handlePrevDay = () => {
    const current = new Date(`${selectedDate}T12:00:00`);
    current.setDate(current.getDate() - 1);
    const newDateStr = toLocalDateValue(current);
    setSelectedDate(newDateStr);
    setSelectedYear(current.getFullYear());
    setSelectedMonth(current.getMonth() + 1);
  };

  const handleNextDay = () => {
    const current = new Date(`${selectedDate}T12:00:00`);
    current.setDate(current.getDate() + 1);
    const newDateStr = toLocalDateValue(current);
    setSelectedDate(newDateStr);
    setSelectedYear(current.getFullYear());
    setSelectedMonth(current.getMonth() + 1);
  };

  const handleResetToday = () => {
    const now = new Date();
    const todayStr = toLocalDateValue(now);
    setSelectedDate(todayStr);
    setSelectedYear(now.getFullYear());
    setSelectedMonth(now.getMonth() + 1);
    setSliderMinutes(now.getHours() * 60 + now.getMinutes());
  };

  const handleMonthChange = (year: number, month: number) => {
    setSelectedYear(year);
    setSelectedMonth(month);
  };

  const handleSelectDateFromCalendar = (dateStr: string) => {
    setSelectedDate(dateStr);
    const d = new Date(dateStr);
    setSelectedYear(d.getFullYear());
    setSelectedMonth(d.getMonth() + 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const isViewingToday = selectedDate === toLocalDateValue(new Date());

  // Format date header
  const formattedDateTitle = data
    ? new Intl.DateTimeFormat('nb-NO', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(new Date(selectedDate))
    : selectedDate;

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-slate-400 space-y-3">
        <Clock className="w-8 h-8 animate-spin text-sky-400" />
        <p className="text-sm font-medium">Beregner astronomiske koordinater og lysforhold...</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="mx-auto my-16 max-w-lg rounded-2xl border border-rose-800/60 bg-rose-950/30 p-7 text-center">
        <AlertTriangle className="mx-auto h-8 w-8 text-rose-400" />
        <p role="alert" className="mt-3 text-sm text-slate-200">{error}</p>
        <button
          type="button"
          onClick={() => setRetryRevision((revision) => revision + 1)}
          className="mt-4 min-h-11 rounded-xl bg-sky-600 px-4 py-2 text-sm font-bold text-white"
        >
          <RefreshCw className="mr-2 inline h-4 w-4" />Prøv på nytt
        </button>
      </div>
    );
  }

  if (!data) return null;

  const { daySummary, hourly24h, monthMoonDays, upcomingPhases, yearlyData, weatherCorrelation, location } = data;
  const { sun, moon, nightConditions } = daySummary;

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* ─── PAGE HEADER & CONTROLS ─── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/80 border border-slate-800/80 rounded-2xl p-4 sm:p-5 shadow-xl backdrop-blur-md">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
              <span className="bg-gradient-to-r from-amber-400 via-sky-300 to-indigo-300 bg-clip-text text-transparent">
                Sol & måne
              </span>
            </h1>
            <span className="text-xs px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-400 border border-sky-500/30 font-medium">
              Astronomisk telemetri
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400 mt-1">
            <span className="flex items-center gap-1 text-slate-300 font-semibold">
              <MapPin className="w-3.5 h-3.5 text-sky-400" />
              {location.name}
            </span>
            <span>•</span>
            <span>{location.latitude.toFixed(4)}°N, {location.longitude.toFixed(4)}°Ø</span>
            <span>•</span>
            <span>{location.altitude === null || location.altitude === undefined ? 'Ukjent høyde' : `${location.altitude} moh`}</span>
          </div>
        </div>

        {/* Date Navigator */}
        <div className="flex max-w-full flex-wrap items-center gap-2 self-start md:self-auto">
          <div className="flex items-center bg-slate-950/80 border border-slate-800 rounded-xl p-1 shadow-inner">
            <button
              onClick={handlePrevDay}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              title="Forrige dag"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-3 text-xs font-bold text-slate-100 min-w-[140px] text-center capitalize">
              {formattedDateTitle}
            </span>
            <button
              onClick={handleNextDay}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              title="Neste dag"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {!isViewingToday && (
            <button
              onClick={handleResetToday}
              className="px-3 py-2 rounded-xl bg-sky-600/30 hover:bg-sky-600/50 border border-sky-500/40 text-sky-300 text-xs font-semibold transition flex items-center gap-1.5"
              title="Gå til i dag"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>I dag</span>
            </button>
          )}
        </div>
      </div>

      {/* ─── AR SKY CAMERA BANNER ─── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-amber-500/10 via-sky-500/15 to-indigo-500/15 border border-sky-500/30 p-4 sm:p-5 shadow-xl backdrop-blur-md flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start sm:items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 via-sky-400 to-indigo-500 p-0.5 shadow-lg shadow-sky-500/20 shrink-0">
            <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center text-sky-400">
              <Camera className="w-6 h-6 animate-pulse text-amber-400" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base sm:text-lg font-bold text-white tracking-wide">
                AR Himmelkamera & Sol-/Månebane
              </h2>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                Augmented Reality
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-0.5">
              Se solens og månens bane som buer direkte på mobilkameraet eller i virtuell himmelkuppel med sanntidssensorer.
            </p>
          </div>
        </div>

        <button
          onClick={() => setIsARModalOpen(true)}
          className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-amber-500 hover:from-sky-400 hover:to-amber-400 text-slate-950 font-bold text-xs sm:text-sm shadow-lg shadow-sky-500/25 hover:shadow-sky-500/40 transition flex items-center justify-center gap-2 shrink-0 cursor-pointer"
        >
          <Camera className="w-4 h-4" />
          <span>Åpne AR Himmelvisning</span>
        </button>
      </div>

      {/* ─── 1. TOP SUMMARY CARDS (SOL & MÅNE) ─── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* SOL CARD */}
        <div className="bg-gradient-to-br from-amber-950/20 via-slate-900/80 to-slate-900/60 border border-amber-500/30 rounded-2xl p-5 shadow-xl backdrop-blur-sm space-y-4">
          <div className="flex items-center justify-between border-b border-amber-500/20 pb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shadow-md shadow-amber-900/30">
                <Sun className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white tracking-wide">Sol</h2>
                <span className="text-xs text-amber-400 font-medium">
                  {sun.twilight.isPolarDay
                    ? 'Midnattssol'
                    : sun.twilight.isPolarNight
                    ? 'Mørketid'
                    : `Dagslys: ${sun.dayLengthFormatted}`}
                </span>
              </div>
            </div>

            {/* Current Sun Altitude Badge */}
            <div className="text-right">
              <span className="text-[11px] text-slate-400 block">Solhøyde nå</span>
              <span className={`text-base font-mono font-bold ${sun.currentAltitude >= 0 ? 'text-amber-300' : 'text-slate-400'}`}>
                {sun.currentAltitude > 0 ? `+${sun.currentAltitude}°` : `${sun.currentAltitude}°`}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800">
              <span className="text-slate-400 text-[11px] block">Soloppgang</span>
              <span className="font-mono font-bold text-white text-base">
                {sun.sunrise || '–'}
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800">
              <span className="text-slate-400 text-[11px] block">Solar noon</span>
              <span className="font-mono font-bold text-white text-base">
                {sun.solarNoon || '–'}
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800">
              <span className="text-slate-400 text-[11px] block">Solnedgang</span>
              <span className="font-mono font-bold text-white text-base">
                {sun.sunset || '–'}
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800">
              <span className="text-slate-400 text-[11px] block">Maks solhøyde</span>
              <span className="font-mono font-bold text-amber-300 text-base">
                +{sun.maxAltitude}°
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs pt-1 px-1 text-slate-400 border-t border-slate-800/80">
            <span>Dagslengde: <strong className="text-slate-200 font-mono">{sun.dayLengthFormatted}</strong></span>
            <span>
              Fra i går:{' '}
              <strong
                className={`font-mono ${
                  sun.dayLengthDiffYesterdayMinutes > 0
                    ? 'text-emerald-400'
                    : sun.dayLengthDiffYesterdayMinutes < 0
                    ? 'text-rose-400'
                    : 'text-slate-300'
                }`}
              >
                {sun.dayLengthDiffYesterdayFormatted}
              </strong>
            </span>
          </div>
        </div>

        {/* MÅNE CARD */}
        <div className="bg-gradient-to-br from-sky-950/20 via-slate-900/80 to-slate-900/60 border border-sky-500/30 rounded-2xl p-5 shadow-xl backdrop-blur-sm space-y-4">
          <div className="flex items-center justify-between border-b border-sky-500/20 pb-3">
            <div className="flex items-center gap-3">
              <MoonPhaseIcon
                fraction={moon.illumination.fraction}
                phaseAngle={moon.illumination.phaseAngle}
                size={42}
              />
              <div>
                <h2 className="text-base font-bold text-white tracking-wide">Måne</h2>
                <span className="text-xs text-sky-400 font-semibold">
                  {moon.illumination.phaseName} ({moon.illumination.percentage} % belyst)
                </span>
              </div>
            </div>

            {/* Current Moon Altitude Badge */}
            <div className="text-right">
              <span className="text-[11px] text-slate-400 block">Månehøyde nå</span>
              <span className={`text-base font-mono font-bold ${moon.currentAltitude >= 0 ? 'text-sky-300' : 'text-slate-400'}`}>
                {moon.currentAltitude > 0 ? `+${moon.currentAltitude}°` : `${moon.currentAltitude}°`}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800">
              <span className="text-slate-400 text-[11px] block">Måneoppgang</span>
              <span className="font-mono font-bold text-white text-base">
                {moon.moonrise || '–'}
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800">
              <span className="text-slate-400 text-[11px] block">Månenedgang</span>
              <span className="font-mono font-bold text-white text-base">
                {moon.moonset || '–'}
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800">
              <span className="text-slate-400 text-[11px] block">Månealder</span>
              <span className="font-mono font-bold text-white text-base">
                {moon.illumination.moonAgeDays} dager
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800">
              <span className="text-slate-400 text-[11px] block">Maks månehøyde</span>
              <span className="font-mono font-bold text-sky-300 text-base">
                +{moon.maxAltitude}°
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs pt-1 px-1 text-slate-400 border-t border-slate-800/80">
            <span>Kulminasjon: <strong className="text-slate-200 font-mono">{moon.moonTransit || '–'} ({moon.directionAtCulmination})</strong></span>
            <span>Neste fullmåne: <strong className="text-sky-300">{moon.nextFullMoonDate || '–'}</strong></span>
          </div>
        </div>
      </div>

      {/* ─── 2. 24H ELEVATION CHART ─── */}
      <SunMoonElevationChart
        data={hourly24h}
        isToday={isViewingToday}
        selectedTimeMinutes={sliderMinutes}
        onTimeSelect={(mins) => setSliderMinutes(mins)}
      />

      {/* ─── 3. TIME SLIDER & REALTIME COMPASS ─── */}
      <TimeSliderAndCompass
        hourlyPoints={hourly24h}
        selectedMinutes={sliderMinutes}
        onTimeChange={setSliderMinutes}
        isToday={isViewingToday}
        sunriseTime={sun.sunrise}
        sunsetTime={sun.sunset}
        solarNoonTime={sun.solarNoon}
      />

      {/* ─── 4. MOON CALENDAR (MONTHLY ANALYSIS) ─── */}
      <MoonCalendarView
        monthDays={monthMoonDays}
        currentYear={selectedYear}
        currentMonth={selectedMonth}
        onMonthChange={handleMonthChange}
        onSelectDate={handleSelectDateFromCalendar}
        selectedDateStr={selectedDate}
      />

      {/* ─── 5. SKUMRING, MØRKE & KOMMENDE MÅNEFASER ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* SKUMRINGSTABELL */}
        <div className="bg-slate-900/70 border border-slate-800/80 rounded-2xl p-5 shadow-xl backdrop-blur-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-orange-400" />
              <span>Skumringsfaser</span>
            </h3>
            <span className="text-[11px] text-slate-400">Astronomisk standard</span>
          </div>

          <div className="space-y-3 text-xs">
            {/* Morgen */}
            <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
              <span className="font-bold text-amber-300 block text-xs uppercase tracking-wider">
                Morgen
              </span>
              <div className="space-y-1.5 font-medium">
                <div className="flex justify-between">
                  <span className="text-slate-400">Astronomisk skumring (-18°):</span>
                  <span className="font-mono text-white">{sun.twilight.astronomicalDawn || '–'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Nautisk skumring (-12°):</span>
                  <span className="font-mono text-white">{sun.twilight.nauticalDawn || '–'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Borgerlig skumring (-6°):</span>
                  <span className="font-mono text-white">{sun.twilight.civilDawn || '–'}</span>
                </div>
                <div className="flex justify-between font-bold border-t border-slate-800/60 pt-1">
                  <span className="text-amber-400">Soloppgang (0°):</span>
                  <span className="font-mono text-amber-300">{sun.twilight.sunrise || '–'}</span>
                </div>
              </div>
            </div>

            {/* Kveld */}
            <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
              <span className="font-bold text-indigo-300 block text-xs uppercase tracking-wider">
                Kveld
              </span>
              <div className="space-y-1.5 font-medium">
                <div className="flex justify-between font-bold">
                  <span className="text-amber-400">Solnedgang (0°):</span>
                  <span className="font-mono text-amber-300">{sun.twilight.sunset || '–'}</span>
                </div>
                <div className="flex justify-between border-t border-slate-800/60 pt-1">
                  <span className="text-slate-400">Borgerlig skumring slutt (-6°):</span>
                  <span className="font-mono text-white">{sun.twilight.civilDusk || '–'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Nautisk skumring slutt (-12°):</span>
                  <span className="font-mono text-white">{sun.twilight.nauticalDusk || '–'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Astronomisk skumring slutt (-18°):</span>
                  <span className="font-mono text-white">{sun.twilight.astronomicalDusk || '–'}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* MØRKE-KORT */}
        <div className="bg-slate-900/70 border border-slate-800/80 rounded-2xl p-5 shadow-xl backdrop-blur-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Eye className="w-4 h-4 text-indigo-400" />
              <span>Mørkeanalyse</span>
            </h3>
            <span className="text-[11px] text-slate-400">Jakt & Foto</span>
          </div>

          <div className="space-y-2.5 text-xs">
            <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-slate-300 font-semibold block">Sol under horisonten</span>
                <span className="text-slate-500 text-[10px]">Total natt + skumring (&lt; 0°)</span>
              </div>
              <span className="font-mono font-bold text-white text-sm">
                {Math.floor(sun.darkness.sunBelowHorizonMinutes / 60)} t{' '}
                {sun.darkness.sunBelowHorizonMinutes % 60} min
              </span>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-slate-300 font-semibold block">Sol under −6°</span>
                <span className="text-slate-500 text-[10px]">Godt mørke (gatelys påkrevd)</span>
              </div>
              <span className="font-mono font-bold text-white text-sm">
                {Math.floor(sun.darkness.sunBelowCivilMinutes / 60)} t{' '}
                {sun.darkness.sunBelowCivilMinutes % 60} min
              </span>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-slate-300 font-semibold block">Sol under −12°</span>
                <span className="text-slate-500 text-[10px]">Stjernehimmel synlig</span>
              </div>
              <span className="font-mono font-bold text-white text-sm">
                {Math.floor(sun.darkness.sunBelowNauticalMinutes / 60)} t{' '}
                {sun.darkness.sunBelowNauticalMinutes % 60} min
              </span>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-indigo-300 font-semibold block">Sol under −18°</span>
                <span className="text-slate-500 text-[10px]">Ekte astronomisk bekmørke</span>
              </div>
              <span className="font-mono font-bold text-indigo-400 text-sm">
                {Math.floor(sun.darkness.sunBelowAstronomicalMinutes / 60)} t{' '}
                {sun.darkness.sunBelowAstronomicalMinutes % 60} min
              </span>
            </div>
          </div>

          <p className="text-[11px] text-slate-400 leading-relaxed pt-1">
            Nyttig for jegere (skytelys), nattfotografering, nordlys/stjerneobservasjoner og planlegging av utearbeid.
          </p>
        </div>

        {/* KOMMENDE MÅNEFASER */}
        <div className="bg-slate-900/70 border border-slate-800/80 rounded-2xl p-5 shadow-xl backdrop-blur-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Moon className="w-4 h-4 text-sky-400" />
              <span>Kommende månefaser</span>
            </h3>
            <span className="text-[11px] text-slate-400">Neste 4 kvartaler</span>
          </div>

          <div className="space-y-2.5">
            {upcomingPhases.map((phase, idx) => (
              <div
                key={idx}
                className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between text-xs hover:border-slate-700 transition"
              >
                <div className="flex items-center gap-3">
                  <MoonPhaseIcon
                    fraction={
                      phase.quarterIndex === 0
                        ? 0.0
                        : phase.quarterIndex === 1
                        ? 0.5
                        : phase.quarterIndex === 2
                        ? 1.0
                        : 0.5
                    }
                    phaseAngle={phase.quarterIndex * 90}
                    size={28}
                  />
                  <div>
                    <span className="font-bold text-white block">{phase.phaseName}</span>
                    <span className="text-slate-400 text-[11px]">{phase.displayDate}</span>
                  </div>
                </div>
                <div className="font-mono text-sky-300 font-semibold text-xs">
                  Kl. {phase.displayTime}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ─── 6. ASTRONOMY + WEATHER INTEGRATION CARDS ─── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* MÅNEFORHOLD I NATT + SKYDEKKE */}
        <div className="bg-gradient-to-br from-indigo-950/20 via-slate-900/80 to-slate-900/60 border border-indigo-500/30 rounded-2xl p-5 shadow-xl backdrop-blur-sm space-y-4">
          <div className="flex items-center justify-between border-b border-indigo-500/20 pb-3">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                <Moon className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Måneforhold i natt</h3>
                <span className="text-xs text-slate-400">Astronomisk synlighet & værprognose</span>
              </div>
            </div>

            <span
              className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                weatherCorrelation.tonightObservation.observationRating === 'EXCELLENT' ||
                weatherCorrelation.tonightObservation.observationRating === 'GOOD'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : weatherCorrelation.tonightObservation.observationRating === 'POOR'
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
              }`}
            >
              {weatherCorrelation.tonightObservation.ratingBadge}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
            <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800">
              <span className="text-slate-400 text-[11px] block">Månebelysning</span>
              <span className="font-mono font-bold text-white text-sm">
                {nightConditions.moonIlluminationPct} %
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800">
              <span className="text-slate-400 text-[11px] block">Over horisonten</span>
              <span className="font-mono font-bold text-sky-300 text-sm">
                {nightConditions.moonIntervalOverHorizon}
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800">
              <span className="text-slate-400 text-[11px] block">Maks høyde i natt</span>
              <span className="font-mono font-bold text-white text-sm">
                +{nightConditions.maxNightMoonAltitude}°
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800">
              <span className="text-slate-400 text-[11px] block">Skydekke i natt</span>
              <span className="font-mono font-bold text-white text-sm flex items-center gap-1">
                <Cloud className="w-3.5 h-3.5 text-slate-400" />
                {weatherCorrelation.tonightObservation.cloudCoverTonightPct != null
                  ? `${weatherCorrelation.tonightObservation.cloudCoverTonightPct} %`
                  : 'Ikke tilgjengelig'}
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 col-span-2">
              <span className="text-slate-400 text-[11px] block">Mørkeste periode uten måne</span>
              <span className="font-mono font-bold text-indigo-300 text-sm">
                {nightConditions.darkestMoonlessWindow}
              </span>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-indigo-950/40 border border-indigo-800/40 text-xs text-slate-300">
            {weatherCorrelation.tonightObservation.description}
          </div>
        </div>

        {/* SOLFORHOLD & FOTO-LYS */}
        <div className="bg-gradient-to-br from-amber-950/20 via-slate-900/80 to-slate-900/60 border border-amber-500/30 rounded-2xl p-5 shadow-xl backdrop-blur-sm space-y-4">
          <div className="flex items-center justify-between border-b border-amber-500/20 pb-3">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
                <Camera className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Sol- og fotoforhold</h3>
                <span className="text-xs text-slate-400">Gyllen time, soloppgang & solnedgang</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-amber-400 font-bold">Soloppgang</span>
                <span className="font-mono font-bold text-white">{sun.sunrise || '–'}</span>
              </div>
              <div className="text-[11px] text-slate-400 flex items-center justify-between">
                <span>Skydekke ved soloppgang:</span>
                <span className="text-slate-200 font-mono">
                  {weatherCorrelation.sunObservation.cloudCoverSunrisePct != null
                    ? `${weatherCorrelation.sunObservation.cloudCoverSunrisePct} %`
                    : '–'}
                </span>
              </div>
              <div className="text-[11px] text-slate-400 flex items-center justify-between">
                <span>Nedbør:</span>
                <span className="text-slate-200 font-mono">
                  {weatherCorrelation.sunObservation.precipSunriseMm != null
                    ? `${weatherCorrelation.sunObservation.precipSunriseMm} mm`
                    : '0 mm'}
                </span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-amber-400 font-bold">Solnedgang</span>
                <span className="font-mono font-bold text-white">{sun.sunset || '–'}</span>
              </div>
              <div className="text-[11px] text-slate-400 flex items-center justify-between">
                <span>Skydekke ved solnedgang:</span>
                <span className="text-slate-200 font-mono">
                  {weatherCorrelation.sunObservation.cloudCoverSunsetPct != null
                    ? `${weatherCorrelation.sunObservation.cloudCoverSunsetPct} %`
                    : '–'}
                </span>
              </div>
              <div className="text-[11px] text-slate-400 flex items-center justify-between">
                <span>Nedbør:</span>
                <span className="text-slate-200 font-mono">
                  {weatherCorrelation.sunObservation.precipSunsetMm != null
                    ? `${weatherCorrelation.sunObservation.precipSunsetMm} mm`
                    : '0 mm'}
                </span>
              </div>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-800/40 text-xs text-slate-300 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <span>{weatherCorrelation.sunObservation.summaryText}</span>
            <button
              onClick={() => setIsARModalOpen(true)}
              className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 font-semibold text-xs transition flex items-center gap-1.5 self-start sm:self-auto shrink-0"
            >
              <Camera className="w-3.5 h-3.5" />
              <span>Sjekk i AR</span>
            </button>
          </div>
        </div>
      </div>

      {/* ─── 7. YEARLY SUN ANALYSIS ─── */}
      {yearlyData && <YearlySunAnalysis yearlyData={yearlyData} />}

      {/* ─── 8. FULLSCREEN AR SKY CAMERA MODAL ─── */}
      <SunMoonARModal
        isOpen={isARModalOpen}
        onClose={() => setIsARModalOpen(false)}
        daySummary={daySummary}
        hourlyPoints={hourly24h}
        initialMinutes={sliderMinutes}
        initialDate={selectedDate}
        locationName={location.name}
      />
    </div>
  );
};
