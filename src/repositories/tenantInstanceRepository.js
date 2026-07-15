import crypto from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { controlDb } from '../config/controlDatabase.js';
import { getClientDatabasePool } from '../config/clientDatabase.js';
import { tenantInstances } from '../db/schema/tenantInstances.js';

const apiKeyCache = new Map();
const CACHE_TTL_MS = 60_000;

export function hashApiKey(apiKey) {
  return crypto.createHash('sha256').update(String(apiKey || '')).digest('hex');
}

function mapRowToClientConfig(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    provider: row.provider,
    name: row.name,
    trierInstance: row.trierInstance,
    trierBaseUrl: row.trierBaseUrl,
    trierToken: row.trierToken,
    host: row.dbHost,
    port: Number(row.dbPort || 5432),
    database: row.dbName,
    user: row.dbUser,
    password: row.dbPassword,
    ssl: Boolean(row.dbSsl),
    cacheSchema: row.cacheSchema,
    syncIncrementalCron: row.syncIncrementalCron,
    syncFullCron: row.syncFullCron,
    vetorUnidade: row.vetorUnidade,
    lastIncrementalSyncAt: row.lastIncrementalSyncAt,
    lastFullSyncAt: row.lastFullSyncAt,
    status: row.status,
  };
}

function mapPublicInstance(row) {
  return {
    id: row.id,
    provider: row.provider,
    name: row.name,
    trierInstance: row.trierInstance,
    trierBaseUrl: row.trierBaseUrl,
    host: row.dbHost,
    port: row.dbPort,
    database: row.dbName,
    user: row.dbUser,
    ssl: row.dbSsl,
    cacheSchema: row.cacheSchema,
    syncIncrementalCron: row.syncIncrementalCron,
    syncFullCron: row.syncFullCron,
    vetorUnidade: row.vetorUnidade,
    lastIncrementalSyncAt: row.lastIncrementalSyncAt,
    lastFullSyncAt: row.lastFullSyncAt,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function generateApiKey() {
  return crypto.randomBytes(24).toString('hex');
}

function setCachedApiKey(apiKey, config) {
  apiKeyCache.set(apiKey, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    value: config,
  });
}

function getCachedApiKey(apiKey) {
  const cached = apiKeyCache.get(apiKey);

  if (!cached) {
    return null;
  }

  if (cached.expiresAt <= Date.now()) {
    apiKeyCache.delete(apiKey);
    return null;
  }

  return cached.value;
}

export async function findTenantInstanceByApiKey(apiKey) {
  if (!apiKey) {
    return null;
  }

  const cached = getCachedApiKey(apiKey);
  if (cached) {
    return cached;
  }

  const apiKeyHash = hashApiKey(apiKey);
  const rows = await controlDb
    .select()
    .from(tenantInstances)
    .where(and(eq(tenantInstances.apiKeyHash, apiKeyHash), eq(tenantInstances.status, 'active')))
    .limit(1);

  const config = mapRowToClientConfig(rows[0] || null);

  if (config) {
    setCachedApiKey(apiKey, config);
  }

  return config;
}

export async function listTenantInstances() {
  const rows = await controlDb.select().from(tenantInstances).orderBy(desc(tenantInstances.id));
  return rows.map(mapPublicInstance);
}

export async function listActiveTenantInstances() {
  const rows = await controlDb
    .select()
    .from(tenantInstances)
    .where(eq(tenantInstances.status, 'active'))
    .orderBy(desc(tenantInstances.id));
  return rows.map(mapRowToClientConfig);
}

export async function createTenantInstance(payload = {}) {
  const apiKey = payload.apiKey || generateApiKey();
  const apiKeyHash = hashApiKey(apiKey);

  const [row] = await controlDb
    .insert(tenantInstances)
    .values({
      provider: payload.provider || 'trier',
      name: payload.name,
      apiKeyHash,
      trierInstance: payload.trierInstance,
      trierBaseUrl: payload.trierBaseUrl,
      trierToken: payload.trierToken,
      dbHost: payload.host,
      dbPort: Number(payload.port || 5432),
      dbName: payload.database,
      dbUser: payload.user,
      dbPassword: payload.password,
      dbSsl: Boolean(payload.ssl),
      cacheSchema: payload.cacheSchema,
      syncIncrementalCron: payload.syncIncrementalCron,
      syncFullCron: payload.syncFullCron,
      vetorUnidade: payload.vetorUnidade,
      status: payload.status || 'active',
    })
    .returning();

  return {
    apiKey,
    instance: mapPublicInstance(row),
  };
}

export async function findTenantInstanceById(id) {
  const rows = await controlDb.select().from(tenantInstances).where(eq(tenantInstances.id, Number(id))).limit(1);
  return mapRowToClientConfig(rows[0] || null);
}

export async function deleteTenantInstance(id) {
  const [row] = await controlDb
    .delete(tenantInstances)
    .where(eq(tenantInstances.id, Number(id)))
    .returning();

  if (!row) {
    return null;
  }

  apiKeyCache.clear();
  return mapRowToClientConfig(row);
}

export async function testTenantInstanceConnection(id) {
  const row = await findTenantInstanceById(id);

  if (!row) {
    const error = new Error('Instancia nao encontrada.');
    error.statusCode = 404;
    throw error;
  }

  const pool = getClientDatabasePool(row);
  const result = await pool.query('select current_database() as db, current_user as usr, now() as now');

  return {
    instance: {
      id: row.id,
      provider: row.provider,
      name: row.name,
      trierInstance: row.trierInstance,
      trierBaseUrl: row.trierBaseUrl,
      host: row.host,
      port: row.port,
      database: row.database,
      user: row.user,
      ssl: row.ssl,
      cacheSchema: row.cacheSchema,
      syncIncrementalCron: row.syncIncrementalCron,
      syncFullCron: row.syncFullCron,
      status: row.status,
      lastIncrementalSyncAt: row.lastIncrementalSyncAt,
      lastFullSyncAt: row.lastFullSyncAt,
    },
    connection: result.rows[0],
  };
}

export async function updateTenantSyncTimestamps(id, timestamps = {}) {
  const payload = {
    updatedAt: new Date(),
  };

  if (timestamps.lastIncrementalSyncAt) {
    payload.lastIncrementalSyncAt = timestamps.lastIncrementalSyncAt;
  }

  if (timestamps.lastFullSyncAt) {
    payload.lastFullSyncAt = timestamps.lastFullSyncAt;
  }

  const [row] = await controlDb
    .update(tenantInstances)
    .set(payload)
    .where(eq(tenantInstances.id, Number(id)))
    .returning();

  return mapPublicInstance(row);
}
