const config = require('./jest.config.cjs');

module.exports = {
    ...config,
    setupFilesAfterEnv: [], // Disable global setup.js (which mocks Redis)
    testMatch: ['**/supertest_security.test.js'], // Only run this test
};
