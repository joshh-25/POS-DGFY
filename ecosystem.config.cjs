const os = require('os');

module.exports = {
    apps: [
        {
            name: 'sku-backend',
            script: './src/server.js',
            cwd: './backend',
            env: {
                NODE_ENV: 'development',
                CORS_ORIGIN: 'http://localhost:5173,https://skupervisor.surebizcorp.com',
            },
            env_production: {
                NODE_ENV: 'production',
                CORS_ORIGIN: 'https://skupervisor.surebizcorp.com',
            },
        },
        {
            name: 'sku-frontend',
            script: './node_modules/vite/bin/vite.js',
            args: '--host',
            cwd: './frontend',
            env: {
                NODE_ENV: 'development',
            },
            env_production: {
                NODE_ENV: 'production',
            },
        },
    ],
};
