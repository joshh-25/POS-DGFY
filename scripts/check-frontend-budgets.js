#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const DEFAULT_REPORT_PATH = path.join('.tmp', 'frontend-budgets', 'frontend_budget_report.json');

// Each app now builds inside its own standalone package (issue #322 Phase 6)
// instead of a shared top-level dist-apps/<app> output dir.
const REQUIRED_APP_ASSET_DIRS = [
  { app: 'skupervisor', dirParts: ['apps', 'dgfy-ims', 'dist', 'assets'] },
  { app: 'pos', dirParts: ['apps', 'dgfy-pos', 'dist', 'assets'] },
  { app: 'store', dirParts: ['apps', 'dgfy-storefront', 'dist', 'assets'] },
];

const ROUTE_BUDGETS = [
  // Rebased 2026-06-30 after the exact release-local build measured the
  // current login route slightly above the prior 20KB floor.
  { app: 'skupervisor', prefix: 'Login-', limitKb: 22 },
  // Rebased 2026-06-02 after ADR 0026 added cookie/CSRF browser session
  // plumbing to POS-authenticated surfaces.
  // SKUpervisor uses a deliberately separate checkout implementation from the
  // standalone cashier surface, so its lazy chunk follows the component name.
  // Rebased 2026-06-30 against the exact staging candidate after the POS
  // terminal, operations workspace, and shared MapLibre route ownership drift
  // was made visible by the release-local gate.
  { app: 'skupervisor', prefix: 'SkupervisorPOSCheckoutTerminal-', limitKb: 106 },
  // Standalone POS owns the cashier terminal route. Keep it separately budgeted
  // so the split app cannot drift behind the admin-only surface. Rebased after
  // offline queue, terminal-session, and hardware-runtime controls were added.
  // Rebased 2026-06-30 after the standalone POS terminal candidate measured
  // above the June baseline during the governed release-local build.
  // Rebased 2026-08-16 after governed per-sale discount authorization, shared
  // parked-sale handoff, and resumable split-payment completion were added to
  // the cashier route. Heavy dialogs remain lazy chunks; this ceiling covers
  // the route-level coordination state that must stay resident during a sale.
  // Raised 166 -> 190 on 2026-08-18 for the #631 POS drawer/discount/notes/PayMongo work
  // (measured 183.93KB). This is the second raise from the same workstream after #577; #392
  // tracks splitting POSCheckoutTerminal.jsx rather than raising the ceiling again.
  { app: 'pos', prefix: 'POSCheckoutTerminal-', limitKb: 190 },
  // PR #11 renamed the admin POS route chunk from POSPage-* to SkupervisorPOSPage-*.
  { app: 'skupervisor', prefix: 'SkupervisorPOSPage-', limitKb: 59 },
  // Rebased after terminal auth, shift, queue orchestration, and setup-flow
  // state remained in the route controller while checkout/layout render work
  // split into lazy chunks.
  // Rebased 2026-07-01 after the POS map hotfix restored lazy checkout chunks
  // and measured the remaining route controller at 110.39KB.
  // Rebased 2026-08-16 after terminal recovery, cross-cashier shift resume,
  // admin audit authorization, and shared parked-sale ownership checks added
  // route-level orchestration while their rendered workspaces remain lazy.
  // Raised 121 -> 128 on 2026-08-23 after the downpayment epic's terminal-facing
  // work (#822/#824/#825, #865/#866 -- split display, Settle Balance action,
  // customer_choice controls) tipped the route controller to 121.6KB, tripping
  // the near-zero-headroom gate #392 already flagged. #392 tracks the larger
  // decision of whether to keep rebasing vs. split TerminalPage.jsx; this is
  // just the rebase half with real headroom restored, not a resolution of it.
  { app: 'skupervisor', prefix: 'TerminalPage-', limitKb: 128 },
  // Rebased 2026-06-30 to the current sales route candidate.
  { app: 'skupervisor', prefix: 'SalesPage-', limitKb: 49 },
];

