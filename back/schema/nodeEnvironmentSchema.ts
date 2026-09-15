import { Sequelize, Transaction } from 'sequelize';
import platformV4 from './platformV4';
import { nodeOperationTypes } from '../shared/nodeEnvironment';
const statements = [
  `CREATE TABLE NodePackageManagerToolchains (
 id INTEGER PRIMARY KEY AUTOINCREMENT, runtime_id INTEGER NOT NULL REFERENCES RuntimeInstallations(id) ON DELETE RESTRICT,
 manager_type VARCHAR(255) NOT NULL CHECK(manager_type IN ('PNPM','NPM')), version VARCHAR(255) NOT NULL,
 state VARCHAR(255) NOT NULL CHECK(state IN ('INSTALLING','READY','ERROR','REMOVED')), metadata JSON NOT NULL DEFAULT '{}', verified_at DATETIME,last_error VARCHAR(255),
 createdAt DATETIME NOT NULL,updatedAt DATETIME NOT NULL,UNIQUE(runtime_id,manager_type,version),UNIQUE(id,runtime_id))`,
  `CREATE TABLE NodeEnvironments (
 id INTEGER PRIMARY KEY AUTOINCREMENT,name VARCHAR(255) NOT NULL UNIQUE,description VARCHAR(255) NOT NULL DEFAULT '',
 runtime_id INTEGER NOT NULL REFERENCES RuntimeInstallations(id) ON DELETE RESTRICT,toolchain_id INTEGER NOT NULL REFERENCES NodePackageManagerToolchains(id) ON DELETE RESTRICT,
 state VARCHAR(255) NOT NULL CHECK(state IN ('EMPTY','BUILDING','READY','ERROR','DELETING')),current_revision_id INTEGER,current_build_id INTEGER,version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),last_error VARCHAR(255),
 production_only TINYINT(1) NOT NULL DEFAULT 0 CHECK(production_only IN (0,1)),install_scripts_policy VARCHAR(255) NOT NULL DEFAULT 'ALLOW' CHECK(install_scripts_policy IN ('ALLOW','IGNORE')),
 createdAt DATETIME NOT NULL,updatedAt DATETIME NOT NULL,
 FOREIGN KEY(toolchain_id,runtime_id) REFERENCES NodePackageManagerToolchains(id,runtime_id) ON DELETE RESTRICT,
 FOREIGN KEY(id,current_revision_id) REFERENCES NodeEnvironmentRevisions(environment_id,id) DEFERRABLE INITIALLY DEFERRED,
 FOREIGN KEY(id,current_build_id) REFERENCES NodeEnvironmentBuilds(environment_id,id) DEFERRABLE INITIALLY DEFERRED)`,
  `CREATE TABLE NodeEnvironmentRevisions (
 id INTEGER PRIMARY KEY AUTOINCREMENT,environment_id INTEGER NOT NULL REFERENCES NodeEnvironments(id) ON DELETE RESTRICT,
 runtime_id INTEGER NOT NULL REFERENCES RuntimeInstallations(id) ON DELETE RESTRICT,toolchain_id INTEGER NOT NULL REFERENCES NodePackageManagerToolchains(id) ON DELETE RESTRICT,
 dependencies JSON NOT NULL DEFAULT '[]' CHECK(json_valid(dependencies)),spec_hash VARCHAR(255) NOT NULL,
 production_only TINYINT(1) NOT NULL DEFAULT 0 CHECK(production_only IN (0,1)),install_scripts_policy VARCHAR(255) NOT NULL DEFAULT 'ALLOW' CHECK(install_scripts_policy IN ('ALLOW','IGNORE')),
 createdAt DATETIME NOT NULL,updatedAt DATETIME NOT NULL,UNIQUE(environment_id,id),UNIQUE(environment_id,id,runtime_id,toolchain_id),
 FOREIGN KEY(toolchain_id,runtime_id) REFERENCES NodePackageManagerToolchains(id,runtime_id) ON DELETE RESTRICT)`,
  `CREATE TABLE NodeEnvironmentBuilds (
 id INTEGER PRIMARY KEY AUTOINCREMENT,environment_id INTEGER NOT NULL REFERENCES NodeEnvironments(id) ON DELETE RESTRICT,revision_id INTEGER NOT NULL,
 runtime_id INTEGER NOT NULL REFERENCES RuntimeInstallations(id) ON DELETE RESTRICT,toolchain_id INTEGER NOT NULL REFERENCES NodePackageManagerToolchains(id) ON DELETE RESTRICT,
 state VARCHAR(255) NOT NULL CHECK(state IN ('QUEUED','INSTALLING','VERIFYING','READY','FAILED','CANCELLED','INTERRUPTED','DELETING')),
 health VARCHAR(255) NOT NULL DEFAULT 'UNVERIFIED' CHECK(health IN ('UNVERIFIED','HEALTHY','INVALID','MISSING')),
 package_json TEXT NOT NULL DEFAULT '',lockfile TEXT NOT NULL DEFAULT '',lock_hash VARCHAR(255),resolved JSON NOT NULL DEFAULT '[]',resolved_hash VARCHAR(255),metadata JSON NOT NULL DEFAULT '{}',verified_at DATETIME,last_error VARCHAR(255),
 createdAt DATETIME NOT NULL,updatedAt DATETIME NOT NULL,UNIQUE(environment_id,id),
 FOREIGN KEY(environment_id,revision_id,runtime_id,toolchain_id) REFERENCES NodeEnvironmentRevisions(environment_id,id,runtime_id,toolchain_id) ON DELETE RESTRICT)`,
  `CREATE TRIGGER node_toolchain_runtime_insert BEFORE INSERT ON NodePackageManagerToolchains WHEN NOT EXISTS(SELECT 1 FROM RuntimeInstallations WHERE id=NEW.runtime_id AND language='NODE' AND implementation='NODEJS') BEGIN SELECT RAISE(ABORT,'NODE_RUNTIME_REQUIRED'); END`,
  `CREATE TRIGGER node_toolchain_identity_immutable BEFORE UPDATE OF runtime_id,manager_type,version ON NodePackageManagerToolchains BEGIN SELECT RAISE(ABORT,'NODE_TOOLCHAIN_IMMUTABLE'); END`,
  `CREATE TRIGGER node_revision_immutable BEFORE UPDATE ON NodeEnvironmentRevisions BEGIN SELECT RAISE(ABORT,'NODE_REVISION_IMMUTABLE'); END`,
  `CREATE TRIGGER node_revision_dependencies_unique BEFORE INSERT ON NodeEnvironmentRevisions WHEN EXISTS(SELECT 1 FROM json_each(NEW.dependencies) GROUP BY json_extract(value,'$.name') HAVING count(*)>1) BEGIN SELECT RAISE(ABORT,'NODE_DEPENDENCY_DUPLICATE'); END`,
  `CREATE TRIGGER node_build_identity_immutable BEFORE UPDATE OF environment_id,revision_id,runtime_id,toolchain_id ON NodeEnvironmentBuilds BEGIN SELECT RAISE(ABORT,'NODE_BUILD_IMMUTABLE'); END`,
  `CREATE TRIGGER node_build_snapshot_immutable BEFORE UPDATE OF package_json,lockfile,lock_hash,resolved,resolved_hash,metadata ON NodeEnvironmentBuilds WHEN OLD.lock_hash IS NOT NULL BEGIN SELECT RAISE(ABORT,'NODE_BUILD_IMMUTABLE'); END`,
  `CREATE TRIGGER node_build_ready_state BEFORE UPDATE OF state ON NodeEnvironmentBuilds WHEN OLD.state='READY' AND NEW.state NOT IN ('READY','DELETING') BEGIN SELECT RAISE(ABORT,'NODE_BUILD_IMMUTABLE'); END`,
  `CREATE TRIGGER runtime_provider_language_pair_insert BEFORE INSERT ON RuntimeProviders WHEN NOT ((NEW.language='PYTHON' AND NEW.provider_type='PYENV') OR (NEW.language='NODE' AND NEW.provider_type='NODE_DISTRIBUTION')) BEGIN SELECT RAISE(ABORT,'RUNTIME_PROVIDER_INVALID'); END`,
  `CREATE TRIGGER runtime_provider_identity_immutable BEFORE UPDATE OF language,provider_type ON RuntimeProviders BEGIN SELECT RAISE(ABORT,'RUNTIME_IDENTITY_IMMUTABLE'); END`,
  `CREATE TRIGGER runtime_installation_language_insert BEFORE INSERT ON RuntimeInstallations WHEN NOT EXISTS(SELECT 1 FROM RuntimeProviders WHERE id=NEW.provider_id AND language=NEW.language) OR NOT ((NEW.language='PYTHON' AND NEW.implementation='CPYTHON') OR (NEW.language='NODE' AND NEW.implementation='NODEJS')) BEGIN SELECT RAISE(ABORT,'RUNTIME_PROVIDER_INVALID'); END`,
  `CREATE TRIGGER runtime_installation_identity_immutable BEFORE UPDATE OF provider_id,language,implementation,version ON RuntimeInstallations BEGIN SELECT RAISE(ABORT,'RUNTIME_IDENTITY_IMMUTABLE'); END`,
];
/** Deferred FK enforcement permits replacing referenced parents inside one transaction.
 * Never rename the old parent (SQLite would rewrite every child FK to that name). */
