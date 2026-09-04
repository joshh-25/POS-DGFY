const test = require('node:test');
const assert = require('node:assert/strict');

const { resolveNpmInvocation } = require('./audit-dependencies');

test('uses the npm JavaScript entrypoint on Windows when npm exposes it', () => {
  assert.deepEqual(resolveNpmInvocation({
    platform: 'win32',
    npmExecPath: 'C:\\nodejs\\node_modules\\npm\\bin\\npm-cli.js',
    nodeExecPath: 'C:\\nodejs\\node.exe',
  }), {
    command: 'C:\\nodejs\\node.exe',
    argsPrefix: ['C:\\nodejs\\node_modules\\npm\\bin\\npm-cli.js'],
    shell: false,
  });
});

test('uses a shell fallback only when Windows has no npm JavaScript entrypoint', () => {
  assert.deepEqual(resolveNpmInvocation({ platform: 'win32', npmExecPath: '' }), {
    command: 'npm.cmd',
    argsPrefix: [],
    shell: true,
  });
});

test('uses npm directly on non-Windows platforms', () => {
  assert.deepEqual(resolveNpmInvocation({ platform: 'linux' }), {
    command: 'npm',
    argsPrefix: [],
    shell: false,
  });
});
