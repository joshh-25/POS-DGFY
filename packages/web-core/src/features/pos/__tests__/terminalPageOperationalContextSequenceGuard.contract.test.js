import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const terminalPageSource = fs.readFileSync(path.resolve(__dirname, '../pages/TerminalPage.jsx'), 'utf8');

const refreshOperationalContextStart = terminalPageSource.indexOf(
  'const refreshOperationalContext = useCallback(async ({'
);
const refreshOperationalContextEnd = terminalPageSource.indexOf(
  '}, [activeTerminalId, canViewPos, locked, operatingLocationId]);',
  refreshOperationalContextStart
);
const refreshOperationalContextSource = terminalPageSource.slice(
  refreshOperationalContextStart,
  refreshOperationalContextEnd
);

const terminalUnlockHandlerStart = terminalPageSource.indexOf(
  'const handleTerminalUnlockSubmit = async (event) => {'
);
const terminalUnlockHandlerEnd = terminalPageSource.indexOf(
  'const performLegacyTerminalUnlock = async',
  terminalUnlockHandlerStart
);
const terminalUnlockHandlerSource = terminalPageSource.slice(
  terminalUnlockHandlerStart,
  terminalUnlockHandlerEnd
);

describe('TerminalPage operational-context refresh sequence contract', () => {
  it('does not let locked or unauthorized callbacks consume a request sequence or clear active loading state', () => {
    const eligibilityGuard = refreshOperationalContextSource.indexOf(
      'if ((!allowWhileLocked && locked) || !canViewOperationalContext) {'
    );
    const terminalGuard = refreshOperationalContextSource.indexOf('if (!terminalId) {');
    const sequenceBump = refreshOperationalContextSource.indexOf(
      'operationalContextRequestSequenceRef.current = requestSequence;'
    );

    expect(refreshOperationalContextStart).toBeGreaterThan(-1);
    expect(eligibilityGuard).toBeGreaterThan(-1);
    expect(terminalGuard).toBeGreaterThan(eligibilityGuard);
    expect(sequenceBump).toBeGreaterThan(terminalGuard);

    const disqualifiedGuardSource = refreshOperationalContextSource.slice(
      eligibilityGuard,
      terminalGuard
    );
    expect(disqualifiedGuardSource).not.toContain('setShiftState');
    expect(disqualifiedGuardSource).not.toContain('setTodayDashboard');
  });

  it('reports a resume only after a confirmed shift and keeps failed confirmation in resume mode', () => {
    expect(terminalUnlockHandlerStart).toBeGreaterThan(-1);
    expect(terminalUnlockHandlerSource.match(/await completeConfirmedShiftResume\(/g)).toHaveLength(2);

    const resumeConfirmationStart = terminalUnlockHandlerSource.indexOf(
      'const completeConfirmedShiftResume = async ('
    );
    const resumeConfirmationEnd = terminalUnlockHandlerSource.indexOf(
      'if (requiresOpeningCash || resumeExistingShift)',
      resumeConfirmationStart
    );
    const resumeConfirmationSource = terminalUnlockHandlerSource.slice(
      resumeConfirmationStart,
      resumeConfirmationEnd
    );
    const shiftConfirmation = resumeConfirmationSource.indexOf('if (operationalContext?.shift) {');
    const successToast = resumeConfirmationSource.indexOf("toast.success('Existing cashier shift resumed.')");

    expect(shiftConfirmation).toBeGreaterThan(-1);
    expect(successToast).toBeGreaterThan(shiftConfirmation);
    expect(resumeConfirmationSource).toContain('allowWhileLocked: true');
    expect(terminalUnlockHandlerSource).toContain("setTerminalUnlockMode('resume_shift')");
    expect(terminalUnlockHandlerSource).toContain("setTerminalUnlockRequired(true)");
    expect(terminalUnlockHandlerSource).toContain('No new shift or opening cash is needed');
  });
});
