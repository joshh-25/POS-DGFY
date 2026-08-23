export const BUSINESS_REGISTRATION_SUBMISSION_PATH = '/business-registration-submission';

export const buildBusinessRegistrationSubmissionPath = (applicationId = '') => {
  const normalizedApplicationId = String(applicationId || '').trim();
  if (!normalizedApplicationId) return BUSINESS_REGISTRATION_SUBMISSION_PATH;
  const search = new URLSearchParams({ application_id: normalizedApplicationId });
  return `${BUSINESS_REGISTRATION_SUBMISSION_PATH}?${search.toString()}`;
};

export const buildCustomerDashboardOverviewPath = () => '/map-dgfy/account/overview';
