import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "io.ionic.starter",
  appName: "chatapp",
  webDir: "dist",
  plugins: {
    CapacitorSQLite: {
      iosDatabaseLocation: "Library/chatapp",
      iosIsEncryption: true,
      iosKeychainPrefix: "angular-sqlite-app-starter",
      iosBiometric: {
        biometricAuth: false,
        biometricTitle: "Biometric login for chatapp",
      },
      androidIsEncryption: true,
      androidBiometric: {
        biometricAuth: false,
        biometricTitle: "Biometric login for chatapp",
        biometricSubTitle: "Log in using your biometric",
      },
      electronIsEncryption: true,
      electronWindowsLocation: "C:\\ProgramData\\chatapp",
      electronMacLocation: "/Volumes/Development_Lacie/Development/Databases",
      electronLinuxLocation: "Databases",
    },
  },
};

export default config;
