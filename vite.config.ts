import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 5174,
      host: '0.0.0.0', // Listen on all network interfaces to allow access from other devices
    },
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: [path.resolve(__dirname, 'vitest.setup.ts')],
      include: ['tests/**/*.{test,spec}.{ts,tsx}'],
      exclude: ['supabase/functions/**/*.test.ts'],
      coverage: {
        reporter: ['text', 'lcov'],
        include: ['src/**/*.{ts,tsx}', 'services/**/*.{ts,tsx}', 'supabase/functions/**/*.{ts,tsx}'],
      },
    },
  };
});
