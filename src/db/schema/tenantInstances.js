import { pgSchema, bigserial, boolean, integer, text, timestamp } from 'drizzle-orm/pg-core';
import { env } from '../../config/env.js';

export const instancesSchema = pgSchema(env.controlDbSchema);

export const tenantInstances = instancesSchema.table('tenant_instances', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  provider: text('provider').notNull().default('trier'),
  name: text('name').notNull(),
  apiKeyHash: text('api_key_hash').notNull().unique(),
  // trier_instance/trier_base_url/cache_schema/sync_*_cron only mean something
  // for provider "trier" (cache-DB sync scheduling); null for alpha7/vetor.
  trierInstance: text('trier_instance'),
  trierBaseUrl: text('trier_base_url'),
  // Holds the provider auth token - Trier's, or Vetor's (schema is shared
  // across providers, not Trier-specific despite the historical name).
  providerToken: text('provider_token').notNull(),
  dbHost: text('db_host').notNull(),
  dbPort: integer('db_port').notNull(),
  dbName: text('db_name').notNull(),
  dbUser: text('db_user').notNull(),
  dbPassword: text('db_password').notNull(),
  dbSsl: boolean('db_ssl').notNull().default(false),
  cacheSchema: text('cache_schema'),
  syncIncrementalCron: text('sync_incremental_cron'),
  syncFullCron: text('sync_full_cron'),
  // Vetor filial/unidade code (cdFilial), used to scope live product queries.
  vetorUnidade: text('vetor_unidade'),
  automatizaShopId: integer('automatiza_shop_id'),
  lastIncrementalSyncAt: timestamp('last_incremental_sync_at', { withTimezone: true }),
  lastFullSyncAt: timestamp('last_full_sync_at', { withTimezone: true }),
  status: text('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
