import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { executeDB } from "./sqliteService";
import {
  StorageUtils,
  VAULT_DIR,
  PROFILE_DIR,
  CHUNK_SIZE,
} from "./StorageUtils";
import { PlatformStorage } from "./PlatformStorage";

const writeLocks = new Map<string, boolean>();

export { CHUNK_SIZE };

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

  async saveProfileImage(data: string, identifier: string): Promise<string> {
    const fileName = `${identifier}.jpg`;
    const path = `${PROFILE_DIR}/${fileName}`;

    try {
      await Filesystem.mkdir({
        path: PROFILE_DIR,
        directory: Directory.Data,
        recursive: true,
      });
    } catch (e) {
      // Ignore if exists
    }

    await Filesystem.writeFile({
      path,
      data,
      directory: Directory.Data,
      recursive: true,
      encoding: Encoding.UTF8,
    });

    return fileName;
  },

  async getProfileImage(identifier: string): Promise<string | null> {
    const raw = (identifier || "").split("/").pop() || identifier;
    const candidates = Array.from(
      new Set([
        raw,
        raw.endsWith(".jpg") ? raw : `${raw}.jpg`,
      ]),
    );

    for (const fileName of candidates) {
      try {
        const file = await Filesystem.readFile({
          path: `${PROFILE_DIR}/${fileName}`,
          directory: Directory.Data,
          encoding: Encoding.UTF8,
        });

        const base64 = typeof file.data === "string" ? file.data : "";
        if (base64) return `data:image/jpeg;base64,${base64}`;
      } catch (_e) {
        // Try next candidate.
      }
    }

    return null;
  },

  saveRawFile: async (
    data: string,
    existingFileName: string | null = null,
  ): Promise<string> => {
    let fileName: string;
    let pathObj: { path: string; directory?: Directory };

    if (!existingFileName) {
      const unique = await StorageUtils.getUniqueVaultPath();
      fileName = unique.fileName;
      pathObj = { path: unique.path, directory: Directory.Data };
    } else {
      fileName = existingFileName;
      pathObj = StorageUtils.resolvePath(fileName);
    }

    await StorageService.lock(fileName);
    try {
      await Filesystem.writeFile({
        path: pathObj.path,
        data,
        directory: pathObj.directory,
        recursive: true,
        encoding: Encoding.UTF8,
      });
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
    isCompressed: boolean = false,
  ): Promise<string> => {
    let finalFileName: string;
    let status: "pending" | "downloaded" = "pending";

    if (localPath) {
      finalFileName = localPath;
      status = "downloaded";
    } else {
      const { fileName, path } = await StorageUtils.getUniqueVaultPath();
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
      `INSERT INTO media (filename, original_name, file_size, size, mime_type, message_id, status, download_progress, thumbnail, is_compressed) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        isCompressed ? 1 : 0,
      ],
    );

    return finalFileName;
  },

  appendChunk: async (fileName: string, base64Chunk: string): Promise<void> => {
    const { path, directory } = StorageUtils.resolvePath(fileName);
    await StorageService.lock(fileName);

    try {
      await Filesystem.appendFile({
        path,
        data: base64Chunk,
        directory,
        encoding: Encoding.UTF8,
      });

      const stats = await Filesystem.stat({ path, directory });

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
    const { path, directory } = StorageUtils.resolvePath(fileName);

    try {
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
      return base64.slice(start, end);
    } catch (e) {
      console.warn(`[Storage] readChunk failed for ${fileName}`, e);
      return "";
    }
  },

  readFile: async (fileName: string): Promise<string> => {
    const { path, directory } = StorageUtils.resolvePath(fileName);
    const isLocal = StorageUtils.isLocalSystemPath(fileName);

    try {
      if (!isLocal) {
        const raw = (fileName || "").split("/").pop() || fileName;
        const profileCandidates = Array.from(
          new Set([raw, raw.endsWith(".jpg") ? raw : `${raw}.jpg`]),
        );
        for (const profileFile of profileCandidates) {
          try {
            const file = await Filesystem.readFile({
              path: `${PROFILE_DIR}/${profileFile}`,
              directory: Directory.Data,
              encoding: Encoding.UTF8,
            });
            const data = typeof file.data === "string" ? file.data : "";
            if (data) return data;
          } catch (_e) {
            // Continue to next candidate/fallback.
          }
        }
      }

      const file = await Filesystem.readFile({
        path,
        directory,
        encoding: Encoding.UTF8,
      });

      return typeof file.data === "string" ? file.data : "";
    } catch (e) {
      console.warn(`[Storage] readFile failed for ${fileName}`, e);
      return "";
    }
  },

  deleteProfileImage: async (identifier: string): Promise<void> => {
    try {
      await Filesystem.deleteFile({
        path: `${PROFILE_DIR}/${identifier}.jpg`,
        directory: Directory.Data,
      });
    } catch (_e) {
      // Ignore missing profile image
    }
  },

  deleteFile: async (fileName: string): Promise<void> => {
    try {
      if (!StorageUtils.isLocalSystemPath(fileName)) {
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
      const { path, directory } = StorageUtils.resolvePath(fileName);
      const isLocal = StorageUtils.isLocalSystemPath(fileName);
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
        const raw = (fileName || "").split("/").pop() || fileName;
        const profileCandidates = Array.from(
          new Set([raw, raw.endsWith(".jpg") ? raw : `${raw}.jpg`]),
        );

        // Profile images are stored under PROFILE_DIR, not VAULT_DIR.
        for (const profileName of profileCandidates) {
          try {
            const profileRead = await Filesystem.readFile({
              path: `${PROFILE_DIR}/${profileName}`,
              directory: Directory.Data,
              encoding: Encoding.UTF8,
            });
            base64Data =
              typeof profileRead.data === "string" ? profileRead.data : "";
            if (base64Data) break;
          } catch (_e) {
            // Try next candidate/fallback.
          }
        }

        if (!base64Data) {
          const file = await Filesystem.readFile({
            path,
            directory,
            encoding: Encoding.UTF8,
          });
          base64Data = typeof file.data === "string" ? file.data : "";
        }
      }

      const mime = StorageUtils.getMimeType(fileName, mimeType);

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

  getFileSize: async (fileName: string): Promise<number> => {
    try {
      const { path, directory } = StorageUtils.resolvePath(fileName);
      const stats = await Filesystem.stat({ path, directory });
      return stats.size;
    } catch (e) {
      return 0;
    }
  },

  saveToDownloads: async (
    vaultFileName: string,
    originalName: string,
  ): Promise<string> => {
    return PlatformStorage.saveToDownloads(vaultFileName, originalName);
  },
};
