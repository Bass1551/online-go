const QuoteStatsDb = require('../server/quoteStatsDb.js');

async function run() {
  console.log('Rolling back Quote Game migrations...');
  await QuoteStatsDb.init();
  await QuoteStatsDb.rollbackMigration(0);
  console.log('Rollback completed successfully.');
  process.exit(0);
}

run().catch(err => {
  console.error('Rollback error:', err);
  process.exit(1);
});
