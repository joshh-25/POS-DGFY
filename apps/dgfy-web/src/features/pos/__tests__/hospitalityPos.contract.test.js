import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const featureRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readSource = (relativePath) => fs.readFileSync(path.join(featureRoot, relativePath), 'utf8');

describe('Hospitality POS contract', () => {
    it('renders a front-desk folio panel gated on the hospitalityReservations capability', () => {
        // Real render-behavior coverage (not just this source-text check) lives in
        // posPageShellCapabilityPanels.behavior.test.jsx, which also proves the
        // panel composes with other verticals under the Phase 6 capability overlay.
        const page = readSource('pages/PosPageShell.jsx');

        expect(page).toContain("hasCapability('hospitalityReservations')");
        expect(page).toContain('HospitalityPosPanel');
        expect(page).toContain('Loading Hospitality front desk POS');
    });

    it('posts Hospitality folio lines for room charges, deposits, payments, refunds, and on-property extras', () => {
        const panel = readSource('components/HospitalityPosPanel.jsx');

        expect(panel).toContain('Hospitality Front Desk POS');
        expect(panel).toContain('Charge to room');
        expect(panel).toContain('createHospitalityFolio');
        expect(panel).toContain('addHospitalityFolioLine');
        expect(panel).toContain("'room_charge'");
        expect(panel).toContain("'deposit'");
        expect(panel).toContain("'payment'");
        expect(panel).toContain("'refund'");
        expect(panel).toContain("'minibar'");
        expect(panel).toContain('unit_amount');
        expect(panel).toContain('Post to Folio');
    });
});
