import { Router } from 'express';
import {
  createAlpha7TenantInstanceController,
  createTrierTenantInstanceController,
  createVetorTenantInstanceController,
  deleteTenantInstanceController,
  enqueueTenantSyncController,
  listTenantInstancesController,
  testTenantInstanceConnectionController,
} from '../controllers/tenantInstanceController.js';
import { authenticateAdminApiKey } from '../middlewares/adminApiKeyAuth.js';

export const adminRoutes = Router();

adminRoutes.use(authenticateAdminApiKey);
adminRoutes.get('/instancias', listTenantInstancesController);
adminRoutes.get('/clientes', listTenantInstancesController);
adminRoutes.post('/instancias/trier', createTrierTenantInstanceController);
adminRoutes.post('/instancias/alpha7', createAlpha7TenantInstanceController);
adminRoutes.post('/instancias/:id/testar-conexao', testTenantInstanceConnectionController);
adminRoutes.post('/instancias/trier/:id/sincronizar', enqueueTenantSyncController);
adminRoutes.post('/clientes/trier', createTrierTenantInstanceController);
adminRoutes.post('/clientes/alpha7', createAlpha7TenantInstanceController);
adminRoutes.post('/clientes/vetor', createVetorTenantInstanceController);
adminRoutes.delete('/clientes/:id', deleteTenantInstanceController);
adminRoutes.post('/clientes/:id/testar-conexao', testTenantInstanceConnectionController);
adminRoutes.post('/clientes/trier/:id/sincronizar', enqueueTenantSyncController);
