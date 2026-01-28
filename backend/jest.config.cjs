module.exports = {
    testEnvironment: 'node',
    transform: {},
    transformIgnorePatterns: [
        '/node_modules/(?!(uuid|sequelize-pool|winston|@colors|colors|winston-transport|logform|triple-beam|async|is-generator-function|file-uri-to-path)/)',
    ],
    moduleFileExtensions: ['js', 'mjs', 'cjs', 'jsx', 'json', 'node'],
    testTimeout: 30000,
    verbose: true,
    roots: ['<rootDir>/tests'],
    collectCoverageFrom: ['src/**/*.js', '!src/config/*.js', '!src/seeders/*.js'],
};
