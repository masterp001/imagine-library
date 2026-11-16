import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';

const app = mount(App, { target: document.getElementById('app')! });

// Offline support when served from a real origin (GitHub Pages, any static host).
// Sandboxed previews and the Capacitor WebView simply skip this.
if ('serviceWorker' in navigator && location.protocol === 'https:' && !('Capacitor' in window)) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

export default app;
