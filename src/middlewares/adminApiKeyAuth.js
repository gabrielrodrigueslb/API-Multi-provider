import { env } from '../config/env.js';
import { extractProvidedApiKey } from './clientApiKeyAuth.js';

export function authenticateAdminApiKey(request, response, next) {
  const apiKey = extractProvidedApiKey(request.headers);

  if (env.adminApiKey && apiKey === env.adminApiKey) {
    next();
    return;
  }

  response.status(401).json({
    status: 'error',
    message: 'Nao autorizado.',
  });
}
