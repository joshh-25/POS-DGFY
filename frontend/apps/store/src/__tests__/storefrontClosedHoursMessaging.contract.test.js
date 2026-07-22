import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const appRoot = path.resolve(__dirname, '..');
const storefrontAppSource = fs.readFileSync(path.join(appRoot, 'StorefrontApp.jsx'), 'utf8');
const storefrontClosedStateSource = fs.readFileSync(path.join(appRoot, 'shared/model/storefrontClosedState.js'), 'utf8');
const serviceBookingStepsSource = fs.readFileSync(path.join(appRoot, 'modes/services/booking/components/ServiceBookingSteps.jsx'), 'utf8');

describe('storefront closed-hours messaging contract', () => {
  it('keeps shared storefront closed-hours copy helpers in shared model ownership', () => {
    expect(storefrontClosedStateSource).toContain("export const STOREFRONT_CLOSED_TITLE = 'This storefront is currently closed.';");
    expect(storefrontClosedStateSource).toContain('export const getStorefrontClosedBody = (hoursLabel = \'\') => (');
    expect(storefrontClosedStateSource).toContain('export const getStorefrontClosedToastMessage = (hoursLabel = \'\') => (');
    expect(storefrontClosedStateSource).toContain('Come back during business hours');
  });

  it('reuses the shared closed-hours notice near storefront checkout surfaces', () => {
    expect(storefrontAppSource).toContain('renderStorefrontClosedNotice = ({');
    expect(storefrontAppSource).toContain("storefrontClosedByHours && renderStorefrontClosedNotice({ accent: '#9a3412', background: '#fff7ed', border: '#fdba74' })");
    expect(storefrontAppSource).toContain("closedNotice={storefrontClosedByHours ? renderStorefrontClosedNotice({ accent: fnbOrderBrand, background: '#fff7ed', border: '#fdba74' }) : null}");
    expect(storefrontAppSource).toContain("storefrontClosedByHours && renderStorefrontClosedNotice({ accent: servicesPrimary, background: '#eff6ff', border: '#bfdbfe' })");
  });

  it('passes the closed-hours notice contract into the service booking payment step', () => {
    expect(storefrontAppSource).toContain('storefrontClosedByHours={storefrontClosedByHours}');
    expect(storefrontAppSource).toContain('storefrontClosedTitle={STOREFRONT_CLOSED_TITLE}');
    expect(storefrontAppSource).toContain('storefrontClosedMessageBody={storefrontClosedMessageBody}');
    expect(serviceBookingStepsSource).toContain('storefrontClosedByHours = false');
    expect(serviceBookingStepsSource).toContain("storefrontClosedTitle = 'This storefront is currently closed.'");
    expect(serviceBookingStepsSource).toContain("storefrontClosedMessageBody = ''");
  });
});
