module.exports = {
    apps: [
        {
            name: 'sku-backend',
            script: 'backend/src/app.js', // Adjust if your entry point is different
            instances: 1,
            autorestart: true,
            watch: false,
            max_memory_restart: '1G',
            env: {
                NODE_ENV: 'development',
                PORT: 5001
            },
            env_production: {
                NODE_ENV: 'production',
                PORT: 5001
            }
        },
        {
            name: 'sku-frontend',
            script: 'serve',
            env: {
                PM2_SERVE_PATH: './frontend/dist',
                PM2_SERVE_PORT: 5173,
                PM2_SERVE_SPA: 'true',
                PM2_SERVE_HOMEPAGE: '/index.html'
            },
            env_production: {
                PM2_SERVE_PATH: './frontend/dist',
                PM2_SERVE_PORT: 5173,
                PM2_SERVE_SPA: 'true',
                PM2_SERVE_HOMEPAGE: '/index.html'
            }
        }
    ]
};
