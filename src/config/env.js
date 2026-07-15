import 'dotenv/config';

function parseNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseBoolean(value, fallback = false) {
  if (value === undefined) {
    return fallback;
  }

  return String(value).toLowerCase() === 'true';
}

function parseString(value, fallback = '') {
  if (value === undefined || value === null) {
    return fallback;
  }

  const normalized = String(value).trim();
  return normalized || fallback;
}

function parseJson(value, fallback) {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export const env = {
  nodeEnv: parseString(process.env.NODE_ENV, 'development'),
  port: parseNumber(process.env.PORT, 3000),
  controlDbHost: parseString(process.env.CONTROL_DB_HOST, 'localhost'),
  controlDbPort: parseNumber(process.env.CONTROL_DB_PORT, 5432),
  controlDbName: parseString(process.env.CONTROL_DB_NAME, 'banco_eans'),
  controlDbSchema: parseString(process.env.CONTROL_DB_SCHEMA, 'instancias'),
  controlDbUser: parseString(process.env.CONTROL_DB_USER, 'postgres'),
  controlDbPassword: parseString(process.env.CONTROL_DB_PASSWORD, ''),
  controlDbSsl: parseBoolean(process.env.CONTROL_DB_SSL, false),
  adminApiKey: parseString(process.env.ADMIN_API_KEY, ''),
  clientDatabasePoolMax: parseNumber(process.env.CLIENT_DATABASE_POOL_MAX, 5),
  clientDatabasePoolIdleMs: parseNumber(process.env.CLIENT_DATABASE_POOL_IDLE_MS, 30000),
  clientDatabasePoolConnectionTimeoutMs: parseNumber(
    process.env.CLIENT_DATABASE_POOL_CONNECTION_TIMEOUT_MS,
    10000,
  ),
  clientDatabaseSslRejectUnauthorized: parseBoolean(
    process.env.CLIENT_DATABASE_SSL_REJECT_UNAUTHORIZED,
    true,
  ),
  clientApiKeyRegistry: parseJson(process.env.CLIENT_API_KEYS_JSON, {}),
  requestJsonLimit: parseString(process.env.REQUEST_JSON_LIMIT, '32kb'),
  maxEanBatchSize: parseNumber(process.env.MAX_EAN_BATCH_SIZE, 100),
  redisUrl: parseString(process.env.REDIS_URL, ''),
  syncIncrementalCron: parseString(process.env.SYNC_INCREMENTAL_CRON, '0 */2 * * *'),
  syncFullCron: parseString(process.env.SYNC_FULL_CRON, '0 3 * * *'),
  syncIncrementalFallbackHours: parseNumber(process.env.SYNC_INCREMENTAL_FALLBACK_HOURS, 2),
  trierPageSize: parseNumber(process.env.TRIER_PAGE_SIZE, 200),
  trierTimeoutMs: parseNumber(process.env.TRIER_TIMEOUT_MS, 30000),
  trierDefaultBaseUrl: parseString(
    process.env.TRIER_DEFAULT_BASE_URL,
    'https://api-sgf-gateway.triersistemas.com.br/sgfpod1',
  ),
  trierRemoveStockRestriction: parseBoolean(process.env.TRIER_REMOVE_STOCK_RESTRICTION, true),
  tenantDbProvisionEnabled: parseBoolean(process.env.TENANT_DB_PROVISION_ENABLED, false),
  tenantDbAdminHost: parseString(process.env.TENANT_DB_ADMIN_HOST, ''),
  tenantDbAdminPort: parseNumber(process.env.TENANT_DB_ADMIN_PORT, 5432),
  tenantDbAdminDatabase: parseString(process.env.TENANT_DB_ADMIN_DATABASE, 'postgres'),
  tenantDbAdminUser: parseString(process.env.TENANT_DB_ADMIN_USER, ''),
  tenantDbAdminPassword: parseString(process.env.TENANT_DB_ADMIN_PASSWORD, ''),
  tenantDbAdminSsl: parseBoolean(process.env.TENANT_DB_ADMIN_SSL, false),
};
