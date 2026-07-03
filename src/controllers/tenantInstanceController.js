import {
  createTenantInstance,
  listTenantInstances,
  testTenantInstanceConnection,
} from '../repositories/tenantInstanceRepository.js';
import { provisionTenantCatalog } from '../services/tenantCatalogStore.js';
import { findTenantInstanceById } from '../repositories/tenantInstanceRepository.js';
import { enqueueTenantSync, registerTenantSyncSchedule } from '../workers/syncQueue.js';
import { parseTenantInstancePayload } from '../utils/tenantInstancePayload.js';

export async function listTenantInstancesController(_request, response, next) {
  try {
    const instances = await listTenantInstances();
    response.status(200).json({
      status: 'ok',
      instancias: instances,
    });
  } catch (error) {
    next(error);
  }
}

export async function createTenantInstanceController(request, response, next) {
  try {
    const payload = parseTenantInstancePayload(request.body);
    await provisionTenantCatalog(payload);
    const created = await createTenantInstance(payload);
    await registerTenantSyncSchedule({
      ...created.instance,
      trierToken: payload.trierToken,
      host: payload.host,
      port: payload.port,
      database: payload.database,
      user: payload.user,
      password: payload.password,
      ssl: payload.ssl,
    });
    const syncJob = payload.autoSync
      ? await enqueueTenantSync(created.instance.id, payload.autoSyncMode, {
          requestedBy: 'admin-create',
        })
      : null;

    response.status(201).json({
      status: 'ok',
      instancia: created.instance,
      apiKey: created.apiKey,
      provisionado: true,
      sincronizacao:
        syncJob === null
          ? null
          : {
              jobId: syncJob.id,
              mode: payload.autoSyncMode,
              enfileirada: true,
            },
    });
  } catch (error) {
    next(error);
  }
}

export async function testTenantInstanceConnectionController(request, response, next) {
  try {
    const result = await testTenantInstanceConnection(Number(request.params.id));
    response.status(200).json({
      status: 'ok',
      instancia: result.instance,
      conexao: result.connection,
    });
  } catch (error) {
    next(error);
  }
}

export async function provisionTenantCatalogController(request, response, next) {
  try {
    const tenant = await findTenantInstanceById(Number(request.params.id));

    if (!tenant) {
      const error = new Error('Instancia nao encontrada.');
      error.statusCode = 404;
      throw error;
    }

    await provisionTenantCatalog(tenant);

    response.status(200).json({
      status: 'ok',
      instancia: {
        id: tenant.id,
        name: tenant.name,
        database: tenant.database,
        cacheSchema: tenant.cacheSchema,
      },
      provisionado: true,
    });
  } catch (error) {
    next(error);
  }
}

export async function enqueueTenantSyncController(request, response, next) {
  try {
    const tenantId = Number(request.params.id);
    const mode = request.body?.mode === 'full' ? 'full' : request.body?.mode === 'bootstrap' ? 'bootstrap' : 'incremental';

    const job = await enqueueTenantSync(tenantId, mode, {
      requestedBy: 'admin',
    });

    response.status(202).json({
      status: 'ok',
      jobId: job.id,
      tenantId,
      mode,
    });
  } catch (error) {
    next(error);
  }
}
