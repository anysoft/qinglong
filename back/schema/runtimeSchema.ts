import { Sequelize, Transaction } from 'sequelize';
// Explicit SQLite CHECKs supplement ORM validation. Fresh and v2 migration use
// precisely these statements; ordinary model.sync must not redefine this schema.
const statements = [
  `CREATE TABLE RuntimeProviders (
 id INTEGER PRIMARY KEY AUTOINCREMENT, language VARCHAR(255) NOT NULL CHECK(language='PYTHON'),
 provider_type VARCHAR(255) NOT NULL CHECK(provider_type='PYENV'),
 state VARCHAR(255) NOT NULL CHECK(state IN ('UNINITIALIZED','INSTALLING','READY','UPDATING','ERROR','MISSING')),
 provider_version VARCHAR(255), provider_revision VARCHAR(255), install_root VARCHAR(255) NOT NULL,
 catalog JSON NOT NULL DEFAULT '[]', last_refresh_at DATETIME, last_verified_at DATETIME, last_error VARCHAR(255),
 version INTEGER NOT NULL DEFAULT 1, createdAt DATETIME NOT NULL, updatedAt DATETIME NOT NULL)`,
  `CREATE UNIQUE INDEX runtime_providers_language_provider_type ON RuntimeProviders (language,provider_type)`,
  `CREATE TABLE RuntimeInstallations (
 id INTEGER PRIMARY KEY AUTOINCREMENT, provider_id INTEGER NOT NULL REFERENCES RuntimeProviders(id) ON DELETE RESTRICT,
 language VARCHAR(255) NOT NULL CHECK(language='PYTHON'), implementation VARCHAR(255) NOT NULL CHECK(implementation='CPYTHON'),
 version VARCHAR(255) NOT NULL, state VARCHAR(255) NOT NULL CHECK(state IN ('INSTALLING','READY','VERIFYING','ERROR','REMOVING','MISSING','REMOVED')),
 executable_relative_path VARCHAR(255) NOT NULL, installed_at DATETIME, verified_at DATETIME, metadata JSON NOT NULL DEFAULT '{}',
 last_error VARCHAR(255), createdAt DATETIME NOT NULL, updatedAt DATETIME NOT NULL)`,
  `CREATE UNIQUE INDEX runtime_installations_provider_id_implementation_version ON RuntimeInstallations(provider_id,implementation,version)`,
  `CREATE TABLE RuntimeOperations (
 id INTEGER PRIMARY KEY AUTOINCREMENT, provider_id INTEGER NOT NULL REFERENCES RuntimeProviders(id) ON DELETE RESTRICT,
 runtime_id INTEGER REFERENCES RuntimeInstallations(id) ON DELETE RESTRICT,
 operation_type VARCHAR(255) NOT NULL CHECK(operation_type IN ('PROVIDER_INSTALL','PROVIDER_UPDATE','PROVIDER_VERIFY','PROVIDER_REPAIR','CATALOG_REFRESH','RUNTIME_INSTALL','RUNTIME_VERIFY','RUNTIME_REMOVE','RUNTIME_REPAIR')),
 status VARCHAR(255) NOT NULL CHECK(status IN ('QUEUED','RUNNING','SUCCESS','FAILED','CANCELLED','INTERRUPTED')),
 stage VARCHAR(255) NOT NULL, owner_token VARCHAR(255) NOT NULL, owner_pid INTEGER NOT NULL,
 cancel_requested TINYINT(1) NOT NULL DEFAULT 0 CHECK(cancel_requested IN (0,1)), started_at DATETIME, finished_at DATETIME, exit_code INTEGER,
 log_identity VARCHAR(255) NOT NULL UNIQUE, error_code VARCHAR(255), error_summary VARCHAR(255), metadata JSON NOT NULL DEFAULT '{}',
 createdAt DATETIME NOT NULL, updatedAt DATETIME NOT NULL)`,
  `CREATE INDEX runtime_operations_provider_id_status ON RuntimeOperations(provider_id,status)`,
];
export async function createRuntimeSchema(
  database: Sequelize,
  transaction: Transaction,
) {
  for (const sql of statements) await database.query(sql, { transaction });
}
