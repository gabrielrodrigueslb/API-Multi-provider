import { normalizeEan } from './tenantCatalogStore.js';

const cache = new Map();
const CACHE_MS = 5 * 60 * 1000;
const MAX_PARALLEL_REQUESTS = Number(process.env.DELIVERYPHARMACY_MAX_PARALLEL_REQUESTS) || 5;

// ponytail: hand-rolled pool instead of a dependency, N is small (batch of EANs per search)
async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function getItems(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload?.produtos || payload?.data || payload?.items) return payload.produtos ?? payload.data ?? payload.items;
  return payload ? [payload] : [];
}

function value(item, ...keys) {
  for (const key of keys) if (item?.[key] !== undefined && item[key] !== null) return item[key];
  return null;
}

async function fetchByEan(client, ean) {
  const key = `${client.id}:${client.deliveryCompanyId}:${client.deliveryErpId}:${ean}`;
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.items;

  const response = await fetch(`https://api.deliverypharmacy.com.br/v2/produto/ean/${ean}`, {
    headers: {
      'x-id-empresa': client.deliveryCompanyId,
      'x-id-erp': client.deliveryErpId,
      Authorization: `Bearer ${client.providerToken}`,
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (response.status === 404) {
    cache.set(key, { expiresAt: Date.now() + CACHE_MS, items: [] });
    return [];
  }
  if (!response.ok) {
    const error = new Error(`Delivery Pharmacy respondeu ${response.status}.`);
    error.statusCode = 502;
    throw error;
  }
  const items = getItems(await response.json());
  cache.set(key, { expiresAt: Date.now() + CACHE_MS, items });
  return items;
}

export async function fetchDeliveryPharmacyProductsByEan(client, eans) {
  const wanted = [...new Set(eans.map(normalizeEan).filter(Boolean))];
  const result = new Map();

  const items = (await mapWithConcurrency(wanted, MAX_PARALLEL_REQUESTS, (ean) => fetchByEan(client, ean))).flat();

  for (const item of items) {
    const ean = normalizeEan(value(item, 'ean', 'codigoBarras', 'codigo_barras'));
    if (!ean || !wanted.includes(ean)) continue;
    const price = Number(value(item, 'preco', 'price', 'valorVenda', 'valor'));
    const promo = Number(value(item, 'precoPromocional', 'price_promo', 'valorPromocao', 'valor_promocao'));
    result.set(ean, { ean, codigoProduto: value(item, 'id', 'codigo', 'product_id'), nome: value(item, 'nome', 'name', 'descricao', 'description'), valorVenda: Number.isFinite(price) ? price : null, estoque: Number(value(item, 'estoque', 'quantity')) || 0, melhorDesconto: Number.isFinite(promo) && promo < price ? promo : price, raw: item });
  }
  return result;
}
