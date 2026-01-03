const os = require('os');

module.exports = {
    apps: [
        {
            name: 'sku-backend',
            script: os.platform() === 'win32' ? 'cmd.exe' : 'npm',
            args: os.platform() === 'win32' ? '/c npm run dev' : 'run dev',
            cwd: './backend',
            interpreter: 'none',
            watch: false, // Relies on nodemon for reloading
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
            args: os.platform() === 'win32' ? '/c npm run preview' : 'run preview',
            cwd: './frontend',
            interpreter: 'none',
            watch: false, // Relies on Vite for HMR
            env: {
                NODE_ENV: 'development',
            },
            env_production: {
                NODE_ENV: 'production',
            },
        },
    ],
};
