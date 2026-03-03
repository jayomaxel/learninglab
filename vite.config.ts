import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
      headers: {
        // add ws: so Vite HMR websocket can connect, plus allow localhost proxy port
        'Content-Security-Policy': "default-src 'self'; connect-src 'self' http://localhost:3001 ws:; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:"
      }
    },
    plugins: [react()],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    },
    build: {
      target: 'esnext'
    },
    optimizeDeps: {
      exclude: ['pdfjs-dist']
    }
  };
});
