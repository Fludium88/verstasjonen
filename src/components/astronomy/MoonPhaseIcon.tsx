'use client';

import React from 'react';

interface MoonPhaseIconProps {
  fraction?: number; // 0.0 to 1.0
  phaseAngle?: number; // 0 to 360 deg (0=New, 90=1st qtr, 180=Full, 270=3rd qtr)
  size?: number; // px, default 36
  className?: string;
  showGlow?: boolean;
}

export const MoonPhaseIcon: React.FC<MoonPhaseIconProps> = ({
  fraction = 0.5,
  phaseAngle,
  size = 36,
  className = '',
  showGlow = true,
}) => {
  // If phaseAngle is not provided, estimate from fraction
  const angle = phaseAngle !== undefined ? ((phaseAngle % 360) + 360) % 360 : fraction * 360;
  const isWaxing = angle >= 0 && angle < 180;
  const isCrescent = angle < 90 || angle > 270;

  const R = 44; // base coordinate radius
  const cx = 50;
  const cy = 50;

  // Terminator semi-minor radius
  const rad = (angle * Math.PI) / 180;
  const rx = Math.max(0.1, R * Math.abs(Math.cos(rad)));

  // Build SVG path for illuminated region
  let illuminatedPath = '';
  const isFull = fraction > 0.985 || Math.abs(angle - 180) < 3;
  const isNew = fraction < 0.015 || angle < 3 || angle > 357;

  if (isFull) {
    illuminatedPath = `M ${cx} ${cy - R} A ${R} ${R} 0 1 1 ${cx} ${cy + R} A ${R} ${R} 0 1 1 ${cx} ${cy - R} Z`;
  } else if (!isNew) {
    if (isWaxing) {
      // Right limb is lit
      const sweepTerminator = isCrescent ? 0 : 1;
      illuminatedPath = `M ${cx} ${cy - R} A ${R} ${R} 0 0 1 ${cx} ${cy + R} A ${rx} ${R} 0 0 ${sweepTerminator} ${cx} ${cy - R} Z`;
    } else {
      // Left limb is lit
      const sweepTerminator = isCrescent ? 1 : 0;
      illuminatedPath = `M ${cx} ${cy - R} A ${R} ${R} 0 0 0 ${cx} ${cy + R} A ${rx} ${R} 0 0 ${sweepTerminator} ${cx} ${cy - R} Z`;
    }
  }

  const gradientId = `moon-glow-${Math.round(angle)}-${size}`;
  const craterMaskId = `moon-crater-mask-${Math.round(angle)}-${size}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={`shrink-0 drop-shadow-sm select-none ${className}`}
      aria-label={`Månefase ${(fraction * 100).toFixed(0)}%`}
    >
      <defs>
        {/* Glowing illumination gradient */}
        <radialGradient id={gradientId} cx="35%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="60%" stopColor="#f1f5f9" />
          <stop offset="100%" stopColor="#cbd5e1" />
        </radialGradient>

        {/* Mask for craters inside the illuminated part */}
        {illuminatedPath && (
          <mask id={craterMaskId}>
            <rect x="0" y="0" width="100" height="100" fill="black" />
            <path d={illuminatedPath} fill="white" />
          </mask>
        )}
      </defs>

      {/* Outer ambient glow if full or gibbous */}
      {showGlow && fraction > 0.4 && (
        <circle
          cx={cx}
          cy={cy}
          r={R + 4}
          fill="none"
          stroke="#93c5fd"
          strokeWidth="3"
          strokeOpacity={fraction * 0.25}
          className="blur-[2px]"
        />
      )}

      {/* Dark background disk */}
      <circle
        cx={cx}
        cy={cy}
        r={R}
        fill="#0f172a"
        stroke="#334155"
        strokeWidth="2"
      />

      {/* Background subtle craters in shadow */}
      <g fill="#1e293b" opacity="0.4">
        <circle cx="36" cy="42" r="9" />
        <circle cx="64" cy="38" r="7" />
        <circle cx="48" cy="68" r="11" />
        <circle cx="62" cy="62" r="6" />
        <circle cx="38" cy="26" r="5" />
      </g>

      {/* Illuminated body */}
      {illuminatedPath && (
        <path
          d={illuminatedPath}
          fill={`url(#${gradientId})`}
          filter={showGlow ? 'drop-shadow(0 0 4px rgba(226, 232, 240, 0.4))' : undefined}
        />
      )}

      {/* Realistic craters in illuminated portion */}
      {illuminatedPath && (
        <g fill="#94a3b8" opacity="0.28" mask={`url(#${craterMaskId})`}>
          {/* Mare Crisium */}
          <ellipse cx="68" cy="38" rx="8" ry="6" transform="rotate(-15 68 38)" />
          {/* Mare Tranquillitatis */}
          <ellipse cx="56" cy="46" rx="10" ry="7" />
          {/* Mare Serenitatis */}
          <circle cx="52" cy="32" r="8" />
          {/* Oceanus Procellarum */}
          <ellipse cx="32" cy="48" rx="13" ry="11" />
          {/* Mare Imbrium */}
          <ellipse cx="36" cy="32" rx="11" ry="9" />
          {/* Tycho crater rays */}
          <circle cx="48" cy="74" r="5" fill="#e2e8f0" opacity="0.5" />
          <circle cx="48" cy="74" r="2.5" fill="#64748b" />
        </g>
      )}

      {/* Subtle outer border ring */}
      <circle
        cx={cx}
        cy={cy}
        r={R}
        fill="none"
        stroke="#475569"
        strokeWidth="1.5"
        strokeOpacity="0.5"
      />
    </svg>
  );
};
