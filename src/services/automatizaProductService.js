import { getAutomatizaDatabasePool } from '../config/automatizaDatabase.js';
import { logger } from '../config/logger.js';
import { normalizeEan } from './clientProductService.js';

function toNumberOrNull(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildAutomatizaProductMap(rows) {
  const map = new Map();

  for (const row of rows) {
    const normalizedEan = normalizeEan(row.ean);
    if (!normalizedEan) {
      continue;
    }

    const price = toNumberOrNull(row.price);
    const promoPrice = toNumberOrNull(row.price_promo);
    const melhorPreco = promoPrice !== null && price !== null && promoPrice < price ? promoPrice : price ?? promoPrice;

    map.set(normalizedEan, {
      ean: row.ean,
      product_id: Number(row.product_id),
      title: row.title ?? null,
      description: row.Description ?? null,
      quantity: Number.isFinite(Number(row.quantity)) ? Number(row.quantity) : 0,
      price,
      price_promo: promoPrice,
      melhor_preco: melhorPreco,
      category: row.category ?? null,
      group: row.group ?? null,
      subgroup: row.subgroup ?? null,
      brand: row.brand ?? null,
      image_link: row.image_link ?? null,
      ncm: row.ncm ?? null,
      laboratorio: row.laboratorio ?? null,
      drug_is_generic: Boolean(row.drug_is_generic),
      retencaoreceita: row.retencaoreceita ?? null,
      shop_id: Number(row.shop_id),
    });
  }

  return map;
}

export async function fetchAutomatizaProductsByEan(clientConfig, eans = []) {
  const cleanEans = Array.from(new Set((eans || []).filter(Boolean).map((ean) => String(ean).trim())));
  const normalizedEans = Array.from(new Set(cleanEans.map((ean) => normalizeEan(ean)).filter(Boolean)));

  if (normalizedEans.length === 0) {
    return new Map();
  }

  if (!Number.isInteger(Number(clientConfig.automatizaShopId)) || Number(clientConfig.automatizaShopId) <= 0) {
    const error = new Error('A instancia Automatiza nao possui shopId configurado.');
    error.statusCode = 400;
    throw error;
  }

  const pool = getAutomatizaDatabasePool(clientConfig);
  const placeholders = normalizedEans.map(() => '?').join(', ');
  const sql = `
    select
      product_id,
      ean,
      title,
      Description,
      shop_id,
      price,
      price_promo,
      quantity,
      category,
      \`group\`,
      subgroup,
      brand,
      image_link,
      ncm,
      laboratorio,
      drug_is_generic,
      retencaoreceita
    from view_unicocontato_produto
    where shop_id = ?
      and ean is not null
      and trim(ean) <> ''
      and ean in (${placeholders})
  `;

  logger.debug(
    {
      client: clientConfig.name ?? clientConfig.database,
      host: clientConfig.host,
      port: clientConfig.port,
      database: clientConfig.database,
      shopId: Number(clientConfig.automatizaShopId),
      eans: cleanEans,
    },
    'Executando consulta Automatiza por EAN',
  );

  const [rows] = await pool.query(sql, [Number(clientConfig.automatizaShopId), ...normalizedEans]);
  return buildAutomatizaProductMap(rows);
}

export const _internals = {
  buildAutomatizaProductMap,
};
