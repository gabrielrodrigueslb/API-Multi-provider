import { normalizeEan } from './tenantCatalogStore.js';

const cache = new Map();
const CACHE_MS = 5 * 60 * 1000;

function getItems(payload) {
  if (Array.isArray(payload)) return payload;
  return payload?.produtos ?? payload?.data ?? payload?.items ?? [];
}

function value(item, ...keys) {
  for (const key of keys) if (item?.[key] !== undefined && item[key] !== null) return item[key];
  return null;
}

async function loadCatalog(client) {
  const key = `${client.id}:${client.deliveryCompanyId}:${client.deliveryErpId}`;
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.items;

  const response = await fetch('https://api.deliverypharmacy.com.br/v2/produto', {
    headers: {
      'x-id-empresa': client.deliveryCompanyId,
      'x-id-erp': client.deliveryErpId,
      Authorization: `Bearer ${client.providerToken}`,
    },
    signal: AbortSignal.timeout(180_000),
  });
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
  const wanted = new Set(eans.map(normalizeEan).filter(Boolean));
  const result = new Map();
  for (const item of await loadCatalog(client)) {
    const ean = normalizeEan(value(item, 'ean', 'codigoBarras', 'codigo_barras'));
    if (!ean || !wanted.has(ean)) continue;
    const price = Number(value(item, 'preco', 'price', 'valorVenda'));
    const promo = Number(value(item, 'precoPromocional', 'price_promo', 'valorPromocao'));
    result.set(ean, { ean, codigoProduto: value(item, 'id', 'codigo', 'product_id'), nome: value(item, 'nome', 'name', 'descricao', 'description'), valorVenda: Number.isFinite(price) ? price : null, estoque: Number(value(item, 'estoque', 'quantity')) || 0, melhorDesconto: Number.isFinite(promo) && promo < price ? promo : price, raw: item });
  }
  return result;
}
