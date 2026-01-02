module.exports = {
    apps: [
        {
            name: 'sku-backend',
            script: 'npm',
            args: 'run dev',
            cwd: './backend',
            watch: false, // nodemon is already watching
            env: {
                NODE_ENV: 'development',
            },
        },
        {
            name: 'sku-frontend',
            script: 'npm',
            args: 'run dev',
            cwd: './frontend',
            watch: false, // vite is already watching
            env: {
                NODE_ENV: 'development',
            },
        },
    ],
};
