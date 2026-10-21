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

  it('links the owner to POS onboarding while describing the catalog-only restriction', () => {
    const html = getCompanyApprovedTemplate({
      companyName: 'Catalog Foods',
      adminEmail: 'owner@example.com',
      statusUrl: 'https://skupervisor.example.test/register-company/status/application-1',
      posUrl: 'https://pos.example.test/#/terminal?setup_flow=tenant_onboarding&setup_step=profile&view=items&tenant_id=tenant-1',
      appUrl: 'https://app.example.test'
    });

    expect(html).toContain('Open POS onboarding');
    expect(html).toContain('https://pos.example.test/#/terminal?setup_flow=tenant_onboarding&amp;setup_step=profile&amp;view=items&amp;tenant_id=tenant-1&amp;utm_source=email&amp;utm_medium=transactional&amp;utm_campaign=company_onboarding');
    expect(html).toContain('add items and categories now');
    expect(html).toContain('selling and storefront visibility remain disabled');
  });
});
