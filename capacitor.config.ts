import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.inferunity.bidothello',
  appName: 'ビッド式オセロ',
  webDir: 'dist',
  ios: {
    contentInset: 'always',
    backgroundColor: '#0b1d2a',
    limitsNavigationsToAppBoundDomains: true,
  },
  server: {
    androidScheme: 'https',
  },
};

export default config;
