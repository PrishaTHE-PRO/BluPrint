import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: { proxy: { "/api": "http://localhost:3001" } },
  build: {
    rollupOptions: {
      input: {
        main:           'index.html',
        login:          'login.html',
        dashboard:      'dashboard.html',
        roomResult:     'room-result.html',
        roomDimensions: 'room-dimensions.html',
        inspoUpload:    'inspo-upload.html',
        pastInspiration:'past-inspiration.html',
      },
    },
  },
});
