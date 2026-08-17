import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const terminalPageSource = fs.readFileSync(path.resolve(__dirname, '../pages/TerminalPage.jsx'), 'utf8');
const terminalPageLayoutSource = fs.readFileSync(path.resolve(__dirname, '../components/TerminalPageLayout.jsx'), 'utf8');
const posCheckoutTerminalSource = fs.readFileSync(path.resolve(__dirname, '../components/POSCheckoutTerminal.jsx'), 'utf8');

// The iMin Android wrapper shows a full-screen "POS startup timeout" overlay
// (WebPosActivity.kt, READY_SIGNAL_FALLBACK_MS = 10_000L) unless the web app
// calls window.iMinBridge.notifyWebPosReady() within 10s of page load. Before
// this fix, the only call site was a mount effect inside POSCheckoutTerminal,
// which TerminalPageLayout.jsx renders only when `!locked`. On every APK cold
// launch the terminal boots locked (sessionStorage is cleared when the
// WebView process restarts -- see browserSession.js's
// IS_STANDALONE_POS_SURFACE handling), so the checkout terminal never
// mounted, the ready signal never fired, and the timeout overlay
// permanently covered the login screen. See issue #396.
describe('POS iMin wrapper ready signal', () => {
  it('signals ready as soon as terminal startup resolves, not only once the checkout terminal mounts', () => {
    expect(terminalPageSource).toContain(
      "import { notifyIminWebPosReady } from '../utils/iminHardwareBridge.js';"
    );

    // Must fire on terminalStartupLoading resolving (covers the locked/login
    // screen and every restored view mode), not be gated behind `locked`.
    const readyEffectMatch = terminalPageSource.match(
      /useEffect\(\(\) => \{\s*if \(terminalStartupLoading\) return;\s*notifyIminWebPosReady\(\);\s*\}, \[terminalStartupLoading\]\);/
    );
    expect(readyEffectMatch).not.toBeNull();
  });

  it('does not rely solely on the checkout terminal mount, which only renders when unlocked', () => {
    // Documents the deadlock this fix breaks: TerminalPageLayout only mounts
    // POSCheckoutTerminal (whose own effect calls notifyIminWebPosReady)
    // once the session is unlocked.
    expect(terminalPageLayoutSource).toContain('{!locked && (');
    expect(posCheckoutTerminalSource).toContain('notifyIminWebPosReady();');
  });
});
