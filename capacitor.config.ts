import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.bebe.bestshot',
  appName: 'Bébé Best',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
