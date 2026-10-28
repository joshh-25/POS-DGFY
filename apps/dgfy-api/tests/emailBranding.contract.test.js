import { readFileSync } from 'node:fs';
import { jest } from '@jest/globals';

const sendMailMock = jest.fn();
const createTransportMock = jest.fn(() => ({
  sendMail: sendMailMock,
  verify: jest.fn()
}));

jest.unstable_mockModule('nodemailer', () => ({
  default: { createTransport: createTransportMock }
}));

jest.unstable_mockModule('../src/config/logger.js', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

const emailService = await import('../src/services/emailService.js');
const emailTemplates = await import('../src/templates/emailTemplates.js');

const LEGACY_BRANDING = /SKUpervisor|SKU Inventory Manager/i;
const ORIGINAL_ENV = { ...process.env };
const neutralOrder = {
  tracking_pin: 'SK-ABC123',
  items: [{ item_name: 'Coffee', quantity: 1, sale_price: 100, line_subtotal: 100 }],
  subtotal_amount: 100,
  discount_amount: 0,
  delivery_fee: 0,
  total_amount: 100,
  payment_type: 'cash',
  payment_status: 'paid',
  order_method: 'delivery',
  created_at: '2026-10-25T00:00:00.000Z',
  delivery_address: '12 Market Road'
};

const templateFixtures = {
  getInvitationTemplate: {
    inviterName: 'Alex Admin', role: 'Staff', invitationToken: 'invite-token',
    tenantName: 'North Shop', expiresIn: '7 days', appUrl: 'https://app.example.test'
  },
  getAffiliateInviteTemplate: {
    businessName: 'North Shop', inviterName: 'Alex Admin', invitationToken: 'affiliate-token',
    inviteeEmail: 'staff@example.test', accountExists: true, appOrigin: 'https://store.example.test', expiresIn: '7 days'
  },
  getWelcomeTemplate: {
    username: 'Sam Staff', role: 'Staff', tenantName: 'North Shop', appUrl: 'https://app.example.test'
  },
  getCashierCredentialTemplate: {
    tenantName: 'North Shop', cashierEmail: 'cashier@example.test', temporaryPassword: 'temporary-password',
    loginUrl: 'https://app.example.test/login', resetPasswordUrl: 'https://app.example.test/dgfy/reset-password?email=cashier%40example.test',
    terminalLabel: 'Front Register', storeName: 'North Shop'
  },
  getCompanyApprovedTemplate: {
    companyName: 'North Shop', adminEmail: 'owner@example.test', appUrl: 'https://app.example.test',
    statusUrl: 'https://app.example.test/register-company/status/app-1', posUrl: 'https://pos.example.test/onboarding'
  },
  getCompanyRejectedTemplate: {
    companyName: 'North Shop', rejectionReason: 'Please update your address.',
    statusUrl: 'https://app.example.test/register-company/status/app-1', appUrl: 'https://app.example.test'
  },
  getSubscriptionExpiringTemplate: { companyName: 'North Shop', expiryDate: 'Nov 15, 2026', appUrl: 'https://app.example.test' },
  getSubscriptionCancelledTemplate: { companyName: 'North Shop', downgradeDate: 'Nov 15, 2026' },
  getPaymentFailedTemplate: { companyName: 'North Shop', retryDate: 'Nov 15, 2026' },
  getPaymentFailedGracePeriodTemplate: { companyName: 'North Shop', gracePeriodEnd: 'Nov 15, 2026' },
  getPayMongoSetupTemplate: {
    companyName: 'North Shop', checkoutLink: 'https://checkout.paymongo.com/session-1',
    expiresAt: 'Nov 15, 2026', planName: 'Premium', amount: '3,000'
  },
  getPayMongoSetupExpiredTemplate: { companyName: 'North Shop' },
  getPlanChangePendingTemplate: {
    companyName: 'North Shop', currentPlan: 'Standard', newPlan: 'Premium',
    approvalUrl: 'https://checkout.example.test/approve'
  },
  getPlanChangeAppliedTemplate: { companyName: 'North Shop', oldPlan: 'Standard', newPlan: 'Premium' },
  getReactivationRequestTemplate: { companyName: 'North Shop', requestedAt: 'Oct 26, 2026' },
  getReactivationApprovedTemplate: {
    companyName: 'North Shop', companyToken: 'company-token', loginUrl: 'https://app.example.test/login'
  },
  getResubmissionConfirmationTemplate: { companyName: 'North Shop' },
  getStorefrontOrderConfirmationTemplate: {
    storeName: 'North Shop', order: neutralOrder,
    trackingUrl: 'https://store.example.test/track?pin=SK-ABC123',
    logoUrl: 'https://cdn.example.test/north-shop.png', supportUrl: 'https://store.example.test/contact'
  }
};

const wrapperFixtures = {
  sendInvitationEmail: { email: 'staff@example.test', inviterName: 'Alex Admin', role: 'staff', invitationToken: 'invite-token', tenantName: 'North Shop' },
  sendAffiliateInviteEmail: { email: 'staff@example.test', businessName: 'North Shop', inviterName: 'Alex Admin', invitationToken: 'affiliate-token', accountExists: true },
  sendWelcomeEmail: { email: 'staff@example.test', username: 'Sam Staff', role: 'staff', tenantName: 'North Shop' },
  sendCashierCredentialEmail: { email: 'cashier@example.test', tenantName: 'North Shop', temporaryPassword: 'temporary-password', terminalLabel: 'Front Register', storeName: 'North Shop', tenantId: 'tenant-1' },
  sendStorefrontOrderConfirmationEmail: { email: 'customer@example.test', storeName: 'North Shop', order: neutralOrder, trackingUrl: 'https://store.example.test/track?pin=SK-ABC123', logoUrl: 'https://cdn.example.test/north-shop.png', supportUrl: 'https://store.example.test/contact', tenantId: 'tenant-1' },
  sendCompanyApprovedEmail: { email: 'owner@example.test', companyName: 'North Shop', statusUrl: 'https://app.example.test/register-company/status/app-1' },
  sendCompanyOnboardingEmail: { email: 'owner@example.test', companyName: 'North Shop', statusUrl: 'https://app.example.test/register-company/status/app-1', posUrl: 'https://pos.example.test/onboarding' },
  sendCompanySubmissionReceivedEmail: { email: 'owner@example.test', companyName: 'North Shop', statusUrl: 'https://app.example.test/register-company/status/app-1' },
  sendCompanyRejectedEmail: { email: 'owner@example.test', companyName: 'North Shop', rejectionReason: 'Please update your address.', statusUrl: 'https://app.example.test/register-company/status/app-1' },
  sendEmailOtpCode: { email: 'staff@example.test', code: '123456', purposeLabel: 'email verification', expiresInMinutes: 10 },
  sendSubscriptionExpiringEmail: { email: 'owner@example.test', companyName: 'North Shop', expiryDate: '2026-11-15T00:00:00.000Z' },
  sendSubscriptionCancelledEmail: { email: 'owner@example.test', companyName: 'North Shop', downgradeDate: '2026-11-15T00:00:00.000Z' },
  sendPaymentFailedEmail: { email: 'owner@example.test', companyName: 'North Shop', retryDate: '2026-11-15T00:00:00.000Z' },
  sendPaymentFailedGracePeriodEmail: { email: 'owner@example.test', companyName: 'North Shop', gracePeriodEnd: '2026-11-15T00:00:00.000Z' },
  sendPayMongoSetupEmail: { email: 'owner@example.test', companyName: 'North Shop', checkoutLink: 'https://checkout.paymongo.com/session-1', expiresAt: 'Nov 15, 2026', planName: 'Premium', amount: '3,000' },
  sendPayMongoSetupExpiredEmail: { email: 'owner@example.test', companyName: 'North Shop' },
  sendPlanChangePendingEmail: { email: 'owner@example.test', companyName: 'North Shop', currentPlan: 'Standard', newPlan: 'Premium', approvalUrl: 'https://checkout.example.test/approve' },
  sendPlanChangeAppliedEmail: { email: 'owner@example.test', companyName: 'North Shop', oldPlan: 'Standard', newPlan: 'Premium' },
  sendReactivationRequestEmail: { email: 'admin@example.test', companyName: 'North Shop' },
  sendReactivationApprovedEmail: { email: 'owner@example.test', companyName: 'North Shop', companyToken: 'company-token' },
  sendResubmissionConfirmationEmail: { email: 'owner@example.test', companyName: 'North Shop' }
};

const configureMockSmtp = () => {
  process.env = { ...ORIGINAL_ENV };
  process.env.SMTP_HOST = 'smtp.example.test';
  process.env.SMTP_USER = 'smtp-user@example.test';
  process.env.SMTP_PASS = 'test-password';
  process.env.EMAIL_DELIVERY_LOG_ENABLED = 'false';
  process.env.APP_URL = 'https://app.example.test';
  process.env.STOREFRONT_PUBLIC_ORIGIN = 'https://store.example.test';
  delete process.env.EMAIL_FROM;
  delete process.env.EMAIL_FROM_NAME;
};

const renderedEmailStyles = (html) => {
  const inlineStyles = [...html.matchAll(/\bstyle="([^"]*)"/gi)].map((match) => match[1]);
  const legacyBackgrounds = [...html.matchAll(/\bbgcolor="([^"]*)"/gi)].map((match) => `bgcolor:${match[1]}`);
  return [...inlineStyles, ...legacyBackgrounds].join(';').toLowerCase();
};

const contrastRatio = (foreground, background) => {
  const luminance = (color) => {
    const channels = color.match(/[\da-f]{2}/gi).map((channel) => parseInt(channel, 16) / 255);
    const [red, green, blue] = channels.map((channel) => (
      channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
    ));
    return (0.2126 * red) + (0.7152 * green) + (0.0722 * blue);
  };

  const first = luminance(foreground.replace('#', ''));
  const second = luminance(background.replace('#', ''));
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
};

const brandHeaderContracts = {
  getInvitationTemplate: ['#1a4e8d', '#ffffff'],
  getAffiliateInviteTemplate: ['#1a4e8d', '#ffffff'],
  getWelcomeTemplate: ['#1a4e8d', '#ffffff'],
  getCashierCredentialTemplate: ['#1a4e8d', '#ffffff'],
  getCompanyApprovedTemplate: ['#1a4e8d', '#ffffff'],
  getCompanyRejectedTemplate: ['#1a4e8d', '#ffffff'],
  getSubscriptionExpiringTemplate: ['#1a4e8d', '#ffffff'],
  getSubscriptionCancelledTemplate: ['#1a4e8d', '#ffffff'],
  getPayMongoSetupTemplate: ['#1a4e8d', '#ffffff'],
  getResubmissionConfirmationTemplate: ['#1a4e8d', '#ffffff'],
  getStorefrontOrderConfirmationTemplate: ['#1a4e8d', '#ffffff']
};

const semanticHeaderContracts = {
  getPaymentFailedTemplate: ['#dc2626', '#ffffff'],
  getPaymentFailedGracePeriodTemplate: ['#f59e0b', '#0f172a'],
  getPayMongoSetupExpiredTemplate: ['#dc2626', '#ffffff'],
  getPlanChangePendingTemplate: ['#2563eb', '#ffffff'],
  getPlanChangeAppliedTemplate: ['#166534', '#ffffff'],
  getReactivationRequestTemplate: ['#f59e0b', '#0f172a'],
  getReactivationApprovedTemplate: ['#166534', '#ffffff']
};

const buttonBackgrounds = (html) => [...html.matchAll(/<td\b(?=[^>]*\bbgcolor="([^"]+)")([^>]*)>([\s\S]*?)<\/td>/gi)]
  .filter(([, , , content]) => /<a\b/i.test(content))
  .map(([, background, attributes, content]) => {
    const style = content.match(/<a\b[^>]*\bstyle="([^"]*)"/i)?.[1] || '';
    const foreground = style.match(/(?:^|;)\s*color:\s*([^;]+)/i)?.[1] || '#ffffff';
    return { background: background.toLowerCase(), foreground: foreground.toLowerCase(), attributes };
  });

describe('outbound email branding contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    configureMockSmtp();
    emailService.resetTransporter();
    sendMailMock.mockResolvedValue({ messageId: '<mock@example.test>', accepted: ['recipient@example.test'], rejected: [], response: '250 queued' });
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
    emailService.resetTransporter();
  });

  it('renders every active named email template without authored legacy branding', () => {
    const activeTemplateNames = Object.keys(emailTemplates)
      .filter((name) => /^get.*Template$/.test(name))
      .sort();

    expect(Object.keys(templateFixtures).sort()).toEqual(activeTemplateNames);

    for (const [name, fixture] of Object.entries(templateFixtures)) {
      const html = emailTemplates[name](fixture);
      expect(typeof html).toBe('string');
      expect(html).not.toMatch(LEGACY_BRANDING);
    }
  });

  it('uses solid, accessible palette fallbacks on DGFY and semantic surfaces', () => {
    for (const [name, fixture] of Object.entries(templateFixtures)) {
      const html = emailTemplates[name](fixture);
      const styles = renderedEmailStyles(html);
      expect(styles).not.toMatch(/linear-gradient|#0d9488|#0891b2/i);
    }

    for (const [name, [background, foreground]] of Object.entries({
      ...brandHeaderContracts,
      ...semanticHeaderContracts
    })) {
      const html = emailTemplates[name](templateFixtures[name]);
      const header = html.match(/<td\b(?=[^>]*\bbgcolor="([^"]+)")[^>]*>([\s\S]*?)<\/td>/i);
      const backgroundColor = header?.[1].toLowerCase();
      const headerStyle = header?.[0].match(/\bstyle="([^"]*)"/i)?.[1].toLowerCase() || '';
      const headerForeground = header?.[2].match(/<h1\b[^>]*\bstyle="[^"]*color:\s*([^;"]+)/i)?.[1].toLowerCase()
        || headerStyle.match(/(?:^|;)\s*color:\s*([^;]+)/i)?.[1].toLowerCase();

      expect(backgroundColor).toBe(background);
      expect(headerStyle).toContain(`background-color:${background}`);
      expect(headerForeground).toBe(foreground);
      expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(4.5);
    }

    const buttonContracts = {
      getInvitationTemplate: ['#1a4e8d'],
      getAffiliateInviteTemplate: ['#1a4e8d'],
      getWelcomeTemplate: ['#1a4e8d'],
      getCashierCredentialTemplate: ['#1a4e8d', '#ffffff'],
      getCompanyApprovedTemplate: ['#1a4e8d'],
      getCompanyRejectedTemplate: ['#1a4e8d'],
      getSubscriptionExpiringTemplate: ['#1a4e8d'],
      getPayMongoSetupTemplate: ['#1a4e8d'],
      getPlanChangePendingTemplate: ['#1a4e8d'],
      getReactivationApprovedTemplate: ['#1a4e8d'],
      getStorefrontOrderConfirmationTemplate: ['#1a4e8d']
    };

    for (const [name, expectedBackgrounds] of Object.entries(buttonContracts)) {
      const html = emailTemplates[name](templateFixtures[name]);
      const buttons = buttonBackgrounds(html);
      expect(buttons.map(({ background }) => background)).toEqual(expectedBackgrounds);

      for (const button of buttons) {
        expect(button.attributes.toLowerCase()).toContain(`background-color:${button.background}`);
        expect(contrastRatio(button.foreground, button.background)).toBeGreaterThanOrEqual(4.5);
      }
    }

    const statusSurfaces = {
      getCompanyApprovedTemplate: '#16a34a',
      getCompanyRejectedTemplate: '#dc2626',
      getPaymentFailedTemplate: '#dc2626',
      getPaymentFailedGracePeriodTemplate: '#f59e0b',
      getPayMongoSetupExpiredTemplate: '#dc2626',
      getPlanChangePendingTemplate: '#2563eb',
      getPlanChangeAppliedTemplate: '#16a34a',
      getReactivationRequestTemplate: '#f59e0b',
      getReactivationApprovedTemplate: '#16a34a',
      getResubmissionConfirmationTemplate: '#2563eb'
    };

    for (const [name, color] of Object.entries(statusSurfaces)) {
      expect(renderedEmailStyles(emailTemplates[name](templateFixtures[name]))).toContain(color);
    }

    const readableSurfaceContracts = [
      ['getCashierCredentialTemplate', '#aee8f4', '#1a4586'],
      ['getCompanyApprovedTemplate', '#aee8f4', '#1a4586'],
      ['getCompanyRejectedTemplate', '#fef2f2', '#7f1d1d'],
      ['getInvitationTemplate', '#fef3c7', '#92400e'],
      ['getPlanChangePendingTemplate', '#eff6ff', '#1a4586'],
      ['getPlanChangeAppliedTemplate', '#f0fdf4', '#166534']
    ];

    for (const [name, background, foreground] of readableSurfaceContracts) {
      const styles = renderedEmailStyles(emailTemplates[name](templateFixtures[name]));
      expect(styles).toContain(background);
      expect(styles).toContain(foreground);
      expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('does not mistake tenant-provided color-like text for authored email styling', () => {
    const html = emailTemplates.getInvitationTemplate({
      ...templateFixtures.getInvitationTemplate,
      tenantName: 'North Shop #0d9488'
    });

    expect(html).toContain('North Shop #0d9488');
    expect(renderedEmailStyles(html)).not.toContain('#0d9488');
  });

  it('sends every active email-specific wrapper with DGFY fallback and clean subject, HTML, and text', async () => {
    const activeWrapperNames = Object.keys(emailService)
      .filter((name) => /^send[A-Z]/.test(name) && name !== 'sendEmail')
      .sort();

    expect(Object.keys(wrapperFixtures).sort()).toEqual(activeWrapperNames);

    for (const [name, fixture] of Object.entries(wrapperFixtures)) {
      await emailService[name](fixture);
    }

    expect(sendMailMock).toHaveBeenCalledTimes(activeWrapperNames.length);
    for (const [message] of sendMailMock.mock.calls) {
      expect(message.from).toBe('"DGFY" <smtp-user@example.test>');
      expect(message.text).toEqual(expect.any(String));
      expect(`${message.subject}\n${message.html}\n${message.text}`).not.toMatch(LEGACY_BRANDING);

      if (message.subject === 'Your DGFY email verification code') {
        expect(renderedEmailStyles(message.html)).not.toMatch(/(?:color|background(?:-color)?):|bgcolor:/i);
      }

      if (message.subject.startsWith('Registration received:')) {
        expect(renderedEmailStyles(message.html)).not.toMatch(/(?:color|background(?:-color)?):|bgcolor:/i);
      }
    }

    const invitation = sendMailMock.mock.calls.find(([message]) => message.subject.startsWith("You've been invited"))[0];
    expect(invitation.subject).toBe("You've been invited to join North Shop on DGFY");
    expect(invitation.html).toContain('https://app.example.test/accept-invite?token=invite-token');

    const welcome = sendMailMock.mock.calls.find(([message]) => message.subject.startsWith('Welcome to'))[0];
    expect(welcome.html).toContain('href="https://app.example.test/login?utm_source=email');

    const companyOnboarding = sendMailMock.mock.calls.find(([message]) => message.subject.includes('ready for POS onboarding'))[0];
    expect(companyOnboarding.html).toContain('https://app.example.test/register-company/status/app-1');
    expect(companyOnboarding.html).toContain('https://pos.example.test/onboarding');

    const cashier = sendMailMock.mock.calls.find(([message]) => message.subject.startsWith('Your cashier login details'))[0];
    expect(cashier.text).toContain('https://app.example.test/login');
    expect(cashier.text).toContain('https://app.example.test/dgfy/reset-password?email=cashier%40example.test');

    const subscriptionExpiring = sendMailMock.mock.calls.find(([message]) => message.subject.startsWith('Your Premium subscription'))[0];
    expect(subscriptionExpiring.html).toContain('href="https://app.example.test/settings?tab=subscription');

    const payMongoSetup = sendMailMock.mock.calls.find(([message]) => message.subject.startsWith('Action Required: Set Up PayMongo'))[0];
    expect(payMongoSetup.html).toContain('href="https://checkout.paymongo.com/session-1"');

    const planChange = sendMailMock.mock.calls.find(([message]) => message.subject.startsWith('Plan Change Pending'))[0];
    expect(planChange.html).toContain('href="https://checkout.example.test/approve"');

    const storefront = sendMailMock.mock.calls.find(([message]) => message.subject.startsWith('Order confirmation'))[0];
    expect(storefront.html).toContain('href="https://store.example.test/track?pin=SK-ABC123"');
    expect(storefront.html).toContain('src="https://cdn.example.test/north-shop.png"');
    expect(storefront.html).toContain('alt="North Shop"');
    expect(storefront.text).toContain('https://store.example.test/contact');

    await emailService.sendAffiliateInviteEmail({
      ...wrapperFixtures.sendAffiliateInviteEmail,
      accountExists: false
    });
    const [newAccountAffiliateInvite] = sendMailMock.mock.calls.at(-1);
    expect(newAccountAffiliateInvite.html).toContain('href="https://store.example.test/register?email=staff%40example.test&amp;aff_invite=affiliate-token');
    expect(newAccountAffiliateInvite.html).toContain('Create your DGFY account');
    expect(buttonBackgrounds(newAccountAffiliateInvite.html).map(({ background }) => background)).toEqual(['#1a4e8d']);
    expect(renderedEmailStyles(newAccountAffiliateInvite.html)).not.toMatch(/linear-gradient|#0d9488|#0891b2/i);
  });

  it('keeps configured sender identity precedence and explicit DGFY senders', async () => {
    process.env.EMAIL_FROM_NAME = 'Configured Display';
    process.env.EMAIL_FROM = 'configured@example.test';

    await emailService.sendEmail({
      to: 'recipient@example.test',
      subject: 'Sender override',
      html: '<p>Message</p>',
      fromName: 'Per-message Display',
      fromEmail: 'override@example.test'
    });
    expect(sendMailMock.mock.calls.at(-1)[0].from).toBe('"Per-message Display" <override@example.test>');

    await emailService.sendEmail({ to: 'recipient@example.test', subject: 'Configured sender', html: '<p>Message</p>' });
    expect(sendMailMock.mock.calls.at(-1)[0].from).toBe('"Configured Display" <configured@example.test>');

    await emailService.sendAffiliateInviteEmail(wrapperFixtures.sendAffiliateInviteEmail);
    await emailService.sendEmailOtpCode(wrapperFixtures.sendEmailOtpCode);
    await emailService.sendStorefrontOrderConfirmationEmail(wrapperFixtures.sendStorefrontOrderConfirmationEmail);

    for (const [message] of sendMailMock.mock.calls.slice(-3)) {
      expect(message.from).toBe('"DGFY" <configured@example.test>');
    }
  });

  it('preserves tenant names that happen to contain historical branding', async () => {
    await emailService.sendInvitationEmail({
      email: 'staff@example.test',
      inviterName: 'Alex Admin',
      role: 'staff',
      invitationToken: 'invite-token',
      tenantName: 'SKUpervisor Legacy Tenant'
    });

    const [message] = sendMailMock.mock.calls.at(-1);
    expect(message.subject).toBe("You've been invited to join SKUpervisor Legacy Tenant on DGFY");
    expect(message.html).toContain('SKUpervisor Legacy Tenant');
  });

  it('uses DGFY for email tenant-name fallbacks in userService', () => {
    const userService = readFileSync(new URL('../src/services/userService.js', import.meta.url), 'utf8');

    expect(userService).not.toMatch(/tenantName[^\n]*SKUpervisor/);
    expect(userService).toMatch(/tenantName = store\?\.tenantName \|\| 'DGFY'/);
    expect(userService).toMatch(/tenantName: dbStore\.getStore\(\)\?\.tenantName \|\| 'DGFY'/);
  });

  it('keeps the explicit opt-in diagnostic copy branded DGFY without sending mail', () => {
    const script = readFileSync(new URL('../scripts/verify-email-delivery.js', import.meta.url), 'utf8');

    expect(script).toContain("if (sendTo) {");
    expect(script).toContain("subject: 'DGFY email delivery verification'");
    expect(script).toContain("html: '<p>This is a DGFY email delivery verification message.</p>'");
    expect(script).toContain("text: 'This is a DGFY email delivery verification message.'");
    expect(script).not.toMatch(LEGACY_BRANDING);
    expect(sendMailMock).not.toHaveBeenCalled();
  });
});
