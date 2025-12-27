import { CapacitorSQLite } from "@capacitor-community/sqlite";

let dbReady: Promise<void> | null = null;
const DATABASE_NAME = "chatapp";

export const dbInit = () => {
  if (dbReady) return dbReady;

  dbReady = (async () => {
    const isEncrypted = await CapacitorSQLite.isSecretStored();
    if (!isEncrypted.result) {
      await CapacitorSQLite.setEncryptionSecret({
        passphrase: "your-pass-phrase",
      });
    }

    try {
      await CapacitorSQLite.createConnection({
        database: DATABASE_NAME,
        encrypted: true,
        mode: "secret",
        version: 1,
      });
    } catch {}

    await CapacitorSQLite.open({ database: DATABASE_NAME });

    await CapacitorSQLite.execute({
      database: DATABASE_NAME,
      statements: `
        CREATE TABLE IF NOT EXISTS sessions(
          sid TEXT PRIMARY KEY,
          keyJWK TEXT,
          metadata TEXT
        );
        CREATE TABLE IF NOT EXISTS messages(
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          sid TEXT,
          sender TEXT,
          text TEXT,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS pending_messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          sid TEXT,
          payload TEXT,
          msgID TEXT
        );
      `,
    });
  })();

  return dbReady;
};

export const queryDB = async (sql: string, values: any[] = []) => {
  await dbInit();
  const res = await CapacitorSQLite.query({
    database: DATABASE_NAME,
    statement: sql,
    values,
  });
  return res?.values ?? [];
};

export const executeDB = async (sql: string) => {
  await dbInit();
  await CapacitorSQLite.execute({
    database: DATABASE_NAME,
    statements: sql,
  });
};
