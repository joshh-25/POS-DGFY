import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const appRoot = path.resolve(__dirname, '..');
const storefrontAppSource = fs.readFileSync(path.join(appRoot, 'StorefrontApp.jsx'), 'utf8');
const serviceBookingStepsSource = fs.readFileSync(path.join(appRoot, 'services/components/ServiceBookingSteps.jsx'), 'utf8');

describe('storefront closed-hours messaging contract', () => {
  it('keeps shared storefront closed-hours copy helpers in StorefrontApp', () => {
    expect(storefrontAppSource).toContain("const STOREFRONT_CLOSED_TITLE = 'This storefront is currently closed.';");
    expect(storefrontAppSource).toContain('const getStorefrontClosedBody = (hoursLabel = \'\') => (');
    expect(storefrontAppSource).toContain('const getStorefrontClosedToastMessage = (hoursLabel = \'\') => (');
    expect(storefrontAppSource).toContain('Come back during business hours');
  });

  it('reuses the shared closed-hours notice near storefront checkout surfaces', () => {
    expect(storefrontAppSource).toContain('renderStorefrontClosedNotice = ({');
    expect(storefrontAppSource).toContain('storefrontClosedByHours && renderStorefrontClosedNotice()');
    expect(storefrontAppSource).toContain("storefrontClosedByHours && renderStorefrontClosedNotice({ accent: '#9a3412', background: '#fff7ed', border: '#fdba74' })");
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
