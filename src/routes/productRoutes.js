import { Router } from 'express';
import { consultEansController } from '../controllers/eanOrchestratorController.js';
import { authenticateClientApiKey } from '../middlewares/clientApiKeyAuth.js';

export const productRoutes = Router();

productRoutes.post('/consultar-eans', authenticateClientApiKey, consultEansController);
