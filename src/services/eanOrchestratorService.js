import { normalizeEan } from './tenantCatalogStore.js';
import { consultTenantCatalogByEans } from './tenantCatalogQueryService.js';
import { logger } from '../config/logger.js';

function dedupeEansPreservingOrder(eans = []) {
  const seen = new Set();
  const ordered = [];

  for (const ean of eans) {
    const normalized = normalizeEan(ean);
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    ordered.push({
      original: String(ean).trim(),
      normalized,
    });
  }

  return ordered;
}

export async function consultProductsByEan(clientConfig, payload = {}) {
  const orderedEans = dedupeEansPreservingOrder(payload.eans || []);

  logger.debug(
    {
      client: clientConfig.name ?? clientConfig.database,
      eanCount: orderedEans.length,
    },
    'Iniciando consulta de EANs',
  );

  const start = Date.now();

  const result = await consultTenantCatalogByEans(
    clientConfig,
    orderedEans.map((item) => item.original),
  );

  logger.info(
    {
      client: clientConfig.name ?? clientConfig.database,
      eansSolicitados: orderedEans.length,
      produtosEncontrados: result.produtos.length,
      ms: Date.now() - start,
    },
    'Consulta de EANs concluida',
  );

  return result;
}

export const _internals = {
  dedupeEansPreservingOrder,
};
