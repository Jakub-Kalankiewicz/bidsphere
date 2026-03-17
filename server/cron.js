// cron.js

const cron = require('node-cron');
const { PrismaClient, AuctionStatus } = require('@prisma/client');

const db = new PrismaClient();

const closeOverdueAuctions = async () => {
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
      console.log(`Closed ${result.count} auction(s).`);
    }
  } catch (error) {
    console.error('Auction closure job failed:', error);
  }
};

const startAuctionClosureJob = () => {
  // Close any overdue auctions immediately on startup
  closeOverdueAuctions();

  // Then poll every minute
  cron.schedule('* * * * *', closeOverdueAuctions);

  console.log('Auction closure job started.');
};

module.exports = { startAuctionClosureJob };
