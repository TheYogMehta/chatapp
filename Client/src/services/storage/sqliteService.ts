import { CapacitorSQLite } from "@capacitor-community/sqlite";
import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";

let dbReady: Promise<void> | null = null;
let currentDbName = "chatapp";
let currentKey: string | null = null;
let lastSecretSet: string | null = null;

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
      peer_email TEXT,
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
      is_read INTEGER DEFAULT 0,
      _ver INTEGER DEFAULT 2,
      reply_to TEXT,
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
      is_compressed INTEGER DEFAULT 0,
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
  reactions: {
    columns: `
      id TEXT PRIMARY KEY,
      message_id TEXT,
      sender_email TEXT,
      emoji TEXT,
      timestamp INTEGER,
      FOREIGN KEY(message_id) REFERENCES messages(id) ON DELETE CASCADE
    `,
    indices: [
      "CREATE INDEX IF NOT EXISTS idx_reactions_msg ON reactions(message_id);",
    ],
  },
  queue: {
    columns: `
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT,
      payload TEXT,
      priority INTEGER,
      timestamp INTEGER
    `,
    indices: [
      "CREATE INDEX IF NOT EXISTS idx_queue_priority ON queue(priority, timestamp);",
    ],
  },
};

const tableOrder = [
  "me",
  "sessions",
  "messages",
  "media",
  "live_shares",
  "reactions",
  "queue",
];

export const getCurrentDbName = () => currentDbName;

export const switchDatabase = async (dbName: string, key?: string) => {
  if (currentDbName === dbName && dbReady && currentKey === (key || null))
    return;

  console.log(`[sqlite] Switching database to: ${dbName}`);

  dbReady = null;
  currentDbName = dbName;
  currentKey = key || null;
  await dbInit();
};

export const dbInit = () => {
  if (dbReady) return dbReady;
  dbReady = (async () => {
    const key = currentKey;
    if (key && lastSecretSet !== key) {
      try {
        await CapacitorSQLite.setEncryptionSecret({ passphrase: key });
        lastSecretSet = key;
      } catch (e: any) {
        const msg = e.message || JSON.stringify(e);
        if (
          msg.includes("passphrase already in store") ||
          msg.includes("setEncryptionSecret")
        ) {
          console.log(
            "[sqlite] Passphrase likely already in store, continuing...",
          );
          lastSecretSet = key;
        } else {
          console.warn("Failed to set encryption key/secret:", e);
        }
      }
    }

    try {
      await CapacitorSQLite.createConnection({
        database: currentDbName,
        encrypted: true,
        mode: "secret",
        version: 1,
      });
    } catch (e) {
      // Ignore
    }

    await CapacitorSQLite.open({ database: currentDbName });

    await CapacitorSQLite.execute({
      database: currentDbName,
      statements: "PRAGMA foreign_keys = ON;",
    });

    for (const tableName of tableOrder) {
      const tableDef = SCHEMA[tableName as keyof typeof SCHEMA];
      await syncTableSchema(tableName, tableDef.columns);

      if (tableDef.indices.length > 0) {
        await CapacitorSQLite.execute({
          database: currentDbName,
          statements: tableDef.indices.join(";"),
        });
      }
    }
  })();
  return dbReady;
};

async function syncTableSchema(tableName: string, targetColumnsRaw: string) {
  const info = await CapacitorSQLite.query({
    database: currentDbName,
    statement: `PRAGMA table_info(${tableName});`,
    values: [],
  });

  const currentColumns = info?.values || [];
  const targetColumnsStr = targetColumnsRaw.replace(/\s+/g, " ").trim();

  if (currentColumns.length === 0) {
    await CapacitorSQLite.execute({
      database: currentDbName,
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
        database: currentDbName,
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

      `CREATE TABLE ${tableName}_new(${targetColumnsStr});`,
      ...(sharedColumns.length > 0
        ? [
            `INSERT INTO ${tableName}_new (${sharedColumns}) SELECT ${sharedColumns} FROM ${tableName};`,
          ]
        : []),
      `DROP TABLE ${tableName};`,
      `ALTER TABLE ${tableName}_new RENAME TO ${tableName};`,

      `PRAGMA foreign_keys=ON;`,
    ];

    await CapacitorSQLite.execute({
      database: currentDbName,
      statements: statements.join("\n"),
    });
  }
}

export const getMessages = async (
  sid: string,
  limit: number = 50,
  offset: number = 0,
): Promise<any[]> => {
  const res = await queryDB(
    "SELECT * FROM messages WHERE sid = ? ORDER BY timestamp DESC LIMIT ? OFFSET ?",
    [sid, limit, offset],
  );
  return res ? res.reverse() : [];
};

export const queryDB = async (sql: string, values: any[] = []) => {
  await dbInit();
  const res = await CapacitorSQLite.query({
    database: currentDbName,
    statement: sql,
    values: values,
  });
  return res?.values ?? [];
};

export const executeDB = async (sql: string, values: any[] = []) => {
  await dbInit();
  await CapacitorSQLite.run({
    database: currentDbName,
    statement: sql,
    values: values,
  });
};

export const getMediaFilenames = async (): Promise<string[]> => {
  const rows = await queryDB("SELECT filename FROM media", []);
  return rows
    .map((row: { filename?: string }) => row.filename)
    .filter((name): name is string => !!name);
};

export const deleteDatabase = async (databaseName: string = currentDbName) => {
  try {
    try {
      await CapacitorSQLite.closeConnection({
        database: databaseName,
        readonly: false,
      });
    } catch (closeError) {
      // ignore
    }

    await new Promise((resolve) => setTimeout(resolve, 250));

    if (Capacitor.getPlatform() === "electron") {
      try {
        console.log(
          "[sqlite] Checking for window.electron:",
          !!window.electron,
        );
        if (window.electron && window.electron.forceDeleteDatabase) {
          console.log(
            `[sqlite] Attempting force delete via IPC for ${databaseName}`,
          );
          await window.electron.forceDeleteDatabase(databaseName);
        } else {
          console.warn(
            "[sqlite] window.electron or forceDeleteDatabase not found",
          );
        }
      } catch (e) {
        console.warn("[sqlite] Failed to call forceDeleteDatabase", e);
      }
    }

    const targets = [
      `${databaseName}SQLite.db`,
      `${databaseName}SQLite.db-journal`,
      `${databaseName}SQLite.db-wal`,
      `${databaseName}SQLite.db-shm`,
    ];

    for (const file of targets) {
      try {
        await Filesystem.deleteFile({
          path: file,
          directory: Directory.Data,
        });
        console.log(`[sqlite] Deleted file via FS: ${file}`);
      } catch (err) {
        // ignore
      }
    }

    const stillExists = await CapacitorSQLite.isDatabase({
      database: databaseName,
    });
    if (!stillExists.result) {
      if (databaseName === currentDbName) {
        dbReady = null;
      }
      console.log(`[sqlite] Database deletion confirmed: ${databaseName}`);
    } else {
      console.error(`[sqlite] Failed to delete database ${databaseName}`);
    }

    console.error(`[sqlite] Failed to delete database ${databaseName}`);
  } catch (e) {
    console.error(`[sqlite] Failed to delete database ${databaseName}`, e);
  }
};
