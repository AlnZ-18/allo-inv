import { PrismaClient } from '@prisma/client';

const prismaClientSingleton = () => {
  return new PrismaClient();
};

declare global {
  var prismaGlobal: undefined | ReturnType<typeof prismaClientSingleton>;
  var autoCleanupStarted: undefined | boolean;
}

const prisma = globalThis.prismaGlobal ?? prismaClientSingleton();

export default prisma;

if (process.env.NODE_ENV !== 'production') {
  globalThis.prismaGlobal = prisma;

  // HMR-safe local background scheduler to automatically release expired holds
  if (!globalThis.autoCleanupStarted) {
    globalThis.autoCleanupStarted = true;
    console.log('🔄 [Dev Scheduler] Initialized automatic local reservation cleanup loop (60s).');

    const INTERVAL_MS = 60 * 1000;
    setInterval(async () => {
      try {
        // Dynamically import the service to avoid circular dependency states
        const { ReservationService } = await import('@/server/services/reservation.service');
        const result = await ReservationService.cleanupExpiredReservations();
        if (result.cleaned > 0) {
          console.log(`🔄 [Dev Scheduler] Auto-released ${result.cleaned} expired pending reservations.`);
        }
      } catch (err) {
        console.error('🔄 [Dev Scheduler] Error running local cleanup loop:', err);
      }
    }, INTERVAL_MS);
  }
}
