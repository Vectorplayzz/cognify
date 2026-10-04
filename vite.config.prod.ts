import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
    plugins: [react(), tailwindcss()],
    resolve: {
        alias: { '@': path.resolve(__dirname, '.') },
    },
    build: {
        outDir: process.env.COGNIFY_OUT_DIR || 'dist',
        emptyOutDir: true,
        assetsDir: 'assets',
        sourcemap: false,
        minify: 'terser',
        chunkSizeWarningLimit: 900,
        rollupOptions: {
            output: {
                manualChunks: {
                    'react-vendor': ['react', 'react-dom', 'react-router-dom'],
                    'motion': ['motion/react'],
                    'markdown': ['react-markdown', 'remark-gfm', 'rehype-highlight'],
                },
            },
        },
    },
});
