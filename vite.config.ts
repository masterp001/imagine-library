import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';

// base './' keeps every asset path relative, so the same build runs from
// GitHub Pages sub-paths, the Capacitor WebView and any static host.
export default defineConfig({
  base: './',
  plugins: [tailwindcss(), svelte()],
  build: { target: 'es2022', assetsInlineLimit: 0 }
});
