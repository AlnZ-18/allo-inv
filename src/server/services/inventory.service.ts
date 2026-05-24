import prisma from '@/lib/prisma';

export interface CreateInventoryInput {
  productId: string;
  warehouseId: string;
  totalUnits: number;
}

export class InventoryService {
  /**
   * Fetches inventory for a product-warehouse combination.
   * Calculates available units dynamically as (totalUnits - reservedUnits).
   */
  static async getInventory(productId: string, warehouseId: string) {
    const inventory = await prisma.inventory.findUnique({
      where: {
        productId_warehouseId: {
          productId,
          warehouseId,
        },
      },
      include: {
        product: true,
        warehouse: true,
      },
    });

    if (!inventory) {
      return null;
    }

    return {
      ...inventory,
      availableUnits: inventory.totalUnits - inventory.reservedUnits,
    };
  }

  /**
   * Creates initial stock record for a product at a warehouse.
   */
  static async createInventory(input: CreateInventoryInput) {
    return prisma.inventory.create({
      data: {
        productId: input.productId,
        warehouseId: input.warehouseId,
        totalUnits: input.totalUnits,
        reservedUnits: 0,
      },
    });
  }

  /**
   * Quick status overview of all inventories.
   */
  static async listInventory() {
    const inventories = await prisma.inventory.findMany({
      include: {
        product: true,
        warehouse: true,
      },
    });

    return inventories.map((inv) => ({
      ...inv,
      availableUnits: inv.totalUnits - inv.reservedUnits,
    }));
  }
}
