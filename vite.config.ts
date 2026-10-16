import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The blog is served under /blog (the marketing site rewrites /blog/* to this project).
export default defineConfig({
  base: '/blog/',
  plugins: [react()],
  build: { target: 'es2022' },
  server: { port: 5174 },
});
