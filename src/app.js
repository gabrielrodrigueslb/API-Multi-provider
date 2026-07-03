import express from 'express';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { adminRoutes } from './routes/adminRoutes.js';
import { productRoutes } from './routes/productRoutes.js';

export function createApp() {
  const app = express();

  app.use(express.json({ limit: env.requestJsonLimit }));

  app.use((request, _response, next) => {
    request._startTime = Date.now();
    next();
  });

  app.get('/health', (_request, response) => {
    response.status(200).json({ status: 'ok' });
  });

  app.use('/api/admin', adminRoutes);
  app.use('/api', productRoutes);

  app.use((request, response, next) => {
    if (response.headersSent) {
      return next();
    }

    logger.warn({ method: request.method, url: request.url }, 'Rota nao encontrada');
    response.status(404).json({
      status: 'error',
      message: 'Rota nao encontrada.',
    });
  });

  app.use((error, request, response, _next) => {
    const statusCode = error.statusCode || 500;
    const exposeMessage = statusCode >= 400 && statusCode < 500;
    const ms = request._startTime ? Date.now() - request._startTime : undefined;

    if (statusCode >= 500) {
      logger.error(
        { err: error, method: request.method, url: request.url, statusCode, ms },
        'Erro interno na requisicao',
      );
    } else {
      logger.warn(
        { method: request.method, url: request.url, statusCode, message: error.message, ms },
        'Requisicao rejeitada',
      );
    }

    response.status(statusCode).json({
      status: 'error',
      message: exposeMessage ? error.message : 'Erro interno do servidor.',
    });
  });

  return app;
}
