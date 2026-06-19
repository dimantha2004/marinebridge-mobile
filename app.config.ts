import { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  owner: 'dimantha_nishshanka',
  name: 'Marianbridge',
  slug: 'marine',
  scheme: 'marianbridge',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'dark',
  splash: {
    image: './assets/splash.png',
    resizeMode: 'contain',
    backgroundColor: '#0A1628',
  },
  assetBundlePatterns: ['**/*'],
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.hship.app',
    infoPlist: {
      UIBackgroundModes: ['remote-notification'],
    },
  },
  android: {
    package: 'com.hship.app',
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#0A1628',
    },
    permissions: ['NOTIFICATIONS'],
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    [
      'expo-notifications',
      {
        icon: './assets/notification-icon.png',
        color: '#2E6DA4',
      },
    ],
    'expo-document-picker',
    [
      '@stripe/stripe-react-native',
      {
        merchantIdentifier: 'merchant.com.hship.app',
        enableGooglePay: true,
      },
    ],
  ],
  extra: {
    router: {
      origin: false,
    },
    eas: {
      projectId: 'dd3b4595-8c64-4bc9-a5cd-4a95c9046df4',
    },
  },
  experiments: {
    typedRoutes: true,
  },
});
