import { NextResponse } from 'next/server';
import { createReservationSchema } from '@/server/validators/reservation.validator';
import { ReservationService } from '@/server/services/reservation.service';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    
    // 1. Zod input validation
    const validation = createReservationSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { 
          error: 'Validation Error', 
          details: validation.error.flatten().fieldErrors 
        },
        { status: 400 }
      );
    }

    // 2. Call service layer (concurrency safe with pessimistic FOR UPDATE locking)
    const reservation = await ReservationService.createReservation(validation.data);

    return NextResponse.json(reservation, { status: 201 });
  } catch (error: any) {
    console.error('Error creating reservation:', error);

    // 3. Error code mapping
    if (error.message === 'INVENTORY_NOT_FOUND') {
      return NextResponse.json(
        { error: 'Not Found', message: 'Target inventory item does not exist' },
        { status: 404 }
      );
    }

    if (error.message === 'INSUFFICIENT_STOCK') {
      return NextResponse.json(
        { error: 'Insufficient Stock', message: 'Requested quantity exceeds available stock' },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: 'Internal Server Error', message: error.message },
      { status: 500 }
    );
  }
}
