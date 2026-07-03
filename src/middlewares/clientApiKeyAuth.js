import { resolveClientDatabaseConfigByApiKey } from '../config/clientDatabase.js';
import { findTenantInstanceByApiKey } from '../repositories/tenantInstanceRepository.js';
import { logger } from '../config/logger.js';

export function extractProvidedApiKey(headers = {}) {
  const authorization = headers.authorization;
  const bearerToken =
    typeof authorization === 'string' ? authorization.replace(/^Bearer\s+/i, '').trim() : '';
  const apiKeyHeader = headers['x-api-key'];
  const headerToken = Array.isArray(apiKeyHeader) ? apiKeyHeader[0] : apiKeyHeader;

  return String(bearerToken || headerToken || '').trim();
}

export async function authenticateClientApiKey(request, response, next) {
  try {
    const apiKey = extractProvidedApiKey(request.headers);
    const envClientDatabase = apiKey ? resolveClientDatabaseConfigByApiKey(apiKey) : null;
    const clientDatabase = envClientDatabase || (apiKey ? await _internals.lookupTenantByApiKey(apiKey) : null);

    if (clientDatabase) {
      logger.debug({ client: clientDatabase.name ?? clientDatabase.database }, 'API key autenticada');
      request.clientApiKey = apiKey;
      request.clientDatabase = clientDatabase;
      next();
      return;
    }

    logger.warn({ url: request.url, hasKey: Boolean(apiKey) }, 'Requisicao sem API key valida — 401');
    response.status(401).json({
      status: 'error',
      message: 'Nao autorizado.',
    });
  } catch (error) {
    next(error);
  }
}

export const _internals = {
  extractProvidedApiKey,
  lookupTenantByApiKey: findTenantInstanceByApiKey,
};
