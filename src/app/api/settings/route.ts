import { NextRequest, NextResponse } from 'next/server';
import { FrostService } from '@/services/frost/frostService';
import { getDb } from '@/lib/db';
import {
  checkRateLimit,
  createRateLimitExceededResponse,
  getAnonymizedClientIp,
  maskSecret,
  sanitizeString,
  validateCsrfOrigin,
} from '@/lib/security';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const clientIp = getAnonymizedClientIp(req);
  const rate = checkRateLimit(`settings_get_${clientIp}`, 60, 60000);
  if (!rate.success) {
    return createRateLimitExceededResponse(rate.reset);
  }

  const rawFrostKey = FrostService.getFrostClientId();
  const hasKey = Boolean(rawFrostKey && rawFrostKey.trim().length > 0);
  const maskedKey = hasKey ? maskSecret(rawFrostKey, 4, 4) : '';

  return NextResponse.json({
    frost_client_id: maskedKey,
    has_frost_key: hasKey,
    app_version: '1.0.0',
  });
}

export async function POST(req: NextRequest) {
  const clientIp = getAnonymizedClientIp(req);

  const rate = checkRateLimit(`settings_post_${clientIp}`, 10, 5 * 60000);
  if (!rate.success) {
    return createRateLimitExceededResponse(rate.reset);
  }

  // 2. CSRF Origin validation
  const csrf = validateCsrfOrigin(req, '/api/settings');
  if (!csrf.valid) {
    return NextResponse.json({ error: csrf.reason }, { status: 403 });
  }

  try {
    const contentLength = Number(req.headers.get('content-length') || 0);
    if (contentLength > 16 * 1024) {
      return NextResponse.json({ error: 'Forespørselen er for stor' }, { status: 413 });
    }
    const body = await req.json();

    // Action: Validate Frost Key
    if (body.action === 'validate_frost') {
      const candidateKey = typeof body.frost_client_id === 'string' ? body.frost_client_id.trim() : '';
      const keyToValidate = candidateKey.includes('•') ? FrostService.getFrostClientId() || '' : candidateKey;
      const result = await FrostService.validateFrostClientId(keyToValidate);
      return NextResponse.json({ success: true, validation: result });
    }

    // Action: Update Frost Key
    if (body.frost_client_id !== undefined) {
      const newKey = sanitizeString(body.frost_client_id, 128);
      if (!newKey.includes('•')) {
        FrostService.setFrostClientId(newKey);
        getDb().flush();
      }
    }

    const currentKey = FrostService.getFrostClientId();
    const hasKey = Boolean(currentKey && currentKey.trim().length > 0);

    return NextResponse.json({
      success: true,
      has_frost_key: hasKey,
      frost_client_id: hasKey ? maskSecret(currentKey, 4, 4) : '',
    });
  } catch {
    return NextResponse.json({ error: 'Ugyldig forespørsel' }, { status: 400 });
  }
}
