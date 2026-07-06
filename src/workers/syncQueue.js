import IORedis from 'ioredis';
import { Queue, Worker } from 'bullmq';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { listActiveTenantInstances } from '../repositories/tenantInstanceRepository.js';
import { runTenantSync } from '../services/tenantSyncService.js';

const QUEUE_NAME = 'tenant-catalog-sync';

let redisConnection = null;
let syncQueue = null;
let syncWorker = null;

function isQueueEnabled() {
  return Boolean(env.redisUrl);
}

function getRedisConnection() {
  if (!isQueueEnabled()) {
    return null;
  }

  if (!redisConnection) {
    redisConnection = new IORedis(env.redisUrl, {
      maxRetriesPerRequest: null,
    });
  }

  return redisConnection;
}

function getSyncQueue() {
  if (!isQueueEnabled()) {
    return null;
  }

  if (!syncQueue) {
    syncQueue = new Queue(QUEUE_NAME, {
      connection: getRedisConnection(),
    });
  }

  return syncQueue;
}

export async function enqueueTenantSync(tenantId, mode = 'incremental', meta = {}) {
  const queue = getSyncQueue();

  if (!queue) {
    const error = new Error('BullMQ/Redis nao configurado. Defina REDIS_URL.');
    error.statusCode = 500;
    throw error;
  }

  return queue.add(
    `sync:${mode}`,
    {
      tenantId: Number(tenantId),
      mode,
      meta,
    },
    {
      jobId: `${tenantId}:${mode}:${Date.now()}`,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 30_000,
      },
      removeOnComplete: 50,
      removeOnFail: 100,
    },
  );
}

async function scheduleTenantRepeatableJobs(tenant) {
  const queue = getSyncQueue();

  if (!queue || tenant.provider !== 'trier') {
    return;
  }

  await queue.add(
    'scheduled:incremental',
    {
      tenantId: tenant.id,
      mode: 'incremental',
      meta: { scheduled: true },
    },
    {
      jobId: `tenant:${tenant.id}:incremental`,
      repeat: { pattern: tenant.syncIncrementalCron || env.syncIncrementalCron },
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 30_000,
      },
      removeOnComplete: 50,
      removeOnFail: 100,
    },
  );

  await queue.add(
    'scheduled:full',
    {
      tenantId: tenant.id,
      mode: 'full',
      meta: { scheduled: true },
    },
    {
      jobId: `tenant:${tenant.id}:full`,
      repeat: { pattern: tenant.syncFullCron || env.syncFullCron },
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 30_000,
      },
      removeOnComplete: 50,
      removeOnFail: 100,
    },
  );
}

export async function registerTenantSyncSchedule(tenant) {
  if (!isQueueEnabled()) {
    return;
  }

  await scheduleTenantRepeatableJobs(tenant);
}

export async function registerTenantSyncSchedules() {
  if (!isQueueEnabled()) {
    logger.warn('REDIS_URL nao configurado; sincronizacao BullMQ desabilitada');
    return;
  }

  const tenants = await listActiveTenantInstances();

  for (const tenant of tenants) {
    await scheduleTenantRepeatableJobs(tenant);
  }

  logger.info({ tenantCount: tenants.length }, 'Agendamentos BullMQ registrados');
}

export function startSyncWorker() {
  if (!isQueueEnabled()) {
    logger.warn('REDIS_URL nao configurado; worker BullMQ nao iniciado');
    return null;
  }

  if (syncWorker) {
    return syncWorker;
  }

  syncWorker = new Worker(
    QUEUE_NAME,
    async (job) => {
      const { tenantId, mode } = job.data;
      return runTenantSync(tenantId, mode);
    },
    {
      connection: getRedisConnection(),
      concurrency: 2,
      lockDuration: 10 * 60 * 1000,
      maxStalledCount: 5,
    },
  );

  syncWorker.on('completed', (job) => {
    logger.info({ jobId: job.id, data: job.data }, 'Job BullMQ concluido');
  });

  syncWorker.on('failed', (job, error) => {
    logger.error({ jobId: job?.id, data: job?.data, err: error }, 'Job BullMQ falhou');
  });

  return syncWorker;
}
