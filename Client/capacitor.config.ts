import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.chatapp",
  appName: "chatapp",
  webDir: "dist",
  plugins: {
    CapacitorSQLite: {
      androidIsEncryption: true,
      androidBiometric: {
        biometricAuth: false,
        biometricTitle: "Biometric login for chatapp",
        biometricSubTitle: "Log in using your biometric",
      },
      electronIsEncryption: true,
      electronWindowsLocation: "C:\\ProgramData\\chatapp",
      electronLinuxLocation: "Databases",
    },
    PrivacyScreen: {
      enable: true,
      imageName: "Splashscreen",
      contentMode: "scaleAspectFit",
      preventScreenshots: true,
    },
    SocialLogin: {
      google: true,
      facebook: false,
      apple: false,
      twitter: false
    },

  },
  server: {
    androidScheme: "http",
  },
};

export default config;
