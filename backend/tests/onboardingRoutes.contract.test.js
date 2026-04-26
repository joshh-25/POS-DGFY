import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from '@jest/globals';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const onboardingRoutesPath = path.resolve(__dirname, '../src/routes/onboarding.js');

describe('onboarding route contracts', () => {
  it('guards onboarding events route with dedicated onboarding events limiter', () => {
    const source = fs.readFileSync(onboardingRoutesPath, 'utf8');
    expect(source).toContain('onboardingEventsLimiter');
    expect(source).toContain("router.post('/events', authenticate, requireMasterAdmin, onboardingEventsLimiter, validateOnboardingEventPayload, onboardingController.trackOnboardingEvent);");
  });
});
