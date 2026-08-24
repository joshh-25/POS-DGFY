export const testCredentials = {
  email: process.env.E2E_TEST_USER_EMAIL?.trim(),
  password: process.env.E2E_TEST_USER_PASSWORD,
  companyToken: process.env.E2E_TEST_COMPANY_TOKEN?.trim(),
};

export const hasTestCredentials = Boolean(testCredentials.email && testCredentials.password);
