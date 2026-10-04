import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    const apiPort = env.API_PORT || '3001';

    return {
        server: {
            port: 3000,
            strictPort: false,
            host: '0.0.0.0',
        },
        plugins: [react()],
        define: {
            'process.env.LLAMA_API_URL': JSON.stringify(env.LLAMA_API_URL || 'http://localhost:11434/api/chat'),
            'process.env.LLAMA_MODEL': JSON.stringify(env.LLAMA_MODEL || 'nvidia/nemotron-3-super-120b-a12b:free'),
            'process.env.VITE_LLM_MODELS': JSON.stringify(env.VITE_LLM_MODELS || 'nvidia/nemotron-3-super-120b-a12b:free'),
        },
        resolve: {
            alias: {
                '@': path.resolve(__dirname, '.'),
            }
        },
        build: {
            outDir: 'dist',
            assetsDir: 'assets',
            sourcemap: false,
            minify: 'terser',
            rollupOptions: {
                output: {
                    manualChunks: {
                        'react-vendor': ['react', 'react-dom', 'react-router-dom'],
                    }
                }
            }
        }
    };
});