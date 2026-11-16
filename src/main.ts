import { Capacitor } from '@capacitor/core';
import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';

const app = mount(App, { target: document.getElementById('app')! });

// Offline support when served from a real origin (GitHub Pages, any static host).
// It also serves downloaded media from ./offline/…. The native app skips it.
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost') && !Capacitor.isNativePlatform()) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

export default app;
