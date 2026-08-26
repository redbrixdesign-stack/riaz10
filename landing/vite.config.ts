import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite config for the Beelo landing page.
// Deploy target: any static host (Vercel/Netlify/Cloudflare Pages).
// Base is './' so the build also works from a sub-path if needed.
export default defineConfig({
  plugins: [react()],
  base: './',
  // Reuse Beelo's canonical self-hosted font from the parent app in dev;
  // Vite bundles it into dist for production.
  server: {
    fs: { allow: ['..'] }
  },
  build: {
    target: 'es2020',
    sourcemap: false
  }
});
