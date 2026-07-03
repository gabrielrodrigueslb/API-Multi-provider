import { createApp } from './app.js';
import { bootstrapControlDatabase, pingControlDatabase } from './config/controlDatabase.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { registerTenantSyncSchedules, startSyncWorker } from './workers/syncQueue.js';

const app = createApp();

async function start() {
  logger.info('Iniciando API...');

  logger.debug({ host: env.controlDbHost, db: env.controlDbName }, 'Conectando ao banco de controle');
  await bootstrapControlDatabase();
  logger.info('Schema do banco de controle verificado');

  await pingControlDatabase();
  logger.info('Banco de controle respondendo');

  startSyncWorker();
  await registerTenantSyncSchedules();

  app.listen(env.port, () => {
    logger.info({ port: env.port, env: env.nodeEnv }, 'API rodando');
  });
}

start().catch((error) => {
  logger.fatal({ err: error }, 'Falha ao iniciar a API');
  process.exit(1);
});
