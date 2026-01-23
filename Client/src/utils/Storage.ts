import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { Capacitor } from "@capacitor/core";
import { executeDB } from "../services/sqliteService";

const VAULT_DIR = "chatapp_vault";
const CHUNK_SIZE = 64000;
const writeLocks = new Map<string, boolean>();

export const StorageService = {
  async lock(key: string) {
    while (writeLocks.get(key)) {
      await new Promise((res) => setTimeout(res, 10));
    }
    writeLocks.set(key, true);
  },

  unlock(key: string) {
    writeLocks.delete(key);
  },

  async getUniqueVaultPath(): Promise<{ fileName: string; path: string }> {
    const fileName = `${Date.now().toString(36)}_${Math.random()
      .toString(36)
      .slice(2, 10)}.bin`;
    const path = `${VAULT_DIR}/${fileName}`;
    return { fileName, path };
  },

  isLocalSystemPath(fileName: string): boolean {
    return fileName.startsWith("/") || fileName.includes("://");
  },

  saveRawFile: async (
    data: string,
    existingFileName: string | null = null,
  ): Promise<string> => {
    let fileName: string;
    let path: string;

    if (!existingFileName) {
      const unique = await StorageService.getUniqueVaultPath();
      fileName = unique.fileName;
      path = unique.path;
    } else {
      fileName = existingFileName;
      path = StorageService.isLocalSystemPath(fileName)
        ? fileName
        : `${VAULT_DIR}/${fileName}`;
    }

    await StorageService.lock(fileName);
    try {
      const isLocal = StorageService.isLocalSystemPath(fileName);
      const writeOptions: any = {
        path,
        data,
        recursive: true,
        encoding: Encoding.UTF8,
      };
      if (!isLocal) writeOptions.directory = Directory.Data;

      await Filesystem.writeFile(writeOptions);
      return fileName;
    } finally {
      StorageService.unlock(fileName);
    }
  },

  initMediaEntry: async (
    messageId: string,
    originalName: string,
    totalSize: number,
    mimeType: string,
    thumbnail: string | null = null,
    localPath: string | null = null,
  ): Promise<string> => {
    let finalFileName: string;
    let status: "pending" | "downloaded" = "pending";

    if (localPath) {
      finalFileName = localPath;
      status = "downloaded";
    } else {
      const { fileName, path } = await StorageService.getUniqueVaultPath();
      await Filesystem.writeFile({
        path,
        data: "",
        directory: Directory.Data,
        recursive: true,
        encoding: Encoding.UTF8,
      });
      finalFileName = fileName;
    }

    await executeDB(
      `INSERT INTO media (filename, original_name, file_size, size, mime_type, message_id, status, download_progress, thumbnail) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        finalFileName,
        originalName,
        totalSize,
        localPath ? totalSize : 0,
        mimeType,
        messageId,
        status,
        localPath ? 1.0 : 0.0,
        thumbnail,
      ],
    );

    return finalFileName;
  },

  appendChunk: async (fileName: string, base64Chunk: string): Promise<void> => {
    const path = `${VAULT_DIR}/${fileName}`;
    await StorageService.lock(fileName);

    try {
      await Filesystem.appendFile({
        path,
        data: base64Chunk,
        directory: Directory.Data,
        encoding: Encoding.UTF8,
      });

      const stats = await Filesystem.stat({ path, directory: Directory.Data });

      await executeDB(
        `UPDATE media SET size = ?, status = 'downloading', download_progress = CAST(? AS REAL) / file_size WHERE filename = ?`,
        [stats.size, stats.size, fileName],
      );
    } catch (e: any) {
      if (
        e.message?.toLowerCase().includes("full") ||
        e.message?.toLowerCase().includes("space")
      ) {
        await executeDB(
          "UPDATE media SET status = 'error' WHERE filename = ?",
          [fileName],
        );
        throw new Error("DISK_FULL");
      }
      throw e;
    } finally {
      StorageService.unlock(fileName);
    }
  },

  readChunk: async (fileName: string, chunkIndex: number): Promise<string> => {
    const isLocal = StorageService.isLocalSystemPath(fileName);
    const path = isLocal ? fileName : `${VAULT_DIR}/${fileName}`;
    const directory = isLocal ? undefined : Directory.Data;

    const file = await Filesystem.readFile({
      path,
      directory,
      encoding: Encoding.UTF8,
    });

    const base64 = typeof file.data === "string" ? file.data : "";
    if (!base64) return "";

    const start = chunkIndex * CHUNK_SIZE;
    if (start >= base64.length) return "";

    const end = Math.min(start + CHUNK_SIZE, base64.length);
    return base64.slice(start, end); // ✅ PURE BASE64
  },

  deleteFile: async (fileName: string): Promise<void> => {
    try {
      if (!StorageService.isLocalSystemPath(fileName)) {
        await Filesystem.deleteFile({
          path: `${VAULT_DIR}/${fileName}`,
          directory: Directory.Data,
        });
      }
      await executeDB("DELETE FROM media WHERE filename = ?", [fileName]);
    } catch (e) {
      console.warn("Cleanup skipped or failed for:", fileName);
    }
  },

  getFileSrc: async (fileName: string, mimeType?: string): Promise<string> => {
    try {
      const isLocal = StorageService.isLocalSystemPath(fileName);
      const path = isLocal ? fileName : `${VAULT_DIR}/${fileName}`;
      const directory = isLocal ? undefined : Directory.Data;

      let base64Data = "";

      if (isLocal) {
        const file = await Filesystem.readFile({ path, directory });
        base64Data = typeof file.data === "string" ? file.data : "";
        if (file.data instanceof Blob) {
          base64Data = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              const res = reader.result as string;
              resolve(res.includes(",") ? res.split(",")[1] : res);
            };
            reader.readAsDataURL(file.data as Blob);
          });
        }
      } else {
        const file = await Filesystem.readFile({
          path,
          directory,
          encoding: Encoding.UTF8,
        });
        base64Data = typeof file.data === "string" ? file.data : "";
      }

      const ext = fileName.split(".").pop()?.toLowerCase();
      let mime = mimeType || "application/octet-stream";

      if (!mimeType) {
        if (ext === "jpg" || ext === "jpeg") mime = "image/jpeg";
        else if (ext === "png") mime = "image/png";
        else if (ext === "gif") mime = "image/gif";
        else if (ext === "webp") mime = "image/webp";
        else if (ext === "mp4") mime = "video/mp4";
        else if (ext === "webm") mime = "video/webm";
        else if (ext === "mp3") mime = "audio/mpeg";
        else if (ext === "wav") mime = "audio/wav";
        else if (ext === "ogg") mime = "audio/ogg";
        else if (ext === "m4a") mime = "audio/mp4";
      }

      if (fileName.includes("voice-note") && ext === "webm") {
        mime = "audio/webm";
      }

      if (!base64Data) {
        console.error(`[Storage] Empty data for ${fileName}`);
        return "";
      }

      return `data:${mime};base64,${base64Data}`;
    } catch (e) {
      console.error("Failed to get file src (base64):", e);
      return "";
    }
  },

  saveToDownloads: async (
    vaultFileName: string,
    originalName: string,
  ): Promise<string> => {
    const platform = Capacitor.getPlatform();

    // ---------- ANDROID ----------
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

      await Filesystem.mkdir({
        path: folderName,
        directory: Directory.ExternalStorage,
        recursive: true,
      });

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

    // ---------- ELECTRON ----------
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

    // ---------- UNSUPPORTED ----------
    throw new Error(`UNSUPPORTED_PLATFORM: ${platform}`);
  },
};