class BudgetGateError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'BudgetGateError';
    this.code = options.code || 'BUDGET_GATE_FAILED';
    this.errors = options.errors || [message];
    this.warnings = options.warnings || [];
    this.report = options.report || null;
  }
}

function parseArgs(argv) {
  const options = {
    projectRoot: process.cwd(),
    skipBuild: false,
    builtAfterMs: null,
    reportPath: DEFAULT_REPORT_PATH,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--skip-build') {
      options.skipBuild = true;
    } else if (arg === '--built-after') {
      const value = argv[index + 1];
      if (!value) throw new BudgetGateError('Missing value for --built-after', { code: 'INVALID_ARGS' });
      options.builtAfterMs = parseTimestamp(value);
      index += 1;
    } else if (arg === '--report') {
      const value = argv[index + 1];
      if (!value) throw new BudgetGateError('Missing value for --report', { code: 'INVALID_ARGS' });
      options.reportPath = value;
      index += 1;
    } else if (arg === '--project-root') {
      const value = argv[index + 1];
      if (!value) throw new BudgetGateError('Missing value for --project-root', { code: 'INVALID_ARGS' });
      options.projectRoot = path.resolve(value);
      index += 1;
    } else {
      throw new BudgetGateError(`Unknown argument: ${arg}`, { code: 'INVALID_ARGS' });
    }
  }

  if (options.skipBuild && options.builtAfterMs === null) {
    throw new BudgetGateError(
      'Prebuilt mode requires --built-after <ISO timestamp or epoch ms> so stale assets cannot be accepted.',
      { code: 'PREBUILT_FRESHNESS_REQUIRED' }
    );
  }

  return options;
}

function parseTimestamp(value) {
  if (/^\d+$/.test(value)) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }

  const parsed = Date.parse(value);
  if (Number.isFinite(parsed)) return parsed;
  throw new BudgetGateError(`Invalid --built-after timestamp: ${value}`, { code: 'INVALID_ARGS' });
}

function toKb(bytes) {
  return Number((bytes / 1024).toFixed(2));
}

function formatBudgetName(budget) {
  return `${budget.app}:${budget.prefix}`;
}

function resolveRequiredAssetDirs(projectRoot) {
  return REQUIRED_APP_ASSET_DIRS.map(({ app, dirParts }) => ({
    app,
    dir: path.join(projectRoot, ...dirParts),
  }));
}

const FRONTEND_BUILD_APP_DIRS = ['apps/dgfy-ims', 'apps/dgfy-pos', 'apps/dgfy-storefront'];

function runFrontendBuild(projectRoot, logger = console) {
  // Two-second floor absorbs filesystem timestamp precision differences.
  const buildStartedAtMs = Date.now() - 2000;
  logger.log('[frontend-budgets] Building frontend apps before budget check');

  for (const appDir of FRONTEND_BUILD_APP_DIRS) {
    const buildCommand = `npm --prefix ${appDir} run build`;
    const command = process.platform === 'win32' ? 'cmd.exe' : 'npm';
    const args = process.platform === 'win32'
      ? ['/d', '/s', '/c', buildCommand]
      : ['--prefix', appDir, 'run', 'build'];
    const result = spawnSync(command, args, {
      cwd: projectRoot,
      stdio: 'inherit',
      env: process.env,
    });

    if (result.error) {
      throw new BudgetGateError(`Failed to launch frontend build (${appDir}): ${result.error.message}`, {
        code: 'BUILD_LAUNCH_FAILED',
      });
    }
    if (result.status !== 0) {
      throw new BudgetGateError(`Frontend build failed before budget calculation (${appDir}).`, {
        code: 'BUILD_FAILED',
      });
    }
  }

  return buildStartedAtMs;
}

