#!/usr/bin/env node

const path = require('path');
const { spawnSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const modulesRoot = path.join(projectRoot, 'apps', 'dgfy-api', 'src', 'modules');
const guardrailScript = path.join(projectRoot, 'backend', 'scripts', 'check-architecture-guardrails.js');
const controllerBoundaryScript = path.join(projectRoot, 'backend', 'scripts', 'check-controller-boundaries.js');

function runCheck(scriptPath, environment) {
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: projectRoot,
    env: { ...process.env, ...environment },
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

runCheck(guardrailScript, { ARCH_GUARDRAIL_MODULES_ROOT: modulesRoot });
runCheck(controllerBoundaryScript, { CONTROLLER_BOUNDARY_TARGETS: modulesRoot });
