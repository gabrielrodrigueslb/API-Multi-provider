import { Router } from 'express';
import {
  consultAlpha7EansController,
  consultAutomatizaEansController,
  consultTrierEansController,
  consultVetorEansController,
} from '../controllers/eanOrchestratorController.js';
import { authenticateClientApiKey } from '../middlewares/clientApiKeyAuth.js';

export const productRoutes = Router();

productRoutes.post('/trier/consultar-eans', authenticateClientApiKey, consultTrierEansController);
productRoutes.post('/alpha7/consultar-eans', authenticateClientApiKey, consultAlpha7EansController);
productRoutes.post('/vetor/consultar-eans', authenticateClientApiKey, consultVetorEansController);
productRoutes.post('/automatiza/consultar-eans', authenticateClientApiKey, consultAutomatizaEansController);
