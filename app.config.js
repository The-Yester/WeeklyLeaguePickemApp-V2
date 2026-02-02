export default {
  expo: {
    name: "WeeklyLeaguePickemApp",
    slug: "WeeklyLeaguePickemApp",
    owner: "ryester",
    scheme: "weeklyleaguepickemapp",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "automatic",
    devLauncher: { enabled: true },
    splash: {
      image: "./assets/Splash.png",
      resizeMode: "contain",
      backgroundColor: "#1f366a"
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.ryester.WeeklyLeaguePickemApp",
      buildNumber: "1",
      icon: "./assets/icon.png",
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
        NSPhotoLibraryUsageDescription: "This app needs access to your photo library so you can select a profile picture.",
        UIBackgroundModes: ["fetch", "remote-notification"]
      }
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/images/adaptive-icon.png",
        backgroundColor: "#ffffff"
      },
      package: "com.ryester.WeeklyLeaguePickemApp",
      versionCode: 1,
      intentFilters: [
        {
          action: "VIEW",
          data: {
            scheme: "weeklyleaguepickemapp",
            host: "yahoo" // Optional: adds specificity, e.g., weeklyleaguepickemapp://yahoo
          },
          category: ["BROWSABLE", "DEFAULT"]
        }
      ],
      jsEngine: "jsc",
    },
    platforms: ["ios", "android", "web"],
    plugins: [
      "expo-router",
      "expo-splash-screen",
      "expo-font",
      "expo-image-picker",
      "expo-notifications",
      "expo-web-browser",
      "expo-secure-store"
    ],
    experiments: {
      typedRoutes: true
    },
    extra: {
      router: {},
      eas: {
        projectId: "1a3ac46c-372c-43c5-88c3-86c01b32981d"
      }
    }
  }
};
