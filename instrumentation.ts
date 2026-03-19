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

    // Re-register any items that have a stored hash but are missing from the blockchain
    // (happens when the local Hardhat node is restarted and the chain resets)
    try {
      const { getOnChainData, registerModelOnChain } = await import("@/lib/blockchain");

      const items = await db.auctionItem.findMany({
        where: { modelHash: { not: null } },
        select: { id: true, modelHash: true },
      });

      let reregistered = 0;
      for (const item of items) {
        if (!item.modelHash) continue;
        const onChain = await getOnChainData(item.id);
        if (!onChain) {
          const txHash = await registerModelOnChain(item.id, item.modelHash);
          await db.auctionItem.update({
            where: { id: item.id },
            data: { blockchainTxHash: txHash },
          });
          reregistered++;
        }
      }

      if (reregistered > 0) {
        console.log(`[startup] Re-registered ${reregistered} model(s) on blockchain.`);
      }
    } catch (error) {
      console.error("[startup] Failed to re-register models on blockchain:", error);
    }
  }
}