function collectJsFiles(projectRoot) {
  const requiredDirs = resolveRequiredAssetDirs(projectRoot);
  const missingDirs = requiredDirs.filter(({ dir }) => !fs.existsSync(dir));
  if (missingDirs.length > 0) {
    throw new BudgetGateError(
      `Missing required frontend build assets: ${missingDirs.map(({ app, dir }) => `${app} (${path.relative(projectRoot, dir)})`).join(', ')}`,
      {
        code: 'MISSING_ASSETS',
        errors: missingDirs.map(({ app, dir }) => `Missing ${app} assets at ${path.relative(projectRoot, dir)}`),
      }
    );
  }

  const jsFiles = requiredDirs.flatMap(({ app, dir: assetsDir }) => {
    const files = fs.readdirSync(assetsDir)
      .filter((name) => name.endsWith('.js'))
      .map((name) => {
        const fullPath = path.join(assetsDir, name);
        const stats = fs.statSync(fullPath);
        return {
          name,
          app,
          size: stats.size,
          sizeKb: toKb(stats.size),
          mtimeMs: stats.mtimeMs,
          source: path.relative(projectRoot, fullPath),
        };
      });
    if (files.length === 0) {
      throw new BudgetGateError(`No JavaScript assets found for ${app} at ${path.relative(projectRoot, assetsDir)}`, {
        code: 'EMPTY_ASSETS',
      });
    }
    return files;
  });

  return { requiredDirs, jsFiles };
}

function findByBudget(jsFiles, budget) {
  const matches = jsFiles
    .filter((file) => file.name.startsWith(budget.prefix) && file.app === budget.app)
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  return matches[0] || null;
}

function checkBudgets({ jsFiles, freshnessFloorMs }) {
  const errors = [];
  const warnings = [];

  const budgetResults = ROUTE_BUDGETS.map((budget) => {
    const match = findByBudget(jsFiles, budget);
    if (!match) {
      errors.push(`Missing expected chunk "${formatBudgetName(budget)}"`);
      return {
        ...budget,
        status: 'missing',
        file: null,
        source: null,
        sizeKb: null,
        mtime: null,
      };
    }

    const result = {
      ...budget,
      status: 'pass',
      file: match.name,
      source: match.source,
      sizeKb: match.sizeKb,
      mtime: new Date(match.mtimeMs).toISOString(),
    };

    if (match.sizeKb > budget.limitKb) {
      result.status = 'fail';
      errors.push(`${match.name} is ${match.sizeKb}KB (limit ${budget.limitKb}KB)`);
    }

    if (freshnessFloorMs !== null && match.mtimeMs < freshnessFloorMs) {
      result.status = 'stale';
      errors.push(`${match.name} is stale: ${result.mtime} is older than ${new Date(freshnessFloorMs).toISOString()}`);
    }

    return result;
  });

  const largestChunks = [...jsFiles]
    .sort((a, b) => b.size - a.size)
    .slice(0, 3)
    .map((file) => ({
      app: file.app,
      name: file.name,
      source: file.source,
      sizeKb: file.sizeKb,
      mtime: new Date(file.mtimeMs).toISOString(),
    }));

  for (const chunk of largestChunks) {
    if (chunk.name.startsWith('vendor-maplibre-') && chunk.sizeKb <= 1100) {
      continue;
    }
    if (chunk.name.startsWith('MapPinPicker-') && chunk.sizeKb <= 1100) {
      continue;
    }
    if (chunk.sizeKb > 950) {
      warnings.push(`Very large chunk detected: ${chunk.name} (${chunk.sizeKb}KB)`);
    }
  }

  return { budgetResults, largestChunks, errors, warnings };
}

function resolveReportPath(projectRoot, reportPath) {
  return path.isAbsolute(reportPath) ? reportPath : path.resolve(projectRoot, reportPath);
}

function writeReport(reportPath, report) {
  const absoluteReportPath = path.resolve(report.project_root, reportPath);
  fs.mkdirSync(path.dirname(absoluteReportPath), { recursive: true });
  fs.writeFileSync(absoluteReportPath, `${JSON.stringify(report, null, 2)}\n`);
  return absoluteReportPath;
}

