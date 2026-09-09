/**
 * App config for the web deployment of the Dogly mobile app.
 *
 * This is a sibling of `apps/mobile` (Expo-native, EAS). `apps/mobile-web`
 * keeps the same `app/` and `src/` source code but adapts only the deployment
 * settings so the Expo Router web export can be built and served by Vercel as
 * a static SPA.
 *
 * Differences from the native app.json:
 *  - `web.output: "single"` → one index.html with client-side routing, paired
 *    with the Vercel SPA rewrite (all routes → /index.html) so dynamic
 *    routes like /behavior/result/[eventId] don't 404.
 *  - `web.bundler: "metro"` → Metro + react-native-web (already in deps).
 *  - Native-only plugins (expo-camera, expo-audio, expo-secure-store,
 *    expo-sqlite, expo-notifications, expo-apple-authentication) are omitted
 *    from the plugin list; the source code gates them behind Platform checks
 *    (e.g. secureStore.ts uses sessionStorage on web) so the web build renders
 *    the diary/profile/home surfaces without the native capture UI.
 *  - No EAS/updates config: the web build is a static export, not an OTA
 *    bundle.
 */
module.exports = {
  expo: {
    name: 'Dogly Web',
    slug: 'dogly-web',
    version: '0.1.0',
    orientation: 'portrait',
    scheme: 'dogly-web',
    userInterfaceStyle: 'light',
    icon: './assets/icon.png',
    web: {
      bundler: 'metro',
      output: 'single',
      favicon: './assets/icon.png',
    },
    plugins: ['expo-router'],
    experiments: {
      typedRoutes: true,
    },
    extra: {
      router: {},
    },
  },
};
