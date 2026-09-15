import { Sequelize, Transaction, QueryTypes } from 'sequelize';
export async function migrateWorkspace(
  database: Sequelize,
  transaction: Transaction,
) {
  const columns: Record<string, string> = {
    storage_state: "VARCHAR(255) NOT NULL DEFAULT 'UNINITIALIZED'",
    storage_path: 'TEXT',
    last_fetch_at: 'DATETIME',
    last_fetch_status: 'VARCHAR(255)',
    last_error: 'TEXT',
    default_branch: 'VARCHAR(255)',
    last_known_remote_head: 'VARCHAR(255)',
    remote_refs_count: 'INTEGER DEFAULT 0',
    tags_count: 'INTEGER DEFAULT 0',
  };
  const existing = await database.query<{ name: string }>(
    'PRAGMA table_info(Repositories)',
    { type: QueryTypes.SELECT, transaction },
  );
  for (const [name, type] of Object.entries(columns))
    if (!existing.some((c) => c.name === name))
      await database.query(
        `ALTER TABLE Repositories ADD COLUMN "${name}" ${type}`,
        { transaction },
      );
  await database.query(
    `CREATE TABLE IF NOT EXISTS Worktrees (
 id INTEGER PRIMARY KEY AUTOINCREMENT,repository_id INTEGER NOT NULL REFERENCES Repositories(id) ON DELETE RESTRICT,
 name VARCHAR(255) NOT NULL,ref_type VARCHAR(255) NOT NULL,ref_name VARCHAR(255) NOT NULL,branch VARCHAR(255),branch_key VARCHAR(255) UNIQUE,
 "commit" VARCHAR(255),target_commit VARCHAR(255),local_path TEXT,lifecycle_state VARCHAR(255) DEFAULT 'CREATING',dirty_state VARCHAR(255) DEFAULT 'UNKNOWN',
 managed TINYINT(1) DEFAULT 1,status_snapshot JSON,last_update_at DATETIME,last_error TEXT,createdAt DATETIME NOT NULL,updatedAt DATETIME NOT NULL)`,
    { transaction },
  );
  await database.query(
    'CREATE INDEX IF NOT EXISTS worktrees_repository ON Worktrees(repository_id)',
    { transaction },
  );
  await database.query(
    "INSERT OR IGNORE INTO SchemaMigrations(id,applied_at) VALUES('phase2-workspace',:at)",
    { replacements: { at: new Date().toISOString() }, transaction },
  );
}
