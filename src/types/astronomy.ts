export type SkyConditionCategory =
  | 'DAG'
  | 'BORGERLIG_SKUMRING'
  | 'NAUTISK_SKUMRING'
  | 'ASTRONOMISK_SKUMRING'
  | 'NATT';

export type MoonPhaseName =
  | 'Nymåne'
  | 'Tiltagende sigd'
  | 'Første kvarter'
  | 'Tiltagende måne'
  | 'Fullmåne'
  | 'Avtagende måne'
  | 'Siste kvarter'
  | 'Avtagende sigd';

export interface CelestialPosition {
  altitude: number; // degrees above horizon (-90 to +90)
  azimuth: number; // degrees (0 = North, 90 = East, 180 = South, 270 = West)
  cardinalDirection: string; // e.g. "SØ", "SV", "N"
  isAboveHorizon: boolean;
}

export interface MoonIlluminationData {
  fraction: number; // 0.0 to 1.0 (e.g. 0.86)
  percentage: number; // 0 to 100
  phaseAngle: number; // degrees 0..360 (0=New, 90=1st Qtr, 180=Full, 270=3rd Qtr)
  phaseName: MoonPhaseName;
  moonAgeDays: number; // 0.0 to 29.53
}

export interface TwilightTimes {
  // Morning (dawn)
  astronomicalDawn: string | null;
  nauticalDawn: string | null;
  civilDawn: string | null;
  sunrise: string | null;

  // Solar Noon
  solarNoon: string | null;
  maxSunAltitude: number;

  // Evening (dusk)
  sunset: string | null;
  civilDusk: string | null;
  nauticalDusk: string | null;
  astronomicalDusk: string | null;

  // Special conditions
  isPolarDay: boolean; // Midnight sun
  isPolarNight: boolean; // Polar night (sun never rises)
  noTrueNight: boolean; // Sun never goes below -18°
  polarDayNote?: string;
}

export interface DarknessDurations {
  sunBelowHorizonMinutes: number; // Sun < 0°
  sunBelowCivilMinutes: number; // Sun < -6°
  sunBelowNauticalMinutes: number; // Sun < -12°
  sunBelowAstronomicalMinutes: number; // Sun < -18° (True night)
}

export interface DayAstronomySummary {
  date: string; // YYYY-MM-DD
  latitude: number;
  longitude: number;
  altitudeMoh: number;
  timezone: string;

  // Sun
  sun: {
    sunrise: string | null;
    sunset: string | null;
    solarNoon: string | null;
    dayLengthMinutes: number;
    dayLengthFormatted: string; // e.g. "15 t 16 min"
    dayLengthDiffYesterdayMinutes: number;
    dayLengthDiffYesterdayFormatted: string; // e.g. "+3 min 12 sek" or "-4 min 37 sek"
    currentAltitude: number;
    currentAzimuth: number;
    currentDirection: string;
    maxAltitude: number;
    twilight: TwilightTimes;
    darkness: DarknessDurations;
  };

  // Moon
  moon: {
    moonrise: string | null;
    moonset: string | null;
    moonTransit: string | null; // Culmination time
    maxAltitude: number; // Altitude at culmination
    azimuthAtCulmination: number;
    directionAtCulmination: string;
    currentAltitude: number;
    currentAzimuth: number;
    currentDirection: string;
    illumination: MoonIlluminationData;
    isAlwaysAboveHorizon: boolean;
    isAlwaysBelowHorizon: boolean;
    nextFullMoonDate: string; // e.g. "27. august"
    nextNewMoonDate: string;
  };

  // Night conditions
  nightConditions: {
    moonIlluminationPct: number;
    moonIntervalOverHorizon: string; // e.g. "19:42–03:18" or "Under horisonten"
    maxNightMoonAltitude: number;
    darkestMoonlessWindow: string; // e.g. "03:18–05:07" or "Ingen mørk periode"
  };
}

export interface HourlyAstronomyPoint {
  time: string; // ISO
  displayTime: string; // "14:30"
  minutesFromMidnight: number; // elapsed minutes in the local civil day (1380/1440/1500 on DST days)
  sunAltitude: number;
  sunAzimuth: number;
  sunDirection: string;
  isSunAboveHorizon: boolean;
  moonAltitude: number;
  moonAzimuth: number;
  moonDirection: string;
  isMoonAboveHorizon: boolean;
  moonIlluminationPct: number;
  skyCondition: SkyConditionCategory;
  skyConditionLabel: string; // "Dag", "Borgerlig skumring", etc.
  // Optional weather overlays if available
  temperature?: number | null;
  cloudCoverPct?: number | null;
  precipitationMm?: number | null;
  symbolCode?: string | null;
}

export interface MonthMoonDay {
  date: string; // YYYY-MM-DD
  dayNumber: number;
  dayOfWeek: number; // 0=Sun, 1=Mon, ..., 6=Sat
  phaseName: MoonPhaseName;
  phaseAngle: number;
  illuminationFraction: number;
  illuminationPct: number;
  moonAgeDays: number;
  moonrise: string | null;
  moonset: string | null;
  culminationTime: string | null;
  maxAltitude: number;
  azimuthAtCulmination: number;
  directionAtCulmination: string;
  isAlwaysAboveHorizon: boolean;
  isAlwaysBelowHorizon: boolean;
  isCurrentDay: boolean;
}

