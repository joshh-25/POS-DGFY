const os = require('os');

module.exports = {
    apps: [
        {
            name: 'sku-backend',
            script: './src/server.js',
            cwd: './backend',
            exec_mode: 'fork',
            instances: 1,
            // Restart if memory exceeds 512MB (prevents OOM crash from leaks)
            max_memory_restart: '512M',
            // Stop restart loop if the process keeps crashing on startup
            max_restarts: 10,
            min_uptime: '10s',
            // Wait 5 seconds between restarts to avoid hammering the DB on bad deploys
            restart_delay: 5000,
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
