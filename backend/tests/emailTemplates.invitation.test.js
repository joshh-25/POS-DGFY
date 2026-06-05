import { getInvitationTemplate } from '../src/templates/emailTemplates.js';

describe('invitation email template', () => {
  it('builds token-only accept-invite links without company token query params', () => {
    const html = getInvitationTemplate({
      inviterName: 'Master Admin',
      role: 'Staff',
      invitationToken: 'invite-token-123',
      tenantName: 'Acme Foods',
      expiresIn: '7 days',
      appUrl: 'https://app.example.test'
    });

    expect(html).toContain('https://app.example.test/accept-invite?token=invite-token-123');
    expect(html).not.toContain('company=');
    expect(html).not.toContain('companyToken=');
    expect(html).not.toContain('/register?token=');
  });
});
