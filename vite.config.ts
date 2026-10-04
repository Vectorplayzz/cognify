import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    const llamaUrl = (env.LLAMA_API_URL || 'http://localhost:11434/api/chat').replace(/\/+$/, '');
    const apiPort = env.API_PORT || '3001';

    // Parse the URL to split origin and path
    const parsedUrl = new URL(llamaUrl);
    const origin = parsedUrl.origin;
    const urlPath = parsedUrl.pathname;

    // Ollama direct endpoint for streaming (same host, port 11434)
    const ollamaOrigin = `${parsedUrl.protocol}//${parsedUrl.hostname}:11434`;

    return {
        server: {
            port: 3000,
            strictPort: false,
            host: '0.0.0.0',
            proxy: {
                '/llm-api': {
                    target: origin,
                    changeOrigin: true,
                    rewrite: () => urlPath,
                },
                '/ollama-stream': {
                    target: ollamaOrigin,
                    changeOrigin: true,
                    rewrite: () => '/api/generate',
                },
                '/api': {
                    target: `http://localhost:${apiPort}`,
                    changeOrigin: true,
                },
                '/api/execute': {
                    target: `http://localhost:${apiPort}`,
                    changeOrigin: true,
                },
                '/vector-api': {
                    target: process.env.VECTOR_SERVICE_URL || 'http://localhost:8000',
                    changeOrigin: true,
                    rewrite: (path) => path.replace(/^\/vector-api/, ''),
                },
                '/code-exec': {
                    target: 'http://127.0.0.1:2000',
                    changeOrigin: true,
                    rewrite: (path) => path.replace(/^\/code-exec/, ''),
                },
            },
        },
        plugins: [react()],
        define: {
            // Primary LLM configuration (exposed to frontend)
            'process.env.LLAMA_API_URL': JSON.stringify(llamaUrl),
            'process.env.LLAMA_MODEL': JSON.stringify(env.LLAMA_MODEL || 'kimi-k2.5:cloud'),
            // OpenRouter fallback configuration (exposed to frontend)
            'process.env.VITE_LLM_MODELS': JSON.stringify(env.VITE_LLM_MODELS || 'arcee-ai/trinity-large-preview:free,openai/gpt-5-nano,google/gemini-2.0-flash-preview-0514'),
        },
        resolve: {
            alias: {
                '@': path.resolve(__dirname, '.'),
            }
        }
    };
});
