import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🌱 Starting database seeding...');

  // 1. Clear existing records in a safe order due to foreign key constraints
  console.log('🧹 Clearing existing database records...');
  await prisma.$transaction([
    prisma.reservation.deleteMany(),
    prisma.inventory.deleteMany(),
    prisma.product.deleteMany(),
    prisma.warehouse.deleteMany(),
  ]);
  console.log('✨ Database cleared.');

  // 2. Seed Products
  console.log('📦 Seeding Products...');
  const products = await Promise.all([
    prisma.product.create({
      data: {
        name: 'iPhone 15 Pro Max',
        description: 'Titanium design, A17 Pro chip, 256GB storage.',
      },
    }),
    prisma.product.create({
      data: {
        name: 'MacBook Pro 16-inch',
        description: 'Apple M3 Max chip, 36GB RAM, 1TB SSD.',
      },
    }),
    prisma.product.create({
      data: {
        name: 'iPad Pro 11-inch',
        description: 'Ultra Retina XDR display, Apple M4 chip, 512GB.',
      },
    }),
  ]);
  console.log(`✓ Seeded ${products.length} products.`);

  // 3. Seed Warehouses
  console.log('🏢 Seeding Warehouses...');
  const warehouses = await Promise.all([
    prisma.warehouse.create({
      data: {
        name: 'Seattle Logistics Hub',
        location: 'Seattle, WA, USA',
      },
    }),
    prisma.warehouse.create({
      data: {
        name: 'New York Fulfillment Center',
        location: 'Brooklyn, NY, USA',
      },
    }),
    prisma.warehouse.create({
      data: {
        name: 'Frankfurt Central Distribution',
        location: 'Frankfurt, Germany',
      },
    }),
  ]);
  console.log(`✓ Seeded ${warehouses.length} warehouses.`);

  // 4. Seed Inventories (for each product/warehouse pair)
  console.log('📊 Seeding Inventory levels...');
  const inventoryData = [
    // Seattle Hub
    { productId: products[0].id, warehouseId: warehouses[0].id, totalUnits: 150 },
    { productId: products[1].id, warehouseId: warehouses[0].id, totalUnits: 75 },
    { productId: products[2].id, warehouseId: warehouses[0].id, totalUnits: 100 },
    // New York Hub
    { productId: products[0].id, warehouseId: warehouses[1].id, totalUnits: 250 },
    { productId: products[1].id, warehouseId: warehouses[1].id, totalUnits: 120 },
    { productId: products[2].id, warehouseId: warehouses[1].id, totalUnits: 180 },
    // Frankfurt Central
    { productId: products[0].id, warehouseId: warehouses[2].id, totalUnits: 300 },
    { productId: products[1].id, warehouseId: warehouses[2].id, totalUnits: 150 },
    { productId: products[2].id, warehouseId: warehouses[2].id, totalUnits: 200 },
  ];

  const inventories = await Promise.all(
    inventoryData.map((inv) =>
      prisma.inventory.create({
        data: {
          productId: inv.productId,
          warehouseId: inv.warehouseId,
          totalUnits: inv.totalUnits,
          reservedUnits: 0,
        },
      })
    )
  );
  console.log(`✓ Seeded ${inventories.length} inventory records.`);

  console.log('🎉 Database seeding completed successfully.');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error('❌ Error during seeding:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