export interface UpcomingMoonPhase {
  quarterIndex: number; // 0=New, 1=1st Qtr, 2=Full, 3=3rd Qtr
  phaseName: MoonPhaseName;
  date: string; // ISO
  displayDate: string; // "12. august 2026"
  displayTime: string; // "04:19"
}

export interface YearlySunAnalysisPoint {
  date: string; // YYYY-MM-DD
  dayOfYear: number;
  displayDate: string; // "18. aug"
  daylightHours: number; // decimal hours (e.g. 15.26)
  daylightFormatted: string; // "15 t 16 min"
  maxSunAltitude: number; // degrees
  isToday: boolean;
  isSolsticeOrEquinox?: 'MAR_EQUINOX' | 'JUN_SOLSTICE' | 'SEP_EQUINOX' | 'DEC_SOLSTICE' | null;
  solsticeEquinoxLabel?: string;
}

export interface YearlySunAnalysisData {
  year: number;
  points: YearlySunAnalysisPoint[];
  longestDay: { date: string; displayDate: string; hours: number; formatted: string };
  shortestDay: { date: string; displayDate: string; hours: number; formatted: string };
  maxSunAltitudeAnnual: { date: string; displayDate: string; altitude: number };
  minSunAltitudeAnnual: { date: string; displayDate: string; altitude: number };
  seasons: {
    springEquinox: { date: string; displayDate: string; displayTime: string };
    summerSolstice: { date: string; displayDate: string; displayTime: string };
    autumnEquinox: { date: string; displayDate: string; displayTime: string };
    winterSolstice: { date: string; displayDate: string; displayTime: string };
  };
}

export interface AstronomyWeatherCorrelation {
  tonightObservation: {
    hasForecast: boolean;
    moonIlluminationPct: number;
    moonrise: string | null;
    moonAltitudeTonight: number; // e.g. at 23:00
    cloudCoverTonightPct: number | null;
    precipitationTonightMm: number | null;
    observationRating: 'EXCELLENT' | 'GOOD' | 'MODERATE' | 'POOR' | 'UNKNOWN';
    ratingBadge: string; // "Gode observasjonsforhold"
    description: string; // "Månen er synlig astronomisk, men skydekke forventes å være 94 %."
  };
  sunObservation: {
    hasForecast: boolean;
    sunrise: string | null;
    cloudCoverSunrisePct: number | null;
    precipSunriseMm: number | null;
    sunset: string | null;
    cloudCoverSunsetPct: number | null;
    precipSunsetMm: number | null;
    sunriseGoldenHour: string | null;
    sunsetGoldenHour: string | null;
    summaryText: string;
  };
}

export interface AstronomyPayload {
  location: {
    id: string;
    name: string;
    latitude: number;
    longitude: number;
    altitude: number | null;
    timezone: string;
  };
  selectedDate: string;
  daySummary: DayAstronomySummary;
  hourly24h: HourlyAstronomyPoint[];
  monthMoonDays: MonthMoonDay[];
  upcomingPhases: UpcomingMoonPhase[];
  yearlyData?: YearlySunAnalysisData;
  weatherCorrelation: AstronomyWeatherCorrelation;
}

export interface CelestialArcPoint {
  time: string; // ISO string
  minutesFromMidnight: number; // elapsed minutes in the local civil day
  displayTime: string; // "14:30"
  altitude: number; // -90 to +90
  azimuth: number; // 0 to 360
  isAboveHorizon: boolean;
}

export interface SkyArcData {
  date: string;
  latitude: number;
  longitude: number;
  sunArc: CelestialArcPoint[];
  moonArc: CelestialArcPoint[];
  summerSolsticeSunArc?: CelestialArcPoint[];
  winterSolsticeSunArc?: CelestialArcPoint[];
  sunrisePoint?: CelestialArcPoint;
  sunsetPoint?: CelestialArcPoint;
  solarNoonPoint?: CelestialArcPoint;
  moonrisePoint?: CelestialArcPoint;
  moonsetPoint?: CelestialArcPoint;
  moonCulminationPoint?: CelestialArcPoint;
}

export type ARFilterLevel = 'ultra' | 'high' | 'medium' | 'off';

export type AROrientationSensorSource =
  | 'ios'
  | 'absolute-event'
  | 'absolute'
  | 'relative'
  | 'none';

export interface AROrientationState {
  heading: number; // Compass azimuth 0..360 (0=North, 90=East, 180=South, 270=West)
  pitch: number; // Tilt up/down in degrees (-90 to +90, 0=horizontal, +90=pointing zenith straight up)
  roll: number; // Screen roll in degrees (-180 to +180)
  fov: number; // Horizontal field of view in degrees (typically 60-70)
  isSupported: boolean;
  permissionGranted: boolean;
  isVirtual: boolean;
  isNorthReferenced: boolean; // False when the browser only exposes an arbitrary relative frame
  isStable?: boolean; // True when camera is held steady on target
}

export interface ARCalibrationSettings {
  headingOffset: number; // -180 to +180 deg manual adjustment
  pitchOffset: number; // -45 to +45 deg manual adjustment
  showSunArc: boolean;
  showMoonArc: boolean;
  showSolstices: boolean;
  showHourMarks: boolean;
  showCompassCardinals: boolean;
  showHorizonLine: boolean;
  filterLevel?: ARFilterLevel; // Sensor interference suppression level ('ultra' | 'high' | 'medium' | 'off')
  deadbandDegrees?: number; // Hysteresis threshold in degrees (e.g. 0.2 to 2.5, default 0.8)
}
