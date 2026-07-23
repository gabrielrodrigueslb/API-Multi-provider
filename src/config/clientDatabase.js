import crypto from 'node:crypto';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { env } from './env.js';
import { logger } from './logger.js';

const { Pool } = pg;

const poolCache = new Map();
const drizzleCache = new Map();

function normalizeSsl(value, fallback = false) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  return String(value).toLowerCase() === 'true';
}

function buildPoolKey(connection) {
  const base = JSON.stringify({
    host: connection.host,
    port: connection.port,
    database: connection.database,
    user: connection.user,
    password: connection.password,
    ssl: connection.ssl,
  });

  return crypto.createHash('sha1').update(base).digest('hex');
}

function assertConnectionConfig(connection) {
  const requiredFields = ['host', 'port', 'database', 'user', 'password'];

  for (const field of requiredFields) {
    if (!connection[field]) {
      const error = new Error(`Configuracao do banco do cliente invalida: campo "${field}" e obrigatorio.`);
      error.statusCode = 400;
      throw error;
    }
  }
}

export function resolveClientDatabaseConfigByApiKey(apiKey) {
  const registry = env.clientApiKeyRegistry || {};
  const registered = registry[apiKey];

  if (!registered) {
    return null;
  }

  return {
    provider: registered.provider || 'trier',
    name: registered.client_name || registered.clientName || registered.name || null,
    trierInstance: registered.trier_instance || registered.trierInstance || registered.instance || null,
    trierBaseUrl: registered.trier_base_url || registered.trierBaseUrl || env.trierDefaultBaseUrl,
    providerToken: registered.provider_token || registered.providerToken || registered.trier_token || registered.trierToken || null,
    host: registered.host,
    port: Number(registered.port || 5432),
    database: registered.database,
    user: registered.user,
    password: registered.password,
    ssl: normalizeSsl(registered.ssl, false),
    cacheSchema: registered.cache_schema || registered.cacheSchema || 'trier_cache',
    vetorUnidade: registered.vetor_unidade || registered.vetorUnidade || null,
    automatizaShopId: Number(registered.automatiza_shop_id || registered.automatizaShopId || registered.shop_id || registered.shopId || 0) || null,
  };
}

export function getClientDatabasePool(connection) {
  assertConnectionConfig(connection);

  const key = buildPoolKey(connection);

  if (poolCache.has(key)) {
    return poolCache.get(key);
  }

  logger.debug({ host: connection.host, database: connection.database }, 'Criando pool de conexao para cliente');

  const pool = new Pool({
    host: connection.host,
    port: connection.port,
    database: connection.database,
    user: connection.user,
    password: connection.password,
    ssl: connection.ssl ? { rejectUnauthorized: env.clientDatabaseSslRejectUnauthorized } : false,
    max: env.clientDatabasePoolMax,
    idleTimeoutMillis: env.clientDatabasePoolIdleMs,
    connectionTimeoutMillis: env.clientDatabasePoolConnectionTimeoutMs,
  });

  pool.on('error', (err) => {
    logger.error({ host: connection.host, database: connection.database, err }, 'Erro no pool de conexao do cliente — pool invalidado');
    poolCache.delete(key);
    drizzleCache.delete(key);
  });

  poolCache.set(key, pool);
  return pool;
}

export function getClientDatabase(connection) {
  assertConnectionConfig(connection);

  const key = buildPoolKey(connection);

  if (drizzleCache.has(key)) {
    return drizzleCache.get(key);
  }

  const pool = getClientDatabasePool(connection);
  const db = drizzle({ client: pool });
  drizzleCache.set(key, db);
  return db;
}
