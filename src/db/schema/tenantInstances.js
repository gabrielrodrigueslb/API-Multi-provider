import { pgSchema, bigserial, boolean, integer, text, timestamp } from 'drizzle-orm/pg-core';
import { env } from '../../config/env.js';

export const instancesSchema = pgSchema(env.controlDbSchema);

export const tenantInstances = instancesSchema.table('tenant_instances', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  name: text('name').notNull(),
  apiKeyHash: text('api_key_hash').notNull().unique(),
  trierInstance: text('trier_instance').notNull(),
  trierBaseUrl: text('trier_base_url').notNull(),
  trierToken: text('trier_token').notNull(),
  dbHost: text('db_host').notNull(),
  dbPort: integer('db_port').notNull(),
  dbName: text('db_name').notNull(),
  dbUser: text('db_user').notNull(),
  dbPassword: text('db_password').notNull(),
  dbSsl: boolean('db_ssl').notNull().default(false),
  cacheSchema: text('cache_schema').notNull().default('trier_cache'),
  syncIncrementalCron: text('sync_incremental_cron').notNull().default('0 */2 * * *'),
  syncFullCron: text('sync_full_cron').notNull().default('0 3 * * *'),
  lastIncrementalSyncAt: timestamp('last_incremental_sync_at', { withTimezone: true }),
  lastFullSyncAt: timestamp('last_full_sync_at', { withTimezone: true }),
  status: text('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
