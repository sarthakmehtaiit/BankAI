// Creates all tables. Safe to run again: existing tables and data are kept.
import 'dotenv/config';
import { applySchema, closeDb } from '../src/db.js';

await applySchema();
console.log('Database tables are ready.');
await closeDb();
