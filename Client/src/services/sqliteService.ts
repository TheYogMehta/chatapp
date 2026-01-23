import { CapacitorSQLite } from "@capacitor-community/sqlite";
import { getKeyFromSecureStorage } from "./SafeStorage";

let dbReady: Promise<void> | null = null;
const DATABASE_NAME = "chatapp";

const SCHEMA = {
  me: {
    columns: `
      id INTEGER PRIMARY KEY CHECK (id = 1),
      public_name TEXT,
      public_avatar TEXT,
      name_version INTEGER DEFAULT 1,
      avatar_version INTEGER DEFAULT 1
    `,
    indices: [],
  },
  sessions: {
    columns: `
      sid TEXT PRIMARY KEY UNIQUE, 
      keyJWK TEXT,
      alias_name TEXT,
      alias_avatar TEXT,
      peer_name TEXT,
      peer_avatar TEXT,
      peer_name_ver INTEGER DEFAULT 0,
      peer_avatar_ver INTEGER DEFAULT 0
    `,
    indices: [],
  },
  messages: {
    columns: `
      id TEXT PRIMARY KEY,
      sid TEXT, 
      sender TEXT, 
      text TEXT,
      type TEXT DEFAULT 'text',
      timestamp INTEGER,
      status INTEGER DEFAULT 1,
      _ver INTEGER DEFAULT 2,
      FOREIGN KEY(sid) REFERENCES sessions(sid) ON DELETE CASCADE
    `,
    indices: ["CREATE INDEX IF NOT EXISTS idx_msg_sid ON messages(sid);"],
  },
  media: {
    columns: `
      filename TEXT PRIMARY KEY,
      original_name TEXT,
      file_size INTEGER,
      mime_type TEXT,
      message_id TEXT,
      download_progress REAL DEFAULT 0,
      size INTEGER DEFAULT 0,
      status TEXT DEFAULT 'pending',
      thumbnail TEXT,
      FOREIGN KEY(message_id) REFERENCES messages(id) ON DELETE CASCADE
    `,
    indices: ["CREATE INDEX IF NOT EXISTS idx_media_msg ON media(message_id);"],
  },
  live_shares: {
    columns: `
      sid TEXT,
      port INTEGER,
      direction TEXT,
      message_id INTEGER,
      PRIMARY KEY (sid, port, direction),
      FOREIGN KEY(message_id) REFERENCES messages(id) ON DELETE CASCADE
    `,
    indices: [
      "CREATE INDEX IF NOT EXISTS idx_shares_msg ON live_shares(message_id);",
    ],
  },
};

const tableOrder = ["me", "sessions", "messages", "media", "live_shares"];

export const dbInit = () => {
  if (dbReady) return dbReady;
  dbReady = (async () => {
    const isEncrypted = await CapacitorSQLite.isSecretStored();
    if (!isEncrypted.result) {
      const key = await getKeyFromSecureStorage("MASTER_KEY");
      if (key) await CapacitorSQLite.setEncryptionSecret({ passphrase: key });
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
      statements: "PRAGMA foreign_keys = ON;",
    });

    for (const tableName of tableOrder) {
      const tableDef = SCHEMA[tableName as keyof typeof SCHEMA];
      await syncTableSchema(tableName, tableDef.columns);

      if (tableDef.indices.length > 0) {
        await CapacitorSQLite.execute({
          database: DATABASE_NAME,
          statements: tableDef.indices.join(";"),
        });
      }
    }
  })();
  return dbReady;
};

async function syncTableSchema(tableName: string, targetColumnsRaw: string) {
  const info = await CapacitorSQLite.query({
    database: DATABASE_NAME,
    statement: `PRAGMA table_info(${tableName});`,
    values: [],
  });

  const currentColumns = info?.values || [];
  const targetColumnsStr = targetColumnsRaw.replace(/\s+/g, " ").trim();

  if (currentColumns.length === 0) {
    await CapacitorSQLite.execute({
      database: DATABASE_NAME,
      statements: `CREATE TABLE ${tableName}(${targetColumnsStr});`,
    });
    return;
  }

  const existingNames = currentColumns.map((c: any) => c.name);
  const targetDefinitions =
    targetColumnsStr.match(/([^,()]+(\([^()]*\))?)+/g)?.map((s) => s.trim()) ||
    [];

  const targetNames = targetDefinitions
    .filter(
      (d) =>
        !d.toUpperCase().startsWith("FOREIGN KEY") &&
        !d.toUpperCase().startsWith("CONSTRAINT") &&
        !d.toUpperCase().startsWith("PRIMARY KEY"),
    )
    .map((d) => d.split(" ")[0]);

  const addedColumns = targetNames.filter(
    (name) => !existingNames.includes(name),
  );
  const removedColumns = existingNames.filter(
    (name) => !targetNames.includes(name),
  );

  if (addedColumns.length > 0 && removedColumns.length === 0) {
    for (const colName of addedColumns) {
      const definition = targetDefinitions.find((d) => d.startsWith(colName));
      await CapacitorSQLite.execute({
        database: DATABASE_NAME,
        statements: `ALTER TABLE ${tableName} ADD COLUMN ${definition};`,
      });
    }
  } else if (
    removedColumns.length > 0 ||
    existingNames.length !== targetNames.length
  ) {
    const sharedColumns = existingNames
      .filter((name) => targetNames.includes(name))
      .join(", ");

    const statements = [
      `PRAGMA foreign_keys=OFF;`,
      `BEGIN TRANSACTION;`,
      `CREATE TABLE ${tableName}_new(${targetColumnsStr});`,
      ...(sharedColumns.length > 0
        ? [
            `INSERT INTO ${tableName}_new (${sharedColumns}) SELECT ${sharedColumns} FROM ${tableName};`,
          ]
        : []),
      `DROP TABLE ${tableName};`,
      `ALTER TABLE ${tableName}_new RENAME TO ${tableName};`,
      `COMMIT;`,
      `PRAGMA foreign_keys=ON;`,
    ];

    await CapacitorSQLite.execute({
      database: DATABASE_NAME,
      statements: statements.join("\n"),
    });
  }
}

export const queryDB = async (sql: string, values: any[] = []) => {
  await dbInit();
  const res = await CapacitorSQLite.query({
    database: DATABASE_NAME,
    statement: sql,
    values: values,
  });
  return res?.values ?? [];
};

export const executeDB = async (sql: string, values: any[] = []) => {
  await dbInit();
  await CapacitorSQLite.run({
    database: DATABASE_NAME,
    statement: sql,
    values: values,
  });
};
