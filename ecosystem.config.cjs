module.exports = {
    apps: [
        {
            name: 'sku-backend',
            script: './src/server.js',
            cwd: './backend',
            exec_mode: 'fork',
            instances: 1,
            // Matches `npm start`'s `node --import ./src/instrument.js src/server.js`
            // (backend/package.json). Without this, Sentry.init() runs from
            // server.js after ~65 application imports have already loaded
            // express/mysql2, so the auto-instrumentation integrations in
            // src/config/sentry.js never patch them -- see #298.
            node_args: '--import ./src/instrument.js',
            // Restart if memory exceeds 512MB (prevents OOM crash from leaks)
            max_memory_restart: '512M',
            // Stop restart loop if the process keeps crashing on startup
            max_restarts: 10,
            min_uptime: '10s',
            // Wait 5 seconds between restarts to avoid hammering the DB on bad deploys
            restart_delay: 5000,
            env: {
                NODE_ENV: 'development',
                CORS_ORIGIN: 'http://localhost:5173,http://localhost:5174,http://localhost:5175,https://skupervisor.surebizcorp.com,https://surebizcorp.com,https://pos.surebizcorp.com,https://store.surebizcorp.com,https://skupervisor.dgfy.ph,https://pos.dgfy.ph,https://dgfy.ph,https://store.dgfy.ph,https://staging.dgfy.ph',
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
                CORS_ORIGIN: 'https://skupervisor.surebizcorp.com,https://surebizcorp.com,https://pos.surebizcorp.com,https://store.surebizcorp.com,https://skupervisor.dgfy.ph,https://pos.dgfy.ph,https://dgfy.ph,https://store.dgfy.ph,https://staging.dgfy.ph',
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
        // Staging processes — serve the staging.dgfy.ph environment
        {
            name: 'sku-staging-backend',
            script: './src/server.js',
            cwd: './backend',
            exec_mode: 'fork',
            instances: 1,
            // See sku-backend above -- same instrumentation-preload rationale.
            node_args: '--import ./src/instrument.js',
            max_memory_restart: '512M',
            max_restarts: 10,
            min_uptime: '10s',
            restart_delay: 5000,
            env: {
                NODE_ENV: 'staging',
                PORT: '5002',
                HOSTING_PROFILE: 'vps',
                HOSTING_INSTANCE_COUNT: '1',
                AUTH_BLACKLIST_FAILURE_MODE: 'fail_closed',
                TEMP_FILE_STORAGE: 'auto',
                STOREFRONT_DISCOVERY_REDIS_CACHE_ENABLED: 'true',
                CUSTOMER_ACCESS_MODES_ENABLED: 'false',
                TENANT_REGISTRATION_APPROVAL_MODE: 'manual',
                PAYMENTS_ENABLED: 'false',
                DB_AUTO_SYNC: 'false',
                CORS_ORIGIN: 'https://staging.dgfy.ph',
            },
            env_staging: {
                NODE_ENV: 'staging',
                PORT: '5002',
                HOSTING_PROFILE: 'vps',
                HOSTING_INSTANCE_COUNT: '1',
                AUTH_BLACKLIST_FAILURE_MODE: 'fail_closed',
                TEMP_FILE_STORAGE: 'auto',
                STOREFRONT_DISCOVERY_REDIS_CACHE_ENABLED: 'true',
                CUSTOMER_ACCESS_MODES_ENABLED: 'false',
                TENANT_REGISTRATION_APPROVAL_MODE: 'manual',
                PAYMENTS_ENABLED: 'false',
                DB_AUTO_SYNC: 'false',
                CORS_ORIGIN: 'https://staging.dgfy.ph',
            },
        },
        {
            name: 'sku-staging-frontend',
            script: './node_modules/vite/bin/vite.js',
            args: 'preview --config apps/skupervisor/vite.config.js --host --port 5183 --strictPort',
            cwd: './frontend',
            env_staging: {
                NODE_ENV: 'production',
            },
        },
    ],
};
