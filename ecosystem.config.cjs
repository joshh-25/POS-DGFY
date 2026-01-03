module.exports = {
    apps: [
        {
            name: 'sku-backend',
            script: 'cmd.exe',
            args: '/c npm run dev',
            cwd: './backend',
            interpreter: 'none',
            watch: false, // Relies on nodemon for reloading
            env: {
                NODE_ENV: 'development',
            },
        },
        {
            name: 'sku-frontend',
            script: 'cmd.exe',
            args: '/c npm run dev',
            cwd: './frontend',
            interpreter: 'none',
            watch: false, // Relies on Vite for HMR
            env: {
                NODE_ENV: 'development',
            },
        },
    ],
};
