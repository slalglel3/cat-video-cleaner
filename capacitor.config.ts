import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.slalglel.catcleaner',
  appName: 'CatCleaner',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    cleartext: false,     // 평문 HTTP 통신 완전 차단
    allowNavigation: [], // 외부 임의 도메인 탐색 원천 차단
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  loggingBehavior: 'none',
};

export default config;
