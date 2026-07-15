import { normalizeEan } from './clientProductService.js';

const DEFAULT_BASE_URL = 'https://integracao.zetti.dev/api/ecommerce/produtos/consulta';
const DEFAULT_TIMEOUT_MS = 30000;
// OData $filter URLs grow fast with an "or" per EAN; keep chunks small
// enough to stay well under typical URL length limits.
const EANS_PER_REQUEST = 25;

function buildAuthorization(token) {
  const trimmed = String(token || '').trim();
  if (!trimmed) {
    const error = new Error('A instancia Vetor nao possui token configurado.');
    error.statusCode = 400;
    throw error;
  }

  return /^apikey\s+/i.test(trimmed) ? trimmed : `ApiKey ${trimmed}`;
}

function chunk(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function escapeODataString(value) {
  return String(value).replace(/'/g, "''");
}

function buildUrl(baseUrl, unidade, eans) {
  const url = new URL(baseUrl);
  const eanFilter = eans
    .map((ean) => `codigoBarras eq '${escapeODataString(ean)}'`)
    .join(' or ');

  const filters = ['inativo eq false', `(${eanFilter})`];
  if (unidade) {
    filters.push(`cdFilial eq ${unidade}`);
  }

  url.searchParams.set('$filter', filters.join(' and '));
  url.searchParams.set('$top', '500');
  return url;
}

async function fetchChunk(baseUrl, authorization, unidade, eans, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(buildUrl(baseUrl, unidade, eans), {
      method: 'GET',
      headers: {
        accept: 'application/json',
        authorization,
      },
      signal: controller.signal,
    });

    const bodyText = await response.text();
    const body = bodyText ? JSON.parse(bodyText) : null;

    if (!response.ok || Number(body?.status) >= 400) {
      const message = String(body?.msg || '').trim();
      const error = new Error(
        message ? `Falha na API Vetor: ${message}` : `Falha na API Vetor: HTTP ${response.status}`,
      );
      error.statusCode = response.status >= 400 && response.status < 500 ? 502 : 502;
      throw error;
    }

    return Array.isArray(body?.data) ? body.data : [];
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Live EAN lookup against the Vetor product API (no local cache - this
 * queries Vetor directly on every call, unlike Trier's cached-catalog path).
 * Returns a Map<normalizedEan, vetorProduct> mirroring the shape
 * fetchClientProductsByEan uses for Alpha7.
 */
export async function fetchVetorProductsByEan(clientConfig, eans = []) {
  const authorization = buildAuthorization(clientConfig.trierToken);
  const baseUrl = clientConfig.vetorBaseUrl || DEFAULT_BASE_URL;
  const timeoutMs = clientConfig.vetorTimeoutMs || DEFAULT_TIMEOUT_MS;

  const cleanEans = Array.from(new Set((eans || []).filter(Boolean).map((ean) => String(ean).trim())));
  if (cleanEans.length === 0) {
    return new Map();
  }

  const batches = chunk(cleanEans, EANS_PER_REQUEST);
  const results = await Promise.all(
    batches.map((batch) => fetchChunk(baseUrl, authorization, clientConfig.vetorUnidade, batch, timeoutMs)),
  );

  const map = new Map();
  for (const products of results) {
    for (const product of products) {
      const normalizedEan = normalizeEan(product.codigoBarras);
      if (!normalizedEan) {
        continue;
      }

      map.set(normalizedEan, {
        ean: product.codigoBarras,
        nome: product.descricao || product.descricaoUsual || null,
        estoque: Number.isFinite(Number(product.qtdEstoque)) ? Number(product.qtdEstoque) : 0,
        vlrTabela: Number.isFinite(Number(product.vlrTabela)) ? Number(product.vlrTabela) : null,
        vlrOferta: Number.isFinite(Number(product.vlrOferta)) ? Number(product.vlrOferta) : null,
        percDesconto: Number.isFinite(Number(product.percDesconto)) ? Number(product.percDesconto) : 0,
        ativo: product.inativo === false,
      });
    }
  }

  return map;
}

export const _internals = {
  buildUrl,
  buildAuthorization,
  chunk,
};
