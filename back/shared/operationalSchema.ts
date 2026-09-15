import { createHash } from 'crypto';
import { ModelStatic, Model, QueryTypes, Sequelize, Transaction } from 'sequelize';

export const PLATFORM_SCHEMA_VERSION = 1;

export class UnsupportedDatabaseSchemaError extends Error {
  readonly code = 'UNSUPPORTED_DATABASE_SCHEMA';
  constructor() {
    super('UNSUPPORTED_DATABASE_SCHEMA: This platform requires a fresh database.');
  }
}

/** Fresh-only operational bootstrap. Never upgrades, resets, or drops an existing database. */
export async function initializeOperationalSchema(
  database: Sequelize,
  models: ModelStatic<Model>[],
): Promise<void> {
  const signature = createHash('sha256').update(JSON.stringify(models.map(model => ({
    table: model.tableName,
    attributes: Object.entries(model.rawAttributes).map(([name, field]) => ({
      name, type: String(field.type), allowNull: field.allowNull,
      primaryKey: field.primaryKey, autoIncrement: field.autoIncrement,
      defaultValue: field.defaultValue, references: field.references,
      onDelete: field.onDelete, unique: field.unique,
    })),
    indexes: model.options.indexes,
  })))).digest('hex');

  await database.transaction({ type: Transaction.TYPES.IMMEDIATE }, async transaction => {
    const objects = await database.query<{ name: string; sql: string }>(
      "SELECT name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name",
      { type: QueryTypes.SELECT, transaction },
    );
    if (objects.length) {
      if (!objects.some(item => item.name === 'PlatformMetadata')) throw new UnsupportedDatabaseSchemaError();
      let metadata: { platform_schema_version: number; model_signature: string; schema_signature: string }[];
      try {
        metadata = await database.query('SELECT * FROM PlatformMetadata', { type: QueryTypes.SELECT, transaction });
      } catch {
        throw new UnsupportedDatabaseSchemaError();
      }
      const actual = createHash('sha256').update(JSON.stringify(objects)).digest('hex');
      if (metadata.length !== 1 || metadata[0].platform_schema_version !== PLATFORM_SCHEMA_VERSION ||
          metadata[0].model_signature !== signature || metadata[0].schema_signature !== actual) {
        throw new UnsupportedDatabaseSchemaError();
      }
    } else {
      // A single transaction creates the current model definitions; no historical migration chain.
      const syncOptions = { transaction, force: false };
      for (const model of models) await model.sync(syncOptions);
      await database.query(
        'CREATE TABLE PlatformMetadata (platform_schema_version INTEGER NOT NULL PRIMARY KEY CHECK(platform_schema_version = 1), model_signature TEXT NOT NULL, schema_signature TEXT NOT NULL)',
        { transaction },
      );
      const created = await database.query(
        "SELECT name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name",
        { type: QueryTypes.SELECT, transaction },
      );
      const schemaSignature = createHash('sha256').update(JSON.stringify(created)).digest('hex');
      await database.query(
        'INSERT INTO PlatformMetadata VALUES (:version, :signature, :schemaSignature)',
        { replacements: { version: PLATFORM_SCHEMA_VERSION, signature, schemaSignature }, transaction },
      );
    }
    const violations = await database.query('PRAGMA foreign_key_check', { type: QueryTypes.SELECT, transaction });
    if (violations.length) throw new UnsupportedDatabaseSchemaError();
  });
}
