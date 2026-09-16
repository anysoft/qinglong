import { createHash } from 'crypto';
import {
  ModelStatic,
  Model,
  QueryTypes,
  Sequelize,
  Transaction,
} from 'sequelize';
import platformV1 from '../schema/platformV1';
import platformV2 from '../schema/platformV2';
import platformV3 from '../schema/platformV3';
import platformV4 from '../schema/platformV4';
import platformV5 from '../schema/platformV5';
import platformV6 from '../schema/platformV6';
import platformV7 from '../schema/platformV7';
import platformV8 from '../schema/platformV8';
import { createObservabilitySchema } from '../schema/observabilitySchema';
import { createTriggerSchema } from '../schema/triggerSchema';
import { createExecutionSchema } from '../schema/executionSchema';
import {
  createFreshTaskPlatform,
  migrateTaskPlatform,
} from '../schema/taskSchema';
import { createNodeEnvironmentSchema } from '../schema/nodeEnvironmentSchema';
import { createPythonEnvironmentSchema } from '../schema/pythonEnvironmentSchema';
import { createRuntimeSchema } from '../schema/runtimeSchema';

export const PLATFORM_SCHEMA_VERSION = 9;
export class UnsupportedDatabaseSchemaError extends Error {
  readonly code = 'UNSUPPORTED_DATABASE_SCHEMA';
  constructor() {
    super(
      'UNSUPPORTED_DATABASE_SCHEMA: Expected a valid platform database or an empty database.',
    );
  }
}
const hash = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
// Tokenize SQL whitespace without changing quoted identifiers/string literals.
export const schemaSignature = (objects: { name: string; sql: string }[]) =>
  hash(
    objects.map((x) => ({
      name: x.name,
      sql: (
        x.sql.match(
          /'(?:''|[^'])*'|"(?:""|[^"])*"|`(?:``|[^`])*`|\[[^\]]*\]|[^\s'"`\[]+/g,
        ) || []
      ).join(''),
    })),
  );
export const modelSignature = (models: ModelStatic<Model>[]) =>
  hash(
    [...models]
      .sort((a, b) => String(a.tableName).localeCompare(String(b.tableName)))
      .map((model) => ({
        table: model.tableName,
        attributes: Object.entries(model.rawAttributes).map(
          ([name, field]) => ({
            name,
            type: String(field.type),
            allowNull: field.allowNull,
            primaryKey: field.primaryKey,
            autoIncrement: field.autoIncrement,
            defaultValue: field.defaultValue,
            references: field.references,
            onDelete: field.onDelete,
            unique: field.unique,
          }),
        ),
        indexes: model.options.indexes,
      })),
  );

