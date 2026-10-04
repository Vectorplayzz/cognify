module.exports = {
    apps: [
        {
            name: 'cognify-api',
            script: './server/index.js',
            cwd: '/var/www/cognify',
            instances: 1,
            exec_mode: 'fork',
            env: {
                NODE_ENV: 'production',
                API_PORT: 3002
            },
            error_file: './logs/api-error.log',
            out_file: './logs/api-out.log',
            log_file: './logs/api-combined.log',
            time: true,
            watch: false,
            max_memory_restart: '1G',
            restart_delay: 5000
        },
        {
            // OmniRoute AI gateway. Requires Node >=22.22.2, so it runs under
            // the nvm-installed Node 22 while everything else stays on Node 20.
            // Bound to loopback: it exposes an unauthenticated /v1 inference
            // plane and must never listen on a public interface.
            name: 'omniroute',
            script: '/root/.nvm/versions/node/v22.23.2/lib/node_modules/omniroute/bin/omniroute.mjs',
            interpreter: '/root/.nvm/versions/node/v22.23.2/bin/node',
            args: 'serve --no-open --port 20128',
            cwd: '/root',
            instances: 1,
            exec_mode: 'fork',
            env: {
                NODE_ENV: 'production',
                OMNIROUTE_SERVER_HOST: '127.0.0.1'
            },
            error_file: '/var/www/cognify/logs/omniroute-error.log',
            out_file: '/var/www/cognify/logs/omniroute-out.log',
            time: true,
            watch: false,
            max_memory_restart: '1G',
            restart_delay: 5000
        }
    ]
};
