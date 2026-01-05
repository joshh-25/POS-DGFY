const os = require('os');

module.exports = {
    apps: [
        {
            name: 'sku-backend',
            script: './src/server.js',
            cwd: './backend',
            instances: 1,
            autorestart: true,
            watch: false, // Set to true if you want auto-reload on changes
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
            script: os.platform() === 'win32' ? 'cmd.exe' : 'npm',
            args: os.platform() === 'win32' ? '/c npm run dev' : 'run dev',
            cwd: './frontend',
            interpreter: 'none',
            autorestart: true,
            watch: false,
            env: {
                NODE_ENV: 'development',
            },
            env_production: {
                NODE_ENV: 'production',
            },
        },
    ],
};
