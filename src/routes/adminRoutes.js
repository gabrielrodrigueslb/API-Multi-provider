import { Router } from 'express';
import {
  createTenantInstanceController,
  enqueueTenantSyncController,
  listTenantInstancesController,
  testTenantInstanceConnectionController,
} from '../controllers/tenantInstanceController.js';
import { authenticateAdminApiKey } from '../middlewares/adminApiKeyAuth.js';

export const adminRoutes = Router();

adminRoutes.use(authenticateAdminApiKey);
adminRoutes.get('/instancias', listTenantInstancesController);
adminRoutes.post('/instancias', createTenantInstanceController);
adminRoutes.post('/instancias/:id/testar-conexao', testTenantInstanceConnectionController);
adminRoutes.post('/instancias/:id/sincronizar', enqueueTenantSyncController);
adminRoutes.get('/clientes', listTenantInstancesController);
adminRoutes.post('/clientes', createTenantInstanceController);
adminRoutes.post('/clientes/:id/testar-conexao', testTenantInstanceConnectionController);
adminRoutes.post('/clientes/:id/sincronizar', enqueueTenantSyncController);
