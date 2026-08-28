import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const terminalPageSource = fs.readFileSync(path.resolve(__dirname, '../pages/TerminalPage.jsx'), 'utf8');

// #1107: `c7e16bdd8` (PR #1102) added `activeShiftId` to this effect's dependency array, but
// `const activeShiftId = shiftState?.shift?.pos_terminal_shift_id || null;` isn't declared until
// later in the same component body. A dependency array is evaluated synchronously during render
// (it's just an argument expression to useEffect), so this was a genuine temporal-dead-zone
// violation -- TerminalPage crashed with "Cannot access 'activeShiftId' before initialization" on
// every render. Fixed by deriving the shift id inline from `shiftState` (already declared far
// earlier, L574) instead of depending on the later-declared `activeShiftId` binding.
describe('TerminalPage session-end effect does not forward-reference activeShiftId', () => {
  it('the session-expired/cleared/logout effect reads shiftState directly, not the later-declared activeShiftId', () => {
    const effectStart = terminalPageSource.indexOf("window.addEventListener('auth:session-expired', onSessionExpired);");
    expect(effectStart).toBeGreaterThan(-1);

    const depsArrayStart = terminalPageSource.indexOf('}, [', effectStart);
    expect(depsArrayStart).toBeGreaterThan(-1);
    const depsArrayEnd = terminalPageSource.indexOf(');', depsArrayStart);
    const depsArray = terminalPageSource.slice(depsArrayStart, depsArrayEnd);

    // The dependency array must not reference the bare `activeShiftId` binding -- only the
    // always-already-declared `shiftState?.shift?.pos_terminal_shift_id` expression.
    expect(depsArray).not.toMatch(/[^.]\bactiveShiftId\b/);
    expect(depsArray).toContain('shiftState?.shift?.pos_terminal_shift_id');

    // The declaration of the `activeShiftId` binding must come after this effect closes, so any
    // future edit that reintroduces a bare reference inside the effect body would be a real TDZ
    // violation, not a false positive from this test.
    const declarationIndex = terminalPageSource.indexOf('const activeShiftId = shiftState?.shift?.pos_terminal_shift_id || null;');
    expect(declarationIndex).toBeGreaterThan(depsArrayEnd);
  });

  it('the session-end sale-draft cleanup derives the shift id inline instead of via activeShiftId', () => {
    expect(terminalPageSource).toContain(
      "        }, shiftState?.shift?.pos_terminal_shift_id || null);"
    );
  });
});
