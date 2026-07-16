import { consultProductsByEan } from '../services/eanOrchestratorService.js';
import { parseConsultEansPayload } from '../utils/consultEansPayload.js';
import { logger } from '../config/logger.js';

function ensureClientProvider(request, provider) {
  if (request.clientDatabase?.provider === provider) {
    return;
  }

  const error = new Error(`A API key informada nao pertence a um cliente ${provider}.`);
  error.statusCode = 403;
  throw error;
}

async function consultEansByProvider(request, response, next, provider) {
  try {
    ensureClientProvider(request, provider);
    const payload = parseConsultEansPayload(request.body, {
      requireUnidadeNegocioId: provider === 'alpha7',
    });

    logger.debug(
      {
        provider,
        client: request.clientDatabase?.name ?? request.clientDatabase?.database,
        host: request.clientDatabase?.host,
        port: request.clientDatabase?.port,
        database: request.clientDatabase?.database,
        unidadeNegocioId: payload.unidadeNegocioId ?? null,
        eans: payload.eans,
      },
      'Payload de consulta recebido',
    );

    const result = await consultProductsByEan(request.clientDatabase, payload);

    response.status(200).json({
      status: 'ok',
      ...result,
    });
  } catch (error) {
    next(error);
  }
}

export async function consultTrierEansController(request, response, next) {
  return consultEansByProvider(request, response, next, 'trier');
}

export async function consultAlpha7EansController(request, response, next) {
  return consultEansByProvider(request, response, next, 'alpha7');
}

export async function consultVetorEansController(request, response, next) {
  return consultEansByProvider(request, response, next, 'vetor');
}
