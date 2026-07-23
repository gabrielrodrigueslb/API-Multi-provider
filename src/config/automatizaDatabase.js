import crypto from 'node:crypto';
import mysql from 'mysql2/promise';
import { logger } from './logger.js';

const poolCache = new Map();

function normalizeSsl(value, fallback = false) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  return String(value).toLowerCase() === 'true';
}

function assertConnectionConfig(connection) {
  const requiredFields = ['host', 'port', 'database', 'user', 'password'];

  for (const field of requiredFields) {
    if (!connection[field]) {
      const error = new Error(`Configuracao do banco Automatiza invalida: campo "${field}" e obrigatorio.`);
      error.statusCode = 400;
      throw error;
    }
  }
}

function buildPoolKey(connection) {
  const base = JSON.stringify({
    host: connection.host,
    port: connection.port,
    database: connection.database,
    user: connection.user,
    password: connection.password,
    ssl: normalizeSsl(connection.ssl, false),
  });

  return crypto.createHash('sha1').update(base).digest('hex');
}

export function getAutomatizaDatabasePool(connection) {
  assertConnectionConfig(connection);

  const key = buildPoolKey(connection);

  if (poolCache.has(key)) {
    return poolCache.get(key);
  }

  logger.debug({ host: connection.host, database: connection.database }, 'Criando pool MySQL para cliente Automatiza');

  const pool = mysql.createPool({
    host: connection.host,
    port: connection.port,
    database: connection.database,
    user: connection.user,
    password: connection.password,
    ssl: normalizeSsl(connection.ssl, false) ? {} : undefined,
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0,
    enableKeepAlive: true,
  });

  poolCache.set(key, pool);
  return pool;
}
