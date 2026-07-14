import pg from 'pg';
import { env } from '../config/env.js';
import { getClientDatabasePool } from '../config/clientDatabase.js';

const { Pool } = pg;

function assertSafeIdentifier(value, fieldName) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
    const error = new Error(`Valor invalido para ${fieldName}.`);
    error.statusCode = 400;
    throw error;
  }

  return value;
}

export function normalizeEan(value) {
  return String(value ?? '')
    .replace(/\D/g, '')
    .replace(/^0+/, '')
    .trim();
}

function toNullableNumber(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildSourceKey(discountType, payload = {}) {
  const parts = [
    discountType,
    payload.codigoDesconto,
    payload.codigoKit,
    payload.codigoEncarte,
    payload.codigoProduto,
    payload.codigoBarras,
    payload.codigoParceiro,
    payload.codigoEmpresa,
    payload.codigoGrupoProduto,
    payload.codigoCondicaoPagamento,
    payload.dataInicio,
    payload.dataFim,
    payload.nomeCampanha,
  ];

  return parts
    .filter((value) => value !== undefined && value !== null && value !== '')
    .map((value) => String(value).trim())
    .join(':');
}

function resolveProductCode(record = {}) {
  return Number(
    record.codigoProduto ??
      record.codigo ??
      record.produto?.codigoProduto ??
      record.produto?.codigo ??
      0,
  ) || null;
}

function resolveBarcode(record = {}) {
  return (
    record.codigoBarras ??
    record.identificador ??
    record.produto?.codigoBarras ??
    null
  );
}

function resolveDiscountName(record = {}) {
  return (
    record.nomeProduto ??
    record.produto?.nomeProduto ??
    record.nomeCampanha ??
    record.nomeGrupoProduto ??
    null
  );
}

function resolveValidity(rawValue) {
  if (!rawValue) {
    return null;
  }

  const parsed = new Date(rawValue);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function createTenantDatabaseIfMissing(tenant) {
  if (!env.tenantDbProvisionEnabled) {
    return false;
  }

  if (!env.tenantDbAdminUser || !env.tenantDbAdminPassword) {
    const error = new Error(
      'Provisionamento de banco habilitado, mas TENANT_DB_ADMIN_USER/TENANT_DB_ADMIN_PASSWORD nao foram configurados.',
    );
    error.statusCode = 500;
    throw error;
  }

  const adminPool = new Pool({
    host: tenant.host,
    port: tenant.port,
    database: env.tenantDbAdminDatabase,
    user: env.tenantDbAdminUser,
    password: env.tenantDbAdminPassword,
    ssl: env.tenantDbAdminSsl ? { rejectUnauthorized: false } : false,
  });

  try {
    const check = await adminPool.query('select 1 from pg_database where datname = $1', [tenant.database]);

    if (check.rowCount > 0) {
      return false;
    }

    const safeName = `"${String(tenant.database).replace(/"/g, '""')}"`;
    await adminPool.query(`create database ${safeName}`);
    return true;
  } finally {
    await adminPool.end();
  }
}

export async function ensureTenantCatalogSchema(tenant) {
  const schema = assertSafeIdentifier(tenant.cacheSchema || 'trier_cache', 'cacheSchema');
  const pool = getClientDatabasePool(tenant);

  await pool.query(`create schema if not exists ${schema}`);
  await pool.query(`
    create table if not exists ${schema}.products (
      product_code bigint primary key,
      ean text,
      ean_normalized text not null,
      name text not null,
      value_sale numeric null,
      stock_quantity integer null,
      is_active boolean null,
      payload jsonb not null,
      source_updated_at timestamptz null,
      synced_at timestamptz not null default now(),
      last_sync_batch_id text null
    )
  `);
  await pool.query(`
    create unique index if not exists ${schema}_products_ean_code_uidx
      on ${schema}.products (ean_normalized, product_code)
  `);
  await pool.query(`
    create index if not exists ${schema}_products_ean_idx
      on ${schema}.products (ean_normalized)
  `);
  await pool.query(`
    create table if not exists ${schema}.product_discounts (
      id bigserial primary key,
      discount_type text not null,
      source_key text not null,
      product_code bigint null,
      ean text null,
      ean_normalized text null,
      product_name text null,
      starts_at timestamptz null,
      ends_at timestamptz null,
      payload jsonb not null,
      synced_at timestamptz not null default now(),
      last_sync_batch_id text null,
      constraint ${schema}_product_discounts_source_key_uidx unique (discount_type, source_key)
    )
  `);
  await pool.query(`
    create index if not exists ${schema}_product_discounts_ean_idx
      on ${schema}.product_discounts (ean_normalized)
  `);
  await pool.query(`
    create index if not exists ${schema}_product_discounts_product_idx
      on ${schema}.product_discounts (product_code)
  `);
  await pool.query(`
    create table if not exists ${schema}.sync_state (
      resource text primary key,
      last_full_sync_at timestamptz null,
      last_incremental_sync_at timestamptz null,
      last_window_start timestamptz null,
      last_window_end timestamptz null,
      updated_at timestamptz not null default now()
    )
  `);
}

export async function provisionTenantCatalog(tenant) {
  await createTenantDatabaseIfMissing(tenant);
  await ensureTenantCatalogSchema(tenant);
}

export async function removeTenantCatalog(tenant) {
  const schema = assertSafeIdentifier(tenant.cacheSchema || 'trier_cache', 'cacheSchema');
  const generatedDatabase = /^cliente_[a-z0-9_]+_cache$/.test(tenant.database);

  if (env.tenantDbProvisionEnabled && generatedDatabase) {
    const adminPool = new Pool({
      host: tenant.host,
      port: tenant.port,
      database: env.tenantDbAdminDatabase,
      user: env.tenantDbAdminUser,
      password: env.tenantDbAdminPassword,
      ssl: env.tenantDbAdminSsl ? { rejectUnauthorized: false } : false,
    });

    try {
      await adminPool.query(
        'select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()',
        [tenant.database],
      );
      const safeDatabase = `"${String(tenant.database).replace(/"/g, '""')}"`;
      await adminPool.query(`drop database if exists ${safeDatabase}`);
    } finally {
      await adminPool.end();
    }

    return;
  }

  const pool = getClientDatabasePool(tenant);
  await pool.query(`drop schema if exists ${schema} cascade`);
}

export async function upsertProducts(tenant, products = [], syncBatchId) {
  if (products.length === 0) {
    return;
  }

  const schema = assertSafeIdentifier(tenant.cacheSchema || 'trier_cache', 'cacheSchema');
  const pool = getClientDatabasePool(tenant);
  const client = await pool.connect();

  try {
    await client.query('begin');

    for (const product of products) {
      const productCode = resolveProductCode(product);
      const ean = resolveBarcode(product);
      const eanNormalized = normalizeEan(ean || productCode);

      if (!productCode || !eanNormalized) {
        continue;
      }

      await client.query(
        `
          insert into ${schema}.products (
            product_code,
            ean,
            ean_normalized,
            name,
            value_sale,
            stock_quantity,
            is_active,
            payload,
            source_updated_at,
            synced_at,
            last_sync_batch_id
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, now(), $10)
          on conflict (product_code) do update
          set ean = excluded.ean,
              ean_normalized = excluded.ean_normalized,
              name = excluded.name,
              value_sale = excluded.value_sale,
              stock_quantity = coalesce(excluded.stock_quantity, ${schema}.products.stock_quantity),
              is_active = excluded.is_active,
              payload = excluded.payload,
              source_updated_at = excluded.source_updated_at,
              synced_at = now(),
              last_sync_batch_id = excluded.last_sync_batch_id
        `,
        [
          productCode,
          ean ? String(ean) : null,
          eanNormalized,
          String(product.nome || product.nomeProduto || `PRODUTO ${productCode}`),
          toNullableNumber(product.valorVenda),
          product.quantidadeEstoque === undefined ? null : Number(product.quantidadeEstoque),
          typeof product.ativo === 'boolean' ? product.ativo : null,
          JSON.stringify(product),
          null,
          syncBatchId,
        ],
      );
    }

    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export async function upsertStocks(tenant, stocks = [], syncBatchId) {
  if (stocks.length === 0) {
    return;
  }

  const schema = assertSafeIdentifier(tenant.cacheSchema || 'trier_cache', 'cacheSchema');
  const pool = getClientDatabasePool(tenant);
  const client = await pool.connect();

  try {
    await client.query('begin');

    for (const stock of stocks) {
      const productCode = resolveProductCode(stock);
      if (!productCode) {
        continue;
      }

      await client.query(
        `
          update ${schema}.products
             set stock_quantity = $2,
                 payload = jsonb_set(
                   coalesce(payload, '{}'::jsonb),
                   '{estoque}',
                   to_jsonb($2::integer),
                   true
                 ),
                 synced_at = now(),
                 last_sync_batch_id = $3
           where product_code = $1
        `,
        [productCode, Number(stock.quantidadeEstoque || 0), syncBatchId],
      );
    }

    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export async function upsertDiscounts(tenant, discountType, discounts = [], syncBatchId) {
  const schema = assertSafeIdentifier(tenant.cacheSchema || 'trier_cache', 'cacheSchema');
  const pool = getClientDatabasePool(tenant);
  const client = await pool.connect();

  try {
    await client.query('begin');

    for (const discount of discounts) {
      const sourceKey = buildSourceKey(discountType, discount);
      if (!sourceKey) {
        continue;
      }

      const productCode = resolveProductCode(discount);
      const ean = resolveBarcode(discount);
      const eanNormalized = normalizeEan(ean || productCode);

      await client.query(
        `
          insert into ${schema}.product_discounts (
            discount_type,
            source_key,
            product_code,
            ean,
            ean_normalized,
            product_name,
            starts_at,
            ends_at,
            payload,
            synced_at,
            last_sync_batch_id
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, now(), $10)
          on conflict (discount_type, source_key) do update
          set product_code = excluded.product_code,
              ean = excluded.ean,
              ean_normalized = excluded.ean_normalized,
              product_name = excluded.product_name,
              starts_at = excluded.starts_at,
              ends_at = excluded.ends_at,
              payload = excluded.payload,
              synced_at = now(),
              last_sync_batch_id = excluded.last_sync_batch_id
        `,
        [
          discountType,
          sourceKey,
          productCode,
          ean ? String(ean) : null,
          eanNormalized || null,
          resolveDiscountName(discount),
          resolveValidity(discount.dataInicio),
          resolveValidity(discount.dataFim),
          JSON.stringify(discount),
          syncBatchId,
        ],
      );
    }

    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export async function pruneFullSyncArtifacts(tenant, syncBatchId) {
  const schema = assertSafeIdentifier(tenant.cacheSchema || 'trier_cache', 'cacheSchema');
  const pool = getClientDatabasePool(tenant);

  await pool.query(`delete from ${schema}.products where last_sync_batch_id is distinct from $1`, [syncBatchId]);
  await pool.query(`delete from ${schema}.product_discounts where last_sync_batch_id is distinct from $1`, [syncBatchId]);
}

export async function updateTenantSyncState(tenant, resource, patch = {}) {
  const schema = assertSafeIdentifier(tenant.cacheSchema || 'trier_cache', 'cacheSchema');
  const pool = getClientDatabasePool(tenant);

  await pool.query(
    `
      insert into ${schema}.sync_state (
        resource,
        last_full_sync_at,
        last_incremental_sync_at,
        last_window_start,
        last_window_end,
        updated_at
      )
      values ($1, $2, $3, $4, $5, now())
      on conflict (resource) do update
      set last_full_sync_at = coalesce(excluded.last_full_sync_at, ${schema}.sync_state.last_full_sync_at),
          last_incremental_sync_at = coalesce(excluded.last_incremental_sync_at, ${schema}.sync_state.last_incremental_sync_at),
          last_window_start = coalesce(excluded.last_window_start, ${schema}.sync_state.last_window_start),
          last_window_end = coalesce(excluded.last_window_end, ${schema}.sync_state.last_window_end),
          updated_at = now()
    `,
    [
      resource,
      patch.lastFullSyncAt || null,
      patch.lastIncrementalSyncAt || null,
      patch.lastWindowStart || null,
      patch.lastWindowEnd || null,
    ],
  );
}

export async function fetchCatalogByEans(tenant, eans = []) {
  const normalized = Array.from(new Set(eans.map(normalizeEan).filter(Boolean)));
  if (normalized.length === 0) {
    return { products: [], discounts: [] };
  }

  const schema = assertSafeIdentifier(tenant.cacheSchema || 'trier_cache', 'cacheSchema');
  const pool = getClientDatabasePool(tenant);
  const productsResult = await pool.query(
    `
      select product_code, ean, ean_normalized, name, value_sale, stock_quantity, is_active, payload
        from ${schema}.products
       where ean_normalized = any($1::text[])
       order by ean_normalized asc
    `,
    [normalized],
  );
  const productCodes = productsResult.rows.map((row) => row.product_code).filter(Boolean);
  const discountsResult = await pool.query(
    `
      select discount_type, source_key, product_code, ean, ean_normalized, product_name, starts_at, ends_at, payload
        from ${schema}.product_discounts
       where ean_normalized = any($1::text[])
          or product_code = any($2::bigint[])
       order by discount_type asc, source_key asc
    `,
    [normalized, productCodes.length > 0 ? productCodes : [0]],
  );

  return {
    products: productsResult.rows,
    discounts: discountsResult.rows,
  };
}

export const _internals = {
  buildSourceKey,
  normalizeEan,
  resolveProductCode,
};
