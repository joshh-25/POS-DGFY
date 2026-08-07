import { getCompanyApprovedTemplate } from '../src/templates/emailTemplates.js';

describe('company approval email template', () => {
  it('confirms approval without exposing company token or security note', () => {
    const html = getCompanyApprovedTemplate({
      companyName: 'Approved Foods',
      adminEmail: 'owner@example.com',
      companyToken: 'token-approved-foods-123',
      appUrl: 'https://app.example.test'
    });

    expect(html).toContain('Your Company Has Been Approved!');
    expect(html).toContain('Approved Foods');
    expect(html).toContain('owner@example.com');
    expect(html).toContain('View company status');
    expect(html).not.toContain('Company Token');
    expect(html).not.toContain('token-approved-foods-123');
    expect(html).not.toContain('Security Note');
  });
});
