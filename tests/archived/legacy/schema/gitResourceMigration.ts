import { Sequelize, Transaction } from 'sequelize';
// Executed inside the existing schema migration transaction. Never imports app models.
export async function migrateGitResources(
  database: Sequelize,
  transaction: Transaction,
) {
  await database.query(
    `CREATE TABLE IF NOT EXISTS "GitCredentials" (
    "id" INTEGER PRIMARY KEY AUTOINCREMENT, "name" VARCHAR(255) NOT NULL UNIQUE,
    "provider" VARCHAR(255) NOT NULL, "auth_type" VARCHAR(255) NOT NULL,
    "username" VARCHAR(255), "secret" TEXT, "public_key" TEXT, "known_hosts" TEXT,
    "capability" VARCHAR(255) NOT NULL DEFAULT 'READ', "status" VARCHAR(255) NOT NULL DEFAULT 'enabled',
    "last_test_at" DATETIME, "last_test_result" VARCHAR(255),
    "createdAt" DATETIME NOT NULL, "updatedAt" DATETIME NOT NULL)`,
    { transaction },
  );
  await database.query(
    `CREATE TABLE IF NOT EXISTS "Repositories" (
    "id" INTEGER PRIMARY KEY AUTOINCREMENT, "name" VARCHAR(255) NOT NULL,
    "provider" VARCHAR(255) NOT NULL, "remote_url" TEXT NOT NULL,
    "normalized_url" VARCHAR(255) NOT NULL UNIQUE, "host" VARCHAR(255), "path" TEXT,
    "owner" VARCHAR(255), "repository_name" VARCHAR(255),
    "default_credential_id" INTEGER REFERENCES "GitCredentials"("id") ON DELETE RESTRICT,
    "status" VARCHAR(255) DEFAULT 'unknown', "createdAt" DATETIME NOT NULL, "updatedAt" DATETIME NOT NULL)`,
    { transaction },
  );
  await database.query(
    `INSERT OR IGNORE INTO "SchemaMigrations" (id, applied_at) VALUES ('phase1-git-resources', :at)`,
    { replacements: { at: new Date().toISOString() }, transaction },
  );
}
