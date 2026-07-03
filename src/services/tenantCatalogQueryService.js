import { fetchCatalogByEans, normalizeEan } from './tenantCatalogStore.js';

function pickDiscountMetric(payload = {}) {
  const candidates = [
    payload.valorPromocao,
    payload.precooferta,
    payload.valorVenda,
    payload.percentualDesconto,
    payload.percentualDescontoMax,
  ];

  for (const candidate of candidates) {
    const value = Number(candidate);
    if (Number.isFinite(value)) {
      return value;
    }
  }

  return null;
}

function formatDiscount(row) {
  const payload = row.payload || {};

  return {
    tipo: row.discount_type,
    chave: row.source_key,
    produtoCodigo: row.product_code,
    ean: row.ean,
    nomeProduto: row.product_name,
    dataInicio: row.starts_at ? new Date(row.starts_at).toISOString() : null,
    dataFim: row.ends_at ? new Date(row.ends_at).toISOString() : null,
    valorReferencia: pickDiscountMetric(payload),
  };
}

function isDiscountActiveNow(discount, now = Date.now()) {
  const startsAt = discount.dataInicio ? new Date(discount.dataInicio).getTime() : null;
  const endsAt = discount.dataFim ? new Date(discount.dataFim).getTime() : null;

  if (startsAt !== null && startsAt > now) {
    return false;
  }

  if (endsAt !== null && endsAt < now) {
    return false;
  }

  return true;
}

function groupDiscounts(discounts = []) {
  const byEan = new Map();
  const byCode = new Map();

  for (const row of discounts) {
    const formatted = formatDiscount(row);

    if (row.ean_normalized) {
      if (!byEan.has(row.ean_normalized)) {
        byEan.set(row.ean_normalized, []);
      }

      byEan.get(row.ean_normalized).push(formatted);
    }

    if (row.product_code) {
      if (!byCode.has(row.product_code)) {
        byCode.set(row.product_code, []);
      }

      byCode.get(row.product_code).push(formatted);
    }
  }

  return { byEan, byCode };
}

function buildBestDiscount(discounts = [], fallbackValue) {
  const numericValues = discounts.map((discount) => discount.valorReferencia).filter(Number.isFinite);

  if (numericValues.length === 0) {
    return fallbackValue ?? null;
  }

  return Math.min(...numericValues);
}

export async function consultTenantCatalogByEans(tenant, eans = []) {
  const now = Date.now();
  const requested = eans.map((ean) => ({
    original: String(ean).trim(),
    normalized: normalizeEan(ean),
  }));
  const { products, discounts } = await fetchCatalogByEans(tenant, eans);
  const discountsByRef = groupDiscounts(discounts);
  const productsByEan = new Map(products.map((row) => [row.ean_normalized, row]));

  const orderedProducts = requested
    .map((item) => {
      const product = productsByEan.get(item.normalized);
      if (!product) {
        return null;
      }

      const productDiscounts = [
        ...(discountsByRef.byEan.get(product.ean_normalized) || []),
        ...(discountsByRef.byCode.get(product.product_code) || []),
      ].filter(
        (discount, index, array) =>
          array.findIndex((candidate) => candidate.tipo === discount.tipo && candidate.chave === discount.chave) === index &&
          isDiscountActiveNow(discount, now),
      );

      return {
        ean: product.ean,
        codigoProduto: product.product_code,
        nome: product.name,
        valorVenda: product.value_sale === null ? null : Number(product.value_sale),
        estoque: product.stock_quantity === null ? 0 : Number(product.stock_quantity),
        ativo: product.is_active,
        melhorDesconto: buildBestDiscount(productDiscounts, product.value_sale === null ? null : Number(product.value_sale)),
        descontos: productDiscounts,
      };
    })
    .filter(Boolean);

  return {
    produtos: orderedProducts,
  };
}

export const _internals = {
  buildBestDiscount,
  isDiscountActiveNow,
  pickDiscountMetric,
};
