import { createHash } from 'crypto';
import { ModelStatic, Model, QueryTypes, Sequelize, Transaction } from 'sequelize';
import platformV1 from '../schema/platformV1';
import platformV2 from '../schema/platformV2';
import { createRuntimeSchema } from '../schema/runtimeSchema';

export const PLATFORM_SCHEMA_VERSION = 3;
export class UnsupportedDatabaseSchemaError extends Error {
  readonly code = 'UNSUPPORTED_DATABASE_SCHEMA';
  constructor() { super('UNSUPPORTED_DATABASE_SCHEMA: Expected a valid platform database or an empty database.'); }
}
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
// Tokenize SQL whitespace without changing quoted identifiers/string literals.
export const schemaSignature = (objects: { name: string; sql: string }[]) => hash(objects.map(x => ({
  name: x.name, sql: (x.sql.match(/'(?:''|[^'])*'|"(?:""|[^"])*"|`(?:``|[^`])*`|\[[^\]]*\]|[^\s'"`\[]+/g) || []).join(''),
})));
export const modelSignature = (models: ModelStatic<Model>[]) => hash([...models].sort((a,b) => String(a.tableName).localeCompare(String(b.tableName))).map(model => ({
  table: model.tableName, attributes: Object.entries(model.rawAttributes).map(([name, field]) => ({
    name, type: String(field.type), allowNull: field.allowNull, primaryKey: field.primaryKey,
    autoIncrement: field.autoIncrement, defaultValue: field.defaultValue, references: field.references,
    onDelete: field.onDelete, unique: field.unique,
  })), indexes: model.options.indexes,
})));

/** Only frozen platform versions may upgrade. Unknown databases remain untouched. */
export async function initializeOperationalSchema(database: Sequelize, models: ModelStatic<Model>[]): Promise<void> {
  const signature = modelSignature(models);
  await database.transaction({ type: Transaction.TYPES.IMMEDIATE }, async transaction => {
    const objects = () => database.query<{name: string; sql: string}>(
      "SELECT name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name", { type: QueryTypes.SELECT, transaction });
    const current = await objects();
    let createMetadata = current.length === 0;
    if (current.length) {
      if (!current.some(x => x.name === 'PlatformMetadata')) throw new UnsupportedDatabaseSchemaError();
      const metadata = await database.query<{platform_schema_version: number; model_signature: string; schema_signature: string}>(
        'SELECT * FROM PlatformMetadata', { type: QueryTypes.SELECT, transaction });
      if (metadata.length !== 1) throw new UnsupportedDatabaseSchemaError();
      let record = metadata[0];
      const violations = await database.query('PRAGMA foreign_key_check', { type: QueryTypes.SELECT, transaction });
      if (violations.length) throw new UnsupportedDatabaseSchemaError();
      if (record.platform_schema_version === 1) {
        if (record.model_signature !== platformV1.metadata.model_signature ||
            record.schema_signature !== platformV1.metadata.schema_signature || hash(current) !== platformV1.metadata.schema_signature) throw new UnsupportedDatabaseSchemaError();
        // New tables first. Preserve old commands verbatim; old failures were non-fatal,
        // and task_after ran after either normal success or failure, hence FINALLY.
        for (const object of [...platformV2.objects].sort((a,b) => Number(!a.sql.startsWith('CREATE TABLE')) - Number(!b.sql.startsWith('CREATE TABLE')))) {
          if (!current.some(x => x.name === object.name)) await database.query(object.sql, {transaction});
        }
        const hooks = await database.query<{id: number; task_before: string | null; task_after: string | null}>(
          'SELECT id, task_before, task_after FROM Crontabs', { type: QueryTypes.SELECT, transaction });
        for (const row of hooks) for (const [field, phase] of [['task_before','BEFORE'], ['task_after','FINALLY']] as const) {
          const command = row[field];
          if (command?.trim()) await database.query(
            'INSERT INTO TaskHooks (task_id,name,phase,command,cwd_base,position,timeout_seconds,failure_policy,enabled,version,createdAt,updatedAt) VALUES (:task,:name,:phase,:command,\'TASK_CWD\',10,60,\'CONTINUE\',1,1,:now,:now)',
            { replacements: { task: row.id, name: `Imported platform v1 ${field}`, phase, command, now: new Date().toISOString() }, transaction });
        }
        for (const [table, fields] of [['Crontabs', ['task_before','task_after']], ['Subscriptions',['sub_before','sub_after']]] as const) {
          for (const field of fields) await database.query(`ALTER TABLE ${table} DROP COLUMN ${field}`, { transaction });
        }
        await database.query('DROP TABLE PlatformMetadata', { transaction });
        await database.query(platformV2.objects.find(x => x.name === 'PlatformMetadata')!.sql, {transaction});
        await database.query('INSERT INTO PlatformMetadata VALUES (:platform_schema_version,:model_signature,:schema_signature)', {replacements:platformV2.metadata,transaction});
        record = platformV2.metadata;
      }
      if (record.platform_schema_version === 2) {
        if (record.model_signature !== platformV2.metadata.model_signature || record.schema_signature !== platformV2.metadata.schema_signature || schemaSignature(await objects()) !== platformV2.metadata.schema_signature) throw new UnsupportedDatabaseSchemaError();
        await createRuntimeSchema(database, transaction);
        await database.query('DROP TABLE PlatformMetadata', {transaction});
        createMetadata = true;
      } else if (record.platform_schema_version !== PLATFORM_SCHEMA_VERSION || record.model_signature !== signature || record.schema_signature !== schemaSignature(current)) {
        throw new UnsupportedDatabaseSchemaError();
      }
    } else {
      for (const model of models) if (!['RuntimeProviders','RuntimeInstallations','RuntimeOperations'].includes(String(model.tableName))) await model.sync(Object.assign({force:false},{transaction}));
      await createRuntimeSchema(database, transaction);
    }
    if (createMetadata) {
      await database.query('CREATE TABLE PlatformMetadata (platform_schema_version INTEGER NOT NULL PRIMARY KEY CHECK(platform_schema_version = 3), model_signature TEXT NOT NULL, schema_signature TEXT NOT NULL)', { transaction });
      await database.query('INSERT INTO PlatformMetadata VALUES (:version, :signature, :schemaSignature)', {
        replacements: { version: PLATFORM_SCHEMA_VERSION, signature, schemaSignature: schemaSignature(await objects()) }, transaction,
      });
    }
    if ((await database.query('PRAGMA foreign_key_check', { type: QueryTypes.SELECT, transaction })).length) throw new UnsupportedDatabaseSchemaError();
  });
}
