import { NextResponse } from 'next/server';
import { ReservationService } from '@/server/services/reservation.service';

// Force dynamic execution to prevent Next.js from caching cron responses
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    console.log('[API Cron] Cleanup endpoint triggered');

    // 1. Extract authorization header
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    // 2. Validate token security
    if (!cronSecret) {
      console.warn('[API Cron] WARNING: CRON_SECRET environment variable is not defined on the server!');
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Cron secret is not configured on the server' },
        { status: 401 }
      );
    }

    if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
      console.warn('[API Cron] Unauthorized access attempt detected');
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Invalid or missing cron bearer token' },
        { status: 401 }
      );
    }

    // 3. Trigger service layer cleanup (safe with pessimistic row-locking transactions)
    console.log('[API Cron] Token authorized. Starting expired reservations cleanup...');
    const result = await ReservationService.cleanupExpiredReservations();

    console.log(`[API Cron] Cleanup completed. Result: ${JSON.stringify(result)}`);

    return NextResponse.json(result, { status: 200 });
  } catch (error: any) {
    console.error('[API Cron] Critical error in cleanup handler:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: error.message },
      { status: 500 }
    );
  }
}
