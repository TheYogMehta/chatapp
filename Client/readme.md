## **1. Build Ionic Web App**

```bash
ionic build
```

- Generates the `dist/` folder (Vite output).

---

## **2. Capacitor Platform Setup**

### Add Android

```bash
npx cap add android
```

### Add Electron

```bash
npx cap add @capacitor-community/electron
```

---

## **3. Copy Web Assets to Platforms**

```bash
npx cap copy android
npx cap copy electron
```

- Copies the `dist/` folder to Android and Electron.

---

## **4. Sync Plugins**

```bash
npm run sync
```

- Ensures Capacitor plugins are updated in native projects.

---

## **5. Open Platforms**

### Android Studio

```bash
npx cap open android
```

- Opens your Android project for building/running on device or emulator.

### Electron

```bash
npm run electron:start
```

- Runs the Electron desktop app manually (bypasses `live-runner.js`).

---

## **6. Full Clean / Rebuild Workflow (Windows-safe)**

```bash
# Build Ionic
npx ionic build

# Copy & sync platforms
npx cap copy
npx cap sync

# Android
npx cap open android

# Electron
cd electron
npx electron .
```

---

## **7. Optional: Rebuild Electron Native Modules**

```bash
cd electron
npm install
npx electron-rebuild
```

- Needed if you use native Electron modules.

---

## **8. Clearing Android Gradle Cache (if needed)**

```bash
# Close Android Studio first
del /s /q %USERPROFILE%\.gradle\caches
```

- Or from Android Studio: **File → Invalidate Caches / Restart**

---

## **9. Notes**

- **Always build Ionic first** (`ionic build`).
- **Always copy assets** (`npx cap copy`) after a build.
- **Avoid `npx cap open electron` on Windows**, it uses broken live-reload scripts.

- Makes builds ignore errors from dependencies like `chokidar` or `builder-util-runtime`.

---

# Creating Icon

Perfect — that’s the correct **structure and notes for using `@capacitor/assets`**. A few clarifications for your workflow:

---

### **1. Folder structure**

```
assets/
├── icon-only.png         # main icon, >=1024x1024
├── icon-foreground.png   # optional, >=1024x1024
├── icon-background.png   # optional, >=1024x1024
├── splash.png            # main splash screen, >=2732x2732
└── splash-dark.png       # optional dark splash, >=2732x2732
```

- All files are **PNG or JPG**.
- `icon-only.png` is mandatory; others are optional but recommended for proper theming.

---

### **2. Generate all icons and splash screens**

```bash
npx @capacitor/assets generate
```

- Will automatically generate all **Android `mipmap-*` icons** and **iOS icons**.
- Splash screens will also be generated if present.
- Plugin reads the `assets/` folder by default — no `--asset-path` needed.

---

### **3. Copy and sync to platforms**

```bash
npx cap copy
npx cap sync
```

---

### Note

- This will only generate for android for electron we need to replace in /electron/assets/