/** Only frozen platform versions may upgrade. Unknown databases remain untouched. */
export async function initializeOperationalSchema(
  database: Sequelize,
  models: ModelStatic<Model>[],
): Promise<void> {
  const signature = modelSignature(models);
  await database.transaction(
    { type: Transaction.TYPES.IMMEDIATE },
    async (transaction) => {
      const objects = () =>
        database.query<{ name: string; sql: string }>(
          "SELECT name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name",
          { type: QueryTypes.SELECT, transaction },
        );
      const current = await objects();
      let createMetadata = current.length === 0;
      if (current.length) {
        if (!current.some((x) => x.name === 'PlatformMetadata'))
          throw new UnsupportedDatabaseSchemaError();
        const metadata = await database.query<{
          platform_schema_version: number;
          model_signature: string;
          schema_signature: string;
        }>('SELECT * FROM PlatformMetadata', {
          type: QueryTypes.SELECT,
          transaction,
        });
        if (metadata.length !== 1) throw new UnsupportedDatabaseSchemaError();
        let record = metadata[0];
        const violations = await database.query('PRAGMA foreign_key_check', {
          type: QueryTypes.SELECT,
          transaction,
        });
        if (violations.length) throw new UnsupportedDatabaseSchemaError();
        if (record.platform_schema_version === 1) {
          if (
            record.model_signature !== platformV1.metadata.model_signature ||
            record.schema_signature !== platformV1.metadata.schema_signature ||
            hash(current) !== platformV1.metadata.schema_signature
          )
            throw new UnsupportedDatabaseSchemaError();
          // New tables first. Preserve old commands verbatim; old failures were non-fatal,
          // and task_after ran after either normal success or failure, hence FINALLY.
          for (const object of [...platformV2.objects].sort(
            (a, b) =>
              Number(!a.sql.startsWith('CREATE TABLE')) -
              Number(!b.sql.startsWith('CREATE TABLE')),
          )) {
            if (!current.some((x) => x.name === object.name))
              await database.query(object.sql, { transaction });
          }
          const hooks = await database.query<{
            id: number;
            task_before: string | null;
            task_after: string | null;
          }>('SELECT id, task_before, task_after FROM Crontabs', {
            type: QueryTypes.SELECT,
            transaction,
          });
          for (const row of hooks)
            for (const [field, phase] of [
              ['task_before', 'BEFORE'],
              ['task_after', 'FINALLY'],
            ] as const) {
              const command = row[field];
              if (command?.trim())
                await database.query(
                  "INSERT INTO TaskHooks (task_id,name,phase,command,cwd_base,position,timeout_seconds,failure_policy,enabled,version,createdAt,updatedAt) VALUES (:task,:name,:phase,:command,'TASK_CWD',10,60,'CONTINUE',1,1,:now,:now)",
                  {
                    replacements: {
                      task: row.id,
                      name: `Imported platform v1 ${field}`,
                      phase,
                      command,
                      now: new Date().toISOString(),
                    },
                    transaction,
                  },
                );
            }
          for (const [table, fields] of [
            ['Crontabs', ['task_before', 'task_after']],
            ['Subscriptions', ['sub_before', 'sub_after']],
          ] as const) {
            for (const field of fields)
              await database.query(
                `ALTER TABLE ${table} DROP COLUMN ${field}`,
                { transaction },
              );
          }
          await database.query('DROP TABLE PlatformMetadata', { transaction });
          await database.query(
            platformV2.objects.find((x) => x.name === 'PlatformMetadata')!.sql,
            { transaction },
          );
          await database.query(
            'INSERT INTO PlatformMetadata VALUES (:platform_schema_version,:model_signature,:schema_signature)',
            { replacements: platformV2.metadata, transaction },
          );
          record = platformV2.metadata;
        }
        if (record.platform_schema_version === 2) {
          if (
            record.model_signature !== platformV2.metadata.model_signature ||
            record.schema_signature !== platformV2.metadata.schema_signature ||
            schemaSignature(await objects()) !==
              platformV2.metadata.schema_signature
          )
            throw new UnsupportedDatabaseSchemaError();
          await createRuntimeSchema(database, transaction);
          await database.query('DROP TABLE PlatformMetadata', { transaction });
          await database.query(
            platformV3.objects.find((x) => x.name === 'PlatformMetadata')!.sql,
            { transaction },
          );
          await database.query(
            'INSERT INTO PlatformMetadata VALUES (:platform_schema_version,:model_signature,:schema_signature)',
            { replacements: platformV3.metadata, transaction },
          );
          record = platformV3.metadata;
        }
        if (record.platform_schema_version === 3) {
          if (
            record.model_signature !== platformV3.metadata.model_signature ||
            record.schema_signature !== platformV3.metadata.schema_signature ||
            schemaSignature(await objects()) !==
              platformV3.metadata.schema_signature
          )
            throw new UnsupportedDatabaseSchemaError();
          await createPythonEnvironmentSchema(database, transaction);
          await database.query('DROP TABLE PlatformMetadata', { transaction });
          await database.query(
            platformV4.objects.find((x) => x.name === 'PlatformMetadata')!.sql,
            { transaction },
          );
          await database.query(
            'INSERT INTO PlatformMetadata VALUES (:platform_schema_version,:model_signature,:schema_signature)',
            { replacements: platformV4.metadata, transaction },
          );
          record = platformV4.metadata;
        }
        if (record.platform_schema_version === 4) {
          if (
            record.model_signature !== platformV4.metadata.model_signature ||
            record.schema_signature !== platformV4.metadata.schema_signature ||
            schemaSignature(await objects()) !==
              platformV4.metadata.schema_signature
          )
            throw new UnsupportedDatabaseSchemaError();
          await createNodeEnvironmentSchema(database, transaction);
          await database.query('DROP TABLE PlatformMetadata', { transaction });
          await database.query(
            platformV5.objects.find((x) => x.name === 'PlatformMetadata')!.sql,
            { transaction },
          );
          await database.query(
            'INSERT INTO PlatformMetadata VALUES (:platform_schema_version,:model_signature,:schema_signature)',
            { replacements: platformV5.metadata, transaction },
          );
          record = platformV5.metadata;
        }
        if (record.platform_schema_version === 5) {
          if (
            record.model_signature !== platformV5.metadata.model_signature ||
            record.schema_signature !== platformV5.metadata.schema_signature ||
            schemaSignature(await objects()) !==
              platformV5.metadata.schema_signature
          )
            throw new UnsupportedDatabaseSchemaError();
          await migrateTaskPlatform(database, transaction, models);
          await database.query('DROP TABLE PlatformMetadata', { transaction });
          await database.query(
            platformV6.objects.find((x) => x.name === 'PlatformMetadata')!.sql,
            { transaction },
          );
          await database.query(
            'INSERT INTO PlatformMetadata VALUES (:platform_schema_version,:model_signature,:schema_signature)',
            { replacements: platformV6.metadata, transaction },
          );
          record = platformV6.metadata;
        }
        if (record.platform_schema_version === 6) {
          if (
            record.model_signature !== platformV6.metadata.model_signature ||
            record.schema_signature !== platformV6.metadata.schema_signature ||
            schemaSignature(await objects()) !==
              platformV6.metadata.schema_signature
          )
            throw new UnsupportedDatabaseSchemaError();
          for (const object of [...platformV7.objects].sort(
            (a, b) =>
              Number(!a.sql.startsWith('CREATE TABLE')) -
              Number(!b.sql.startsWith('CREATE TABLE')),
          )) {
            if (!platformV6.objects.some((old) => old.name === object.name))
              await database.query(object.sql, { transaction });
          }
          await database.query('DROP TABLE PlatformMetadata', { transaction });
          await database.query(
            platformV7.objects.find((o) => o.name === 'PlatformMetadata')!.sql,
            { transaction },
          );
          await database.query(
            'INSERT INTO PlatformMetadata VALUES (:platform_schema_version,:model_signature,:schema_signature)',
            { replacements: platformV7.metadata, transaction },
          );
          record = platformV7.metadata;
        }
        if (record.platform_schema_version === 7) {
          if (
            record.model_signature !== platformV7.metadata.model_signature ||
            record.schema_signature !== platformV7.metadata.schema_signature ||
            schemaSignature(await objects()) !==
              platformV7.metadata.schema_signature
          )
            throw new UnsupportedDatabaseSchemaError();
          await createTriggerSchema(database, transaction, models);
          await database.query('DROP TABLE PlatformMetadata', { transaction });
          await database.query(platformV8.objects.find(o => o.name === 'PlatformMetadata')!.sql, { transaction });
          await database.query('INSERT INTO PlatformMetadata VALUES (:platform_schema_version,:model_signature,:schema_signature)', { replacements: platformV8.metadata, transaction });
          record = platformV8.metadata;
        }
        if (record.platform_schema_version === 8) {
          if (record.model_signature !== platformV8.metadata.model_signature || record.schema_signature !== platformV8.metadata.schema_signature || schemaSignature(await objects()) !== platformV8.metadata.schema_signature) throw new UnsupportedDatabaseSchemaError();
          await createObservabilitySchema(database, transaction);
          await database.query('DROP TABLE PlatformMetadata', { transaction });
          createMetadata = true;
        } else if (
          record.platform_schema_version !== PLATFORM_SCHEMA_VERSION ||
          record.model_signature !== signature ||
          record.schema_signature !== schemaSignature(current)
        ) {
          throw new UnsupportedDatabaseSchemaError();
        }
      } else {
        await createFreshTaskPlatform(database, transaction, models);
        await createExecutionSchema(database, transaction, models);
        await createTriggerSchema(database, transaction, models);
        await createObservabilitySchema(database, transaction);
      }
      if (createMetadata) {
        await database.query(
          'CREATE TABLE PlatformMetadata (platform_schema_version INTEGER NOT NULL PRIMARY KEY CHECK(platform_schema_version = 9), model_signature TEXT NOT NULL, schema_signature TEXT NOT NULL)',
          { transaction },
        );
        await database.query(
          'INSERT INTO PlatformMetadata VALUES (:version, :signature, :schemaSignature)',
          {
            replacements: {
              version: PLATFORM_SCHEMA_VERSION,
              signature,
              schemaSignature: schemaSignature(await objects()),
            },
            transaction,
          },
        );
      }
      if (
        (
          await database.query('PRAGMA foreign_key_check', {
            type: QueryTypes.SELECT,
            transaction,
          })
        ).length
      )
        throw new UnsupportedDatabaseSchemaError();
      // Rebuilt referenced tables leave stale deferred-FK counters in SQLite.
      // Only clear after explicit validation of every final FK, inside the same transaction.
      await database.query('PRAGMA defer_foreign_keys=OFF', { transaction });
    },
  );
}
