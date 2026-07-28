// Loaded via `node --import ./src/instrument.js src/server.js` (see
// package.json start/dev scripts and infrastructure/docker/backend/Dockerfile).
//
// This file exists because `initSentry()` in server.js used to run after
// ~65 application imports (express, sequelize/mysql2, every route module).
// The backend is ESM ("type": "module" in package.json, Node 22), so by the
// time Sentry.init() ran, express and mysql2 were already fully loaded and
// their exports already bound into every module that imported them --
// Sentry's auto-instrumentation patches module exports at import time, so
// patching after the fact does nothing. `--import` guarantees this file's
// top-level code (including Sentry.init) finishes before server.js's first
// import line even starts evaluating. Requires Node >=18.19 for ESM
// `--import` support; the image is node:22-alpine, so this is satisfied.
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import { initSentry } from './config/sentry.js';
import logger from './config/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Same .env resolution as server.js (backend directory, parent of src) --
// initSentry() below reads SENTRY_* from process.env, so this must run
// first.
dotenv.config({ path: join(__dirname, '..', '.env') });

initSentry({ logger });
