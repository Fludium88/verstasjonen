'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  DayAstronomySummary,
  HourlyAstronomyPoint,
  SkyArcData,
  CelestialArcPoint,
  AROrientationState,
  ARCalibrationSettings,
  ARFilterLevel,
  AROrientationSensorSource,
} from '@/types/astronomy';
import { AstronomyService } from '@/services/astronomy/astronomyService';
import { SkyArcCanvas } from './SkyArcCanvas';
import { useAccessibleDialog } from '../common/useAccessibleDialog';
import {
  Camera,
  Compass,
  X,
  Play,
  Pause,
  RotateCcw,
  Sliders,
  Sun,
  Moon,
  ChevronLeft,
  ChevronRight,
  Eye,
  Info,
  Calendar,
  Sparkles,
  Target,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';

interface SunMoonARModalProps {
  isOpen: boolean;
  onClose: () => void;
  daySummary: DayAstronomySummary;
  hourlyPoints: HourlyAstronomyPoint[];
  initialMinutes?: number;
  initialDate?: string;
  locationName: string;
}

const STORAGE_CALIBRATION_KEY = 'vaerstasjonen_ar_calibration_v2';
const LEGACY_STORAGE_CALIBRATION_KEY = 'vaerstasjonen_ar_calibration_v1';
const DEFAULT_FILTER_LEVEL: ARFilterLevel = 'high';
const RAW_SENSOR_RING_SIZE = 24;
const DEFAULT_DEADBAND_BY_LEVEL: Record<Exclude<ARFilterLevel, 'off'>, number> = {
  ultra: 2.2,
  high: 1.5,
  medium: 0.7,
};

const toLocalDateValue = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const createDefaultCalibration = (): ARCalibrationSettings => ({
  headingOffset: 0,
  pitchOffset: 0,
  showSunArc: true,
  showMoonArc: true,
  showSolstices: true,
  showHourMarks: true,
  showCompassCardinals: true,
  showHorizonLine: true,
  filterLevel: DEFAULT_FILTER_LEVEL,
  deadbandDegrees: DEFAULT_DEADBAND_BY_LEVEL.high,
});

const readStoredCalibration = (): ARCalibrationSettings => {
  const defaults = createDefaultCalibration();
  if (typeof window === 'undefined') return defaults;

  try {
    const current = localStorage.getItem(STORAGE_CALIBRATION_KEY);
    const legacy = current ? null : localStorage.getItem(LEGACY_STORAGE_CALIBRATION_KEY);
    const saved = current ?? legacy;
    if (!saved) return defaults;

    const parsed = JSON.parse(saved);
    const filterLevel: ARFilterLevel = ['ultra', 'high', 'medium', 'off'].includes(parsed.filterLevel)
      ? parsed.filterLevel
      : DEFAULT_FILTER_LEVEL;
    const parsedDeadband = Number(parsed.deadbandDegrees);
    const validDeadband = Number.isFinite(parsedDeadband)
      ? Math.max(0.2, Math.min(3, parsedDeadband))
      : DEFAULT_DEADBAND_BY_LEVEL.high;

    // v1 stored 0.8 as an implicit default for every preset, which made even
    // "Maksimal" filtering too sensitive. Preserve deliberate custom values,
    // but migrate that legacy default to the new stable high preset.
    const deadbandDegrees = legacy && Math.abs(validDeadband - 0.8) < 0.001
      ? filterLevel === 'off'
        ? validDeadband
        : DEFAULT_DEADBAND_BY_LEVEL[filterLevel]
      : validDeadband;

    const finiteNumber = (value: unknown, fallback: number, min: number, max: number) => {
      const numeric = Number(value);
      return Number.isFinite(numeric) ? Math.max(min, Math.min(max, numeric)) : fallback;
    };
    const booleanValue = (value: unknown, fallback: boolean) =>
      typeof value === 'boolean' ? value : fallback;

    return {
      headingOffset: finiteNumber(parsed.headingOffset, 0, -180, 180),
      pitchOffset: finiteNumber(parsed.pitchOffset, 0, -45, 45),
      showSunArc: booleanValue(parsed.showSunArc, true),
      showMoonArc: booleanValue(parsed.showMoonArc, true),
      showSolstices: booleanValue(parsed.showSolstices, true),
      showHourMarks: booleanValue(parsed.showHourMarks, true),
      showCompassCardinals: booleanValue(parsed.showCompassCardinals, true),
      showHorizonLine: booleanValue(parsed.showHorizonLine, true),
      filterLevel,
      deadbandDegrees,
    };
  } catch (e) {
    console.warn('Failed to read AR calibration from localStorage:', e);
    return defaults;
  }
};

export const SunMoonARModal: React.FC<SunMoonARModalProps> = ({
  isOpen,
  onClose,
  daySummary,
  hourlyPoints,
  initialMinutes,
  initialDate,
  locationName,
}) => {
  const [selectedMinutes, setSelectedMinutes] = useState<number>(() => {
    if (initialMinutes !== undefined) return initialMinutes;
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  });

  const [selectedDate, setSelectedDate] = useState<string>(() => {
    return initialDate || toLocalDateValue(new Date());
  });

  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [needsIosPermission, setNeedsIosPermission] = useState<boolean>(false);
  const [calibrationToast, setCalibrationToast] = useState<string | null>(null);
  const [sensorType, setSensorType] = useState<'ios' | 'absolute' | 'relative' | 'none'>('none');
  const [sensorWarning, setSensorWarning] = useState<string | null>(null);

  // Calibration and display preferences
  const [calibration, setCalibration] = useState<ARCalibrationSettings>(readStoredCalibration);
  const calibrationRef = useRef<ARCalibrationSettings>(calibration);

  // Save calibration to localStorage on update
  useEffect(() => {
    calibrationRef.current = calibration;
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_CALIBRATION_KEY, JSON.stringify(calibration));
      } catch (e) {
        // ignore
      }
    }
  }, [calibration]);

  // Orientation State
  const [orientation, setOrientation] = useState<AROrientationState>({
    heading: 180, // Default pointing South
    pitch: 20, // Default looking slightly up
    roll: 0,
    fov: 65,
    isSupported: false,
    permissionGranted: false,
    isVirtual: true,
    isNorthReferenced: false,
    isStable: true,
  });

  // Display hysteresis state for rock-solid integer readouts without degree flickers
  const [displayHeading, setDisplayHeading] = useState<number>(180);
  const [displayPitch, setDisplayPitch] = useState<number>(20);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cameraActiveRef = useRef<boolean>(false);
  const cameraRequestIdRef = useRef<number>(0);
  const dialogRef = useAccessibleDialog<HTMLDivElement>(isOpen, onClose);
  const animationFrameRef = useRef<number | null>(null);
  const lastAnimationFrameTimeRef = useRef<number | null>(null);
  const rawHeadingRef = useRef<number>(180);
  const rawPitchRef = useRef<number>(20);
  const rawRollRef = useRef<number>(0);

  // Pre-filter ring buffer to eliminate single-tick spikes
  const rawSampleRingRef = useRef<Array<{ heading: number; pitch: number; roll: number; timestampMs?: number }>>([]);
  const activeSensorSourceRef = useRef<AROrientationSensorSource>('none');
  const candidateSensorSourceRef = useRef<AROrientationSensorSource>('none');
  const candidateSensorSamplesRef = useRef<Array<{ heading: number; pitch: number; roll: number; timestampMs?: number }>>([]);
  const lastCandidateSensorTimeRef = useRef<number>(Number.NEGATIVE_INFINITY);
  const lastAcceptedSensorTimeRef = useRef<number>(Number.NEGATIVE_INFINITY);
  const lastScreenAngleRef = useRef<number>(0);
  const hasSensorSampleRef = useRef<boolean>(false);
  const iosNorthOffsetRef = useRef<number | null>(null);
  const iosNorthOffsetCandidatesRef = useRef<Array<{ heading: number; timestampMs: number }>>([]);
  const lastIosNorthOffsetUpdateRef = useRef<number>(Number.NEGATIVE_INFINITY);
  const orientationWasMovingRef = useRef<boolean>(false);
  const orientationSettledSinceRef = useRef<number | null>(null);
  const orientationMovementAnchorRef = useRef<{ heading: number; pitch: number; roll: number }>({
    heading: 180,
    pitch: 20,
    roll: 0,
  });
  const sensorWarningRef = useRef<string | null>(null);
  const orientationSessionActiveRef = useRef<boolean>(false);
  const orientationPermissionRequestIdRef = useRef<number>(0);

  // Filtered values for smooth jitter-free rendering
  const filteredHeadingRef = useRef<number>(180);
  const filteredPitchRef = useRef<number>(20);
  const filteredRollRef = useRef<number>(0);
  const lastStateHeadingRef = useRef<number>(180);
  const lastStatePitchRef = useRef<number>(20);
  const lastStateRollRef = useRef<number>(0);
  const lastIsStableRef = useRef<boolean>(true);
  const displayedHeadingRef = useRef<number>(180);
  const displayedPitchRef = useRef<number>(20);
  const isDraggingRef = useRef<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number; heading: number; pitch: number }>({
    x: 0,
    y: 0,
    heading: 180,
    pitch: 20,
  });

  useEffect(() => {
    if (isOpen) {
      if (initialMinutes !== undefined) setSelectedMinutes(initialMinutes);
      if (initialDate) setSelectedDate(initialDate);
      setShowSettings(false);
    }
    setIsPlaying(false);
  }, [isOpen, initialMinutes, initialDate]);

  // ─────────────────────────────────────────────────────────────
  // 1. SKY ARCS DATA COMPUTATION
  // ─────────────────────────────────────────────────────────────
  const skyArcs: SkyArcData = React.useMemo(() => {
    return AstronomyService.calculateSkyArcs(
      daySummary.latitude,
      daySummary.longitude,
      daySummary.altitudeMoh,
      selectedDate,
      daySummary.timezone
    );
  }, [daySummary.latitude, daySummary.longitude, daySummary.altitudeMoh, selectedDate, daySummary.timezone]);

  // Compute active Sun & Moon point for the chosen minute
  const { activeSunPoint, activeMoonPoint, activeMoonIllum, currentRealSunPoint, currentRealMoonPoint } = React.useMemo(() => {
    const { startUtc } = AstronomyService.getLocalDayBounds(selectedDate, daySummary.timezone);
    const targetUtc = new Date(startUtc.getTime() + selectedMinutes * 60 * 1000);

    const sunPos = AstronomyService.calculateSunPosition(
      daySummary.latitude,
      daySummary.longitude,
      daySummary.altitudeMoh,
      targetUtc
    );

    const moonRes = AstronomyService.calculateMoonPosition(
      daySummary.latitude,
      daySummary.longitude,
      daySummary.altitudeMoh,
      targetUtc
    );

    // Also get current REAL-TIME sun and moon for accurate 1-tap calibration
    const realNow = new Date();
    const realSun = AstronomyService.calculateSunPosition(
      daySummary.latitude,
      daySummary.longitude,
      daySummary.altitudeMoh,
      realNow
    );
    const realMoon = AstronomyService.calculateMoonPosition(
      daySummary.latitude,
      daySummary.longitude,
      daySummary.altitudeMoh,
      realNow
    );

    const hour = Math.floor(selectedMinutes / 60);
    const min = selectedMinutes % 60;
    const displayTime = `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`;

    const sunPt: CelestialArcPoint = {
      time: targetUtc.toISOString(),
      minutesFromMidnight: selectedMinutes,
      displayTime,
      altitude: sunPos.altitude,
      azimuth: sunPos.azimuth,
      isAboveHorizon: sunPos.isAboveHorizon,
    };

    const moonPt: CelestialArcPoint = {
      time: targetUtc.toISOString(),
      minutesFromMidnight: selectedMinutes,
      displayTime,
      altitude: moonRes.position.altitude,
      azimuth: moonRes.position.azimuth,
      isAboveHorizon: moonRes.position.isAboveHorizon,
    };

    return {
      activeSunPoint: sunPt,
      activeMoonPoint: moonPt,
      activeMoonIllum: moonRes.illumination,
      currentRealSunPoint: realSun,
      currentRealMoonPoint: realMoon.position,
    };
  }, [selectedDate, selectedMinutes, daySummary]);

  // ─────────────────────────────────────────────────────────────
  // 2. TIME SIMULATION / PLAYBACK
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen || !isPlaying) return;
    const interval = setInterval(() => {
      setSelectedMinutes((prev) => {
        const next = prev + 5;
        if (next >= 1440) return 0;
        return next;
      });
    }, 100);
    return () => clearInterval(interval);
  }, [isOpen, isPlaying]);

  // ─────────────────────────────────────────────────────────────
  // 3. CAMERA ATTACHMENT & LIFECYCLE
  // ─────────────────────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setCameraError('Kamera er ikke støttet i denne nettleseren.');
      cameraActiveRef.current = false;
      setIsCameraActive(false);
      return;
    }

    const requestId = ++cameraRequestIdRef.current;
    try {
      setCameraError(null);
      // Request rear environment camera
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);

      // The modal may have closed (or a newer request may have started) while
      // the permission dialog was open. Never attach or leak that stale stream.
      if (requestId !== cameraRequestIdRef.current || document.visibilityState === 'hidden') {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true');
        videoRef.current.setAttribute('webkit-playsinline', 'true');
        videoRef.current.muted = true;
        try {
          await videoRef.current.play();
        } catch (playErr) {
          console.warn('Video play deferred until interaction:', playErr);
        }
      }
      if (requestId !== cameraRequestIdRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        if (streamRef.current === stream) streamRef.current = null;
        return;
      }
      cameraActiveRef.current = true;
      setIsCameraActive(true);
      setOrientation((prev) => ({ ...prev, isVirtual: false }));
    } catch (err: any) {
      if (requestId !== cameraRequestIdRef.current) return;
      console.warn('Camera access denied or failed:', err);
      let msg = 'Kunne ikke åpne bakkamera. Viser virtuell himmelkuppel.';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        msg = 'Kameratilgang ble ikke innvilget i nettleseren. Viser virtuell himmelkuppel.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        msg = 'Fant ingen tilgjengelig kameraenhet på denne maskinen.';
      }
      setCameraError(msg);
      cameraActiveRef.current = false;
      setIsCameraActive(false);
      setOrientation((prev) => ({ ...prev, isVirtual: true }));
    }
  }, []);

  const stopCamera = useCallback(() => {
    cameraRequestIdRef.current += 1;
    cameraActiveRef.current = false;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
    setOrientation((prev) => ({ ...prev, isVirtual: true }));
  }, []);

  // Ensure video element plays whenever stream or isCameraActive updates
  useEffect(() => {
    if (isCameraActive && streamRef.current && videoRef.current) {
      if (videoRef.current.srcObject !== streamRef.current) {
        videoRef.current.srcObject = streamRef.current;
      }
      videoRef.current.play().catch((e) => console.warn('Play retry err:', e));
    }
  }, [isCameraActive]);

  // ─────────────────────────────────────────────────────────────
  // 4. DEVICE ORIENTATION SENSORS
  // ─────────────────────────────────────────────────────────────
  const getScreenAngle = (): number => {
    if (typeof window === 'undefined') return 0;
    if (window.screen?.orientation?.angle !== undefined) {
      return window.screen.orientation.angle;
    }
    return (window.orientation as number) || 0;
  };

  const handleDeviceOrientationEvent = useCallback((event: DeviceOrientationEvent) => {
    // With the camera off, the dome is an explicitly manual view. Ignoring
    // sensors here prevents a relative device frame from being labelled north.
    if (!cameraActiveRef.current) return;

    const eventData = {
      alpha: event.alpha,
      beta: event.beta,
      gamma: event.gamma,
      webkitCompassHeading: (event as any).webkitCompassHeading,
      webkitCompassAccuracy: (event as any).webkitCompassAccuracy,
      absolute: (event as any).absolute,
    };
    const incomingSource = AstronomyService.classifyOrientationSensorSource(eventData, event.type);
    if (incomingSource === 'none') return;

    const eventTime = Number.isFinite(event.timeStamp) && event.timeStamp > 0
      ? event.timeStamp
      : performance.now();
    const compassAccuracy = eventData.webkitCompassAccuracy;
    const compassAccuracyIsReported = typeof compassAccuracy === 'number';
    const compassAccuracyIsInvalid = compassAccuracyIsReported &&
      (!Number.isFinite(compassAccuracy) || compassAccuracy < 0 || compassAccuracy > 45);
    const compassAnchorMayUpdate = !compassAccuracyIsReported ||
      (Number.isFinite(compassAccuracy) && compassAccuracy >= 0 && compassAccuracy <= 25);
    const millisecondsSinceActive = eventTime - lastAcceptedSensorTimeRef.current;
    if (!AstronomyService.shouldAcceptOrientationSensorSource(
      activeSensorSourceRef.current,
      incomingSource,
      millisecondsSinceActive
    )) {
      return;
    }

    const screenAngle = getScreenAngle();
    const screenChanged = screenAngle !== lastScreenAngleRef.current;
    if (screenChanged) {
      lastScreenAngleRef.current = screenAngle;
      rawSampleRingRef.current = [];
      candidateSensorSourceRef.current = 'none';
      candidateSensorSamplesRef.current = [];
    }

    let computed: { heading: number; pitch: number; roll: number };
    if (incomingSource === 'ios') {
      const iosMeasurement = AstronomyService.computeIosCameraOrientation(
        eventData,
        iosNorthOffsetRef.current,
        screenAngle
      );

      if (
        iosNorthOffsetRef.current === null &&
        (iosMeasurement.measuredNorthOffset === null || !compassAnchorMayUpdate)
      ) {
        iosNorthOffsetCandidatesRef.current = [];
      }
      if (
        iosNorthOffsetRef.current === null &&
        iosMeasurement.measuredNorthOffset !== null &&
        compassAnchorMayUpdate
      ) {
        const candidates = iosNorthOffsetCandidatesRef.current;
        const lastCandidate = candidates[candidates.length - 1];
        if (lastCandidate && eventTime - lastCandidate.timestampMs > 2500) {
          candidates.length = 0;
        }
        candidates.push({
          heading: iosMeasurement.measuredNorthOffset,
          timestampMs: eventTime,
        });
        if (candidates.length > 5) candidates.shift();
        const candidateSamples = candidates.map(({ heading, timestampMs }) => ({
          heading,
          pitch: 0,
          roll: 0,
          timestampMs,
        }));
        if (
          candidates.length >= 3 &&
          AstronomyService.areOrientationSamplesConsistent(candidateSamples, 3, 1, 1)
        ) {
          iosNorthOffsetRef.current = AstronomyService.computeRobustOrientationSample(
            candidateSamples
          ).heading;
          iosNorthOffsetCandidatesRef.current = [];
          lastIosNorthOffsetUpdateRef.current = eventTime;
        }
      } else if (
        iosNorthOffsetRef.current !== null &&
        iosMeasurement.measuredNorthOffset !== null &&
        compassAnchorMayUpdate
      ) {
        // Gyro attitude handles immediate motion. The magnetometer only nudges
        // the north anchor slowly, outside its own deadband, to correct drift.
        const elapsed = Number.isFinite(lastIosNorthOffsetUpdateRef.current)
          ? Math.max(1, Math.min(1000, eventTime - lastIosNorthOffsetUpdateRef.current))
          : 1000 / 60;
        const anchorDelta = AstronomyService.computeShortestAngleDelta(
          iosMeasurement.measuredNorthOffset,
          iosNorthOffsetRef.current
        );
        const anchorGain = 1 - Math.exp(-elapsed / 30000);
        iosNorthOffsetRef.current = (
          iosNorthOffsetRef.current + AstronomyService.applySoftDeadband(anchorDelta, 1.2) * anchorGain + 360
        ) % 360;
        lastIosNorthOffsetUpdateRef.current = eventTime;
      }

      if (iosNorthOffsetRef.current === null) {
        const warning = compassAccuracyIsInvalid
          ? 'Kompasset er forstyrret eller ikke kalibrert. Beveg telefonen rolig i en åttetallsbevegelse.'
          : !compassAnchorMayUpdate
            ? `Kompassnøyaktigheten er for lav${typeof compassAccuracy === 'number' && Number.isFinite(compassAccuracy) ? ` (±${Math.round(compassAccuracy)}°)` : ''}. Flytt telefonen bort fra metall/magneter og kalibrer kompasset.`
            : iosMeasurement.northAnchorObservable
            ? 'Kalibrerer stabil nordreferanse. Hold telefonen rolig et øyeblikk.'
            : 'Vipp telefonen minst 20° fra helt oppreist et øyeblikk for å låse nordretningen.';
        if (warning !== sensorWarningRef.current) {
          sensorWarningRef.current = warning;
          setSensorWarning(warning);
        }
        return;
      }

      computed = AstronomyService.computeIosCameraOrientation(
        eventData,
        iosNorthOffsetRef.current,
        screenAngle
      ).orientation;
    } else {
      computed = AstronomyService.computeDeviceOrientation(eventData, screenAngle);
    }

    // Azimuth is physically undefined when the camera points almost straight
    // up/down. Keep the last trustworthy heading instead of magnifying tiny
    // Euler-angle noise into a large horizontal jump.
    if (hasSensorSampleRef.current && Math.abs(computed.pitch) > 82) {
      computed.heading = rawHeadingRef.current;
      computed.roll = rawRollRef.current;
    }

    const sample = { ...computed, timestampMs: eventTime };
    let sourceChanged = false;

    if (incomingSource !== activeSensorSourceRef.current) {
      const candidateExpired = eventTime - lastCandidateSensorTimeRef.current > 2500;
      const currentCandidate = candidateSensorSourceRef.current;
      const isReacquiringNorth = activeSensorSourceRef.current !== 'none' &&
        activeSensorSourceRef.current !== 'relative' &&
        incomingSource !== 'relative';

      // Both browser event channels can fire for one physical observation.
      // During warm-up, only a higher-priority channel may replace the current
      // candidate. After promotion, exact-source lock remains in force until a
      // controlled stale-source reacquisition is needed.
      if (
        !candidateExpired &&
        currentCandidate !== 'none' &&
        currentCandidate !== incomingSource &&
        AstronomyService.getOrientationSensorSourcePriority(incomingSource) <=
          AstronomyService.getOrientationSensorSourcePriority(currentCandidate)
      ) {
        return;
      }
      if (currentCandidate !== incomingSource || candidateExpired) {
        candidateSensorSourceRef.current = incomingSource;
        candidateSensorSamplesRef.current = [];
        if (isReacquiringNorth) {
          setOrientation((prev) => ({ ...prev, isNorthReferenced: false }));
          if (sensorWarningRef.current !== 'Kobler til en ny stabil kompassensor…') {
            sensorWarningRef.current = 'Kobler til en ny stabil kompassensor…';
            setSensorWarning(sensorWarningRef.current);
          }
        }
      }
      lastCandidateSensorTimeRef.current = eventTime;
      candidateSensorSamplesRef.current.push(sample);
      if (candidateSensorSamplesRef.current.length > 5) candidateSensorSamplesRef.current.shift();

      const requiredSamples = 3;
      if (candidateSensorSamplesRef.current.length < requiredSamples) return;

      const candidateIsConsistent = AstronomyService.areOrientationSamplesConsistent(
        candidateSensorSamplesRef.current
      );
      if (!candidateIsConsistent) return;

      activeSensorSourceRef.current = incomingSource;
      candidateSensorSourceRef.current = 'none';
      rawSampleRingRef.current = [...candidateSensorSamplesRef.current];
      candidateSensorSamplesRef.current = [];
      sourceChanged = true;
      setSensorType(
        incomingSource === 'ios'
          ? 'ios'
          : incomingSource === 'relative'
            ? 'relative'
            : 'absolute'
      );
      setOrientation((prev) => ({
        ...prev,
        isNorthReferenced: incomingSource !== 'relative',
      }));
    } else {
      if (candidateSensorSourceRef.current !== 'none') {
        // The active source resumed before fallback promotion.
        candidateSensorSourceRef.current = 'none';
        candidateSensorSamplesRef.current = [];
        if (incomingSource !== 'relative') {
          setOrientation((prev) => ({ ...prev, isNorthReferenced: true }));
        }
      }
      const ring = rawSampleRingRef.current;
      ring.push(sample);
      if (ring.length > RAW_SENSOR_RING_SIZE) ring.shift();
    }

    lastAcceptedSensorTimeRef.current = eventTime;

    let warning: string | null = null;
    if (incomingSource === 'ios' && compassAccuracyIsInvalid) {
      warning = compassAccuracyIsReported && Number.isFinite(compassAccuracy) && compassAccuracy > 45
        ? `Sterk magnetisk forstyrrelse (±${Math.round(compassAccuracy)}°). Gyroen holder retningen mens kompassankeret er fryst.`
        : 'Kompasset er ikke kalibrert. Gyroen holder retningen mens kompassankeret er fryst.';
    } else if (incomingSource === 'ios' && typeof compassAccuracy === 'number' && compassAccuracy > 25) {
      warning = `Mulig magnetisk forstyrrelse (kompassavvik ±${Math.round(compassAccuracy)}°). Nordankeret er fryst.`;
    } else if (incomingSource === 'relative') {
      warning = 'Nordreferanse er ikke tilgjengelig på denne telefonen. AR-overlegget er satt på pause.';
    }
    if (warning !== sensorWarningRef.current) {
      sensorWarningRef.current = warning;
      setSensorWarning(warning);
    }

    const ring = rawSampleRingRef.current;
    if (ring.length > RAW_SENSOR_RING_SIZE) ring.shift();

    const robust = AstronomyService.computeRobustOrientationSample(ring, {
      heading: rawHeadingRef.current,
      pitch: rawPitchRef.current,
      roll: rawRollRef.current,
    });
    rawHeadingRef.current = robust.heading;
    rawPitchRef.current = robust.pitch;
    rawRollRef.current = robust.roll;

    if (!hasSensorSampleRef.current || sourceChanged || screenChanged) {
      // Never interpolate between unrelated coordinate systems.
      filteredHeadingRef.current = robust.heading;
      filteredPitchRef.current = robust.pitch;
      filteredRollRef.current = robust.roll;
      lastAnimationFrameTimeRef.current = null;
      orientationWasMovingRef.current = false;
      orientationSettledSinceRef.current = null;
      orientationMovementAnchorRef.current = robust;
    }
    hasSensorSampleRef.current = true;
  }, []);

  const requestOrientationPermission = async () => {
    if (
      typeof window !== 'undefined' &&
      typeof (DeviceOrientationEvent as any)?.requestPermission === 'function'
    ) {
      const requestId = ++orientationPermissionRequestIdRef.current;
      try {
        const requestPermission = (DeviceOrientationEvent as any).requestPermission;
        let response: string;
        try {
          response = await requestPermission.call(DeviceOrientationEvent, true);
        } catch (error) {
          // Older Safari versions expose the proprietary no-argument variant.
          if (!(error instanceof TypeError)) throw error;
          response = await requestPermission.call(DeviceOrientationEvent);
        }
        if (
          requestId !== orientationPermissionRequestIdRef.current ||
          !orientationSessionActiveRef.current
        ) {
          return;
        }
        if (response === 'granted') {
          setNeedsIosPermission(false);
          window.addEventListener('deviceorientationabsolute', handleDeviceOrientationEvent as any, true);
          window.addEventListener('deviceorientation', handleDeviceOrientationEvent, true);
          setOrientation((prev) => ({ ...prev, permissionGranted: true, isSupported: true }));
        } else {
          setSensorWarning('Tilgang til bevegelses- og kompassensorer ble ikke innvilget.');
        }
      } catch (e) {
        if (requestId !== orientationPermissionRequestIdRef.current) return;
        console.error('Error requesting orientation permission:', e);
        setSensorWarning('Kunne ikke aktivere bevegelses- og kompassensorene.');
      }
    }
  };

  useEffect(() => {
    if (!isOpen) return;

    orientationSessionActiveRef.current = true;
    orientationPermissionRequestIdRef.current += 1;
    rawSampleRingRef.current = [];
    activeSensorSourceRef.current = 'none';
    candidateSensorSourceRef.current = 'none';
    candidateSensorSamplesRef.current = [];
    lastCandidateSensorTimeRef.current = Number.NEGATIVE_INFINITY;
    lastAcceptedSensorTimeRef.current = Number.NEGATIVE_INFINITY;
    lastScreenAngleRef.current = getScreenAngle();
    hasSensorSampleRef.current = false;
    iosNorthOffsetRef.current = null;
    iosNorthOffsetCandidatesRef.current = [];
    lastIosNorthOffsetUpdateRef.current = Number.NEGATIVE_INFINITY;
    orientationWasMovingRef.current = false;
    orientationSettledSinceRef.current = null;
    orientationMovementAnchorRef.current = {
      heading: rawHeadingRef.current,
      pitch: rawPitchRef.current,
      roll: rawRollRef.current,
    };
    sensorWarningRef.current = null;
    setSensorType('none');
    setSensorWarning(null);
    setOrientation((prev) => ({ ...prev, isNorthReferenced: false }));

    // Check if iOS 13+ permission required
    if (
      typeof window !== 'undefined' &&
      typeof (DeviceOrientationEvent as any)?.requestPermission === 'function'
    ) {
      setNeedsIosPermission(true);
    } else if (typeof window !== 'undefined') {
      // Listen for fallback compatibility, but the handler locks onto exactly
      // one prioritized source so absolute and relative coordinates never mix.
      window.addEventListener('deviceorientationabsolute', handleDeviceOrientationEvent as any, true);
      window.addEventListener('deviceorientation', handleDeviceOrientationEvent, true);
      setOrientation((prev) => ({ ...prev, isSupported: true }));
    }

    // Try starting camera automatically on open (foreground only)
    startCamera();

    // Foreground-only enforcement: stop camera immediately if tab or window is hidden
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        stopCamera();
      } else if (document.visibilityState === 'visible' && isOpen) {
        startCamera();
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    return () => {
      orientationSessionActiveRef.current = false;
      orientationPermissionRequestIdRef.current += 1;
      stopCamera();
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener('deviceorientationabsolute', handleDeviceOrientationEvent as any, true);
        window.removeEventListener('deviceorientation', handleDeviceOrientationEvent, true);
      }
    };
  }, [isOpen, startCamera, stopCamera, handleDeviceOrientationEvent]);

  // Smooth orientation interpolation loop with advanced interference suppression & adaptive damping
  useEffect(() => {
    if (!isOpen) return;

    // Initialize filtered values on open
    filteredHeadingRef.current = rawHeadingRef.current;
    filteredPitchRef.current = rawPitchRef.current;
    filteredRollRef.current = rawRollRef.current;
    lastStateHeadingRef.current = rawHeadingRef.current;
    lastStatePitchRef.current = rawPitchRef.current;
    lastStateRollRef.current = rawRollRef.current;
    orientationMovementAnchorRef.current = {
      heading: rawHeadingRef.current,
      pitch: rawPitchRef.current,
      roll: rawRollRef.current,
    };

    const initialCalibration = calibrationRef.current;
    const initialDisplayH = Math.round(((rawHeadingRef.current + initialCalibration.headingOffset) % 360 + 360) % 360) % 360;
    const initialDisplayP = Math.round(rawPitchRef.current + initialCalibration.pitchOffset);
    displayedHeadingRef.current = initialDisplayH;
    displayedPitchRef.current = initialDisplayP;
    setDisplayHeading(initialDisplayH);
    setDisplayPitch(initialDisplayP);

    lastAnimationFrameTimeRef.current = null;
    const smoothStep = (frameTime: number) => {
      const activeCalibration = calibrationRef.current;
      const filterLevel = activeCalibration.filterLevel ?? DEFAULT_FILTER_LEVEL;
      const customDeadband = activeCalibration.deadbandDegrees ?? DEFAULT_DEADBAND_BY_LEVEL.high;
      const deltaTimeMs = lastAnimationFrameTimeRef.current === null
        ? 1000 / 60
        : Math.max(1, Math.min(100, frameTime - lastAnimationFrameTimeRef.current));
      lastAnimationFrameTimeRef.current = frameTime;

      const smoothed = AstronomyService.filterOrientationStep(
        {
          heading: filteredHeadingRef.current,
          pitch: filteredPitchRef.current,
          roll: filteredRollRef.current,
        },
        {
          heading: rawHeadingRef.current,
          pitch: rawPitchRef.current,
          roll: rawRollRef.current,
        },
        filterLevel,
        customDeadband,
        deltaTimeMs
      );

      const movementThreshold = Math.max(3, customDeadband * 2);
      const deliberateMovement = AstronomyService.hasDeliberateOrientationMovement(
        orientationMovementAnchorRef.current,
        {
          heading: rawHeadingRef.current,
          pitch: rawPitchRef.current,
          roll: rawRollRef.current,
        },
        customDeadband
      );
      if (filterLevel === 'off') {
        orientationWasMovingRef.current = false;
        orientationSettledSinceRef.current = null;
        orientationMovementAnchorRef.current = {
          heading: rawHeadingRef.current,
          pitch: rawPitchRef.current,
          roll: rawRollRef.current,
        };
      } else if (deliberateMovement || smoothed.angularSpeedDeg > movementThreshold) {
        orientationWasMovingRef.current = true;
        orientationSettledSinceRef.current = null;
      } else if (orientationWasMovingRef.current && smoothed.isStable) {
        if (orientationSettledSinceRef.current === null) {
          orientationSettledSinceRef.current = frameTime;
        }
      } else {
        orientationSettledSinceRef.current = null;
      }

      const stableForMs = orientationSettledSinceRef.current === null
        ? 0
        : frameTime - orientationSettledSinceRef.current;
      const shouldSnapToSettledPose = filterLevel !== 'off' && AstronomyService.shouldSnapSettledOrientation(
        rawSampleRingRef.current,
        orientationWasMovingRef.current,
        smoothed.isStable,
        stableForMs,
        customDeadband
      );

      if (shouldSnapToSettledPose) {
        // One clean landing after a real pan, then resume the stationary lock.
        filteredHeadingRef.current = rawHeadingRef.current;
        filteredPitchRef.current = rawPitchRef.current;
        filteredRollRef.current = rawRollRef.current;
        orientationWasMovingRef.current = false;
        orientationSettledSinceRef.current = null;
        orientationMovementAnchorRef.current = {
          heading: rawHeadingRef.current,
          pitch: rawPitchRef.current,
          roll: rawRollRef.current,
        };
      } else {
        filteredHeadingRef.current = smoothed.heading;
        filteredPitchRef.current = smoothed.pitch;
        filteredRollRef.current = smoothed.roll;
      }

      // Check if rendered state needs updating (sub-pixel efficiency threshold)
      const stateDH = Math.abs(AstronomyService.computeShortestAngleDelta(filteredHeadingRef.current, lastStateHeadingRef.current));
      const stateDP = Math.abs(filteredPitchRef.current - lastStatePitchRef.current);
      const stateDR = Math.abs(filteredRollRef.current - lastStateRollRef.current);
      const stabilityChanged = smoothed.isStable !== lastIsStableRef.current;

      if (stateDH > 0.05 || stateDP > 0.05 || stateDR > 0.08 || stabilityChanged) {
        lastStateHeadingRef.current = filteredHeadingRef.current;
        lastStatePitchRef.current = filteredPitchRef.current;
        lastStateRollRef.current = filteredRollRef.current;
        lastIsStableRef.current = smoothed.isStable;

        setOrientation((prev) => ({
          ...prev,
          heading: filteredHeadingRef.current,
          pitch: filteredPitchRef.current,
          roll: filteredRollRef.current,
          isStable: smoothed.isStable,
        }));

      }

      // Apply display hysteresis independently from React's canvas-update
      // threshold, so changing an offset never has to reset the sensor filter.
      const effectiveRawH = ((filteredHeadingRef.current + activeCalibration.headingOffset) % 360 + 360) % 360;
      const effectiveRawP = filteredPitchRef.current + activeCalibration.pitchOffset;
      const newDisplayH = AstronomyService.updateDegreeWithHysteresis(
        effectiveRawH,
        displayedHeadingRef.current,
        0.70,
        true
      );
      const newDisplayP = AstronomyService.updateDegreeWithHysteresis(
        effectiveRawP,
        displayedPitchRef.current,
        0.70,
        false
      );

      if (newDisplayH !== displayedHeadingRef.current) {
        displayedHeadingRef.current = newDisplayH;
        setDisplayHeading(newDisplayH);
      }
      if (newDisplayP !== displayedPitchRef.current) {
        displayedPitchRef.current = newDisplayP;
        setDisplayPitch(newDisplayP);
      }

      animationFrameRef.current = requestAnimationFrame(smoothStep);
    };

    animationFrameRef.current = requestAnimationFrame(smoothStep);
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      lastAnimationFrameTimeRef.current = null;
    };
  }, [isOpen]);

  // ─────────────────────────────────────────────────────────────
  // 5. 1-TAP CALIBRATION AGAINST SUN / MOON
  // ─────────────────────────────────────────────────────────────
  const handleCalibrateAgainstSun = () => {
    if (
      activeSensorSourceRef.current === 'none' ||
      activeSensorSourceRef.current === 'relative'
    ) {
      setCalibrationToast('Kalibrering krever en nordreferert kompassensor på telefonen.');
      setTimeout(() => setCalibrationToast(null), 3500);
      return;
    }

    // Calibrate against exactly the same stabilized pose the user sees.
    const currentHeading = filteredHeadingRef.current;
    const currentPitch = filteredPitchRef.current;

    // True real-world Sun position right now
    const targetAz = currentRealSunPoint.azimuth;
    const targetAlt = currentRealSunPoint.altitude;

    const offset = AstronomyService.computeCelestialCalibrationOffset(
      targetAz,
      targetAlt,
      currentHeading,
      currentPitch
    );

    setCalibration((prev) => ({
      ...prev,
      headingOffset: offset.headingOffset,
      pitchOffset: offset.pitchOffset,
    }));

    setCalibrationToast(
      `✅ Kalibrert mot solen! (Offset: ${offset.headingOffset > 0 ? `+${offset.headingOffset}°` : `${offset.headingOffset}°`} kompass, ${offset.pitchOffset > 0 ? `+${offset.pitchOffset}°` : `${offset.pitchOffset}°`} tilt)`
    );
    setTimeout(() => setCalibrationToast(null), 4500);
  };

  const handleCalibrateAgainstMoon = () => {
    if (
      activeSensorSourceRef.current === 'none' ||
      activeSensorSourceRef.current === 'relative'
    ) {
      setCalibrationToast('Kalibrering krever en nordreferert kompassensor på telefonen.');
      setTimeout(() => setCalibrationToast(null), 3500);
      return;
    }

    const currentHeading = filteredHeadingRef.current;
    const currentPitch = filteredPitchRef.current;

    const targetAz = currentRealMoonPoint.azimuth;
    const targetAlt = currentRealMoonPoint.altitude;

    const offset = AstronomyService.computeCelestialCalibrationOffset(
      targetAz,
      targetAlt,
      currentHeading,
      currentPitch
    );

    setCalibration((prev) => ({
      ...prev,
      headingOffset: offset.headingOffset,
      pitchOffset: offset.pitchOffset,
    }));

    setCalibrationToast(
      `✅ Kalibrert mot månen! (Offset: ${offset.headingOffset > 0 ? `+${offset.headingOffset}°` : `${offset.headingOffset}°`} kompass, ${offset.pitchOffset > 0 ? `+${offset.pitchOffset}°` : `${offset.pitchOffset}°`} tilt)`
    );
    setTimeout(() => setCalibrationToast(null), 4500);
  };

  const handleResetCalibration = () => {
    setCalibration((prev) => ({
      ...prev,
      headingOffset: 0,
      pitchOffset: 0,
      filterLevel: DEFAULT_FILTER_LEVEL,
      deadbandDegrees: DEFAULT_DEADBAND_BY_LEVEL.high,
    }));
    rawSampleRingRef.current = [];
    setCalibrationToast('Kalibrering og støyfilter er tilbakestilt til anbefalt standard.');
    setTimeout(() => setCalibrationToast(null), 3000);
  };

  const handleFilterLevelChange = (filterLevel: ARFilterLevel) => {
    setCalibration((prev) => ({
      ...prev,
      filterLevel,
      deadbandDegrees: filterLevel === 'off'
        ? prev.deadbandDegrees
        : DEFAULT_DEADBAND_BY_LEVEL[filterLevel],
    }));
  };

  // ─────────────────────────────────────────────────────────────
  // 6. TOUCH / MOUSE DRAG NAVIGATION (VIRTUAL DOME MODE)
  // ─────────────────────────────────────────────────────────────
  const handlePointerDown = (e: React.PointerEvent) => {
    isDraggingRef.current = true;
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      heading: rawHeadingRef.current,
      pitch: rawPitchRef.current,
    };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;

    // 0.35 deg per pixel sensitivity
    const newHeading = (dragStartRef.current.heading - dx * 0.35 + 360) % 360;
    const newPitch = Math.max(-85, Math.min(85, dragStartRef.current.pitch + dy * 0.35));

    rawHeadingRef.current = newHeading;
    rawPitchRef.current = newPitch;
  };

  const handlePointerUp = () => {
    isDraggingRef.current = false;
  };

  if (!isOpen) return null;

  // Format time and date
  const hour = Math.floor(selectedMinutes / 60);
  const min = selectedMinutes % 60;
  const timeFormatted = `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
  const effectiveHeading = displayHeading;
  const effectivePitch = displayPitch;
  const currentCardinal = AstronomyService.getCardinalDirection(effectiveHeading);

  const filterLevel = calibration.filterLevel || 'high';

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="AR-himmelkamera for sol og måne"
      tabIndex={-1}
      className="fixed inset-0 z-50 bg-slate-950 flex flex-col overflow-hidden select-none animate-in fade-in duration-200"
    >
      {/* ─── 1. VIEWPORT (CAMERA VIDEO + AR CANVAS) ─── */}
      <div
        className="relative flex-1 w-full h-full cursor-grab active:cursor-grabbing touch-none overflow-hidden"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {/* Background Camera Video (Always mounted to ensure stream binding) */}
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
            isCameraActive ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        />

        {/* Fallback solid background when camera is disabled */}
        {!isCameraActive && <div className="absolute inset-0 bg-slate-950" />}

        {/* AR Canvas Overlay. Never present an arbitrary relative frame as true north. */}
        {(!isCameraActive || orientation.isNorthReferenced) ? (
          <SkyArcCanvas
            skyArcs={skyArcs}
            activeSunPoint={activeSunPoint}
            activeMoonPoint={activeMoonPoint}
            moonIllumination={activeMoonIllum}
            orientation={orientation}
            calibration={calibration}
            isVirtualMode={!isCameraActive}
            selectedTimeFormatted={timeFormatted}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center p-8 pointer-events-none">
            <div className="max-w-sm rounded-2xl border border-amber-500/60 bg-slate-950/90 p-4 text-center text-sm text-amber-100 shadow-2xl backdrop-blur-md">
              <AlertTriangle className="w-6 h-6 mx-auto mb-2 text-amber-400" />
              <strong className="block text-white mb-1">Venter på nordreferert kompass</strong>
              AR-buer og himmelretninger vises først når telefonen leverer en pålitelig absolutt retning.
            </div>
          </div>
        )}

        {/* ─── TOP HUD OVERLAY ─── */}
        <div className="absolute top-0 inset-x-0 p-3 sm:p-4 bg-gradient-to-b from-slate-950/90 via-slate-950/60 to-transparent flex items-center justify-between gap-2 z-10">
          {/* Compass & Direction HUD */}
          <div className="flex items-center gap-2 bg-slate-900/85 backdrop-blur-md border border-slate-700/60 rounded-xl px-3 py-1.5 shadow-lg">
            <Compass className="w-4 h-4 text-sky-400 animate-pulse" />
            <div className="flex items-baseline gap-1.5 text-xs font-mono">
              <span className="font-bold text-sky-300 text-sm">
                {!isCameraActive || orientation.isNorthReferenced
                  ? `${effectiveHeading}° ${currentCardinal}`
                  : '—° Uten nordreferanse'}
              </span>
              <span className="text-slate-400">| {effectivePitch > 0 ? `+${effectivePitch}°` : `${effectivePitch}°`}</span>
            </div>

            {/* Interference suppression badge */}
            <div className="hidden min-[430px]:flex items-center ml-1 pl-2 border-l border-slate-700/60 text-[10px]">
              {!isCameraActive || orientation.isNorthReferenced ? orientation.isStable ? (
                <span className="flex items-center gap-1 text-emerald-300 font-semibold" title="Siktet er stabilisert og sensor-støy er dempet">
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                  <span>Stabil</span>
                </span>
              ) : (
                <span className="flex items-center gap-1 text-sky-300/80" title="Kamera i bevegelse - sporer retning">
                  <Sparkles className="w-3 h-3 text-sky-400" />
                  <span>Sporer</span>
                </span>
              ) : (
                <span className="flex items-center gap-1 text-amber-300" title="Venter på nordreferert kompass">
                  <AlertTriangle className="w-3 h-3" />
                  <span>Venter</span>
                </span>
              )}
            </div>
          </div>

          {/* Quick status pill */}
          <div className="hidden sm:flex items-center gap-3 text-xs bg-slate-900/85 backdrop-blur-md border border-slate-700/60 rounded-xl px-3 py-1.5 shadow-lg text-slate-300">
            <span className="flex items-center gap-1">
              <Sun className="w-3.5 h-3.5 text-amber-400" />
              <span>Sol nå: <strong className="font-mono text-amber-300">{activeSunPoint.altitude > 0 ? `+${activeSunPoint.altitude}°` : `${activeSunPoint.altitude}°`}</strong></span>
            </span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <Moon className="w-3.5 h-3.5 text-sky-300" />
              <span>Måne: <strong className="font-mono text-sky-300">{activeMoonPoint.altitude > 0 ? `+${activeMoonPoint.altitude}°` : `${activeMoonPoint.altitude}°`}</strong></span>
            </span>
          </div>

          {/* Top Actions */}
          <div className="flex items-center gap-2">
            {/* Sun Quick Calibrate Button */}
            <button
              type="button"
              onClick={handleCalibrateAgainstSun}
              className="min-h-11 min-w-11 px-2.5 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/35 border border-amber-500/40 text-amber-300 font-semibold text-xs transition flex items-center justify-center gap-1.5 shadow-md"
              title="Sikt trådkorset mot solen og trykk for å kalibrere 100% nøyaktig"
              aria-label="Kalibrer sikte mot solen"
            >
              <Target className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden lg:inline">Kalibrer mot sol</span>
            </button>

            {/* Toggle Camera vs Virtual */}
            <button
              type="button"
              onClick={() => {
                if (isCameraActive) {
                  stopCamera();
                } else {
                  startCamera();
                }
              }}
              className={`min-h-11 min-w-11 p-2 rounded-xl backdrop-blur-md border transition flex items-center justify-center gap-1 text-xs font-semibold ${
                isCameraActive
                  ? 'bg-emerald-600/30 border-emerald-500/50 text-emerald-300 hover:bg-emerald-600/50'
                  : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-700'
              }`}
              title={isCameraActive ? 'Slå av kamera (Virtuell modus)' : 'Slå på bakkamera'}
              aria-label={isCameraActive ? 'Slå av kamera og bruk virtuell visning' : 'Slå på bakkamera'}
            >
              {isCameraActive ? <Camera className="w-4 h-4 text-emerald-400" /> : <Eye className="w-4 h-4 text-sky-400" />}
              <span className="hidden lg:inline">{isCameraActive ? 'Kamera' : 'Virtuell'}</span>
            </button>

            {/* Settings & Calibration button */}
            <button
              type="button"
              onClick={() => setShowSettings(!showSettings)}
              className={`min-h-11 min-w-11 p-2 rounded-xl backdrop-blur-md border transition ${
                showSettings
                  ? 'bg-sky-600/40 border-sky-500 text-sky-300'
                  : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-700'
              }`}
              title="Innstillinger, Sensor-demping & Kalibrering"
              aria-label="Vis kalibreringsinnstillinger"
              aria-expanded={showSettings}
            >
              <Sliders className="w-4 h-4" />
            </button>

            {/* Close modal */}
            <button
              type="button"
              onClick={onClose}
              className="min-h-11 min-w-11 p-2 rounded-xl bg-slate-800/80 hover:bg-rose-900/40 border border-slate-700 hover:border-rose-500/50 text-slate-300 hover:text-white transition"
              title="Lukk himmelvisning"
              aria-label="Lukk himmelvisning"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Calibration Success Toast */}
        {calibrationToast && (
          <div role="status" aria-live="polite" className="absolute top-16 inset-x-4 max-w-md mx-auto p-3 bg-emerald-950/95 border border-emerald-500/60 rounded-2xl shadow-2xl backdrop-blur-md flex items-center gap-2.5 text-xs text-emerald-200 z-30 animate-in slide-in-from-top duration-200">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{calibrationToast}</span>
          </div>
        )}

        {/* iOS Permission Banner if needed */}
        {needsIosPermission && (
          <div className="absolute top-16 inset-x-4 max-w-md mx-auto p-3.5 bg-sky-950/90 border border-sky-500/50 rounded-2xl shadow-2xl backdrop-blur-md flex items-center justify-between gap-3 z-20 animate-in slide-in-from-top duration-300">
            <div className="text-xs text-sky-200">
              <strong className="block text-white font-bold mb-0.5">Aktiver bevegelsessensorer</strong>
              Trykk for å la kameraet spore kompass og himmelretning i sanntid.
            </div>
            <button
              type="button"
              onClick={requestOrientationPermission}
              className="min-h-11 px-3.5 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs shadow-md shrink-0 transition"
            >
              Tillat sensor
            </button>
          </div>
        )}

        {sensorWarning && !needsIosPermission && (
          <div className={`absolute inset-x-4 max-w-md mx-auto p-2.5 bg-amber-950/95 border border-amber-500/60 rounded-xl text-xs text-amber-200 backdrop-blur-md z-20 flex items-center justify-center gap-2 ${cameraError && !isCameraActive ? 'top-28' : 'top-16'}`}>
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
            <span>{sensorWarning}</span>
          </div>
        )}

        {/* Camera error / Info note */}
        {cameraError && !isCameraActive && (
          <div className="absolute top-16 inset-x-4 max-w-sm mx-auto p-2.5 bg-slate-900/90 border border-amber-500/40 rounded-xl text-center text-xs text-amber-300 backdrop-blur-md z-10 flex items-center justify-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span>{cameraError}</span>
          </div>
        )}
      </div>

      {/* ─── 2. BOTTOM CONTROL BAR (TIME SLIDER & JUMP BUTTONS) ─── */}
      <div className="bg-slate-900/95 border-t border-slate-800/90 p-3 sm:p-4 backdrop-blur-lg space-y-3 z-20">
        {/* Time Slider & Play Button */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setIsPlaying(!isPlaying)}
            aria-label={isPlaying ? 'Pause simulering' : 'Start simulering'}
            aria-pressed={isPlaying}
            className={`min-h-11 min-w-11 p-2.5 rounded-xl border transition shadow-md shrink-0 ${
              isPlaying
                ? 'bg-amber-600/30 border-amber-500/50 text-amber-300 hover:bg-amber-600/50'
                : 'bg-sky-600/30 border-sky-500/50 text-sky-300 hover:bg-sky-600/50'
            }`}
            title={isPlaying ? 'Pause simulering' : 'Start animasjon gjennom døgnet'}
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>

          {/* Scrubbable Time Range Slider */}
          <div className="flex-1 space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                <span>Simulert tid: <strong className="font-mono text-white text-sm">{timeFormatted}</strong></span>
              </span>
              <span className="text-[11px] text-slate-400 font-medium">
                {selectedDate} • {locationName}
              </span>
            </div>

            <div className="relative">
              <input
                type="range"
                aria-label="Simulert klokkeslett"
                min={0}
                max={1440}
                step={5}
                value={selectedMinutes}
                onChange={(e) => {
                  setIsPlaying(false);
                  setSelectedMinutes(Number(e.target.value));
                }}
                className="w-full h-3 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/40"
              />
            </div>
          </div>
        </div>

        {/* Quick Jump Buttons & Date Navigation */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-800/60 text-xs">
          {/* Quick presets */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            <button
              type="button"
              onClick={() => {
                const now = new Date();
                setSelectedMinutes(now.getHours() * 60 + now.getMinutes());
              }}
              className="min-h-11 px-2.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sky-300 border border-slate-700 transition flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Nå</span>
            </button>

            {daySummary.sun.sunrise && (
              <button
                type="button"
                onClick={() => {
                  const [h, m] = daySummary.sun.sunrise!.split(':').map(Number);
                  setSelectedMinutes(h * 60 + m);
                }}
                className="min-h-11 px-2 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 transition"
              >
                Soloppgang ({daySummary.sun.sunrise})
              </button>
            )}

            {daySummary.sun.solarNoon && (
              <button
                type="button"
                onClick={() => {
                  const [h, m] = daySummary.sun.solarNoon!.split(':').map(Number);
                  setSelectedMinutes(h * 60 + m);
                }}
                className="min-h-11 px-2 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-200 border border-slate-700 transition"
              >
                Middag ({daySummary.sun.solarNoon})
              </button>
            )}

            {daySummary.sun.sunset && (
              <button
                type="button"
                onClick={() => {
                  const [h, m] = daySummary.sun.sunset!.split(':').map(Number);
                  setSelectedMinutes(h * 60 + m);
                }}
                className="min-h-11 px-2 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-orange-300 border border-slate-700 transition"
              >
                Solnedgang ({daySummary.sun.sunset})
              </button>
            )}
          </div>

          {/* Date Picker / Day Stepper */}
          <div className="flex items-center gap-1.5 bg-slate-950/80 border border-slate-800 rounded-lg p-0.5">
            <button
              type="button"
              onClick={() => {
                const d = new Date(selectedDate);
                d.setDate(d.getDate() - 1);
                setSelectedDate(toLocalDateValue(d));
              }}
              className="min-h-11 min-w-11 p-2 rounded text-slate-400 hover:text-white hover:bg-slate-800"
              title="Forrige dag"
              aria-label="Forrige dag"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <input
              type="date"
              aria-label="Velg dato"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent text-slate-200 text-[11px] font-mono focus:outline-none cursor-pointer px-1"
            />
            <button
              type="button"
              onClick={() => {
                const d = new Date(selectedDate);
                d.setDate(d.getDate() + 1);
                setSelectedDate(toLocalDateValue(d));
              }}
              className="min-h-11 min-w-11 p-2 rounded text-slate-400 hover:text-white hover:bg-slate-800"
              title="Neste dag"
              aria-label="Neste dag"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* ─── 3. SETTINGS & CALIBRATION DRAWER ─── */}
      {showSettings && (
        <div className="absolute inset-x-0 bottom-36 sm:bottom-28 max-w-md mx-auto p-4 bg-slate-900/95 border border-slate-700 rounded-2xl shadow-2xl backdrop-blur-xl z-30 space-y-4 animate-in slide-in-from-bottom duration-200 max-h-[70vh] overflow-y-auto">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Sliders className="w-4 h-4 text-sky-400" />
              <span>Kalibrering & Sensor-stabilisering</span>
            </h3>
            <button
              type="button"
              onClick={() => setShowSettings(false)}
              className="min-h-11 min-w-11 p-2 text-slate-400 hover:text-white rounded"
              aria-label="Lukk kalibreringsinnstillinger"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Sensor Anti-Shake & Interference Suppression */}
          <div className="p-3.5 rounded-xl bg-slate-950/90 border border-sky-500/40 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-sky-300 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-sky-400" />
                <span>Sensor-skjelving & Støydemping</span>
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-sky-900/50 border border-sky-600/50 text-sky-200 uppercase">
                {filterLevel === 'ultra' ? '🛡️ Ultra' : filterLevel === 'medium' ? '⚡ Moderat' : filterLevel === 'off' ? 'Raw Av' : '✨ Høy'}
              </span>
            </div>
            <p className="text-[11px] text-slate-300 leading-relaxed">
              Hindrer at sensoren skjelver og at gradene hopper opp og ned når du sikter mot solen eller månen. Høy eller Ultra filtrerer bort elektromagnetisk støy og håndskjelving.
            </p>

            {/* Filter Level Selector */}
            <div className="grid grid-cols-4 gap-1.5 pt-1">
              <button
                onClick={() => handleFilterLevelChange('ultra')}
                className={`px-2 py-2 rounded-lg text-xs font-semibold flex flex-col items-center gap-0.5 transition border ${
                  filterLevel === 'ultra'
                    ? 'bg-sky-500 text-slate-950 border-sky-400 shadow-md font-bold'
                    : 'bg-slate-900 text-slate-300 border-slate-700 hover:bg-slate-800'
                }`}
                title="Maksimal støyfiltrering - helt rolig visning uten risting"
              >
                <span className="text-xs">Maksimal</span>
                <span className="text-[9px] opacity-80">Null risting</span>
              </button>
              <button
                onClick={() => handleFilterLevelChange('high')}
                className={`px-2 py-2 rounded-lg text-xs font-semibold flex flex-col items-center gap-0.5 transition border ${
                  filterLevel === 'high'
                    ? 'bg-sky-500 text-slate-950 border-sky-400 shadow-md font-bold'
                    : 'bg-slate-900 text-slate-300 border-slate-700 hover:bg-slate-800'
                }`}
                title="Høy demping - anbefalt for de fleste telefoner"
              >
                <span className="text-xs">Høy</span>
                <span className="text-[9px] opacity-80">Anbefalt</span>
              </button>
              <button
                onClick={() => handleFilterLevelChange('medium')}
                className={`px-2 py-2 rounded-lg text-xs font-semibold flex flex-col items-center gap-0.5 transition border ${
                  filterLevel === 'medium'
                    ? 'bg-sky-500 text-slate-950 border-sky-400 shadow-md font-bold'
                    : 'bg-slate-900 text-slate-300 border-slate-700 hover:bg-slate-800'
                }`}
                title="Moderat filtrering"
              >
                <span className="text-xs">Moderat</span>
                <span className="text-[9px] opacity-80">Rask</span>
              </button>
              <button
                onClick={() => handleFilterLevelChange('off')}
                className={`px-2 py-2 rounded-lg text-xs font-semibold flex flex-col items-center gap-0.5 transition border ${
                  filterLevel === 'off'
                    ? 'bg-sky-500 text-slate-950 border-sky-400 shadow-md font-bold'
                    : 'bg-slate-900 text-slate-300 border-slate-700 hover:bg-slate-800'
                }`}
                title="Slå av filter (direkte råsensor)"
              >
                <span className="text-xs">Av</span>
                <span className="text-[9px] opacity-80">Råsensor</span>
              </button>
            </div>

            {/* Deadband Sensitivity Slider */}
            {filterLevel !== 'off' && (
              <div className="pt-2 border-t border-slate-800/80 space-y-1">
                <div className="flex items-center justify-between text-[11px] text-slate-300">
                  <span>Håndskjelving & støy-dødbånd:</span>
                  <span className="font-mono font-bold text-sky-400">
                    ±{(calibration.deadbandDegrees ?? DEFAULT_DEADBAND_BY_LEVEL.high).toFixed(1)}°
                  </span>
                </div>
                <input
                  type="range"
                  min={0.2}
                  max={3}
                  step={0.1}
                  value={calibration.deadbandDegrees ?? DEFAULT_DEADBAND_BY_LEVEL.high}
                  onChange={(e) => setCalibration((prev) => ({ ...prev, deadbandDegrees: Number(e.target.value) }))}
                  className="w-full h-2 bg-slate-800 rounded appearance-none accent-sky-400 cursor-pointer"
                />
                <div className="flex justify-between text-[9px] text-slate-400">
                  <span>0.2° (Følsom)</span>
                  <span>1.5° (Standard)</span>
                  <span>3.0° (Maksimal ro)</span>
                </div>
              </div>
            )}
          </div>

          {/* 1-Tap Alignment Section */}
          <div className="p-3 rounded-xl bg-slate-950/80 border border-amber-500/30 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                <Target className="w-4 h-4 text-amber-400" />
                <span>Rask Sol-/Månekalibrering</span>
              </span>
              <span className="text-[10px] text-slate-400 font-mono">
                Sensor: {sensorType.toUpperCase()}
              </span>
            </div>
            <p className="text-[11px] text-slate-300 leading-relaxed">
              Sikt trådkorset i midten av skjermen direkte mot den virkelige solen (eller månen) og trykk på knappen. Alle buer og himmelretninger synkroniseres da umiddelbart med virkeligheten!
            </p>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                onClick={handleCalibrateAgainstSun}
                className="px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-md transition flex items-center justify-center gap-1.5"
              >
                <Sun className="w-3.5 h-3.5" />
                <span>Sikt på sol</span>
              </button>
              <button
                onClick={handleCalibrateAgainstMoon}
                className="px-3 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs shadow-md transition flex items-center justify-center gap-1.5"
              >
                <Moon className="w-3.5 h-3.5" />
                <span>Sikt på måne</span>
              </button>
            </div>
          </div>

          {/* Layer toggles */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <label className="flex items-center gap-2 p-2 rounded-xl bg-slate-950/60 border border-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={calibration.showSunArc}
                onChange={(e) => setCalibration({ ...calibration, showSunArc: e.target.checked })}
                className="rounded accent-amber-400"
              />
              <span className="text-amber-300 font-medium">☀️ Dagens Solbane</span>
            </label>

            <label className="flex items-center gap-2 p-2 rounded-xl bg-slate-950/60 border border-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={calibration.showMoonArc}
                onChange={(e) => setCalibration({ ...calibration, showMoonArc: e.target.checked })}
                className="rounded accent-sky-400"
              />
              <span className="text-sky-300 font-medium">🌙 Månebane</span>
            </label>

            <label className="flex items-center gap-2 p-2 rounded-xl bg-slate-950/60 border border-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={calibration.showSolstices}
                onChange={(e) => setCalibration({ ...calibration, showSolstices: e.target.checked })}
                className="rounded accent-amber-400"
              />
              <span className="text-slate-300 font-medium">📅 Solverv (Sommer/Vinter)</span>
            </label>

            <label className="flex items-center gap-2 p-2 rounded-xl bg-slate-950/60 border border-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={calibration.showHourMarks}
                onChange={(e) => setCalibration({ ...calibration, showHourMarks: e.target.checked })}
                className="rounded accent-amber-400"
              />
              <span className="text-slate-300 font-medium">⏱️ Tidsmarkører</span>
            </label>

            <label className="flex items-center gap-2 p-2 rounded-xl bg-slate-950/60 border border-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={calibration.showCompassCardinals}
                onChange={(e) => setCalibration({ ...calibration, showCompassCardinals: e.target.checked })}
                className="rounded accent-sky-400"
              />
              <span className="text-slate-300 font-medium">🧭 Kompassretninger</span>
            </label>

            <label className="flex items-center gap-2 p-2 rounded-xl bg-slate-950/60 border border-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={calibration.showHorizonLine}
                onChange={(e) => setCalibration({ ...calibration, showHorizonLine: e.target.checked })}
                className="rounded accent-sky-400"
              />
              <span className="text-slate-300 font-medium">🌐 Horisontlinje</span>
            </label>
          </div>

          {/* Compass & Pitch Offsets */}
          <div className="space-y-3 pt-2 border-t border-slate-800 text-xs">
            <div>
              <div className="flex justify-between text-slate-300 mb-1">
                <span>Kompass finjustering (Offset):</span>
                <span className="font-mono font-bold text-sky-400">{calibration.headingOffset > 0 ? `+${calibration.headingOffset}°` : `${calibration.headingOffset}°`}</span>
              </div>
              <input
                type="range"
                min={-90}
                max={90}
                step={0.5}
                value={calibration.headingOffset}
                onChange={(e) => setCalibration({ ...calibration, headingOffset: Number(e.target.value) })}
                className="w-full h-2 bg-slate-800 rounded appearance-none accent-sky-400"
              />
            </div>

            <div>
              <div className="flex justify-between text-slate-300 mb-1">
                <span>Kameravinkel / Tiltjustering:</span>
                <span className="font-mono font-bold text-sky-400">{calibration.pitchOffset > 0 ? `+${calibration.pitchOffset}°` : `${calibration.pitchOffset}°`}</span>
              </div>
              <input
                type="range"
                min={-45}
                max={45}
                step={0.5}
                value={calibration.pitchOffset}
                onChange={(e) => setCalibration({ ...calibration, pitchOffset: Number(e.target.value) })}
                className="w-full h-2 bg-slate-800 rounded appearance-none accent-sky-400"
              />
            </div>

            <div>
              <div className="flex justify-between text-slate-300 mb-1">
                <span>Synsfelt (Kamera FOV Zoom):</span>
                <span className="font-mono font-bold text-sky-400">{orientation.fov}°</span>
              </div>
              <input
                type="range"
                min={45}
                max={90}
                value={orientation.fov}
                onChange={(e) => setOrientation({ ...orientation, fov: Number(e.target.value) })}
                className="w-full h-2 bg-slate-800 rounded appearance-none accent-sky-400"
              />
            </div>

            <button
              onClick={handleResetCalibration}
              className="w-full py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition text-center font-medium"
            >
              Nullstill kalibrering & støyfilter
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
