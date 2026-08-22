import { NextRequest, NextResponse } from 'next/server';
import { CalibrationService } from '@/services/calibration/calibrationService';
import { WEATHER_CONFIG } from '@/lib/weatherConfig';
import { BenchmarkSourceType } from '@/types/calibration';
import {
  checkRateLimit,
  createRateLimitExceededResponse,
  getAnonymizedClientIp,
  sanitizeString,
  validateCalibrationOffsets,
  validateCsrfOrigin,
  logSecurityEvent,
} from '@/lib/security';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const clientIp = getAnonymizedClientIp(req);
  const rate = checkRateLimit(`calib_get_${clientIp}`, 120, 60000);
  if (!rate.success) {
    return createRateLimitExceededResponse(rate.reset);
  }

  try {
    const { searchParams } = new URL(req.url);
    const locationId = sanitizeString(searchParams.get('locationId'), 64) || WEATHER_CONFIG.defaultLocation.id;

    const payload = await CalibrationService.getCalibrationPayload(locationId);
    return NextResponse.json(payload);
  } catch (err: any) {
    console.error('Error in /api/weather/calibration GET:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to fetch calibration data' },
      { status: err?.message === 'Location not found' ? 404 : 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const clientIp = getAnonymizedClientIp(req);

  // 1. Rate limit
  const rate = checkRateLimit(`calib_post_${clientIp}`, 40, 60000);
  if (!rate.success) {
    return createRateLimitExceededResponse(rate.reset);
  }

  // 2. CSRF Origin Check
  const csrf = validateCsrfOrigin(req, '/api/weather/calibration');
  if (!csrf.valid) {
    return NextResponse.json({ error: csrf.reason }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { action, locationId, profile, benchmarkSource } = body;

    const targetLocId = sanitizeString(locationId, 64) || WEATHER_CONFIG.defaultLocation.id;

    if (action === 'auto_calibrate') {
      const allowedSources: BenchmarkSourceType[] = ['locationforecast', 'frost_station', 'open_meteo', 'custom_sensor'];
      const source: BenchmarkSourceType = allowedSources.includes(benchmarkSource) ? benchmarkSource : 'locationforecast';
      const updatedPayload = await CalibrationService.autoCalibrate(targetLocId, source);
      
      logSecurityEvent({
        type: 'SETTINGS_CHANGED',
        endpoint: '/api/weather/calibration',
        ipMasked: clientIp,
        details: `Autokalibrering utført for ${targetLocId} mot kilde ${source}`,
        severity: 'info',
      });

      return NextResponse.json({ success: true, payload: updatedPayload });
    }

    if (action === 'reset') {
      const resetProfile = CalibrationService.resetProfile(targetLocId);
      const updatedPayload = await CalibrationService.getCalibrationPayload(targetLocId);

      logSecurityEvent({
        type: 'SETTINGS_CHANGED',
        endpoint: '/api/weather/calibration',
        ipMasked: clientIp,
        details: `Kalibreringsprofil tilbakestilt for ${targetLocId}`,
        severity: 'info',
      });

      return NextResponse.json({ success: true, profile: resetProfile, payload: updatedPayload });
    }

    // Save custom profile with strict offset boundary checks
    if (profile) {
      if (profile.offsets) {
        const offsetCheck = validateCalibrationOffsets(profile.offsets);
        if (!offsetCheck.valid) {
          logSecurityEvent({
            type: 'INVALID_INPUT',
            endpoint: '/api/weather/calibration',
            ipMasked: clientIp,
            details: `Avviste ugyldige kalibreringsoffsets: ${offsetCheck.error}`,
            severity: 'warn',
          });
          return NextResponse.json({ error: offsetCheck.error }, { status: 400 });
        }
        profile.offsets = offsetCheck.cleaned;
      }

      const safeProfile = {
        ...profile,
        location_id: targetLocId,
        custom_sensor_name: profile.custom_sensor_name ? sanitizeString(profile.custom_sensor_name, 100) : undefined,
        auto_calibration_notes: profile.auto_calibration_notes ? sanitizeString(profile.auto_calibration_notes, 250) : undefined,
      };

      const saved = CalibrationService.saveProfile(safeProfile);
      const updatedPayload = await CalibrationService.getCalibrationPayload(targetLocId);

      logSecurityEvent({
        type: 'SETTINGS_CHANGED',
        endpoint: '/api/weather/calibration',
        ipMasked: clientIp,
        details: `Lagret tilpassede kalibreringsoffsets for ${targetLocId}`,
        severity: 'info',
      });

      return NextResponse.json({ success: true, profile: saved, payload: updatedPayload });
    }

    return NextResponse.json({ error: 'Ugyldig handling eller manglende kalibreringsprofil' }, { status: 400 });
  } catch (err: any) {
    console.error('Error in /api/weather/calibration POST:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to process calibration request' },
      {
        status:
          err?.message === 'Location not found'
            ? 404
            : String(err?.message || '').startsWith('Kan ikke kalibrere') ||
                err?.message === 'Ukjent kalibreringskilde'
              ? 400
              : 500,
      }
    );
  }
}
