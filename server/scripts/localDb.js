// Starts a real PostgreSQL on your computer, with no installation needed.
// Run: npm run db:local   (keep it running in its own terminal, stop it with Ctrl+C)
// It creates two databases: "bankai" for the app and "bankai_test" for the tests.
import EmbeddedPostgres from 'embedded-postgres';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dataDir = fileURLToPath(new URL('../.localdb', import.meta.url));
const firstRun = !existsSync(dataDir);

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: 'postgres',
  password: 'postgres',
  port: 5432,
  persistent: true, // data survives restarts
  onLog: () => {},
});

if (firstRun) await pg.initialise();
await pg.start();
// Create the two databases if they don't exist yet (an error just means "already there").
for (const name of ['bankai', 'bankai_test']) {
  await pg.createDatabase(name).catch(() => {});
}

console.log('Local PostgreSQL is running on port 5432.');
console.log('  App database:  postgres://postgres:postgres@localhost:5432/bankai');
console.log('  Test database: postgres://postgres:postgres@localhost:5432/bankai_test');
console.log('Press Ctrl+C to stop.');

async function shutdown() {
  await pg.stop();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
