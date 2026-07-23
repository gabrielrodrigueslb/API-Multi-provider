import { env } from '../config/env.js';

function requiredString(value, fieldName, maxLength = 200) {
  const normalized = String(value ?? '').trim();

  if (!normalized) {
    const error = new Error(`O campo "${fieldName}" e obrigatorio.`);
    error.statusCode = 400;
    throw error;
  }

  if (normalized.length > maxLength) {
    const error = new Error(`O campo "${fieldName}" excede o limite de ${maxLength} caracteres.`);
    error.statusCode = 400;
    throw error;
  }

  return normalized;
}

function optionalString(value, maxLength = 200) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const normalized = String(value).trim();
  if (!normalized) {
    return null;
  }

  if (normalized.length > maxLength) {
    const error = new Error(`O valor excede o limite de ${maxLength} caracteres.`);
    error.statusCode = 400;
    throw error;
  }

  return normalized;
}

function parsePositiveInteger(value, fieldName, fallback = null) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    const error = new Error(`O campo "${fieldName}" deve ser um inteiro positivo.`);
    error.statusCode = 400;
    throw error;
  }

  return parsed;
}

function requiredPositiveInteger(value, fieldName) {
  const parsed = parsePositiveInteger(value, fieldName, null);

  if (parsed === null) {
    const error = new Error(`O campo "${fieldName}" deve ser um inteiro positivo.`);
    error.statusCode = 400;
    throw error;
  }

  return parsed;
}

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  return String(value).toLowerCase() === 'true';
}

function parseAutoSyncMode(value) {
  const normalized = optionalString(value, 20);

  if (!normalized) {
    return 'bootstrap';
  }

  if (['bootstrap', 'full', 'incremental'].includes(normalized)) {
    return normalized;
  }

  const error = new Error('O campo "autoSyncMode" deve ser "bootstrap", "full" ou "incremental".');
  error.statusCode = 400;
  throw error;
}

function parseProvider(value) {
  const normalized = optionalString(value, 20) || 'trier';

  if (['trier', 'alpha7', 'vetor', 'automatiza'].includes(normalized)) {
    return normalized;
  }

  const error = new Error('O campo "provider" deve ser "trier", "alpha7", "vetor" ou "automatiza".');
  error.statusCode = 400;
  throw error;
}

// Trier tenants all share the same cache Postgres - the server's own admin
// connection info, not something every caller needs to know and pass in.
// Alpha7 is different: host/user/password there is the CLIENT'S OWN real
// database, so it still has to come from the request body.
function resolveTrierCacheDbConnection() {
  if (!env.tenantDbAdminHost || !env.tenantDbAdminUser || !env.tenantDbAdminPassword) {
    const error = new Error(
      'TENANT_DB_ADMIN_HOST/TENANT_DB_ADMIN_USER/TENANT_DB_ADMIN_PASSWORD nao configurados no servidor.',
    );
    error.statusCode = 503;
    throw error;
  }

  return {
    host: env.tenantDbAdminHost,
    port: env.tenantDbAdminPort,
    user: env.tenantDbAdminUser,
    password: env.tenantDbAdminPassword,
    ssl: env.tenantDbAdminSsl,
  };
}

export function parseTenantInstancePayload(body = {}) {
  const provider = parseProvider(body.provider);
  const isTrier = provider === 'trier';
  const isAlpha7 = provider === 'alpha7';
  const isAutomatiza = provider === 'automatiza';
  const trierCacheDb = isTrier ? resolveTrierCacheDbConnection() : null;

  return {
    provider,
    name: requiredString(body.name, 'name', 120),
    // Sync-scheduling fields only mean anything for trier (the only provider
    // with a local cache DB kept in sync on a cron); null for alpha7/vetor
    // instead of silently filling them with trier defaults.
    trierInstance: isTrier ? optionalString(body.trierInstance ?? body.instance, 120) || 'sgfpod1' : null,
    trierBaseUrl: isTrier ? optionalString(body.trierBaseUrl, 255) || env.trierDefaultBaseUrl : null,
    providerToken: provider === 'trier' ? requiredString(body.trierToken, 'trierToken', 500) : provider === 'vetor' ? requiredString(body.vetorToken, 'vetorToken', 500) : '',
    host: isTrier ? trierCacheDb.host : isAlpha7 || isAutomatiza ? requiredString(body.host, 'host', 200) : optionalString(body.host, 200) || 'n/a',
    port: isTrier ? trierCacheDb.port : isAlpha7 ? parsePositiveInteger(body.port, 'port', 5432) : isAutomatiza ? parsePositiveInteger(body.port, 'port', 3306) : 0,
    database: isTrier || isAlpha7 || isAutomatiza ? requiredString(body.database, 'database', 120) : optionalString(body.database, 120) || 'n/a',
    user: isTrier ? trierCacheDb.user : isAlpha7 || isAutomatiza ? requiredString(body.user, 'user', 120) : optionalString(body.user, 120) || 'n/a',
    password: isTrier ? trierCacheDb.password : isAlpha7 || isAutomatiza ? requiredString(body.password, 'password', 200) : optionalString(body.password, 200) || 'n/a',
    ssl: isTrier ? trierCacheDb.ssl : parseBoolean(body.ssl, false),
    cacheSchema: isTrier ? optionalString(body.cacheSchema, 120) || 'trier_cache' : null,
    syncIncrementalCron: isTrier ? optionalString(body.syncIncrementalCron, 120) || '0 */2 * * *' : null,
    syncFullCron: isTrier ? optionalString(body.syncFullCron, 120) || '0 3 * * *' : null,
    vetorUnidade: provider === 'vetor' ? requiredString(body.unidade, 'unidade', 20) : null,
    automatizaShopId: provider === 'automatiza' ? parsePositiveInteger(body.shopId ?? body.shop_id, 'shopId') : null,
    autoSync: provider === 'trier' ? parseBoolean(body.autoSync, false) : false,
    autoSyncMode: parseAutoSyncMode(body.autoSyncMode),
    apiKey: optionalString(body.apiKey, 200),
    status: optionalString(body.status, 20) || 'active',
  };
}
