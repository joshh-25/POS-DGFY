import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const featureRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readSource = (relativePath) => fs.readFileSync(path.join(featureRoot, relativePath), 'utf8');

describe('Hospitality onboarding contract', () => {
    it('uses a room-first setup flow instead of starter item rows for Hospitality tenants', () => {
        const source = readSource('components/OnboardingSetupModal.jsx');

        expect(source).toContain('isHospitalityWorkflowMode');
        expect(source).toContain('HOSPITALITY_WIZARD_STEPS');
        expect(source).toContain("'hospitality_rooms'");
        expect(source).toContain('Starter Room Type and Rooms');
        expect(source).toContain('Create the first customer-facing room type');
    });

    it('creates the customer-facing room type and at least one bookable room through Hospitality APIs', () => {
        const source = readSource('components/OnboardingSetupModal.jsx');

        expect(source).toContain('createHospitalityRoomType');
        expect(source).toContain('createHospitalityRoom');
        expect(source).toContain('default_rate');
        expect(source).toContain('amenities_snapshot');
        expect(source).toContain('save one bookable room type and room');
    });
});
