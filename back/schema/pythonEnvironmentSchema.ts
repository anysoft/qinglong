import { Sequelize, Transaction } from 'sequelize';
import platformV3 from './platformV3';
import { pythonEnvironmentOperationTypes } from '../shared/pythonEnvironment';
const statements = [
  `CREATE TABLE PythonEnvironments (
 id INTEGER PRIMARY KEY AUTOINCREMENT, name VARCHAR(255) NOT NULL UNIQUE, description VARCHAR(255) NOT NULL DEFAULT '',
 runtime_id INTEGER NOT NULL REFERENCES RuntimeInstallations(id) ON DELETE RESTRICT,
 state VARCHAR(255) NOT NULL CHECK(state IN ('EMPTY','BUILDING','READY','ERROR','DELETING')),
 current_revision_id INTEGER, current_build_id INTEGER, version INTEGER NOT NULL DEFAULT 1 CHECK(version>0), last_error VARCHAR(255),
 createdAt DATETIME NOT NULL, updatedAt DATETIME NOT NULL,
 FOREIGN KEY(id,current_revision_id) REFERENCES PythonEnvironmentRevisions(environment_id,id) DEFERRABLE INITIALLY DEFERRED,
 FOREIGN KEY(id,current_build_id) REFERENCES PythonEnvironmentBuilds(environment_id,id) DEFERRABLE INITIALLY DEFERRED)`,
  `CREATE TABLE PythonEnvironmentRevisions (
 id INTEGER PRIMARY KEY AUTOINCREMENT, environment_id INTEGER NOT NULL REFERENCES PythonEnvironments(id) ON DELETE CASCADE,
 runtime_id INTEGER NOT NULL REFERENCES RuntimeInstallations(id) ON DELETE RESTRICT,
 dependencies JSON NOT NULL DEFAULT '[]', spec_hash VARCHAR(255) NOT NULL,
 createdAt DATETIME NOT NULL, updatedAt DATETIME NOT NULL, UNIQUE(environment_id,id), UNIQUE(environment_id,id,runtime_id))`,
  `CREATE INDEX python_environment_revisions_runtime ON PythonEnvironmentRevisions(runtime_id)`,
  `CREATE TABLE PythonEnvironmentBuilds (
 id INTEGER PRIMARY KEY AUTOINCREMENT, environment_id INTEGER NOT NULL REFERENCES PythonEnvironments(id) ON DELETE CASCADE,
 revision_id INTEGER NOT NULL, runtime_id INTEGER NOT NULL REFERENCES RuntimeInstallations(id) ON DELETE RESTRICT,
 state VARCHAR(255) NOT NULL CHECK(state IN ('QUEUED','CREATING','INSTALLING','VERIFYING','READY','FAILED','CANCELLED','INTERRUPTED','DELETING')),
 health VARCHAR(255) NOT NULL DEFAULT 'UNVERIFIED' CHECK(health IN ('UNVERIFIED','HEALTHY','INVALID','MISSING')),
 resolved JSON NOT NULL DEFAULT '[]', resolved_hash VARCHAR(255), freeze TEXT NOT NULL DEFAULT '', metadata JSON NOT NULL DEFAULT '{}',
 last_error VARCHAR(255), verified_at DATETIME, createdAt DATETIME NOT NULL, updatedAt DATETIME NOT NULL, UNIQUE(environment_id,id),
 FOREIGN KEY(environment_id,revision_id,runtime_id) REFERENCES PythonEnvironmentRevisions(environment_id,id,runtime_id) ON DELETE RESTRICT)`,
  `CREATE INDEX python_environment_builds_runtime ON PythonEnvironmentBuilds(runtime_id)`,
  `CREATE TRIGGER python_environment_revision_immutable BEFORE UPDATE ON PythonEnvironmentRevisions BEGIN SELECT RAISE(ABORT,'PYTHON_ENV_REVISION_IMMUTABLE'); END`,
  `CREATE TRIGGER python_environment_build_identity_immutable BEFORE UPDATE OF environment_id,revision_id,runtime_id ON PythonEnvironmentBuilds BEGIN SELECT RAISE(ABORT,'PYTHON_ENV_BUILD_IMMUTABLE'); END`,
  `CREATE TRIGGER python_environment_build_ready_immutable BEFORE UPDATE OF resolved,resolved_hash,freeze,metadata ON PythonEnvironmentBuilds WHEN OLD.resolved_hash IS NOT NULL BEGIN SELECT RAISE(ABORT,'PYTHON_ENV_BUILD_IMMUTABLE'); END`,
  `CREATE TRIGGER python_environment_build_ready_state BEFORE UPDATE OF state ON PythonEnvironmentBuilds WHEN OLD.state='READY' AND NEW.state NOT IN ('READY','DELETING') BEGIN SELECT RAISE(ABORT,'PYTHON_ENV_BUILD_IMMUTABLE'); END`,
];
/** Always upgrade the frozen v3 operation table, including on fresh installs. */
export async function createPythonEnvironmentSchema(
  database: Sequelize,
  transaction: Transaction,
) {
  const original = platformV3.objects.find(
    (x) => x.name === 'RuntimeOperations',
  )!.sql;
  const extended = original
    .replace(
      'CREATE TABLE RuntimeOperations',
      'CREATE TABLE RuntimeOperations_v4',
    )
    .replace(
      "'RUNTIME_REPAIR'))",
      "'RUNTIME_REPAIR'," +
        pythonEnvironmentOperationTypes.map((x) => "'" + x + "'").join(',') +
        '))',
    );
  await database.query(extended, { transaction });
  await database.query(
    'INSERT INTO RuntimeOperations_v4 SELECT * FROM RuntimeOperations',
    { transaction },
  );
  await database.query('DROP TABLE RuntimeOperations', { transaction });
  await database.query(
    'ALTER TABLE RuntimeOperations_v4 RENAME TO RuntimeOperations',
    { transaction },
  );
  await database.query(
    'CREATE INDEX runtime_operations_provider_id_status ON RuntimeOperations(provider_id,status)',
    { transaction },
  );
  for (const sql of statements) await database.query(sql, { transaction });
}
