#!/usr/bin/env node
'use strict';

// Antigravity exposes conversation_id in stream-json output, but has no hook API.
// The selected model is therefore taken from the same explicit --model argument
// used to launch agy. This wrapper is intentionally limited to print/stream mode.
const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const root = fs.realpathSync(process.cwd());
const args = process.argv.slice(2);
const modelArg = args.find((arg) => arg === '--model') ? args[args.indexOf('--model') + 1]
  : args.find((arg) => arg.startsWith('--model='))?.slice('--model='.length);
const effortArg = args.find((arg) => arg === '--effort') ? args[args.indexOf('--effort') + 1]
  : args.find((arg) => arg.startsWith('--effort='))?.slice('--effort='.length);
const outputFormat = args.find((arg) => arg === '--output-format') ? args[args.indexOf('--output-format') + 1]
  : args.find((arg) => arg.startsWith('--output-format='))?.slice('--output-format='.length);

if (!modelArg) {
  process.stderr.write('agy-with-attribution requires --model so attribution never guesses the selected model.\n');
  process.exit(2);
}
if (outputFormat && outputFormat !== 'stream-json') {
  process.stderr.write('agy-with-attribution requires --output-format stream-json.\n');
  process.exit(2);
}
if (!outputFormat) args.push('--output-format', 'stream-json');

let buffer = '';
let recorded = false;
function recordFromLine(line) {
  if (recorded) return;
  let event;
  try { event = JSON.parse(line); } catch { return; }
  const conversationId = event?.conversation_id || event?.init?.conversation_id;
  if (event?.event !== 'init' || !conversationId) return;
  const result = spawnSync('node', [path.join(root, 'scripts', 'ai-attribution.js'), 'record', 'antigravity'], {
    cwd: root,
    input: JSON.stringify({
      session_id: conversationId,
      cwd: root,
      modelName: modelArg,
      effort: effortArg,
    }),
    encoding: 'utf8',
    stdio: ['pipe', 'ignore', 'inherit'],
  });
  recorded = result.error == null && result.status === 0;
}

const child = spawn('agy', args, { cwd: root, stdio: ['inherit', 'pipe', 'inherit'] });
child.stdout.on('data', (chunk) => {
  const text = chunk.toString();
  process.stdout.write(text);
  buffer += text;
  const lines = buffer.split('\n');
  buffer = lines.pop() || '';
  for (const line of lines) recordFromLine(line);
});
child.on('close', (status, signal) => {
  if (buffer) recordFromLine(buffer);
  process.exit(signal ? 1 : (status ?? 1));
});
child.on('error', (error) => {
  process.stderr.write(`Failed to launch agy: ${error.message}\n`);
  process.exit(1);
});
