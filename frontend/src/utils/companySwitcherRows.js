const COMPANY_ROLE_LABELS = {
  owner: 'Business Owner',
  business_owner: 'Business Owner',
  admin: 'Admin',
  manager: 'Manager',
  cashier: 'Cashier',
  staff: 'Staff',
  member: 'Member',
  msme_admin: 'Admin',
  fnb_admin: 'Admin',
  msme_manager: 'Manager',
  fnb_manager: 'Manager',
  msme_cashier: 'Cashier',
  fnb_cashier: 'Cashier'
};

export const getCompanyRoleLabel = (company = {}) => {
  if (company?.is_owner === true || String(company?.ownership || '').trim().toLowerCase() === 'owner') {
    return 'Business Owner';
  }

  const role = String(company?.role || '').trim().toLowerCase();
  if (!role) return 'Member';
  if (COMPANY_ROLE_LABELS[role]) return COMPANY_ROLE_LABELS[role];

  return role
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
};

export const buildCurrentCompanyFromUser = (user) => {
  const company = user?.company || {};
  const name = String(company.name || '').trim();
  return {
    membership_id: 'current-ims-session',
    tenant_id: company.id || null,
    tenant_user_id: user?.user_id || null,
    company_name: name || 'Current company',
    role: user?.role || 'member',
    source: 'ims_session',
    membership_status: 'current',
    tenant_status: 'active',
    plan: company.plan || null,
    accepted_at: null,
    last_selected_at: null,
    is_current: true,
    can_switch: false,
    requires_action: null
  };
};

export const mergeCurrentCompanyWithMemberships = (user, memberships = []) => {
  const currentCompany = buildCurrentCompanyFromUser(user);
  const currentTenantId = String(currentCompany.tenant_id || '').trim();
  const rows = Array.isArray(memberships) ? memberships : [];
  const hasCurrentRow = rows.some((company) => (
    company?.is_current === true
    || (
      currentTenantId
      && String(company?.tenant_id || '').trim() === currentTenantId
    )
  ));

  if (!hasCurrentRow) {
    return [currentCompany, ...rows];
  }

  return rows.map((company) => {
    const sameTenant = currentTenantId && String(company?.tenant_id || '').trim() === currentTenantId;
    if (company?.is_current === true || sameTenant) {
      return {
        ...company,
        is_current: true,
        company_name: company?.company_name || currentCompany.company_name,
        role: company?.role || currentCompany.role,
        plan: company?.plan || currentCompany.plan,
        can_switch: false
      };
    }
    return company;
  });
};
