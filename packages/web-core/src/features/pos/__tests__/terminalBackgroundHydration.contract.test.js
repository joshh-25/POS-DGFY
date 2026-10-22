import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const terminalPageSource = fs.readFileSync(path.resolve(__dirname, '../pages/TerminalPage.jsx'), 'utf8');

describe('POS background hydration contract', () => {
  it('keeps settings and 403-triggered user refreshes in background mode', () => {
    expect(terminalPageSource).toContain(
      'const hydrateUser = useCallback(async ({ suppressGlobalErrors = false, background = false } = {}) => {'
    );

    const settingsRefreshStart = terminalPageSource.indexOf('const refreshScopedSettings = () => {');
    const settingsRefreshEnd = terminalPageSource.indexOf('const unsubscribeSync =', settingsRefreshStart);
    const settingsRefreshSource = terminalPageSource.slice(settingsRefreshStart, settingsRefreshEnd);

    expect(settingsRefreshStart).toBeGreaterThan(-1);
    expect(settingsRefreshSource).toContain('hydrateUser({ suppressGlobalErrors: true, background: true })');
    expect(terminalPageSource).toContain('silently reprice an active sale. Its hydrateUser call runs as background.');
    expect(terminalPageSource).toContain(
      'const refreshTerminalUserInBackground = useCallback(\n'
      + '    (opts = {}) => hydrateUser({ ...opts, background: true }),'
    );
    expect(terminalPageSource).toContain('refreshTerminalUser={refreshTerminalUserInBackground}');
  });

  it('keeps the current view when resuming the already-active shift and switches for a different shift', () => {
    const resumeStart = terminalPageSource.indexOf(
      'const handleBranchSelectorResumeShift = useCallback(async ({ locationId, terminalId, shiftId } = {}) => {'
    );
    const alreadyActiveStart = terminalPageSource.indexOf(
      'if (\n      activeShiftId\n      && sanitizeTerminalId(activeTerminalId) === normalizedTerminalId',
      resumeStart
    );
    const differentShiftStart = terminalPageSource.indexOf('setAdminTerminalSwitching(true);', alreadyActiveStart);
    const differentShiftEnd = terminalPageSource.indexOf('} catch (error)', differentShiftStart);
    const alreadyActiveSource = terminalPageSource.slice(alreadyActiveStart, differentShiftStart);
    const differentShiftSource = terminalPageSource.slice(differentShiftStart, differentShiftEnd);

    expect(resumeStart).toBeGreaterThan(-1);
    expect(alreadyActiveStart).toBeGreaterThan(-1);
    expect(differentShiftStart).toBeGreaterThan(-1);
    expect(alreadyActiveSource).not.toContain("commitViewModeSelection('checkout')");
    expect(differentShiftSource).toContain("commitViewModeSelection('checkout')");
  });
});
