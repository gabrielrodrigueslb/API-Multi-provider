import { env } from '../config/env.js';

const DEFAULT_PAGE_SIZE = 200;

function normalizeBaseUrl(value) {
  const normalized = String(value || '').trim().replace(/\/+$/, '');

  if (!normalized) {
    const error = new Error('A instancia nao possui "trierBaseUrl" configurada.');
    error.statusCode = 400;
    throw error;
  }

  return normalized;
}

function buildHeaders(tenant) {
  return {
    Accept: 'application/json',
    Authorization: `Bearer ${tenant.trierToken}`,
  };
}

function extractItems(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  const candidates = [
    payload?.data,
    payload?.items,
    payload?.content,
    payload?.results,
    payload?.result,
    payload?.registros,
    payload?.lista,
    payload?.retorno,
  ];

  return candidates.find(Array.isArray) || [];
}

function extractTotal(payload) {
  const candidates = [
    payload?.total,
    payload?.count,
    payload?.totalRegistros,
    payload?.quantidadeRegistros,
    payload?.pagination?.total,
  ];

  const total = candidates.find((value) => Number.isFinite(Number(value)));
  return total === undefined ? null : Number(total);
}

function toIsoDate(value) {
  return new Date(value).toISOString();
}

async function requestJson(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.trierTimeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text();
      const error = new Error(`Falha ao consultar Trier (${response.status}): ${body.slice(0, 500)}`);
      error.statusCode = 502;
      throw error;
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      const text = await response.text();
      const error = new Error(`Resposta inesperada da Trier: ${text.slice(0, 500)}`);
      error.statusCode = 502;
      throw error;
    }

    return response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchPagedResource(tenant, path, params = {}, options = {}) {
  const baseUrl = normalizeBaseUrl(tenant.trierBaseUrl);
  const items = [];
  const pageSize = Number(params.quantidadeRegistros || env.trierPageSize || DEFAULT_PAGE_SIZE);
  let primeiroRegistro = Number(params.primeiroRegistro || 0);
  let total = null;
  let pages = 0;
  let itemCount = 0;

  while (true) {
    const search = new URLSearchParams();
    search.set('primeiroRegistro', String(primeiroRegistro));
    search.set('quantidadeRegistros', String(pageSize));

    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null || value === '') {
        continue;
      }

      if (key === 'primeiroRegistro' || key === 'quantidadeRegistros') {
        continue;
      }

      search.set(key, String(value));
    }

    const url = `${baseUrl}${path}?${search.toString()}`;
    const payload = await requestJson(url, {
      method: 'GET',
      headers: buildHeaders(tenant),
    });

    const pageItems = extractItems(payload);
    pages += 1;
    itemCount += pageItems.length;

    if (typeof options.onPage === 'function') {
      await options.onPage(pageItems, {
        primeiroRegistro,
        pageSize,
        pages,
        itemCount,
      });
    } else {
      items.push(...pageItems);
    }

    total = extractTotal(payload);

    if (total !== null && items.length >= total) {
      break;
    }

    if (pageItems.length < pageSize) {
      break;
    }

    primeiroRegistro += pageSize;
  }

  return {
    items,
    pages,
    itemCount,
  };
}

export const TRIER_DISCOUNT_RESOURCES = [
  {
    type: 'precificacao',
    fullPath: '/rest/integracao/produto/precificacao/obter-todos-v1',
    alteredPath: '/rest/integracao/produto/precificacao/obter-alterados-v1',
    query: { removerRestricaoEstoque: env.trierRemoveStockRestriction },
  },
  {
    type: 'vigencia',
    fullPath: '/rest/integracao/produto/desconto/vigencia/obter-todos-v1',
    alteredPath: '/rest/integracao/produto/desconto/vigencia/obter-alterados-v1',
    query: { removerRestricaoEstoque: env.trierRemoveStockRestriction },
  },
  {
    type: 'melhor',
    fullPath: '/rest/integracao/produto/desconto/melhor/obter-todos-v1',
    alteredPath: '/rest/integracao/produto/desconto/melhor/obter-alterados-v1',
    query: { removerRestricaoEstoque: env.trierRemoveStockRestriction },
  },
  {
    type: 'progressivo',
    fullPath: '/rest/integracao/produto/desconto/progressivo/obter-todos-v2',
    alteredPath: '/rest/integracao/produto/desconto/progressivo/obter-alterados-v2',
    query: { removerRestricaoEstoque: env.trierRemoveStockRestriction },
  },
  {
    type: 'encarte',
    fullPath: '/rest/integracao/produto/desconto/encarte/obter-todos-v1',
    alteredPath: '/rest/integracao/produto/desconto/encarte/obter-alterados-v1',
  },
  {
    type: 'condicao_pagamento',
    fullPath: '/rest/integracao/produto/desconto/condicao-pagamento/obter-todos-v1',
    alteredPath: '/rest/integracao/produto/desconto/condicao-pagamento/obter-alterados-v1',
    query: { removerRestricaoEstoque: env.trierRemoveStockRestriction },
  },
  {
    type: 'empresa_grupo_produto',
    fullPath: '/rest/integracao/produto/desconto/empresa-grupo-produto/obter-todos-v1',
    alteredPath: '/rest/integracao/produto/desconto/empresa-grupo-produto/obter-alterados-v1',
  },
  {
    type: 'parceiro_produto',
    fullPath: '/rest/integracao/produto/desconto/parceiro/obter-todos-v1',
    alteredPath: '/rest/integracao/produto/desconto/parceiro/obter-alterados-v1',
    query: { removerRestricaoEstoque: env.trierRemoveStockRestriction },
  },
];

