import { jest } from '@jest/globals';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CLI_PATH = join(__dirname, '..', 'src', 'cli.js');

describe('CLI --help output (real child-process invocation)', () => {
  test('--help stdout lists all six commands', () => {
    const stdout = execFileSync('node', [CLI_PATH, '--help'], { encoding: 'utf8' });

    ['schema', 'data', 'verify', 'status', 'rollback-plan'].forEach((command) => {
      expect(stdout).toContain(command);
    });
  });

  test('schema --help stdout contains migrate', () => {
    const stdout = execFileSync('node', [CLI_PATH, 'schema', '--help'], { encoding: 'utf8' });

    expect(stdout).toContain('migrate');
  });

  test('data --help stdout contains dry-run and apply', () => {
    const stdout = execFileSync('node', [CLI_PATH, 'data', '--help'], { encoding: 'utf8' });

    expect(stdout).toContain('dry-run');
    expect(stdout).toContain('apply');
  });
});

describe('CLI dispatch to command handlers (mocked)', () => {
  const mockRunSchemaMigrate = jest.fn().mockResolvedValue({});
  const mockRunDataDryRun = jest.fn().mockResolvedValue({});
  const mockRunDataApply = jest.fn().mockResolvedValue({});
  const mockRunVerify = jest.fn().mockResolvedValue({});
  const mockRunStatus = jest.fn().mockResolvedValue({});
  const mockRunRollbackPlan = jest.fn().mockResolvedValue({});

  beforeEach(() => {
    jest.resetModules();
    mockRunSchemaMigrate.mockClear();
    mockRunDataDryRun.mockClear();
    mockRunDataApply.mockClear();
    mockRunVerify.mockClear();
    mockRunStatus.mockClear();
    mockRunRollbackPlan.mockClear();

    jest.unstable_mockModule('../src/commands/schema.js', () => ({
      runSchemaMigrate: mockRunSchemaMigrate
    }));
    jest.unstable_mockModule('../src/commands/data.js', () => ({
      runDataDryRun: mockRunDataDryRun,
      runDataApply: mockRunDataApply
    }));
    jest.unstable_mockModule('../src/commands/verify.js', () => ({
      runVerify: mockRunVerify
    }));
    jest.unstable_mockModule('../src/commands/status.js', () => ({
      runStatus: mockRunStatus
    }));
    jest.unstable_mockModule('../src/commands/rollbackPlan.js', () => ({
      runRollbackPlan: mockRunRollbackPlan
    }));
  });

  test("argv ['data','apply'] (no flag) calls runDataApply with confirmDestructive: false", async () => {
    // buildProgram() is imported fresh (post jest.resetModules()) against
    // this describe block's mocked command modules — this is the SAME
    // wiring src/cli.js's isMainModule-guarded main() uses.
    const { buildProgram } = await import('../src/cli.js');
    const program = buildProgram();

    await program.parseAsync(['node', 'cli.js', 'data', 'apply']);

    expect(mockRunDataApply).toHaveBeenCalledWith({ confirmDestructive: false });
  });

  test("argv ['data','apply','--confirm-destructive'] calls runDataApply with confirmDestructive: true", async () => {
    const { buildProgram } = await import('../src/cli.js');
    const program = buildProgram();

    await program.parseAsync(['node', 'cli.js', 'data', 'apply', '--confirm-destructive']);

    expect(mockRunDataApply).toHaveBeenCalledWith({ confirmDestructive: true });
  });
});
