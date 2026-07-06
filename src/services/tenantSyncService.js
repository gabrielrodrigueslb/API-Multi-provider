import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import {
  fetchAllDiscountsPaged,
  fetchAllProductsPaged,
  fetchAllStocksPaged,
  fetchChangedDiscountsPaged,
  fetchChangedProductsPaged,
  fetchChangedStocksPaged,
  TRIER_DISCOUNT_RESOURCES,
} from './trierApiClient.js';
import {
  pruneFullSyncArtifacts,
  provisionTenantCatalog,
  updateTenantSyncState,
  upsertDiscounts,
  upsertProducts,
  upsertStocks,
} from './tenantCatalogStore.js';
import {
  findTenantInstanceById,
  updateTenantSyncTimestamps,
} from '../repositories/tenantInstanceRepository.js';

function buildWindow(tenant, mode) {
  const end = new Date();

  if (mode === 'full' || mode === 'bootstrap') {
    return {
      start: null,
      end,
    };
  }

  const latest = tenant.lastIncrementalSyncAt
    ? new Date(tenant.lastIncrementalSyncAt)
    : new Date(Date.now() - env.syncIncrementalFallbackHours * 60 * 60 * 1000);

  return {
    start: latest,
    end,
  };
}

async function syncFullCatalog(tenant, syncBatchId) {
  await fetchAllProductsPaged(tenant, {
    onPage: async (products) => {
      await upsertProducts(tenant, products, syncBatchId);
    },
  });

  await fetchAllStocksPaged(tenant, {
    onPage: async (stocks) => {
      await upsertStocks(tenant, stocks, syncBatchId);
    },
  });

  for (const resource of TRIER_DISCOUNT_RESOURCES) {
    await fetchAllDiscountsPaged(tenant, resource, {
      onPage: async (discounts) => {
        await upsertDiscounts(tenant, resource.type, discounts, syncBatchId);
      },
    });
  }

  await pruneFullSyncArtifacts(tenant, syncBatchId);
}

async function syncIncrementalCatalog(tenant, syncBatchId, windowStart, windowEnd) {
  await fetchChangedProductsPaged(tenant, windowStart, windowEnd, {
    onPage: async (products) => {
      await upsertProducts(tenant, products, syncBatchId);
    },
  });

  await fetchChangedStocksPaged(tenant, windowStart, windowEnd, {
    onPage: async (stocks) => {
      await upsertStocks(tenant, stocks, syncBatchId);
    },
  });

  for (const resource of TRIER_DISCOUNT_RESOURCES) {
    await fetchChangedDiscountsPaged(tenant, resource, windowStart, windowEnd, {
      onPage: async (discounts) => {
        await upsertDiscounts(tenant, resource.type, discounts, syncBatchId);
      },
    });
  }
}

export async function runTenantSync(tenantId, mode = 'incremental') {
  const tenant = await findTenantInstanceById(tenantId);

  if (!tenant) {
    const error = new Error('Instancia nao encontrada.');
    error.statusCode = 404;
    throw error;
  }

  if (tenant.provider !== 'trier') {
    const error = new Error('Sincronizacao Trier nao se aplica a instancias que nao usam provider "trier".');
    error.statusCode = 400;
    throw error;
  }

  const syncBatchId = crypto.randomUUID();
  const window = buildWindow(tenant, mode);

  logger.info(
    {
      tenantId: tenant.id,
      tenant: tenant.name,
      mode,
      windowStart: window.start,
      windowEnd: window.end,
    },
    'Iniciando sincronizacao Trier',
  );

  await provisionTenantCatalog(tenant);

  if (mode === 'full' || mode === 'bootstrap') {
    await syncFullCatalog(tenant, syncBatchId);
    await updateTenantSyncState(tenant, 'catalog', {
      lastFullSyncAt: window.end,
      lastWindowEnd: window.end,
    });
    await updateTenantSyncTimestamps(tenant.id, {
      lastFullSyncAt: window.end,
      lastIncrementalSyncAt: window.end,
    });
  } else {
    await syncIncrementalCatalog(tenant, syncBatchId, window.start, window.end);
    await updateTenantSyncState(tenant, 'catalog', {
      lastIncrementalSyncAt: window.end,
      lastWindowStart: window.start,
      lastWindowEnd: window.end,
    });
    await updateTenantSyncTimestamps(tenant.id, {
      lastIncrementalSyncAt: window.end,
    });
  }

  logger.info(
    {
      tenantId: tenant.id,
      tenant: tenant.name,
      mode,
    },
    'Sincronizacao Trier concluida',
  );

  return {
    tenantId: tenant.id,
    tenant: tenant.name,
    mode,
    windowStart: window.start,
    windowEnd: window.end,
  };
}
