#!/usr/bin/env node
require('node:child_process').spawnSync('node', [require('node:path').resolve(__dirname, '../../scripts/ai-attribution.js'), 'record', 'claude-code'], { stdio: 'inherit' });
