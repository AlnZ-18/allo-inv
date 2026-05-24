import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// Force dynamic execution to bypass Next.js build-time caching and ensure fresh inventory reads
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const products = await prisma.product.findMany({
      include: {
        inventories: {
          include: {
            warehouse: true,
          },
        },
      },
      orderBy: {
        name: 'asc',
      },
    });

    const responseData = products.map((product) => ({
      id: product.id,
      name: product.name,
      description: product.description,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
      inventories: product.inventories.map((inv) => ({
        id: inv.id,
        warehouseId: inv.warehouseId,
        warehouseName: inv.warehouse.name,
        location: inv.warehouse.location,
        totalUnits: inv.totalUnits,
        reservedUnits: inv.reservedUnits,
        availableUnits: inv.totalUnits - inv.reservedUnits,
      })),
    }));

    return NextResponse.json(responseData, { status: 200 });
  } catch (error: any) {
    console.error('Error fetching products:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: error.message },
      { status: 500 }
    );
  }
}