export async function fetchAllProducts(tenant) {
  const result = await fetchPagedResource(tenant, '/rest/integracao/produto/obter-todos-v1', {
    processaCustoMedio: false,
  });
  return result.items;
}

export async function fetchAllProductsPaged(tenant, options = {}) {
  return fetchPagedResource(
    tenant,
    '/rest/integracao/produto/obter-todos-v1',
    {
      processaCustoMedio: false,
    },
    options,
  );
}

export async function fetchChangedProducts(tenant, windowStart, windowEnd) {
  const result = await fetchPagedResource(tenant, '/rest/integracao/produto/obter-alterados-v1', {
    dataInicial: toIsoDate(windowStart),
    dataFinal: toIsoDate(windowEnd),
    processaCustoMedio: false,
  });
  return result.items;
}

export async function fetchChangedProductsPaged(tenant, windowStart, windowEnd, options = {}) {
  return fetchPagedResource(
    tenant,
    '/rest/integracao/produto/obter-alterados-v1',
    {
      dataInicial: toIsoDate(windowStart),
      dataFinal: toIsoDate(windowEnd),
      processaCustoMedio: false,
    },
    options,
  );
}

export async function fetchAllStocks(tenant) {
  const result = await fetchPagedResource(tenant, '/rest/integracao/estoque/obter-todos-v1', {});
  return result.items;
}

export async function fetchAllStocksPaged(tenant, options = {}) {
  return fetchPagedResource(tenant, '/rest/integracao/estoque/obter-todos-v1', {}, options);
}

export async function fetchChangedStocks(tenant, windowStart, windowEnd) {
  const result = await fetchPagedResource(tenant, '/rest/integracao/estoque/obter-alterados-v1', {
    dataInicial: toIsoDate(windowStart),
    dataFinal: toIsoDate(windowEnd),
  });
  return result.items;
}

export async function fetchChangedStocksPaged(tenant, windowStart, windowEnd, options = {}) {
  return fetchPagedResource(
    tenant,
    '/rest/integracao/estoque/obter-alterados-v1',
    {
      dataInicial: toIsoDate(windowStart),
      dataFinal: toIsoDate(windowEnd),
    },
    options,
  );
}

export async function fetchAllDiscounts(tenant, resource) {
  const result = await fetchPagedResource(tenant, resource.fullPath, resource.query || {});
  return result.items;
}

export async function fetchAllDiscountsPaged(tenant, resource, options = {}) {
  return fetchPagedResource(tenant, resource.fullPath, resource.query || {}, options);
}

export async function fetchChangedDiscounts(tenant, resource, windowStart, windowEnd) {
  const result = await fetchPagedResource(tenant, resource.alteredPath, {
    ...(resource.query || {}),
    dataInicial: toIsoDate(windowStart),
    dataFinal: toIsoDate(windowEnd),
  });
  return result.items;
}

export async function fetchChangedDiscountsPaged(tenant, resource, windowStart, windowEnd, options = {}) {
  return fetchPagedResource(
    tenant,
    resource.alteredPath,
    {
      ...(resource.query || {}),
      dataInicial: toIsoDate(windowStart),
      dataFinal: toIsoDate(windowEnd),
    },
    options,
  );
}

export const _internals = {
  extractItems,
  extractTotal,
  normalizeBaseUrl,
};
