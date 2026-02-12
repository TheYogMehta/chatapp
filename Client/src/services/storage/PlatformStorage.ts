import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { VAULT_DIR } from "./StorageUtils";

export const PlatformStorage = {
  saveToDownloads: async (
    vaultFileName: string,
    originalName: string,
  ): Promise<string> => {
    const platform = Capacitor.getPlatform();

    if (platform === "android") {
      const srcPath = `${VAULT_DIR}/${vaultFileName}`;
      const folderName = "Download/chatapp";

      const perm = await Filesystem.checkPermissions();
      if (perm.publicStorage !== "granted") {
        const req = await Filesystem.requestPermissions();
        if (req.publicStorage !== "granted") {
          throw new Error("STORAGE_PERMISSION_DENIED");
        }
      }

      try {
        await Filesystem.mkdir({
          path: folderName,
          directory: Directory.ExternalStorage,
          recursive: true,
        });
      } catch (e: any) {
        if (e.message && e.message.includes("already exists")) {
        } else {
          try {
            await Filesystem.stat({
              path: folderName,
              directory: Directory.ExternalStorage,
            });
          } catch {
            throw e;
          }
        }
      }

      let finalName = originalName;
      let counter = 1;
      const parts = originalName.split(".");
      const ext = parts.length > 1 ? "." + parts.pop() : "";
      const base = parts.join(".");

      while (true) {
        try {
          await Filesystem.stat({
            path: `${folderName}/${finalName}`,
            directory: Directory.ExternalStorage,
          });
          finalName = `${base} (${counter++})${ext}`;
        } catch {
          break;
        }
      }

      await Filesystem.copy({
        from: srcPath,
        directory: Directory.Data,
        to: `${folderName}/${finalName}`,
        toDirectory: Directory.ExternalStorage,
      });

      return `Downloads/chatapp/${finalName}`;
    }

    if (platform === "electron") {
      const fs = window.require("fs");
      const path = window.require("path");
      const { app } = window.require("electron").remote;

      const downloadsDir = app.getPath("downloads");
      const targetDir = path.join(downloadsDir, "chatapp");

      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      const srcPath = path.join(
        app.getPath("userData"),
        "vault",
        vaultFileName,
      );

      let finalName = originalName;
      let counter = 1;
      const parsed = path.parse(originalName);

      while (fs.existsSync(path.join(targetDir, finalName))) {
        finalName = `${parsed.name} (${counter++})${parsed.ext}`;
      }

      fs.copyFileSync(srcPath, path.join(targetDir, finalName));

      return path.join("Downloads", "chatapp", finalName);
    }

    throw new Error(`UNSUPPORTED_PLATFORM: ${platform}`);
  },
};