function printReport(report, logger = console) {
  logger.log('[frontend-budgets] Route chunk budget check');
  report.budgets.forEach((budget) => {
    if (!budget.file) {
      logger.log(`- ${formatBudgetName(budget)} : missing`);
    } else {
      logger.log(`- ${formatBudgetName(budget)} -> ${budget.file} (${budget.source}) : ${budget.sizeKb}KB / ${budget.limitKb}KB`);
    }
  });

  logger.log('[frontend-budgets] Largest chunks');
  report.largest_chunks.forEach((chunk) => {
    logger.log(`- ${chunk.name} (${chunk.source}) : ${chunk.sizeKb}KB`);
  });

  report.warnings.forEach((line) => logger.warn(`[frontend-budgets] WARN: ${line}`));
  report.errors.forEach((line) => logger.error(`[frontend-budgets] ERROR: ${line}`));
  logger.log(`[frontend-budgets] Report: ${report.report_path}`);

  if (report.status === 'pass') {
    logger.log('[frontend-budgets] PASS');
  }
}

function checkFrontendBudgets(options = {}) {
  const projectRoot = path.resolve(options.projectRoot || process.cwd());
  const reportPath = options.reportPath || DEFAULT_REPORT_PATH;
  const mode = options.skipBuild ? 'prebuilt' : 'owned-build';
  const logger = options.logger || console;

  let freshnessFloorMs = options.builtAfterMs ?? null;
  if (!options.skipBuild) {
    freshnessFloorMs = runFrontendBuild(projectRoot, logger);
  } else if (freshnessFloorMs === null) {
    throw new BudgetGateError(
      'Prebuilt mode requires --built-after <ISO timestamp or epoch ms> so stale assets cannot be accepted.',
      { code: 'PREBUILT_FRESHNESS_REQUIRED' }
    );
  }

  let report = null;
  try {
    const { requiredDirs, jsFiles } = collectJsFiles(projectRoot);
    const { budgetResults, largestChunks, errors, warnings } = checkBudgets({ jsFiles, freshnessFloorMs });
    const status = errors.length > 0 ? 'fail' : 'pass';
    const absoluteReportPath = resolveReportPath(projectRoot, reportPath);
    report = {
      version: 1,
      generated_at: new Date().toISOString(),
      status,
      mode,
      project_root: projectRoot,
      build_command: options.skipBuild ? null : FRONTEND_BUILD_APP_DIRS.map((appDir) => `npm --prefix ${appDir} run build`).join(' && '),
      freshness_floor: freshnessFloorMs === null ? null : new Date(freshnessFloorMs).toISOString(),
      required_asset_dirs: requiredDirs.map(({ app, dir }) => ({ app, path: path.relative(projectRoot, dir) })),
      budgets: budgetResults,
      largest_chunks: largestChunks,
      warnings,
      errors,
      report_path: path.relative(projectRoot, absoluteReportPath),
    };
    writeReport(reportPath, report);
    printReport(report, logger);

    if (errors.length > 0) {
      throw new BudgetGateError('Frontend budget gate failed.', {
        code: 'BUDGETS_FAILED',
        errors,
        warnings,
        report,
      });
    }
    return report;
  } catch (error) {
    if (error instanceof BudgetGateError && !error.report && report) {
      error.report = report;
    }
    throw error;
  }
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    checkFrontendBudgets(options);
  } catch (error) {
    if (error instanceof BudgetGateError) {
      console.error(`[frontend-budgets] FAIL: ${error.message}`);
      if (error.report && error.report.report_path) {
        console.error(`[frontend-budgets] Report: ${error.report.report_path}`);
      }
      process.exit(1);
    }
    throw error;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  BudgetGateError,
  DEFAULT_REPORT_PATH,
  REQUIRED_APP_ASSET_DIRS,
  ROUTE_BUDGETS,
  checkFrontendBudgets,
  parseArgs,
  parseTimestamp,
  resolveReportPath,
};
