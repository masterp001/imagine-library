import { Capacitor, registerPlugin } from '@capacitor/core';

/** Native Grok sign-in for the Android app (android/…/GrokSessionPlugin.java). */
export interface GrokState {
  signedIn: boolean;
  userAgent: string;
}

export interface GrokSessionPlugin {
  status(): Promise<GrokState>;
  login(): Promise<GrokState>;
  logout(): Promise<GrokState>;
  getCookie(o: { url: string }): Promise<GrokState & { cookie: string }>;
  api(o: { path: string; body: string; reload?: boolean }): Promise<{ status: number; text: string }>;
}

export const GrokSession = Capacitor.getPlatform() === 'android' ? registerPlugin<GrokSessionPlugin>('GrokSession') : undefined;
