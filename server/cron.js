// cron.js

const cron = require('node-cron');

// Function to schedule auction closure
const scheduleAuctionClosure = (auctionItemId) => {
  // Schedule a task to close the auction after 24 hours
  const closureTime = new Date(Date.now() + 1000 * 60 * 60 * 24);
  const closureCronTime = `${closureTime.getUTCMinutes()} ${closureTime.getUTCHours()} ${closureTime.getUTCDate()} ${closureTime.getUTCMonth() + 1} *`;

  cron.schedule(closureCronTime, async () => {
    const auctionItem = await db.auctionItem.update({
      where: {
        id: auctionItemId,
      },
      data: {
        status: AuctionStatus.CLOSED,
      },
    });

    if (auctionItem) {
      console.log(`Auction with ID ${auctionItemId} has been closed.`);
    } else {
      console.log(`Failed to close auction with ID ${auctionItemId}.`);
    }
  });
};

module.exports = {
  scheduleAuctionClosure,
};
