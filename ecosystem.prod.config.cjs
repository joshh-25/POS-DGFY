module.exports = {
    apps: [
        {
            name: 'sku-backend',
            script: 'npm',
            args: 'run start',
            cwd: './backend',
            env: {
                NODE_ENV: 'production',
            },
        },
        {
            name: 'sku-frontend',
            script: 'npx',
            args: 'serve -s dist -l 3000',
            cwd: './frontend',
            env: {
                NODE_ENV: 'production',
            },
        },
    ],
};
