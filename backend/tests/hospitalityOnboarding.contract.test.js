import { describe, expect, it } from '@jest/globals';
import fs from 'fs';
import path from 'path';

const repoRoot = path.resolve(process.cwd());
const readSource = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

describe('Hospitality onboarding backend contract', () => {
  it('treats bookable Hospitality rooms as the mode-native onboarding starter requirement', () => {
    const source = readSource('src/modules/onboarding/repositories/onboardingRepository.js');

    expect(source).toContain('hospitality: new Set');
    expect(source).toContain('countHospitalityStarterRooms');
    expect(source).toContain("default_rate: { [Op.gt]: 0 }");
    expect(source).toContain("normalizeWorkflowMode(workflowMode)");
    expect(source).toContain("normalizedWorkflowMode === 'hospitality'");
  });
});
