import { Sequelize, Transaction, QueryTypes } from 'sequelize';

export async function migrateManagedSubscriptions(
  database: Sequelize,
  transaction: Transaction,
) {
  const worktreeColumns = await database.query<{ name: string }>(
    'PRAGMA table_info(Worktrees)',
    { type: QueryTypes.SELECT, transaction },
  );
  if (!worktreeColumns.some((c) => c.name === 'purpose'))
    await database.query(
      "ALTER TABLE Worktrees ADD COLUMN purpose VARCHAR(32) NOT NULL DEFAULT 'USER'",
      { transaction },
    );
  const columns: Record<string, string> = {
    git_mode: "VARCHAR(32) NOT NULL DEFAULT 'LEGACY'",
    worktree_id: 'INTEGER REFERENCES Worktrees(id) ON DELETE RESTRICT',
    last_synced_commit: 'VARCHAR(255)',
    last_sync_at: 'DATETIME',
    last_sync_state: 'VARCHAR(32)',
    last_sync_phase: 'VARCHAR(64)',
    last_sync_error: 'TEXT',
  };
  const existing = await database.query<{ name: string }>(
    'PRAGMA table_info(Subscriptions)',
    { type: QueryTypes.SELECT, transaction },
  );
  if (!existing.length)
    throw new Error('Migration table is missing: Subscriptions');
  for (const [name, type] of Object.entries(columns)) {
    if (!existing.some((c) => c.name === name))
      await database.query(
        `ALTER TABLE Subscriptions ADD COLUMN "${name}" ${type}`,
        { transaction },
      );
  }
  await database.query(
    'CREATE INDEX IF NOT EXISTS subscriptions_worktree ON Subscriptions(worktree_id)',
    { transaction },
  );
  await database.query(
    "INSERT OR IGNORE INTO SchemaMigrations(id,applied_at) VALUES('phase3-managed-subscriptions',:at)",
    { replacements: { at: new Date().toISOString() }, transaction },
  );
}
