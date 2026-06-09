import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { proxy: { "/api": "http://localhost:5000" } },
  build: {
    rollupOptions: {
      input: {
        main:       'index.html',
        dashboard:  'dashboard.html',
        roomResult: 'room-result.html',
      },
    },
  },
});

