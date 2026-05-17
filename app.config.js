module.exports = ({ config }) => ({
  ...config,
  plugins: [
    "expo-router",
    "expo-notifications",
    "expo-apple-authentication",
    [
      "@sentry/react-native/expo",
      {
        // Sentry DSN は https://sentry.io でプロジェクト作成後に取得し
        // EAS Secret に SENTRY_DSN を設定する
        url: "https://sentry.io/",
      }
    ],
    ["@react-native-google-signin/google-signin", {
      iosUrlScheme: process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME ?? "com.googleusercontent.apps.316368993378-3hvql0htr6gusjd5vrbof0truso97g8i",
    }]
  ],
  extra: {
    router: {},
    eas: {
      projectId: "6cf40c14-7b75-471f-9ce5-17d8585326c5"
    },
    google: {
      iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? "316368993378-3hvql0htr6gusjd5vrbof0truso97g8i.apps.googleusercontent.com",
      webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? "316368993378-nq558jfjf43n69rbvlj5q708fc7sfb3k.apps.googleusercontent.com",
    },
    firebase: {
      apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? "AIzaSyDWSwaOpnpCRKJ_dnV-gKktuqmRYIJhZYg",
      authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "futakoto.firebaseapp.com",
      projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? "futakoto",
      storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "futakoto.firebasestorage.app",
      messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "316368993378",
      appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID ?? "1:316368993378:web:3318076ce781f2c568253b",
      // Firebase Analytics の measurementId（G-XXXXXXXXXX）
      // Firebase コンソール → プロジェクト設定 → マイアプリ → ウェブアプリ から取得
      measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID ?? "",
    },
    revenuecat: {
      iosKey: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? "",
    }
  }
});
