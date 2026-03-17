// server.js

const express = require('express');
const next = require('next');
const { startAuctionClosureJob } = require('./cron');

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  startAuctionClosureJob();

  const server = express();

  server.all('/{*path}', (req, res) => {
    return handle(req, res);
  });

  server.listen(3000, (err) => {
    if (err) throw err;
    console.log('> Ready on http://localhost:3000');
  });
});
