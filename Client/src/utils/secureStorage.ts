import { StorageService } from "../services/storage/StorageService";

const DB_NAME = "SecureChatVault";
const STORE_NAME = "vault_items";
const DB_VERSION = 2;

export interface VaultItem {
  id: string;
  type: "text" | "file" | "password";
  encryptedFilePath: string;
  iv: Uint8Array;
  metadata: any;
  timestamp: number;
}

export const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (db.objectStoreNames.contains(STORE_NAME)) {
        db.deleteObjectStore(STORE_NAME);
      }

      db.createObjectStore(STORE_NAME, { keyPath: "id" });
    };

    request.onsuccess = (event) => {
      resolve((event.target as IDBOpenDBRequest).result);
    };

    request.onerror = (event) => {
      reject((event.target as IDBOpenDBRequest).error);
    };
  });
};

export const storeItem = async (item: VaultItem): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(item);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export const getItem = async (id: string): Promise<VaultItem | undefined> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export const getAllItems = async (): Promise<VaultItem[]> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export const deleteItem = async (id: string): Promise<void> => {
  const db = await openDB();
  const item = await getItem(id);

  if (item?.encryptedFilePath) {
    try {
      await StorageService.deleteFile(item.encryptedFilePath);
    } catch (e) {
      console.warn(
        `[SecureStorage] Failed to delete file ${item.encryptedFilePath}`,
        e,
      );
    }
  }

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export const deleteItemsByOwner = async (ownerEmail: string): Promise<number> => {
  const allItems = await getAllItems();
  const ownedItems = allItems.filter((item) => item.metadata?.owner === ownerEmail);

  for (const item of ownedItems) {
    await deleteItem(item.id);
  }

  return ownedItems.length;
};
