#!/usr/bin/env node
const { spawnSync } = require('child_process');

const isWindows = process.platform === 'win32';
const npmCommand = isWindows ? 'npm.cmd' : 'npm';
const gitCommand = isWindows ? 'git.exe' : 'git';
const quoteWindowsArg = (value) => {
  const text = String(value);
  return /[\s"&|<>^]/.test(text) ? `"${text.replace(/"/g, '\\"')}"` : text;
};

const steps = [
  {
    label: 'Backend F&B operational QA',
    command: npmCommand,
    args: ['--prefix', 'apps/dgfy-api', 'test', '--', 'fnbOperationalReadiness.qa.test.js', '--runInBand']
  },
  {
    label: 'Backend F&B use cases',
    command: npmCommand,
    args: ['--prefix', 'apps/dgfy-api', 'test', '--', 'fnbMode.usecases.test.js', '--runInBand']
  },
  {
    label: 'Backend POS F&B checkout contracts',
    command: npmCommand,
    args: ['--prefix', 'apps/dgfy-api', 'test', '--', 'posCheckoutFnbContracts.usecase.test.js', '--runInBand']
  },
  {
    label: 'Backend Storefront F&B checkout contracts',
    command: npmCommand,
    args: ['--prefix', 'apps/dgfy-api', 'test', '--', 'storeFnbModifiers.usecases.test.js', '--runInBand']
  },
  {
    label: 'Frontend F&B kitchen queue display contract',
    command: npmCommand,
    args: ['--prefix', 'frontend', 'test', '--', 'kitchenQueueDisplay.test.js']
  },
  {
    label: 'Frontend POS terminal mode contract',
    command: npmCommand,
    args: ['--prefix', 'frontend', 'test', '--', 'terminalViewModeContracts.test.js']
  },
  {
    label: 'Frontend Storefront error-message contract',
    command: npmCommand,
    args: ['--prefix', 'frontend', 'test', '--', 'storefrontErrorMessages.test.js']
  },
  {
    label: 'Skupervisor production build',
    command: npmCommand,
    args: ['--prefix', 'frontend', 'run', 'build:skupervisor']
  },
  {
    label: 'POS production build',
    command: npmCommand,
    args: ['--prefix', 'frontend', 'run', 'build:pos']
  },
  {
    label: 'Storefront production build',
    command: npmCommand,
    args: ['--prefix', 'frontend', 'run', 'build:store']
  },
  {
    label: 'Architecture gate',
    command: npmCommand,
    args: ['run', 'check:architecture']
  },
  {
    label: 'Governed docs lint',
    command: npmCommand,
    args: ['run', 'lint:docs']
  },
  {
    label: 'Diff whitespace hygiene',
    command: gitCommand,
    args: ['diff', '--check']
  }
];

for (const [index, step] of steps.entries()) {
  console.log(`\n[F&B readiness ${index + 1}/${steps.length}] ${step.label}`);
  console.log(`> ${step.command} ${step.args.join(' ')}`);
  const result = isWindows
    ? spawnSync([step.command, ...step.args].map(quoteWindowsArg).join(' '), {
      stdio: 'inherit',
      shell: true
    })
    : spawnSync(step.command, step.args, {
      stdio: 'inherit',
      shell: false
    });
  if (result.status !== 0) {
    if (result.error) {
      console.error(result.error.message);
    }
    console.error(`\n[F&B readiness] FAILED: ${step.label}`);
    process.exit(result.status || 1);
  }
}

console.log('\n[F&B readiness] PASS. Use this gate before final readiness/rating claims.');
