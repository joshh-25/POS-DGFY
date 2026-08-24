import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const terminalPageSource = fs.readFileSync(path.resolve(__dirname, '../pages/TerminalPage.jsx'), 'utf8');
const feedbackSource = fs.readFileSync(path.resolve(__dirname, '../../../utils/iminRuntimeFeedback.js'), 'utf8');

describe('POS shift-exempt navigation feedback', () => {
  it('removes only a prior shift-closed warning after a shift-exempt view is allowed', () => {
    expect(terminalPageSource).toContain('const shiftClosedToastIdRef = useRef(null);');
    expect(terminalPageSource).toContain("const shiftClosedToastId = toast.error('You cannot use the POS because the shift is closed.');");
    expect(terminalPageSource).toContain('if (shiftClosedToastId) {');
    expect(terminalPageSource).toContain('if (isShiftExemptViewMode && shiftClosedToastIdRef.current) {');
    expect(terminalPageSource).toContain('toast.dismiss(shiftClosedToastIdRef.current);');
    expect(terminalPageSource).toContain('commitViewModeSelection(nextMode);');
    expect(feedbackSource).toContain('dismiss: (toastId) => {');
    expect(feedbackSource).toContain('sonnerToast.dismiss(toastId);');
  });
});
