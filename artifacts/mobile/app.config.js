// Dynamische Expo-Konfiguration.
// Erweitert app.json um eine umgebungsabhängige baseUrl für GitHub Pages.
// In der Replit-Entwicklungsumgebung wird EXPO_ROUTER_BASE_URL nicht gesetzt
// → baseUrl bleibt leer → alles läuft wie bisher.

const base = process.env.EXPO_ROUTER_BASE_URL || '';
const origin = process.env.EXPO_PUBLIC_ORIGIN || 'https://5dbp6h96ch-droid.github.io/Reffenthal-waechter-/';

/** @type {import('expo/config').ExpoConfig} */
module.exports = {
  expo: {
    name: 'R(h)einschiffer',
    slug: 'mobile',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/images/icon.png',
    scheme: 'mobile',
    userInterfaceStyle: 'automatic',
    newArchEnabled: true,
    splash: {
      image: './assets/images/icon.png',
      resizeMode: 'contain',
      backgroundColor: '#143D45',
    },
    ios: { supportsTablet: false },
    android: {},
    web: { favicon: './assets/images/icon.png' },
    plugins: [
      ['expo-router', { origin }],
      'expo-font',
      'expo-web-browser',
      [
        'expo-notifications',
        {
          icon: './assets/images/icon.png',
          color: '#143D45',
        },
      ],
      'expo-task-manager',
      'expo-background-fetch',
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: true,
      ...(base ? { baseUrl: base } : {}),
    },
  },
};
