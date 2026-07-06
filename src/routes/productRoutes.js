import { Router } from 'express';
import {
  consultAlpha7EansController,
  consultTrierEansController,
} from '../controllers/eanOrchestratorController.js';
import { authenticateClientApiKey } from '../middlewares/clientApiKeyAuth.js';

export const productRoutes = Router();

productRoutes.post('/trier/consultar-eans', authenticateClientApiKey, consultTrierEansController);
productRoutes.post('/alpha7/consultar-eans', authenticateClientApiKey, consultAlpha7EansController);
