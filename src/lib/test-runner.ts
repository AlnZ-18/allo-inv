import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const BASE_URL = 'http://localhost:3000';
const CRON_SECRET = '8921052421';

async function runTests() {
  console.log('🏁 Starting Complete System Integration Test Suite...\n');

  try {
    // Fetch target inventory
    const productsRes = await fetch(`${BASE_URL}/api/products`);
    const products = await productsRes.json();
    
    if (products.length === 0) {
      throw new Error('Database is empty. Please run seeding first.');
    }

    const targetProduct = products[0];
    const targetInventory = targetProduct.inventories[0];
    const inventoryId = targetInventory.id;

    console.log(`🎯 Testing target product: "${targetProduct.name}" at warehouse "${targetInventory.warehouseName}"`);
    console.log(`📦 Initial Available Units: ${targetInventory.availableUnits}`);

    // --- TEST 1: Creation and Manual Release Lifecycle ---
    console.log('\n--- TEST 1: Creation & Manual Release ---');
    
    const createRes = await fetch(`${BASE_URL}/api/reservations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inventoryId, quantity: 2 })
    });
    
    if (createRes.status !== 201) {
      throw new Error(`Test 1 Failed: Expected status 201, got ${createRes.status}`);
    }
    
    const reservation = await createRes.json();
    console.log(`✓ Reservation created successfully. ID: ${reservation.id}, Status: ${reservation.status}`);

    const releaseRes = await fetch(`${BASE_URL}/api/reservations/${reservation.id}/release`, {
      method: 'POST'
    });
    
    if (releaseRes.status !== 200) {
      throw new Error(`Test 1 Failed: Expected release status 200, got ${releaseRes.status}`);
    }
    
    const released = await releaseRes.json();
    console.log(`✓ Reservation manually released. Status: ${released.status}, ReleasedAt: ${released.releasedAt}`);

    // --- TEST 2: Terminal State Constraints ---
    console.log('\n--- TEST 2: Terminal State Safety Locks ---');
    
    const createRes2 = await fetch(`${BASE_URL}/api/reservations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inventoryId, quantity: 1 })
    });
    const reservation2 = await createRes2.json();
    console.log(`✓ Created reservation: ${reservation2.id}`);

    const confirmRes2 = await fetch(`${BASE_URL}/api/reservations/${reservation2.id}/confirm`, {
      method: 'POST'
    });
    if (confirmRes2.status !== 200) {
      throw new Error(`Expected confirm status 200, got ${confirmRes2.status}`);
    }
    console.log('✓ Confirmed purchase for hold.');

    // Attempting to release a confirmed hold should fail!
    const invalidReleaseRes = await fetch(`${BASE_URL}/api/reservations/${reservation2.id}/release`, {
      method: 'POST'
    });
    
    if (invalidReleaseRes.status === 400) {
      console.log('✓ Terminal safety lock active: Correctly rejected release of confirmed reservation (status 400).');
    } else {
      throw new Error(`Expected status 400 for invalid state transition, got ${invalidReleaseRes.status}`);
    }

    // --- TEST 3: Cron Cleanup / Expiry Strategy ---
    console.log('\n--- TEST 3: Automatic Cron Cleanup ---');
    
    const createRes3 = await fetch(`${BASE_URL}/api/reservations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inventoryId, quantity: 1 })
    });
    const reservation3 = await createRes3.json();
    console.log(`✓ Created reservation: ${reservation3.id}`);

    // Simulate expiration by manually updating expiresAt in PostgreSQL to 1 hour ago
    const pastDate = new Date();
    pastDate.setHours(pastDate.getHours() - 1);
    
    await prisma.reservation.update({
      where: { id: reservation3.id },
      data: { expiresAt: pastDate }
    });
    console.log('✓ Simulating hold expiration by backdating database timestamps...');

    // Trigger the cron cleanup API with Authorization token
    const cronRes = await fetch(`${BASE_URL}/api/cron/cleanup`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${CRON_SECRET}` }
    });
    
    if (cronRes.status !== 200) {
      throw new Error(`Cron cleanup trigger failed with status ${cronRes.status}`);
    }
    
    const cronResult = await cronRes.json();
    console.log(`✓ Cleanup triggered successfully. Cleaned count: ${cronResult.cleaned}`);
    
    // Fetch from database to verify status has moved to released
    const dbRes3 = await prisma.reservation.findUnique({ where: { id: reservation3.id } });
    if (dbRes3?.status === 'released') {
      console.log(`✓ Confirmed: Reservation ${reservation3.id} is now ${dbRes3.status} and returned held units.`);
    } else {
      throw new Error(`Expected status 'released' in database, got '${dbRes3?.status}'`);
    }

    // --- TEST 4: High-Concurrency Pessimistic Row Locking ---
    console.log('\n--- TEST 4: High-Concurrency Pessimistic Row Locking ---');

    // 1. Baseline the inventory stock for a controlled environment
    // We update totalUnits to 12 and reservedUnits to 0 directly in PostgreSQL
    console.log('📊 Baselining target inventory stock to totalUnits = 12, reservedUnits = 0...');
    await prisma.inventory.update({
      where: { id: inventoryId },
      data: {
        totalUnits: 12,
        reservedUnits: 0
      }
    });

    const requestedQtyPerRequest = 5;
    // With 12 units available and requests of 5 units each, exactly 2 requests must succeed
    const expectedSuccesses = 2; // (2 * 5 = 10 units reserved, leaving 2 available)
    const totalRequests = 5; // We fire 5 requests, so exactly 3 must fail with 409
    
    console.log(`🚀 Dispatching ${totalRequests} concurrent reservation requests at once (${requestedQtyPerRequest} units each)...`);
    
    const promises = Array.from({ length: totalRequests }).map(() =>
      fetch(`${BASE_URL}/api/reservations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inventoryId, quantity: requestedQtyPerRequest })
      })
    );

    const responses = await Promise.all(promises);
    
    let successes = 0;
    let conflicts = 0;
    const createdIds: string[] = [];

    for (const res of responses) {
      if (res.status === 201) {
        successes++;
        const data = await res.json();
        createdIds.push(data.id);
      } else if (res.status === 409) {
        conflicts++;
      } else {
        console.warn(`Received unexpected status: ${res.status}`);
      }
    }

    console.log(`\n📊 Concurrency outcomes:`);
    console.log(`   - Successful Allocations: ${successes} (Expected: ${expectedSuccesses})`);
    console.log(`   - Rejected Requests (HTTP 409 Insufficient Stock): ${conflicts} (Expected: ${totalRequests - expectedSuccesses})`);

    if (successes !== expectedSuccesses) {
      throw new Error(`Pessimistic locking error: expected exactly ${expectedSuccesses} successes, got ${successes}`);
    }
    console.log('✓ Success! Pessimistic locking successfully prevented overselling under high concurrency!');

    // Cleanup concurrency test holds so database stays clean
    console.log('\n🧹 Cleaning up concurrency test holds...');
    for (const id of createdIds) {
      await fetch(`${BASE_URL}/api/reservations/${id}/release`, { method: 'POST' });
    }
    
    // Restore the database stock to its seed value
    await prisma.inventory.update({
      where: { id: inventoryId },
      data: {
        totalUnits: targetInventory.totalUnits,
        reservedUnits: targetInventory.reservedUnits
      }
    });
    console.log('✓ Database restored to original state.');

    console.log('\n🏆 ALL SYSTEM INTEGRATION TESTS PASSED SUCCESSFULLY! 🏆');

  } catch (err) {
    console.error('\n❌ CRITICAL: Integration test failure:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    process.exit(0);
  }
}

runTests();
