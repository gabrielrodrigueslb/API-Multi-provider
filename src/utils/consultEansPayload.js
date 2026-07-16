import { env } from '../config/env.js';

function normalizeInputEan(value) {
  return String(value ?? '').trim();
}

function optionalInteger(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    const error = new Error('O campo "cadernoOfertaId" deve ser um inteiro positivo.');
    error.statusCode = 400;
    throw error;
  }

  return parsed;
}

function optionalPositiveInteger(value, fieldName) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    const error = new Error(`O campo "${fieldName}" deve ser um inteiro positivo.`);
    error.statusCode = 400;
    throw error;
  }

  return parsed;
}

export function parseConsultEansPayload(body = {}, options = {}) {
  if (body.client_key || body.client_database) {
    const error = new Error('Este endpoint nao aceita "client_key" nem "client_database".');
    error.statusCode = 400;
    throw error;
  }

  if (!Array.isArray(body.eans)) {
    const error = new Error('O campo "eans" deve ser um array nao vazio.');
    error.statusCode = 400;
    throw error;
  }

  if (body.eans.length === 0) {
    const error = new Error('O campo "eans" deve conter pelo menos um item.');
    error.statusCode = 400;
    throw error;
  }

  if (body.eans.length > env.maxEanBatchSize) {
    const error = new Error(`O campo "eans" excede o limite de ${env.maxEanBatchSize} itens.`);
    error.statusCode = 400;
    throw error;
  }

  const eans = body.eans.map((ean, index) => {
    if (typeof ean !== 'string') {
      const error = new Error(`O EAN na posicao ${index} deve ser uma string.`);
      error.statusCode = 400;
      throw error;
    }

    const normalized = normalizeInputEan(ean);

    if (!normalized) {
      const error = new Error(`O EAN na posicao ${index} e invalido.`);
      error.statusCode = 400;
      throw error;
    }

    return normalized;
  });

  const parsed = {
    eans,
    cadernoOfertaId: optionalInteger(body.cadernoOfertaId),
    unidadeNegocioId: optionalPositiveInteger(
      body.unidadeNegocioId ?? body.unidade_negocio_id,
      'unidadeNegocioId',
    ),
  };

  if (options.requireUnidadeNegocioId && parsed.unidadeNegocioId === null) {
    const error = new Error('O campo "unidadeNegocioId" e obrigatorio para consultas Alpha7.');
    error.statusCode = 400;
    throw error;
  }

  return parsed;
}
