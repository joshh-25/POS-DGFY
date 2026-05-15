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
                CORS_ORIGIN: 'http://localhost:5173,http://localhost:5174,http://localhost:5175,https://skupervisor.surebizcorp.com,https://surebizcorp.com,https://pos.surebizcorp.com,https://store.surebizcorp.com,https://skupervisor.dgfy.ph,https://pos.dgfy.ph,https://dgfy.ph,https://store.dgfy.ph',
            },
            env_production: {
                NODE_ENV: 'production',
                HOSTING_PROFILE: 'vps',
                HOSTING_INSTANCE_COUNT: '1',
                AUTH_BLACKLIST_FAILURE_MODE: 'fail_closed',
                TEMP_FILE_STORAGE: 'auto',
                STOREFRONT_DISCOVERY_REDIS_CACHE_ENABLED: 'true',
                CUSTOMER_ACCESS_MODES_ENABLED: 'true',
                TENANT_REGISTRATION_APPROVAL_MODE: 'manual',
                PAYMENTS_ENABLED: 'false',
                DB_AUTO_SYNC: 'false',
                CORS_ORIGIN: 'https://skupervisor.surebizcorp.com,https://surebizcorp.com,https://pos.surebizcorp.com,https://store.surebizcorp.com,https://skupervisor.dgfy.ph,https://pos.dgfy.ph,https://dgfy.ph,https://store.dgfy.ph',
            },
        },
        {
            name: 'sku-frontend',
            script: './node_modules/vite/bin/vite.js',
            args: 'preview --config apps/skupervisor/vite.config.js --host --port 5173 --strictPort',
            cwd: './frontend',
            env: {
                NODE_ENV: 'production',
            },
            env_production: {
                NODE_ENV: 'production',
            },
        },
        {
            name: 'sku-pos-frontend',
            script: './node_modules/vite/bin/vite.js',
            args: 'preview --config apps/pos/vite.config.js --host --port 5174 --strictPort',
            cwd: './frontend',
            env: {
                NODE_ENV: 'production',
            },
            env_production: {
                NODE_ENV: 'production',
            },
        },
        {
            name: 'sku-store-frontend',
            script: './node_modules/vite/bin/vite.js',
            args: 'preview --config apps/store/vite.config.js --host --port 5175 --strictPort',
            cwd: './frontend',
            env: {
                NODE_ENV: 'production',
            },
            env_production: {
                NODE_ENV: 'production',
            },
        },
    ],
};
