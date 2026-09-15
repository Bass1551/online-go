const QuoteStatsDb = require('../server/quoteStatsDb.js');

async function run() {
  console.log('Running Quote Game migrations...');
  await QuoteStatsDb.init();
  console.log('Migrations completed successfully.');
  process.exit(0);
}

run().catch(err => {
  console.error('Migration error:', err);
  process.exit(1);
});
