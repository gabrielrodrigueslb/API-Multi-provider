import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import pg from 'pg';
import { env } from './env.js';
import { logger } from './logger.js';

const { Pool } = pg;

function assertSafeIdentifier(value, fieldName) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
    throw new Error(`Configuracao invalida para ${fieldName}.`);
  }

  return value;
}

const controlPool = new Pool({
  host: env.controlDbHost,
  port: env.controlDbPort,
  database: env.controlDbName,
  user: env.controlDbUser,
  password: env.controlDbPassword,
  ssl: env.controlDbSsl ? { rejectUnauthorized: false } : false,
});

export const controlDb = drizzle({ client: controlPool });

export async function bootstrapControlDatabase() {
  const schemaName = assertSafeIdentifier(env.controlDbSchema, 'CONTROL_DB_SCHEMA');

  logger.debug({ schema: schemaName }, 'Verificando schema do banco de controle');
  await controlPool.query(`create schema if not exists ${schemaName}`);
  await controlPool.query(`
    create table if not exists ${schemaName}.tenant_instances (
      id bigserial primary key,
      name text not null,
      api_key_hash text not null unique,
      trier_instance text not null default '',
      trier_base_url text not null default '',
      trier_token text not null default '',
      db_host text not null,
      db_port integer not null,
      db_name text not null,
      db_user text not null,
      db_password text not null,
      db_ssl boolean not null default false,
      cache_schema text not null default 'trier_cache',
      sync_incremental_cron text not null default '0 */2 * * *',
      sync_full_cron text not null default '0 3 * * *',
      last_incremental_sync_at timestamptz null,
      last_full_sync_at timestamptz null,
      status text not null default 'active',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `);
  await controlPool.query(`
    alter table ${schemaName}.tenant_instances
    drop column if exists unidade_negocio_id,
    drop column if exists estoque_minimo
  `);
  await controlPool.query(`
    alter table ${schemaName}.tenant_instances
    add column if not exists trier_instance text,
    add column if not exists trier_base_url text,
    add column if not exists trier_token text,
    add column if not exists cache_schema text not null default 'trier_cache',
    add column if not exists sync_incremental_cron text not null default '0 */2 * * *',
    add column if not exists sync_full_cron text not null default '0 3 * * *',
    add column if not exists last_incremental_sync_at timestamptz,
    add column if not exists last_full_sync_at timestamptz
  `);
  await controlPool.query(`
    update ${schemaName}.tenant_instances
       set trier_instance = coalesce(nullif(trier_instance, ''), name),
           trier_base_url = coalesce(nullif(trier_base_url, ''), '${env.trierDefaultBaseUrl}'),
           trier_token = coalesce(trier_token, '')
     where trier_instance is null
        or trier_instance = ''
        or trier_base_url is null
        or trier_token is null
  `);
  await controlPool.query(`
    alter table ${schemaName}.tenant_instances
    alter column trier_instance set not null,
    alter column trier_base_url set not null,
    alter column trier_token set not null
  `);
  await controlPool.query(`
    create index if not exists tenant_instances_status_idx
      on ${schemaName}.tenant_instances (status)
  `);
}

export async function pingControlDatabase() {
  await controlDb.execute(sql`select now()`);
}
