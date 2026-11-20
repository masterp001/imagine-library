import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';

// base './' keeps every asset path relative, so the same build runs from
// GitHub Pages sub-paths, the Capacitor WebView and any static host.
// Shown in the app (Import screen) so you can tell builds apart.
const run = process.env.GITHUB_RUN_NUMBER;
const BUILD = run ? `1.${run} · ${(process.env.GITHUB_SHA ?? '').slice(0, 7)}` : `dev · ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;

export default defineConfig({
  base: './',
  define: { __BUILD__: JSON.stringify(BUILD) },
  plugins: [tailwindcss(), svelte()],
  build: { target: 'es2022', assetsInlineLimit: 0 }
});
