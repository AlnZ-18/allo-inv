import { NextResponse } from 'next/server';
import { idParamSchema } from '@/server/validators/reservation.validator';
import { ReservationService } from '@/server/services/reservation.service';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 1. Resolve Next.js 16 async route params
    const resolvedParams = await params;
    
    // 2. Validate parameter format using Zod
    const validation = idParamSchema.safeParse(resolvedParams);
    if (!validation.success) {
      return NextResponse.json(
        { 
          error: 'Validation Error', 
          details: validation.error.flatten().fieldErrors 
        },
        { status: 400 }
      );
    }

    const { id } = validation.data;

    // 3. Invoke state-machine transition in transaction
    const reservation = await ReservationService.confirmReservation(id);

    return NextResponse.json(reservation, { status: 200 });
  } catch (error: any) {
    console.error(`Error confirming reservation:`, error);

    // 4. Custom API Error Mappings
    if (error.message === 'RESERVATION_NOT_FOUND') {
      return NextResponse.json(
        { error: 'Not Found', message: 'Target reservation does not exist' },
        { status: 404 }
      );
    }

    if (error.message === 'INVALID_STATE_TRANSITION') {
      return NextResponse.json(
        { error: 'Bad Request', message: 'Only pending reservations can be confirmed' },
        { status: 400 }
      );
    }

    if (error.message === 'RESERVATION_EXPIRED') {
      return NextResponse.json(
        { error: 'Gone', message: 'Reservation has expired and cannot be confirmed' },
        { status: 410 }
      );
    }

    return NextResponse.json(
      { error: 'Internal Server Error', message: error.message },
      { status: 500 }
    );
  }
}
