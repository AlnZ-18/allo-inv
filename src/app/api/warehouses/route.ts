import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// Force dynamic execution to bypass Next.js build-time caching and ensure fresh inventory reads
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const warehouses = await prisma.warehouse.findMany({
      include: {
        inventories: {
          include: {
            product: true,
          },
        },
      },
      orderBy: {
        name: 'asc',
      },
    });

    const responseData = warehouses.map((warehouse) => ({
      id: warehouse.id,
      name: warehouse.name,
      location: warehouse.location,
      createdAt: warehouse.createdAt,
      updatedAt: warehouse.updatedAt,
      inventories: warehouse.inventories.map((inv) => ({
        id: inv.id,
        productId: inv.productId,
        productName: inv.product.name,
        description: inv.product.description,
        totalUnits: inv.totalUnits,
        reservedUnits: inv.reservedUnits,
        availableUnits: inv.totalUnits - inv.reservedUnits,
      })),
    }));

    return NextResponse.json(responseData, { status: 200 });
  } catch (error: any) {
    console.error('Error fetching warehouses:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: error.message },
      { status: 500 }
    );
  }
}
