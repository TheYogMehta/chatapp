import { CapacitorSQLite } from "@capacitor-community/sqlite";

export const dbInit = async () => {
  await CapacitorSQLite.setEncryptionSecret({
    passphrase: "your-pass-phrase",
  });

  await CapacitorSQLite.createConnection({
    database: "chatapp",
    encrypted: true,
    mode: "secret",
    version: 1,
  });
  // Todo: promt user to set a pass on db

  await CapacitorSQLite.open({
    database: "chatapp",
  });

  await CapacitorSQLite.execute({
    database: "chatapp",
    statements: `
      CREATE TABLE IF NOT EXISTS messages(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        text TEXT
      );
    `,
  });
};
