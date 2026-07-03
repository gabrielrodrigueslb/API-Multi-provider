import { consultProductsByEan } from '../services/eanOrchestratorService.js';
import { parseConsultEansPayload } from '../utils/consultEansPayload.js';

export async function consultEansController(request, response, next) {
  try {
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
