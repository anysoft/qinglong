import { QueryTypes, Sequelize, Transaction } from 'sequelize';
import { sequelize } from '../data';
/** Same platform default as SystemService; resolve once when saving a definition. */
export async function triggerTimezone(
  database: Sequelize = sequelize,
  transaction?: Transaction,
) {
  const rows = await database.query<{
    info: string | Record<string, unknown> | null;
  }>("SELECT info FROM Auths WHERE type='systemConfig' LIMIT 1", {
    type: QueryTypes.SELECT,
    transaction,
  });
  const raw = rows[0]?.info,
    info = typeof raw === 'string' ? JSON.parse(raw) : raw;
  const timezone =
    typeof info?.timezone === 'string' ? info.timezone : 'Asia/Shanghai';
  new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date());
  return timezone;
}
