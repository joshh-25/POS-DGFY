#!/usr/bin/env node
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const scriptPath = path.resolve(__dirname, '../../scripts/ai-attribution.js');
const result = spawnSync(process.execPath, [scriptPath, 'record', 'cursor'], { stdio: 'inherit' });
process.exit(result.status ?? 0);
