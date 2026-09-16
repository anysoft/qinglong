import 'reflect-metadata';
// Register the same canonical model definitions as ordinary bootstrap, without running workers or stale-owner cleanup.
require('./loaders/db');
import { sequelize } from './data';
import { initializeOperationalSchema } from './shared/operationalSchema';
(async () => {
  await initializeOperationalSchema(sequelize, Object.values(sequelize.models));
  await sequelize.close();
})().catch(async () => {
  await sequelize.close().catch(() => {});
  process.stderr.write('RESTORE_SCHEMA_MIGRATION_FAILED\n');
  process.exitCode = 1;
});
