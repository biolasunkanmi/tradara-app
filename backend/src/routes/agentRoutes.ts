// ==========================================
// FILE: backend/src/routes/agentRoutes.ts
// TRADARA AI — Agent Gateway Routes
// ==========================================

import { Router } from 'express';

import {
  getAgentTaskEventsRequest,
  getAgentTaskRequest,
  getAgentTaskRecoveryRequest,
  executeAgentRequest,
} from '../controllers/agentController';
import {
  authMiddleware,
  authenticateUser,
} from '../middleware/authMiddleware';

const router = Router();

router.get('/tasks/:taskId/events', authMiddleware, getAgentTaskEventsRequest);
router.get('/tasks/:taskId/recovery', authMiddleware, getAgentTaskRecoveryRequest);
router.get('/tasks/:taskId', authMiddleware, getAgentTaskRequest);

/**
 * POST /agent
 * GET /agent/tasks/:taskId
 * GET /agent/tasks/:taskId/events
 *
 * Unified Tradara Agent Gateway.
 *
 * Supports:
 * - General intelligence
 * - Marketplace intelligence
 * - Agent routing
 * - Structured context
 * - Attachments
 * - Streaming
 * - Durable task, step, execution, approval, and event history
 * - Future multimodal processing
 * - Future web/research tools
 */
router.post('/', authenticateUser, executeAgentRequest);

export default router;