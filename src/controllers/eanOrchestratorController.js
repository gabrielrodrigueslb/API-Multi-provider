import { consultProductsByEan } from '../services/eanOrchestratorService.js';
import { parseConsultEansPayload } from '../utils/consultEansPayload.js';

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
    const payload = parseConsultEansPayload(request.body);
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
