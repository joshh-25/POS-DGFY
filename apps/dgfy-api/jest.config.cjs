module.exports = {
    testEnvironment: 'node',
    transform: {},
    transformIgnorePatterns: [
        '/node_modules/(?!(uuid|sequelize-pool|winston|@colors|colors|winston-transport|logform|triple-beam|async|is-generator-function|file-uri-to-path)/)',
    ],
    moduleFileExtensions: ['js', 'mjs', 'cjs', 'jsx', 'json', 'node'],
    // packages/web-core has no node_modules of its own (issue #322); its cross-layer contract
    // tests import a few of its modules by relative path, which in turn import
    // @sieitzz/shared-constants -- Jest's resolver walks up from the IMPORTING file, not this
    // package's node_modules, so that bare specifier needs an explicit map. See
    // docs/architecture/frontend-split-sync.md.
    moduleNameMapper: {
        '^@sieitzz/shared-constants/(.*)$': '<rootDir>/node_modules/@sieitzz/shared-constants/src/$1.js',
    },
    testTimeout: 30000,
    verbose: true,
    openHandlesTimeout: 10000,
    roots: ['<rootDir>/tests'],
    testPathIgnorePatterns: ['/node_modules/', '\\.legacy\\.test\\.js$'],
    setupFilesAfterEnv: process.env.TEST_TYPE === 'integration' ? [] : ['<rootDir>/tests/setup.js'],
    globalTeardown: '<rootDir>/tests/globalTeardown.cjs',
    collectCoverageFrom: ['src/**/*.js', '!src/config/*.js', '!src/seeders/*.js'],
};
