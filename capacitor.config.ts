import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'dev.peter.imaginelibrary',
  appName: 'Imagine Library',
  webDir: 'dist',
  backgroundColor: '#141218',
  android: {
    backgroundColor: '#141218',
    allowMixedContent: false
  },
  plugins: {
    // Edge-to-edge on Android 15+: the web app pads itself with env(safe-area-inset-*).
    SystemBars: {
      insetsHandling: 'native',
      initialViewportFitValueHint: 'cover',
      style: 'DARK'
    }
  }
};

export default config;
