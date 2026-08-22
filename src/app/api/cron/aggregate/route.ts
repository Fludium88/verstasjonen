import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { AggregationService } from '@/services/aggregation/aggregationService';
import { validateCronSecret, checkRateLimit, createRateLimitExceededResponse, getAnonymizedClientIp } from '@/lib/security';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return handleAggregate(req);
}

export async function POST(req: NextRequest) {
  return handleAggregate(req);
}

async function handleAggregate(req: NextRequest) {
  // 1. Rate limiting check (max 10 requests / min)
  const clientIp = getAnonymizedClientIp(req);
  const rateCheck = checkRateLimit(`cron_aggregate_${clientIp}`, 10, 60000);
  if (!rateCheck.success) {
    return createRateLimitExceededResponse(rateCheck.reset);
  }

  // 2. Secret authentication check
  const auth = validateCronSecret(req, '/api/cron/aggregate');
  if (!auth.authorized) {
    return NextResponse.json(
      { error: auth.reason || 'Uautorisert tilgang til bakgrunnsjobb' },
      { status: 401 }
    );
  }

  const db = getDb();
  const activeLocations = db.getLocations().filter((l) => l.is_active === 1);
  const results = [];

  for (const loc of activeLocations) {
    try {
      const dailies = AggregationService.computeDailySummaries(loc.id);
      const monthlies = AggregationService.computeMonthlySummaries(loc.id);

      results.push({
        location_id: loc.id,
        name: loc.name,
        daily_summaries_count: dailies.length,
        monthly_summaries_count: monthlies.length,
        status: 'SUCCESS',
      });
    } catch (err: any) {
      results.push({
        location_id: loc.id,
        name: loc.name,
        error: err.message,
        status: 'ERROR',
      });
    }
  }

  db.flush();

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    results,
  });
}