export async function createNodeEnvironmentSchema(
  database: Sequelize,
  transaction: Transaction,
) {
  await database.query('PRAGMA defer_foreign_keys=ON', { transaction });
  for (const name of [
    'RuntimeProviders',
    'RuntimeInstallations',
    'RuntimeOperations',
  ]) {
    const original = platformV4.objects.find((x) => x.name === name)!.sql;
    let sql = original.replace(
      /CREATE TABLE (?:"?)(Runtime\w+)(?:"?)/,
      'CREATE TABLE ' + name + '_v5',
    );
    sql = sql
      .replace(
        "CHECK(language='PYTHON')",
        "CHECK(language IN ('PYTHON','NODE'))",
      )
      .replace(
        "CHECK(provider_type='PYENV')",
        "CHECK(provider_type IN ('PYENV','NODE_DISTRIBUTION'))",
      )
      .replace(
        "CHECK(implementation='CPYTHON')",
        "CHECK(implementation IN ('CPYTHON','NODEJS'))",
      );
    if (name === 'RuntimeOperations')
      sql = sql.replace(
        "'PYTHON_ENV_DELETE_BUILD'))",
        "'PYTHON_ENV_DELETE_BUILD'," +
          nodeOperationTypes.map((x) => "'" + x + "'").join(',') +
          '))',
      );
    await database.query(sql, { transaction });
    await database.query(`INSERT INTO ${name}_v5 SELECT * FROM ${name}`, {
      transaction,
    });
    await database.query(`DROP TABLE ${name}`, { transaction });
    await database.query(`ALTER TABLE ${name}_v5 RENAME TO ${name}`, {
      transaction,
    });
  }
  for (const object of platformV4.objects.filter(
    (x) => x.sql.startsWith('CREATE') && x.name.startsWith('runtime_'),
  ))
    await database.query(object.sql, { transaction });
  for (const sql of statements) await database.query(sql, { transaction });
}
