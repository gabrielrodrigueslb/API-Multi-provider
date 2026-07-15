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

  if (['trier', 'alpha7', 'vetor'].includes(normalized)) {
    return normalized;
  }

  const error = new Error('O campo "provider" deve ser "trier", "alpha7" ou "vetor".');
  error.statusCode = 400;
  throw error;
}

export function parseTenantInstancePayload(body = {}) {
  const provider = parseProvider(body.provider);

  return {
    provider,
    name: requiredString(body.name, 'name', 120),
    trierInstance: optionalString(body.trierInstance ?? body.instance, 120) || 'sgfpod1',
    trierBaseUrl: optionalString(body.trierBaseUrl, 255) || env.trierDefaultBaseUrl,
    trierToken: provider === 'trier' ? requiredString(body.trierToken, 'trierToken', 500) : provider === 'vetor' ? requiredString(body.vetorToken, 'vetorToken', 500) : '',
    host: requiredString(body.host, 'host', 200),
    port: parsePositiveInteger(body.port, 'port', 5432),
    database: requiredString(body.database, 'database', 120),
    user: requiredString(body.user, 'user', 120),
    password: requiredString(body.password, 'password', 200),
    ssl: parseBoolean(body.ssl, false),
    cacheSchema: optionalString(body.cacheSchema, 120) || 'trier_cache',
    syncIncrementalCron: optionalString(body.syncIncrementalCron, 120) || '0 */2 * * *',
    syncFullCron: optionalString(body.syncFullCron, 120) || '0 3 * * *',
    autoSync: provider === 'trier' ? parseBoolean(body.autoSync, false) : false,
    autoSyncMode: parseAutoSyncMode(body.autoSyncMode),
    apiKey: optionalString(body.apiKey, 200),
    status: optionalString(body.status, 20) || 'active',
  };
}
