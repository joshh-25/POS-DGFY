import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../../../..');

const read = (relativePath) => fs.readFileSync(path.resolve(root, relativePath), 'utf8');

describe('iMin notification policy contract', () => {
  it('uses the APK-aware feedback facade throughout POS instead of direct Sonner imports', () => {
    [
      'src/features/pos/components/HospitalityPosPanel.jsx',
      'src/features/pos/components/POSBarcodeScanner.jsx',
      'src/features/pos/components/POSCheckoutTerminal.jsx',
      'src/features/pos/components/PosTenantSetupModal.jsx',
      'src/features/pos/components/SkupervisorPOSBarcodeScanner.jsx',
      'src/features/pos/components/SkupervisorPOSCheckoutTerminal.jsx',
      'src/features/pos/components/TerminalOperationsWorkspace.jsx',
      'src/features/pos/pages/PosPageShell.jsx',
      'src/features/pos/pages/TerminalPage.jsx'
    ].forEach((relativePath) => {
      const source = read(relativePath);
      expect(source).toContain("posToast as toast");
      expect(source).not.toContain("from 'sonner'");
    });
  });

  it('suppresses top-screen and native-alert notification paths in the iMin runtime', () => {
    const sonnerSource = read('Components/ui/sonner.jsx');
    const hardwareBusSource = read('src/features/pos/utils/posHardwareMessageBus.js');
    const layoutSource = read('src/features/pos/components/TerminalPageLayout.jsx');

    expect(sonnerSource).toContain('isIminWrapperRuntime');
    expect(sonnerSource).toContain('if (isIminPosRuntime) return null;');
    expect(hardwareBusSource).toContain('emitIminPosFeedback');
    expect(hardwareBusSource).not.toContain('bridge.showMessage');
    expect(layoutSource).toContain('<IminTerminalFeedback />');
  });
});
