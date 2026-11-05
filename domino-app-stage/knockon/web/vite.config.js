import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// During development the API runs on :8000; Vite forwards /api calls to it.
export default defineConfig({
  plugins: [react()],
  base: './',
  server: { proxy: { '/api': 'http://localhost:8000' } },
  build: { chunkSizeWarningLimit: 2000 },
});
