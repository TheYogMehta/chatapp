export const generateSalt = () => {
  return window.crypto.getRandomValues(new Uint8Array(16));
};

export const generateIV = () => {
  return window.crypto.getRandomValues(new Uint8Array(12));
};

export const deriveKey = async (
  password: string,
  salt: Uint8Array,
): Promise<CryptoKey> => {
  const enc = new TextEncoder();
  const passwordKey = await window.crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveKey"],
  );

  return window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt as any,
      iterations: 100000,
      hash: "SHA-256",
    },
    passwordKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
};

export const encryptData = async (
  data: string | Uint8Array,
  key: CryptoKey,
): Promise<{ content: Uint8Array; iv: Uint8Array }> => {
  const iv = generateIV();
  const encodedData =
    typeof data === "string" ? new TextEncoder().encode(data) : data;

  const encrypted = await window.crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: iv as any,
    },
    key,
    encodedData as any,
  );

  return {
    content: new Uint8Array(encrypted),
    iv: iv,
  };
};

export const decryptData = async (
  encryptedData: Uint8Array,
  iv: Uint8Array,
  key: CryptoKey,
): Promise<Uint8Array> => {
  const decrypted = await window.crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: iv as any,
    },
    key,
    encryptedData as any,
  );

  return new Uint8Array(decrypted);
};

export const decryptString = async (
  encryptedData: Uint8Array,
  iv: Uint8Array,
  key: CryptoKey,
): Promise<string> => {
  const decrypted = await decryptData(encryptedData, iv, key);
  return new TextDecoder().decode(decrypted);
};

export const generateRandomPassword = (length: number = 16): string => {
  const charset =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+";
  let retVal = "";
  const values = new Uint32Array(length);
  window.crypto.getRandomValues(values);
  for (let i = 0; i < length; i++) {
    retVal += charset[values[i] % charset.length];
  }
  return retVal;
};

export function bufferToBase64(buf: Uint8Array): string {
  const binString = Array.from(buf, (byte) => String.fromCodePoint(byte)).join(
    "",
  );
  return btoa(binString);
}

export function base64ToBuffer(base64: string): Uint8Array {
  const binString = atob(base64);
  return Uint8Array.from(binString, (m) => m.codePointAt(0)!);
}

export function hexToUint8Array(hexString: string): Uint8Array {
  const bytes = hexString.match(/.{1,2}/g);
  if (!bytes) throw new Error("Invalid hex string");
  return new Uint8Array(bytes.map((byte) => parseInt(byte, 16)));
}

export function uint8ArrayToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export const encryptToPackedString = async (
  data: string | Uint8Array,
  key: CryptoKey,
): Promise<string> => {
  const { content, iv } = await encryptData(data, key);
  const combined = new Uint8Array(iv.length + content.length);
  combined.set(iv);
  combined.set(content, iv.length);
  return bufferToBase64(combined);
};

export const decryptFromPackedString = async (
  packedBase64: string,
  key: CryptoKey,
): Promise<Uint8Array | null> => {
  try {
    const raw = base64ToBuffer(packedBase64);
    if (raw.length < 12) return null;

    const iv = raw.slice(0, 12);
    const ciphertext = raw.slice(12);

    return await decryptData(ciphertext, iv, key);
  } catch (e) {
    console.error("Decryption failed:", e);
    return null;
  }
};
