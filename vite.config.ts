import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Development config. The browser only ever talks to Cognify's own /api,
// which owns auth, rate limiting and every upstream service (LLM, Piston,
// search, vectors), so /api is the only proxy needed.
export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    const apiPort = env.API_PORT || '3001';

    return {
        server: {
            port: 3000,
            strictPort: false,
            host: '0.0.0.0',
            proxy: {
                '/api': { target: `http://localhost:${apiPort}`, changeOrigin: true },
            },
        },
        plugins: [react(), tailwindcss()],
        resolve: {
            alias: { '@': path.resolve(__dirname, '.') },
        },
    };
});
