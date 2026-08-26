import { fetchCatalogByEans, normalizeEan } from './tenantCatalogStore.js';

function pickDiscountMetric(payload = {}) {
  const candidates = [
    payload.valorPromocao,
    payload.precooferta,
  ];

  for (const candidate of candidates) {
    const value = Number(candidate);
    if (Number.isFinite(value)) {
      return value;
    }
  }

  return null;
}

function pickDiscountPercent(payload = {}) {
  const candidates = [payload.percentualDescontoMax, payload.percentualDesconto];

  for (const candidate of candidates) {
    const value = Number(candidate);
    if (Number.isFinite(value) && value > 0) {
      return value;
    }
  }

  return null;
}

function roundCurrency(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function calculateDiscountedValue(valueSale, discountPercent) {
  const price = Number(valueSale);
  const percent = Number(discountPercent);

  if (!Number.isFinite(price) || price < 0 || !Number.isFinite(percent) || percent <= 0 || percent > 100) {
    return null;
  }

  return roundCurrency(price * (1 - percent / 100));
}

function calculateAppliedDiscountPercent(valueSale, discountedValue) {
  const price = Number(valueSale);
  const value = Number(discountedValue);

  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(value) || value >= price) {
    return null;
  }

  return roundCurrency((1 - value / price) * 100);
}

function getDiscountValue(payload, valueSale) {
  const monetaryValue = pickDiscountMetric(payload);
  const percentageValue = calculateDiscountedValue(valueSale, pickDiscountPercent(payload));
  const candidates = [monetaryValue, percentageValue].filter(Number.isFinite);

  return candidates.length ? Math.min(...candidates) : null;
}

function formatDiscount(row, valueSale) {
  const payload = row.payload || {};
  const valorReferencia = getDiscountValue(payload, valueSale);

  return {
    tipo: row.discount_type,
    chave: row.source_key,
    produtoCodigo: row.product_code,
    ean: row.ean,
    nomeProduto: row.product_name,
    dataInicio: row.starts_at ? new Date(row.starts_at).toISOString() : null,
    dataFim: row.ends_at ? new Date(row.ends_at).toISOString() : null,
    valorReferencia,
    percentualDesconto: pickDiscountPercent(payload),
    percentualAplicado: calculateAppliedDiscountPercent(valueSale, valorReferencia),
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

function groupDiscounts(discounts = [], productsByCode = new Map()) {
  const byEan = new Map();
  const byCode = new Map();

  for (const row of discounts) {
    const product = productsByCode.get(row.product_code);
    const formatted = formatDiscount(row, product?.value_sale);

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
  const numericValues = [
    ...discounts.map((discount) => discount.valorReferencia),
    fallbackValue,
  ].filter(Number.isFinite);

  if (numericValues.length === 0) {
    return null;
  }

  return Math.min(...numericValues);
}

function getBestDiscount(discounts = [], fallbackValue) {
  const discountsWithValue = discounts.filter((discount) => Number.isFinite(discount.valorReferencia));

  if (discountsWithValue.length === 0) {
    return null;
  }

  const bestValue = buildBestDiscount(discountsWithValue, fallbackValue);
  return discountsWithValue.find((discount) => discount.valorReferencia === bestValue) || null;
}

function getMaximumDiscountPercent(productPayload = {}, discounts = []) {
  const percentages = [
    pickDiscountPercent(productPayload),
    ...discounts.map((discount) => discount.percentualDesconto),
  ].filter(Number.isFinite);

  return percentages.length ? Math.max(...percentages) : null;
}

export async function consultTenantCatalogByEans(tenant, eans = []) {
  const now = Date.now();
  const requested = eans.map((ean) => ({
    original: String(ean).trim(),
    normalized: normalizeEan(ean),
  }));
  const { products, discounts } = await fetchCatalogByEans(tenant, eans);
  const productsByEan = new Map(products.map((row) => [row.ean_normalized, row]));
  const productsByCode = new Map(products.map((row) => [row.product_code, row]));
  const discountsByRef = groupDiscounts(discounts, productsByCode);

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
      const valueSale = product.value_sale === null ? null : Number(product.value_sale);
      const bestDiscount = getBestDiscount(productDiscounts, valueSale);

      return {
        ean: product.ean,
        codigoProduto: product.product_code,
        nome: product.name,
        valorVenda: valueSale,
        estoque: product.stock_quantity === null ? 0 : Number(product.stock_quantity),
        ativo: product.is_active,
        melhorDesconto: bestDiscount?.valorReferencia ?? valueSale,
        percentualMelhorDesconto: bestDiscount?.percentualAplicado ?? null,
        percentualDescontoMax: getMaximumDiscountPercent(product.payload, productDiscounts),
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
  pickDiscountPercent,
  calculateDiscountedValue,
  calculateAppliedDiscountPercent,
  getDiscountValue,
  getBestDiscount,
  getMaximumDiscountPercent,
};
