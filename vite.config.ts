import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    host: '0.0.0.0',
    proxy: {
      '/matchmake': 'http://localhost:2567',
      '/health': 'http://localhost:2567',
    },
  },
  build: {
    chunkSizeWarningLimit: 2048,
    rollupOptions: {
      output: {
        manualChunks: {
          babylon: ['@babylonjs/core'],
          colyseus: ['@colyseus/sdk'],
        },
      },
    },
  },
});
