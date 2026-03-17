export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { db } = await import("@/lib/db");
    const { AuctionStatus } = await import("@prisma/client");

    try {
      const result = await db.auctionItem.updateMany({
        where: {
          status: AuctionStatus.OPEN,
          endTime: { lt: new Date() },
        },
        data: {
          status: AuctionStatus.CLOSED,
        },
      });

      if (result.count > 0) {
        console.log(`[startup] Closed ${result.count} overdue auction(s).`);
      }
    } catch (error) {
      console.error("[startup] Failed to close overdue auctions:", error);
    }
  }
}
