import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { idParamSchema } from '@/server/validators/reservation.validator';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 1. Resolve Next.js 16 async route params
    const resolvedParams = await params;
    
    // 2. Validate id parameter using Zod
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

    // 3. Fetch reservation including related product and warehouse through inventory
    const reservation = await prisma.reservation.findUnique({
      where: { id },
      include: {
        inventory: {
          include: {
            product: true,
            warehouse: true,
          },
        },
      },
    });

    if (!reservation) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Reservation not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(reservation, { status: 200 });
  } catch (error: any) {
    console.error('Error fetching reservation:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: error.message },
      { status: 500 }
    );
  }
}
