'use client';

import React, { useRef, useEffect, useCallback } from 'react';
import {
  SkyArcData,
  CelestialArcPoint,
  MoonIlluminationData,
  AROrientationState,
  ARCalibrationSettings,
} from '@/types/astronomy';
import { AstronomyService } from '@/services/astronomy/astronomyService';

interface SkyArcCanvasProps {
  skyArcs: SkyArcData;
  activeSunPoint: CelestialArcPoint;
  activeMoonPoint: CelestialArcPoint;
  moonIllumination: MoonIlluminationData;
  orientation: AROrientationState;
  calibration: ARCalibrationSettings;
  isVirtualMode: boolean;
  selectedTimeFormatted: string;
}

export const SkyArcCanvas: React.FC<SkyArcCanvasProps> = ({
  skyArcs,
  activeSunPoint,
  activeMoonPoint,
  moonIllumination,
  orientation,
  calibration,
  isVirtualMode,
  selectedTimeFormatted,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Effective camera orientation including calibration offsets
  const effectiveHeading = ((orientation.heading + calibration.headingOffset) % 360 + 360) % 360;
  const effectivePitch = Math.max(-89, Math.min(89, orientation.pitch + calibration.pitchOffset));
  const effectiveRoll = orientation.roll;
  const fov = orientation.fov || 65;

  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (width === 0 || height === 0) return;

    // Retina / High-DPI scaling
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
    }

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    // ─────────────────────────────────────────────────────────────
    // 1. VIRTUAL SKY BACKDROP (Only when no camera is streaming)
    // ─────────────────────────────────────────────────────────────
    if (isVirtualMode) {
      // Determine sky gradient based on active sun altitude
      const sunAlt = activeSunPoint.altitude;
      let topColor = '#0b1329';
      let horColor = '#1e293b';
      let groundColor = '#0f172a';

      if (sunAlt > 10) {
        // Broad daylight
        topColor = '#0284c7';
        horColor = '#7dd3fc';
        groundColor = '#0f172a';
      } else if (sunAlt > 0) {
        // Golden hour / sunrise / sunset
        topColor = '#1e3a8a';
        horColor = '#f59e0b';
        groundColor = '#18181b';
      } else if (sunAlt > -6) {
        // Civil twilight
        topColor = '#1e1b4b';
        horColor = '#f97316';
        groundColor = '#09090b';
      } else if (sunAlt > -12) {
        // Nautical twilight
        topColor = '#0f172a';
        horColor = '#6366f1';
        groundColor = '#020617';
      } else {
        // Night
        topColor = '#030712';
        horColor = '#0f172a';
        groundColor = '#020617';
      }

      // Draw virtual sky gradient based on pitch
      // Horizon projected Y position in center of screen if pitch = 0
      const horizonCenter = AstronomyService.projectCelestialToScreen(
        effectiveHeading,
        0,
        effectiveHeading,
        effectivePitch,
        effectiveRoll,
        fov,
        width,
        height
      );

      const skyGrad = ctx.createLinearGradient(0, 0, 0, height);
      skyGrad.addColorStop(0, topColor);
      skyGrad.addColorStop(0.65, horColor);
      skyGrad.addColorStop(1, groundColor);
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, width, height);

      // Stars background at night
      if (sunAlt < -6) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
        // Fixed pseudo-random star field mapped into celestial sphere
        const starSeed = [
          [20, 35], [50, 60], [80, 25], [110, 50], [140, 75], [170, 30],
          [200, 65], [230, 40], [260, 55], [290, 20], [320, 70], [350, 45],
          [35, 15], [95, 80], [155, 18], [215, 82], [275, 12], [335, 62],
          [10, 50], [70, 40], [130, 60], [190, 50], [250, 70], [310, 35]
        ];
        starSeed.forEach(([az, alt], idx) => {
          const starProj = AstronomyService.projectCelestialToScreen(
            az,
            alt,
            effectiveHeading,
            effectivePitch,
            effectiveRoll,
            fov,
            width,
            height
          );
          if (starProj.isVisible) {
            ctx.beginPath();
            ctx.arc(starProj.x, starProj.y, (idx % 3 === 0 ? 1.5 : 1), 0, Math.PI * 2);
            ctx.fill();
          }
        });
      }
    }

    // ─────────────────────────────────────────────────────────────
    // 2. HORIZON LINE & CARDINAL COMPASS POINTS
    // ─────────────────────────────────────────────────────────────
    if (calibration.showHorizonLine) {
      // Draw smooth horizon line by sampling azimuth 0..360 every 5 deg
      ctx.beginPath();
      let firstPoint = true;
      for (let az = 0; az <= 360; az += 5) {
        const proj = AstronomyService.projectCelestialToScreen(
          az,
          0,
          effectiveHeading,
          effectivePitch,
          effectiveRoll,
          fov,
          width,
          height
        );
        if (proj.inFront) {
          if (firstPoint) {
            ctx.moveTo(proj.x, proj.y);
            firstPoint = false;
          } else {
            ctx.lineTo(proj.x, proj.y);
          }
        } else {
          firstPoint = true;
        }
      }
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Cardinal direction markers on horizon
    if (calibration.showCompassCardinals) {
      const cardinals = [
        { name: 'N', az: 0, major: true },
        { name: 'NØ', az: 45, major: false },
        { name: 'Ø', az: 90, major: true },
        { name: 'SØ', az: 135, major: false },
        { name: 'S', az: 180, major: true },
        { name: 'SV', az: 225, major: false },
        { name: 'V', az: 270, major: true },
        { name: 'NV', az: 315, major: false },
      ];

      ctx.font = 'bold 12px ui-sans-serif, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      cardinals.forEach(({ name, az, major }) => {
        const proj = AstronomyService.projectCelestialToScreen(
          az,
          0,
          effectiveHeading,
          effectivePitch,
          effectiveRoll,
          fov,
          width,
          height
        );

        if (proj.isVisible) {
          // Draw tick mark
          ctx.beginPath();
          ctx.moveTo(proj.x, proj.y - (major ? 10 : 5));
          ctx.lineTo(proj.x, proj.y + (major ? 10 : 5));
          ctx.strokeStyle = major ? 'rgba(56, 189, 248, 0.9)' : 'rgba(148, 163, 184, 0.6)';
          ctx.lineWidth = major ? 2 : 1;
          ctx.stroke();

          // Draw label background pill
          const text = `${name} ${az}°`;
          const textWidth = ctx.measureText(text).width;
          ctx.fillStyle = major ? 'rgba(15, 23, 42, 0.85)' : 'rgba(15, 23, 42, 0.65)';
          ctx.strokeStyle = major ? 'rgba(56, 189, 248, 0.5)' : 'rgba(148, 163, 184, 0.3)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(proj.x - textWidth / 2 - 6, proj.y + 12, textWidth + 12, 20, 6);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = major ? '#38bdf8' : '#cbd5e1';
          ctx.fillText(text, proj.x, proj.y + 22);
        }
      });
    }

    // ─────────────────────────────────────────────────────────────
    // 3. HELPER TO DRAW CELESTIAL CURVES (Continuous Arc Segments)
    // ─────────────────────────────────────────────────────────────
    const drawCelestialArc = (
      points: CelestialArcPoint[],
      strokeColor: string,
      lineWidth: number,
      dash: number[] = [],
      glowColor?: string
    ) => {
      if (!points || points.length < 2) return;

      if (glowColor) {
        ctx.shadowColor = glowColor;
        ctx.shadowBlur = 10;
      } else {
        ctx.shadowBlur = 0;
      }

      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = lineWidth;
      ctx.setLineDash(dash);

      let isDrawing = false;
      let prevProj: { x: number; y: number; isVisible: boolean; inFront: boolean } | null = null;

      for (let i = 0; i < points.length; i++) {
        const pt = points[i];
        const proj = AstronomyService.projectCelestialToScreen(
          pt.azimuth,
          pt.altitude,
          effectiveHeading,
          effectivePitch,
          effectiveRoll,
          fov,
          width,
          height
        );

        if (proj.inFront) {
          if (!isDrawing) {
            ctx.beginPath();
            ctx.moveTo(proj.x, proj.y);
            isDrawing = true;
          } else {
            // Check for large discontinuous jump (e.g. crossing canvas border)
            if (prevProj && Math.hypot(proj.x - prevProj.x, proj.y - prevProj.y) > width * 0.7) {
              ctx.stroke();
              ctx.beginPath();
              ctx.moveTo(proj.x, proj.y);
            } else {
              ctx.lineTo(proj.x, proj.y);
            }
          }
        } else {
          if (isDrawing) {
            ctx.stroke();
            isDrawing = false;
          }
        }
        prevProj = proj;
      }

      if (isDrawing) {
        ctx.stroke();
      }

      // Reset shadow & dash
      ctx.shadowBlur = 0;
      ctx.setLineDash([]);
    };

    // ─────────────────────────────────────────────────────────────
    // 4. SOLSTICE REFERENCE ARCS (Sommer- & Vintersolverv)
    // ─────────────────────────────────────────────────────────────
    if (calibration.showSolstices) {
      // Sommersolverv (21. juni)
      if (skyArcs.summerSolsticeSunArc) {
        drawCelestialArc(
          skyArcs.summerSolsticeSunArc,
          'rgba(251, 191, 36, 0.45)', // Amber dashed
          1.5,
          [6, 6]
        );
      }

      // Vintersolverv (21. desember)
      if (skyArcs.winterSolsticeSunArc) {
        drawCelestialArc(
          skyArcs.winterSolsticeSunArc,
          'rgba(147, 197, 253, 0.45)', // Blue dashed
          1.5,
          [6, 6]
        );
      }
    }

    // ─────────────────────────────────────────────────────────────
    // 5. THE MOON PATH ARC (Månebane)
    // ─────────────────────────────────────────────────────────────
    if (calibration.showMoonArc && skyArcs.moonArc) {
      drawCelestialArc(
        skyArcs.moonArc,
        'rgba(186, 230, 253, 0.8)', // Silver/Cyan
        2.5,
        [8, 4],
        'rgba(56, 189, 248, 0.6)'
      );
    }

    // ─────────────────────────────────────────────────────────────
    // 6. THE SUN PATH ARC (Dagens Solbane)
    // ─────────────────────────────────────────────────────────────
    if (calibration.showSunArc && skyArcs.sunArc) {
      // Draw golden glow underlay
      drawCelestialArc(
        skyArcs.sunArc,
        'rgba(245, 158, 11, 0.85)', // Warm Amber Glow
        3.5,
        [],
        'rgba(251, 191, 36, 0.9)'
      );

      // Draw crisp golden core line
      drawCelestialArc(
        skyArcs.sunArc,
        '#fef08a', // Light yellow core
        1.5,
        []
      );

      // Hour tick marks along Sun arc
      if (calibration.showHourMarks) {
        ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Sample every 2 hours (120 min) or key hours (06, 09, 12, 15, 18, 21)
        skyArcs.sunArc.forEach((pt) => {
          if (pt.minutesFromMidnight % 120 === 0 && pt.altitude > -5) {
            const proj = AstronomyService.projectCelestialToScreen(
              pt.azimuth,
              pt.altitude,
              effectiveHeading,
              effectivePitch,
              effectiveRoll,
              fov,
              width,
              height
            );

            if (proj.isVisible) {
              // Dot on arc
              ctx.beginPath();
              ctx.arc(proj.x, proj.y, 3, 0, Math.PI * 2);
              ctx.fillStyle = '#fbbf24';
              ctx.fill();

              // Badge
              const text = pt.displayTime;
              const tw = ctx.measureText(text).width;
              ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
              ctx.strokeStyle = 'rgba(251, 191, 36, 0.5)';
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.roundRect(proj.x - tw / 2 - 4, proj.y - 18, tw + 8, 14, 4);
              ctx.fill();
              ctx.stroke();

              ctx.fillStyle = '#fde68a';
              ctx.fillText(text, proj.x, proj.y - 11);
            }
          }
        });
      }
    }

    // ─────────────────────────────────────────────────────────────
    // 7. ACTIVE MOON ORB & PHASE
    // ─────────────────────────────────────────────────────────────
    const moonProj = AstronomyService.projectCelestialToScreen(
      activeMoonPoint.azimuth,
      activeMoonPoint.altitude,
      effectiveHeading,
      effectivePitch,
      effectiveRoll,
      fov,
      width,
      height
    );

    if (moonProj.isVisible) {
      const radius = 18;

      // Glow behind moon
      const moonGlow = ctx.createRadialGradient(
        moonProj.x,
        moonProj.y,
        radius * 0.5,
        moonProj.x,
        moonProj.y,
        radius * 2.5
      );
      moonGlow.addColorStop(0, 'rgba(186, 230, 253, 0.5)');
      moonGlow.addColorStop(1, 'rgba(186, 230, 253, 0)');
      ctx.fillStyle = moonGlow;
      ctx.beginPath();
      ctx.arc(moonProj.x, moonProj.y, radius * 2.5, 0, Math.PI * 2);
      ctx.fill();

      // Moon Disk (Dark background)
      ctx.fillStyle = '#1e293b';
      ctx.strokeStyle = 'rgba(224, 242, 254, 0.8)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(moonProj.x, moonProj.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Moon Illumination Phase rendering
      const fraction = moonIllumination.fraction;
      const phaseAngle = moonIllumination.phaseAngle;
      const isWaxing = phaseAngle < 180;

      ctx.save();
      ctx.beginPath();
      ctx.arc(moonProj.x, moonProj.y, radius, 0, Math.PI * 2);
      ctx.clip();

      ctx.fillStyle = '#f0f9ff'; // Bright illuminated side
      if (fraction >= 0.98) {
        // Full moon
        ctx.fill();
      } else if (fraction <= 0.02) {
        // New moon (keep dark disk)
      } else {
        // Render crescent / gibbous phase shape
        const litRadiusX = radius * Math.cos((phaseAngle * Math.PI) / 180);
        ctx.beginPath();
        if (isWaxing) {
          // Waxing (Right side illuminated)
          ctx.arc(moonProj.x, moonProj.y, radius, -Math.PI / 2, Math.PI / 2, false);
          ctx.ellipse(moonProj.x, moonProj.y, Math.abs(litRadiusX), radius, 0, Math.PI / 2, -Math.PI / 2, litRadiusX > 0);
        } else {
          // Waning (Left side illuminated)
          ctx.arc(moonProj.x, moonProj.y, radius, Math.PI / 2, -Math.PI / 2, false);
          ctx.ellipse(moonProj.x, moonProj.y, Math.abs(litRadiusX), radius, 0, -Math.PI / 2, Math.PI / 2, litRadiusX > 0);
        }
        ctx.fill();
      }
      ctx.restore();

      // Moon Info Label
      ctx.font = 'bold 11px ui-sans-serif, system-ui, sans-serif';
      ctx.textAlign = 'center';
      const label = `🌙 Måne ${activeMoonPoint.altitude > 0 ? `+${activeMoonPoint.altitude}°` : `${activeMoonPoint.altitude}°`}`;
      const subLabel = `${moonIllumination.phaseName} (${moonIllumination.percentage} %)`;
      const lw = Math.max(ctx.measureText(label).width, ctx.measureText(subLabel).width);

      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.strokeStyle = 'rgba(186, 230, 253, 0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(moonProj.x - lw / 2 - 8, moonProj.y + radius + 6, lw + 16, 32, 6);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#e0f2fe';
      ctx.fillText(label, moonProj.x, moonProj.y + radius + 18);
      ctx.font = '9px ui-sans-serif, system-ui, sans-serif';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(subLabel, moonProj.x, moonProj.y + radius + 30);
    }

    // ─────────────────────────────────────────────────────────────
    // 8. ACTIVE SUN ORB (Glow, Corona, Rays)
    // ─────────────────────────────────────────────────────────────
    const sunProj = AstronomyService.projectCelestialToScreen(
      activeSunPoint.azimuth,
      activeSunPoint.altitude,
      effectiveHeading,
      effectivePitch,
      effectiveRoll,
      fov,
      width,
      height
    );

    if (sunProj.isVisible) {
      const radius = 22;

      // Outer Corona Glow
      const corona = ctx.createRadialGradient(
        sunProj.x,
        sunProj.y,
        radius * 0.4,
        sunProj.x,
        sunProj.y,
        radius * 3.5
      );
      corona.addColorStop(0, 'rgba(254, 240, 138, 0.9)');
      corona.addColorStop(0.3, 'rgba(245, 158, 11, 0.6)');
      corona.addColorStop(0.7, 'rgba(239, 68, 68, 0.2)');
      corona.addColorStop(1, 'rgba(239, 68, 68, 0)');

      ctx.fillStyle = corona;
      ctx.beginPath();
      ctx.arc(sunProj.x, sunProj.y, radius * 3.5, 0, Math.PI * 2);
      ctx.fill();

      // Sun core orb
      const coreGrad = ctx.createRadialGradient(
        sunProj.x - radius * 0.3,
        sunProj.y - radius * 0.3,
        2,
        sunProj.x,
        sunProj.y,
        radius
      );
      coreGrad.addColorStop(0, '#ffffff');
      coreGrad.addColorStop(0.4, '#fef08a');
      coreGrad.addColorStop(1, '#f59e0b');

      ctx.fillStyle = coreGrad;
      ctx.shadowColor = '#f59e0b';
      ctx.shadowBlur = 15;
      ctx.beginPath();
      ctx.arc(sunProj.x, sunProj.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Sun Info Label Pill
      ctx.font = 'bold 11px ui-sans-serif, system-ui, sans-serif';
      ctx.textAlign = 'center';
      const sunLabel = `☀️ Sol kl. ${selectedTimeFormatted}`;
      const sunSubLabel = `${activeSunPoint.altitude > 0 ? `+${activeSunPoint.altitude}°` : `${activeSunPoint.altitude}°`} • Azimut ${activeSunPoint.azimuth}° (${activeSunPoint.isAboveHorizon ? 'Opp' : 'Under horisont'})`;
      const slw = Math.max(ctx.measureText(sunLabel).width, ctx.measureText(sunSubLabel).width);

      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.6)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(sunProj.x - slw / 2 - 8, sunProj.y + radius + 8, slw + 16, 32, 6);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#fef08a';
      ctx.fillText(sunLabel, sunProj.x, sunProj.y + radius + 20);
      ctx.font = '9px ui-sans-serif, system-ui, sans-serif';
      ctx.fillStyle = '#cbd5e1';
      ctx.fillText(sunSubLabel, sunProj.x, sunProj.y + radius + 32);
    }

    // ─────────────────────────────────────────────────────────────
    // 9. AIM RETICLE / CENTER CROSSHAIR
    // ─────────────────────────────────────────────────────────────
    const cx = width / 2;
    const cy = height / 2;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, 14, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx - 20, cy);
    ctx.lineTo(cx - 6, cy);
    ctx.moveTo(cx + 6, cy);
    ctx.lineTo(cx + 20, cy);
    ctx.moveTo(cx, cy - 20);
    ctx.lineTo(cx, cy - 6);
    ctx.moveTo(cx, cy + 6);
    ctx.lineTo(cx, cy + 20);
    ctx.stroke();

    ctx.restore();
  }, [
    skyArcs,
    activeSunPoint,
    activeMoonPoint,
    moonIllumination,
    effectiveHeading,
    effectivePitch,
    effectiveRoll,
    fov,
    calibration,
    isVirtualMode,
    selectedTimeFormatted,
  ]);

  useEffect(() => {
    renderCanvas();
  }, [renderCanvas]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
    />
  );
};
