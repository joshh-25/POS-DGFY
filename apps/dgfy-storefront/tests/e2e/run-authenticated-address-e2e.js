import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const storefrontDirectory = path.resolve(currentDirectory, '../..');
const playwrightCli = path.resolve(storefrontDirectory, 'node_modules/@playwright/test/cli.js');
const forwardedArguments = process.argv.slice(2);

const child = spawn(
  process.execPath,
  [
    playwrightCli,
    'test',
    'tests/e2e/customer-address-modal.authenticated.spec.js',
    '--project=authenticated-google-chrome',
    ...forwardedArguments
  ],
  {
    cwd: storefrontDirectory,
    env: { ...process.env, E2E_AUTHENTICATED: 'true' },
    stdio: 'inherit'
  }
);

child.on('error', (error) => {
  console.error(`Unable to start authenticated Playwright QA: ${error.message}`);
  process.exitCode = 1;
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exitCode = code ?? 1;
});
